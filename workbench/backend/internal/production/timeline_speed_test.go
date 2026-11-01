package production

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestTranscriptCutMapsFastAndSlowOccurrencesWithoutChangingOtherUses(t *testing.T) {
	for _, test := range []struct {
		rate, length, removed, secondProgram, secondLength int64
	}{{2, 8010, 2510, 2500, 3000}, {1, 16020, 5020, 5000, 6000}} {
		raw, document := cutFixture(t)
		var timeline map[string]any
		_ = json.Unmarshal(raw, &timeline)
		voice := timeline["clips"].([]any)[0].(map[string]any)
		voice["playbackRate"], voice["durationMs"], voice["sourceDurationMs"] = test.rate, test.length, 16020
		encoded, _ := json.Marshal(timeline)
		plan, err := PlanTranscriptCut(encoded, document, "text", "v1", "speech", "voice", "clip_only", []string{"s1", "s3"})
		if err != nil {
			t.Fatal(err)
		}
		if plan.RemovedMs != test.removed || plan.KeptRanges[1].SourceStartMs != 9000 || plan.KeptRanges[1].ProgramStartMs != test.secondProgram {
			t.Fatalf("wrong source/program mapping: %+v", plan)
		}
		clips := cutClips(t, plan.Timeline)
		second := clips[plan.KeptRanges[1].ClipID]
		if second["sourceStartMs"] != float64(9000) || second["durationMs"] != float64(test.secondLength) || second["playbackRate"] != float64(test.rate) {
			t.Fatalf("lost concrete source range/rate: %+v", second)
		}
		if clips["repeat"]["startMs"] != float64(20000) || clips["repeat"]["sourceStartMs"] != float64(1000) {
			t.Fatal("same-resource occurrence changed")
		}
	}
	// A slow source and an independently fast music clip must each advance
	// their own source cursor when a ripple cut crosses both occurrences.
	raw := json.RawMessage(`{"version":2,"tracks":[{"id":"a","kind":"audio"},{"id":"m","kind":"audio"}],"clips":[{"id":"voice","kind":"audio","trackId":"a","startMs":0,"durationMs":8000,"sourceStartMs":1000,"sourceDurationMs":6000,"playbackRate":0.5,"directMedia":{"storageKey":"resource:speech"}},{"id":"music","kind":"audio","trackId":"m","startMs":0,"durationMs":8000,"sourceDurationMs":24000,"playbackRate":3,"directMedia":{"storageKey":"resource:music"}}]}`)
	doc := TranscriptDocument{Version: 1, Precision: "segment", Segments: []TranscriptSpan{{ID: "a", StartMs: 1000, EndMs: 2000, Text: "保留"}, {ID: "b", StartMs: 2000, EndMs: 3000, Text: "删去"}, {ID: "c", StartMs: 3000, EndMs: 5000, Text: "保留结尾"}}}
	plan, err := PlanTranscriptCut(raw, doc, "text", "v1", "speech", "voice", "ripple", []string{"a", "c"})
	if err != nil {
		t.Fatal(err)
	}
	if plan.RemovedMs != 2000 || plan.AfterDurationMs != 6000 || plan.KeptRanges[1].SourceStartMs != 3000 || plan.KeptRanges[1].ProgramStartMs != 2000 {
		t.Fatalf("slow mapping failed: %+v", plan)
	}
	var after struct {
		Clips []map[string]any `json:"clips"`
	}
	_ = json.Unmarshal(plan.Timeline, &after)
	found := false
	for _, clip := range after.Clips {
		if clip["playbackRate"] == float64(3) && clip["startMs"] == float64(2000) {
			found = clip["sourceStartMs"] == float64(12000)
		}
	}
	if !found {
		t.Fatal("ripple used voice speed for a separate music occurrence")
	}
}

func TestTimelinePlaybackRateRejectsAmbiguousRetimeAndSourceOverflow(t *testing.T) {
	base := `{"version":2,"tracks":[{"id":"a","kind":"audio"}],"clips":[{"id":"v","kind":"audio","trackId":"a","startMs":0,"durationMs":1000,"sourceDurationMs":4000,RATE}]}`
	for _, rate := range []string{`"playbackRate":0`, `"playbackRate":4.01`, `"playbackRate":"2"`, `"playbackRate":null`, `"speed":2`, `"playbackRate":2,"timeRemap":[]`, `"playbackRate":4,"sourceStartMs":1`} {
		if _, err := ValidateTimelineDocument(json.RawMessage(strings.Replace(base, "RATE", rate, 1))); err == nil {
			t.Fatalf("unsafe rate accepted: %s", rate)
		}
	}
	for _, rate := range []string{`"playbackRate":0.25`, `"playbackRate":4`, `"playbackRate":1.333`, `"speed":1`} {
		if _, err := ValidateTimelineDocument(json.RawMessage(strings.Replace(base, "RATE", rate, 1))); err != nil {
			t.Fatalf("valid rate rejected: %s", rate)
		}
	}
}
