package app

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"yingce/backend/internal/imageops"
)

type imageLayerMaterialSource struct {
	ID          string              `json:"id"`
	ResourceID  string              `json:"resourceId"`
	Source      imageops.Source     `json:"source"`
	Title       string              `json:"title"`
	Crop        *imageops.PixelCrop `json:"crop,omitempty"`
	Empty       bool                `json:"empty,omitempty"`
	OutputIndex *int                `json:"outputIndex,omitempty"`
}

func imageOperationOutputSource(input imageOperationInput, index int) (string, imageops.Source) {
	if input.TrimGroup != nil {
		for _, row := range input.Materials {
			if row.OutputIndex != nil && *row.OutputIndex == index {
				return row.ResourceID, row.Source
			}
		}
		return "", imageops.Source{}
	}
	return input.Request.ResourceID, input.Source
}

func validateImageMaterialSnapshots(input imageOperationInput) error {
	group := input.TrimGroup
	if group == nil || input.Request.Recipe.Operation != "trim-layers" || input.Request.SourceGroupSHA256 != "" || input.Request.ClientCompositeSignature != "" || len(input.LayerSources) > 0 || group.CanvasID != input.Request.ProjectID || group.NodeID != input.Request.SourceNodeID || group.ResourceID != input.Request.ResourceID || group.Source != input.Source || !group.Ready || group.SnapshotSHA256 != imageLayerGroupSignature(*group) || len(input.Materials) < 1 || len(input.Materials) > imageops.MaxCompositionLayers {
		return errors.New("独立图层素材缺少准确的原生来源")
	}
	seen := map[string]bool{}
	next := 0
	for _, row := range input.Materials {
		if seen[row.ID] {
			return errors.New("独立素材来源重复")
		}
		seen[row.ID] = true
		found := false
		for _, layer := range group.LayerSources {
			if row.ID == layer.ID && row.ResourceID == layer.ResourceID && row.Source == layer.Source {
				found = true
				break
			}
		}
		if !found {
			return errors.New("独立素材不属于固定图层来源")
		}
		if row.Empty {
			if row.Crop != nil || row.OutputIndex != nil {
				return errors.New("空图层不能输出伪素材")
			}
			continue
		}
		if row.Crop == nil {
			return errors.New("独立素材缺少原像素边界")
		}
		pieces, err := imageops.Plan(row.Source.Width, row.Source.Height, imageops.Recipe{Operation: "crop", CropPixels: row.Crop})
		if err != nil {
			return err
		}
		full := row.Crop.X == 0 && row.Crop.Y == 0 && row.Crop.Width == row.Source.Width && row.Crop.Height == row.Source.Height
		if full {
			if row.OutputIndex != nil {
				return errors.New("无需裁剪的图片应复用原文件")
			}
			continue
		}
		if row.OutputIndex == nil || *row.OutputIndex != next || next >= len(input.Request.Recipe.TrimLayers) {
			return errors.New("独立素材输出次序不一致")
		}
		trim := input.Request.Recipe.TrimLayers[next]
		if trim.ID != row.ID || trim.ResourceID != row.ResourceID || trim.Width != row.Source.Width || trim.Height != row.Source.Height || trim.Crop != *row.Crop || next >= len(input.Pieces) {
			return errors.New("独立素材配方来源不一致")
		}
		pieces[0].Row = next
		if pieces[0] != input.Pieces[next] {
			return errors.New("独立素材原像素区域不一致")
		}
		next++
	}
	if next != len(input.Pieces) || next != len(input.Request.Recipe.TrimLayers) {
		return errors.New("独立素材输出数量不一致")
	}
	return nil
}

