// SPDX-License-Identifier: AGPL-3.0-or-later
// Regional editing contract: Copyright (C) 2023-2026 QuantumNous.
package production

import (
	"encoding/json"
	"fmt"
	"math"
	"strings"

	"yingce/backend/internal/model"
)

type LegacyVersionSource struct {
	HasMotionGraphics bool   `json:"hasMotionGraphics,omitempty"`
	HasReframes       bool   `json:"hasReframes,omitempty"`
	HasAttachedAudio  bool   `json:"hasAttachedAudio,omitempty"`
	ID                string `json:"id"`
	Title             string `json:"title"`
	EpisodeID         string `json:"episodeId"`
	Episode           string `json:"episode"`
	Language          string `json:"language"`
	Region            string `json:"region"`
	Occurrences       int    `json:"occurrences"`
	Width             int    `json:"width"`
	Height            int    `json:"height"`
	FPS               int    `json:"fps"`
	Fit               string `json:"fit"`
}

type LegacyVersionProjection struct {
	Source        LegacyVersionSource `json:"source"`
	Timeline      json.RawMessage     `json:"timeline"`
	PreservedOnly []string            `json:"preservedOnly"`
	Warnings      []string            `json:"warnings"`
}

const LegacyRegionalProjectionVersion = 4

type LegacyVersionReframeContext struct {
	Analyses LegacyMediaAnalysisProjection
	Data     LegacyProjectionData
}

// Sources are the immutable imported snapshots, never the live canvas or a
// newly selected Take. Duplicate identities make a source ambiguous and fail.
func LegacyVersionSources(document map[string]any) ([]LegacyVersionSource, error) {
	production := objectValue(document["production"])
	episodes := map[string]string{}
	seenEpisodes := map[string]bool{}
	if len(listValue(production["episodes"])) > 100 {
		return nil, fmt.Errorf("%w: too many episodes", ErrLegacyBundle)
	}
	for _, value := range listValue(production["episodes"]) {
		row := objectValue(value)
		id := stringValue(row, "id")
		if !markerText(id, 128) || seenEpisodes[id] {
			return nil, fmt.Errorf("%w: ambiguous episode identity", ErrLegacyBundle)
		}
		seenEpisodes[id] = true
		episodes[id] = stringValue(row, "title")
	}
	versions := listValue(production["regionalVersions"])
	if len(versions) > 100 {
		return nil, fmt.Errorf("%w: too many regional versions", ErrLegacyBundle)
	}
	result := []LegacyVersionSource{}
	seen := map[string]bool{}
	for _, value := range versions {
		row := objectValue(value)
		id, episode := stringValue(row, "id"), stringValue(row, "episodeId")
		if !markerText(id, 128) || seen[id] || !markerText(stringValue(row, "title"), 200) || !markerText(episode, 128) {
			return nil, fmt.Errorf("%w: ambiguous regional version identity", ErrLegacyBundle)
		}
		seen[id] = true
		format := map[string]int{}
		for key, bounds := range map[string][3]int{"width": {1920, 64, 4096}, "height": {1080, 64, 4096}, "fps": {30, 12, 60}} {
			n := float64(bounds[0])
			if value, exists := row[key]; exists {
				n = numberValue(value)
			}
			if n < float64(bounds[1]) || n > float64(bounds[2]) || math.Trunc(n) != n {
				return nil, fmt.Errorf("%w: regional output format invalid", ErrLegacyBundle)
			}
			format[key] = int(n)
		}
		fit := stringValue(row, "fit")
		if fit == "" {
			fit = "letterbox"
		}
		if fit != "letterbox" && fit != "crop" && fit != "blur" {
			return nil, fmt.Errorf("%w: regional fit invalid", ErrLegacyBundle)
		}
		result = append(result, LegacyVersionSource{ID: id, Title: stringValue(row, "title"), EpisodeID: episode, Episode: episodes[episode], Language: stringValue(row, "language"), Region: stringValue(row, "region"), Occurrences: len(listValue(row["timeline"])), Width: format["width"], Height: format["height"], FPS: format["fps"], Fit: fit, HasMotionGraphics: legacyVersionFieldHasContent(row["motionGraphics"]), HasReframes: legacyVersionFieldHasContent(row["reframes"])})
		for _, value := range listValue(row["audioTracks"]) {
			mode := stringValue(objectValue(value), "anchorKind")
			if mode != "" && mode != "project" {
				result[len(result)-1].HasAttachedAudio = true
				break
			}
		}
	}
	return result, nil
}

