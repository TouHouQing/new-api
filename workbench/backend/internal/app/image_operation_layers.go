package app

import (
	"context"
	"encoding/json"
	"errors"
	"gorm.io/gorm"
	"image"
	"reflect"
	"strings"

	"yingce/backend/internal/canvas"
	"yingce/backend/internal/imageops"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

type imageOperationLayerSource struct {
	ID         string          `json:"id"`
	ResourceID string          `json:"resourceId"`
	Source     imageops.Source `json:"source"`
}
type ImageLayerGroupSource struct {
	CanvasID       string                      `json:"canvasId"`
	NodeID         string                      `json:"nodeId"`
	CanvasRevision int64                       `json:"canvasRevision"`
	ResourceID     string                      `json:"resourceId"`
	Source         imageops.Source             `json:"source"`
	Composition    imageops.Composition        `json:"composition"`
	LayerSources   []imageOperationLayerSource `json:"layerSources"`
	SnapshotSHA256 string                      `json:"snapshotSha256"`
	Ready          bool                        `json:"ready"`
}

// Snapshot hashes exclude global revision, names and node positions. Unrelated
// canvas edits must not invalidate an exact composition dependency snapshot.
func imageLayerGroupSignature(source ImageLayerGroupSource) string {
	return cutSignature(struct {
		CanvasID, NodeID, ResourceID string
		Source                       imageops.Source
		Composition                  imageops.Composition
		Layers                       []imageOperationLayerSource
	}{source.CanvasID, source.NodeID, source.ResourceID, source.Source, source.Composition, source.LayerSources})
}

func imageLayerGroupReferences(r *repository.Repository, userID, canvasID, nodeID string) (ImageLayerGroupSource, error) {
	var result ImageLayerGroupSource
	project, err := r.CanvasProjectForUser(userID, canvasID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return result, NotFound("图层画布不存在或无权访问")
		}
		return result, err
	}
	var document struct {
		Nodes []map[string]any `json:"nodes"`
	}
	if json.Unmarshal([]byte(project.PayloadJSON), &document) != nil {
		return result, BadAuthRequest("图层画布正文无法读取")
	}
	byID := map[string]map[string]any{}
	for _, node := range document.Nodes {
		if id, ok := node["id"].(string); ok {
			byID[id] = node
		}
	}
	return imageLayerGroupReferencesInDocument(canvasID, nodeID, project.Revision, byID)
}

func imageLayerGroupReferencesInDocument(canvasID, nodeID string, revision int64, byID map[string]map[string]any) (ImageLayerGroupSource, error) {
	var result ImageLayerGroupSource
	root := byID[nodeID]
	metadata, _ := root["metadata"].(map[string]any)
	key, _ := metadata["storageKey"].(string)
	if root == nil || root["type"] != "image" || !strings.HasPrefix(key, "resource:") || strings.TrimPrefix(key, "resource:") == "" {
		return result, BadAuthRequest("图层组合须使用已保存的原图节点")
	}
	raw, err := json.Marshal(metadata["imageLayerGroup"])
	if err != nil {
		return result, BadAuthRequest("图层组设置无效")
	}
	var group struct {
		Width  int `json:"width"`
		Height int `json:"height"`
		Layers []struct {
			NodeID  string   `json:"nodeId"`
			X       float64  `json:"x"`
			Y       float64  `json:"y"`
			Visible *bool    `json:"visible"`
			Opacity *float64 `json:"opacity"`
		} `json:"layers"`
	}
	if json.Unmarshal(raw, &group) != nil || len(group.Layers) < 1 || len(group.Layers) > imageops.MaxCompositionLayers {
		return result, BadAuthRequest("请先建立包含1至32层的图层组")
	}
	composition := imageops.Composition{Width: group.Width, Height: group.Height}
	for _, layer := range group.Layers {
		node := byID[layer.NodeID]
		meta, _ := node["metadata"].(map[string]any)
		storage, _ := meta["storageKey"].(string)
		if node == nil || node["type"] != "image" || !strings.HasPrefix(storage, "resource:") || strings.TrimPrefix(storage, "resource:") == "" || layer.Visible == nil {
			return result, BadAuthRequest("图层须绑定明确图片与可见性，缺失的图层不会自动替换")
		}
		opacity := 1.0
		if layer.Opacity != nil {
			opacity = *layer.Opacity
		}
		composition.Layers = append(composition.Layers, imageops.CompositionLayer{ID: layer.NodeID, ResourceID: strings.TrimPrefix(storage, "resource:"), X: layer.X, Y: layer.Y, Visible: layer.Visible, Opacity: &opacity})
	}
	if err := imageops.ValidateComposition(group.Width, group.Height, composition); err != nil {
		return result, BadAuthRequest(err.Error())
	}
	// Nested groups may reference other image nodes, but cycles would repeatedly
	// recompute each other's output. Reject before creating any task.
	visiting, visited := map[string]bool{}, map[string]bool{}
	var walk func(string, int) error
	walk = func(id string, depth int) error {
		if depth > 16 || len(visited) > 512 {
			return BadAuthRequest("图层嵌套过深，请拆为独立图片后继续")
		}
		if visiting[id] {
			return BadAuthRequest("图层组不能引用自身或形成循环")
		}
		if visited[id] {
			return nil
		}
		visiting[id] = true
		node := byID[id]
		meta, _ := node["metadata"].(map[string]any)
		nested, _ := meta["imageLayerGroup"].(map[string]any)
		if entries, ok := nested["layers"].([]any); ok {
			for _, entry := range entries {
				row, _ := entry.(map[string]any)
				child, _ := row["nodeId"].(string)
				if child != "" {
					if err := walk(child, depth+1); err != nil {
						return err
					}
				}
			}
		}
		delete(visiting, id)
		visited[id] = true
		return nil
	}
	if err := walk(nodeID, 0); err != nil {
		return result, err
	}
	return ImageLayerGroupSource{CanvasID: canvasID, NodeID: nodeID, CanvasRevision: revision, ResourceID: strings.TrimPrefix(key, "resource:"), Composition: composition}, nil
}

