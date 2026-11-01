package production

import (
	"encoding/json"
	"strings"
	"testing"
)

func markerTimelineFixture() json.RawMessage {
	return json.RawMessage(`{"version":2,"tracks":[{"id":"v","kind":"video"},{"id":"a","kind":"audio"}],"clips":[{"id":"target","kind":"video","trackId":"v","nodeId":"v","startMs":5000,"durationMs":2000,"sourceStartMs":1000,"playbackRate":2,"directMedia":{"storageKey":"resource:original"}},{"id":"independent","kind":"video","trackId":"v","nodeId":"v","startMs":9000,"durationMs":5000,"directMedia":{"storageKey":"resource:original"}},{"id":"music","kind":"audio","trackId":"a","nodeId":"a","startMs":0,"durationMs":15000}]} `)
}

func TestMediaAnalysisMarkersMapOneOccurrenceAndReplaceWithoutDuplicates(t *testing.T) {
	source := analysisSourceFixture()
	edits := MediaAnalysisEdits{Version: 1, Sections: []AnalysisSection{{ID: "cut", StartMs: 2000, EndMs: 4000, Title: "真实分段", Approved: true}, {ID: "unreviewed", StartMs: 4000, EndMs: 6000}}}
	plan, err := BuildMediaAnalysisMarkerPlan(markerTimelineFixture(), "analysis", "revision", "target", "reference_video", source, edits)
	if err != nil || len(plan.Added) != 1 || plan.Added[0].TimeMs != 5500 {
		t.Fatal("source/rate mapping failed", err, plan.Added)
	}
	if strings.Contains(string(plan.Timeline), `"independent","analysisOccurrenceId"`) {
		t.Fatal("independent source occurrence changed")
	}
	again, err := BuildMediaAnalysisMarkerPlan(plan.Timeline, "analysis", "revision", "target", "reference_video", source, edits)
	if err != nil || len(again.Added) != 1 || len(again.RemovedIDs) != 1 || string(again.Timeline) != string(plan.Timeline) {
		t.Fatal("replay inserted duplicate markers", err)
	}
	edits.Sections[0].Approved = false
	if _, err := BuildMediaAnalysisMarkerPlan(markerTimelineFixture(), "analysis", "revision", "target", "reference_video", source, edits); err == nil {
		t.Fatal("unreviewed measurements adopted")
	}
}

func TestMediaAnalysisMarkersFollowSplitTrimMoveRateAndRemove(t *testing.T) {
	source := analysisSourceFixture()
	edits := MediaAnalysisEdits{Version: 1, Beats: []AnalysisBeat{{ID: "beat", TimeMs: 3500, Approved: true}}}
	plan, err := BuildMediaAnalysisMarkerPlan(markerTimelineFixture(), "analysis", "revision", "target", "audio_structure", source, edits)
	if err != nil {
		t.Fatal(err)
	}
	var timeline map[string]any
	decode := func(raw []byte) {
		d := json.NewDecoder(strings.NewReader(string(raw)))
		d.UseNumber()
		if d.Decode(&timeline) != nil {
			t.Fatal("decode")
		}
	}
	decode(plan.Timeline)
	clips := timeline["clips"].([]any)
	left := objectValue(clips[0])
	left["durationMs"] = json.Number("1000")
	right := map[string]any{}
	for key, value := range left {
		right[key] = value
	}
	right["id"] = "split-right"
	right["sourceStartMs"] = json.Number("3000")
	right["startMs"] = json.Number("12000")
	right["playbackRate"] = json.Number("1")
	timeline["clips"] = append(clips, right)
	raw, _ := json.Marshal(timeline)
	clean, err := ValidateTimelineDocument(raw)
	if err != nil {
		t.Fatal(err)
	}
	decode(clean)
	var output struct {
		Markers []TimelineProductionMarker `json:"productionMarkers"`
	}
	_ = json.Unmarshal(clean, &output)
	if len(output.Markers) != 1 || output.Markers[0].TimeMs != 12500 || output.Markers[0].Source.ClipID != "split-right" {
		t.Fatal("split/rate/source mapping lost", output.Markers)
	}
	// Deleting just the source descendant removes its anchor, while a distinct
	// use of the same resource remains unchanged and does not inherit it.
	timeline["clips"] = timeline["clips"].([]any)[:3]
	raw, _ = json.Marshal(timeline)
	clean, err = ValidateTimelineDocument(raw)
	if err != nil {
		t.Fatal(err)
	}
	_ = json.Unmarshal(clean, &output)
	if len(output.Markers) != 0 {
		t.Fatal("deleted source left stale marker")
	}
}

func TestMediaAnalysisMarkersRejectAmbiguousInstancesAndMalformedReferences(t *testing.T) {
	source := analysisSourceFixture()
	edits := MediaAnalysisEdits{Version: 1, Beats: []AnalysisBeat{{ID: "beat", TimeMs: 2000, Approved: true}}}
	plan, err := BuildMediaAnalysisMarkerPlan(markerTimelineFixture(), "analysis", "revision", "target", "audio_structure", source, edits)
	if err != nil {
		t.Fatal(err)
	}
	var document map[string]json.RawMessage
	_ = json.Unmarshal(plan.Timeline, &document)
	var clips []map[string]any
	_ = json.Unmarshal(document["clips"], &clips)
	copy := map[string]any{}
	for key, value := range clips[0] {
		copy[key] = value
	}
	copy["id"] = "bad-copy"
	clips = append(clips, copy)
	document["clips"], _ = json.Marshal(clips)
	raw, _ := json.Marshal(document)
	if _, err := ValidateTimelineDocument(raw); err == nil {
		t.Fatal("ambiguous marker group accepted")
	}
	bad := strings.Replace(string(plan.Timeline), `"sourceTimeMs":2000`, `"sourceTimeMs":-1`, 1)
	if _, err := ValidateTimelineDocument([]byte(bad)); err == nil {
		t.Fatal("invalid source marker accepted")
	}
}
