package production

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"yingce/backend/internal/model"
)

func legacyAnalysisFixture(t *testing.T) (map[string]any, map[string]model.Resource, LegacyProjectionData) {
	t.Helper()
	refs := []any{}
	data := LegacyProjectionData{Artifacts: map[string][]byte{}, ResourceSHA256: map[string]string{"resource": strings.Repeat("a", 64)}}
	add := func(id, kind string, body map[string]any) {
		refs = append(refs, map[string]any{"id": id, "kind": kind, "sourceMediaId": "resource", "sourceDigest": strings.Repeat("a", 64), "artifactMediaId": id + ".json", "analyzerVersion": "old-engine-1", "createdAt": "2026-10-01T10:00:00Z"})
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		data.Artifacts[id+".json"] = raw
	}
	add("scenes", "scenes", map[string]any{"kind": "scene_detect", "start": 1, "end": 5, "cuts": []any{map[string]any{"time": 2}, map[string]any{"time": 3}}})
	add("beats", "audio", map[string]any{"kind": "audio_structure", "start": 1, "end": 5, "beat_times": []float64{1.1, 2.2}, "sections": []any{map[string]any{"start": 1, "end": 5, "label": "候选分段"}}})
	add("beats-human", "audio", map[string]any{"kind": "beat_correction", "parent_id": "beats", "start": 1, "end": 5, "beat_times": []float64{1.2, 2.3}, "sections": []any{map[string]any{"start": 1, "end": 5, "label": "主歌"}}})
	points := func(manual bool) []any {
		result := []any{}
		for _, at := range []float64{1, 3, 4.95} {
			result = append(result, map[string]any{"time": at, "crop": map[string]any{"x": .2, "y": 0, "width": .3, "height": 1}, "confidence": .9, "review_required": false, "manual": manual})
		}
		return result
	}
	add("track", "subjects", map[string]any{"kind": "subject_track", "start": 1, "end": 5, "points": points(false)})
	add("track-human", "subjects", map[string]any{"kind": "subject_track", "start": 1, "end": 5, "points": points(true), "manual_correction": map[string]any{"parent_analysis_id": "track"}})
	return map[string]any{"production": map[string]any{"analysisRefs": refs}}, map[string]model.Resource{"resource": {ID: "resource", UserID: "owner", MimeType: "video/mp4", Size: 100, DurationMs: 10000, Width: 640, Height: 360, ETag: "original"}}, data
}

func TestLegacyMediaAnalysisNativeHistoryAndSourceClock(t *testing.T) {
	document, resources, data := legacyAnalysisFixture(t)
	result, err := ProjectLegacyMediaAnalyses(document, resources, data, "owner", "project", "import", time.Now())
	if err != nil || len(result.Analyses) != 3 || len(result.Versions) != 5 || len(result.PreservedOnly) != 0 {
		t.Fatalf("projection: %+v %v", result, err)
	}
	if result.AnalysisIDs["track"] != result.AnalysisIDs["track-human"] || result.AnalysisIDs["beats"] != result.AnalysisIDs["beats-human"] {
		t.Fatal("explicit correction history was split")
	}
	for _, row := range result.Analyses {
		var source MediaAnalysisSource
		if json.Unmarshal([]byte(row.SourceJSON), &source) != nil || source.StartMs != 1000 || source.EndMs != 5000 || source.ResourceID != "resource" || source.SHA256 != strings.Repeat("a", 64) {
			t.Fatal("source changed")
		}
		if row.Kind != "reference_video" && row.Revision != 2 {
			t.Fatal("missing history")
		}
		if row.Kind == "subject_track" {
			var evidence map[string]any
			_ = json.Unmarshal([]byte(row.EvidenceJSON), &evidence)
			if evidence["legacyCropOnly"] != true || len(evidence["legacyHistory"].([]any)) != 2 {
				t.Fatal("missing raw provenance or crop-only disclosure")
			}
		}
	}
	for _, version := range result.Versions {
		var edits MediaAnalysisEdits
		_ = json.Unmarshal([]byte(version.DocumentJSON), &edits)
		if version.RequestID == "" || len(version.RequestID) > 128 {
			t.Fatal("import revisions collide in unique request index")
		}
		if version.ID == result.VersionIDs["beats-human"] && (edits.Beats[0].TimeMs != 1200 || !edits.Beats[0].Approved || edits.Sections[0].Title != "主歌") {
			t.Fatal("manual music correction lost")
		}
		if version.ID == result.VersionIDs["track-human"] && (!edits.Tracking[0].Manual || edits.Tracking[0].TimeMs != 1000) {
			t.Fatal("tracking source clock lost")
		}
	}
}

func TestLegacyMediaAnalysisRejectsChangedSourcesCyclesAndIntervals(t *testing.T) {
	for _, mutation := range []string{"digest", "cycle", "interval"} {
		t.Run(mutation, func(t *testing.T) {
			document, resources, data := legacyAnalysisFixture(t)
			if mutation == "digest" {
				data.ResourceSHA256["resource"] = strings.Repeat("b", 64)
			}
			if mutation == "cycle" || mutation == "interval" {
				var raw map[string]any
				_ = json.Unmarshal(data.Artifacts["track.json"], &raw)
				if mutation == "cycle" {
					raw["manual_correction"] = map[string]any{"parent_analysis_id": "track-human"}
				} else {
					raw["end"] = 5.1
				}
				data.Artifacts["track.json"], _ = json.Marshal(raw)
			}
			if _, err := ProjectLegacyMediaAnalyses(document, resources, data, "owner", "project", "import", time.Now()); err == nil {
				t.Fatal("unsafe history accepted")
			}
		})
	}
}

func TestLegacyMediaAnalysisPreservesUnsupportedWithoutInventingData(t *testing.T) {
	document, resources, data := legacyAnalysisFixture(t)
	delete(data.Artifacts, "scenes.json")
	result, err := ProjectLegacyMediaAnalyses(document, resources, data, "owner", "project", "import", time.Now())
	if err != nil || len(result.Analyses) != 2 || len(result.PreservedOnly) != 1 || len(result.Warnings) == 0 {
		t.Fatalf("missing-artifact handling: %+v %v", result, err)
	}
	resources["resource"] = model.Resource{ID: "resource", UserID: "owner", MimeType: "video/mp4", Size: 100}
	data.Preflight = true
	if result, err := ProjectLegacyMediaAnalyses(document, resources, data, "owner", "project", "import", time.Now()); err != nil || len(result.Analyses) != 2 {
		t.Fatalf("preflight must not require unprobed geometry: %+v %v", result, err)
	}
}
