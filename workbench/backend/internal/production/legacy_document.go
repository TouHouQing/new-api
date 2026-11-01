// SPDX-License-Identifier: AGPL-3.0-or-later
// Media reference contract derived from TouHouQing/new-api Studio.
// Original Studio code: Copyright (C) 2023-2026 QuantumNous.
package production

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"
)

// RestoreLegacyMedia produces an independent source document for the Yingce
// domain converter. The caller supplies IDs of resources it has already checked
// and created for the authenticated owner. Historical string snapshots are kept
// intact; no output URL is used as a download instruction.
func (bundle *LegacyBundle) RestoreLegacyMedia(resourcesByPath map[string]string) (map[string]any, error) {
	if err := bundle.Inspection.ValidateComplete(); err != nil {
		return nil, err
	}
	for _, resource := range bundle.Inspection.Resources {
		id := resourcesByPath[resource.Path]
		if id == "" || len(id) > 128 {
			return nil, fmt.Errorf("missing target resource for %s", resource.Path)
		}
	}
	raw, err := json.Marshal(bundle.Manifest.Project)
	if err != nil {
		return nil, ErrLegacyBundle
	}
	var document map[string]any
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.UseNumber()
	if decoder.Decode(&document) != nil {
		return nil, ErrLegacyBundle
	}
	var visit func(any)
	visit = func(value any) {
		switch object := value.(type) {
		case []any:
			for _, child := range object {
				visit(child)
			}
		case map[string]any:
			for key, child := range object {
				if key == "mediaId" || key == "media_id" || strings.HasSuffix(key, "MediaId") {
					if id, ok := child.(string); ok && id != "" {
						object[key] = resourcesByPath[bundle.Inspection.MediaAliases[id]]
					}
				} else if slices.Contains([]string{"mediaIds", "referenceMediaIds", "reference_media_ids", "musicMediaIds"}, key) {
					if values, ok := child.([]any); ok {
						for index, value := range values {
							if id, ok := value.(string); ok && id != "" {
								values[index] = resourcesByPath[bundle.Inspection.MediaAliases[id]]
							}
						}
					}
				} else if key == "approvedKeyImages" {
					if images, ok := child.(map[string]any); ok {
						for shot, value := range images {
							if id, ok := value.(string); ok && id != "" {
								images[shot] = resourcesByPath[bundle.Inspection.MediaAliases[id]]
							}
						}
					}
				} else {
					visit(child)
				}
			}
		}
	}
	visit(document)
	set := func(object map[string]any, key string, path *string) {
		if object == nil || path == nil {
			return
		}
		object[key] = resourcesByPath[*path]
		if key == "mediaId" {
			delete(object, "outputUrl")
		}
	}
	nodes, _ := document["nodes"].([]any)
	for index, value := range nodes {
		node := value.(map[string]any)
		data := node["data"].(map[string]any)
		set(data, "mediaId", bundle.Manifest.NodeMedia[index])
		takes, _ := data["takes"].([]any)
		for takeIndex, value := range takes {
			set(value.(map[string]any), "mediaId", bundle.Manifest.TakeMedia[index][takeIndex])
		}
	}
	assets, _ := document["assets"].([]any)
	if len(bundle.Manifest.AssetMedia) != len(assets) {
		return nil, ErrLegacyBundle
	}
	if bundle.Manifest.AssetVersionMedia != nil && len(bundle.Manifest.AssetVersionMedia) != len(assets) {
		return nil, ErrLegacyBundle
	}
	for index, value := range assets {
		asset, ok := value.(map[string]any)
		if !ok {
			return nil, ErrLegacyBundle
		}
		set(asset, "mediaId", bundle.Manifest.AssetMedia[index])
		versions, _ := asset["versions"].([]any)
		if bundle.Manifest.AssetVersionMedia == nil {
			continue
		}
		if len(bundle.Manifest.AssetVersionMedia[index]) != len(versions) {
			return nil, ErrLegacyBundle
		}
		for versionIndex, value := range versions {
			version, ok := value.(map[string]any)
			if !ok {
				return nil, ErrLegacyBundle
			}
			set(version, "mediaId", bundle.Manifest.AssetVersionMedia[index][versionIndex])
		}
	}
	shots, _ := document["shots"].([]any)
	if bundle.Manifest.ShotVoiceoverMedia != nil {
		if len(bundle.Manifest.ShotVoiceoverMedia) != len(shots) {
			return nil, ErrLegacyBundle
		}
		for index, value := range shots {
			shot, ok := value.(map[string]any)
			if !ok {
				return nil, ErrLegacyBundle
			}
			set(shot, "shotVoiceoverMediaId", bundle.Manifest.ShotVoiceoverMedia[index])
		}
	}
	set(document, "assembledMediaId", bundle.Manifest.AssembledMedia)
	set(document, "soundtrackMediaId", bundle.Manifest.SoundtrackMedia)
	set(document, "voiceoverMediaId", bundle.Manifest.VoiceoverMedia)
	return document, nil
}
