package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"gorm.io/gorm"
	"math"
	"yingce/backend/internal/imageops"
	"yingce/backend/internal/model"
)

type imageLayerWorkflowImage struct {
	Resource  model.Resource
	AssetID   string
	VersionID string
	Probe     ImageAlphaBounds
}

func (s *Service) readImageLayerWorkflowImage(ctx context.Context, userID, resourceID, assetID, versionID string) (imageLayerWorkflowImage, error) {
	var image imageLayerWorkflowImage
	resource, err := s.repo.ResourceForUser(userID, resourceID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return image, NotFound("图层原文件不存在或无权读取")
		}
		return image, err
	}
	asset, err := s.repo.AssetForUser(userID, assetID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return image, NotFound("图层素材不存在或无权读取")
		}
		return image, err
	}
	version, err := s.repo.AssetVersion(versionID)
	if err != nil || version.AssetID != asset.ID || asset.Status == model.AssetVersionStatusArchived || version.Status == model.AssetVersionStatusArchived {
		return image, BadAuthRequest("图层素材或版本不可用，请先恢复素材")
	}
	reps, err := s.repo.AssetRepresentations(versionID)
	if err != nil {
		return image, err
	}
	bound := false
	for _, rep := range reps {
		if rep.ResourceID == resourceID {
			bound = true
			break
		}
	}
	if !bound {
		return image, BadAuthRequest("图层版本没有绑定准确的原文件")
	}
	probe, err := s.InspectImageAlphaBounds(ctx, userID, resourceID)
	if err != nil {
		return image, err
	}
	if probe.Empty {
		return image, BadAuthRequest("提取结果是完全透明的空图层，原文件已保留，请核对区域或模型结果")
	}
	return imageLayerWorkflowImage{Resource: *resource, AssetID: assetID, VersionID: versionID, Probe: probe}, nil
}

func (s *Service) imageLayerWorkflowTaskImage(ctx context.Context, parent model.Task, taskID string) (imageLayerWorkflowImage, bool, error) {
	var image imageLayerWorkflowImage
	task, err := s.repo.TaskForUser(parent.UserID, taskID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return image, false, NotFound("图层任务记录已移除，已完成文件保留在素材库")
		}
		return image, false, err
	}
	if task.ProjectID != parent.ProjectID {
		return image, false, BadAuthRequest("图层任务不属于当前画布")
	}
	switch task.Status {
	case model.TaskStatusQueued, model.TaskStatusRunning:
		return image, true, nil
	case model.TaskStatusFailed:
		return image, false, BadAuthRequest(fmt.Sprintf("图层处理未完成：%s", task.Error))
	case model.TaskStatusCancelled:
		return image, false, BadAuthRequest("图层任务已取消，其他已完成素材保留")
	}
	if task.Status != model.TaskStatusSucceeded {
		return image, false, BadAuthRequest("图层任务尚未完成")
	}
	var result struct {
		Images []struct {
			ResourceID string `json:"resourceId"`
		} `json:"images"`
	}
	if json.Unmarshal([]byte(task.ResultJSON), &result) != nil || len(result.Images) != 1 || result.Images[0].ResourceID == "" {
		return image, false, BadAuthRequest("每层必须返回一张明确的原生图片，不能用拼版或缺失文件代替")
	}
	reps, err := s.repo.AssetRepresentationsForTask(task.ID)
	if err != nil {
		return image, false, err
	}
	for _, rep := range reps {
		if rep.ResourceID == result.Images[0].ResourceID {
			version, err := s.repo.AssetVersion(rep.AssetVersionID)
			if err != nil {
				return image, false, err
			}
			image, err = s.readImageLayerWorkflowImage(ctx, parent.UserID, rep.ResourceID, version.AssetID, version.ID)
			return image, false, err
		}
	}
	return image, false, BadAuthRequest("图层结果尚未登记到固定素材版本")
}

