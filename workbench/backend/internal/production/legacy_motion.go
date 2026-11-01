// SPDX-License-Identifier: AGPL-3.0-or-later
// Motion schema: Copyright (C) 2023-2026 QuantumNous.
package production

import (
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"yingce/backend/internal/model"
)

// Convert the complete old field or retain it visibly. A missing image is an
// integrity error, never permission to pick a newer Take or remote URL.
func projectLegacyMotion(value any, resources map[string]model.Resource, importID string, preflight bool) ([]any, bool, error) {
	if !legacyVersionFieldHasContent(value) {
		return nil, true, nil
	}
	rows, ok := value.([]any)
	if !ok || len(rows) > 128 {
		return nil, false, nil
	}
	result := []any{}
	seen := map[string]bool{}
	allowed := map[string]bool{}
	for _, key := range []string{"id", "kind", "text", "icon", "shape", "imageMediaId", "start", "end", "phaseOffset", "phaseDuration", "x", "y", "font_size", "font_family", "color", "animation", "bpm"} {
		allowed[key] = true
	}
	for _, value := range rows {
		row := objectValue(value)
		id := stringValue(row, "id")
		if !markerText(id, 128) || seen[id] {
			return nil, false, nil
		}
		seen[id] = true
		for key := range row {
			if !allowed[key] {
				return nil, false, nil
			}
		}
		for _, key := range []string{"text", "start", "end", "x", "y", "font_size", "color", "animation", "bpm"} {
			if _, ok := row[key]; !ok {
				return nil, false, nil
			}
		}
		for _, key := range []string{"start", "end", "x", "y", "font_size", "bpm", "phaseOffset", "phaseDuration"} {
			if value, exists := row[key]; exists {
				switch value.(type) {
				case json.Number, float64:
				default:
					return nil, false, nil
				}
				n := numberValue(value)
				if math.IsNaN(n) || math.IsInf(n, 0) {
					return nil, false, nil
				}
			}
		}
		for _, key := range []string{"kind", "text", "icon", "shape", "imageMediaId", "font_family", "color", "animation"} {
			if value, exists := row[key]; exists {
				if _, ok := value.(string); !ok {
					return nil, false, nil
				}
			}
		}
		start, end := numberValue(row["start"]), numberValue(row["end"])
		size, bpm := numberValue(row["font_size"]), numberValue(row["bpm"])
		if start < 0 || start > 3600 || end <= start || end > 3600 || secondsToMS(end-start) < 1 || math.Trunc(size) != size || math.Trunc(bpm) != bpm {
			return nil, false, nil
		}
		g := MotionGraphic{Version: 1, Kind: stringValue(row, "kind"), X: numberValue(row["x"]), Y: numberValue(row["y"]), Size: int(size), Color: stringValue(row, "color"), FontFamily: stringValue(row, "font_family"), Icon: stringValue(row, "icon"), Shape: stringValue(row, "shape"), Animation: stringValue(row, "animation"), BPM: int(bpm), PhaseOffsetMs: secondsToMS(row["phaseOffset"]), PhaseDurationMs: secondsToMS(row["phaseDuration"])}
		if g.Kind == "" {
			g.Kind = "text"
		}
		if g.Icon == "" {
			g.Icon = "spark"
		}
		if g.Shape == "" {
			g.Shape = "square"
		}
		if _, exists := row["phaseOffset"]; exists && (numberValue(row["phaseOffset"]) < 0 || numberValue(row["phaseOffset"]) > 3600) {
			return nil, false, nil
		}
		if _, exists := row["phaseDuration"]; exists {
			if numberValue(row["phaseDuration"]) < .01 || numberValue(row["phaseDuration"]) > 3600 {
				return nil, false, nil
			}
		} else {
			g.PhaseDurationMs = secondsToMS(end - start)
		}
		if g.Kind == "image" {
			g.ResourceID = stringValue(row, "imageMediaId")
		}
		text, ok := row["text"].(string)
		if !ok || text == "" || len([]rune(text)) > 2000 || ValidateMotionGraphic(g) != nil {
			return nil, false, nil
		}
		if g.Kind == "image" {
			resource, exists := resources[g.ResourceID]
			if !exists || !strings.HasPrefix(resource.MimeType, "image/") || (!preflight && resource.Status != model.ResourceStatusReady) {
				return nil, false, fmt.Errorf("%w: motion image missing or not ready", ErrLegacyBundle)
			}
		}
		graphic, err := graphicMap(&g)
		if err != nil {
			return nil, false, err
		}
		clipID := legacyNativeID("legacy-motion-v1", importID, id)
		result = append(result, map[string]any{"id": clipID, "nodeId": "graphic:" + clipID, "trackId": "import-graphics", "kind": "text", "startMs": secondsToMS(start), "durationMs": secondsToMS(end - start), "text": text, "title": text, "graphic": graphic, "productionBinding": map[string]any{"sourceImportId": importID, "legacyGraphicId": id}})
	}
	return result, true, nil
}
