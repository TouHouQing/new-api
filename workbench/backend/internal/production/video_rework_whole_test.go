package production

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func TestVideoReworkWholeSourceSplitMoveSpeedAndScopedUndo(t *testing.T) {
	raw, request, source, candidate := reworkFixture(t)
	original, _, _ := ReadVideoReworkClip(raw, request.ClipID)
	plan, err := PlanWholeSourceVideoRework(raw, request, source, candidate)
	if err != nil {
		t.Fatal(err)
	}
	derived := VideoReworkMedia{"derived", strings.Repeat("3", 64), 512, 512, 10000}
	after, err := ApplyVideoReworkCandidate(raw, plan, derived, "fixed-version", "native-task", nil)
	if err != nil {
		t.Fatal(err)
	}
	beforeDoc, _ := videoReworkDocument(raw)
	afterDoc, _ := videoReworkDocument(after)
	if !reflect.DeepEqual(beforeDoc["tracks"], afterDoc["tracks"]) || len(listValue(afterDoc["clips"])) != 4 || !reflect.DeepEqual(listValue(beforeDoc["clips"])[1:], listValue(afterDoc["clips"])[1:]) {
		t.Fatal("repair introduced track or changed another occurrence")
	}
	split := int64(1500)
	moved := int64(12000)
	rate := .5
	edited, err := ApplyTimelineEdits(after, []TimelineEditCommand{{Op: "splitClip", ID: "first-use", SplitAtMs: &split}, {Op: "moveClip", ID: "first-use:split:1500", StartMs: &moved}, {Op: "setClipPlaybackRate", ID: "first-use:split:1500", PlaybackRate: &rate}})
	if err != nil {
		t.Fatal(err)
	}
	right, hash, err := ReadVideoReworkClip(edited, "first-use:split:1500")
	if err != nil {
		t.Fatal(err)
	}
	restored, err := RestoreWholeSourceVideoRework(edited, "first-use:split:1500", "native-task", hash, VideoReworkRestoration{OriginalClip: original, Source: source, Derived: derived})
	if err != nil {
		t.Fatal(err)
	}
	final, _, _ := ReadVideoReworkClip(restored, "first-use:split:1500")
	current, _ := videoReworkDocumentClip(right)
	undo, _ := videoReworkDocumentClip(final)
	for _, key := range []string{"id", "trackId", "startMs", "durationMs", "sourceStartMs", "playbackRate", "volume"} {
		if !reflect.DeepEqual(current[key], undo[key]) {
			t.Fatalf("undo changed later %s", key)
		}
	}
	if stringValue(objectValue(undo["directMedia"]), "storageKey") != "resource:original" {
		t.Fatal("undo did not restore source")
	}
	left, _, _ := ReadVideoReworkClip(restored, "first-use")
	var data map[string]any
	json.Unmarshal(left, &data)
	if objectValue(data["videoReworkOrigin"])["taskId"] != "native-task" {
		t.Fatal("undo changed other split fragment")
	}
	if _, err := RestoreWholeSourceVideoRework(edited, "first-use:split:1500", "foreign-task", hash, VideoReworkRestoration{OriginalClip: original, Source: source, Derived: derived}); err == nil {
		t.Fatal("wrong repair task restored media")
	}
}
