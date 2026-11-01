package app

import (
	"encoding/json"
	"strings"

	"yingce/backend/internal/model"
)

// Bind the version that produced this exact task output, never the asset's
// latest version. Registration and this result update share the completion tx.
func (s *Service) bindTaskMediaAssetVersions(task *model.Task) error {
	mode := capabilityFromTaskType(task.Type)
	if mode != "image" && mode != "audio" && mode != "video" {
		return nil
	}
	var result map[string]any
	if err := json.Unmarshal([]byte(task.ResultJSON), &result); err != nil {
		return err
	}
	outputs := taskMediaBindingOutputs(result, mode)
	if len(outputs) == 0 {
		return nil
	}
	ids := make([]string, len(outputs))
	for index := range outputs {
		ids[index] = generationMediaAssetID(task.ID, index)
	}
	versions, representations, err := s.repo.AssetsResourceRecords(ids)
	if err != nil {
		return err
	}
	parents := map[string]string{}
	for _, version := range versions {
		parents[version.ID] = version.AssetID
	}
	changed := false
	for index, output := range outputs {
		resourceID := stringValue(output["resourceId"])
		if resourceID == "" {
			resourceID = strings.TrimPrefix(stringValue(output["storageKey"]), "resource:")
		}
		for _, representation := range representations {
			if resourceID != "" && representation.ResourceID == resourceID && representation.TaskID == task.ID && parents[representation.AssetVersionID] == ids[index] {
				output["assetId"], output["assetVersionId"] = ids[index], representation.AssetVersionID
				changed = true
				break
			}
		}
	}
	if mode == "audio" && len(outputs) > 0 && result["audio"] != nil {
		result["audio"] = outputs[0]
	}
	if changed {
		encoded, err := json.Marshal(result)
		if err != nil {
			return err
		}
		task.ResultJSON = string(encoded)
	}
	return nil
}

func taskMediaBindingOutputs(result map[string]any, mode string) []map[string]any {
	if mode == "image" {
		return creationMaps(result["images"])
	}
	if mode == "audio" {
		if outputs := creationMaps(result["audios"]); len(outputs) > 0 {
			return outputs
		}
	}
	if output, ok := result[mode].(map[string]any); ok {
		return []map[string]any{output}
	}
	return nil
}

func applyTaskMediaAssetVersion(metadata map[string]any, task *model.Task, resourceID, assetID string) {
	delete(metadata, "assetVersionId")
	var result map[string]any
	if json.Unmarshal([]byte(task.ResultJSON), &result) != nil {
		return
	}
	for _, output := range taskMediaBindingOutputs(result, capabilityFromTaskType(task.Type)) {
		if stringValue(output["assetId"]) == assetID && stringValue(output["assetVersionId"]) != "" && (stringValue(output["resourceId"]) == resourceID || stringValue(output["storageKey"]) == "resource:"+resourceID) {
			metadata["assetVersionId"] = output["assetVersionId"]
			return
		}
	}
}
