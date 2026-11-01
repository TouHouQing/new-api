package production

import (
	"encoding/json"
	"math"
	"strings"
	"testing"
)

func analysisSourceFixture() MediaAnalysisSource {
	return MediaAnalysisSource{ResourceID: "original", SHA256: strings.Repeat("a", 64), Bytes: 1024, DurationMs: 20000, StartMs: 1000, EndMs: 6000, Width: 1920, Height: 1080}
}

func TestMediaAnalysisSourceBoundsAndImmutableOccurrenceBinding(t *testing.T) {
	source := analysisSourceFixture()
	if err := ValidateMediaAnalysisSource(source, "reference_video"); err != nil {
		t.Fatal(err)
	}
	for _, change := range []func(*MediaAnalysisSource){func(s *MediaAnalysisSource) { s.SHA256 = "" }, func(s *MediaAnalysisSource) { s.StartMs = -1 }, func(s *MediaAnalysisSource) { s.EndMs = s.DurationMs + 1 }, func(s *MediaAnalysisSource) { s.SourceClipID = "clip" }, func(s *MediaAnalysisSource) { s.EndMs = s.StartMs + 49 }} {
		candidate := source
		change(&candidate)
		if ValidateMediaAnalysisSource(candidate, "reference_video") == nil {
			t.Fatal("invalid source accepted", candidate)
		}
	}
	source.SourceClipID = "clip"
	source.ClipBindingSHA256 = strings.Repeat("b", 64)
	if err := ValidateMediaAnalysisSource(source, "subject_track"); err != nil {
		t.Fatal(err)
	}
}

func TestMediaAnalysisEditsRetainSourceBoundsAndRequireExplicitManualReview(t *testing.T) {
	source := analysisSourceFixture()
	edits := MediaAnalysisEdits{Version: 1, Sections: []AnalysisSection{{ID: "second", StartMs: 3000, EndMs: 6000}, {ID: "first", StartMs: 1000, EndMs: 3000}}}
	validated, err := ValidateMediaAnalysisEdits(source, "reference_video", edits)
	if err != nil || validated.Sections[0].ID != "first" || edits.Sections[0].ID != "second" {
		t.Fatal("bad sorted copy", err)
	}
	edits.Sections[0].StartMs = 2000
	if _, err := ValidateMediaAnalysisEdits(source, "reference_video", edits); err == nil {
		t.Fatal("overlapping sections accepted")
	}
	point := AnalysisTrackingPoint{ID: "manual:one", TimeMs: 1000, ROI: AnalysisRectangle{X: 0.1, Y: 0.1, Width: 0.2, Height: 0.2}, Crop: AnalysisRectangle{Width: 0.5, Height: 1}, Manual: true}
	tracking := MediaAnalysisEdits{Version: 1, Tracking: []AnalysisTrackingPoint{point}}
	if _, err := ValidateMediaAnalysisEdits(source, "subject_track", tracking); err == nil {
		t.Fatal("manual override without review accepted")
	}
	tracking.Tracking[0].Reviewed = true
	if _, err := ValidateMediaAnalysisEdits(source, "subject_track", tracking); err != nil {
		t.Fatal(err)
	}
	tracking.Tracking[0].ROI.X = math.NaN()
	if _, err := ValidateMediaAnalysisEdits(source, "subject_track", tracking); err == nil {
		t.Fatal("nonfinite tracking accepted")
	}
}

func TestMediaAnalysisEvidenceMapsOriginalWindowAndKeepsAllCandidatesUnapproved(t *testing.T) {
	source := analysisSourceFixture()
	normalized := strings.Repeat("c", 64)
	raw := json.RawMessage(`{"engine_version":1,"kind":"audio_structure","input_digest":"` + normalized + `","cache_key":"` + strings.Repeat("d", 64) + `","duration":5,"method":"measured beats","sections":[{"start":0,"end":5,"label":"section_candidate"}],"beat_times":[0,0.5,4.9998]}`)
	edits, err := InitialMediaAnalysisEdits(source, "audio_structure", raw, normalized)
	if err != nil {
		t.Fatal(err)
	}
	if edits.Sections[0].StartMs != 1000 || edits.Sections[0].EndMs != 6000 || edits.Beats[1].TimeMs != 1500 || edits.Beats[2].TimeMs != 5999 {
		t.Fatal("source-window mapping changed", edits)
	}
	if edits.Sections[0].Approved || edits.Beats[0].Approved {
		t.Fatal("measurement was treated as user approval")
	}
	if _, err := InitialMediaAnalysisEdits(source, "audio_structure", raw, strings.Repeat("e", 64)); err == nil {
		t.Fatal("wrong normalized source digest accepted")
	}
}

func TestMediaAnalysisProxyTailDoesNotExtendSourceInterval(t *testing.T) {
	source := analysisSourceFixture()
	source.EndMs = 1050
	normalized := strings.Repeat("c", 64)
	raw := json.RawMessage(`{"engine_version":1,"kind":"reference_video","input_digest":"` + normalized + `","cache_key":"` + strings.Repeat("d", 64) + `","duration":0.125,"method":"measured frame changes","sections":[{"start":0,"end":0.125}]}`)
	edits, err := InitialMediaAnalysisEdits(source, "reference_video", raw, normalized)
	if err != nil || edits.Sections[0].EndMs != 1050 {
		t.Fatal("partial proxy frame extended actual source", err)
	}
}
