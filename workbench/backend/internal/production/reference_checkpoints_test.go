package production

import (
	"strings"
	"testing"
)

func TestReferenceWindowsOverlapDoesNotInventCutsAtSeams(t *testing.T) {
	source := MediaAnalysisSource{ResourceID: "reference", SHA256: strings.Repeat("a", 64), Bytes: 1000, DurationMs: 131000, StartMs: 1000, EndMs: 131000, Width: 320, Height: 180, Windowed: true}
	plan, err := ReferenceWindows(source)
	if err != nil || len(plan) != 3 {
		t.Fatal(plan, err)
	}
	if plan[1].StartMs != 55500 || plan[1].CoreStartMs != 56000 || plan[0].EndMs != 56500 {
		t.Fatal("seam context missing", plan)
	}
	parts := []MediaAnalysisEdits{}
	for _, part := range plan {
		parts = append(parts, MediaAnalysisEdits{Version: 1, Sections: []AnalysisSection{{ID: "first", StartMs: part.StartMs, EndMs: part.EndMs}}})
	}
	merged, err := MergeReferenceWindows(source, parts)
	if err != nil || len(merged.Sections) != 1 || merged.Sections[0].StartMs != 1000 || merged.Sections[0].EndMs != 131000 {
		t.Fatal("invented checkpoint boundary cut", err, merged)
	}
	// A real change exactly at a seam is measured with preceding overlap.
	parts[1].Sections = []AnalysisSection{{ID: "first", StartMs: 55500, EndMs: 56000}, {ID: "second", StartMs: 56000, EndMs: 111500}}
	merged, err = MergeReferenceWindows(source, parts)
	if err != nil || len(merged.Sections) != 2 || merged.Sections[1].StartMs != 56000 {
		t.Fatal("lost actual seam cut", err, merged)
	}
	if merged.Sections[0].Approved || merged.Sections[1].Approved {
		t.Fatal("measurement automatically approved")
	}
}

func TestReferenceWindowsRequiresCompleteBoundedReferenceMeasurements(t *testing.T) {
	source := MediaAnalysisSource{ResourceID: "reference", SHA256: strings.Repeat("a", 64), Bytes: 1000, DurationMs: 1800001, StartMs: 0, EndMs: 1800001, Width: 320, Height: 180, Windowed: true}
	if _, err := ReferenceWindows(source); err == nil {
		t.Fatal("unbounded source")
	}
	source.EndMs = 66000
	if ValidateMediaAnalysisSource(source, "subject_track") == nil {
		t.Fatal("windowing escaped tracking limit")
	}
	if _, err := MergeReferenceWindows(source, nil); err == nil {
		t.Fatal("incomplete checkpoints accepted")
	}
	source.Windowed = false
	if ValidateMediaAnalysisSource(source, "reference_video") == nil {
		t.Fatal("short analysis silently accepted long source")
	}
}
