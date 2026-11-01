package production

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func reworkFixture(t *testing.T) (json.RawMessage, VideoReworkRequest, VideoReworkMedia, VideoReworkMedia) {
	t.Helper()
	raw := json.RawMessage(`{"version":2,"tracks":[{"id":"v","kind":"video","order":0},{"id":"a","kind":"audio","order":1},{"id":"s","kind":"subtitle","order":2}],"clips":[{"id":"first-use","kind":"video","nodeId":"first","trackId":"v","startMs":0,"durationMs":4000,"sourceStartMs":0,"sourceDurationMs":10000,"playbackRate":2,"volume":0.7,"productionBinding":{"assetVersionId":"original-take"},"directMedia":{"id":"original","kind":"video","storageKey":"resource:original"}},{"id":"second-use","kind":"video","nodeId":"second","trackId":"v","startMs":5000,"durationMs":4000,"sourceStartMs":0,"sourceDurationMs":10000,"playbackRate":1,"directMedia":{"id":"original","kind":"video","storageKey":"resource:original"}},{"id":"independent-voice","kind":"audio","trackId":"a","startMs":200,"durationMs":7000,"sourceStartMs":0,"sourceDurationMs":10000,"volume":0.6},{"id":"independent-caption","kind":"subtitle","trackId":"s","startMs":500,"durationMs":3000,"text":"原字幕"}],"durationMs":9000}`)
	_, digest, err := ReadVideoReworkClip(raw, "first-use")
	if err != nil {
		t.Fatal(err)
	}
	source := VideoReworkMedia{"original", strings.Repeat("1", 64), 512, 512, 10000}
	candidate := VideoReworkMedia{"candidate", strings.Repeat("2", 64), 512, 512, 2000}
	request := VideoReworkRequest{ClipID: "first-use", ClipSHA256: digest, SourceResourceID: source.ResourceID, SourceSHA256: source.SHA256, SourceStartMs: 2000, SourceEndMs: 4000, CandidateResourceID: candidate.ResourceID, CandidateSHA256: candidate.SHA256, Audio: "original", Region: &VideoReworkRegion{X: 50, Y: 50, Width: 400, Height: 400}}
	return raw, request, source, candidate
}

func TestVideoReworkPlanAndApplyPreserveOtherOccurrencesVoicesAndCaptions(t *testing.T) {
	raw, request, source, candidate := reworkFixture(t)
	plan, err := PlanVideoRework(raw, request, source, candidate)
	if err != nil || plan.ProgramStartMs != 1000 || plan.ProgramEndMs != 2000 || plan.PlaybackRate != 2 {
		t.Fatalf("Source-time selection must use this occurrence's rate: %+v %v", plan, err)
	}
	derived := VideoReworkMedia{"derived", strings.Repeat("3", 64), 512, 512, 2000}
	after, err := ApplyVideoReworkCandidate(raw, plan, derived, "fixed-repair-take", "operation-123", nil)
	if err != nil {
		t.Fatal(err)
	}
	beforeDoc, _ := videoReworkDocument(raw)
	afterDoc, _ := videoReworkDocument(after)
	beforeClips, afterClips := listValue(beforeDoc["clips"]), listValue(afterDoc["clips"])
	beforeTracks, afterTracks := listValue(beforeDoc["tracks"]), listValue(afterDoc["tracks"])
	if len(afterClips) != len(beforeClips)+1 || !reflect.DeepEqual(afterClips[:len(beforeClips)], beforeClips) || !reflect.DeepEqual(afterTracks[:len(beforeTracks)], beforeTracks) || beforeDoc["durationMs"] != afterDoc["durationMs"] {
		t.Fatal("Repair changed an original occurrence, track, voice, caption or program length")
	}
	repaired := objectValue(afterClips[len(beforeClips)])
	if audioValue(repaired, "startMs") != 1000 || audioValue(repaired, "durationMs") != 1000 || audioRate(repaired) != 2 || audioValue(repaired, "volume") != .7 || stringValue(objectValue(repaired["directMedia"]), "storageKey") != "resource:derived" || stringValue(objectValue(repaired["productionBinding"]), "assetVersionId") != "fixed-repair-take" {
		t.Fatal("Repair lost the selected program time, fixed candidate or playback rate")
	}
	if audioValue(objectValue(afterTracks[len(beforeTracks)]), "order") >= audioValue(objectValue(beforeTracks[0]), "order") {
		t.Fatal("Repaired interval must be visible above its preserved original")
	}
	_, secondHash, _ := ReadVideoReworkClip(raw, "second-use")
	request.ClipID, request.ClipSHA256 = "second-use", secondHash
	second, err := PlanVideoRework(raw, request, source, candidate)
	if err != nil || second.ProgramStartMs != 7000 || second.ProgramEndMs != 9000 || second.PlaybackRate != 1 {
		t.Fatalf("Repeated source must map to its own occurrence: %+v %v", second, err)
	}
}

