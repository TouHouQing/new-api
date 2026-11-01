package production

import (
	"encoding/json"
	"math"
	"testing"
)

func TestTimelineMotionClockSurvivesSplitMoveAndTrim(t *testing.T) {
	g := MotionGraphic{Version: 1, Kind: "shape", X: .5, Y: .7, Size: 100, Color: "#ff0000", Shape: "square", Animation: "bounce", BPM: 120, PhaseOffsetMs: 150, PhaseDurationMs: 4000}
	whole := SampleMotionGraphic(g, 1000, 4000, 0, 2600, 640, 384)
	split := SampleMotionGraphic(g, 2500, 2500, 1500, 2600, 640, 384)
	if whole != split {
		t.Fatalf("split restarted animation: %+v %+v", whole, split)
	}
	moved := SampleMotionGraphic(g, 5000, 2500, 1500, 5100, 640, 384)
	if moved != whole {
		t.Fatalf("move changed source animation: %+v %+v", whole, moved)
	}
	if SampleMotionGraphic(g, 1000, 4000, 0, 5000, 640, 384).Visible {
		t.Fatal("end boundary included")
	}
	g.Animation = "pulse"
	g.PhaseOffsetMs = 0
	peak := SampleMotionGraphic(g, 1000, 4000, 0, 1125, 640, 384)
	if math.Abs(peak.Opacity-1) > 1e-9 || math.Abs(peak.Scale-1) > 1e-9 {
		t.Fatal("pulse differs from original formula", peak)
	}
}

func TestTimelineMotionAdmissionRejectsUnknownFieldsAndUnownedAddresses(t *testing.T) {
	base := `{"version":1,"kind":"image","x":0.5,"y":0.5,"size":64,"color":"#ffffff","resourceId":"owned-resource","animation":"fade","bpm":120,"phaseDurationMs":2000}`
	var good MotionGraphic
	if err := json.Unmarshal([]byte(base), &good); err != nil {
		t.Fatal(err)
	}
	for _, change := range []map[string]any{{"url": "https://example.invalid/image.png"}, {"size": 100000}, {"x": 1.1}, {"animation": "morph"}, {"fontFamily": "arbitrary-font"}, {"resourceId": ""}, {"color": "red:enable=1"}, {"phaseDurationMs": 0}} {
		var row map[string]any
		_ = json.Unmarshal([]byte(base), &row)
		for key, value := range change {
			row[key] = value
		}
		raw, _ := json.Marshal(row)
		if err := json.Unmarshal(raw, &good); err == nil {
			t.Fatalf("invalid graphic accepted: %s", raw)
		}
	}
}
