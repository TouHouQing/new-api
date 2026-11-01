package app

import (
	"encoding/json"
	"fmt"
	"math"
	"yingce/backend/internal/canvas"
	"yingce/backend/internal/model"
)

func imageLayerWorkflowInitialNodes(task model.Task, input imageLayerWorkflowInput, source map[string]any, nodes []map[string]any) ([]canvas.CanvasOperation, error) {
	position, _ := source["position"].(map[string]any)
	x, _ := position["x"].(float64)
	y, _ := position["y"].(float64)
	width, _ := source["width"].(float64)
	if width <= 0 || math.IsNaN(x+y+width) || math.IsInf(x+y+width, 0) {
		return nil, BadAuthRequest("原图节点位置或尺寸无效")
	}
	height := width * float64(input.Source.Height) / float64(input.Source.Width)
	rows := (len(input.ChildNodeIDs) + 1) / 2
	place := availableCanvasResultPosition(nodes, canvasResultRectangle{x: x + width + 96, y: y, width: width*2 + 48, height: float64(rows+1) * (height + 64)})
	sourceMeta, _ := source["metadata"].(map[string]any)
	media := func() map[string]any {
		meta := map[string]any{}
		for _, key := range []string{"content", "storageKey", "assetId", "assetVersionId", "naturalWidth", "naturalHeight", "bytes", "mimeType"} {
			if value, ok := sourceMeta[key]; ok {
				meta[key] = value
			}
		}
		meta["assetId"] = input.OriginalAssetID
		meta["assetVersionId"] = input.OriginalVersionID
		meta["status"] = "loading"
		meta["manualSize"] = true
		return meta
	}
	rootMeta := media()
	rootMeta["isBatchRoot"] = true
	rootMeta["imageBatchExpanded"] = false
	rootMeta["batchChildIds"] = input.ChildNodeIDs
	rootMeta["nativeImageLayerWorkflow"] = map[string]any{"version": 1, "taskId": task.ID, "requestSha256": input.RequestSHA256, "sourceNodeId": input.Request.SourceNodeID, "sourceResourceId": input.Request.ResourceID, "sourceSha256": input.Source.SHA256, "status": "queued", "completed": 0, "total": len(input.ChildNodeIDs)}
	title := input.Request.Title
	if title == "" {
		title = "图层拆分"
	}
	root := map[string]any{"id": input.NodeID, "type": "image", "title": title, "position": map[string]float64{"x": place.x, "y": place.y}, "width": width, "height": height, "metadata": rootMeta}
	raw, err := json.Marshal(root)
	if err != nil {
		return nil, err
	}
	operations := []canvas.CanvasOperation{{Type: "create_node", ID: input.NodeID, Node: raw}}
	for i, id := range input.ChildNodeIDs {
		meta := media()
		meta["batchRootId"] = input.NodeID
		meta["nativeImageLayerWorkflowParentId"] = task.ID
		node := map[string]any{"id": id, "type": "image", "title": input.Request.Layers[i].Name, "position": map[string]float64{"x": place.x + float64(i%2)*(width+48), "y": place.y + height + 64 + float64(i/2)*(height+64)}, "width": width, "height": height, "metadata": meta}
		raw, err := json.Marshal(node)
		if err != nil {
			return nil, err
		}
		operations = append(operations, canvas.CanvasOperation{Type: "create_node", ID: id, Node: raw})
		edgeID := fmt.Sprintf("layer-flow-link:%s:%d", task.ID, i)
		raw, err = json.Marshal(map[string]any{"id": edgeID, "fromNodeId": input.NodeID, "toNodeId": id})
		if err != nil {
			return nil, err
		}
		operations = append(operations, canvas.CanvasOperation{Type: "create_connection", ID: edgeID, Connection: raw})
	}
	return operations, nil
}

func imageLayerWorkflowMetadataPatch(node map[string]any, values map[string]any) (canvas.CanvasOperation, error) {
	id, _ := node["id"].(string)
	meta, _ := node["metadata"].(map[string]any)
	patch, before := map[string]json.RawMessage{}, map[string]json.RawMessage{}
	for key, value := range values {
		encoded, err := json.Marshal(value)
		if err != nil {
			return canvas.CanvasOperation{}, err
		}
		patch["metadata."+key] = encoded
		encoded, err = json.Marshal(meta[key])
		if err != nil {
			return canvas.CanvasOperation{}, err
		}
		before["metadata."+key] = encoded
	}
	return canvas.CanvasOperation{Type: "patch_node", ID: id, Patch: patch, Before: before}, nil
}
