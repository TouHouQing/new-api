package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"reflect"
	"strings"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/canvas"
	"yingce/backend/internal/imageops"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

type ImageOperationApplyRequest struct {
	RequestID  string                  `json:"requestId"`
	EditProofs []model.CanvasEditProof `json:"editProofs,omitempty"`
}

type ImageOperationApplyResult struct {
	TaskID          string   `json:"taskId"`
	CanvasID        string   `json:"canvasId"`
	RequestSHA256   string   `json:"requestSha256"`
	AddedNodeIDs    []string `json:"addedNodeIds"`
	ExistingNodeIDs []string `json:"existingNodeIds"`
	UpdatedNodeIDs  []string `json:"updatedNodeIds,omitempty"`
	Revision        int64    `json:"revision"`
	Replayed        bool     `json:"replayed"`
}

type imageOperationStoredOutput struct {
	ResourceID     string         `json:"resourceId"`
	AssetID        string         `json:"assetId"`
	AssetVersionID string         `json:"assetVersionId"`
	Width          int            `json:"width"`
	Height         int            `json:"height"`
	Piece          imageops.Piece `json:"piece"`
}

// ApplyImageOperationTask is a headless counterpart of adopting the same task
// in the editor. It delegates mutations, quota checks, history and receipts to
// the native canvas domain; it never recreates resources or asset versions.
func (s *Service) ApplyImageOperationTask(userID, taskID string, req ImageOperationApplyRequest) (ImageOperationApplyResult, error) {
	var result ImageOperationApplyResult
	if strings.TrimSpace(userID) == "" {
		return result, Unauthorized("请先登录")
	}
	req.RequestID = strings.TrimSpace(req.RequestID)
	if len(req.RequestID) < 16 || len(req.RequestID) > 128 {
		return result, BadAuthRequest("采用操作编号须为16到128字节")
	}
	task, err := s.repo.TaskForUser(userID, taskID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return result, NotFound("处理任务不存在")
	}
	if err != nil {
		return result, err
	}
	if task.Type != model.TaskTypeImageOperation || task.Status != model.TaskStatusSucceeded {
		return result, BadAuthRequest("请先等待本地图片处理完成")
	}
	input, err := decodeImageOperationInput(task)
	if err != nil {
		return result, BadAuthRequest("图片任务缺少有效的来源快照")
	}
	if task.ProjectID == "" || input.Request.SourceNodeID == "" || input.Request.ProjectID != task.ProjectID {
		return result, BadAuthRequest("处理任务未绑定原画布，请从素材库选用结果")
	}
	intentSHA := imageOperationID("image-operation-apply-v1", userID, task.ID, req.RequestID)
	mutationID := "image-operation-apply:" + task.ID + ":" + intentSHA
	bound := input.Request.SourceGroupSHA256 != "" || imageMaterialTask(input)
	if bound {
		// One fixed composition has one delivery effect across browser, worker
		// and MCP callers. Replaying it never reapplies after a later undo.
		intentSHA = imageOperationID("image-operation-layer-group-apply-v1", userID, task.ID)
		mutationID = "image-operation-layer-group:" + task.ID
	}
	var groupSnapshot ImageLayerGroupSource
	var groupSourceErr error
	if bound {
		groupSnapshot, groupSourceErr = s.ReadImageLayerGroupSource(userID, task.ProjectID, input.Request.SourceNodeID)
		expected := input.Request.SourceGroupSHA256
		if input.TrimGroup != nil {
			expected = input.TrimGroup.SnapshotSHA256
		}
		if groupSourceErr == nil && groupSnapshot.SnapshotSHA256 != expected {
			groupSourceErr = &AppError{Status: 409, Code: 409, Reason: "image_operation_source_changed", Message: "图层或原文件已经变化，合成结果保留为独立素材，未覆盖当前图层组"}
		}
	}
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	err = s.repo.Transaction(func(repo *repository.Repository) error {
		if err := repo.LockCanvasMutation(userID, task.ProjectID); err != nil {
			return err
		}
		receipt, err := repo.CanvasMutationReceiptForUser(userID, task.ProjectID, mutationID)
		if err == nil {
			var envelope struct {
				ImageOperationApply *ImageOperationApplyResult `json:"imageOperationApply"`
			}
			if json.Unmarshal([]byte(receipt.ResultJSON), &envelope) != nil || envelope.ImageOperationApply == nil || envelope.ImageOperationApply.TaskID != task.ID || envelope.ImageOperationApply.RequestSHA256 != intentSHA {
				return &AppError{Status: 409, Code: 409, Reason: "image_operation_apply_conflict", Message: "采用编号对应的记录不一致，请重新确认"}
			}
			result = *envelope.ImageOperationApply
			result.Replayed = true
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		writer := &Service{repo: repo, dataDir: s.dataDir}
		if _, err := writer.mediaTaskProject(task); err != nil {
			return err
		}
		project, err := repo.CanvasProjectForUser(userID, task.ProjectID)
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return NotFound("原画布已删除")
		}
		if err != nil {
			return err
		}
		var document struct {
			Nodes       []map[string]any `json:"nodes"`
			Connections []map[string]any `json:"connections"`
		}
		if json.Unmarshal([]byte(project.PayloadJSON), &document) != nil {
			return BadAuthRequest("无法读取原画布")
		}
		var source map[string]any
		for _, node := range document.Nodes {
			if node["id"] == input.Request.SourceNodeID {
				source = node
				break
			}
		}
		metadata, _ := source["metadata"].(map[string]any)
		if source == nil || source["type"] != "image" || metadata["storageKey"] != input.SourceStorageKey {
			return &AppError{Status: 409, Code: 409, Reason: "image_operation_source_changed", Message: "源节点已换图或删除，处理结果仍保留在素材库"}
		}
		var output struct {
			Images []imageOperationStoredOutput `json:"images"`
		}
		if json.Unmarshal([]byte(task.ResultJSON), &output) != nil || len(output.Images) != len(input.Pieces) {
			return BadAuthRequest("处理结果数量与来源快照不一致")
		}
		for index, item := range output.Images {
			if err := validateImageOperationApplyOutput(repo, *task, input, index, item); err != nil {
				return err
			}
		}
		var operations []canvas.CanvasOperation
		var added, existing []string
		groupUpdate := bound
		if groupUpdate {
			if groupSourceErr != nil {
				return groupSourceErr
			}
			refs, refsErr := imageLayerGroupReferences(repo, userID, project.ID, input.Request.SourceNodeID)
			if refsErr != nil {
				return refsErr
			}
			if refs.ResourceID != groupSnapshot.ResourceID || !reflect.DeepEqual(refs.Composition, groupSnapshot.Composition) {
				return &AppError{Status: 409, Code: 409, Reason: "image_operation_source_changed", Message: "图层组在采用前已变化，请核对已保存的合成素材"}
			}
			if imageMaterialTask(input) {
				operations, added, existing, err = imageMaterialCanvasAdditions(repo, *task, input, output.Images, source, document.Nodes, document.Connections)
			} else {
				if len(output.Images) != 1 {
					return BadAuthRequest("图层合成须对应一张准确的原生图片")
				}
				resource, err := repo.ResourceForUser(userID, output.Images[0].ResourceID)
				if err != nil {
					return err
				}
				operations, err = imageOperationLayerGroupUpdate(*task, input, output.Images[0], source, *resource)
				if err != nil {
					return err
				}
				added, existing = []string{}, []string{input.Request.SourceNodeID}
			}
		} else {
			operations, added, existing, err = imageOperationCanvasAdditions(*task, input, output.Images, source, document.Nodes, document.Connections)
		}
		if err != nil {
			return err
		}
		result = ImageOperationApplyResult{TaskID: task.ID, CanvasID: project.ID, RequestSHA256: intentSHA, AddedNodeIDs: added, ExistingNodeIDs: existing, Revision: project.Revision}
		if groupUpdate {
			result.UpdatedNodeIDs = []string{input.Request.SourceNodeID}
		}
		if len(operations) > 0 {
			base := project.Revision
			// The outer transaction owns the main storage lock. The scoped writer
			// uses the real host's quota callbacks against this same transaction.
			summary, err := writer.canvasDomain().ApplyUserCanvasOperations(userID, project.ID, canvas.CanvasOperationsRequest{MutationID: mutationID, BaseRevision: &base, Operations: operations, EditProofs: req.EditProofs, TrustedServerMutation: !groupUpdate})
			if err != nil {
				return err
			}
			result.Revision = summary.Revision
			receipt, err = repo.CanvasMutationReceiptForUser(userID, project.ID, mutationID)
			if err != nil {
				return err
			}
		} else {
			summary := UserDataSummary{ID: project.ID, Title: project.Title, CreatedAt: project.CreatedAt, UpdatedAt: project.UpdatedAt, Revision: project.Revision}
			payload, err := json.Marshal(map[string]any{"summary": summary, "document": json.RawMessage(project.PayloadJSON)})
			if err != nil {
				return err
			}
			receipt = &model.CanvasMutationReceipt{ID: newID(), UserID: userID, CanvasID: project.ID, MutationID: mutationID, PayloadDigest: intentSHA, Revision: project.Revision, ResultJSON: string(payload), CreatedAt: time.Now()}
			created, err := repo.TryCreateCanvasMutationReceipt(receipt)
			if err != nil {
				return err
			}
			if !created {
				return repository.ErrCanvasRevisionConflict
			}
		}
		var envelope map[string]json.RawMessage
		if err := json.Unmarshal([]byte(receipt.ResultJSON), &envelope); err != nil {
			return err
		}
		encoded, err := json.Marshal(result)
		if err != nil {
			return err
		}
		envelope["imageOperationApply"] = encoded
		encoded, err = json.Marshal(envelope)
		if err != nil {
			return err
		}
		if err := writer.validateProductionDocumentStorage(userID, int64(len(encoded)-len(receipt.ResultJSON))); err != nil {
			return err
		}
		receipt.ResultJSON = string(encoded)
		if err := repo.FinalizeCanvasMutationReceipt(receipt); err != nil {
			return err
		}
		if groupUpdate {
			delivery, _ := json.Marshal(ImageLayerDelivery{CanvasID: project.ID, NodeID: input.Request.SourceNodeID, Revision: result.Revision, Status: "applied"})
			if err := writer.validateProductionDocumentStorage(userID, int64(len(delivery)+len("applied")-len(task.ImageLayerDeliveryJSON)-len(task.ImageLayerDeliveryStatus))); err != nil {
				return err
			}
			return repo.UpdateImageLayerDelivery(userID, task.ID, task.ImageLayerDeliveryStatus, "applied", string(delivery))
		}
		return nil
	})
	return result, err
}

