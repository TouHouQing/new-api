// SPDX-License-Identifier: AGPL-3.0-or-later
// Historical Studio analysis contracts: Copyright (C) 2023-2026 QuantumNous.
package production

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"reflect"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"yingce/backend/internal/model"
)

type LegacyMediaAnalysisProjection struct {
	Analyses      []model.ProjectMediaAnalysis
	Versions      []model.ProjectMediaAnalysisRevision
	AnalysisIDs   map[string]string
	VersionIDs    map[string]string
	PreservedOnly []string
	Warnings      []string
}

func legacyEditableAnalysisKind(kind string) string {
	switch kind {
	case "scenes":
		return "reference_video"
	case "audio":
		return "audio_structure"
	case "subjects":
		return "subject_track"
	}
	return ""
}

type legacyAnalysisPart struct {
	ref      map[string]any
	source   MediaAnalysisSource
	edits    MediaAnalysisEdits
	evidence map[string]any
	parent   string
	kind     string
	index    int
}

// Only explicit same-source parent links create revision histories. Equal
// media, timestamps or labels never merge independent analyses.
func ProjectLegacyMediaAnalyses(document map[string]any, resources map[string]model.Resource, data LegacyProjectionData, userID, projectID, importID string, now time.Time) (LegacyMediaAnalysisProjection, error) {
	result := LegacyMediaAnalysisProjection{AnalysisIDs: map[string]string{}, VersionIDs: map[string]string{}, PreservedOnly: []string{}, Warnings: []string{}}
	parts, order, seen := map[string]legacyAnalysisPart{}, []string{}, map[string]bool{}
	for index, value := range listValue(objectValue(document["production"])["analysisRefs"]) {
		ref := objectValue(value)
		kind := legacyEditableAnalysisKind(stringValue(ref, "kind"))
		if kind == "" {
			continue
		}
		id, sourceID := stringValue(ref, "id"), stringValue(ref, "sourceMediaId")
		if !markerText(id, 128) || seen[id] {
			return result, fmt.Errorf("%w: duplicate or invalid analysis identity", ErrLegacyBundle)
		}
		seen[id] = true
		source, ok := resources[sourceID]
		if !ok || !analysisSHA.MatchString(stringValue(ref, "sourceDigest")) || data.ResourceSHA256[sourceID] != stringValue(ref, "sourceDigest") {
			return result, fmt.Errorf("%w: analysis source digest mismatch", ErrLegacyBundle)
		}
		raw := data.Artifacts[stringValue(ref, "artifactMediaId")]
		part, err := parseLegacyMediaAnalysis(raw, ref, source, kind, data.Preflight)
		if err != nil {
			result.PreservedOnly = appendUnique(result.PreservedOnly, fmt.Sprintf("production.analysisRefs[%d].%s", index, stringValue(ref, "kind")))
			result.Warnings = appendUnique(result.Warnings, "部分旧分析的区间、测量或数量无法映射，原分析文件完整保留，未伪造可编辑结果")
			continue
		}
		part.ref, part.kind, part.index = ref, kind, index
		parts[id], order = part, append(order, id)
	}
	states, roots, sorted := map[string]int{}, map[string]string{}, []string{}
	var visit func(string) (string, error)
	visit = func(id string) (string, error) {
		if states[id] == 1 {
			return "", fmt.Errorf("%w: analysis correction cycle", ErrLegacyBundle)
		}
		if states[id] == 2 {
			return roots[id], nil
		}
		states[id] = 1
		part, root := parts[id], id
		if parent, exists := parts[part.parent]; exists {
			if part.kind != parent.kind || !reflect.DeepEqual(part.source, parent.source) {
				return "", fmt.Errorf("%w: analysis correction changes source or interval", ErrLegacyBundle)
			}
			var err error
			root, err = visit(part.parent)
			if err != nil {
				return "", err
			}
		} else if part.parent != "" {
			result.Warnings = appendUnique(result.Warnings, "旧校正的父分析未包含或无法转换；当前校正版独立保留，不将其标记为初始算法测量")
		}
		states[id], roots[id] = 2, root
		sorted = append(sorted, id)
		return root, nil
	}
	for _, id := range order {
		if _, err := visit(id); err != nil {
			return result, err
		}
	}
	rows := map[string]int{}
	for _, id := range sorted {
		part, root := parts[id], roots[id]
		aid, rid := legacyNativeID("legacy-analysis-v1", importID, root), legacyNativeID("legacy-analysis-revision-v1", importID, id)
		index, exists := rows[root]
		if !exists {
			index = len(result.Analyses)
			rows[root] = index
			sourceJSON, _ := json.Marshal(part.source)
			evidence := parts[root].evidence
			evidence["legacyHistory"] = []any{}
			for _, child := range sorted {
				if roots[child] != root {
					continue
				}
				version := parts[child]
				artifactID := stringValue(version.ref, "artifactMediaId")
				evidence["legacyHistory"] = append(evidence["legacyHistory"].([]any), map[string]any{"analysisId": child, "parentAnalysisId": version.parent, "artifactResourceId": artifactID, "artifactSha256": fmt.Sprintf("%x", sha256.Sum256(data.Artifacts[artifactID])), "analyzerVersion": version.ref["analyzerVersion"], "createdAt": version.ref["createdAt"]})
			}
			evidenceJSON, _ := json.Marshal(evidence)
			label := map[string]string{"reference_video": "切镜分析", "audio_structure": "音乐分析", "subject_track": "主体跟踪"}[part.kind]
			result.Analyses = append(result.Analyses, model.ProjectMediaAnalysis{ID: aid, UserID: userID, ProjectID: projectID, Kind: part.kind, SourceKind: "legacy_import", SourceKey: legacyNativeID("legacy-analysis-source-v1", importID, root), SourceImportID: importID, SourceLegacyID: root, ResourceID: part.source.ResourceID, Title: "导入" + label + " " + strconv.Itoa(len(result.Analyses)+1), SourceJSON: string(sourceJSON), EvidenceJSON: string(evidenceJSON), CreatedAt: now, UpdatedAt: now})
		}
		row := &result.Analyses[index]
		row.Revision++
		row.CurrentRevisionID = rid
		raw, _ := json.Marshal(part.edits)
		created := now
		if parsed, err := time.Parse(time.RFC3339Nano, stringValue(part.ref, "createdAt")); err == nil {
			created = parsed
		}
		note := "导入历史分析 " + id
		if part.parent != "" {
			note += "；保留明确的父校正关系"
		}
		requestID := "legacy-import:" + legacyNativeID("legacy-analysis-request-v1", importID, id)
		result.Versions = append(result.Versions, model.ProjectMediaAnalysisRevision{ID: rid, AnalysisID: aid, RequestID: requestID, RequestSHA256: fmt.Sprintf("%x", sha256.Sum256(raw)), Version: row.Revision, UserID: userID, AuthorID: userID, DocumentJSON: string(raw), Note: note, CreatedAt: created})
		result.AnalysisIDs[id], result.VersionIDs[id] = aid, rid
	}
	return result, nil
}

