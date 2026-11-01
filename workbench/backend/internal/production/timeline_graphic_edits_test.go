package production

import (
	"encoding/json"
	"testing"
)

func TestTimelineMotionEditsAreAtomicAndKeepSplitClock(t *testing.T) {
	raw := json.RawMessage(`{"version":2,"tracks":[],"clips":[],"durationMs":0}`)
	g := MotionGraphic{Version: 1, Kind: "text", X: .5, Y: .5, Size: 64, Color: "#ffffff", Animation: "fade", BPM: 120, PhaseDurationMs: 3000}
	start, duration, text := int64(0), int64(3000), "开场 {%{pts}}"
	add := TimelineEditCommand{Op: "addGraphic", ID: "title", Text: &text, StartMs: &start, DurationMs: &duration, Graphic: &g}
	added, err := ApplyTimelineEdits(raw, []TimelineEditCommand{add})
	if err != nil {
		t.Fatal(err)
	}
	if string(raw) != `{"version":2,"tracks":[],"clips":[],"durationMs":0}` {
		t.Fatal("input changed")
	}
	if _, err = ApplyTimelineEdits(added, []TimelineEditCommand{add}); err == nil {
		t.Fatal("duplicate id accepted")
	}
	split := int64(1000)
	cut, err := ApplyTimelineEdits(added, []TimelineEditCommand{{Op: "splitClip", ID: "title", SplitAtMs: &split}})
	if err != nil {
		t.Fatal(err)
	}
	var doc map[string]any
	_ = json.Unmarshal(cut, &doc)
	rows := listValue(doc["clips"])
	if len(rows) != 2 {
		t.Fatal("split lost occurrences")
	}
	right := objectValue(rows[1])
	id := stringValue(right, "id")
	if numberValue(right["sourceStartMs"]) != 1000 {
		t.Fatal("split restarted animation")
	}
	changed := g
	changed.X = .8
	moved, err := ApplyTimelineEdits(cut, []TimelineEditCommand{{Op: "setGraphic", ID: id, Graphic: &changed}})
	if err != nil {
		t.Fatal(err)
	}
	_ = json.Unmarshal(moved, &doc)
	right = objectValue(listValue(doc["clips"])[1])
	if numberValue(right["sourceStartMs"]) != 1000 {
		t.Fatal("appearance restarted animation")
	}
	yes := true
	reset, err := ApplyTimelineEdits(moved, []TimelineEditCommand{{Op: "setGraphic", ID: id, Graphic: &changed, Restart: &yes}})
	if err != nil {
		t.Fatal(err)
	}
	_ = json.Unmarshal(reset, &doc)
	right = objectValue(listValue(doc["clips"])[1])
	if numberValue(right["sourceStartMs"]) != 0 || numberValue(objectValue(right["graphic"])["phaseDurationMs"]) != 2000 {
		t.Fatal("explicit restart did not fit current occurrence")
	}
	for _, bad := range []TimelineEditCommand{{Op: "addGraphic", ID: "bad", Text: &text, StartMs: &start, DurationMs: &duration, Graphic: &g, ResourceID: "unexpected"}, {Op: "setGraphic", ID: "title", Graphic: &g, StartMs: &start}, {Op: "moveClip", ID: "title", StartMs: &start, Graphic: &g}} {
		if _, err := ApplyTimelineEdits(added, []TimelineEditCommand{bad}); err == nil {
			t.Fatalf("unexpected fields accepted %+v", bad)
		}
	}
}