func (s *Service) normalizeImageLayerWorkflowImage(ctx context.Context, parent model.Task, input imageLayerWorkflowInput, index int, stage string, image imageLayerWorkflowImage) (imageLayerWorkflowImage, bool, error) {
	if image.Probe.Source.Width == input.Source.Width && image.Probe.Source.Height == input.Source.Height {
		return image, false, nil
	}
	request := ImageOperationCreateRequest{RequestID: imageLayerWorkflowRasterRequestID(parent.ID, index, stage), ProjectID: parent.ProjectID, ResourceID: image.Resource.ID, ExpectedSourceSHA256: image.Probe.Source.SHA256, Recipe: imageops.Recipe{Operation: "normalize", Normalize: &imageops.Normalize{Width: input.Source.Width, Height: input.Source.Height, Algorithm: "high"}}}
	id := imageOperationID("image-operation-v1", parent.UserID, request.RequestID)
	if existing, err := s.existingImageOperation(parent.UserID, id, imageOperationRequestHash(request)); err != nil || existing != nil {
		if err != nil {
			return image, false, err
		}
		return s.imageLayerWorkflowTaskImage(ctx, parent, existing.ID)
	}
	prepared, err := s.prepareImageOperationInput(parent.UserID, request)
	if err != nil {
		return image, false, err
	}
	task := imageOperationTask(parent.UserID, prepared)
	if err := s.admitImageLayerWorkflowChild(parent, &task, nil); err != nil {
		if old, readErr := s.existingImageOperation(parent.UserID, id, imageOperationRequestHash(request)); readErr != nil || old == nil {
			return image, false, err
		}
	}
	s.wakeTaskDispatcher()
	return s.imageLayerWorkflowTaskImage(ctx, parent, task.ID)
}

func imageLayerWorkflowHasTransparency(probe ImageAlphaBounds) bool {
	return probe.RasterInfo.Transparent && probe.RasterInfo.TransparentPixels >= max(1, int(math.Ceil(float64(probe.Source.Width)*float64(probe.Source.Height)*0.001)))
}

func (s *Service) imageLayerWorkflowRemainingCharge(parent model.Task, input imageLayerWorkflowInput) (int64, error) {
	ids := append([]string{}, input.InitialTaskIDs...)
	for i, layer := range input.Request.Layers {
		if layer.Removal != nil {
			ids = append(ids, imageLayerWorkflowModelTaskID(parent.ID, i, "remove-background"))
		}
	}
	orders, err := s.repo.BillingOrdersByTaskIDs(parent.UserID, ids)
	if err != nil {
		return 0, err
	}
	remaining := int64(math.Floor(input.Request.MaxCredits * float64(CreditScale)))
	for _, order := range orders {
		remaining -= order.AmountMicrocredits
	}
	if remaining < 0 {
		return 0, BadAuthRequest("本次拆层累计积分上限已用尽")
	}
	return remaining, nil
}

