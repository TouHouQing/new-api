package production

import (
	"math"
	"strings"
	"testing"
)

func TestVideoReworkProjectsAll128ReviewedFramingKeysWithoutChangingTheirCurve(t *testing.T) {
	original := TimelineReframe{AnalysisID: "original-analysis", RevisionID: "reviewed-version", ResourceID: "source", SourceSHA256: strings.Repeat("1", 64), SourceWidth: 512, SourceHeight: 512, Width: .5, Height: 1, StartMs: 0, EndMs: 20000}
	for i := 0; i < 128; i++ {
		original.Keys = append(original.Keys, ReframeKey{TimeMs: int64(100 + 156*i), X: .1 + float64(i)*.001, Y: 0})
	}
	if !original.Valid() {
		t.Fatal("Framing fixture must be a valid reviewed native curve")
	}
	derived := VideoReworkMedia{"derived", strings.Repeat("3", 64), 512, 512, 20000}
	for _, interval := range [][2]int64{{0, 20000}, {156, 19880}, {0, 100}, {19800, 20000}, {500, 1500}} {
		plan := VideoReworkPlan{Version: 1, Request: VideoReworkRequest{SourceStartMs: interval[0], SourceEndMs: interval[1]}, Source: VideoReworkMedia{ResourceID: original.ResourceID, SHA256: original.SourceSHA256}}
		projected, err := ProjectVideoReworkReframe(original, plan, derived, "derived-analysis", "derived-version")
		if err != nil || !projected.Valid() || len(projected.Keys) > 128 || projected.ResourceID != derived.ResourceID || projected.SourceSHA256 != derived.SHA256 || projected.StartMs != 0 || projected.EndMs != interval[1]-interval[0] {
			t.Fatalf("Projection changed identity, lost coverage or exceeded original key limit: %+v %v", projected, err)
		}
		position := func(time int64) float64 {
			if time <= 100 {
				return .1
			}
			if time >= 19912 {
				return .227
			}
			return .1 + float64(time-100)*.001/156
		}
		for at := int64(0); at < projected.EndMs; at += 33 {
			x := projected.Keys[len(projected.Keys)-1].X
			if at <= projected.Keys[0].TimeMs {
				x = projected.Keys[0].X
			} else {
				for i := 1; i < len(projected.Keys); i++ {
					left, right := projected.Keys[i-1], projected.Keys[i]
					if at <= right.TimeMs {
						x = left.X + (right.X-left.X)*float64(at-left.TimeMs)/float64(right.TimeMs-left.TimeMs)
						break
					}
				}
			}
			if math.Abs(x-position(at+interval[0])) > 1e-12 {
				t.Fatalf("Crop curve changed at source %d: %v", at+interval[0], x)
			}
		}
	}
	plan := VideoReworkPlan{Version: 1, Request: VideoReworkRequest{SourceStartMs: 0, SourceEndMs: 20000}, Source: VideoReworkMedia{ResourceID: original.ResourceID, SHA256: strings.Repeat("f", 64)}}
	if _, err := ProjectVideoReworkReframe(original, plan, derived, "analysis", "revision"); err == nil {
		t.Fatal("A framing curve from another source digest was accepted")
	}
}
