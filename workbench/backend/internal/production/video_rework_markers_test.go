package production

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestVideoReworkWholeSourceAnalysisAnchorsRetainOriginalClockAcrossChainedRepair(t *testing.T) {
	raw, request, source, candidate := reworkFixture(t)
	document, _ := videoReworkDocument(raw)
	document["productionMarkers"] = []TimelineProductionMarker{{ID: "measured-beat", Kind: "beat", Label: "已核对节拍", TimeMs: 1500, Source: &TimelineMarkerSource{AnalysisID: "measured-analysis", RevisionID: "reviewed-revision", ItemID: "beat-1", ClipID: "first-use", OccurrenceID: "first-use", ResourceID: "original", SourceTimeMs: 3000}}}
	raw, _ = json.Marshal(document)
	first, err := PlanWholeSourceVideoRework(raw, request, source, candidate)
	if err != nil {
		t.Fatal(err)
	}
	derived := VideoReworkMedia{"derived-one", strings.Repeat("3", 64), 512, 512, 10000}
	after, err := ApplyVideoReworkCandidate(raw, first, derived, "version-one", "task-one", nil)
	if err != nil {
		t.Fatal(err)
	}
	original, hash, err := ReadVideoReworkClip(after, "first-use")
	if err != nil {
		t.Fatal(err)
	}
	request.ClipSHA256, request.SourceResourceID, request.SourceSHA256 = hash, derived.ResourceID, derived.SHA256
	second, err := PlanWholeSourceVideoRework(after, request, derived, candidate)
	if err != nil {
		t.Fatal(err)
	}
	derivedTwo := VideoReworkMedia{"derived-two", strings.Repeat("4", 64), 512, 512, 10000}
	chained, err := ApplyVideoReworkCandidate(after, second, derivedTwo, "version-two", "task-two", nil)
	if err != nil {
		t.Fatal(err)
	}
	split, position, rate := int64(1500), int64(12000), .5
	edited, err := ApplyTimelineEdits(chained, []TimelineEditCommand{{Op: "splitClip", ID: "first-use", SplitAtMs: &split}, {Op: "moveClip", ID: "first-use:split:1500", StartMs: &position}, {Op: "setClipPlaybackRate", ID: "first-use:split:1500", PlaybackRate: &rate}})
	if err != nil {
		t.Fatal(err)
	}
	_, hash, err = ReadVideoReworkClip(edited, "first-use:split:1500")
	if err != nil {
		t.Fatal(err)
	}
	undone, err := RestoreWholeSourceVideoRework(edited, "first-use:split:1500", "task-two", hash, VideoReworkRestoration{OriginalClip: original, Source: derived, Derived: derivedTwo})
	if err != nil {
		t.Fatal(err)
	}
	var final struct {
		Markers []TimelineProductionMarker `json:"productionMarkers"`
	}
	json.Unmarshal(undone, &final)
	if len(final.Markers) != 1 || final.Markers[0].TimeMs != 12000 || final.Markers[0].Source.ResourceID != "original" || final.Markers[0].Source.SourceTimeMs != 3000 || final.Markers[0].Source.ClipID != "first-use:split:1500" {
		t.Fatalf("analysis provenance or source clock changed: %+v", final.Markers)
	}
}
