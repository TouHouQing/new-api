// SPDX-License-Identifier: AGPL-3.0-or-later
package app

import (
	"encoding/json"
	"errors"
	"math"
	"unicode/utf8"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

type CanvasTaskDraft struct {
	Node            map[string]any   `json:"node"`
	Connections     []map[string]any `json:"connections"`
	RequireExisting bool             `json:"requireExisting,omitempty"`
	input           map[string]any
}

type canvasTaskDraft = CanvasTaskDraft

func canvasTaskDraftFor(task model.Task) (*canvasTaskDraft, error) {
	var input map[string]any
	if err := json.Unmarshal([]byte(task.InputJSON), &input); err != nil {
		return nil, err
	}
	metadata, _ := input["metadata"].(map[string]any)
	raw, exists := metadata["canvasTaskDraft"]
	if !exists {
		return nil, nil
	}
	encoded, err := json.Marshal(raw)
	if err != nil || len(encoded) > 64*1024 {
		return nil, BadAuthRequest("生成节点草稿过大或格式无效")
	}
	var draft canvasTaskDraft
	if err = json.Unmarshal(encoded, &draft); err != nil || draft.Node == nil || len(draft.Connections) > 32 {
		return nil, BadAuthRequest("生成节点草稿格式无效")
	}
	mode := stringValue(input["mode"])
	if (mode != "audio" && mode != "image" && mode != "video" && mode != "text") || task.Type != "canvas_"+mode || draft.Node["type"] != mode || task.ProjectID == "" || draft.Node["id"] != metadata["nodeId"] {
		return nil, BadAuthRequest("生成节点与当前任务类型或画布不一致")
	}
	if err = validateCanvasTaskDraftNode(draft.Node); err != nil {
		return nil, err
	}
	if err = validateCreationJSON(draft); err != nil {
		return nil, err
	}
	draft.input = input
	return &draft, nil
}

func validateCanvasTaskDraftNode(node map[string]any) error {
	if err := validateCloudAgentID(stringValue(node["id"]), "生成节点ID", 80); err != nil {
		return err
	}
	if utf8.RuneCountInString(stringValue(node["title"])) > 240 {
		return BadAuthRequest("生成节点标题过长")
	}
	position, _ := node["position"].(map[string]any)
	for _, value := range []any{position["x"], position["y"], node["width"], node["height"]} {
		number, ok := value.(float64)
		if !ok || math.IsNaN(number) || math.IsInf(number, 0) || math.Abs(number) > 1e8 {
			return BadAuthRequest("生成节点的位置或尺寸无效")
		}
	}
	if node["width"].(float64) <= 0 || node["height"].(float64) <= 0 {
		return BadAuthRequest("生成节点尺寸须大于零")
	}
	return nil
}

// Called in the same transaction as the task and credit reservation. The
// model cannot start before its target and original task ID are durable.
func bindCanvasTaskDraft(repo *repository.Repository, task *model.Task, draft *canvasTaskDraft, policy RuntimePolicySetting) error {
	project, err := repo.CanvasProjectForUser(task.UserID, task.ProjectID)
	if err != nil {
		return creationError(err)
	}
	doc, err := creationDocument(project.PayloadJSON)
	if err != nil {
		return err
	}
	nodes := creationMaps(doc["nodes"])
	var target map[string]any
	for _, node := range nodes {
		if node["id"] == draft.Node["id"] {
			target = node
			break
		}
	}
	provided, _ := draft.Node["metadata"].(map[string]any)
	metadata := mergeCreationMaps(nil, provided)
	if target == nil && draft.RequireExisting {
		return creationConflict("目标节点已移除，请重新选择后生成")
	}
	if target != nil {
		if target["type"] != draft.Node["type"] {
			return creationConflict("目标节点已改为其他类型，请重新选择")
		}
		previous, _ := target["metadata"].(map[string]any)
		previousTaskID := stringValue(previous["taskId"])
		if previousTaskID == task.ID {
			return nil
		}
		inputMetadata, _ := draft.input["metadata"].(map[string]any)
		if previousTaskID != "" {
			if previousTaskID != stringValue(provided["taskId"]) && previousTaskID != stringValue(inputMetadata["retryOf"]) {
				return creationConflict("目标节点的任务绑定已变化，请核对后重试")
			}
			prior, readErr := repo.Task(previousTaskID)
			if readErr != nil || prior.UserID != task.UserID || (prior.Status != model.TaskStatusSucceeded && prior.Status != model.TaskStatusFailed && prior.Status != model.TaskStatusCancelled) {
				return creationConflict("目标节点仍有未结束任务，请等待或取消原任务")
			}
		}
		if stringValue(provided["storageKey"]) != stringValue(previous["storageKey"]) {
			return creationConflict("目标节点素材已变化，请核对后重试")
		}
		for _, key := range []string{"content", "storageKey", "assetId"} {
			delete(metadata, key)
		}
		metadata = mergeCreationMaps(previous, metadata)
	} else {
		for _, key := range []string{"content", "storageKey", "assetId", "taskId"} {
			delete(metadata, key)
		}
		metadata["content"] = ""
		width, height := draft.Node["width"].(float64), draft.Node["height"].(float64)
		target = creationAddedNode(CreationCanvasOp{ID: stringValue(draft.Node["id"]), NodeType: stringValue(draft.Node["type"]), Title: stringValue(draft.Node["title"]), Position: draft.Node["position"].(map[string]any), Width: &width, Height: &height, Metadata: metadata})
		nodes = append(nodes, target)
	}
	for _, key := range []string{"audioOutputNodeIds", "audioOutputSourceNodeId", "audioOutputIndex", "audioOutputRole", "generationOutputCount", "errorDetails"} {
		delete(metadata, key)
	}
	applyNativeCanvasTaskMetadata(metadata, task)
	metadata["status"] = "loading"
	target["metadata"] = metadata
	bindNativeCanvasGenerationSource(nodes, stringValue(target["id"]), draft)
	connections, err := mergeCanvasTaskConnections(nodes, creationMaps(doc["connections"]), draft.Connections, stringValue(target["id"]))
	if err != nil {
		return err
	}
	doc["nodes"], doc["connections"] = nodes, connections
	return saveCloudAgentDocument(repo, project, doc, policy)
}

func mergeCanvasTaskConnections(nodes, connections, incoming []map[string]any, targetID string) ([]map[string]any, error) {
	for _, connection := range incoming {
		if connection["toNodeId"] != targetID || connection["fromNodeId"] == targetID {
			return nil, BadAuthRequest("生成草稿连线的目标不正确")
		}
		if err := validateCloudAgentID(stringValue(connection["id"]), "连线ID", 80); err != nil {
			return nil, err
		}
		found := false
		for _, node := range nodes {
			if node["id"] == connection["fromNodeId"] {
				found = true
				break
			}
		}
		if !found {
			return nil, creationConflict("参考节点已删除，请重新选择素材")
		}
		duplicate := false
		for _, existing := range connections {
			if existing["id"] == connection["id"] {
				if existing["fromNodeId"] != connection["fromNodeId"] || existing["toNodeId"] != connection["toNodeId"] {
					return nil, creationConflict("生成连线编号已用于其他节点")
				}
				duplicate = true
				break
			}
		}
		if !duplicate {
			copy := map[string]any{"id": connection["id"], "fromNodeId": connection["fromNodeId"], "toNodeId": connection["toNodeId"]}
			for _, key := range []string{"fromHandleId", "toHandleId", "storyboardRowId", "relation"} {
				if value, exists := connection[key]; exists {
					text, ok := value.(string)
					if !ok || utf8.RuneCountInString(text) > 240 {
						return nil, BadAuthRequest("生成连线属性无效")
					}
					if key == "relation" && text != "storyboard-output" && text != "storyboard-asset-reference" && text != "batch-output" && text != "batch-input" {
						return nil, BadAuthRequest("生成连线关系无效")
					}
					copy[key] = text
				}
			}
			for _, key := range []string{"fromAnchorRatio", "toAnchorRatio"} {
				if value, exists := connection[key]; exists {
					number, ok := value.(float64)
					if !ok || math.IsNaN(number) || math.IsInf(number, 0) || number < 0 || number > 1 {
						return nil, BadAuthRequest("生成连线位置无效")
					}
					copy[key] = number
				}
			}
			connections = append(connections, copy)
		}
	}
	return connections, nil
}

func publishCanvasTaskDraft(repo *repository.Repository, task model.Task, policy RuntimePolicySetting) error {
	_, err := applyCanvasTaskDraft(repo, task, policy)
	return err
}

func resetCanvasTaskDraftForRetry(repo *repository.Repository, task *model.Task, policy RuntimePolicySetting) error {
	draft, err := canvasTaskDraftFor(*task)
	if err != nil {
		return err
	}
	if draft == nil {
		return nil
	}
	project, err := repo.CanvasProjectForUser(task.UserID, task.ProjectID)
	if err != nil {
		return creationError(err)
	}
	doc, err := creationDocument(project.PayloadJSON)
	if err != nil {
		return err
	}
	for _, node := range creationMaps(doc["nodes"]) {
		if node["id"] != draft.Node["id"] {
			continue
		}
		meta, _ := node["metadata"].(map[string]any)
		if meta["taskId"] != task.ID || node["type"] != draft.Node["type"] {
			return creationConflict("目标节点任务已变化，请在画布中确认新尝试")
		}
		applyNativeCanvasTaskMetadata(meta, task)
		meta["status"] = "loading"
		for _, key := range []string{"errorDetails", "generationErrorCode", "failedPromptFingerprint", "resourceReloadAvailable"} {
			delete(meta, key)
		}
		if node["type"] == "image" {
			reconcileNativeCanvasImageBatch(doc, stringValue(node["id"]), stringValue(meta["batchRootId"]))
		}
		reconcileNativeCanvasGenerationSource(doc, stringValue(node["id"]))
		return saveCloudAgentDocument(repo, project, doc, policy)
	}
	return creationConflict("目标节点已移除，请回到画布选择后再生成")
}

func applyCanvasTaskDraft(repo *repository.Repository, task model.Task, policy RuntimePolicySetting) (bool, error) {
	draft, err := canvasTaskDraftFor(task)
	if err != nil || draft == nil {
		return false, err
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
	for _, node := range creationMaps(doc["nodes"]) {
		if node["id"] != draft.Node["id"] {
			continue
		}
		metadata, _ := node["metadata"].(map[string]any)
		if stringValue(metadata["taskId"]) != task.ID {
			return false, nil
		}
		if node["type"] == "text" {
			applyNativeCanvasTaskMetadata(metadata, &task)
			if task.Status == model.TaskStatusSucceeded {
				var result struct {
					Text string `json:"text"`
				}
				if json.Unmarshal([]byte(task.ResultJSON), &result) != nil || result.Text == "" {
					return false, BadAuthRequest("文本任务缺少完整结果，原内容已保留")
				}
				metadata["content"], metadata["status"] = result.Text, "success"
				delete(metadata, "richText")
				delete(metadata, "errorDetails")
			} else {
				metadata["status"], metadata["errorDetails"] = "error", cloudAgentSafeMediaTaskError(&task)
			}
			reconcileNativeCanvasGenerationSource(doc, stringValue(node["id"]))
			return true, saveCloudAgentDocument(repo, project, doc, policy)
		}
		_, err = completeCloudAgentMediaNode(repo, task.UserID, task.ProjectID, stringValue(node["id"]), &task, policy)
		return true, err
	}
	metadata, _ := draft.Node["metadata"].(map[string]any)
	batchChanged := task.Type == "canvas_image" && reconcileNativeCanvasImageBatch(doc, stringValue(draft.Node["id"]), stringValue(metadata["batchRootId"]))
	sourceChanged := reconcileNativeCanvasGenerationSource(doc, stringValue(draft.Node["id"]))
	if batchChanged || sourceChanged {
		return true, saveCloudAgentDocument(repo, project, doc, policy)
	}
	return false, nil // A later user deletion is preserved; original assets stay available.
}

func hasCanvasTaskDraft(task model.Task) bool {
	var input struct {
		Metadata map[string]json.RawMessage `json:"metadata"`
	}
	if json.Unmarshal([]byte(task.InputJSON), &input) != nil {
		return false
	}
	_, exists := input.Metadata["canvasTaskDraft"]
	return exists
}
