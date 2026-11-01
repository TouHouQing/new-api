package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"gorm.io/gorm"
	"math"
	"strings"
	"yingce/backend/internal/canvas"
	"yingce/backend/internal/imageops"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

type imageLayerWorkflowPreparedTask struct {
	Task  model.Task
	Order *model.BillingOrder
}

func (s *Service) CreateImageLayerWorkflow(ctx context.Context, userID, canvasID string, req ImageLayerWorkflowRequest) (ImageLayerWorkflowResult, error) {
	var result ImageLayerWorkflowResult
	req.RequestID = strings.TrimSpace(req.RequestID)
	req.Title = strings.TrimSpace(req.Title)
	if err := validateImageLayerWorkflowRequest(req); err != nil {
		return result, err
	}
	if _, err := s.mediaTaskProject(&model.Task{UserID: userID, ProjectID: canvasID}); err != nil {
		return result, err
	}
	user, err := s.repo.User(userID)
	if err != nil {
		return result, err
	}
	if user.Status != model.UserStatusActive {
		return result, Forbidden("当前账号不能开始拆层")
	}
	taskID := imageLayerWorkflowTaskID(userID, canvasID, req.RequestID)
	intent := cutSignature(req)
	mutationID := "image-layer-workflow-create:" + taskID
	if previous, err := readImageLayerWorkflowReceipt(s.repo, userID, canvasID, mutationID, intent); err != nil || previous != nil {
		if previous != nil {
			return *previous, err
		}
		return result, err
	}
	if s.IsDraining() {
		return result, NewAppError(503, "服务正在维护，请稍后拆层")
	}
	if err := s.validateNativeLayerPlanningWorkflow(userID, canvasID, req); err != nil {
		return result, err
	}
	resumeSnapshot, err := s.imageLayerWorkflowResumeSnapshot(userID, canvasID, req.ResumeTaskID)
	if err != nil {
		return result, err
	}
	reused, err := s.prepareImageLayerWorkflowResume(ctx, userID, canvasID, req)
	if err != nil {
		return result, err
	}
	probe, err := s.InspectImageAlphaBounds(ctx, userID, req.ResourceID)
	if err != nil {
		return result, err
	}
	if probe.Empty || probe.Source.SHA256 != req.ExpectedSourceSHA256 {
		return result, imageMaterialSourceChanged()
	}
	if len(req.BackgroundRegions) > 0 {
		_, err := imageops.Plan(probe.Source.Width, probe.Source.Height, imageops.Recipe{Operation: "background-patch", Patch: &imageops.BackgroundPatch{Width: probe.Source.Width, Height: probe.Source.Height, GeneratedResourceID: req.ResourceID, GeneratedSHA256: probe.Source.SHA256, Regions: req.BackgroundRegions}})
		if err != nil {
			return result, BadAuthRequest(err.Error())
		}
	}
	if int64(probe.Source.Width)*int64(probe.Source.Height)*int64(len(req.Layers)) > imageops.MaxCompositionPixels {
		return result, BadAuthRequest("拆层总像素超过处理上限，请减少图层或缩小原图")
	}
	resource, err := s.repo.ResourceForUser(userID, req.ResourceID)
	if err != nil {
		return result, err
	}
	input := imageLayerWorkflowInput{Kind: "native-image-layer-workflow", Version: 1, Request: req, RequestSHA256: intent, CanvasID: canvasID, NodeID: "image-layer-workflow:" + taskID, ChildNodeIDs: []string{}, InitialTaskIDs: []string{}, RemovalQuoteCaps: make([]int64, len(req.Layers)), Source: probe.Source}
	input.ReusedLayers = reused
	maxCharge := int64(math.Floor(req.MaxCredits * float64(CreditScale)))
	quoted := int64(0)
	prepared := []imageLayerWorkflowPreparedTask{}
	for i, layer := range req.Layers {
		if err := ctx.Err(); err != nil {
			return result, err
		}
		input.ChildNodeIDs = append(input.ChildNodeIDs, fmt.Sprintf("image-layer:%s:%d", taskID, i))
		input.InitialTaskIDs = append(input.InitialTaskIDs, "")
		if reused, ok := reused[i]; ok {
			input.InitialTaskIDs[i] = reused.ExtractionTaskID
			if reused.ExtractionTaskID != "" && reused.ExtractionStage != "remove-background" && layer.Removal != nil {
				_, order, err := s.prepareImageLayerWorkflowModel(userID, canvasID, taskID, i, "remove-background", *layer.Removal, *resource, maxCharge)
				if err != nil {
					return result, err
				}
				if order != nil {
					input.RemovalQuoteCaps[i] = order.AmountMicrocredits
					quoted += order.AmountMicrocredits
				}
				if quoted > maxCharge {
					return result, BadAuthRequest("未完成图层的后续处理报价超过本次积分上限，尚未提交生成")
				}
			}
			continue
		}
		switch layer.Method {
		case "source":
			continue
		case "source-region":
			request := ImageOperationCreateRequest{RequestID: imageLayerWorkflowRasterRequestID(taskID, i, "extract"), ProjectID: canvasID, ResourceID: req.ResourceID, ExpectedSourceSHA256: probe.Source.SHA256, Recipe: imageops.Recipe{Operation: "region", Region: layer.Region}}
			raster, err := s.prepareImageOperationInput(userID, request)
			if err != nil {
				return result, err
			}
			task := imageOperationTask(userID, raster)
			input.InitialTaskIDs[i] = task.ID
			prepared = append(prepared, imageLayerWorkflowPreparedTask{Task: task})
		case "generate":
			task, order, err := s.prepareImageLayerWorkflowModel(userID, canvasID, taskID, i, "extract", *layer.Generation, *resource, maxCharge)
			if err != nil {
				return result, err
			}
			input.InitialTaskIDs[i] = task.ID
			prepared = append(prepared, imageLayerWorkflowPreparedTask{Task: *task, Order: order})
			if order != nil {
				quoted += order.AmountMicrocredits
			}
			if layer.Removal != nil {
				_, removal, err := s.prepareImageLayerWorkflowModel(userID, canvasID, taskID, i, "remove-background", *layer.Removal, *resource, maxCharge)
				if err != nil {
					return result, err
				}
				if removal != nil {
					input.RemovalQuoteCaps[i] = removal.AmountMicrocredits
					quoted += removal.AmountMicrocredits
				}
			}
		}
		if quoted > maxCharge {
			return result, BadAuthRequest("所选图层模型的总报价超过本次积分上限，尚未提交生成")
		}
	}
	policy, err := s.RuntimePolicy()
	if err != nil {
		return result, err
	}
	s.storageMu.Lock()
	err = s.repo.Transaction(func(repo *repository.Repository) error {
		if err := repo.LockCanvasMutation(userID, canvasID); err != nil {
			return err
		}
		if previous, err := readImageLayerWorkflowReceipt(repo, userID, canvasID, mutationID, intent); err != nil || previous != nil {
			if previous != nil {
				result = *previous
			}
			return err
		}
		writer := &Service{repo: repo, dataDir: s.dataDir}
		if _, err := writer.mediaTaskProject(&model.Task{UserID: userID, ProjectID: canvasID}); err != nil {
			return err
		}
		active, err := repo.User(userID)
		if err != nil {
			return err
		}
		if active.Status != model.UserStatusActive {
			return Forbidden("当前账号不能开始拆层")
		}
		if req.ResumeTaskID != "" {
			current, err := writer.imageLayerWorkflowResumeSnapshot(userID, canvasID, req.ResumeTaskID)
			if err != nil {
				return err
			}
			if current != resumeSnapshot {
				return imageMaterialSourceChanged()
			}
		}
		if err := requireStoredFileCapacityRepository(repo, userID, model.TaskTypeImageOperation, policy, s.pendingStorage[userID]); err != nil {
			return err
		}
		project, err := repo.CanvasProjectForUser(userID, canvasID)
		if err != nil {
			return err
		}
		var doc struct {
			Nodes []map[string]any `json:"nodes"`
		}
		if json.Unmarshal([]byte(project.PayloadJSON), &doc) != nil {
			return BadAuthRequest("无法读取原画布")
		}
		var source map[string]any
		for _, node := range doc.Nodes {
			if node["id"] == req.SourceNodeID {
				source = node
			}
			if node["id"] == input.NodeID {
				return BadAuthRequest("拆层工作流节点已存在，请核对画布")
			}
		}
		meta, _ := source["metadata"].(map[string]any)
		if source["type"] != "image" || meta["storageKey"] != "resource:"+req.ResourceID {
			return imageMaterialSourceChanged()
		}
		if _, hasGroup := meta["imageLayerGroup"]; hasGroup {
			if err := writer.requireReadyImageLayerGroup(userID, canvasID, req.SourceNodeID); err != nil {
				return err
			}
		}
		bytes, err := writer.readImageOperationSource(userID, req.ResourceID)
		if err != nil {
			return err
		}
		identity, err := imageops.Inspect(bytes)
		if err != nil || identity != probe.Source {
			return imageMaterialSourceChanged()
		}
		input.OriginalAssetID, _ = meta["assetId"].(string)
		input.OriginalVersionID, _ = meta["assetVersionId"].(string)
		if input.OriginalAssetID != "" && input.OriginalVersionID == "" {
			asset, err := repo.AssetForUser(userID, input.OriginalAssetID)
			if err != nil {
				return err
			}
			input.OriginalVersionID = asset.PrimaryVersionID
		}
		if input.OriginalAssetID == "" || input.OriginalVersionID == "" {
			return BadAuthRequest("请先保存原图到素材库")
		}
		encoded, err := json.Marshal(input)
		if err != nil {
			return err
		}
		parent := model.Task{ID: taskID, UserID: userID, ProjectID: canvasID, Type: model.TaskTypeImageOperation, Operation: imageLayerWorkflowOperation, Provider: "local", Model: "image-raster-v1", Prompt: "原生图层拆分工作流", Status: model.TaskStatusQueued, Stage: "等待图层任务", InputJSON: string(encoded), ImageLayerDeliveryStatus: "pending"}
		if err := createTaskWithStorageQuotaRepository(repo, &parent, nil, policy); err != nil {
			return err
		}
		for _, item := range prepared {
			task := item.Task
			if err := createTaskWithStorageQuotaRepository(repo, &task, item.Order, policy); err != nil {
				return err
			}
		}
		operations, err := imageLayerWorkflowInitialNodes(parent, input, source, doc.Nodes)
		if err != nil {
			return err
		}
		base := project.Revision
		summary, err := writer.canvasDomain().ApplyUserCanvasOperations(userID, canvasID, canvas.CanvasOperationsRequest{MutationID: mutationID, BaseRevision: &base, Operations: operations})
		if err != nil {
			return err
		}
		result = ImageLayerWorkflowResult{CanvasID: canvasID, NodeID: input.NodeID, TaskID: taskID, ChildNodeIDs: input.ChildNodeIDs, Revision: summary.Revision, RequestSHA256: intent}
		receipt, err := repo.CanvasMutationReceiptForUser(userID, canvasID, mutationID)
		if err != nil {
			return err
		}
		var envelope map[string]json.RawMessage
		if err := json.Unmarshal([]byte(receipt.ResultJSON), &envelope); err != nil {
			return err
		}
		encoded, err = json.Marshal(result)
		if err != nil {
			return err
		}
		envelope["imageLayerWorkflow"] = encoded
		encoded, err = json.Marshal(envelope)
		if err != nil {
			return err
		}
		if err := writer.validateProductionDocumentStorage(userID, int64(len(encoded)-len(receipt.ResultJSON))); err != nil {
			return err
		}
		receipt.ResultJSON = string(encoded)
		return repo.FinalizeCanvasMutationReceipt(receipt)
	})
	s.storageMu.Unlock()
	if errors.Is(err, repository.ErrActiveTaskLimit) {
		return result, BadAuthRequest("队列名额不足以容纳本次拆层，请等待其他任务完成；本次未提交任何图片生成")
	}
	if errors.Is(err, repository.ErrInsufficientCredits) {
		return result, BadAuthRequest("可用积分不足，本次拆层未提交；请检查余额或选择免费模型")
	}
	if err == nil && !result.Replayed {
		s.wakeTaskDispatcher()
	}
	return result, err
}

func readImageLayerWorkflowReceipt(repo *repository.Repository, userID, canvasID, mutationID, intent string) (*ImageLayerWorkflowResult, error) {
	receipt, err := repo.CanvasMutationReceiptForUser(userID, canvasID, mutationID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var envelope struct {
		Result *ImageLayerWorkflowResult `json:"imageLayerWorkflow"`
	}
	if json.Unmarshal([]byte(receipt.ResultJSON), &envelope) != nil || envelope.Result == nil || envelope.Result.RequestSHA256 != intent {
		return nil, &AppError{Status: 409, Code: 409, Reason: "image_operation_conflict", Message: "拆层编号已用于其他参数，请重新确认"}
	}
	envelope.Result.Replayed = true
	return envelope.Result, nil
}
