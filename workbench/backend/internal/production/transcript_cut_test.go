package production

import (
	"encoding/json"
	"strings"
	"testing"
)

func cutFixture(t *testing.T) (json.RawMessage, TranscriptDocument) {
	t.Helper()
	raw := json.RawMessage(`{"version":2,"tracks":[{"id":"v","kind":"video","label":"画面"},{"id":"a","kind":"audio","label":"旁白"},{"id":"s","kind":"subtitle","label":"字幕"},{"id":"m","kind":"audio","label":"音乐"}],"clips":[
    {"id":"voice","kind":"audio","trackId":"a","startMs":0,"durationMs":16020,"directMedia":{"storageKey":"resource:speech","title":"原始语音"}},
    {"id":"repeat","kind":"audio","trackId":"a","startMs":20000,"durationMs":8000,"sourceStartMs":1000,"directMedia":{"storageKey":"resource:speech","title":"重复使用"}},
    {"id":"image","kind":"image","trackId":"v","startMs":0,"durationMs":28000,"directMedia":{"storageKey":"resource:image"}},
    {"id":"music","kind":"audio","trackId":"m","startMs":5000,"durationMs":1000,"directMedia":{"storageKey":"resource:tone"}},
    {"id":"caption1","kind":"subtitle","trackId":"s","startMs":0,"durationMs":5000,"text":"第一句","productionBinding":{"transcriptId":"text","transcriptRevisionId":"v1","transcriptSegmentId":"s1","sourceClipId":"voice"}},
    {"id":"caption2","kind":"subtitle","trackId":"s","startMs":5000,"durationMs":4000,"text":"第二句","productionBinding":{"transcriptId":"text","transcriptRevisionId":"v1","transcriptSegmentId":"s2","sourceClipId":"voice"}},
    {"id":"caption3","kind":"subtitle","trackId":"s","startMs":9000,"durationMs":6000,"text":"第三句","productionBinding":{"transcriptId":"text","transcriptRevisionId":"v1","transcriptSegmentId":"s3","sourceClipId":"voice"}},
    {"id":"repeatCaption1","kind":"subtitle","trackId":"s","startMs":20000,"durationMs":4000,"text":"另一个使用实例","productionBinding":{"transcriptId":"text","transcriptRevisionId":"v1","transcriptSegmentId":"s1","sourceClipId":"repeat"}}
    ],"durationMs":28000}`)
	document := TranscriptDocument{Version: 1, Precision: "segment", Segments: []TranscriptSpan{{ID: "s1", StartMs: 0, EndMs: 5000, Text: "第一句"}, {ID: "s2", StartMs: 5000, EndMs: 9000, Text: "第二句"}, {ID: "s3", StartMs: 9000, EndMs: 15000, Text: "第三句"}}}
	return raw, document
}
func cutClips(t *testing.T, raw json.RawMessage) map[string]map[string]any {
	t.Helper()
	var result struct {
		Clips []map[string]any `json:"clips"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		t.Fatal(err)
	}
	clips := map[string]map[string]any{}
	for _, clip := range result.Clips {
		clips[clip["id"].(string)] = clip
	}
	return clips
}
func TestTranscriptCutSeparatesSubtitleCorrectionFromRealMediaChanges(t *testing.T) {
	raw, document := cutFixture(t)
	original := string(raw)
	for _, mode := range []string{"clip_only", "ripple"} {
		t.Run(mode, func(t *testing.T) {
			plan, err := PlanTranscriptCut(raw, document, "text", "v1", "speech", "voice", mode, []string{"s3", "s1"})
			if err != nil {
				t.Fatal(err)
			}
			if string(raw) != original || document.Segments[1].Text != "第二句" {
				t.Fatal("cut changed source document")
			}
			if plan.RemovedMs != 5020 || len(plan.KeptRanges) != 2 || plan.KeptRanges[1].SourceStartMs != 9000 || plan.KeptRanges[1].ProgramStartMs != 5000 || plan.KeptRanges[1].ProgramEndMs != 11000 {
				t.Fatalf("bad source/program mapping: %+v", plan.KeptRanges)
			}
			clips := cutClips(t, plan.Timeline)
			originalClips := cutClips(t, raw)
			secondID := plan.KeptRanges[1].ClipID
			if secondID == "voice" || len(secondID) > 128 || clips["voice"]["durationMs"] != float64(5000) || clips[secondID]["sourceStartMs"] != float64(9000) || clips[secondID]["durationMs"] != float64(6000) {
				t.Fatal("media wasn't actually split and source-trimmed")
			}
			if clips["caption2"] != nil || clips["caption3"]["startMs"] != float64(5000) || clips["caption3"]["productionBinding"].(map[string]any)["sourceClipId"] != secondID {
				t.Fatal("associated captions lost their actual source occurrence")
			}
			if mode == "clip_only" {
				if plan.AfterDurationMs != 28000 {
					t.Fatal("clip-only changed project timing")
				}
				for _, id := range []string{"repeat", "repeatCaption1", "image", "music"} {
					a, _ := json.Marshal(clips[id])
					b, _ := json.Marshal(originalClips[id])
					if string(a) != string(b) {
						t.Fatalf("unrelated %s changed", id)
					}
				}
			} else {
				if plan.AfterDurationMs != 22980 || clips["repeat"]["startMs"] != float64(14980) || clips["repeat"]["sourceStartMs"] != float64(1000) || clips["repeatCaption1"]["startMs"] != float64(14980) || clips["music"] != nil {
					t.Fatal("ripple did not transform all affected tracks consistently")
				}
			}
			repeated, err := PlanTranscriptCut(raw, document, "text", "v1", "speech", "voice", mode, []string{"s1", "s3"})
			if err != nil || string(repeated.Timeline) != string(plan.Timeline) {
				t.Fatal("preview isn't deterministic")
			}
		})
	}
}
func TestTranscriptCutRejectsUnknownSelectionLockedTracksAndUnsupportedSpeed(t *testing.T) {
	raw, document := cutFixture(t)
	for _, ids := range [][]string{nil, {"s1", "s1"}, {"unknown"}} {
		if _, err := PlanTranscriptCut(raw, document, "text", "v1", "speech", "voice", "ripple", ids); err == nil {
			t.Fatal("invalid selection accepted")
		}
	}
	for _, change := range []string{
		strings.Replace(string(raw), `"label":"画面"`, `"label":"画面","locked":true`, 1),
		strings.Replace(string(raw), `"id":"voice","kind":"audio"`, `"id":"voice","speed":2,"kind":"audio"`, 1),
		strings.Replace(string(raw), `"id":"voice","kind":"audio"`, `"id":"voice","sourceDurationMs":1000,"kind":"audio"`, 1),
	} {
		if _, err := PlanTranscriptCut(json.RawMessage(change), document, "text", "v1", "speech", "voice", "ripple", []string{"s1", "s3"}); err == nil {
			t.Fatal("unsafe media cut accepted")
		}
	}
	lockedVisual := json.RawMessage(strings.Replace(string(raw), `"label":"画面"`, `"label":"画面","locked":true`, 1))
	if _, err := PlanTranscriptCut(lockedVisual, document, "text", "v1", "speech", "voice", "clip_only", []string{"s1", "s3"}); err != nil {
		t.Fatal("unrelated locked track blocked clip-only edit")
	}
	if _, err := PlanTranscriptCut(raw, document, "text", "v1", "wrong-resource", "voice", "ripple", []string{"s1"}); err == nil {
		t.Fatal("wrong source occurrence accepted")
	}
}

func TestTranscriptCutPreservesFadesAndUsesBoundedFragmentIDs(t *testing.T) {
	raw, document := cutFixture(t)
	longID := strings.Repeat("x", 128)
	changed := strings.ReplaceAll(string(raw), `"voice"`, `"`+longID+`"`)
	changed = strings.Replace(changed, `"durationMs":16020`, `"durationMs":16020,"fadeInMs":6000,"fadeOutMs":1500`, 1)
	plan, err := PlanTranscriptCut(json.RawMessage(changed), document, "text", "v1", "speech", longID, "clip_only", []string{"s1", "s3"})
	if err != nil {
		t.Fatal(err)
	}
	clips := cutClips(t, plan.Timeline)
	second := clips[plan.KeptRanges[1].ClipID]
	if clips[longID]["fadeInMs"] != float64(5000) || second["fadeInMs"] != float64(0) || second["fadeOutMs"] != float64(480) || len(plan.Warnings) != 2 {
		t.Fatal("fades weren't bounded or explained")
	}
	for id := range clips {
		if len(id) > 128 {
			t.Fatal("fragment ID exceeded native timeline boundary")
		}
	}
}
