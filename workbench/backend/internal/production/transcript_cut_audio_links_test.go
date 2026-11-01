package production

import (
	"bytes"
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func linkedTranscriptCutFixture(t *testing.T, locked bool) json.RawMessage {
	t.Helper()
	raw, err := os.ReadFile("testdata/audio_links.golden.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Base json.RawMessage `json:"base"`
	}
	if err := json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	var document map[string]any
	decoder := json.NewDecoder(bytes.NewReader(fixture.Base))
	decoder.UseNumber()
	if err := decoder.Decode(&document); err != nil {
		t.Fatal(err)
	}
	for _, row := range listValue(document["clips"]) {
		clip := objectValue(row)
		resource := "video-resource"
		if stringValue(clip, "kind") == "audio" {
			resource = "voice-resource"
			if stringValue(clip, "id") == "music" {
				resource = "music-resource"
			}
		}
		if stringValue(clip, "kind") != "subtitle" {
			clip["directMedia"] = map[string]any{"storageKey": "resource:" + resource}
		}
	}
	if locked {
		objectValue(listValue(document["tracks"])[1])["locked"] = true
	}
	result, err := json.Marshal(document)
	if err != nil {
		t.Fatal(err)
	}
	return result
}
func linkedCutAudio(t *testing.T, raw json.RawMessage) []map[string]any {
	t.Helper()
	var doc map[string]any
	reader := json.NewDecoder(bytes.NewReader(raw))
	reader.UseNumber()
	if err := reader.Decode(&doc); err != nil {
		t.Fatal(err)
	}
	rows := []map[string]any{}
	for _, row := range listValue(doc["clips"]) {
		clip := objectValue(row)
		if clip["audioLink"] != nil {
			rows = append(rows, clip)
		}
	}
	return rows
}

func TestTranscriptCutReconcilesCaptionsThroughLinkedVoiceAndConcreteFragments(t *testing.T) {
	raw := linkedTranscriptCutFixture(t, false)
	var before map[string]any
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	decoder.Decode(&before)
	caption := map[string]any{"id": "voice-caption", "kind": "subtitle", "trackId": "captions", "startMs": 1500, "durationMs": 2000, "text": "校正后的对白", "productionBinding": map[string]any{"sourceClipId": "a", "transcriptId": "voice-transcript", "transcriptRevisionId": "corrected-v2", "transcriptSegmentId": "voice-segment"}}
	before["clips"] = append(listValue(before["clips"]), caption)
	raw, _ = json.Marshal(before)
	document := TranscriptDocument{Version: 1, Precision: "segment", Segments: []TranscriptSpan{{ID: "s1", StartMs: 2000, EndMs: 3000, Text: "保留"}, {ID: "s2", StartMs: 3000, EndMs: 4000, Text: "删掉"}, {ID: "s3", StartMs: 4000, EndMs: 6000, Text: "保留"}}}
	for _, mode := range []string{"clip_only", "ripple"} {
		t.Run(mode, func(t *testing.T) {
			plan, err := PlanTranscriptCut(raw, document, "text", "version", "video-resource", "video", mode, []string{"s1", "s3"})
			if err != nil {
				t.Fatal(err)
			}
			var after map[string]any
			decoder := json.NewDecoder(bytes.NewReader(plan.Timeline))
			decoder.UseNumber()
			decoder.Decode(&after)
			parents := map[string]map[string]any{}
			for _, row := range listValue(after["clips"]) {
				clip := objectValue(row)
				parents[stringValue(clip, "id")] = clip
			}
			cues := []map[string]any{}
			for _, row := range listValue(after["clips"]) {
				clip := objectValue(row)
				binding := objectValue(clip["productionBinding"])
				if stringValue(binding, "transcriptId") == "voice-transcript" {
					parent := parents[stringValue(binding, "sourceClipId")]
					if parent == nil || parent["audioLink"] == nil || audioValue(clip, "startMs") < audioValue(parent, "startMs") || audioEnd(clip) > audioEnd(parent) || clip["text"] != "校正后的对白" || binding["transcriptRevisionId"] != "corrected-v2" {
						t.Fatalf("caption lost voice occurrence or correction: %s", plan.Timeline)
					}
					cues = append(cues, clip)
				}
			}
			for _, change := range plan.Changes {
				if change.Action != "trim" && change.Action != "remove" && change.Action != "split" && change.Action != "move" {
					t.Fatal("unknown preview action", change)
				}
				if change.ClipID == "voice-caption" && (change.Action != "split" || len(change.ResultClipIDs) != 2) {
					t.Fatal("caption fragments missing from preview", change)
				}
			}
			if len(cues) != 2 || audioValue(cues[0], "startMs") != 1500 || audioValue(cues[0], "durationMs") != 500 || audioValue(cues[1], "startMs") != 2000 || audioValue(cues[1], "durationMs") != 500 {
				t.Fatalf("caption cut twice or not followed: %s", plan.Timeline)
			}
		})
	}
	objectValue(listValue(before["tracks"])[3])["locked"] = true
	locked, _ := json.Marshal(before)
	if _, err := PlanTranscriptCut(locked, document, "text", "version", "video-resource", "video", "clip_only", []string{"s1", "s3"}); err == nil || !strings.Contains(err.Error(), "锁定") {
		t.Fatal("dependent caption lock bypassed", err)
	}
}
func TestTranscriptCutReconcilesLinkedVoiceWithConcreteVideoFragments(t *testing.T) {
	raw := linkedTranscriptCutFixture(t, false)
	document := TranscriptDocument{Version: 1, Precision: "segment", Segments: []TranscriptSpan{{ID: "s1", StartMs: 2000, EndMs: 3000, Text: "保留开头"}, {ID: "s2", StartMs: 3000, EndMs: 4000, Text: "去掉中间"}, {ID: "s3", StartMs: 4000, EndMs: 6000, Text: "保留结尾"}}}
	for _, mode := range []string{"clip_only", "ripple"} {
		t.Run(mode, func(t *testing.T) {
			plan, err := PlanTranscriptCut(raw, document, "transcript", "version", "video-resource", "video", mode, []string{"s1", "s3"})
			if err != nil {
				t.Fatal(err)
			}
			voices := linkedCutAudio(t, plan.Timeline)
			if len(voices) != 2 {
				t.Fatalf("dependent voices lost or cut twice: %s", plan.Timeline)
			}
			for index, expected := range []struct {
				start, length, source int64
				parent                string
			}{{1500, 500, 300, "video"}, {2000, 500, 1800, plan.KeptRanges[1].ClipID}} {
				voice := voices[index]
				if audioValue(voice, "startMs") != float64(expected.start) || audioValue(voice, "durationMs") != float64(expected.length) || audioValue(voice, "sourceStartMs") != float64(expected.source) || stringValue(objectValue(voice["audioLink"]), "sourceClipId") != expected.parent {
					t.Fatalf("wrong dependent source/program mapping: %s", plan.Timeline)
				}
			}
			found := false
			for _, change := range plan.Changes {
				if change.ClipID == "a" && change.Action == "split" && len(change.ResultClipIDs) == 2 {
					found = true
				}
			}
			if !found {
				t.Fatal("preview omitted dependent voice impact")
			}
			clips := cutClips(t, plan.Timeline)
			original := cutClips(t, raw)
			if mode == "clip_only" {
				left, _ := json.Marshal(clips["repeated-source"])
				right, _ := json.Marshal(original["repeated-source"])
				if string(left) != string(right) || plan.AfterDurationMs != 12000 {
					t.Fatal("clip-only changed another use or project duration")
				}
			} else if clips["repeated-source"]["startMs"] != float64(6000) || plan.AfterDurationMs != 11000 {
				t.Fatal("ripple did not move the later occurrence and music consistently")
			}
		})
	}
}
func TestTranscriptCutOfLinkedVoiceDoesNotCutTwiceOrKeepDanglingParents(t *testing.T) {
	raw := linkedTranscriptCutFixture(t, false)
	document := TranscriptDocument{Version: 1, Precision: "segment", Segments: []TranscriptSpan{{ID: "s1", StartMs: 300, EndMs: 1300, Text: "保留开头"}, {ID: "s2", StartMs: 1300, EndMs: 1800, Text: "去掉中间"}, {ID: "s3", StartMs: 1800, EndMs: 2300, Text: "保留结尾"}}}
	for _, mode := range []string{"clip_only", "ripple"} {
		t.Run(mode, func(t *testing.T) {
			plan, err := PlanTranscriptCut(raw, document, "transcript", "version", "voice-resource", "a", mode, []string{"s1", "s3"})
			if err != nil {
				t.Fatal(err)
			}
			voices := linkedCutAudio(t, plan.Timeline)
			if len(voices) != 2 {
				t.Fatalf("voice was duplicated or lost: %s", plan.Timeline)
			}
			for index, expected := range []struct{ start, length, source int64 }{{1500, 1000, 300}, {2500, 500, 1800}} {
				voice := voices[index]
				if audioValue(voice, "startMs") != float64(expected.start) || audioValue(voice, "durationMs") != float64(expected.length) || audioValue(voice, "sourceStartMs") != float64(expected.source) || stringValue(voice, "id") != plan.KeptRanges[index].ClipID {
					t.Fatalf("explicit voice cut was rewritten: %s", plan.Timeline)
				}
			}
			lastLink := objectValue(voices[1]["audioLink"])
			if mode == "clip_only" {
				if stringValue(lastLink, "sourceClipId") != "video" || audioValue(lastLink, "anchorMs") != 3500 {
					t.Fatal("voice-only cut lost its retained parent timing")
				}
			} else if stringValue(lastLink, "sourceClipId") == "video" || audioValue(lastLink, "anchorMs") != 4000 {
				t.Fatal("ripple cut kept a dangling or wrong parent")
			}
		})
	}
}
func TestTranscriptCutRejectsChangesToLockedDependentVoices(t *testing.T) {
	raw := linkedTranscriptCutFixture(t, true)
	before := string(raw)
	document := TranscriptDocument{Version: 1, Precision: "segment", Segments: []TranscriptSpan{{ID: "s1", StartMs: 2000, EndMs: 3000, Text: "保留"}, {ID: "s2", StartMs: 3000, EndMs: 4000, Text: "去掉"}, {ID: "s3", StartMs: 4000, EndMs: 6000, Text: "保留"}}}
	if _, err := PlanTranscriptCut(raw, document, "transcript", "version", "video-resource", "video", "clip_only", []string{"s1", "s3"}); err == nil || !strings.Contains(err.Error(), "锁定") {
		t.Fatal("locked dependent audio changed", err)
	}
	if string(raw) != before {
		t.Fatal("failed preview mutated its input")
	}
}
