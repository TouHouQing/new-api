package app

// Reconcile only an existing root that still lists this child. Removing a
// child or changing the batch never recreates an obsolete target.
func reconcileNativeCanvasImageBatch(doc map[string]any, childID, rootID string) bool {
	if rootID == "" {
		return false
	}
	nodes := creationMaps(doc["nodes"])
	byID := map[string]map[string]any{}
	for _, node := range nodes {
		byID[stringValue(node["id"])] = node
	}
	root := byID[rootID]
	if root == nil || root["type"] != "image" {
		return false
	}
	meta, _ := root["metadata"].(map[string]any)
	if meta["isBatchRoot"] != true {
		return false
	}
	ids, ok := meta["batchChildIds"].([]any)
	if !ok || len(ids) > 15 {
		return false
	}
	found := false
	for _, id := range ids {
		if id == childID {
			found = true
		}
	}
	if !found {
		return false
	}
	pending, failed, succeeded := 0, 0, 0
	var selected map[string]any
	primary := stringValue(meta["primaryImageId"])
	for _, rawID := range ids {
		id, ok := rawID.(string)
		if !ok {
			failed++
			continue
		}
		node := byID[id]
		if node == nil {
			failed++
			continue
		}
		item, _ := node["metadata"].(map[string]any)
		if item["batchRootId"] != rootID {
			failed++
			continue
		}
		if item["status"] == "success" && stringValue(item["storageKey"]) != "" {
			succeeded++
			if selected == nil || id == primary {
				selected = node
			}
		} else if item["status"] == "loading" || item["taskStatus"] == "queued" || item["taskStatus"] == "running" {
			pending++
		} else {
			failed++
		}
	}
	if selected != nil {
		item := selected["metadata"].(map[string]any)
		if meta["locked"] != true && meta["manualSize"] != true {
			width, wok := selected["width"].(float64)
			height, hok := selected["height"].(float64)
			oldWidth, owok := root["width"].(float64)
			oldHeight, ohok := root["height"].(float64)
			position, pok := root["position"].(map[string]any)
			if wok && hok && owok && ohok && pok {
				x, xok := position["x"].(float64)
				y, yok := position["y"].(float64)
				if xok && yok {
					root["width"], root["height"] = width, height
					root["position"] = map[string]any{"x": x + (oldWidth-width)/2, "y": y + (oldHeight-height)/2}
				}
			}
		}
		for _, key := range []string{"content", "storageKey", "assetId", "assetVersionId", "mimeType", "bytes", "naturalWidth", "naturalHeight", "producedModel", "taskId", "taskType", "taskStatus", "taskProgress", "taskStage", "taskMediaStage", "taskStartedAt", "taskCompletedAt", "taskUpdatedAt", "taskCreatedAt"} {
			if value, exists := item[key]; exists {
				meta[key] = value
			} else {
				delete(meta, key)
			}
		}
		meta["primaryImageId"] = selected["id"]
	}
	meta["batchFailedCount"] = failed
	if pending > 0 {
		meta["status"], meta["taskStatus"], meta["taskProgress"] = "loading", "running", float64(len(ids)-pending)/float64(len(ids))*100
	} else if succeeded > 0 {
		meta["status"], meta["taskStatus"], meta["taskProgress"] = "success", "succeeded", 100
		delete(meta, "errorDetails")
	} else {
		meta["status"], meta["taskStatus"], meta["errorDetails"] = "error", "failed", "本批次没有完成的图片；已保留任务记录，请检查失败原因后重试未完成部分"
	}
	return true
}