// ProjectLegacyVersion follows the old regional export contract: only this
// version's subtitles/audio are used. Virtual source nodes are per occurrence,
// so two uses of one logical node can pin different files without last-win loss.
func ProjectLegacyVersion(document map[string]any, sourceID, importID string, resources map[string]model.Resource, identities map[string]map[string]string, preflight bool, framing ...LegacyVersionReframeContext) (LegacyVersionProjection, error) {
	result := LegacyVersionProjection{PreservedOnly: []string{}, Warnings: []string{}}
	sources, err := LegacyVersionSources(document)
	if err != nil {
		return result, err
	}
	var version map[string]any
	for index, source := range sources {
		if source.ID == sourceID {
			result.Source = source
			version = objectValue(listValue(objectValue(document["production"])["regionalVersions"])[index])
			break
		}
	}
	if version == nil || result.Source.Occurrences < 1 || result.Source.Occurrences > 100 {
		return result, fmt.Errorf("%w: regional version missing or empty", ErrLegacyBundle)
	}
	nodes := map[string]map[string]any{}
	for _, value := range listValue(document["nodes"]) {
		row := objectValue(value)
		nodes[stringValue(row, "id")] = objectValue(row["data"])
	}
	mapping := map[string]map[string]string{}
	for kind, rows := range identities {
		mapping[kind] = map[string]string{}
		for key, id := range rows {
			mapping[kind][key] = id
		}
	}
	for _, kind := range []string{"nodes", "takes", "shots"} {
		if mapping[kind] == nil {
			mapping[kind] = map[string]string{}
		}
	}
	virtualNodes, clips := []any{}, []any{}
	for index, value := range listValue(version["timeline"]) {
		clip := copyTimelineClip(objectValue(value))
		originalNode, takeID := stringValue(clip, "nodeId"), stringValue(clip, "takeId")
		data := nodes[originalNode]
		mediaID := stringValue(clip, "sourceMediaId")
		var selected map[string]any
		if takeID == "" {
			takeID = stringValue(data, "selectedTakeId")
		}
		for _, value := range listValue(data["takes"]) {
			take := objectValue(value)
			if stringValue(take, "id") == takeID {
				selected = take
				break
			}
		}
		if mediaID == "" {
			if takeID != "" && selected == nil {
				return result, fmt.Errorf("%w: regional pinned Take missing", ErrLegacyBundle)
			}
			mediaID = stringValue(data, "mediaId")
			if selected != nil {
				mediaID = stringValue(selected, "mediaId")
			}
		}
		resource, ok := resources[mediaID]
		if !ok || !strings.HasPrefix(resource.MimeType, "video/") {
			return result, fmt.Errorf("%w: regional occurrence %d has no pinned video", ErrLegacyBundle, index+1)
		}
		virtualID := fmt.Sprintf("regional-source-%d", index)
		title := stringValue(clip, "sourceTitle")
		if title == "" {
			title = stringValue(data, "title")
		}
		if title == "" {
			title = result.Source.Title
		}
		virtualNodes = append(virtualNodes, map[string]any{"id": virtualID, "data": map[string]any{"kind": "video", "title": title, "mediaId": resource.ID, "seconds": float64(resource.DurationMs) / 1000}})
		mapping["nodes"][virtualID] = mapping["nodes"][originalNode]
		if mapping["nodes"][virtualID] == "" {
			mapping["nodes"][virtualID] = "resource:" + resource.ID
		}
		// The old sourceMediaId is authoritative. Reuse a native candidate
		// binding only when the original candidate names that exact file.
		if selected != nil && stringValue(selected, "mediaId") == resource.ID {
			mapping["takes"][virtualID+"/current"] = mapping["takes"][originalNode+"/"+takeID]
		}
		clip["nodeId"] = virtualID
		delete(clip, "takeId")
		clips = append(clips, clip)
	}
	virtual := map[string]any{
		"nodes": virtualNodes, "shots": []any{}, "captionsText": stringValue(version, "subtitles"),
		"production": map[string]any{"timelineEdited": true, "timeline": clips, "audioTracks": listValue(version["audioTracks"]), "motionGraphics": version["motionGraphics"], "reframes": version["reframes"], "analysisRefs": objectValue(document["production"])["analysisRefs"]},
	}
	projected, err := ProjectLegacyTimeline(virtual, resources, mapping, importID+":"+sourceID, preflight)
	if err != nil {
		return result, err
	}
	if len(framing) > 0 {
		data := framing[0].Data
		data.Preflight = preflight
		projected, err = ProjectLegacyReframes(virtual, projected, framing[0].Analyses, data)
		if err != nil {
			return result, err
		}
	}
	result.Timeline = projected.Timeline
	for _, field := range projected.PreservedOnly {
		for _, key := range []string{"motionGraphics", "reframes"} {
			field = strings.Replace(field, "production."+key, "regionalVersions."+key, 1)
		}
		result.PreservedOnly = appendUnique(result.PreservedOnly, field)
	}
	result.Warnings = projected.Warnings
	for _, field := range legacyVersionPreservedFields(version) {
		if field == "regionalVersions.motionGraphics" && !containsLegacyMotionGap(projected.PreservedOnly) {
			continue
		}
		if field == "regionalVersions.reframes" && !containsLegacyReframeGap(projected.PreservedOnly) {
			continue
		}
		result.PreservedOnly = appendUnique(result.PreservedOnly, field)
	}
	return result, nil
}