func validateImageOperationApplyOutput(repo *repository.Repository, task model.Task, input imageOperationInput, index int, output imageOperationStoredOutput) error {
	if output.AssetID != generationMediaAssetID(task.ID, index) || output.AssetVersionID != imageOperationVersionID(task.ID, index) || output.Piece != input.Pieces[index] || output.Width != output.Piece.OutputWidth || output.Height != output.Piece.OutputHeight {
		return BadAuthRequest("处理结果缺少准确的素材版本或像素区域")
	}
	asset, err := repo.AssetForUser(task.UserID, output.AssetID)
	if err != nil {
		return NotFound("处理素材不存在或无权访问")
	}
	if asset.Status == model.AssetVersionStatusArchived {
		return BadAuthRequest("处理素材已归档，请先恢复素材")
	}
	version, err := repo.AssetVersion(output.AssetVersionID)
	if err != nil || version.AssetID != asset.ID {
		return BadAuthRequest("处理素材版本不属于该素材")
	}
	var derivation imageOperationDerivation
	sourceID, raster := imageOperationOutputSource(input, index)
	if json.Unmarshal([]byte(version.DefinitionJSON), &derivation) != nil || derivation.TaskID != task.ID || derivation.Source != raster || derivation.SourceResourceID != sourceID || derivation.OutputIndex != index || derivation.Piece != output.Piece || !reflect.DeepEqual(derivation.PatchSource, input.PatchSource) {
		return BadAuthRequest("处理素材版本的来源不一致")
	}
	resource, err := repo.ResourceForUser(task.UserID, output.ResourceID)
	if err != nil || resource.Status != model.ResourceStatusReady || resource.Kind != "image" || resource.Width != output.Width || resource.Height != output.Height {
		return BadAuthRequest("处理图片文件不可读或尺寸不一致")
	}
	representations, err := repo.AssetRepresentations(output.AssetVersionID)
	if err != nil {
		return err
	}
	for _, representation := range representations {
		if representation.TaskID == task.ID && representation.ResourceID == resource.ID && representation.MediaType == "image" {
			return nil
		}
	}
	return BadAuthRequest("处理素材版本未绑定该图片文件")
}

