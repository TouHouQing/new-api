package app

import (
	"encoding/json"
	"fmt"
	"yingce/backend/internal/canvas"
	"yingce/backend/internal/imageops"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

func imageMaterialMarkerPatch(node map[string]any, value any) (canvas.CanvasOperation, error) {
	meta, _ := node["metadata"].(map[string]any)
	before, err := json.Marshal(meta["imageLayerMaterials"])
	if err != nil {
		return canvas.CanvasOperation{}, err
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return canvas.CanvasOperation{}, err
	}
	id, _ := node["id"].(string)
	return canvas.CanvasOperation{Type: "patch_node", ID: id, Patch: map[string]json.RawMessage{"metadata.imageLayerMaterials": raw}, Before: map[string]json.RawMessage{"metadata.imageLayerMaterials": before}}, nil
}

// Material nodes reference native immutable outputs (or unchanged originals).
// The source group remains untouched; no browser canvas re-encodes the files.
func imageMaterialCanvasAdditions(repo *repository.Repository, task model.Task, input imageOperationInput, outputs []imageOperationStoredOutput, source map[string]any, nodes, connections []map[string]any) ([]canvas.CanvasOperation, []string, []string, error) {
	if input.TrimGroup == nil || !imageMaterialRolesUnchanged(nodes, input.Materials) {
		return nil, nil, nil, imageMaterialSourceChanged()
	}
	meta, _ := source["metadata"].(map[string]any)
	marker, _ := meta["imageLayerMaterials"].(map[string]any)
	if marker["taskId"] != task.ID {
		return nil, nil, nil, imageMaterialSourceChanged()
	}
	all := []imageOperationStoredOutput{}
	rows := []imageLayerMaterialSource{}
	byID := map[string]map[string]any{}
	for _, node := range nodes {
		id, _ := node["id"].(string)
		byID[id] = node
	}
	for _, row := range input.Materials {
		if row.Empty {
			continue
		}
		var output imageOperationStoredOutput
		if row.OutputIndex != nil {
			if *row.OutputIndex >= len(outputs) {
				return nil, nil, nil, BadAuthRequest("独立素材输出缺失")
			}
			output = outputs[*row.OutputIndex]
		} else {
			resource, err := repo.ResourceForUser(task.UserID, row.ResourceID)
			if err != nil || resource.Status != model.ResourceStatusReady || resource.Kind != "image" {
				return nil, nil, nil, NotFound("原素材文件不可用")
			}
			output = imageOperationStoredOutput{ResourceID: row.ResourceID, Width: row.Source.Width, Height: row.Source.Height, Piece: imageops.Piece{Width: row.Source.Width, Height: row.Source.Height, OutputWidth: row.Source.Width, OutputHeight: row.Source.Height}}
			original, _ := byID[row.ID]["metadata"].(map[string]any)
			output.AssetID, _ = original["assetId"].(string)
			output.AssetVersionID, _ = original["assetVersionId"].(string)
			if output.AssetID == "" || output.AssetVersionID == "" {
				return nil, nil, nil, BadAuthRequest("原图层尚未登记为原生素材，请先保存图层")
			}
		}
		output.Piece.Row, output.Piece.Column = len(all), 0
		all = append(all, output)
		rows = append(rows, row)
	}
	if len(all) == 0 {
		return nil, nil, nil, BadAuthRequest("前景图层全部透明，没有可另存的内容；原图保持不变")
	}
	operations, added, existing, err := imageOperationCanvasAdditions(task, input, all, source, nodes, connections)
	if err != nil {
		return nil, nil, nil, err
	}
	for i := range operations {
		if operations[i].Type != "create_node" {
			continue
		}
		var node map[string]any
		if json.Unmarshal(operations[i].Node, &node) != nil {
			return nil, nil, nil, BadAuthRequest("独立素材节点无法读取")
		}
		var index int
		if _, err := fmt.Sscanf(operations[i].ID, "image-operation:"+task.ID+":%d", &index); err != nil || index < 0 || index >= len(rows) {
			return nil, nil, nil, BadAuthRequest("独立素材输出编号无效")
		}
		row := rows[index]
		node["title"] = row.Title + " · 独立素材"
		metadata, _ := node["metadata"].(map[string]any)
		metadata["imageLayerMaterial"] = map[string]any{"sourceLayerId": row.ID, "sourceGroupId": input.Request.SourceNodeID, "sourceSha256": row.Source.SHA256, "bounds": map[string]int{"left": row.Crop.X, "top": row.Crop.Y, "width": row.Crop.Width, "height": row.Crop.Height}, "reusedOriginal": row.OutputIndex == nil}
		if row.OutputIndex == nil {
			original, _ := byID[row.ID]["metadata"].(map[string]any)
			delete(metadata, "imageOperationOutputIndex")
			for _, key := range []string{"mimeType", "bytes"} {
				if value, ok := original[key]; ok {
					metadata[key] = value
				}
			}
			if len(input.Pieces) == 0 {
				delete(metadata, "imageOperationTaskId")
			}
		} else {
			metadata["imageOperationOutputIndex"] = *row.OutputIndex
		}
		raw, err := json.Marshal(node)
		if err != nil {
			return nil, nil, nil, err
		}
		operations[i].Node = raw
	}
	ids := append(append([]string{}, added...), existing...)
	empty := []string{}
	for _, row := range input.Materials {
		if row.Empty {
			empty = append(empty, row.ID)
		}
	}
	patch, err := imageMaterialMarkerPatch(source, map[string]any{"auto": false, "status": "ready", "taskId": task.ID, "groupId": ids[0], "nodeIds": ids, "sourceGroupSha256": input.TrimGroup.SnapshotSHA256, "emptyLayerIds": empty})
	if err != nil {
		return nil, nil, nil, err
	}
	return append(operations, patch), added, existing, nil
}
