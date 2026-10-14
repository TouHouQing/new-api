package service

import (
	"bytes"
	"fmt"

	"github.com/QuantumNous/new-api/common"
)

// A generated Take may be retained but only selected if the creative settings
// still match the frozen submission. Position and unrelated human edits are free.
func studioWorkflowConfigurationMatches(frozen, current map[string]any, nodeID string) bool {
	configuration := func(document map[string]any) []any {
		var data map[string]any
		for _, node := range studioObjects(document, "nodes") {
			if node["id"] == nodeID {
				data, _ = node["data"].(map[string]any)
				break
			}
		}
		values := []any{}
		for _, key := range []string{"kind", "purpose", "prompt", "model", "textMode", "assistantPlan", "assistantSkillId", "assistantScopeNodeIds", "group", "seconds", "resolution", "ratio", "imageSize", "imageCount", "imageQuality", "voice", "speed", "camera", "imageLayers", "videoKeyframes", "metadataJson", "referenceControl", "payloadPatchJson", "assetIds", "assetVersionIds", "linkedAssetId", "reworkRegion", "reworkRange"} {
			values = append(values, data[key])
		}
		assetIDs, _ := data["assetIds"].([]any)
		pins, _ := data["assetVersionIds"].(map[string]any)
		for _, asset := range studioObjects(document, "assets") {
			selected := asset["id"] == data["linkedAssetId"]
			for _, id := range assetIDs {
				if asset["id"] == id {
					selected = true
				}
			}
			if !selected {
				continue
			}
			reference := asset
			if versionID := pins[fmt.Sprint(asset["id"])]; versionID != nil {
				versions, _ := asset["versions"].([]any)
				for _, value := range versions {
					version, _ := value.(map[string]any)
					if version["id"] == versionID {
						reference = version
						break
					}
				}
			}
			values = append(values, asset["id"], reference["prompt"], reference["profile"], reference["mediaId"])
		}
		production, _ := document["production"].(map[string]any)
		bindings, _ := production["assetBindings"].(map[string]any)
		for _, shot := range studioObjects(document, "shots") {
			if shot["textNodeId"] != nodeID && shot["imageNodeId"] != nodeID && shot["videoNodeId"] != nodeID {
				continue
			}
			values = append(values, shot["id"], shot["camera"], shot["dialogue"])
			for _, state := range studioObjects(production, "continuityStates") {
				if state["shotId"] == shot["id"] {
					values = append(values, state)
				}
			}
			for _, scene := range studioObjects(production, "scenes") {
				shotIDs, _ := scene["shotIds"].([]any)
				for _, id := range shotIDs {
					if id == shot["id"] && pins[fmt.Sprint(scene["id"])] == nil {
						values = append(values, scene["id"], scene["title"], scene["description"])
					}
				}
			}
			selected, _ := bindings[fmt.Sprint(shot["id"])].([]any)
			values = append(values, selected)
			for _, prop := range studioObjects(production, "props") {
				for _, id := range selected {
					if id == prop["id"] {
						values = append(values, prop)
					}
				}
			}
		}
		if data["purpose"] == "assembly" {
			values = append(values, document["production"], document["shots"], document["captionsText"], document["soundtrackMediaId"], document["voiceoverMediaId"])
		}
		for _, edge := range studioObjects(document, "edges") {
			if edge["target"] == nodeID {
				values = append(values, edge["source"], edge["sourceHandle"], edge["targetHandle"], edge["data"])
			}
		}
		return values
	}
	before, err := common.Marshal(configuration(frozen))
	if err != nil {
		return false
	}
	after, err := common.Marshal(configuration(current))
	return err == nil && bytes.Equal(before, after)
}

func applyStudioWorkflowOutput(document map[string]any, nodeID string, take map[string]any) {
	for _, node := range studioObjects(document, "nodes") {
		if node["id"] != nodeID {
			continue
		}
		data, _ := node["data"].(map[string]any)
		applyStudioTakeOutput(data, take)
		data["selectedTakeId"] = take["id"]
		if take["mediaId"] != nil {
			for _, asset := range studioObjects(document, "assets") {
				if asset["id"] == data["linkedAssetId"] {
					asset["mediaId"] = take["mediaId"]
				}
			}
		}
	}
}

func applyStudioTakeOutput(data, take map[string]any) {
	if layers := data["imageLayers"]; layers != nil && data["selectedTakeId"] != take["id"] {
		for _, stored := range studioObjects(data, "takes") {
			if stored["id"] == data["selectedTakeId"] {
				stored["imageLayers"] = layers
			}
		}
	}
	for _, key := range []string{"status", "progress", "outputText", "outputImagePrompt", "outputVideoPrompt", "outputUrl", "mediaId", "taskId", "error", "sourceMode", "imageLayers"} {
		if key == "imageLayers" && data["selectedTakeId"] == take["id"] && data[key] != nil && take[key] == nil {
			continue
		}
		if value, exists := take[key]; exists {
			data[key] = value
		} else {
			delete(data, key)
		}
	}
	if voice, ok := take["voice"].(string); ok {
		data["voice"] = voice
	}
}
