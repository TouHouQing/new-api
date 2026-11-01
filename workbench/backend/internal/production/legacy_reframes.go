// SPDX-License-Identifier: AGPL-3.0-or-later
// Studio framing contract: Copyright (C) 2023-2026 QuantumNous.
package production

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"sort"

	"yingce/backend/internal/model"
)

type legacyReframeReference struct {
	AnalysisID    string `json:"analysisId"`
	SourceMediaID string `json:"sourceMediaId"`
	SourceDigest  string `json:"sourceDigest"`
	Width         int    `json:"width"`
	Height        int    `json:"height"`
}

// A historical reframe names a specific old analysis, not its newest native
// human revision. Convert the entire field or keep its delivery blocker.
func ProjectLegacyReframes(document map[string]any, timeline LegacyTimelineProjection, analyses LegacyMediaAnalysisProjection, data LegacyProjectionData) (LegacyTimelineProjection, error) {
	raw := objectValue(document["production"])["reframes"]
	if !legacyVersionFieldHasContent(raw) {
		return timeline, nil
	}
	keep := func(reason string) (LegacyTimelineProjection, error) {
		timeline.Warnings = appendUnique(timeline.Warnings, reason)
		return timeline, nil
	}
	refs, ok := raw.(map[string]any)
	if !ok || len(refs) > 100 {
		return keep("旧构图字段结构或数量无法完整映射，原始记录保留，尚未解除交付检查")
	}
	if data.Preflight {
		return keep("旧构图将在导入时核对原片显示尺寸；检查阶段不猜测轨迹")
	}
	var body map[string]any
	decoder := json.NewDecoder(bytes.NewReader(timeline.Timeline))
	decoder.UseNumber()
	if decoder.Decode(&body) != nil {
		return timeline, ErrTimelineDocument
	}
	clips := map[string]map[string]any{}
	for _, value := range listValue(body["clips"]) {
		clip := objectValue(value)
		clips[stringValue(clip, "id")] = clip
	}
	rows := map[string]model.ProjectMediaAnalysis{}
	versions := map[string]model.ProjectMediaAnalysisRevision{}
	for _, row := range analyses.Analyses {
		rows[row.ID] = row
	}
	for _, version := range analyses.Versions {
		versions[version.ID] = version
	}
	originalRefs := map[string]map[string]any{}
	for _, value := range listValue(objectValue(document["production"])["analysisRefs"]) {
		ref := objectValue(value)
		originalRefs[stringValue(ref, "id")] = ref
	}
	changes := map[string]TimelineReframe{}
	cache := map[string]TimelineReframe{}
	ordered := make([]string, 0, len(refs))
	for id := range refs {
		ordered = append(ordered, id)
	}
	sort.Strings(ordered)
	for _, oldClipID := range ordered {
		value := refs[oldClipID]
		encoded, err := json.Marshal(value)
		if err != nil {
			return timeline, err
		}
		var ref legacyReframeReference
		strict := json.NewDecoder(bytes.NewReader(encoded))
		strict.DisallowUnknownFields()
		if strict.Decode(&ref) != nil || !markerText(ref.AnalysisID, 128) || !markerText(ref.SourceMediaID, 128) || !analysisSHA.MatchString(ref.SourceDigest) || ref.Width < 64 || ref.Width > 4096 || ref.Height < 64 || ref.Height > 4096 || ref.Width%2 != 0 || ref.Height%2 != 0 {
			return keep("旧构图包含无法解释的参数，原始记录保留，请核对后再交付")
		}
		clip := clips[timeline.ClipIDs[oldClipID]]
		if clip == nil {
			return keep("旧构图对应的镜头尚无可用片段，保留原始关联，未采用到其他镜头")
		}
		if stringValue(clip, "kind") != "video" || stringValue(objectValue(clip["directMedia"]), "storageKey") != "resource:"+ref.SourceMediaID {
			return timeline, fmt.Errorf("%w: reframe names a different pinned source", ErrLegacyBundle)
		}
		aid, rid := analyses.AnalysisIDs[ref.AnalysisID], analyses.VersionIDs[ref.AnalysisID]
		row, exists := rows[aid]
		version, exists2 := versions[rid]
		if !exists || !exists2 || row.Kind != "subject_track" || version.AnalysisID != aid {
			return keep("旧构图所需的具体跟踪分析未能转为可编辑版本，原始关联仍保留")
		}
		var source MediaAnalysisSource
		var edits MediaAnalysisEdits
		if json.Unmarshal([]byte(row.SourceJSON), &source) != nil || json.Unmarshal([]byte(version.DocumentJSON), &edits) != nil {
			return timeline, ErrMediaAnalysis
		}
		if source.ResourceID != ref.SourceMediaID || source.SHA256 != ref.SourceDigest {
			return timeline, fmt.Errorf("%w: reframe analysis source digest changed", ErrLegacyBundle)
		}
		reframe, cached := cache[rid]
		if !cached {
			var original map[string]any
			if json.Unmarshal(data.Artifacts[stringValue(originalRefs[ref.AnalysisID], "artifactMediaId")], &original) != nil || stringValue(original, "coordinate_space") != "normalized_display" {
				return keep("旧跟踪未明确记录显示坐标空间，请在原生分析中核对构图后采用；原始轨迹保留")
			}
			reframe, err = BuildTimelineReframe(aid, rid, source, edits, json.RawMessage(row.EvidenceJSON))
			if err != nil {
				return keep("旧构图的核对状态、固定画幅或源区间无法完整映射，请在原生分析中核对后采用")
			}
			cache[rid] = reframe
		}
		if math.Abs((reframe.Width*float64(source.Width))/(reframe.Height*float64(source.Height))-float64(ref.Width)/float64(ref.Height)) > .005 {
			return keep("旧构图的核对状态、固定画幅或源区间无法完整映射，请在原生分析中核对后采用")
		}
		copy := copyTimelineClip(clip)
		copy["reframe"] = reframe
		if err := validateClipReframe(copy); err != nil {
			return keep("旧构图没有覆盖这个固定片段的完整源区间，原始关联保留，请缩短片段或核对分析")
		}
		changes[stringValue(clip, "id")] = reframe
	}
	for id, reframe := range changes {
		clips[id]["reframe"] = reframe
	}
	encoded, err := json.Marshal(body)
	if err != nil {
		return timeline, err
	}
	timeline.Timeline, err = ValidateTimelineDocument(encoded)
	if err != nil {
		return timeline, err
	}
	fields := []string{}
	for _, field := range timeline.PreservedOnly {
		if field != "production.reframes" {
			fields = append(fields, field)
		}
	}
	timeline.PreservedOnly = fields
	return timeline, nil
}
