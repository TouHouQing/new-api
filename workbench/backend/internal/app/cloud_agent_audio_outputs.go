// SPDX-License-Identifier: AGPL-3.0-or-later
package app

import (
	"errors"
	"fmt"
	"hash/fnv"
	"strings"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

func audioTaskOutputNodeID(rootID, taskID string, index int) string {
	hash := fnv.New64a()
	_, _ = fmt.Fprintf(hash, "%s\n%s\n%d", rootID, taskID, index)
	return fmt.Sprintf("audio_%016x", hash.Sum64())
}

func completeCloudAgentAudioOutputs(repo *repository.Repository, userID string, doc, root map[string]any, task *model.Task, outputs []map[string]any) error {
	if len(outputs) < 2 || len(outputs) > 32 {
		return BadAuthRequest("音频任务返回的音轨数量无效")
	}
	nodes := creationMaps(doc["nodes"])
	rootID := stringValue(root["id"])
	meta, _ := root["metadata"].(map[string]any)
	ids := make([]string, len(outputs)-1)
	for i := range ids {
		ids[i] = audioTaskOutputNodeID(rootID, task.ID, i+1)
	}
	previousIDs, _ := meta["audioOutputNodeIds"].([]any)
	delivered := meta["status"] == "success" && meta["generationOutputCount"] == float64(len(outputs)) && len(previousIDs) == len(ids)
	for i := range previousIDs {
		if i >= len(ids) || previousIDs[i] != ids[i] {
			delivered = false
		}
	}
	resources := make([]*model.Resource, len(outputs))
	assets := make([]string, len(outputs))
	targets := make([]map[string]any, len(outputs))
	targets[0] = root
	for i, output := range outputs {
		resourceID, _ := findTaskOutputResource(output, "audio")
		resource, err := repo.ResourceForUser(userID, resourceID)
		if err != nil || resource.Status != "ready" || !strings.HasPrefix(resource.MimeType, "audio/") {
			return &cloudAgentMediaWritebackError{error: BadAuthRequest("部分音轨没有可用的账号资源，整组结果未覆盖画布"), reason: "result_resource_unavailable"}
		}
		resources[i] = resource
		assetID := generationMediaAssetID(task.ID, i)
		if _, err = repo.AssetForUser(userID, assetID); err == nil {
			assets[i] = assetID
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if i == 0 {
			continue
		}
		for _, node := range nodes {
			if node["id"] == ids[i-1] {
				targets[i] = node
				break
			}
		}
		if targets[i] != nil {
			childMeta, _ := targets[i]["metadata"].(map[string]any)
			if childMeta["audioOutputSourceNodeId"] != rootID || childMeta["taskId"] != task.ID {
				if delivered {
					targets[i] = nil
					continue
				}
				return &cloudAgentMediaWritebackError{error: creationConflict("音轨节点已关联其他内容，原结果保留在素材库"), reason: "output_node_conflict"}
			}
		} else if !delivered {
			child := make(map[string]any)
			for key, value := range root {
				if key != "metadata" && key != "id" && key != "position" && key != "parentId" {
					child[key] = value
				}
			}
			child["id"] = ids[i-1]
			child["metadata"] = map[string]any{"taskId": task.ID, "audioOutputSourceNodeId": rootID}
			position, _ := root["position"].(map[string]any)
			x, _ := position["x"].(float64)
			y, _ := position["y"].(float64)
			width, _ := root["width"].(float64)
			height, _ := root["height"].(float64)
			x += width + 48
			child["position"] = availableAudioOutputPosition(nodes, x, y+float64(i-1)*(height+24), width, height)
			targets[i] = child
			nodes = append(nodes, child)
		}
	}
	for i, node := range targets {
		if node == nil {
			continue
		} // Preserve intentional deletion or reassignment after a full delivery.
		metadata, _ := node["metadata"].(map[string]any)
		applyNativeCanvasTaskMetadata(metadata, task)
		resource := resources[i]
		metadata["content"], metadata["storageKey"] = resourceFileURL(resource.ID), "resource:"+resource.ID
		metadata["status"], metadata["taskStatus"] = "success", string(task.Status)
		commitNativeCanvasProducedModel(metadata, task)
		metadata["taskId"], metadata["audioOutputIndex"] = task.ID, i
		metadata["audioOutputRole"], metadata["durationMs"] = outputs[i]["role"], resource.DurationMs
		metadata["bytes"], metadata["mimeType"] = resource.Size, resource.MimeType
		delete(metadata, "errorDetails")
		delete(metadata, "assetId")
		if assets[i] != "" {
			metadata["assetId"] = assets[i]
		}
		applyTaskMediaAssetVersion(metadata, task, resource.ID, assets[i])
		if !delivered {
			if name := strings.TrimSpace(stringValue(outputs[i]["name"])); name != "" {
				node["title"] = truncateRunes(strings.Join(strings.Fields(name), " "), 96)
			}
		}
		if i == 0 {
			metadata["generationOutputCount"], metadata["audioOutputNodeIds"] = len(outputs), ids
		} else {
			metadata["audioOutputSourceNodeId"] = rootID
		}
	}
	encoded := make([]any, len(nodes))
	for i, node := range nodes {
		encoded[i] = node
	}
	doc["nodes"] = encoded
	return nil
}

func availableAudioOutputPosition(nodes []map[string]any, x, y, width, height float64) map[string]any {
	for attempt := 0; attempt <= len(nodes); attempt++ {
		nextY := y
		for _, node := range nodes {
			if node["type"] == "frame" || node["type"] == "folder" {
				continue
			}
			position, _ := node["position"].(map[string]any)
			nx, _ := position["x"].(float64)
			ny, _ := position["y"].(float64)
			w, _ := node["width"].(float64)
			h, _ := node["height"].(float64)
			if x+width+36 <= nx || x >= nx+w+36 || y+height+36 <= ny || y >= ny+h+36 {
				continue
			}
			if ny+h+36 > nextY {
				nextY = ny + h + 36
			}
		}
		if nextY == y {
			break
		}
		y = nextY
	}
	return map[string]any{"x": x, "y": y}
}
