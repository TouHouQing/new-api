package production

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

func captionFollowFixture(t *testing.T, parent string, locked bool) json.RawMessage {
	t.Helper()
	var doc map[string]any
	decoder := json.NewDecoder(bytes.NewReader(linkedTranscriptCutFixture(t, false)))
	decoder.UseNumber()
	if err := decoder.Decode(&doc); err != nil {
		t.Fatal(err)
	}
	objectValue(listValue(doc["clips"])[4])["productionBinding"] = map[string]any{"transcriptId": "transcript", "transcriptRevisionId": "original-revision", "transcriptSegmentId": "sentence", "sourceClipId": parent}
	if locked {
		objectValue(listValue(doc["tracks"])[3])["locked"] = true
	}
	raw, err := json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}
func TestTimelineEditsReconcileTranscriptCuesThroughVideoAndAudioSplits(t *testing.T) {
	for _, parent := range []string{"video", "a"} {
		t.Run(parent, func(t *testing.T) {
			raw := captionFollowFixture(t, parent, false)
			position := int64(3000)
			after, err := ApplyTimelineEdits(raw, []TimelineEditCommand{{Op: "splitClip", ID: "video", SplitAtMs: &position}})
			if err != nil {
				t.Fatal(err)
			}
			var doc map[string]any
			reader := json.NewDecoder(bytes.NewReader(after))
			reader.UseNumber()
			reader.Decode(&doc)
			captions := []map[string]any{}
			for _, row := range listValue(doc["clips"]) {
				clip := objectValue(row)
				if stringValue(clip, "kind") == "subtitle" {
					captions = append(captions, clip)
				}
			}
			if len(captions) != 2 || audioValue(captions[0], "startMs") != 2000 || audioValue(captions[0], "durationMs") != 1000 || audioValue(captions[1], "startMs") != 3000 || audioValue(captions[1], "durationMs") != 500 {
				t.Fatalf("wrong caption timing: %s", after)
			}
			parents := []string{"video", "video:split:3000"}
			if parent == "a" {
				voices := linkedCutAudio(t, after)
				parents = []string{stringValue(voices[0], "id"), stringValue(voices[1], "id")}
			}
			for index, cue := range captions {
				binding := objectValue(cue["productionBinding"])
				if stringValue(binding, "sourceClipId") != parents[index] || stringValue(binding, "transcriptRevisionId") != "original-revision" || stringValue(cue, "text") != "独立字幕" {
					t.Fatal("caption lost immutable text/version or concrete parent")
				}
			}
			removed, err := ApplyTimelineEdits(raw, []TimelineEditCommand{{Op: "removeClip", ID: "video"}})
			if err != nil {
				t.Fatal(err)
			}
			for _, clip := range cutClips(t, removed) {
				if stringValue(clip, "kind") == "subtitle" || clip["audioLink"] != nil {
					t.Fatal("deleting a parent left dependent voices/captions")
				}
			}
		})
	}
}
func TestTimelineEditsRespectLockedCaptionTrackAndUnchangedExtension(t *testing.T) {
	raw := captionFollowFixture(t, "video", true)
	start := int64(2000)
	if _, err := ApplyTimelineEdits(raw, []TimelineEditCommand{{Op: "moveClip", ID: "video", StartMs: &start}}); err == nil || !strings.Contains(err.Error(), "字幕轨已锁定") {
		t.Fatal("locked subtitle was changed", err)
	}
	duration := int64(5000)
	if _, err := ApplyTimelineEdits(raw, []TimelineEditCommand{{Op: "trimClip", ID: "video", DurationMs: &duration}}); err != nil {
		t.Fatal("unchanged locked caption blocked an unrelated extension", err)
	}
}
