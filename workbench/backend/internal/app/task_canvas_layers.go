package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"gorm.io/gorm"
	"yingce/backend/internal/imageops"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

func isDedicatedLayerTask(task *model.Task) bool {
	if task == nil || task.Type != "canvas_image" {
		return false
	}
	var input struct {
		Metadata struct {
			LayerDecomposition bool `json:"layerDecomposition"`
		} `json:"metadata"`
	}
	return json.Unmarshal([]byte(task.InputJSON), &input) == nil && input.Metadata.LayerDecomposition
}

func validateDedicatedLayerTaskAdmission(task *model.Task) error {
	if !isDedicatedLayerTask(task) {
		return nil
	}
	var input struct {
		Config          map[string]any `json:"config"`
		ReferenceImages []any          `json:"referenceImages"`
	}
	if json.Unmarshal([]byte(task.InputJSON), &input) != nil || stringValue(input.Config["interfaceType"]) != "image-tools-layer-decomposition" {
		return BadAuthRequest("所选模型不是专用拆层协议，未提交图片生成；普通参考图模型请先在AI图层拆分中确认逐层计划")
	}
	if len(input.ReferenceImages) == 0 {
		return BadAuthRequest("专用拆层需要明确的参考原图，未提交生成任务")
	}
	if count, exists := input.Config["count"]; exists && fmt.Sprint(count) != "1" {
		return BadAuthRequest("专用拆层一次只提交一个多层任务，不能重复生成收费候选")
	}
	return nil
}

func (s *Service) dedicatedLayerTaskReady(task *model.Task, nodeID string) (bool, error) {
	if task.CanvasDeliveryStatus == "pending" {
		return false, nil
	}
	project, err := s.repo.CanvasProjectForUser(task.UserID, task.ProjectID)
	if err != nil {
		return false, err
	}
	doc, err := creationDocument(project.PayloadJSON)
	if err != nil {
		return false, err
	}
	for _, node := range creationMaps(doc["nodes"]) {
		if node["id"] != nodeID {
			continue
		}
		meta, _ := node["metadata"].(map[string]any)
		marker, _ := meta["nativeLayerDecomposition"].(map[string]any)
		if meta["taskId"] != task.ID || marker["sourceTaskId"] != task.ID {
			break
		}
		if marker["status"] == "needs_correction" {
			return false, BadAuthRequest("拆层结果需要校正；原图层保留在素材库，不会自动重新生成")
		}
		group, _ := meta["imageLayerGroup"].(map[string]any)
		if group["compositeStatus"] == "ready" {
			return true, s.requireReadyImageLayerGroup(task.UserID, task.ProjectID, nodeID)
		}
		cpu, err := s.repo.TaskForUser(task.UserID, stringValue(marker["compositeTaskId"]))
		if err != nil {
			return false, err
		}
		if cpu.Status == model.TaskStatusQueued || cpu.Status == model.TaskStatusRunning || (cpu.Status == model.TaskStatusSucceeded && cpu.ImageLayerDeliveryStatus == "pending") {
			return false, nil
		}
		return false, BadAuthRequest("原始图层已保存，合成尚未完成；请在画布核对当前图层后重试免费合成")
	}
	return false, creationConflict("拆层目标已删除或改绑，原始图层保留在素材库")
}

