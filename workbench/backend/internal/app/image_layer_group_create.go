package app

import (
	"encoding/json"
	"errors"
	"gorm.io/gorm"
	"math"
	"strings"
	"yingce/backend/internal/canvas"
	"yingce/backend/internal/imageops"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

type ImageLayerGroupCreateRequest struct {
	RequestID string                        `json:"requestId"`
	Title     string                        `json:"title,omitempty"`
	Width     int                           `json:"width,omitempty"`
	Height    int                           `json:"height,omitempty"`
	Sources   []ImageLayerGroupCreateSource `json:"sources"`
}
type ImageLayerGroupCreateSource struct {
	NodeID     string `json:"nodeId"`
	ResourceID string `json:"resourceId"`
}
type ImageLayerGroupCreateResult struct {
	CanvasID      string `json:"canvasId"`
	NodeID        string `json:"nodeId"`
	TaskID        string `json:"taskId"`
	Revision      int64  `json:"revision"`
	RequestSHA256 string `json:"requestSha256"`
	Replayed      bool   `json:"replayed"`
}

// Group creation and its first CPU task commit together. Closing the browser
// after acknowledgement cannot leave an unqueued preview masquerading as output.
func (s *Service) CreateImageLayerGroup(userID, canvasID string, req ImageLayerGroupCreateRequest) (ImageLayerGroupCreateResult, error) {
	return s.createImageLayerGroup(userID, canvasID, req, nil)
}

// Only the durable task delivery transaction may replace its own placeholder.
// This capability is deliberately absent from the public request/JSON contract.
type nativeLayerGroupTarget struct {
	NodeID       string
	SourceTaskID string
	ResultSHA256 string
}

func (s *Service) createImageLayerGroup(userID, canvasID string, req ImageLayerGroupCreateRequest, target *nativeLayerGroupTarget) (ImageLayerGroupCreateResult, error) {
	var result ImageLayerGroupCreateResult
	if strings.TrimSpace(userID) == "" {
		return result, Unauthorized("请先登录")
	}
	req.RequestID = strings.TrimSpace(req.RequestID)
	req.Title = strings.TrimSpace(req.Title)
	if len(req.RequestID) < 16 || len(req.RequestID) > 128 || len(req.Title) > 240 || len(req.Sources) < 1 || len(req.Sources) > imageops.MaxCompositionLayers {
		return result, BadAuthRequest("请选择1至32张已保存图片，操作编号或名称无效")
	}
	seen := map[string]bool{}
	for _, src := range req.Sources {
		if src.NodeID == "" || len(src.NodeID) > 128 || src.ResourceID == "" || len(src.ResourceID) > 80 || seen[src.NodeID] {
			return result, BadAuthRequest("图层须引用不重复的明确图片节点")
		}
		seen[src.NodeID] = true
	}
	intent := cutSignature(req)
	mutationID := "image-layer-group-create:" + imageOperationID(userID, canvasID, req.RequestID)
	if target != nil {
		intent = cutSignature([]any{req, target})
		mutationID = "native-layer-delivery:" + imageOperationID(userID, canvasID, req.RequestID)
	}
	policy, err := s.RuntimePolicy()
	if err != nil {
		return result, err
	}
	mutate := func(repo *repository.Repository) error {
		if err := repo.LockCanvasMutation(userID, canvasID); err != nil {
			return err
		}
		receipt, err := repo.CanvasMutationReceiptForUser(userID, canvasID, mutationID)
		if err == nil {
			var envelope struct {
				Group *ImageLayerGroupCreateResult `json:"imageLayerGroupCreate"`
			}
			if json.Unmarshal([]byte(receipt.ResultJSON), &envelope) != nil || envelope.Group == nil || envelope.Group.RequestSHA256 != intent {
				return &AppError{Status: 409, Code: 409, Reason: "image_operation_conflict", Message: "这个操作编号已用于其他图层，请重新确认"}
			}
			result = *envelope.Group
			result.Replayed = true
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if s.IsDraining() {
			return NewAppError(503, "服务正在维护，请稍后合成")
		}
		writer := &Service{repo: repo, dataDir: s.dataDir}
		if _, err := writer.mediaTaskProject(&model.Task{UserID: userID, ProjectID: canvasID}); err != nil {
			return err
		}
		user, err := repo.User(userID)
		if err != nil {
			return err
		}
		if user.Status != model.UserStatusActive {
			return Forbidden("当前账号不能合成图层")
		}
		if err := requireStoredFileCapacityRepository(repo, userID, model.TaskTypeImageOperation, policy, s.pendingStorage[userID]); err != nil {
			return err
		}
		project, err := repo.CanvasProjectForUser(userID, canvasID)
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return NotFound("画布不存在或无权访问")
		}
		if err != nil {
			return err
		}
		var doc struct {
			Nodes []map[string]any `json:"nodes"`
		}
		if json.Unmarshal([]byte(project.PayloadJSON), &doc) != nil {
			return BadAuthRequest("无法读取画布")
		}
		byID := map[string]map[string]any{}
		for _, node := range doc.Nodes {
			id, _ := node["id"].(string)
			byID[id] = node
		}
		layers := []any{}
		for _, src := range req.Sources {
			node := byID[src.NodeID]
			meta, _ := node["metadata"].(map[string]any)
			if node["type"] != "image" || meta["storageKey"] != "resource:"+src.ResourceID {
				return &AppError{Status: 409, Code: 409, Reason: "image_operation_source_changed", Message: "选择的图片已变化，请重新选择当前图片"}
			}
			if _, ok := meta["imageLayerGroup"]; ok {
				if err := writer.requireReadyImageLayerGroup(userID, canvasID, src.NodeID); err != nil {
					return err
				}
			}
			layers = append(layers, map[string]any{"nodeId": src.NodeID, "x": 0, "y": 0, "visible": true, "opacity": 1})
		}
		source := byID[req.Sources[0].NodeID]
		sourceMeta, _ := source["metadata"].(map[string]any)
		data, err := writer.readImageOperationSource(userID, req.Sources[0].ResourceID)
		if err != nil {
			return err
		}
		raster, err := imageops.Inspect(data)
		if err != nil {
			return BadAuthRequest(err.Error())
		}
		width, height := req.Width, req.Height
		if width == 0 && height == 0 {
			width, height = raster.Width, raster.Height
		}
		composition := imageops.Composition{Width: width, Height: height}
		for _, src := range req.Sources {
			opacity, visible := 1.0, true
			composition.Layers = append(composition.Layers, imageops.CompositionLayer{ID: src.NodeID, ResourceID: src.ResourceID, Visible: &visible, Opacity: &opacity})
		}
		if err := imageops.ValidateComposition(width, height, composition); err != nil {
			return BadAuthRequest(err.Error())
		}
		nodeID := "image-layer-group:" + imageOperationID(userID, canvasID, req.RequestID)
		if target != nil {
			nodeID = target.NodeID
			root := byID[nodeID]
			rootMeta, _ := root["metadata"].(map[string]any)
			origin, err := repo.TaskForUser(userID, target.SourceTaskID)
			if err != nil {
				return err
			}
			if root["type"] != "image" || rootMeta["taskId"] != target.SourceTaskID || rootMeta["imageLayerGroup"] != nil || origin.Status != model.TaskStatusSucceeded || origin.Type != "canvas_image" || origin.ProjectID != canvasID || cutSignature(origin.ResultJSON) != target.ResultSHA256 || !isDedicatedLayerTask(origin) {
				return creationConflict("拆层目标或原任务结果已变化，原图层结果仍保留在素材库")
			}
		} else if byID[nodeID] != nil {
			return &AppError{Status: 409, Code: 409, Reason: "image_operation_conflict", Message: "目标节点已存在，请核对画布"}
		}
		position, _ := source["position"].(map[string]any)
		x, _ := position["x"].(float64)
		y, _ := position["y"].(float64)
		displayWidth, _ := source["width"].(float64)
		if displayWidth <= 0 || math.IsNaN(x+y+displayWidth) || math.IsInf(x+y+displayWidth, 0) {
			return BadAuthRequest("源节点的画布位置或尺寸无效")
		}
		displayHeight := displayWidth * float64(height) / float64(width)
		place := availableCanvasResultPosition(doc.Nodes, canvasResultRectangle{x: x + displayWidth + 96, y: y, width: displayWidth, height: displayHeight})
		sigLayers := []any{}
		for _, layer := range composition.Layers {
			sigLayers = append(sigLayers, []any{layer.ID, layer.X, layer.Y, layer.Shown(), layer.Alpha(), "resource:" + layer.ResourceID})
		}
		signature, err := json.Marshal([]any{width, height, sigLayers})
		if err != nil {
			return err
		}
		taskRequestID := "image-layer-group-create:" + imageOperationID(userID, canvasID, req.RequestID)
		taskID := imageOperationID("image-operation-v1", userID, taskRequestID)
		meta := map[string]any{"status": "success", "manualSize": true, "imageLayerGroup": map[string]any{"width": width, "height": height, "layers": layers, "compositeStatus": "updating", "compositeIntentId": req.RequestID, "pendingTaskId": taskID, "pendingSignature": string(signature)}}
		for _, key := range []string{"content", "storageKey", "assetId", "assetVersionId", "mimeType", "bytes", "naturalWidth", "naturalHeight"} {
			if value, ok := sourceMeta[key]; ok {
				meta[key] = value
			}
		}
		title := req.Title
		if title == "" {
			title = "图片图层合成"
		}
		raw, err := json.Marshal(map[string]any{"id": nodeID, "type": "image", "title": title, "position": map[string]float64{"x": place.x, "y": place.y}, "width": displayWidth, "height": displayHeight, "metadata": meta})
		if err != nil {
			return err
		}
		base := project.Revision
		operation := canvas.CanvasOperation{Type: "create_node", ID: nodeID, Node: raw}
		if target != nil {
			delete(meta, "manualSize") // preserve the user's size preference and geometry
			meta["nativeLayerDecomposition"] = map[string]any{"sourceTaskId": target.SourceTaskID, "resultSha256": target.ResultSHA256, "compositeTaskId": taskID}
			meta["generationOutputCount"] = len(req.Sources)
			meta["isBatchRoot"] = true
			ids := []string{}
			for _, src := range req.Sources {
				ids = append(ids, src.NodeID)
			}
			meta["batchChildIds"] = ids
			meta["primaryImageId"], meta["errorDetails"] = nil, nil
			operation, err = imageLayerWorkflowMetadataPatch(byID[nodeID], meta)
			if err != nil {
				return err
			}
		}
		summary, err := writer.canvasDomain().ApplyUserCanvasOperations(userID, canvasID, canvas.CanvasOperationsRequest{MutationID: mutationID, BaseRevision: &base, Operations: []canvas.CanvasOperation{operation}, TrustedServerMutation: target != nil})
		if err != nil {
			return err
		}
		snapshot, err := writer.ReadImageLayerGroupSource(userID, canvasID, nodeID)
		if err != nil {
			return err
		}
		input, err := writer.prepareImageOperationInput(userID, ImageOperationCreateRequest{RequestID: taskRequestID, ProjectID: canvasID, SourceNodeID: nodeID, ResourceID: snapshot.ResourceID, Recipe: imageops.Recipe{Operation: "compose", Compose: &snapshot.Composition}, SourceGroupSHA256: snapshot.SnapshotSHA256, ClientCompositeSignature: string(signature)})
		if err != nil {
			return err
		}
		task := imageOperationTask(userID, input)
		if err := createTaskWithStorageQuotaRepository(repo, &task, nil, policy); err != nil {
			if errors.Is(err, repository.ErrActiveTaskLimit) {
				return BadAuthRequest("任务队列已满，请等待任务完成后再创建图层组")
			}
			return err
		}
		result = ImageLayerGroupCreateResult{CanvasID: canvasID, NodeID: nodeID, TaskID: task.ID, Revision: summary.Revision, RequestSHA256: intent}
		receipt, err = repo.CanvasMutationReceiptForUser(userID, canvasID, mutationID)
		if err != nil {
			return err
		}
		var envelope map[string]json.RawMessage
		if err := json.Unmarshal([]byte(receipt.ResultJSON), &envelope); err != nil {
			return err
		}
		raw, err = json.Marshal(result)
		if err != nil {
			return err
		}
		envelope["imageLayerGroupCreate"] = raw
		raw, err = json.Marshal(envelope)
		if err != nil {
			return err
		}
		if err := writer.validateProductionDocumentStorage(userID, int64(len(raw)-len(receipt.ResultJSON))); err != nil {
			return err
		}
		receipt.ResultJSON = string(raw)
		return repo.FinalizeCanvasMutationReceipt(receipt)
	}
	if target != nil {
		// The caller owns the storage mutex and the outer delivery transaction.
		err = mutate(s.repo)
	} else {
		s.storageMu.Lock()
		err = s.repo.Transaction(mutate)
		s.storageMu.Unlock()
	}
	if target == nil && err == nil && !result.Replayed {
		s.wakeTaskDispatcher()
	}
	return result, err
}

// Server-side readiness uses a fixed native task and its actual output. Client
// cache flags alone cannot authorize using an obsolete preview in production.
func (s *Service) requireReadyImageLayerGroup(userID, canvasID, nodeID string) error {
	return s.requireReadyImageLayerNodes(userID, canvasID, []string{nodeID}, true)
}

func (s *Service) requireReadyImageLayerNodes(userID, canvasID string, nodeIDs []string, required bool) error {
	project, err := s.repo.CanvasProjectForUser(userID, canvasID)
	if err != nil {
		return err
	}
	var doc struct {
		Nodes []map[string]any `json:"nodes"`
	}
	if json.Unmarshal([]byte(project.PayloadJSON), &doc) != nil {
		return BadAuthRequest("无法读取图层画布")
	}
	byID := map[string]map[string]any{}
	for _, node := range doc.Nodes {
		id, _ := node["id"].(string)
		byID[id] = node
	}
	visited, visiting := map[string]bool{}, map[string]bool{}
	var check func(string, int) error
	check = func(nodeID string, depth int) error {
		if depth > 16 || len(visited) > 512 || visiting[nodeID] {
			return BadAuthRequest("图层嵌套过深或形成循环")
		}
		if visited[nodeID] {
			return nil
		}
		node := byID[nodeID]
		if node == nil {
			return NotFound("图层节点已删除")
		}
		meta, _ := node["metadata"].(map[string]any)
		group, _ := meta["imageLayerGroup"].(map[string]any)
		if group == nil {
			if required && depth == 0 {
				return BadAuthRequest("请选择原生图层组")
			}
			visited[nodeID] = true
			return nil
		}
		visiting[nodeID] = true
		refs, err := imageLayerGroupReferencesInDocument(canvasID, nodeID, project.Revision, byID)
		if err != nil {
			return err
		}
		for _, layer := range refs.Composition.Layers {
			if err := check(layer.ID, depth+1); err != nil {
				return err
			}
		}
		native, _ := group["nativeComposition"].(map[string]any)
		taskID, _ := native["taskId"].(string)
		if taskID == "" || native["resourceId"] != refs.ResourceID || native["layoutSha256"] != cutSignature(refs.Composition) {
			return &AppError{Status: 409, Code: 409, Reason: "image_layer_group_pending", Message: "请先等待图层组完成合成，再使用这张图片"}
		}
		task, err := s.repo.TaskForUser(userID, taskID)
		if err != nil {
			return err
		}
		input, err := decodeImageOperationInput(task)
		if err != nil {
			return BadAuthRequest("图层合成来源记录无效")
		}
		if task.Status != model.TaskStatusSucceeded || input.Request.SourceNodeID != nodeID || input.Request.ProjectID != canvasID || input.RequestSHA256 != native["requestSha256"] || input.Request.SourceGroupSHA256 != native["sourceGroupSha256"] {
			return BadAuthRequest("图层合成任务与当前图片不一致")
		}
		var output struct {
			Images []imageOperationStoredOutput `json:"images"`
		}
		if json.Unmarshal([]byte(task.ResultJSON), &output) != nil || len(output.Images) != 1 || output.Images[0].ResourceID != refs.ResourceID {
			return BadAuthRequest("图层合成版本缺少准确的图片输出")
		}
		if err := validateImageOperationApplyOutput(s.repo, *task, input, 0, output.Images[0]); err != nil {
			return err
		}
		delete(visiting, nodeID)
		visited[nodeID] = true
		return nil
	}
	for _, nodeID := range nodeIDs {
		if err := check(nodeID, 0); err != nil {
			return err
		}
	}
	return nil
}
