package app

import (
	"context"
	"encoding/json"
	"errors"
	"gorm.io/gorm"
	"strings"
	"yingce/backend/internal/canvas"
	"yingce/backend/internal/imageops"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

type ImageLayerMaterialsRequest struct {
	RequestID         string `json:"requestId"`
	SourceGroupSHA256 string `json:"sourceGroupSha256"`
}
type ImageLayerMaterialsResult struct {
	CanvasID          string   `json:"canvasId"`
	NodeID            string   `json:"nodeId"`
	TaskID            string   `json:"taskId,omitempty"`
	NodeIDs           []string `json:"nodeIds"`
	EmptyLayerIDs     []string `json:"emptyLayerIds"`
	Revision          int64    `json:"revision"`
	SourceGroupSHA256 string   `json:"sourceGroupSha256"`
	RequestSHA256     string   `json:"requestSha256"`
	Replayed          bool     `json:"replayed"`
}

func readImageMaterialsReceipt(repo *repository.Repository, userID, canvasID, mutationID, intent string) (*ImageLayerMaterialsResult, error) {
	receipt, err := repo.CanvasMutationReceiptForUser(userID, canvasID, mutationID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var envelope struct {
		Result *ImageLayerMaterialsResult `json:"imageLayerMaterials"`
	}
	if json.Unmarshal([]byte(receipt.ResultJSON), &envelope) != nil || envelope.Result == nil || envelope.Result.RequestSHA256 != intent {
		return nil, &AppError{Status: 409, Code: 409, Reason: "image_operation_conflict", Message: "另存编号已用于其他来源，请重新确认"}
	}
	envelope.Result.Replayed = true
	return envelope.Result, nil
}

// The queued batch and its source marker commit with the same canvas receipt.
// Reconciliation publishes the whole batch even when every browser is closed.
func (s *Service) CreateImageLayerMaterials(ctx context.Context, userID, canvasID, nodeID string, req ImageLayerMaterialsRequest) (ImageLayerMaterialsResult, error) {
	var result ImageLayerMaterialsResult
	req.RequestID = strings.TrimSpace(req.RequestID)
	if len(req.RequestID) < 16 || len(req.RequestID) > 128 || len(req.SourceGroupSHA256) != 64 || !validExpectedImageSourceHash(req.SourceGroupSHA256) {
		return result, BadAuthRequest("独立素材需要明确的操作编号与当前图层来源")
	}
	if _, err := s.mediaTaskProject(&model.Task{UserID: userID, ProjectID: canvasID}); err != nil {
		return result, err
	}
	user, err := s.repo.User(userID)
	if err != nil {
		return result, err
	}
	if user.Status != model.UserStatusActive {
		return result, Forbidden("当前账号不能另存素材")
	}
	intent := cutSignature(req)
	mutationID := "image-layer-materials-create:" + imageOperationID(userID, canvasID, nodeID, req.RequestID)
	if previous, err := readImageMaterialsReceipt(s.repo, userID, canvasID, mutationID, intent); err != nil || previous != nil {
		if previous != nil {
			return *previous, err
		}
		return result, err
	}
	if s.IsDraining() {
		return result, NewAppError(503, "服务正在维护，请稍后另存")
	}
	group, err := s.requireImageMaterialSource(userID, canvasID, nodeID, req.SourceGroupSHA256)
	if err != nil {
		return result, err
	}
	rows, trims, err := s.inspectImageLayerMaterials(ctx, userID, group)
	if err != nil {
		return result, err
	}
	available := 0
	empty := []string{}
	for _, row := range rows {
		if row.Empty {
			empty = append(empty, row.ID)
		} else {
			available++
		}
	}
	if available == 0 {
		return result, BadAuthRequest("前景图层全部透明，没有可另存的内容；原图保持不变")
	}
	if err := ctx.Err(); err != nil {
		return result, err
	}
	request := ImageOperationCreateRequest{RequestID: "image-layer-materials:" + imageOperationID(userID, canvasID, nodeID, req.RequestID), ProjectID: canvasID, SourceNodeID: nodeID, ResourceID: group.ResourceID, ExpectedSourceSHA256: group.Source.SHA256, Recipe: imageops.Recipe{Operation: "trim-layers", TrimLayers: trims}}
	input := imageOperationInput{Version: 1, Request: request, RequestSHA256: imageOperationRequestHash(request), Source: group.Source, SourceStorageKey: "resource:" + group.ResourceID, TrimGroup: &group, Materials: rows}
	if len(trims) > 0 {
		input.Pieces, err = imageops.Plan(group.Source.Width, group.Source.Height, request.Recipe)
		if err != nil {
			return result, err
		}
		if err := validateImageMaterialSnapshots(input); err != nil {
			return result, err
		}
	}
	task := imageOperationTask(userID, input)
	policy, err := s.RuntimePolicy()
	if err != nil {
		return result, err
	}
	s.storageMu.Lock()
	err = s.repo.Transaction(func(repo *repository.Repository) error {
		if err := repo.LockCanvasMutation(userID, canvasID); err != nil {
			return err
		}
		if previous, err := readImageMaterialsReceipt(repo, userID, canvasID, mutationID, intent); err != nil || previous != nil {
			if previous != nil {
				result = *previous
			}
			return err
		}
		writer := &Service{repo: repo, dataDir: s.dataDir}
		if _, err := writer.mediaTaskProject(&task); err != nil {
			return err
		}
		active, err := repo.User(userID)
		if err != nil {
			return err
		}
		if active.Status != model.UserStatusActive {
			return Forbidden("当前账号不能另存素材")
		}
		current, err := writer.requireImageMaterialSource(userID, canvasID, nodeID, req.SourceGroupSHA256)
		if err != nil {
			return err
		}
		if !sameImageMaterialReferences(current, group) {
			return imageMaterialSourceChanged()
		}
		project, err := repo.CanvasProjectForUser(userID, canvasID)
		if err != nil {
			return err
		}
		var doc struct {
			Nodes       []map[string]any `json:"nodes"`
			Connections []map[string]any `json:"connections"`
		}
		if json.Unmarshal([]byte(project.PayloadJSON), &doc) != nil {
			return BadAuthRequest("无法读取原画布")
		}
		var root map[string]any
		for _, node := range doc.Nodes {
			if node["id"] == nodeID {
				root = node
				break
			}
		}
		if root == nil || !imageMaterialRolesUnchanged(doc.Nodes, rows) {
			return imageMaterialSourceChanged()
		}
		meta, _ := root["metadata"].(map[string]any)
		marker, _ := meta["imageLayerMaterials"].(map[string]any)
		if marker["sourceGroupSha256"] == group.SnapshotSHA256 && len(trims) == 0 {
			oldID, _ := marker["creationMutationId"].(string)
			oldIntent, _ := marker["creationIntentSha256"].(string)
			if oldID != "" && oldIntent != "" {
				old, err := readImageMaterialsReceipt(repo, userID, canvasID, oldID, oldIntent)
				if err != nil {
					return err
				}
				if old != nil && old.TaskID == "" && old.SourceGroupSHA256 == group.SnapshotSHA256 && imageMaterialNodesMatch(old.NodeIDs, doc.Nodes, rows, nil) {
					result = *old
					result.Replayed = true
					return nil
				}
			}
		}
		if previousTaskID, ok := marker["taskId"].(string); ok && previousTaskID != "" && marker["sourceGroupSha256"] == group.SnapshotSHA256 {
			previous, readErr := repo.TaskForUser(userID, previousTaskID)
			if readErr != nil && !errors.Is(readErr, gorm.ErrRecordNotFound) {
				return readErr
			}
			if previous != nil && (previous.Status == model.TaskStatusQueued || previous.Status == model.TaskStatusRunning || previous.Status == model.TaskStatusSucceeded && previous.ImageLayerDeliveryStatus == "pending") {
				frozen, err := decodeImageOperationInput(previous)
				if err != nil {
					return err
				}
				if imageMaterialTask(frozen) && frozen.TrimGroup.SnapshotSHA256 == group.SnapshotSHA256 && previous.ProjectID == canvasID && frozen.Request.SourceNodeID == nodeID {
					result = ImageLayerMaterialsResult{CanvasID: canvasID, NodeID: nodeID, TaskID: previous.ID, NodeIDs: []string{}, EmptyLayerIDs: empty, Revision: project.Revision, SourceGroupSHA256: group.SnapshotSHA256, RequestSHA256: intent, Replayed: true}
					return nil
				}
			}
			if previous != nil && previous.Status == model.TaskStatusSucceeded && previous.ImageLayerDeliveryStatus == "applied" {
				frozen, err := decodeImageOperationInput(previous)
				if err != nil {
					return err
				}
				if imageMaterialTask(frozen) && frozen.TrimGroup.SnapshotSHA256 == group.SnapshotSHA256 && previous.ProjectID == canvasID && frozen.Request.SourceNodeID == nodeID {
					var output struct {
						Images []imageOperationStoredOutput `json:"images"`
					}
					if json.Unmarshal([]byte(previous.ResultJSON), &output) != nil || len(output.Images) != len(frozen.Pieces) {
						return BadAuthRequest("已有素材输出记录不完整")
					}
					for i, item := range output.Images {
						if err := validateImageOperationApplyOutput(repo, *previous, frozen, i, item); err != nil {
							return err
						}
					}
					_, added, existing, err := imageMaterialCanvasAdditions(repo, *previous, frozen, output.Images, root, doc.Nodes, doc.Connections)
					if err != nil {
						return err
					}
					if len(added) == 0 && len(existing) == available {
						result = ImageLayerMaterialsResult{CanvasID: canvasID, NodeID: nodeID, TaskID: previous.ID, NodeIDs: existing, EmptyLayerIDs: empty, Revision: project.Revision, SourceGroupSHA256: group.SnapshotSHA256, RequestSHA256: intent, Replayed: true}
						return nil
					}
				}
			}
		}
		patch, err := imageMaterialMarkerPatch(root, map[string]any{"auto": false, "status": "loading", "taskId": task.ID, "sourceGroupSha256": group.SnapshotSHA256, "emptyLayerIds": empty})
		if err != nil {
			return err
		}
		operations := []canvas.CanvasOperation{patch}
		result = ImageLayerMaterialsResult{CanvasID: canvasID, NodeID: nodeID, NodeIDs: []string{}, EmptyLayerIDs: empty, SourceGroupSHA256: group.SnapshotSHA256, RequestSHA256: intent}
		if len(trims) > 0 {
			if err := requireStoredFileCapacityRepository(repo, userID, model.TaskTypeImageOperation, policy, s.pendingStorage[userID]); err != nil {
				return err
			}
			if err := createTaskWithStorageQuotaRepository(repo, &task, nil, policy); err != nil {
				return err
			}
			result.TaskID = task.ID
		} else {
			// No raster work is queued: unchanged files are reused directly.
			provisional := map[string]any{}
			for k, v := range root {
				provisional[k] = v
			}
			provisionalMeta := map[string]any{}
			for k, v := range meta {
				provisionalMeta[k] = v
			}
			provisionalMeta["imageLayerMaterials"] = map[string]any{"taskId": task.ID}
			provisional["metadata"] = provisionalMeta
			created, added, existing, err := imageMaterialCanvasAdditions(repo, task, input, nil, provisional, doc.Nodes, doc.Connections)
			if err != nil {
				return err
			}
			operations = created
			// The final CAS compares with the real document, not the provisional
			// marker used to share the native material-node builder.
			final := map[string]any{"auto": false, "status": "ready", "groupId": added[0], "nodeIds": append(added, existing...), "sourceGroupSha256": group.SnapshotSHA256, "emptyLayerIds": empty, "creationMutationId": mutationID, "creationIntentSha256": intent}
			operations[len(operations)-1], err = imageMaterialMarkerPatch(root, final)
			if err != nil {
				return err
			}
			result.NodeIDs = append(added, existing...)
		}
		base := project.Revision
		summary, err := writer.canvasDomain().ApplyUserCanvasOperations(userID, canvasID, canvas.CanvasOperationsRequest{MutationID: mutationID, BaseRevision: &base, Operations: operations})
		if err != nil {
			return err
		}
		result.Revision = summary.Revision
		receipt, err := repo.CanvasMutationReceiptForUser(userID, canvasID, mutationID)
		if err != nil {
			return err
		}
		var envelope map[string]json.RawMessage
		if err := json.Unmarshal([]byte(receipt.ResultJSON), &envelope); err != nil {
			return err
		}
		raw, err := json.Marshal(result)
		if err != nil {
			return err
		}
		envelope["imageLayerMaterials"] = raw
		raw, err = json.Marshal(envelope)
		if err != nil {
			return err
		}
		if err := writer.validateProductionDocumentStorage(userID, int64(len(raw)-len(receipt.ResultJSON))); err != nil {
			return err
		}
		receipt.ResultJSON = string(raw)
		return repo.FinalizeCanvasMutationReceipt(receipt)
	})
	s.storageMu.Unlock()
	if err == nil && result.TaskID != "" {
		s.wakeTaskDispatcher()
	}
	return result, err
}