// Runs inside the existing canvas-delivery transaction/storage lock. No provider
// calls, uploads or browser-side work occur here. Model completion is immutable.
func (s *Service) applyDedicatedCanvasLayers(repo *repository.Repository, task *model.Task, policy RuntimePolicySetting) (bool, error) {
	draft, err := canvasTaskDraftFor(*task)
	if err != nil {
		return false, err
	}
	var rootID string
	if draft != nil {
		rootID = stringValue(draft.Node["id"])
	} else {
		var input struct {
			Metadata struct {
				NodeID string `json:"nodeId"`
			} `json:"metadata"`
		}
		if json.Unmarshal([]byte(task.InputJSON), &input) != nil || validateCloudAgentID(input.Metadata.NodeID, "拆层目标", 80) != nil {
			return false, nil
		}
		rootID = input.Metadata.NodeID // legacy: only an existing exact task binding, never recreate a draft
	}
	project, err := repo.CanvasProjectForUser(task.UserID, task.ProjectID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	doc, err := creationDocument(project.PayloadJSON)
	if err != nil {
		return false, err
	}
	nodes := creationMaps(doc["nodes"])
	byID := map[string]map[string]any{}
	for _, node := range nodes {
		byID[stringValue(node["id"])] = node
	}
	root := byID[rootID]
	meta, _ := root["metadata"].(map[string]any)
	if root["type"] != "image" || meta["taskId"] != task.ID {
		return false, nil
	}
	resultSHA := cutSignature(task.ResultJSON)
	if old, ok := meta["nativeLayerDecomposition"].(map[string]any); ok {
		// A historical delivery must never rebuild deleted layers, undo or edits.
		if old["sourceTaskId"] == task.ID && old["resultSha256"] == resultSHA {
			return true, nil
		}
		return false, nil
	}
	if meta["imageLayerGroup"] != nil {
		return false, nil
	}
	correction := func(message string) (bool, error) {
		applyNativeCanvasTaskMetadata(meta, task)
		meta["status"], meta["errorDetails"] = "error", message+"；原结果保留在素材库，请校正后手工组合，不会自动重新生成"
		meta["nativeLayerDecomposition"] = map[string]any{"sourceTaskId": task.ID, "resultSha256": resultSHA, "status": "needs_correction"}
		return true, saveCloudAgentDocument(repo, project, doc, policy)
	}
	var result map[string]any
	if json.Unmarshal([]byte(task.ResultJSON), &result) != nil {
		return correction("拆层结果格式无效")
	}
	outputs := creationMaps(result["images"])
	if len(outputs) < 2 || len(outputs) > imageops.MaxCompositionLayers {
		return correction("拆层须返回2至32张独立图片，单张拼版不能作为图层")
	}
	writer := &Service{repo: repo, dataDir: s.dataDir, pendingStorage: s.pendingStorage}
	children := make([]map[string]any, 0, len(outputs))
	sources := make([]ImageLayerGroupCreateSource, 0, len(outputs))
	width, height, baseIndex := 0, 0, -1
	fullyVisible := []int{}
	resourceIDs := map[string]bool{}
	position, _ := root["position"].(map[string]any)
	x, _ := position["x"].(float64)
	y, _ := position["y"].(float64)
	displayWidth, _ := root["width"].(float64)
	for index, output := range outputs {
		resourceID, _ := findTaskOutputResource(output, "image")
		resource, readErr := repo.ResourceForUser(task.UserID, resourceID)
		if readErr != nil {
			if !errors.Is(readErr, gorm.ErrRecordNotFound) {
				return false, readErr
			}
			return correction("拆层结果缺少本人保存的完整资源")
		}
		if resource.Status != model.ResourceStatusReady || resource.MimeType != "image/png" || resourceIDs[resourceID] {
			return correction("拆层结果须为不重复的已保存PNG图层")
		}
		resourceIDs[resourceID] = true
		assetID := generationMediaAssetID(task.ID, index)
		asset, readErr := repo.AssetForUser(task.UserID, assetID)
		if readErr != nil {
			if !errors.Is(readErr, gorm.ErrRecordNotFound) {
				return false, readErr
			}
			return correction("拆层结果尚无对应原生素材")
		}
		data, readErr := writer.readImageOperationSource(task.UserID, resourceID)
		if readErr != nil {
			return false, readErr
		} // transient file/storage failure: retry delivery, never inference
		probe, readErr := imageops.Inspect(data)
		if readErr != nil || probe.Format != "png" {
			return correction("拆层PNG内容无法验收")
		}
		if index == 0 {
			width, height = probe.Width, probe.Height
		}
		if probe.Width != width || probe.Height != height || int64(width)*int64(height)*int64(len(outputs)) > imageops.MaxCompositionPixels {
			return correction("图层尺寸不一致或总像素超限，无法确定合成坐标")
		}
		picture, readErr := imageops.Decode(context.Background(), data, probe)
		if readErr != nil {
			return correction("拆层PNG内容无法解码")
		}
		alpha, readErr := imageops.InspectAlpha(context.Background(), picture)
		if readErr != nil {
			return false, readErr
		}
		if alpha.Empty {
			return correction("拆层包含完全透明的空图层")
		}
		if alpha.TransparentPixels == 0 {
			fullyVisible = append(fullyVisible, index)
		}
		id := "native-layer:" + imageOperationID(task.ID, rootID, fmt.Sprint(index))
		if byID[id] != nil {
			return correction("目标图层编号已存在，请核对当前画布")
		}
		kind := "transparent"
		if alpha.TransparentPixels == 0 {
			kind = "base"
		}
		rasterInfo := ImageLayerRasterInfo{Width: width, Height: height, Transparent: alpha.TransparentPixels > 0, Nonempty: !alpha.Empty, Opaque: alpha.Opaque, TransparentPixels: alpha.TransparentPixels}
		childMeta := map[string]any{"content": resourceFileURL(resourceID), "storageKey": "resource:" + resourceID, "assetId": asset.ID, "status": "success", "taskId": task.ID, "batchRootId": rootID, "naturalWidth": width, "naturalHeight": height, "mimeType": resource.MimeType, "bytes": resource.Size, "imageLayer": map[string]any{"groupId": rootID, "outputIndex": index, "kind": kind}, "nativeImageLayerRaster": map[string]any{"sourceSha256": probe.SHA256, "rasterInfo": rasterInfo}}
		applyTaskMediaAssetVersion(childMeta, task, resourceID, asset.ID)
		if stringValue(childMeta["assetVersionId"]) == "" {
			return correction("拆层缺少产生此文件的固定素材版本")
		}
		commitNativeCanvasProducedModel(childMeta, task)
		displayHeight := displayWidth * float64(height) / float64(width)
		place := availableCanvasResultPosition(append(nodes, children...), canvasResultRectangle{x: x + displayWidth + 96 + float64(index%2)*(displayWidth+48), y: y + float64(index/2)*(displayHeight+64), width: displayWidth, height: displayHeight})
		children = append(children, map[string]any{"id": id, "type": "image", "title": fmt.Sprintf("图层 %d", index+1), "position": map[string]any{"x": place.x, "y": place.y}, "width": displayWidth, "height": displayHeight, "metadata": childMeta})
		sources = append(sources, ImageLayerGroupCreateSource{NodeID: id, ResourceID: resourceID})
	}
	// Preserve the established provider-output ordering contract: only one
	// unambiguous nontransparent base may be moved underneath the other layers.
	if len(fullyVisible) == 1 {
		baseIndex = fullyVisible[0]
	}
	if baseIndex > 0 {
		base := sources[baseIndex]
		ordered := []ImageLayerGroupCreateSource{base}
		ordered = append(ordered, sources[:baseIndex]...)
		ordered = append(ordered, sources[baseIndex+1:]...)
		sources = ordered
	}
	if config, ok := meta["layerDecomposition"].(map[string]any); ok {
		if bounds, ok := config["canvas"].(map[string]any); ok {
			w, _ := bounds["width"].(float64)
			h, _ := bounds["height"].(float64)
			if w > 0 && h > 0 && (w != float64(width) || h != float64(height)) {
				return correction("图层与原画面尺寸不同，未擅自拉伸或猜测坐标")
			}
		}
	}
	all := make([]any, 0, len(nodes)+len(children))
	for _, node := range append(nodes, children...) {
		all = append(all, node)
	}
	doc["nodes"] = all
	applyNativeCanvasTaskMetadata(meta, task)
	commitNativeCanvasProducedModel(meta, task)
	if err := saveCloudAgentDocument(repo, project, doc, policy); err != nil {
		return false, err
	}
	_, err = writer.createImageLayerGroup(task.UserID, task.ProjectID, ImageLayerGroupCreateRequest{RequestID: "native-layer-result:" + task.ID, Width: width, Height: height, Sources: sources}, &nativeLayerGroupTarget{NodeID: rootID, SourceTaskID: task.ID, ResultSHA256: resultSHA})
	return err == nil, err
}