func imageOperationCanvasAdditions(task model.Task, input imageOperationInput, outputs []imageOperationStoredOutput, source map[string]any, nodes, connections []map[string]any) ([]canvas.CanvasOperation, []string, []string, error) {
	position, _ := source["position"].(map[string]any)
	x, xOK := position["x"].(float64)
	y, yOK := position["y"].(float64)
	width, wOK := source["width"].(float64)
	if !xOK || !yOK || !wOK || math.IsNaN(x) || math.IsNaN(y) || math.IsNaN(width) || math.IsInf(x, 0) || math.IsInf(y, 0) || math.IsInf(width, 0) || width <= 0 {
		return nil, nil, nil, BadAuthRequest("原图节点位置或尺寸无效")
	}
	rows, columns := 1, 1
	for _, output := range outputs {
		rows = max(rows, output.Piece.Row+1)
		columns = max(columns, output.Piece.Column+1)
	}
	columnWidths, rowHeights := make([]float64, columns), make([]float64, rows)
	sizes := make([][2]float64, len(outputs))
	for index, output := range outputs {
		w, h := float64(output.Width), float64(output.Height)
		limit := math.Min(720/w, 520/h)
		scale := math.Min(limit, math.Max(math.Min(1, limit), 320/math.Max(w, h)))
		sizes[index] = [2]float64{w * scale, h * scale}
		columnWidths[output.Piece.Column] = math.Max(columnWidths[output.Piece.Column], w*scale)
		rowHeights[output.Piece.Row] = math.Max(rowHeights[output.Piece.Row], h*scale)
	}
	columnX, rowY := make([]float64, columns), make([]float64, rows)
	columnX[0] = x + width + 96
	rowY[0] = y
	for i := 1; i < columns; i++ {
		columnX[i] = columnX[i-1] + columnWidths[i-1] + 48
	}
	for i := 1; i < rows; i++ {
		rowY[i] = rowY[i-1] + rowHeights[i-1] + 48
	}
	group := canvasResultRectangle{x: columnX[0], y: rowY[0], width: columnX[columns-1] + columnWidths[columns-1] - columnX[0], height: rowY[rows-1] + rowHeights[rows-1] - rowY[0]}
	if math.IsNaN(group.x+group.width) || math.IsNaN(group.y+group.height) || math.IsInf(group.x+group.width, 0) || math.IsInf(group.y+group.height, 0) {
		return nil, nil, nil, BadAuthRequest("图片结果摆放超出有效画布位置")
	}
	available := availableCanvasResultPosition(nodes, group)
	for i := range columnX {
		columnX[i] += available.x - group.x
	}
	for i := range rowY {
		rowY[i] += available.y - group.y
	}
	byID := map[string]map[string]any{}
	for _, node := range nodes {
		if id, ok := node["id"].(string); ok {
			byID[id] = node
		}
	}
	connectionIDs := map[string]bool{}
	for _, connection := range connections {
		if id, ok := connection["id"].(string); ok {
			connectionIDs[id] = true
		}
	}
	operations := []canvas.CanvasOperation{}
	added, existing := []string{}, []string{}
	sourceMetadata, _ := source["metadata"].(map[string]any)
	title, _ := source["title"].(string)
	if strings.TrimSpace(title) == "" {
		title = "图片"
	}
	for index, output := range outputs {
		nodeID := fmt.Sprintf("image-operation:%s:%d", task.ID, index)
		if previous := byID[nodeID]; previous != nil {
			meta, _ := previous["metadata"].(map[string]any)
			if previous["type"] != "image" || meta["storageKey"] != "resource:"+output.ResourceID || meta["assetId"] != output.AssetID {
				return nil, nil, nil, &AppError{Status: 409, Code: 409, Reason: "image_operation_result_changed", Message: "处理结果节点已经改变，未覆盖当前内容"}
			}
			existing = append(existing, nodeID)
			continue
		}
		label := imageOperationTitle(input.Request.Recipe.Operation)
		if len(outputs) > 1 {
			label = fmt.Sprintf("%s %d-%d", label, output.Piece.Row+1, output.Piece.Column+1)
		}
		meta := map[string]any{"content": resourceFileURL(output.ResourceID), "storageKey": "resource:" + output.ResourceID, "status": "success", "naturalWidth": output.Width, "naturalHeight": output.Height, "mimeType": "image/png", "manualSize": true, "assetId": output.AssetID, "assetVersionId": output.AssetVersionID, "imageOperationTaskId": task.ID, "imageOperationOutputIndex": index}
		if prompt, ok := sourceMetadata["prompt"].(string); ok {
			meta["prompt"] = prompt
		}
		node := map[string]any{"id": nodeID, "type": "image", "title": title + " · " + label, "position": map[string]float64{"x": columnX[output.Piece.Column], "y": rowY[output.Piece.Row]}, "width": sizes[index][0], "height": sizes[index][1], "metadata": meta}
		data, err := json.Marshal(node)
		if err != nil {
			return nil, nil, nil, err
		}
		operations = append(operations, canvas.CanvasOperation{Type: "create_node", ID: nodeID, Node: data})
		added = append(added, nodeID)
		connectionID := "image-operation-link:" + nodeID
		if connectionIDs[connectionID] {
			return nil, nil, nil, &AppError{Status: 409, Code: 409, Reason: "image_operation_result_changed", Message: "处理结果连线已被修改，请先核对画布"}
		}
		data, err = json.Marshal(map[string]any{"id": connectionID, "fromNodeId": input.Request.SourceNodeID, "toNodeId": nodeID})
		if err != nil {
			return nil, nil, nil, err
		}
		operations = append(operations, canvas.CanvasOperation{Type: "create_connection", ID: connectionID, Connection: data})
	}
	return operations, added, existing, nil
}
