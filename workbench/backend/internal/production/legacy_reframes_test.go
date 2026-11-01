package production

import (
	"bytes"
	"encoding/json"
	"reflect"
	"strings"
	"testing"
	"time"

	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

func legacyReframeFixture(t *testing.T) (map[string]any, LegacyTimelineProjection, LegacyMediaAnalysisProjection, LegacyProjectionData) {
	t.Helper()
	document, resources, data := legacyAnalysisFixture(t)
	for _, id := range []string{"track", "track-human"} {
		var raw map[string]any
		_ = json.Unmarshal(data.Artifacts[id+".json"], &raw)
		raw["coordinate_space"] = "normalized_display"
		data.Artifacts[id+".json"], _ = json.Marshal(raw)
	}
	analyses, err := ProjectLegacyMediaAnalyses(document, resources, data, "owner", "project", "import", time.Now())
	if err != nil {
		t.Fatal(err)
	}
	production := objectValue(document["production"])
	production["reframes"] = map[string]any{"old-clip": map[string]any{"analysisId": "track", "sourceMediaId": "resource", "sourceDigest": strings.Repeat("a", 64), "width": 192, "height": 360}}
	clip := func(id string, start int64) map[string]any {
		return map[string]any{"id": id, "kind": "video", "trackId": "video", "startMs": start, "durationMs": 2000, "sourceStartMs": 1000, "sourceDurationMs": 10000, "playbackRate": 2, "directMedia": map[string]any{"kind": "video", "storageKey": "resource:resource"}}
	}
	raw, _ := json.Marshal(map[string]any{"version": 2, "tracks": []any{map[string]any{"id": "video", "kind": "video", "label": "视频", "order": 0}}, "clips": []any{clip("native-target", 0), clip("native-repeat", 2000)}, "durationMs": 4000})
	return document, LegacyTimelineProjection{Timeline: raw, ClipIDs: map[string]string{"old-clip": "native-target", "repeat": "native-repeat"}, PreservedOnly: []string{"production.reframes"}}, analyses, data
}

func TestLegacyReframesUseExactHistoricalAnalysisAndOnlyOneOccurrence(t *testing.T) {
	document, before, analyses, data := legacyReframeFixture(t)
	original := append([]byte{}, before.Timeline...)
	after, err := ProjectLegacyReframes(document, before, analyses, data)
	if err != nil || containsLegacyReframeGap(after.PreservedOnly) {
		t.Fatal("framing conversion", err, after.Warnings)
	}
	var body struct {
		Clips []struct {
			ID           string           `json:"id"`
			Reframe      *TimelineReframe `json:"reframe"`
			PlaybackRate float64          `json:"playbackRate"`
		} `json:"clips"`
	}
	if err := json.Unmarshal(after.Timeline, &body); err != nil {
		t.Fatal(err)
	}
	r := body.Clips[0].Reframe
	if r == nil || r.RevisionID != analyses.VersionIDs["track"] || r.RevisionID == analyses.VersionIDs["track-human"] || r.SourceSHA256 != strings.Repeat("a", 64) || r.StartMs != 1000 || r.EndMs != 5000 || r.Keys[0].TimeMs != 1000 || body.Clips[0].PlaybackRate != 2 || body.Clips[1].Reframe != nil {
		t.Fatal("historical source or independent occurrence changed", body)
	}
	if !bytes.Equal(before.Timeline, original) {
		t.Fatal("source timeline mutated")
	}
	if len(LegacyNativeDeliveryFields(document, 5, nil)) != 1 || len(LegacyNativeDeliveryFields(document, 6, after.PreservedOnly)) != 0 {
		t.Fatal("old/new delivery guards disagree")
	}
}

func TestLegacyReframesRemainWholeAndDeterministicWhenUnsupported(t *testing.T) {
	document, before, analyses, data := legacyReframeFixture(t)
	refs := objectValue(objectValue(document["production"])["reframes"])
	refs["zzz-unsupported"] = map[string]any{"analysisId": "track", "sourceMediaId": "resource", "sourceDigest": strings.Repeat("a", 64), "width": 192, "height": 360, "unknownZoom": 2}
	var warnings []string
	for i := 0; i < 10; i++ {
		after, err := ProjectLegacyReframes(document, before, analyses, data)
		if err != nil || !containsLegacyReframeGap(after.PreservedOnly) || !bytes.Equal(after.Timeline, before.Timeline) {
			t.Fatal("partially adopted an unsupported field", err)
		}
		if i == 0 {
			warnings = after.Warnings
		} else if !reflect.DeepEqual(after.Warnings, warnings) {
			t.Fatal("preview warnings change across equivalent requests")
		}
	}
	if len(LegacyNativeDeliveryFields(document, 6, before.PreservedOnly)) != 1 {
		t.Fatal("unsupported framing no longer blocks delivery")
	}
}

func TestLegacyReframesRejectChangedSourceAndPreserveUnknownCoordinates(t *testing.T) {
	for _, change := range []string{"digest", "pinned-source", "coordinate-space"} {
		t.Run(change, func(t *testing.T) {
			document, before, analyses, data := legacyReframeFixture(t)
			ref := objectValue(objectValue(objectValue(document["production"])["reframes"])["old-clip"])
			if change == "digest" {
				ref["sourceDigest"] = strings.Repeat("b", 64)
			}
			if change == "pinned-source" {
				ref["sourceMediaId"] = "newer-take"
			}
			if change == "coordinate-space" {
				var raw map[string]any
				_ = json.Unmarshal(data.Artifacts["track.json"], &raw)
				delete(raw, "coordinate_space")
				data.Artifacts["track.json"], _ = json.Marshal(raw)
			}
			after, err := ProjectLegacyReframes(document, before, analyses, data)
			if change != "coordinate-space" {
				if err == nil {
					t.Fatal("changed exact source accepted")
				}
				return
			}
			if err != nil || !containsLegacyReframeGap(after.PreservedOnly) || !bytes.Equal(after.Timeline, before.Timeline) {
				t.Fatal("unknown coordinates were guessed", err)
			}
		})
	}
}

func TestLegacyReframeEnrichmentReconcilesPriorPreservationReport(t *testing.T) {
	document, _, _, data := legacyReframeFixture(t)
	_, resources, _ := legacyAnalysisFixture(t)
	document["nodes"] = []any{map[string]any{"id": "video", "data": map[string]any{"kind": "video", "mediaId": "resource", "seconds": 10}}}
	state := objectValue(document["production"])
	state["timelineEdited"] = true
	state["timeline"] = []any{map[string]any{"id": "old-clip", "nodeId": "video", "trimStart": 1, "trimEnd": 5}}
	rows := &repository.ProductionImportRows{Project: model.Project{ID: "project", UserID: "owner"}, Receipt: model.ProductionImport{ID: "import"}}
	report, err := EnrichLegacyImport(rows, LegacyProjectionReport{PreservedOnly: []string{"production", "production.reframes"}}, document, resources, map[string]map[string]string{"nodes": {"video": "native-video"}}, data, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if containsLegacyReframeGap(report.PreservedOnly) || len(LegacyNativeDeliveryFields(document, LegacyNativeProjectionVersion, report.PreservedOnly)) != 0 || !strings.Contains(rows.Cut.PayloadJSON, `"reframe"`) {
		t.Fatal("resolved framing retained an obsolete report blocker", report, rows.Cut.PayloadJSON)
	}
}
