// SPDX-License-Identifier: AGPL-3.0-or-later
package production

import (
	"bytes"
	"encoding/json"
	"reflect"
	"testing"
	"yingce/backend/internal/model"
)

func legacyAudioLinkFixture() (map[string]any, map[string]model.Resource, map[string]map[string]string) {
	document := map[string]any{"nodes": []any{map[string]any{"id": "video", "data": map[string]any{"kind": "video", "mediaId": "new", "selectedTakeId": "b", "takes": []any{map[string]any{"id": "a", "mediaId": "old"}, map[string]any{"id": "b", "mediaId": "new"}}}}}, "shots": []any{map[string]any{"id": "shot", "videoNodeId": "video", "shotVoiceoverMediaId": "voice", "shotVoiceoverOffsetSeconds": 1}}, "production": map[string]any{"timelineEdited": true, "timeline": []any{map[string]any{"id": "one", "nodeId": "video", "takeId": "a", "trimStart": .5, "trimEnd": 2.5, "speed": 2}, map[string]any{"id": "two", "nodeId": "video", "takeId": "a", "trimStart": 0, "trimEnd": 2, "speed": 1}}, "audioTracks": []any{map[string]any{"id": "source", "mediaId": "voice", "start": .5, "offset": .125, "duration": 1, "speed": 1.25, "volume": .7, "anchorKind": "source", "anchorClipId": "one", "anchorSourceStart": .75}, map[string]any{"id": "clip", "mediaId": "voice", "start": .25, "offset": 1.4, "duration": .5, "speed": 1, "volume": .4, "anchorKind": "clip", "anchorClipId": "two", "anchorSourceStart": .4}, map[string]any{"id": "music", "mediaId": "music", "start": 0, "offset": .2, "duration": 2, "volume": 0, "anchorKind": "project"}}, "dialogueCues": []any{map[string]any{"id": "line", "shotId": "shot", "audioMediaId": "voice", "offset": .75, "duration": .5, "text": "原对白"}}}}
	resources := map[string]model.Resource{"old": {ID: "old", DurationMs: 4000, MimeType: "video/mp4"}, "new": {ID: "new", DurationMs: 4000, MimeType: "video/mp4"}, "voice": {ID: "voice", DurationMs: 6000, MimeType: "audio/wav"}, "music": {ID: "music", DurationMs: 6000, MimeType: "audio/wav"}}
	return document, resources, map[string]map[string]string{"nodes": {"video": "native-video"}, "takes": {"video/a": "old-version", "video/b": "new-version"}, "shots": {"shot": "native-shot"}}
}
func decodeAudioTimeline(t *testing.T, raw []byte) map[string]any {
	t.Helper()
	var document map[string]any
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if err := decoder.Decode(&document); err != nil {
		t.Fatal(err)
	}
	return document
}
func audioTimelineClip(t *testing.T, document map[string]any, id string) map[string]any {
	t.Helper()
	for _, value := range listValue(document["clips"]) {
		clip := objectValue(value)
		if stringValue(clip, "id") == id {
			return clip
		}
	}
	t.Fatal("missing clip", id)
	return nil
}

