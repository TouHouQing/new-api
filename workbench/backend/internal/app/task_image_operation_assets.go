package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/imageops"
	"yingce/backend/internal/model"
)

type imageOperationDerivation struct {
	Version          int                         `json:"version"`
	TaskID           string                      `json:"taskId"`
	SourceResourceID string                      `json:"sourceResourceId"`
	SourceStorageKey string                      `json:"sourceStorageKey"`
	Source           imageops.Source             `json:"source"`
	Recipe           imageops.Recipe             `json:"recipe"`
	Piece            imageops.Piece              `json:"piece"`
	OutputIndex      int                         `json:"outputIndex"`
	LayerSources     []imageOperationLayerSource `json:"layerSources,omitempty"`
	PatchSource      *imageOperationLayerSource  `json:"patchSource,omitempty"`
}

func imageOperationVersionID(taskID string, index int) string {
	return imageOperationID("image-operation-version", taskID, fmt.Sprint(index))
}

func (s *Service) registerImageOperationAssets(task model.Task) error {
	input, err := decodeImageOperationInput(&task)
	if err != nil {
		return err
	}
	checkpoint, err := s.decodeMediaCheckpoint(&task)
	if err != nil {
		return err
	}
	if len(checkpoint.Items) != len(input.Pieces) {
		return BadAuthRequest("图片输出数量与配方不一致")
	}
	projectID, err := s.mediaTaskProject(&task)
	if err != nil {
		return err
	}
	policy, err := s.RuntimePolicy()
	if err != nil {
		return err
	}
	for index, item := range checkpoint.Items {
		resource, err := s.repo.ResourceForUser(task.UserID, item.ResourceID)
		if err != nil {
			return err
		}
		piece := input.Pieces[index]
		if resource.Status != model.ResourceStatusReady || resource.Kind != "image" || resource.MimeType != "image/png" || resource.Width != piece.OutputWidth || resource.Height != piece.OutputHeight {
			return BadAuthRequest("处理结果的格式或像素尺寸与配方不一致")
		}
		assetID, versionID := generationMediaAssetID(task.ID, index), imageOperationVersionID(task.ID, index)
		sourceID, raster := imageOperationOutputSource(input, index)
		derivation := imageOperationDerivation{Version: 1, TaskID: task.ID, SourceResourceID: sourceID, SourceStorageKey: "resource:" + sourceID, Source: raster, Recipe: input.Request.Recipe, Piece: piece, OutputIndex: index}
		derivation.LayerSources = input.LayerSources
		derivation.PatchSource = input.PatchSource
		definition, err := json.Marshal(derivation)
		if err != nil {
			return err
		}
		now := time.Now()
		url := resourceFileURL(resource.ID)
		title := imageOperationTitle(input.Request.Recipe.Operation)
		if len(input.Pieces) > 1 {
			title = fmt.Sprintf("%s %d-%d", title, piece.Row+1, piece.Column+1)
		}
		metadata := map[string]any{"source": "image-operation", "taskId": task.ID, "outputIndex": index, "generationEffectKey": fmt.Sprintf("materialize:%s:%d", task.ID, index), "imageDerivation": derivation}
		if projectID != "" {
			metadata["projectIds"] = []string{projectID}
		}
		payload, err := json.Marshal(map[string]any{"id": assetID, "kind": "image", "category": model.AssetCategoryMaterial, "status": model.AssetVersionStatusConfirmed, "primaryVersionId": versionID, "source": "本地图片处理", "title": title, "coverUrl": url, "tags": []string{"图片处理"}, "createdAt": now.UTC().Format(time.RFC3339Nano), "updatedAt": now.UTC().Format(time.RFC3339Nano), "data": map[string]any{"dataUrl": url, "storageKey": "resource:" + resource.ID, "width": resource.Width, "height": resource.Height, "bytes": resource.Size, "mimeType": resource.MimeType}, "metadata": metadata})
		if err != nil {
			return err
		}
		existing, err := s.repo.AssetForUser(task.UserID, assetID)
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if existing == nil {
			usage, usageErr := s.repo.UserStorageUsage(task.UserID)
			if usageErr != nil {
				return usageErr
			}
			if err := validateStructuredStorageQuotaWithPolicy(usage, "asset", true, int64(len(payload)+len(definition)), policy.Resource); err != nil {
				return err
			}
		}
		asset := model.Asset{ID: assetID, UserID: task.UserID, Kind: "image", Category: model.AssetCategoryMaterial, Status: model.AssetVersionStatusConfirmed, PrimaryVersionID: versionID, Title: title, PayloadJSON: string(payload), CreatedAt: now, UpdatedAt: now}
		version := model.AssetVersion{ID: versionID, AssetID: assetID, Version: 1, Status: model.AssetVersionStatusConfirmed, DefinitionJSON: string(definition), CreatedAt: now, UpdatedAt: now}
		representation := model.AssetRepresentation{ID: imageOperationID("image-operation-representation", task.ID, fmt.Sprint(index)), AssetVersionID: versionID, TaskID: task.ID, ResourceID: resource.ID, MediaType: "image", Role: fmt.Sprintf("output:%d", index), MetadataJSON: string(definition), CreatedAt: now}
		if err := s.repo.CreateDerivedImageAsset(&asset, &version, &representation, sourceID); err != nil {
			return err
		}
		if projectID != "" {
			linked, err := s.repo.ProjectAssetLinked(projectID, assetID)
			if err != nil {
				return err
			}
			if !linked {
				position, err := s.repo.NextProjectAssetPosition(projectID, "")
				if err != nil {
					return err
				}
				if _, err := s.repo.LinkProjectAsset(&asset, nil, &model.ProjectAssetLink{ID: newID(), ProjectID: projectID, AssetID: assetID, Position: position, CreatedAt: now}); err != nil {
					return err
				}
			}
		}
	}
	return nil
}
