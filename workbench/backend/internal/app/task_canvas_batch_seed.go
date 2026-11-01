package app

import (
	"encoding/json"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

// The outer task transaction owns both this root and every child admission.
// Child targets are inserted by the ordinary task binder, never a second queue.
func seedCanvasTaskBatch(repo *repository.Repository, userID, canvasID string, req CreateCanvasTaskBatchRequest, drafts []*canvasTaskDraft, policy RuntimePolicySetting) error {
	project, err := repo.CanvasProjectForUser(userID, canvasID)
	if err != nil {
		return creationError(err)
	}
	doc, err := creationDocument(project.PayloadJSON)
	if err != nil {
		return err
	}
	nodes := creationMaps(doc["nodes"])
	byID := map[string]map[string]any{}
	for _, node := range nodes {
		byID[stringValue(node["id"])] = node
	}
	for _, draft := range drafts {
		if draft.RequireExisting && byID[stringValue(draft.Node["id"])] == nil {
			return creationConflict("目标节点已移除，请重新选择后生成")
		}
	}
	if req.Root == nil {
		if len(req.RetiredNodeIDs) > 0 {
			return BadAuthRequest("只有图片批次可更换原子节点")
		}
		return nil
	}
	root := req.Root
	raw, err := json.Marshal(root)
	if err != nil || len(raw) > 64*1024 || len(root.Connections) > 32 {
		return BadAuthRequest("批次根节点草稿过大或无效")
	}
	if err = validateCanvasTaskDraftNode(root.Node); err != nil {
		return err
	}
	if err = validateCreationJSON(root); err != nil {
		return err
	}
	rootID := stringValue(root.Node["id"])
	provided, _ := root.Node["metadata"].(map[string]any)
	children, ok := provided["batchChildIds"].([]any)
	if root.Node["type"] != "image" || req.Tasks[0].Type != "canvas_image" || provided["isBatchRoot"] != true || !ok || len(children) != len(drafts) {
		return BadAuthRequest("图片批次根节点须完整列出子节点")
	}
	planned := map[string]bool{rootID: true}
	for index, draft := range drafts {
		meta, _ := draft.Node["metadata"].(map[string]any)
		id := stringValue(draft.Node["id"])
		if children[index] != id || planned[id] || meta["batchRootId"] != rootID {
			return BadAuthRequest("批次根节点与生成目标不一致")
		}
		planned[id] = true
	}
	target := byID[rootID]
	if target == nil && root.RequireExisting {
		return creationConflict("批次根节点已移除，请重新选择")
	}
	metadata := mergeCreationMaps(nil, provided)
	if target != nil {
		if target["type"] != "image" {
			return creationConflict("批次根节点类型已变化")
		}
		previous, _ := target["metadata"].(map[string]any)
		priorID := stringValue(previous["taskId"])
		if priorID != "" {
			if priorID != stringValue(provided["taskId"]) {
				return creationConflict("批次根节点任务已变化")
			}
			prior, e := repo.Task(priorID)
			if e != nil || prior.UserID != userID || (prior.Status != model.TaskStatusSucceeded && prior.Status != model.TaskStatusFailed && prior.Status != model.TaskStatusCancelled) {
				return creationConflict("原批次仍在生成，请等待或取消")
			}
		}
		if stringValue(previous["storageKey"]) != stringValue(provided["storageKey"]) {
			return creationConflict("批次根节点素材已变化")
		}
		if !root.RequireExisting && !jsonValuesEqual(previous["batchChildIds"], provided["batchChildIds"]) {
			return creationConflict("批次根节点编号已被使用")
		}
		for _, key := range []string{"content", "storageKey", "assetId"} {
			delete(metadata, key)
		}
		metadata = mergeCreationMaps(previous, metadata)
	} else {
		for _, key := range []string{"content", "storageKey", "assetId"} {
			delete(metadata, key)
		}
		width, height := root.Node["width"].(float64), root.Node["height"].(float64)
		target = creationAddedNode(CreationCanvasOp{ID: rootID, NodeType: "image", Title: stringValue(root.Node["title"]), Position: root.Node["position"].(map[string]any), Width: &width, Height: &height, Metadata: metadata})
		nodes = append(nodes, target)
	}
	for _, key := range []string{"taskId", "taskStatus", "taskProgress", "taskStage", "taskMediaStage", "taskStartedAt", "taskCompletedAt", "errorDetails", "primaryImageId"} {
		delete(metadata, key)
	}
	metadata["status"], metadata["batchFailedCount"] = "loading", 0
	target["metadata"] = metadata
	removed := map[string]bool{}
	for _, id := range req.RetiredNodeIDs {
		if planned[id] {
			return BadAuthRequest("不能移除本次批次目标")
		}
		if old := byID[id]; old != nil {
			meta, _ := old["metadata"].(map[string]any)
			if meta["batchRootId"] != rootID {
				return creationConflict("不能移除其他批次节点")
			}
			removed[id] = true
		}
	}
	kept := make([]any, 0, len(nodes))
	for _, node := range nodes {
		if !removed[stringValue(node["id"])] {
			kept = append(kept, node)
		}
	}
	doc["nodes"] = kept
	connections := make([]any, 0)
	for _, edge := range creationMaps(doc["connections"]) {
		if !removed[stringValue(edge["fromNodeId"])] && !removed[stringValue(edge["toNodeId"])] {
			connections = append(connections, edge)
		}
	}
	doc["connections"] = connections
	edges, err := mergeCanvasTaskConnections(creationMaps(doc["nodes"]), creationMaps(doc["connections"]), root.Connections, rootID)
	if err != nil {
		return err
	}
	doc["connections"] = edges
	return saveCloudAgentDocument(repo, project, doc, policy)
}