func TestLegacyAudioExactOccurrenceLinksSurviveSplitMoveAndSpeed(t *testing.T) {
	document, resources, mapping := legacyAudioLinkFixture()
	before, _ := json.Marshal(document)
	projected, err := ProjectLegacyTimeline(document, resources, mapping, "audio-import", false)
	if err != nil {
		t.Fatal(err)
	}
	if len(projected.PreservedOnly) != 0 {
		t.Fatal("valid links reported unconverted", projected.PreservedOnly)
	}
	timeline := decodeAudioTimeline(t, projected.Timeline)
	one, two := projected.ClipIDs["one"], projected.ClipIDs["two"]
	sourceID := legacyNativeID("legacy-audio-v1", "audio-import", "track:source")
	clipID := legacyNativeID("legacy-audio-v1", "audio-import", "track:clip")
	musicID := legacyNativeID("legacy-audio-v1", "audio-import", "track:music")
	source, clip := audioTimelineClip(t, timeline, sourceID), audioTimelineClip(t, timeline, clipID)
	if stringValue(objectValue(source["audioLink"]), "sourceClipId") != one || stringValue(objectValue(source["audioLink"]), "mode") != "source" || audioValue(objectValue(source["audioLink"]), "anchorMs") != 750 || audioValue(source, "durationMs") != 800 {
		t.Fatal("source clock lost", source)
	}
	if stringValue(objectValue(clip["audioLink"]), "sourceClipId") != two || stringValue(objectValue(clip["audioLink"]), "mode") != "clip" || audioValue(objectValue(clip["audioLink"]), "anchorMs") != 400 {
		t.Fatal("clip clock lost", clip)
	}
	if audioTimelineClip(t, timeline, musicID)["audioLink"] != nil || audioValue(audioTimelineClip(t, timeline, musicID), "volume") != 0 {
		t.Fatal("project music attached or unmuted")
	}
	for _, value := range listValue(timeline["clips"]) {
		row := objectValue(value)
		if stringValue(row, "kind") == "audio" && stringValue(row, "title") != "导入音轨" && row["audioLink"] == nil {
			t.Fatal("implicit voice not linked", row)
		}
		if stringValue(row, "kind") == "subtitle" && row["captionLink"] == nil {
			t.Fatal("dialogue subtitle not linked", row)
		}
	}
	split := int64(500)
	edited, err := ApplyTimelineEdits(projected.Timeline, []TimelineEditCommand{{Op: "splitClip", ID: one, SplitAtMs: &split}})
	if err != nil {
		t.Fatal(err)
	}
	changed := decodeAudioTimeline(t, edited)
	fragments := 0
	for _, value := range listValue(changed["clips"]) {
		row := objectValue(value)
		if stringValue(row, "kind") == "audio" && stringValue(row, "title") == "导入音轨" && audioValue(row, "volume") == .7 {
			fragments++
			if audioValue(row, "sourceStartMs") < 500 || audioValue(row, "durationMs") <= 0 {
				t.Fatal("split lost audio source", row)
			}
		}
	}
	if fragments != 2 {
		t.Fatal("source audio did not split", fragments)
	}
	if !reflect.DeepEqual(audioTimelineClip(t, changed, clipID), clip) || !reflect.DeepEqual(audioTimelineClip(t, changed, musicID), audioTimelineClip(t, timeline, musicID)) {
		t.Fatal("unrelated occurrence or project music changed")
	}
	move := int64(3500)
	edited, err = ApplyTimelineEdits(projected.Timeline, []TimelineEditCommand{{Op: "moveClip", ID: two, StartMs: &move}})
	if err != nil {
		t.Fatal(err)
	}
	changed = decodeAudioTimeline(t, edited)
	if audioValue(audioTimelineClip(t, changed, clipID), "startMs") != 3900 || !reflect.DeepEqual(audioTimelineClip(t, changed, sourceID), source) {
		t.Fatal("move crossed occurrence boundaries")
	}
	speed := 4.0
	edited, err = ApplyTimelineEdits(projected.Timeline, []TimelineEditCommand{{Op: "setClipPlaybackRate", ID: one, PlaybackRate: &speed}})
	if err != nil {
		t.Fatal(err)
	}
	changed = decodeAudioTimeline(t, edited)
	retimed := audioTimelineClip(t, changed, sourceID)
	if audioValue(retimed, "playbackRate") != 2.5 || audioValue(retimed, "durationMs") != 400 || audioValue(retimed, "sourceStartMs") != 500 {
		t.Fatal("source audio speed lost", retimed)
	}
	after, _ := json.Marshal(document)
	if !bytes.Equal(before, after) {
		t.Fatal("immutable imported source changed")
	}
}
func TestLegacyAudioAmbiguousOrInconsistentAnchorsFailWithoutDetaching(t *testing.T) {
	for _, name := range []string{"missing-occurrence", "missing-clock", "mismatched-offset", "unknown-mode", "negative-anchor", "repeated-id"} {
		t.Run(name, func(t *testing.T) {
			document, resources, mapping := legacyAudioLinkFixture()
			tracks := listValue(objectValue(document["production"])["audioTracks"])
			track := objectValue(tracks[0])
			switch name {
			case "missing-occurrence":
				track["anchorClipId"] = "gone"
			case "missing-clock":
				delete(track, "anchorSourceStart")
			case "mismatched-offset":
				track["offset"] = .2
			case "unknown-mode":
				track["anchorKind"] = "guess"
			case "negative-anchor":
				track["anchorSourceStart"] = -1
			case "repeated-id":
				objectValue(tracks[1])["id"] = track["id"]
			}
			if _, err := ProjectLegacyTimeline(document, resources, mapping, "invalid-audio", false); err == nil {
				t.Fatal("invalid audio silently detached or guessed")
			}
		})
	}
}

func TestLegacyRegionalAudioUsesItsOwnOccurrenceAndOriginalFile(t *testing.T) {
	document, resources, mapping := legacyAudioLinkFixture()
	production := objectValue(document["production"])
	production["episodes"] = []any{map[string]any{"id": "episode", "title": "第一集"}}
	production["regionalVersions"] = []any{map[string]any{"id": "regional", "title": "区域版", "episodeId": "episode", "timeline": []any{map[string]any{"id": "local", "nodeId": "video", "takeId": "a", "sourceMediaId": "old", "trimStart": .5, "trimEnd": 2.5, "speed": 2}}, "audioTracks": []any{map[string]any{"id": "voice", "mediaId": "voice", "start": .5, "offset": .125, "duration": 1, "speed": 1.25, "volume": .7, "anchorKind": "source", "anchorClipId": "local", "anchorSourceStart": .75}}}}
	projected, err := ProjectLegacyVersion(document, "regional", "import", resources, mapping, false)
	if err != nil || len(projected.PreservedOnly) != 0 || !projected.Source.HasAttachedAudio {
		t.Fatal("regional audio", err, projected.PreservedOnly)
	}
	timeline := decodeAudioTimeline(t, projected.Timeline)
	if len(listValue(timeline["clips"])) != 2 {
		t.Fatal("global audio or subtitles leaked into regional cut")
	}
	audio := audioTimelineClip(t, timeline, legacyNativeID("legacy-audio-v1", "import:regional", "track:voice"))
	parent := audioTimelineClip(t, timeline, stringValue(objectValue(audio["audioLink"]), "sourceClipId"))
	if objectValue(parent["directMedia"])["storageKey"] != "resource:old" || audioValue(objectValue(audio["audioLink"]), "anchorMs") != 750 || audioValue(audio, "durationMs") != 800 {
		t.Fatal("regional binding used current file or wrong clock", parent, audio)
	}
}
