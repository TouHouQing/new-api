// SPDX-License-Identifier: AGPL-3.0-or-later
package production

import (
	"encoding/json"
	"time"
	"yingce/backend/internal/model"
)

// The legacy root is an explicit saved reference, not an alias for the last
// historical version. Compare only fields that controlled its appearance.
func legacyRootContent(asset map[string]any) string {
	raw, _ := json.Marshal(map[string]any{"prompt": stringValue(asset, "prompt"), "profile": objectValue(asset["profile"]), "mediaId": stringValue(asset, "mediaId"), "modelMediaId": stringValue(asset, "modelMediaId")})
	return string(raw)
}

func legacyMatchingRootVersion(asset map[string]any, versions map[string]string) string {
	oldID := stringValue(asset, "id")
	root := legacyRootContent(asset)
	for _, value := range listValue(asset["versions"]) {
		version := objectValue(value)
		if legacyRootContent(version) == root {
			return versions[oldID+"/"+stringValue(version, "id")]
		}
	}
	if len(listValue(asset["versions"])) == 0 {
		return versions[oldID+"/"+oldID]
	}
	return ""
}

func legacyRootVersion(asset map[string]any, id, assetID string, version int, now time.Time) model.AssetVersion {
	root := map[string]any{}
	for key, value := range asset {
		if key != "versions" {
			root[key] = value
		}
	}
	definition := map[string]any{"legacyDefinition": root, "legacySavedRoot": true, "resourceId": asset["mediaId"], "prompt": asset["prompt"]}
	for key, value := range objectValue(asset["profile"]) {
		definition[key] = value
	}
	raw, _ := json.Marshal(definition)
	return model.AssetVersion{ID: id, AssetID: assetID, Version: version, Status: model.AssetVersionStatusDraft, DefinitionJSON: string(raw), Prompt: stringValue(asset, "prompt"), CreatedAt: now, UpdatedAt: now}
}

func ensureLegacyPlanningRoots(rowsProject model.Project, importID string, document map[string]any, resources map[string]model.Resource, identities map[string]map[string]string, now time.Time) ([]model.AssetVersion, []model.AssetRepresentation, error) {
	versions := []model.AssetVersion{}
	representations := []model.AssetRepresentation{}
	if identities["assetRoots"] == nil {
		identities["assetRoots"] = map[string]string{}
	}
	for _, value := range listValue(document["assets"]) {
		asset := objectValue(value)
		oldID := stringValue(asset, "id")
		if identities["assetRoots"][oldID] != "" {
			continue
		}
		if existing := legacyMatchingRootVersion(asset, identities["assetVersions"]); existing != "" {
			identities["assetRoots"][oldID] = existing
			continue
		}
		assetID := identities["assets"][oldID]
		if assetID == "" {
			return nil, nil, ErrLegacyBundle
		}
		id := legacyNativeID("legacy-saved-root-v8", importID, oldID)
		identities["assetRoots"][oldID] = id
		versions = append(versions, legacyRootVersion(asset, id, assetID, 0, now))
		if rid := stringValue(asset, "mediaId"); rid != "" {
			resource, ok := resources[rid]
			if !ok || resource.UserID != "" && resource.UserID != rowsProject.UserID {
				return nil, nil, ErrLegacyBundle
			}
			representations = append(representations, model.AssetRepresentation{ID: legacyNativeID("legacy-saved-root-image-v8", importID, oldID), AssetVersionID: id, ResourceID: rid, MediaType: "image", Role: "primary", CreatedAt: now})
		}
	}
	return versions, representations, nil
}