func (s *Service) inspectImageLayerSources(userID string, composition imageops.Composition) ([]imageOperationLayerSource, error) {
	rows := make([]imageOperationLayerSource, 0, len(composition.Layers))
	var pixels int64
	for _, layer := range composition.Layers {
		data, err := s.readImageOperationSource(userID, layer.ResourceID)
		if err != nil {
			return nil, err
		}
		source, err := imageops.Inspect(data)
		if err != nil {
			return nil, BadAuthRequest(err.Error())
		}
		pixels += int64(source.Width) * int64(source.Height)
		if pixels > imageops.MaxCompositionPixels {
			return nil, BadAuthRequest("图层总像素不能超过67108864，请减少图层或图片尺寸")
		}
		rows = append(rows, imageOperationLayerSource{ID: layer.ID, ResourceID: layer.ResourceID, Source: source})
	}
	return rows, nil
}

func (s *Service) ReadImageLayerGroupSource(userID, canvasID, nodeID string) (ImageLayerGroupSource, error) {
	var empty ImageLayerGroupSource
	user, err := s.repo.User(userID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return empty, NewAppError(403, "当前账号不能更新图层组")
		}
		return empty, err
	}
	if user.Status != model.UserStatusActive {
		return empty, NewAppError(403, "当前账号不能更新图层组")
	}
	if _, err := s.mediaTaskProject(&model.Task{UserID: userID, ProjectID: canvasID}); err != nil {
		return empty, err
	}
	before, err := imageLayerGroupReferences(s.repo, userID, canvasID, nodeID)
	if err != nil {
		return empty, err
	}
	children := make([]string, 0, len(before.Composition.Layers))
	for _, layer := range before.Composition.Layers {
		children = append(children, layer.ID)
	}
	if err := s.requireReadyImageLayerNodes(userID, canvasID, children, false); err != nil {
		return empty, err
	}
	data, err := s.readImageOperationSource(userID, before.ResourceID)
	if err != nil {
		return empty, err
	}
	before.Source, err = imageops.Inspect(data)
	if err != nil {
		return empty, BadAuthRequest(err.Error())
	}
	if _, err = imageops.Plan(before.Source.Width, before.Source.Height, imageops.Recipe{Operation: "compose", Compose: &before.Composition}); err != nil {
		return empty, BadAuthRequest(err.Error())
	}
	before.LayerSources, err = s.inspectImageLayerSources(userID, before.Composition)
	if err != nil {
		return empty, err
	}
	after, err := imageLayerGroupReferences(s.repo, userID, canvasID, nodeID)
	if err != nil {
		return empty, err
	}
	if before.ResourceID != after.ResourceID || !reflect.DeepEqual(before.Composition, after.Composition) {
		return empty, &AppError{Status: 409, Code: 409, Reason: "image_operation_source_changed", Message: "图层组读取期间已变化，请核对当前版本"}
	}
	before.CanvasRevision = after.CanvasRevision
	before.SnapshotSHA256 = imageLayerGroupSignature(before)
	readyErr := s.requireReadyImageLayerGroup(userID, canvasID, nodeID)
	if readyErr == nil {
		before.Ready = true
	} else {
		var appErr *AppError
		if !errors.As(readyErr, &appErr) && !errors.Is(readyErr, gorm.ErrRecordNotFound) {
			return empty, readyErr
		}
	}
	return before, nil
}

