package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"gorm.io/gorm"
	"yingce/backend/internal/canvas"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

func imageLayerWorkflowChildTasks(parent model.Task, input imageLayerWorkflowInput) []string {
	ids := append([]string{}, input.InitialTaskIDs...)
	ids = append(ids, imageLayerWorkflowComposeTaskID(parent))
	ids = append(ids, imageOperationID("image-operation-v1", parent.UserID, imageLayerWorkflowRasterRequestID(parent.ID, 0, "background-patch")))
	for i := range input.Request.Layers {
		ids = append(ids, imageLayerWorkflowModelTaskID(parent.ID, i, "remove-background"))
		for _, stage := range []string{"normalize-extracted", "normalize-removed"} {
			ids = append(ids, imageOperationID("image-operation-v1", parent.UserID, imageLayerWorkflowRasterRequestID(parent.ID, i, stage)))
		}
	}
	return ids
}

// Parent cancellation is durable before any cleanup. The delivery reconciler
// retries this operation if shutdown happens between cancelling child tasks.
func (s *Service) cancelImageLayerWorkflow(parent *model.Task) error {
	input, err := decodeImageLayerWorkflowInput(parent)
	if err != nil {
		return err
	}
	if parent.Status != model.TaskStatusCancelled && parent.Status != model.TaskStatusFailed {
		return repository.ErrTaskStateConflict
	}
	intentSource := model.TaskCancellationParentCancelled
	status, message := "cancelled", "拆层已取消；已完成素材保留，已提交模型的费用按实际账单核对"
	if parent.Status == model.TaskStatusFailed {
		intentSource = model.TaskCancellationParentFailed
		status, message = "failed", "拆层未完成；已完成素材保留，请检查失败原因后继续编辑"
	}
	for _, id := range imageLayerWorkflowChildTasks(*parent, input) {
		if id == "" {
			continue
		}
		child, err := s.repo.TaskForUser(parent.UserID, id)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				continue
			}
			return err
		}
		if child.Status != model.TaskStatusQueued && child.Status != model.TaskStatusRunning {
			continue
		}
		_, err = s.taskLifecycle().cancelTaskWithIntent(context.Background(), parent.UserID, id, model.TaskCancellationIntent{Source: intentSource, ActorID: parent.UserID})
		if err != nil {
			return fmt.Errorf("停止图层子任务失败: %w", err)
		}
	}
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	return s.repo.Transaction(func(repo *repository.Repository) error {
		latest, err := repo.LockTaskForUser(parent.UserID, parent.ID)
		if err != nil {
			return err
		}
		if latest.Status != parent.Status || latest.ImageLayerDeliveryStatus != "pending" {
			return nil
		}
		if err := repo.LockCanvasMutation(parent.UserID, parent.ProjectID); err != nil {
			return err
		}
		writer := &Service{repo: repo, dataDir: s.dataDir}
		project, err := repo.CanvasProjectForUser(parent.UserID, parent.ProjectID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return repo.CompleteImageLayerWorkflowTerminalDelivery(parent.UserID, parent.ID, parent.Status)
			}
			return err
		}
		var doc struct {
			Nodes []map[string]any `json:"nodes"`
		}
		if err := json.Unmarshal([]byte(project.PayloadJSON), &doc); err != nil {
			return err
		}
		ops := []canvas.CanvasOperation{}
		for _, node := range doc.Nodes {
			meta, _ := node["metadata"].(map[string]any)
			if node["id"] == input.NodeID {
				marker, _ := meta["nativeImageLayerWorkflow"].(map[string]any)
				if marker["taskId"] != parent.ID {
					continue
				}
				marker = imageLayerWorkflowMarker(node, status)
				marker["message"] = message
				op, err := imageLayerWorkflowMetadataPatch(node, map[string]any{"nativeImageLayerWorkflow": marker, "status": "error", "errorDetails": marker["message"]})
				if err != nil {
					return err
				}
				ops = append(ops, op)
			} else if meta["nativeImageLayerWorkflowParentId"] == parent.ID && meta["status"] == "loading" {
				op, err := imageLayerWorkflowMetadataPatch(node, map[string]any{"status": "error", "errorDetails": "已随拆层工作流停止"})
				if err != nil {
					return err
				}
				ops = append(ops, op)
			}
		}
		if len(ops) > 0 {
			base := project.Revision
			_, err := writer.canvasDomain().ApplyUserCanvasOperations(parent.UserID, parent.ProjectID, canvas.CanvasOperationsRequest{MutationID: "image-layer-workflow:" + parent.ID + ":cancel", BaseRevision: &base, Operations: ops, TrustedServerMutation: true})
			if err != nil {
				return err
			}
		}
		if err := writer.validateProductionDocumentStorage(parent.UserID, int64(64+len("applied")-len(latest.ImageLayerDeliveryJSON)-len(latest.ImageLayerDeliveryStatus))); err != nil {
			return err
		}
		return repo.CompleteImageLayerWorkflowTerminalDelivery(parent.UserID, parent.ID, parent.Status)
	})
}
