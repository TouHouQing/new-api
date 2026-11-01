package app

func bindNativeCanvasGenerationSource(nodes []map[string]any, targetID string, draft *canvasTaskDraft) {
	input, _ := draft.input["metadata"].(map[string]any)
	sourceID := stringValue(input["sourceNodeId"])
	operation := stringValue(input["canvasBatchIntentSha256"])
	if operation == "" {
		operation = stringValue(input["clientOperationId"])
	}
	if operation == "" {
		return
	}
	for _, node := range nodes {
		if node["id"] != sourceID || node["type"] != "config" {
			continue
		}
		meta, _ := node["metadata"].(map[string]any)
		if meta == nil {
			meta = map[string]any{}
			node["metadata"] = meta
		}
		targets := []any{}
		if meta["generationOperationId"] == operation {
			targets, _ = meta["generationTargetNodeIds"].([]any)
		}
		for _, id := range targets {
			if id == targetID {
				return
			}
		}
		meta["generationOperationId"], meta["generationTargetNodeIds"], meta["status"] = operation, append(targets, targetID), "loading"
		delete(meta, "errorDetails")
	}
}

func reconcileNativeCanvasGenerationSource(doc map[string]any, targetID string) bool {
	changed := false
	nodes := creationMaps(doc["nodes"])
	byID := map[string]map[string]any{}
	for _, node := range nodes {
		byID[stringValue(node["id"])] = node
	}
	for _, node := range nodes {
		if node["type"] != "config" {
			continue
		}
		meta, _ := node["metadata"].(map[string]any)
		targets, ok := meta["generationTargetNodeIds"].([]any)
		if !ok || len(targets) == 0 || len(targets) > 15 {
			continue
		}
		includes, pending, success := false, false, false
		for _, id := range targets {
			if id == targetID {
				includes = true
			}
			item := byID[stringValue(id)]
			if item == nil {
				continue
			}
			state, _ := item["metadata"].(map[string]any)
			if state["status"] == "loading" {
				pending = true
			}
			if state["status"] == "success" {
				success = true
			}
		}
		if !includes || pending {
			continue
		}
		if success {
			meta["status"] = "success"
			delete(meta, "errorDetails")
		} else {
			meta["status"], meta["errorDetails"] = "error", "本次生成已结束，请在结果节点或任务中心查看原因"
		}
		changed = true
	}
	return changed
}