func (s *Service) inspectImageLayerMaterials(ctx context.Context, userID string, group ImageLayerGroupSource) ([]imageLayerMaterialSource, []imageops.LayerTrim, error) {
	project, err := s.repo.CanvasProjectForUser(userID, group.CanvasID)
	if err != nil {
		return nil, nil, err
	}
	var doc struct {
		Nodes []map[string]any `json:"nodes"`
	}
	if json.Unmarshal([]byte(project.PayloadJSON), &doc) != nil {
		return nil, nil, BadAuthRequest("无法读取图层画布")
	}
	byID := map[string]map[string]any{}
	for _, node := range doc.Nodes {
		id, _ := node["id"].(string)
		byID[id] = node
	}
	rows := []imageLayerMaterialSource{}
	trims := []imageops.LayerTrim{}
	for _, layer := range group.LayerSources {
		node := byID[layer.ID]
		meta, _ := node["metadata"].(map[string]any)
		role, _ := meta["imageLayer"].(map[string]any)
		// Manual stacks already consist of independent images. Only explicitly
		// extracted transparent foregrounds need the additional trimming step.
		if role["kind"] != "transparent" {
			continue
		}
		if meta["status"] != "success" || meta["storageKey"] != "resource:"+layer.ResourceID {
			return nil, nil, imageMaterialSourceChanged()
		}
		bounds, err := s.InspectImageAlphaBounds(ctx, userID, layer.ResourceID)
		if err != nil {
			return nil, nil, err
		}
		if bounds.Source != layer.Source {
			return nil, nil, imageMaterialSourceChanged()
		}
		title, _ := node["title"].(string)
		row := imageLayerMaterialSource{ID: layer.ID, ResourceID: layer.ResourceID, Source: layer.Source, Title: title, Crop: bounds.Bounds, Empty: bounds.Empty}
		if bounds.TrimNeeded {
			index := len(trims)
			row.OutputIndex = &index
			trims = append(trims, imageops.LayerTrim{ID: layer.ID, ResourceID: layer.ResourceID, Width: layer.Source.Width, Height: layer.Source.Height, Crop: *bounds.Bounds})
		}
		rows = append(rows, row)
	}
	if len(rows) == 0 {
		return nil, nil, BadAuthRequest("这些图片已经是独立素材，可直接选用或下载，无需重复另存")
	}
	current, err := s.ReadImageLayerGroupSource(userID, group.CanvasID, group.NodeID)
	if err != nil {
		return nil, nil, err
	}
	if !current.Ready || current.SnapshotSHA256 != group.SnapshotSHA256 {
		return nil, nil, imageMaterialSourceChanged()
	}
	return rows, trims, nil
}

func imageMaterialSourceChanged() error {
	return &AppError{Status: 409, Code: 409, Reason: "image_operation_source_changed", Message: "图层来源已变化，已完成的图片保留在素材库；请核对当前图层后再操作"}
}

func imageMaterialRolesUnchanged(nodes []map[string]any, rows []imageLayerMaterialSource) bool {
	for _, row := range rows {
		found := false
		for _, node := range nodes {
			if node["id"] != row.ID {
				continue
			}
			meta, _ := node["metadata"].(map[string]any)
			role, _ := meta["imageLayer"].(map[string]any)
			found = node["type"] == "image" && role["kind"] == "transparent" && meta["storageKey"] == "resource:"+row.ResourceID && meta["status"] == "success"
			break
		}
		if !found {
			return false
		}
	}
	return true
}

func sameImageMaterialReferences(a, b ImageLayerGroupSource) bool {
	return a.ResourceID == b.ResourceID && reflect.DeepEqual(a.Composition, b.Composition)
}

// Readiness and ownership are checked independently of untrusted UI flags.
func (s *Service) requireImageMaterialSource(userID, canvasID, nodeID, sha string) (ImageLayerGroupSource, error) {
	group, err := s.ReadImageLayerGroupSource(userID, canvasID, nodeID)
	if err != nil {
		return group, err
	}
	if !group.Ready || group.SnapshotSHA256 != sha {
		return group, imageMaterialSourceChanged()
	}
	return group, nil
}

func imageMaterialTask(input imageOperationInput) bool {
	return input.TrimGroup != nil && input.Request.Recipe.Operation == "trim-layers"
}

func imageMaterialNodesMatch(ids []string, nodes []map[string]any, rows []imageLayerMaterialSource, outputs []imageOperationStoredOutput) bool {
	index := 0
	for _, row := range rows {
		if row.Empty {
			continue
		}
		if index >= len(ids) {
			return false
		}
		resourceID := row.ResourceID
		if row.OutputIndex != nil {
			if *row.OutputIndex >= len(outputs) {
				return false
			}
			resourceID = outputs[*row.OutputIndex].ResourceID
		}
		found := false
		for _, node := range nodes {
			if node["id"] != ids[index] {
				continue
			}
			meta, _ := node["metadata"].(map[string]any)
			origin, _ := meta["imageLayerMaterial"].(map[string]any)
			found = node["type"] == "image" && meta["storageKey"] == "resource:"+resourceID && origin["sourceLayerId"] == row.ID && origin["sourceSha256"] == row.Source.SHA256
			break
		}
		if !found {
			return false
		}
		index++
	}
	return index == len(ids)
}
