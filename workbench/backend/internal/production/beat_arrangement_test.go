package production

import (
	"encoding/json"
	"math"
	"math/rand"
	"reflect"
	"strings"
	"testing"
)

func beatArrangementFixture() (json.RawMessage, BeatArrangementSource) {
	raw := json.RawMessage(`{"version":2,"tracks":[{"id":"v","kind":"video"},{"id":"a","kind":"audio"},{"id":"s","kind":"subtitle"}],"clips":[{"id":"first","kind":"video","trackId":"v","startMs":1000,"durationMs":5000,"sourceStartMs":400,"sourceDurationMs":10000},{"id":"second","kind":"video","trackId":"v","startMs":6000,"durationMs":5000,"sourceDurationMs":10000},{"id":"music","kind":"audio","trackId":"a","startMs":1000,"durationMs":6000,"sourceStartMs":1000,"playbackRate":2,"directMedia":{"storageKey":"resource:original"}},{"id":"independent","kind":"audio","trackId":"a","startMs":12000,"durationMs":1000},{"id":"caption","kind":"subtitle","trackId":"s","startMs":1100,"durationMs":500,"text":"已选镜头字幕","captionLink":{"sourceClipId":"first","sourceStartMs":500,"sourceEndMs":1000}}]}`)
	source := MediaAnalysisSource{ResourceID: "original", SHA256: strings.Repeat("a", 64), Bytes: 1024, DurationMs: 15000, StartMs: 0, EndMs: 15000}
	doc := MediaAnalysisEdits{Version: 1, Beats: []AnalysisBeat{{ID: "unreviewed", TimeMs: 6500}, {ID: "actual", TimeMs: 7400, Approved: true}, {ID: "late", TimeMs: 11200, Approved: true}}}
	return raw, BeatArrangementSource{Source: source, Document: doc}
}
func TestBeatArrangementUsesApprovedSourceClocksAndPreservesIndependentMedia(t *testing.T) {
	raw, source := beatArrangementFixture()
	before := string(raw)
	plan, err := PlanBeatArrangement(raw, "analysis", "revision", "music", []string{"first", "second"}, source)
	if err != nil || len(plan.Clips) != 2 || len(plan.Boundaries) != 1 {
		t.Fatal(plan, err)
	}
	// Source beat7400, trimmed source1000, speed2 => program4200.
	if plan.Clips[0].StartMs != 1000 || plan.Clips[0].EndMs != 4200 || plan.Clips[1].StartMs != 4200 || plan.Clips[1].EndMs != 7000 || plan.Boundaries[0].Source.ItemID != "actual" {
		t.Fatal("invented or unapproved beat selected", plan)
	}
	var left, right struct{ Clips []map[string]any }
	json.Unmarshal(raw, &left)
	json.Unmarshal(plan.Timeline, &right)
	byID := func(rows []map[string]any, id string) map[string]any {
		for _, r := range rows {
			if r["id"] == id {
				return r
			}
		}
		return nil
	}
	if !reflect.DeepEqual(byID(left.Clips, "independent"), byID(right.Clips, "independent")) || byID(right.Clips, "first")["sourceStartMs"] != float64(400) || byID(right.Clips, "music")["durationMs"] != float64(6000) || string(raw) != before {
		t.Fatal("unrelated media or original source was altered")
	}
}
func TestBeatArrangementRejectsInsufficientSourceUnreviewedBeatsAndForeignOverlap(t *testing.T) {
	raw, source := beatArrangementFixture()
	for _, mode := range []string{"unreviewed", "too-short", "duplicate", "overlap", "locked", "foreign-source", "forged-command"} {
		t.Run(mode, func(t *testing.T) {
			copy := source
			copy.Document.Beats = append([]AnalysisBeat{}, source.Document.Beats...)
			text := string(raw)
			ids := []string{"first", "second"}
			switch mode {
			case "unreviewed":
				for i := range copy.Document.Beats {
					copy.Document.Beats[i].Approved = false
				}
			case "too-short":
				text = strings.ReplaceAll(text, `"durationMs":5000`, `"durationMs":1000`)
			case "duplicate":
				ids = []string{"first", "first"}
			case "overlap":
				text = strings.Replace(text, `"clips":[`, `"clips":[{"id":"unselected","kind":"video","trackId":"v","startMs":2000,"durationMs":800},`, 1)
			case "locked":
				text = strings.Replace(text, `"id":"v","kind":"video"`, `"id":"v","kind":"video","locked":true`, 1)
			case "foreign-source":
				copy.Source.ResourceID = "foreign"
			case "forged-command":
				if _, err := ApplyTimelineEdits(raw, []TimelineEditCommand{{Op: "arrangeToBeats", AnalysisID: "analysis", AnalysisRevisionID: "revision", SourceClipID: "music", ClipIDs: ids}}); err == nil {
					t.Fatal("client supplied unhydrated measurement accepted")
				}
				return
			}
			if _, err := PlanBeatArrangement(json.RawMessage(text), "analysis", "revision", "music", ids, copy); err == nil {
				t.Fatal("invalid beat plan accepted")
			}
		})
	}
}
func TestBeatArrangementDynamicProgramMatchesExhaustiveFeasibilityAndCost(t *testing.T) {
	rng := rand.New(rand.NewSource(71))
	for run := 0; run < 200; run++ {
		points := []int64{0}
		for i := 0; i < 7; i++ {
			points = append(points, points[len(points)-1]+int64(180+rng.Intn(450)))
		}
		capacities := []int64{int64(400 + rng.Intn(1500)), int64(400 + rng.Intn(1500)), int64(400 + rng.Intn(1500))}
		best := math.Inf(1)
		var visit func(int, int, float64)
		visit = func(stage, from int, cost float64) {
			if stage == len(capacities) {
				if from == len(points)-1 && cost < best {
					best = cost
				}
				return
			}
			for end := from + 1; end < len(points); end++ {
				duration := points[end] - points[from]
				if duration < 250 || duration > capacities[stage] {
					continue
				}
				if stage < len(capacities)-1 && end == len(points)-1 || stage == len(capacities)-1 && end != len(points)-1 {
					continue
				}
				target := float64(points[len(points)-1]) * float64(stage+1) / float64(len(capacities))
				visit(stage+1, end, cost+math.Abs(float64(points[end])-target))
			}
		}
		visit(0, 0, 0)
		result, ok := beatBoundaries(points, capacities)
		if ok == math.IsInf(best, 1) {
			t.Fatalf("feasibility differs: %v %v %v", points, capacities, result)
		}
		if ok {
			cost := float64(0)
			for i := 1; i < len(result); i++ {
				cost += math.Abs(float64(result[i]) - float64(points[len(points)-1])*float64(i)/float64(len(capacities)))
			}
			if cost != best {
				t.Fatalf("cost %v != optimum %v", cost, best)
			}
		}
	}
}