func containsLegacyMotionGap(fields []string) bool {
	for _, field := range fields {
		if field == "production.motionGraphics" {
			return true
		}
	}
	return false
}

// Earlier native cuts may contain an incomplete cached conversion report.
// Re-read the immutable source rather than rewriting their historical metadata.
func LegacyVersionPreservedFields(document map[string]any, sourceID string) ([]string, error) {
	if sourceID == "" {
		return nil, fmt.Errorf("%w: regional source missing", ErrLegacyBundle)
	}
	var selected map[string]any
	for _, value := range listValue(objectValue(document["production"])["regionalVersions"]) {
		row := objectValue(value)
		if stringValue(row, "id") == sourceID {
			if selected != nil {
				return nil, fmt.Errorf("%w: duplicate regional source", ErrLegacyBundle)
			}
			selected = row
		}
	}
	if selected == nil {
		return nil, fmt.Errorf("%w: regional source missing", ErrLegacyBundle)
	}
	return legacyVersionPreservedFields(selected), nil
}

func legacyVersionPreservedFields(version map[string]any) []string {
	fields := []string{}
	for _, key := range []string{"motionGraphics", "reframes", "translationNodes"} {
		if legacyVersionFieldHasContent(version[key]) {
			fields = append(fields, "regionalVersions."+key)
		}
	}
	return fields
}

func legacyVersionFieldHasContent(value any) bool {
	switch field := value.(type) {
	case nil:
		return false
	case []any:
		return len(field) > 0
	case map[string]any:
		return len(field) > 0
	case string:
		return field != ""
	default:
		return true
	}
}

func LegacyNativeDeliveryFields(document map[string]any, converterVersion int, preserved []string) []string {
	fields := []string{}
	root := objectValue(document["production"])
	for _, key := range []string{"motionGraphics", "reframes", "translationNodes"} {
		converted := key == "motionGraphics" && converterVersion >= 4 && !containsLegacyMotionGap(preserved) || key == "reframes" && converterVersion >= 6 && !containsLegacyReframeGap(preserved)
		if legacyVersionFieldHasContent(root[key]) && !converted {
			fields = append(fields, "production."+key)
		}
	}
	for _, field := range preserved {
		if strings.HasPrefix(field, "captionsText.") || strings.HasPrefix(field, "production.motionGraphics") || field == "production.reframes" || field == "production.translationNodes" {
			fields = appendUnique(fields, field)
		}
	}
	return fields
}

func containsLegacyReframeGap(fields []string) bool {
	for _, field := range fields {
		if field == "production.reframes" || strings.HasPrefix(field, "production.reframes.") {
			return true
		}
	}
	return false
}
