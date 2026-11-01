package app

import (
	"context"
	"encoding/json"
	"errors"
	"gorm.io/gorm"
	"strings"
	"yingce/backend/internal/model"
)

func imageLayerWorkflowChildParent(task *model.Task) string {
	var input struct {
		Request struct {
			RequestID string `json:"requestId"`
		} `json:"request"`
		Metadata struct {
			Workflow struct {
				TaskID string `json:"taskId"`
			} `json:"imageLayerWorkflow"`
		} `json:"metadata"`
	}
	if json.Unmarshal([]byte(task.InputJSON), &input) != nil {
		return ""
	}
	if len(input.Metadata.Workflow.TaskID) == 32 {
		return input.Metadata.Workflow.TaskID
	}
	if task.Type == model.TaskTypeImageOperation {
		parts := strings.Split(input.Request.RequestID, ":")
		if len(parts) == 4 && parts[0] == "layer-flow" && len(parts[1]) == 32 {
			return parts[1]
		}
	}
	return ""
}

// Continuing creates an independent, newly approved group. Completed versions
// are copied by identity; the old group, tasks and billing history stay fixed.
func (s *Service) prepareImageLayerWorkflowResume(ctx context.Context, userID, canvasID string, req ImageLayerWorkflowRequest) (map[int]imageLayerWorkflowReuse, error) {
	reused := map[int]imageLayerWorkflowReuse{}
	if req.ResumeTaskID == "" {
		return reused, nil
	}
	previous, err := s.repo.TaskForUser(userID, req.ResumeTaskID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, NotFound("原拆层任务不存在或无权继续")
		}
		return nil, err
	}
	if previous.ProjectID != canvasID || (previous.Status != model.TaskStatusFailed && previous.Status != model.TaskStatusCancelled) || previous.ImageLayerDeliveryStatus != "applied" {
		return nil, BadAuthRequest("请等待原拆层停止并完成结果核对，再继续未完成图层")
	}
	original, err := decodeImageLayerWorkflowInput(previous)
	if err != nil {
		return nil, err
	}
	before, after := original.Request, req
	before.RequestID, after.RequestID = "", ""
	before.ResumeTaskID, after.ResumeTaskID = "", ""
	before.Title, after.Title = "", ""
	before.MaxCredits, after.MaxCredits = 0, 0
	if cutSignature(before) != cutSignature(after) {
		return nil, BadAuthRequest("继续拆层须保留原来的固定计划；修改目标请从原图重新拆层")
	}
	for _, id := range imageLayerWorkflowChildTasks(*previous, original) {
		if id == "" {
			continue
		}
		child, err := s.repo.TaskForUser(userID, id)
		if errors.Is(err, gorm.ErrRecordNotFound) {
			continue
		}
		if err != nil {
			return nil, err
		}
		if child.Status == model.TaskStatusQueued || child.Status == model.TaskStatusRunning || child.ProviderCancelStatus == model.ProviderCancelStatusRequested {
			return nil, BadAuthRequest("原图层任务或上游取消仍在核对，请稍后继续")
		}
		if child.Status == model.TaskStatusFailed || child.Status == model.TaskStatusCancelled {
			if child.MediaRecoveryJSON != "" && !(child.Type == model.TaskTypeImageOperation && child.Provider == "local" && child.Model == "image-raster-v1") {
				return nil, BadAuthRequest("原图层已有待保存的模型结果，请先在任务中心重试保存，再决定是否重新制作")
			}
			if err := s.taskBilling().CheckRetryEligibility(child.BillingOrderID); err != nil {
				return nil, BadAuthRequest("原图层费用尚未完成核对，暂不能重新提交")
			}
		}
	}
	project, err := s.repo.CanvasProjectForUser(userID, canvasID)
	if err != nil {
		return nil, err
	}
	var doc struct {
		Nodes []map[string]any `json:"nodes"`
	}
	if err := json.Unmarshal([]byte(project.PayloadJSON), &doc); err != nil {
		return nil, err
	}
	nodes := map[string]map[string]any{}
	for _, node := range doc.Nodes {
		id, _ := node["id"].(string)
		nodes[id] = node
	}
	meta, _ := nodes[original.NodeID]["metadata"].(map[string]any)
	marker, _ := meta["nativeImageLayerWorkflow"].(map[string]any)
	if marker["taskId"] != previous.ID || marker["requestSha256"] != original.RequestSHA256 {
		return nil, imageMaterialSourceChanged()
	}
	for i, id := range original.ChildNodeIDs {
		node := nodes[id]
		meta, _ := node["metadata"].(map[string]any)
		if node["type"] != "image" || meta["nativeImageLayerWorkflowParentId"] != previous.ID {
			return nil, imageMaterialSourceChanged()
		}
		if meta["status"] != "success" {
			initialID := original.InitialTaskIDs[i]
			if prior, ok := original.ReusedLayers[i]; ok && prior.ExtractionTaskID == "" {
				reused[i] = prior
				continue
			}
			stage, extractionParent := "extract", previous.ID
			if prior, ok := original.ReusedLayers[i]; ok && prior.ExtractionTaskID != "" {
				stage, extractionParent = prior.ExtractionStage, prior.ExtractionParentID
			}
			removalID := imageLayerWorkflowModelTaskID(previous.ID, i, "remove-background")
			if removal, err := s.repo.TaskForUser(userID, removalID); err == nil && removal.Status == model.TaskStatusSucceeded {
				initialID, stage, extractionParent = removalID, "remove-background", previous.ID
			} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, err
			}
			if initialID != "" {
				task, err := s.repo.TaskForUser(userID, initialID)
				if err != nil {
					return nil, err
				}
				if task.Status == model.TaskStatusSucceeded {
					image, waiting, err := s.imageLayerWorkflowTaskImage(ctx, *previous, initialID)
					if err != nil {
						return nil, err
					}
					if waiting {
						return nil, BadAuthRequest("原提取结果尚未核对完成")
					}
					reused[i] = imageLayerWorkflowReuse{ExtractionTaskID: initialID, ExtractionParentID: extractionParent, ExtractionStage: stage, ResourceID: image.Resource.ID, AssetID: image.AssetID, AssetVersionID: image.VersionID, SHA256: image.Probe.Source.SHA256}
				}
			}
			continue
		}
		resource, _ := meta["storageKey"].(string)
		asset, _ := meta["assetId"].(string)
		version, _ := meta["assetVersionId"].(string)
		raster, _ := meta["nativeImageLayerRaster"].(map[string]any)
		expected, _ := raster["sourceSha256"].(string)
		image, err := s.readImageLayerWorkflowImage(ctx, userID, strings.TrimPrefix(resource, "resource:"), asset, version)
		if err != nil {
			return nil, err
		}
		if resource != "resource:"+image.Resource.ID || image.Probe.Source.SHA256 != expected || image.Probe.Source.Width != original.Source.Width || image.Probe.Source.Height != original.Source.Height {
			return nil, imageMaterialSourceChanged()
		}
		reused[i] = imageLayerWorkflowReuse{ResourceID: image.Resource.ID, AssetID: asset, AssetVersionID: version, SHA256: expected}
	}
	return reused, nil
}
