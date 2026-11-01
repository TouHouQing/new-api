// SPDX-License-Identifier: AGPL-3.0-or-later
package production

type legacyStageReference struct{ VersionID, ResourceID, Stage string }

func legacyStateReferenceTargets(document map[string]any, contexts legacyReferenceContexts, identities map[string]map[string]string, shotID, assetID, versionID string) ([]legacyStageReference, error) {
	if versionID != "" {
		for _, value := range listValue(document["assets"]) {
			asset := objectValue(value)
			if stringValue(asset, "id") != assetID {
				continue
			}
			for _, value := range listValue(asset["versions"]) {
				version := objectValue(value)
				if stringValue(version, "id") == versionID {
					target := identities["assetVersions"][assetID+"/"+versionID]
					if target == "" {
						return nil, ErrLegacyBundle
					}
					return []legacyStageReference{{VersionID: target, ResourceID: stringValue(version, "mediaId")}}, nil
				}
			}
		}
		return nil, ErrLegacyBundle
	}
	root := identities["assetRoots"][assetID]
	image := ""
	for _, value := range listValue(document["assets"]) {
		asset := objectValue(value)
		if stringValue(asset, "id") == assetID {
			image = stringValue(asset, "mediaId")
			break
		}
	}
	if root == "" {
		return nil, ErrLegacyBundle
	}
	for _, value := range listValue(document["shots"]) {
		shot := objectValue(value)
		if stringValue(shot, "id") != shotID {
			continue
		}
		result := []legacyStageReference{}
		for _, kind := range []struct{ key, stage string }{{"imageNodeId", "image"}, {"videoNodeId", "video"}} {
			target := legacyStageReference{VersionID: root, ResourceID: image, Stage: kind.stage}
			for _, ref := range contexts.Nodes[stringValue(shot, kind.key)] {
				if ref.AssetID == assetID {
					target.VersionID, target.ResourceID = ref.VersionID, ref.ResourceID
					break
				}
			}
			result = append(result, target)
		}
		if result[0].VersionID == result[1].VersionID && result[0].ResourceID == result[1].ResourceID {
			result[0].Stage = ""
			return result[:1], nil
		}
		return result, nil
	}
	return nil, ErrLegacyBundle
}