func validateImageLayerSnapshots(input imageOperationInput) error {
	if input.TrimGroup != nil || len(input.Materials) > 0 || input.Request.Recipe.Operation == "trim-layers" {
		return validateImageMaterialSnapshots(input)
	}
	if input.Request.Recipe.Compose == nil {
		if len(input.LayerSources) > 0 || input.Request.SourceGroupSHA256 != "" || input.Request.ClientCompositeSignature != "" {
			return errors.New("图片任务包含无关图层快照")
		}
		return nil
	}
	composition := input.Request.Recipe.Compose
	if len(input.LayerSources) != len(composition.Layers) {
		return errors.New("图层来源数量与配方不一致")
	}
	var pixels int64
	for index, layer := range composition.Layers {
		row := input.LayerSources[index]
		if row.ID != layer.ID || row.ResourceID != layer.ResourceID || len(row.Source.SHA256) != 64 || row.Source.Width < 1 || row.Source.Height < 1 || row.Source.Width > imageops.MaxPixels || row.Source.Height > imageops.MaxPixels || int64(row.Source.Width)*int64(row.Source.Height) > imageops.MaxPixels || row.Source.Orientation < 1 || row.Source.Orientation > 8 {
			return errors.New("图层来源身份与配方不一致")
		}
		pixels += int64(row.Source.Width) * int64(row.Source.Height)
	}
	if pixels > imageops.MaxCompositionPixels {
		return errors.New("图层快照超过总像素限制")
	}
	if input.Request.SourceGroupSHA256 != "" {
		if len(input.Request.SourceGroupSHA256) != 64 || input.Request.ProjectID == "" || input.Request.SourceNodeID == "" || input.Request.ClientCompositeSignature == "" || len(input.Request.ClientCompositeSignature) > 8192 {
			return errors.New("图层组采用缺少准确来源或编辑签名")
		}
		group := ImageLayerGroupSource{CanvasID: input.Request.ProjectID, NodeID: input.Request.SourceNodeID, ResourceID: input.Request.ResourceID, Source: input.Source, Composition: *composition, LayerSources: input.LayerSources}
		if imageLayerGroupSignature(group) != input.Request.SourceGroupSHA256 {
			return errors.New("图层组快照摘要与固定输入不一致")
		}
	} else if input.Request.ClientCompositeSignature != "" {
		return errors.New("未绑定图层组的任务不能指定编辑签名")
	}
	return nil
}

func (s *Service) renderImageComposition(ctx context.Context, userID string, input imageOperationInput) ([]byte, error) {
	return imageops.RenderCompositionPNG(ctx, *input.Request.Recipe.Compose, func(index int) (image.Image, error) {
		row := input.LayerSources[index]
		data, err := s.readImageOperationSource(userID, row.ResourceID)
		if err != nil {
			return nil, err
		}
		identity, err := imageops.Inspect(data)
		if err != nil {
			return nil, err
		}
		if identity != row.Source {
			return nil, errors.New("图层原文件已变化，请从当前图层重新创建合成")
		}
		layer := input.Request.Recipe.Compose.Layers[index]
		if !layer.Shown() || layer.Alpha() == 0 {
			return nil, nil
		}
		return imageops.Decode(ctx, data, row.Source)
	})
}

func imageOperationLayerGroupUpdate(task model.Task, input imageOperationInput, output imageOperationStoredOutput, source map[string]any, resource model.Resource) ([]canvas.CanvasOperation, error) {
	metadata, _ := source["metadata"].(map[string]any)
	if input.Request.Recipe.Compose == nil || input.Request.SourceGroupSHA256 == "" || resource.ID != output.ResourceID {
		return nil, BadAuthRequest("图层组采用缺少固定来源")
	}
	patchValues := map[string]any{
		"metadata.content": resourceFileURL(output.ResourceID), "metadata.storageKey": "resource:" + output.ResourceID,
		"metadata.assetId": output.AssetID, "metadata.assetVersionId": output.AssetVersionID,
		"metadata.naturalWidth": output.Width, "metadata.naturalHeight": output.Height, "metadata.mimeType": "image/png", "metadata.bytes": resource.Size,
		"metadata.imageOperationTaskId": task.ID, "metadata.imageOperationOutputIndex": 0,
		"metadata.imageLayerGroup.compositeStatus": "ready", "metadata.imageLayerGroup.compositeError": nil,
		"metadata.imageLayerGroup.compositeSignature": input.Request.ClientCompositeSignature,
		"metadata.imageLayerGroup.nativeComposition":  map[string]any{"version": 1, "taskId": task.ID, "resourceId": output.ResourceID, "sourceGroupSha256": input.Request.SourceGroupSHA256, "requestSha256": input.RequestSHA256, "layoutSha256": cutSignature(input.Request.Recipe.Compose)},
	}
	group, _ := metadata["imageLayerGroup"].(map[string]any)
	patch, before := map[string]json.RawMessage{}, map[string]json.RawMessage{}
	for path, value := range patchValues {
		raw, err := json.Marshal(value)
		if err != nil {
			return nil, err
		}
		patch[path] = raw
		field := strings.TrimPrefix(path, "metadata.")
		var prior any
		if strings.HasPrefix(field, "imageLayerGroup.") {
			prior = group[strings.TrimPrefix(field, "imageLayerGroup.")]
		} else {
			prior = metadata[field]
		}
		raw, err = json.Marshal(prior)
		if err != nil {
			return nil, err
		}
		before[path] = raw
	}
	return []canvas.CanvasOperation{{Type: "patch_node", ID: input.Request.SourceNodeID, Patch: patch, Before: before}}, nil
}
