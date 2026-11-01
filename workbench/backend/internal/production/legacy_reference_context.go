// SPDX-License-Identifier: AGPL-3.0-or-later
// Reference precedence derived from new-api Studio's studioNodeAssetContext.
package production

import (
	"fmt"
	"sort"
	"strings"
	"time"
	"yingce/backend/internal/model"
)

type legacyFixedReference struct{ AssetID, VersionID, ResourceID string }
type legacyReferenceContexts struct {
	Nodes           map[string][]legacyFixedReference
	Versions        []model.AssetVersion
	Representations []model.AssetRepresentation
}

func resolveLegacyReferenceContexts(document map[string]any, identities map[string]map[string]string, resources map[string]model.Resource, namespace string, now time.Time) (legacyReferenceContexts, error) {
	result := legacyReferenceContexts{Nodes: map[string][]legacyFixedReference{}, Versions: []model.AssetVersion{}, Representations: []model.AssetRepresentation{}}
	nodes, assets := map[string]map[string]any{}, map[string]map[string]any{}
	for _, value := range listValue(document["nodes"]) {
		node := objectValue(value)
		nodes[stringValue(node, "id")] = objectValue(node["data"])
	}
	for _, value := range listValue(document["assets"]) {
		asset := objectValue(value)
		assets[stringValue(asset, "id")] = asset
	}
	if identities["nodeAssetVersions"] == nil {
		identities["nodeAssetVersions"] = map[string]string{}
	}
	for _, value := range listValue(document["nodes"]) {
		node := objectValue(value)
		nodeID := stringValue(node, "id")
		data := objectValue(node["data"])
		selected, pins, overrides := map[string]bool{}, map[string]string{}, map[string]map[string]any{}
		for _, value := range listValue(data["assetIds"]) {
			id, ok := value.(string)
			if !ok || assets[id] == nil {
				return result, ErrLegacyBundle
			}
			selected[id] = true
		}
		if id := stringValue(data, "linkedAssetId"); assets[id] != nil {
			selected[id] = true
		}
		for asset, value := range objectValue(data["assetVersionIds"]) {
			id, ok := value.(string)
			if !ok {
				return result, ErrLegacyBundle
			}
			if id != "" {
				pins[asset] = id
			}
		}
		for _, value := range listValue(document["edges"]) {
			edge := objectValue(value)
			if stringValue(edge, "target") != nodeID {
				continue
			}
			source := nodes[stringValue(edge, "source")]
			assetID := stringValue(source, "linkedAssetId")
			asset := assets[assetID]
			if asset == nil {
				continue
			}
			selected[assetID] = true
			takeID := stringValue(objectValue(edge["data"]), "sourceTakeId")
			if takeID == "" || pins[assetID] != "" {
				continue
			}
			matched := false
			for _, value := range listValue(asset["versions"]) {
				if stringValue(objectValue(value), "id") == takeID {
					pins[assetID] = takeID
					matched = true
					break
				}
			}
			if matched {
				continue
			}
			for _, value := range listValue(source["takes"]) {
				take := objectValue(value)
				if stringValue(take, "id") != takeID {
					continue
				}
				override := map[string]any{}
				for key, value := range asset {
					override[key] = value
				}
				override["prompt"] = stringValue(take, "prompt")
				delete(override, "profile")
				override["mediaId"] = stringValue(take, "mediaId")
				override["outputUrl"] = stringValue(take, "outputUrl")
				overrides[assetID] = override
				break
			}
		}
		ids := []string{}
		for id := range selected {
			ids = append(ids, id)
		}
		sort.Strings(ids)
		for _, assetID := range ids {
			asset := assets[assetID]
			versionID := pins[assetID]
			reference := asset
			target := identities["assetRoots"][assetID]
			if versionID != "" {
				target = identities["assetVersions"][assetID+"/"+versionID]
				found := false
				for _, value := range listValue(asset["versions"]) {
					candidate := objectValue(value)
					if stringValue(candidate, "id") == versionID {
						reference = candidate
						found = true
						break
					}
				}
				if !found || target == "" {
					return result, fmt.Errorf("%w: pinned graph reference missing", ErrLegacyBundle)
				}
			} else if override := overrides[assetID]; override != nil {
				reference = override
				key := legacyNativeID("node-reference-key", nodeID, assetID)
				target = identities["nodeAssetVersions"][key]
				if target == "" {
					target = legacyNativeID("legacy-node-reference-v8", namespace, nodeID, assetID, legacyRootContent(override))
					identities["nodeAssetVersions"][key] = target
					result.Versions = append(result.Versions, legacyRootVersion(override, target, identities["assets"][assetID], 0, now))
					if rid := stringValue(override, "mediaId"); rid != "" {
						result.Representations = append(result.Representations, model.AssetRepresentation{ID: legacyNativeID("legacy-node-reference-image-v8", namespace, nodeID, assetID), AssetVersionID: target, ResourceID: rid, MediaType: "image", Role: "primary", CreatedAt: now})
					}
				}
			}
			if target == "" {
				return result, fmt.Errorf("%w: graph reference has no original identity", ErrLegacyBundle)
			}
			rid := stringValue(reference, "mediaId")
			if rid != "" {
				resource, ok := resources[rid]
				if !ok || !strings.HasPrefix(resource.MimeType, "image/") {
					return result, fmt.Errorf("%w: graph reference image missing", ErrLegacyBundle)
				}
			}
			result.Nodes[nodeID] = append(result.Nodes[nodeID], legacyFixedReference{AssetID: assetID, VersionID: target, ResourceID: rid})
		}
	}
	return result, nil
}