func TestVideoReworkUndoKeepsSubsequentVoiceCaptionAndSourceEdits(t *testing.T) {
	raw, request, source, candidate := reworkFixture(t)
	plan, err := PlanVideoRework(raw, request, source, candidate)
	if err != nil {
		t.Fatal(err)
	}
	derived := VideoReworkMedia{"derived", strings.Repeat("3", 64), 512, 512, 2000}
	after, err := ApplyVideoReworkCandidate(raw, plan, derived, "take", "job", nil)
	if err != nil {
		t.Fatal(err)
	}
	document, _ := videoReworkDocument(after)
	clips := listValue(document["clips"])
	objectValue(clips[0])["volume"] = audioAnchor(.2)
	objectValue(clips[2])["volume"] = audioAnchor(.9)
	objectValue(clips[3])["text"] = "用户在采用后修订的字幕"
	current, _ := json.Marshal(document)
	_, digest, err := ReadVideoReworkClip(current, "repair-clip:job")
	if err != nil {
		t.Fatal(err)
	}
	undone, err := RemoveVideoReworkCandidate(current, "repair-clip:job", "job", digest)
	if err != nil {
		t.Fatal(err)
	}
	got, _ := videoReworkDocument(undone)
	if !reflect.DeepEqual(listValue(got["clips"]), clips[:4]) || len(listValue(got["tracks"])) != 3 {
		t.Fatal("Undo erased changes made after adoption or left an empty repair track")
	}
	if _, err := RemoveVideoReworkCandidate(current, "first-use", "job", request.ClipSHA256); err == nil {
		t.Fatal("Undo removed the preserved original instead of its repair")
	}
	if _, err := RemoveVideoReworkCandidate(current, "repair-clip:job", "job", strings.Repeat("f", 64)); err == nil {
		t.Fatal("Undo accepted a clip changed after preview")
	}
	track := objectValue(listValue(document["tracks"])[3])
	track["locked"] = true
	locked, _ := json.Marshal(document)
	if _, err := RemoveVideoReworkCandidate(locked, "repair-clip:job", "job", digest); err == nil {
		t.Fatal("Locked repair was removed")
	}
	delete(track, "locked")
	objectValue(clips[1])["trackId"] = "repair-track:job"
	shared, _ := json.Marshal(document)
	undone, err = RemoveVideoReworkCandidate(shared, "repair-clip:job", "job", digest)
	if err != nil {
		t.Fatal(err)
	}
	got, _ = videoReworkDocument(undone)
	if len(listValue(got["tracks"])) != 4 || stringValue(objectValue(listValue(got["clips"])[1]), "trackId") != "repair-track:job" {
		t.Fatal("Undo erased a track now used by another clip")
	}
}

