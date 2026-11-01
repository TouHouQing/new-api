package production

import (
	"encoding/json"
	"strings"
	"testing"
)

func reframeFixture() (MediaAnalysisSource, MediaAnalysisEdits, json.RawMessage) {
	source := MediaAnalysisSource{ResourceID: "original", SHA256: strings.Repeat("a", 64), Bytes: 100, DurationMs: 6000, StartMs: 1000, EndMs: 5000, Width: 320, Height: 180}
	edits := MediaAnalysisEdits{Version: 1, Tracking: []AnalysisTrackingPoint{
		{ID: "point:0", TimeMs: 1000, ROI: AnalysisRectangle{0, 0, .1, .1}, Crop: AnalysisRectangle{0, 0, .5, 1}, Reviewed: true},
		{ID: "point:1", TimeMs: 3000, ROI: AnalysisRectangle{.2, 0, .1, .1}, Crop: AnalysisRectangle{.25, 0, .5, 1}, Reviewed: true},
		{ID: "point:2", TimeMs: 4875, ROI: AnalysisRectangle{.4, 0, .1, .1}, Crop: AnalysisRectangle{.5, 0, .5, 1}, Reviewed: true, Manual: true},
	}}
	return source, edits, json.RawMessage(`{"points":[{"confidence":1},{"confidence":1},{"confidence":0,"review_required":true}]}`)
}

func TestReframePlanPreservesOtherOccurrencesAndSourceClock(t *testing.T) {
	source, edits, evidence := reframeFixture()
	plan, err := BuildMediaAnalysisReframePlan(markerTimelineFixture(), "analysis", "revision", "target", source, edits, evidence)
	if err != nil {
		t.Fatal(err)
	}
	var result struct {
		Clips []struct {
			ID      string           `json:"id"`
			Reframe *TimelineReframe `json:"reframe"`
		}
	}
	_ = json.Unmarshal(plan.Timeline, &result)
	if result.Clips[0].Reframe == nil || result.Clips[1].Reframe != nil || result.Clips[2].Reframe != nil {
		t.Fatal("applied crop to another occurrence")
	}
	var document map[string]any
	decoder := json.NewDecoder(strings.NewReader(string(plan.Timeline)))
	decoder.UseNumber()
	_ = decoder.Decode(&document)
	clip := document["clips"].([]any)[0].(map[string]any)
	clip["sourceStartMs"] = json.Number("3000")
	clip["durationMs"] = json.Number("1000")
	clip["startMs"] = json.Number("12000")
	encoded, _ := json.Marshal(document)
	if _, err := ValidateTimelineDocument(encoded); err != nil {
		t.Fatal("split/retimed descendant lost source crop", err)
	}
	clip["durationMs"] = json.Number("2000")
	encoded, _ = json.Marshal(document)
	if _, err := ValidateTimelineDocument(encoded); err == nil {
		t.Fatal("accepted crop beyond measured interval")
	}
}

func TestReframeRejectsUnreviewedLossVariableScaleAndWrongSource(t *testing.T) {
	source, edits, evidence := reframeFixture()
	for _, change := range []func(*MediaAnalysisEdits){
		func(e *MediaAnalysisEdits) { e.Tracking[1].Reviewed = false },
		func(e *MediaAnalysisEdits) { e.Tracking[2].Manual = false },
		func(e *MediaAnalysisEdits) { e.Tracking[1].Crop.Height = .8 },
	} {
		raw, _ := json.Marshal(edits)
		var altered MediaAnalysisEdits
		_ = json.Unmarshal(raw, &altered)
		change(&altered)
		if _, err := BuildTimelineReframe("analysis", "revision", source, altered, evidence); err == nil {
			t.Fatal("accepted unreviewed/lost/variable crop")
		}
	}
	source.ResourceID = "foreign"
	if _, err := BuildMediaAnalysisReframePlan(markerTimelineFixture(), "analysis", "revision", "target", source, edits, evidence); err == nil {
		t.Fatal("accepted another source")
	}
}

func TestReframeCompressionPreservesNonlinearKeysWithinPixelTolerance(t *testing.T) {
	keys := []ReframeKey{{1000, 0, 0}, {2000, .1, 0}, {3000, .2, 0}, {4000, .4, 0}}
	result := compactReframeKeys(keys, 1000, 1000)
	if len(result) != 3 || result[1].TimeMs != 3000 {
		t.Fatal("discarded nonlinear motion", result)
	}
}

func TestManualFramingRequiresExplicitReviewAndDoesNotForgeTracking(t *testing.T) {
	source, edits, _ := reframeFixture()
	evidence := json.RawMessage(`{"method":"user-defined-framing-v1","algorithm_measurement":false}`)
	for i := range edits.Tracking {
		edits.Tracking[i].ID = "manual:" + edits.Tracking[i].ID
	}
	if _, err := BuildTimelineReframe("analysis", "revision", source, edits, evidence); err == nil {
		t.Fatal("unchecked manual proposal accepted")
	}
	for i := range edits.Tracking {
		edits.Tracking[i].Manual = true
	}
	if _, err := BuildTimelineReframe("analysis", "revision", source, edits, evidence); err != nil {
		t.Fatal("explicit reviewed manual path requires nonexistent CPU measurement", err)
	}
	if _, err := BuildTimelineReframe("analysis", "revision", source, edits, json.RawMessage(`{"method":"cpu-track","points":[]}`)); err == nil {
		t.Fatal("manual identifiers bypassed original CPU evidence validation")
	}
}
