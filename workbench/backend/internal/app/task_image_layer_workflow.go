package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"
	"yingce/backend/internal/canvas"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

func (w *taskWorkerCoordinator) processImageLayerWorkflow(parent *model.Task, ctx context.Context) (failure error) {
	s := w.service
	defer func() {
		if latest, err := s.repo.Task(parent.ID); err == nil && latest.Status == model.TaskStatusFailed && latest.ImageLayerDeliveryStatus == "pending" {
			_ = s.cancelImageLayerWorkflow(latest)
		}
		if errors.Is(failure, repository.ErrTaskStateConflict) || errors.Is(failure, context.Canceled) {
			if latest, err := s.repo.Task(parent.ID); err == nil && latest.Status == model.TaskStatusCancelled {
				failure = nil
			}
		}
	}()
	input, err := decodeImageLayerWorkflowInput(parent)
	if err != nil {
		return w.failTimelineTask(parent, "拆层失败", err.Error())
	}
	if _, err := s.mediaTaskProject(parent); err != nil {
		return w.failTimelineTask(parent, "拆层失败", err.Error())
	}
	completed, waiting := 0, false
	problems := []string{}
	for i, layer := range input.Request.Layers {
		if err := ctx.Err(); err != nil {
			return err
		}
		image, pending, err := s.resolveImageLayerWorkflowLayer(ctx, *parent, input, i)
		if pending {
			waiting = true
			continue
		}
		problem := ""
		if err != nil {
			if errors.Is(err, repository.ErrTaskStateConflict) || errors.Is(err, context.Canceled) {
				return err
			}
			var domainError *AppError
			if errors.Is(err, repository.ErrActiveTaskLimit) || errors.As(err, &domainError) && domainError.Reason == "quota_exceeded" {
				return s.repo.DeferRunningTaskForProviderPoll(parent.ID, parent.LeaseOwner, "等待可用任务名额或存储空间，已完成素材保留", 15*time.Second)
			}
			if !errors.As(err, &domainError) {
				return err
			}
			problem = s.UserFacingErrorMessage(err)
			problems = append(problems, layer.Name+"："+problem)
		} else {
			completed++
		}
		if err := s.publishImageLayerWorkflowLayer(parent, input, i, image, problem); err != nil {
			var appErr *AppError
			if errors.As(err, &appErr) && appErr.Reason == "image_operation_source_changed" {
				message := "图层节点已修改或移除，已完成素材保留在素材库"
				if finishErr := w.finishImageLayerWorkflow(parent, input, "failed", message, true); finishErr != nil {
					var missing *AppError
					if errors.As(finishErr, &missing) && missing.Reason == "image_operation_source_changed" {
						return w.failTimelineTask(parent, "拆层已停止", message)
					}
					return finishErr
				}
				return nil
			}
			return err
		}
	}
	if waiting {
		if err := w.progress(parent, fmt.Sprintf("图层处理中，已完成%d/%d", completed, len(input.Request.Layers)), completed*80/len(input.Request.Layers)); err != nil {
			return err
		}
		return s.repo.DeferRunningTaskForProviderPoll(parent.ID, parent.LeaseOwner, fmt.Sprintf("等待图层完成 %d/%d", completed, len(input.Request.Layers)), 2*time.Second)
	}
	if len(problems) > 0 {
		message := "部分图层未完成；已完成的独立素材保留，可单独重做失败层"
		return w.finishImageLayerWorkflow(parent, input, "failed", message, true)
	}
	if err := s.queueImageLayerWorkflowComposition(parent, input); err != nil {
		return err
	}
	compose, err := s.repo.TaskForUser(parent.UserID, imageLayerWorkflowComposeTaskID(*parent))
	if err != nil {
		return err
	}
	if compose.Status == model.TaskStatusFailed || compose.Status == model.TaskStatusCancelled || compose.ImageLayerDeliveryStatus == "detached" {
		return w.finishImageLayerWorkflow(parent, input, "failed", "首次合成未完成，独立图层已保留，请在图层管理中继续", true)
	}
	if compose.Status != model.TaskStatusSucceeded || compose.ImageLayerDeliveryStatus != "applied" {
		return s.repo.DeferRunningTaskForProviderPoll(parent.ID, parent.LeaseOwner, "等待首次图层合成", 2*time.Second)
	}
	return w.finishImageLayerWorkflow(parent, input, "ready", "拆层与首次合成完成", false)
}

func (w *taskWorkerCoordinator) finishImageLayerWorkflow(parent *model.Task, input imageLayerWorkflowInput, status, message string, failed bool) error {
	s := w.service
	resultStatus := status
	return s.mutateImageLayerWorkflow(parent, input, "finish", func(writer *Service, _ map[string]map[string]any, root map[string]any, replayed bool) ([]canvas.CanvasOperation, error) {
		if replayed {
			return nil, nil
		}
		if !failed {
			if err := writer.requireReadyImageLayerGroup(parent.UserID, parent.ProjectID, input.NodeID); err != nil {
				return nil, err
			}
		}
		marker := imageLayerWorkflowMarker(root, status)
		marker["message"] = message
		if !failed {
			if warnings, ok := marker["warnings"].([]any); ok && len(warnings) > 0 {
				marker["status"] = "needs-review"
				resultStatus = "needs-review"
			}
		}
		uiStatus := "success"
		if failed {
			uiStatus = "error"
		}
		op, err := imageLayerWorkflowMetadataPatch(root, map[string]any{"nativeImageLayerWorkflow": marker, "status": uiStatus, "errorDetails": nil})
		return []canvas.CanvasOperation{op}, err
	}, func(repo *repository.Repository) error {
		finished := *parent
		finished.Status, finished.Stage, finished.Progress = model.TaskStatusSucceeded, message, 100
		if failed {
			finished.Status, finished.Error = model.TaskStatusFailed, message
		}
		now := time.Now()
		finished.CompletedAt = &now
		finished.ImageLayerDeliveryStatus = "applied"
		if failed {
			finished.ImageLayerDeliveryStatus = "pending"
		}
		payload, err := json.Marshal(map[string]any{"version": 1, "kind": "native-image-layer-workflow", "canvasId": input.CanvasID, "nodeId": input.NodeID, "childNodeIds": input.ChildNodeIDs, "status": resultStatus, "message": message})
		if err != nil {
			return err
		}
		finished.ResultJSON = string(payload)
		writer := &Service{repo: repo, dataDir: s.dataDir}
		if err := writer.validateProductionDocumentStorage(parent.UserID, int64(len(finished.ResultJSON)+len(finished.Error)-len(parent.ResultJSON)-len(parent.Error))); err != nil {
			return err
		}
		return repo.SaveTaskCompletion(&finished, model.TaskStatusRunning, nil)
	})
}
