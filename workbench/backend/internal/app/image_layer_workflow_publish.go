package app

import (
	"encoding/json"
	"fmt"
	"yingce/backend/internal/canvas"
	"yingce/backend/internal/imageops"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

func imageLayerWorkflowMarker(root map[string]any, status string) map[string]any {
	meta, _ := root["metadata"].(map[string]any)
	old, _ := meta["nativeImageLayerWorkflow"].(map[string]any)
	marker := map[string]any{}
	for k, v := range old {
		marker[k] = v
	}
	marker["status"] = status
	return marker
}

func (s *Service) publishImageLayerWorkflowLayer(parent *model.Task, input imageLayerWorkflowInput, index int, image imageLayerWorkflowImage, problem string) error {
	return s.mutateImageLayerWorkflow(parent, input, fmt.Sprintf("layer:%d", index), func(_ *Service, nodes map[string]map[string]any, root map[string]any, replayed bool) ([]canvas.CanvasOperation, error) {
		node := nodes[input.ChildNodeIDs[index]]
		meta, _ := node["metadata"].(map[string]any)
		if node["type"] != "image" || meta["nativeImageLayerWorkflowParentId"] != parent.ID || meta["batchRootId"] != input.NodeID {
			return nil, imageMaterialSourceChanged()
		}
		if replayed {
			if problem != "" && meta["status"] == "error" && meta["errorDetails"] == problem {
				return nil, nil
			}
			if problem == "" && meta["storageKey"] == "resource:"+image.Resource.ID && meta["assetVersionId"] == image.VersionID && meta["status"] == "success" {
				return nil, nil
			}
			return nil, imageMaterialSourceChanged()
		}
		if meta["storageKey"] != "resource:"+input.Request.ResourceID || meta["status"] != "loading" || meta["imageLayer"] != nil {
			return nil, imageMaterialSourceChanged()
		}
		values := map[string]any{}
		if problem != "" {
			values["status"], values["errorDetails"] = "error", problem
		} else {
			kind := "transparent"
			if index == 0 {
				kind = "base"
			}
			warning := ""
			if index == 0 && !image.Probe.RasterInfo.Opaque {
				warning = "底图仍有透明像素，请检查场景是否完整"
			}
			if index > 0 && !imageLayerWorkflowHasTransparency(image.Probe) {
				warning = "该层尚无有效透明背景，请检查或手动抠图；系统不会自动付费重试"
			}
			values = map[string]any{"status": "success", "errorDetails": nil, "content": resourceFileURL(image.Resource.ID), "storageKey": "resource:" + image.Resource.ID, "assetId": image.AssetID, "assetVersionId": image.VersionID, "naturalWidth": image.Probe.Source.Width, "naturalHeight": image.Probe.Source.Height, "mimeType": image.Resource.MimeType, "bytes": image.Resource.Size, "imageLayer": map[string]any{"groupId": input.NodeID, "outputIndex": index, "kind": kind}, "nativeImageLayerRaster": map[string]any{"sourceSha256": image.Probe.Source.SHA256, "rasterInfo": image.Probe.RasterInfo, "warning": warning}}
		}
		op, err := imageLayerWorkflowMetadataPatch(node, values)
		if err != nil {
			return nil, err
		}
		completed, failed := 0, 0
		for _, id := range input.ChildNodeIDs {
			meta, _ := nodes[id]["metadata"].(map[string]any)
			status := meta["status"]
			if id == input.ChildNodeIDs[index] {
				status = values["status"]
			}
			if status == "success" {
				completed++
			}
			if status == "error" {
				failed++
			}
		}
		marker := imageLayerWorkflowMarker(root, "queued")
		marker["completed"] = completed
		progress, err := imageLayerWorkflowMetadataPatch(root, map[string]any{"nativeImageLayerWorkflow": marker, "generationOutputCount": completed, "batchFailedCount": failed})
		return []canvas.CanvasOperation{op, progress}, err
	}, nil)
}

func imageLayerWorkflowComposeRequestID(parentID string) string {
	return imageLayerWorkflowRasterRequestID(parentID, 0, "compose")
}
func imageLayerWorkflowComposeTaskID(parent model.Task) string {
	return imageOperationID("image-operation-v1", parent.UserID, imageLayerWorkflowComposeRequestID(parent.ID))
}

// The editable group, immutable composition snapshot and its queued CPU task
// commit in one native canvas transaction, including the first composition.
func (s *Service) queueImageLayerWorkflowComposition(parent *model.Task, input imageLayerWorkflowInput) error {
	policy, err := s.RuntimePolicy()
	if err != nil {
		return err
	}
	composeID := imageLayerWorkflowComposeTaskID(*parent)
	return s.mutateImageLayerWorkflow(parent, input, "compose", func(_ *Service, nodes map[string]map[string]any, root map[string]any, replayed bool) ([]canvas.CanvasOperation, error) {
		meta, _ := root["metadata"].(map[string]any)
		group, _ := meta["imageLayerGroup"].(map[string]any)
		if replayed {
			if group["pendingTaskId"] != composeID {
				return nil, imageMaterialSourceChanged()
			}
			return nil, nil
		}
		if meta["storageKey"] != "resource:"+input.Request.ResourceID || group != nil {
			return nil, imageMaterialSourceChanged()
		}
		layers, sigLayers := []any{}, []any{}
		warnings := []string{}
		for i, id := range input.ChildNodeIDs {
			node := nodes[id]
			child, _ := node["metadata"].(map[string]any)
			role, _ := child["imageLayer"].(map[string]any)
			if child["status"] != "success" || role["groupId"] != input.NodeID || child["nativeImageLayerWorkflowParentId"] != parent.ID {
				return nil, imageMaterialSourceChanged()
			}
			visible := input.Request.Layers[i].Visible == nil || *input.Request.Layers[i].Visible
			layers = append(layers, map[string]any{"nodeId": id, "x": 0, "y": 0, "visible": visible, "opacity": 1})
			sigLayers = append(sigLayers, []any{id, 0, 0, visible, 1, child["storageKey"]})
			raster, _ := child["nativeImageLayerRaster"].(map[string]any)
			if warning, _ := raster["warning"].(string); warning != "" {
				warnings = append(warnings, input.Request.Layers[i].Name+"："+warning)
			}
		}
		signature, err := json.Marshal([]any{input.Source.Width, input.Source.Height, sigLayers})
		if err != nil {
			return nil, err
		}
		group = map[string]any{"width": input.Source.Width, "height": input.Source.Height, "layers": layers, "compositeStatus": "updating", "compositeIntentId": input.Request.RequestID, "pendingTaskId": composeID, "pendingSignature": string(signature)}
		marker := imageLayerWorkflowMarker(root, "composing")
		marker["completed"], marker["warnings"] = len(layers), warnings
		op, err := imageLayerWorkflowMetadataPatch(root, map[string]any{"imageLayerGroup": group, "nativeImageLayerWorkflow": marker, "status": "loading"})
		return []canvas.CanvasOperation{op}, err
	}, func(repo *repository.Repository) error {
		if old, err := repo.TaskForUser(parent.UserID, composeID); err == nil {
			decoded, err := decodeImageOperationInput(old)
			if err != nil || decoded.Request.SourceNodeID != input.NodeID || decoded.Request.RequestID != imageLayerWorkflowComposeRequestID(parent.ID) {
				return imageMaterialSourceChanged()
			}
			return nil
		}
		writer := &Service{repo: repo, dataDir: s.dataDir}
		source, err := writer.ReadImageLayerGroupSource(parent.UserID, parent.ProjectID, input.NodeID)
		if err != nil {
			return err
		}
		project, err := repo.CanvasProjectForUser(parent.UserID, parent.ProjectID)
		if err != nil {
			return err
		}
		var doc struct {
			Nodes []map[string]any `json:"nodes"`
		}
		if err := json.Unmarshal([]byte(project.PayloadJSON), &doc); err != nil {
			return err
		}
		signature := ""
		for _, node := range doc.Nodes {
			if node["id"] == input.NodeID {
				meta, _ := node["metadata"].(map[string]any)
				group, _ := meta["imageLayerGroup"].(map[string]any)
				signature, _ = group["pendingSignature"].(string)
			}
		}
		prepared, err := writer.prepareImageOperationInput(parent.UserID, ImageOperationCreateRequest{RequestID: imageLayerWorkflowComposeRequestID(parent.ID), ProjectID: parent.ProjectID, SourceNodeID: input.NodeID, ResourceID: source.ResourceID, SourceGroupSHA256: source.SnapshotSHA256, ClientCompositeSignature: signature, ExpectedSourceSHA256: source.Source.SHA256, Recipe: imageops.Recipe{Operation: "compose", Compose: &source.Composition}})
		if err != nil {
			return err
		}
		task := imageOperationTask(parent.UserID, prepared)
		return createTaskWithStorageQuotaRepository(repo, &task, nil, policy)
	})
}