func parseLegacyMediaAnalysis(raw []byte, ref map[string]any, resource model.Resource, kind string, preflight bool) (legacyAnalysisPart, error) {
	part := legacyAnalysisPart{edits: MediaAnalysisEdits{Version: 1}}
	if len(raw) == 0 || len(raw) > MaxLegacyDocumentBytes || !utf8.Valid(raw) {
		return part, ErrMediaAnalysis
	}
	if kind == "audio_structure" && !strings.HasPrefix(resource.MimeType, "video/") && !strings.HasPrefix(resource.MimeType, "audio/") || kind != "audio_structure" && !strings.HasPrefix(resource.MimeType, "video/") {
		return part, ErrMediaAnalysis
	}
	var body map[string]any
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if decoder.Decode(&body) != nil || decoder.Decode(new(any)) != io.EOF || body == nil {
		return part, ErrMediaAnalysis
	}
	legacyKind := stringValue(body, "kind")
	if (kind == "reference_video" && legacyKind != "scene_detect") || (kind == "audio_structure" && legacyKind != "audio_structure" && legacyKind != "beat_correction") || (kind == "subject_track" && legacyKind != "subject_track") {
		return part, ErrMediaAnalysis
	}
	seconds := func(value any) (int64, bool) {
		number, ok := value.(json.Number)
		if !ok {
			return 0, false
		}
		v, err := number.Float64()
		if err != nil || math.IsNaN(v) || math.IsInf(v, 0) || v < 0 || v > 86400 {
			return 0, false
		}
		return int64(math.Round(v * 1000)), true
	}
	start, ok := seconds(body["start"])
	end, ok2 := seconds(body["end"])
	if !ok || !ok2 || end <= start {
		return part, ErrMediaAnalysis
	}
	duration, width, height := resource.DurationMs, resource.Width, resource.Height
	if preflight {
		duration, width, height = max(duration, end), max(width, 2), max(height, 2)
	}
	part.source = MediaAnalysisSource{DisplayGeometryVersion: 1, ResourceID: resource.ID, SHA256: stringValue(ref, "sourceDigest"), ETag: resource.ETag, Bytes: resource.Size, DurationMs: duration, StartMs: start, EndMs: end, Width: width, Height: height, Windowed: kind == "reference_video" && end-start > 60000}
	validationSource := part.source
	if preflight {
		validationSource.ResourceID = legacyNativeID("preflight-analysis-resource", resource.ID)
	}
	part.parent = stringValue(objectValue(body["manual_correction"]), "parent_analysis_id")
	if legacyKind == "beat_correction" {
		part.parent = stringValue(body, "parent_id")
		if !markerText(part.parent, 128) {
			return part, ErrMediaAnalysis
		}
	}
	if part.parent != "" && !markerText(part.parent, 128) {
		return part, ErrMediaAnalysis
	}
	part.evidence = map[string]any{"kind": kind, "method": "导入历史分析：" + stringValue(ref, "analyzerVersion"), "legacyOriginalKind": legacyKind, "legacyArtifactResourceId": ref["artifactMediaId"], "legacyParentAnalysisId": part.parent, "duration": float64(end-start) / 1000}
	if kind == "reference_video" {
		boundaries := []int64{start}
		cuts, valid := body["cuts"].([]any)
		if !valid || len(cuts) > 999 {
			return part, ErrMediaAnalysis
		}
		for _, value := range cuts {
			at, valid := seconds(objectValue(value)["time"])
			if !valid || at <= boundaries[len(boundaries)-1] || at >= end {
				return part, ErrMediaAnalysis
			}
			boundaries = append(boundaries, at)
		}
		boundaries = append(boundaries, end)
		for i := 1; i < len(boundaries); i++ {
			part.edits.Sections = append(part.edits.Sections, AnalysisSection{ID: analysisItemID("section", i-1), StartMs: boundaries[i-1], EndMs: boundaries[i], Title: "参考片段 " + strconv.Itoa(i)})
		}
		part.evidence["legacyCuts"] = cuts
	} else if kind == "audio_structure" {
		beats, valid := body["beat_times"].([]any)
		sections, valid2 := body["sections"].([]any)
		if !valid || !valid2 || len(beats) > 2000 || len(sections) > 1000 {
			return part, ErrMediaAnalysis
		}
		for i, value := range beats {
			at, valid := seconds(value)
			if !valid {
				return part, ErrMediaAnalysis
			}
			part.edits.Beats = append(part.edits.Beats, AnalysisBeat{ID: analysisItemID("beat", i), TimeMs: at, Approved: legacyKind == "beat_correction"})
		}
		for i, value := range sections {
			row := objectValue(value)
			a, valid := seconds(row["start"])
			b, valid2 := seconds(row["end"])
			if !valid || !valid2 {
				return part, ErrMediaAnalysis
			}
			label := stringValue(row, "label")
			if strings.TrimSpace(label) == "" {
				label = "音乐分段 " + strconv.Itoa(i+1)
			}
			part.edits.Sections = append(part.edits.Sections, AnalysisSection{ID: analysisItemID("section", i), StartMs: a, EndMs: b, Title: label, Approved: legacyKind == "beat_correction"})
		}
		part.evidence["legacyBeats"], part.evidence["legacySections"], part.evidence["tempo_bpm"] = beats, sections, body["tempo_bpm"]
	} else {
		points, valid := body["points"].([]any)
		if !valid || len(points) < 2 || len(points) > 2000 {
			return part, ErrMediaAnalysis
		}
		measured := []any{}
		for i, value := range points {
			row := objectValue(value)
			at, valid := seconds(row["time"])
			var crop, roi AnalysisRectangle
			encoded, _ := json.Marshal(row["crop"])
			if !valid || json.Unmarshal(encoded, &crop) != nil || !crop.Valid() {
				return part, ErrMediaAnalysis
			}
			encoded, _ = json.Marshal(row["roi"])
			if row["roi"] == nil {
				roi = crop
				part.evidence["legacyCropOnly"] = true
			} else if json.Unmarshal(encoded, &roi) != nil || !roi.Valid() {
				return part, ErrMediaAnalysis
			}
			confidence, valid := row["confidence"].(json.Number)
			c, err := confidence.Float64()
			required, valid2 := row["review_required"].(bool)
			manual, _ := row["manual"].(bool)
			if !valid || err != nil || math.IsNaN(c) || math.IsInf(c, 0) || c < 0 || c > 1 || !valid2 {
				return part, ErrMediaAnalysis
			}
			part.edits.Tracking = append(part.edits.Tracking, AnalysisTrackingPoint{ID: analysisItemID("point", i), TimeMs: at, ROI: roi, Crop: crop, Manual: manual, Reviewed: !required && (manual || c >= .65)})
			measured = append(measured, map[string]any{"time": float64(at-start) / 1000, "confidence": c, "review_required": required, "reason": row["reason"], "crop": crop, "roi": row["roi"]})
		}
		part.evidence["points"] = measured
	}
	validated, err := ValidateMediaAnalysisEdits(validationSource, kind, part.edits)
	if err != nil {
		return part, err
	}
	part.edits = validated
	return part, nil
}