func (s *Service) resolveImageLayerWorkflowLayer(ctx context.Context, parent model.Task, input imageLayerWorkflowInput, index int) (imageLayerWorkflowImage, bool, error) {
	reused, hasReuse := input.ReusedLayers[index]
	if hasReuse && reused.ExtractionTaskID == "" {
		image, err := s.readImageLayerWorkflowImage(ctx, parent.UserID, reused.ResourceID, reused.AssetID, reused.AssetVersionID)
		if err == nil && (image.Probe.Source.SHA256 != reused.SHA256 || image.Probe.Source.Width != input.Source.Width || image.Probe.Source.Height != input.Source.Height) {
			err = imageMaterialSourceChanged()
		}
		return image, false, err
	}
	layer := input.Request.Layers[index]
	if layer.Method == "source" {
		image, err := s.readImageLayerWorkflowImage(ctx, parent.UserID, input.Request.ResourceID, input.OriginalAssetID, input.OriginalVersionID)
		return image, false, err
	}
	image, waiting, err := s.imageLayerWorkflowTaskImage(ctx, parent, input.InitialTaskIDs[index])
	if err == nil && !waiting && hasReuse && (image.Resource.ID != reused.ResourceID || image.AssetID != reused.AssetID || image.VersionID != reused.AssetVersionID || image.Probe.Source.SHA256 != reused.SHA256) {
		return image, false, imageMaterialSourceChanged()
	}
	if err != nil || waiting {
		return image, waiting, err
	}
	image, waiting, err = s.normalizeImageLayerWorkflowImage(ctx, parent, input, index, "normalize-extracted", image)
	if err != nil || waiting {
		return image, waiting, err
	}
	if index == 0 && len(input.Request.BackgroundRegions) > 0 {
		return s.patchImageLayerWorkflowBackground(ctx, parent, input, image)
	}
	if index == 0 || layer.Removal == nil || hasReuse && reused.ExtractionStage == "remove-background" || imageLayerWorkflowHasTransparency(image.Probe) {
		return image, false, nil
	}
	id := imageLayerWorkflowModelTaskID(parent.ID, index, "remove-background")
	existing, readErr := s.repo.TaskForUser(parent.UserID, id)
	if readErr != nil && !errors.Is(readErr, gorm.ErrRecordNotFound) {
		return image, false, readErr
	}
	if existing == nil || errors.Is(readErr, gorm.ErrRecordNotFound) {
		maxCharge := int64(0)
		if s.localCreditBudgetEnforced() {
			remaining, err := s.imageLayerWorkflowRemainingCharge(parent, input)
			if err != nil {
				return image, false, err
			}
			maxCharge = min(remaining, input.RemovalQuoteCaps[index])
		}
		task, order, err := s.prepareImageLayerWorkflowModel(parent.UserID, parent.ProjectID, parent.ID, index, "remove-background", *layer.Removal, image.Resource, maxCharge)
		if err != nil {
			return image, false, err
		}
		if err := s.admitImageLayerWorkflowChild(parent, task, order); err != nil {
			if old, readErr := s.repo.TaskForUser(parent.UserID, id); readErr != nil || old.ID != id {
				return image, false, err
			}
		}
		s.wakeTaskDispatcher()
		return image, true, nil
	}
	image, waiting, err = s.imageLayerWorkflowTaskImage(ctx, parent, id)
	if err != nil || waiting {
		return image, waiting, err
	}
	return s.normalizeImageLayerWorkflowImage(ctx, parent, input, index, "normalize-removed", image)
}

func (s *Service) patchImageLayerWorkflowBackground(ctx context.Context, parent model.Task, input imageLayerWorkflowInput, image imageLayerWorkflowImage) (imageLayerWorkflowImage, bool, error) {
	req := ImageOperationCreateRequest{RequestID: imageLayerWorkflowRasterRequestID(parent.ID, 0, "background-patch"), ProjectID: parent.ProjectID, ResourceID: input.Request.ResourceID, ExpectedSourceSHA256: input.Source.SHA256, Recipe: imageops.Recipe{Operation: "background-patch", Patch: &imageops.BackgroundPatch{Width: input.Source.Width, Height: input.Source.Height, GeneratedResourceID: image.Resource.ID, GeneratedSHA256: image.Probe.Source.SHA256, Regions: input.Request.BackgroundRegions}}}
	id := imageOperationID("image-operation-v1", parent.UserID, req.RequestID)
	if existing, err := s.existingImageOperation(parent.UserID, id, imageOperationRequestHash(req)); err != nil || existing != nil {
		if err != nil {
			return image, false, err
		}
		return s.imageLayerWorkflowTaskImage(ctx, parent, id)
	}
	prepared, err := s.prepareImageOperationInput(parent.UserID, req)
	if err != nil {
		return image, false, err
	}
	task := imageOperationTask(parent.UserID, prepared)
	if err := s.admitImageLayerWorkflowChild(parent, &task, nil); err != nil {
		if old, readErr := s.existingImageOperation(parent.UserID, id, imageOperationRequestHash(req)); readErr != nil || old == nil {
			return image, false, err
		}
	}
	s.wakeTaskDispatcher()
	return s.imageLayerWorkflowTaskImage(ctx, parent, id)
}