func TestVideoReworkRejectsStaleUnboundOutOfRangeAndShortCandidates(t *testing.T) {
	for name, mutate := range map[string]func(*VideoReworkRequest, *VideoReworkMedia, *VideoReworkMedia){
		"changed-clip":         func(r *VideoReworkRequest, _, _ *VideoReworkMedia) { r.ClipSHA256 = strings.Repeat("f", 64) },
		"wrong-occurrence":     func(r *VideoReworkRequest, _, _ *VideoReworkMedia) { r.ClipID = "second-use" },
		"changed-original":     func(_ *VideoReworkRequest, s, _ *VideoReworkMedia) { s.SHA256 = strings.Repeat("f", 64) },
		"changed-candidate":    func(_ *VideoReworkRequest, _, c *VideoReworkMedia) { c.SHA256 = strings.Repeat("f", 64) },
		"different-size":       func(_ *VideoReworkRequest, _, c *VideoReworkMedia) { c.Width = 256 },
		"missing-audio-choice": func(r *VideoReworkRequest, _, _ *VideoReworkMedia) { r.Audio = "" },
		"outside-occurrence":   func(r *VideoReworkRequest, _, _ *VideoReworkMedia) { r.SourceEndMs = 9000 },
		"negative-start":       func(r *VideoReworkRequest, _, _ *VideoReworkMedia) { r.SourceStartMs = -1 },
		"short-candidate":      func(_ *VideoReworkRequest, _, c *VideoReworkMedia) { c.DurationMs = 1999 },
		"past-candidate":       func(r *VideoReworkRequest, _, _ *VideoReworkMedia) { r.CandidateStartMs = 1 },
		"outside-face-region":  func(r *VideoReworkRequest, _, _ *VideoReworkMedia) { r.Region.X = 200 },
		"empty-region":         func(r *VideoReworkRequest, _, _ *VideoReworkMedia) { r.Region.Width = 0 },
	} {
		t.Run(name, func(t *testing.T) {
			raw, request, source, candidate := reworkFixture(t)
			mutate(&request, &source, &candidate)
			if _, err := PlanVideoRework(raw, request, source, candidate); err == nil {
				t.Fatal("Accepted stale, unbound or invalid media/clock/region")
			}
		})
	}
	raw, request, source, candidate := reworkFixture(t)
	locked := json.RawMessage(strings.Replace(string(raw), `"id":"v","kind":"video","order":0`, `"id":"v","kind":"video","order":0,"locked":true`, 1))
	if _, err := PlanVideoRework(locked, request, source, candidate); err == nil {
		t.Fatal("Locked track admitted a repair")
	}
}

func TestVideoReworkDerivedCandidateMustMatchFrozenPlanAndPreserveExistingReframe(t *testing.T) {
	raw, request, source, candidate := reworkFixture(t)
	plan, err := PlanVideoRework(raw, request, source, candidate)
	if err != nil {
		t.Fatal(err)
	}
	derived := VideoReworkMedia{"derived", strings.Repeat("3", 64), 512, 512, 2000}
	tampered := plan
	tampered.ProgramStartMs++
	if _, err := ApplyVideoReworkCandidate(raw, tampered, derived, "take", "job", nil); err == nil {
		t.Fatal("Client-authored program clock admitted")
	}
	if _, err := ApplyVideoReworkCandidate(raw, plan, source, "take", "job", nil); err == nil {
		t.Fatal("Original resource reused as a repair result")
	}
	if _, err := ApplyVideoReworkCandidate(raw, plan, derived, "take", "job", &TimelineReframe{}); err == nil {
		t.Fatal("Unexpected framing accepted")
	}
	before, _ := videoReworkDocument(raw)
	clip := objectValue(listValue(before["clips"])[0])
	clip["volume"] = audioAnchor(.3)
	changed, _ := json.Marshal(before)
	if _, err := ApplyVideoReworkCandidate(changed, plan, derived, "take", "job", nil); err == nil {
		t.Fatal("Repair overwrote an occurrence edited after its preview")
	}
}
