// SPDX-License-Identifier: AGPL-3.0-or-later
package production

import (
	"encoding/json"
	"fmt"
	"reflect"
	"testing"

	"yingce/backend/internal/model"
)

func TestLegacyTimelinePinnedVersionsAudioSourceClocksAndEditableSubtitles(t *testing.T) {
	data := map[string]any{"kind": "video", "title": "原片", "mediaId": "second", "selectedTakeId": "b", "takes": []any{map[string]any{"id": "a", "mediaId": "first", "status": "completed"}, map[string]any{"id": "b", "mediaId": "second", "status": "completed"}}}
	document := map[string]any{"nodes": []any{map[string]any{"id": "v", "data": data}}, "shots": []any{map[string]any{"id": "shot", "videoNodeId": "v", "shotVoiceoverMediaId": "voice", "shotVoiceoverOffsetSeconds": 1.0, "shotVoiceoverVolume": .7}}, "soundtrackMediaId": "music", "soundtrackOffsetSeconds": .75, "soundtrackVolume": 0.0, "captionsText": "1\n00:00:00,200 --> 00:00:01,200\n全局字幕\n第二行\n", "captionOffsetSeconds": .3, "production": map[string]any{"timelineEdited": true, "timeline": []any{map[string]any{"id": "one", "nodeId": "v", "takeId": "a", "trimStart": .5, "trimEnd": 2.5, "speed": 2.0, "caption": "片段字幕", "captionOffset": .1, "captionDuration": .5, "fadeIn": .1, "fadeOut": .2, "muted": true}, map[string]any{"id": "two", "nodeId": "v", "takeId": "b", "trimStart": 0.0, "trimEnd": 2.0, "speed": .5}}, "audioTracks": []any{map[string]any{"id": "dialogue", "mediaId": "voice", "start": .5, "offset": .1, "duration": 1.0, "speed": 2.0, "volume": .4}}}}
	resources := map[string]model.Resource{"first": {ID: "first", DurationMs: 4000, MimeType: "video/mp4"}, "second": {ID: "second", DurationMs: 4000, MimeType: "video/mp4"}, "voice": {ID: "voice", DurationMs: 4000, MimeType: "audio/wav"}, "music": {ID: "music", DurationMs: 2000, MimeType: "audio/wav"}}
	identities := map[string]map[string]string{"nodes": {"v": "native-node"}, "shots": {"shot": "native-shot"}, "takes": {"v/a": "version-a", "v/b": "version-b"}}
	before, _ := json.Marshal(document)
	result, err := ProjectLegacyTimeline(document, resources, identities, "import", false)
	if err != nil {
		t.Fatal(err)
	}
	var timeline map[string]any
	json.Unmarshal(result.Timeline, &timeline)
	if numberValue(timeline["durationMs"]) != 5000 {
		t.Fatal("speed changed program duration", timeline)
	}
	clips := listValue(timeline["clips"])
	byID := map[string]map[string]any{}
	for _, value := range clips {
		clip := objectValue(value)
		byID[stringValue(clip, "id")] = clip
	}
	first := byID[result.ClipIDs["one"]]
	second := byID[result.ClipIDs["two"]]
	if first["volume"] != float64(0) || first["durationMs"] != float64(1000) || first["sourceStartMs"] != float64(500) || first["playbackRate"] != float64(2) || objectValue(first["directMedia"])["storageKey"] != "resource:first" || objectValue(first["productionBinding"])["assetVersionId"] != "version-a" {
		t.Fatal("pinned source/speed/mute lost", first)
	}
	if second["startMs"] != float64(1000) || second["durationMs"] != float64(4000) || objectValue(second["productionBinding"])["assetVersionId"] != "version-b" {
		t.Fatal("independent occurrence changed", second)
	}
	global, caption, music, audio, voices := false, false, false, false, 0
	for _, clip := range byID {
		switch stringValue(clip, "text") {
		case "全局字幕\n第二行":
			global = clip["startMs"] == float64(500) && clip["durationMs"] == float64(1000)
		case "片段字幕":
			caption = clip["startMs"] == float64(100) && clip["durationMs"] == float64(500)
		}
		if stringValue(clip, "title") == "配乐" {
			music = clip["startMs"] == float64(750) && clip["sourceStartMs"] == float64(0) && clip["volume"] == float64(0)
		}
		if stringValue(clip, "title") == "导入音轨" {
			audio = clip["startMs"] == float64(100) && clip["sourceStartMs"] == float64(500) && clip["durationMs"] == float64(500) && clip["playbackRate"] == float64(2)
		}
		if stringValue(clip, "title") == "镜头旁白" {
			voices++
			if objectValue(clip["legacyAudioAnchor"])["sourceClipId"] == result.ClipIDs["one"] && (clip["startMs"] != float64(250) || clip["playbackRate"] != float64(2)) {
				t.Fatal("shot voice source-clock mapping changed", clip)
			}
		}
	}
	if !global || !caption || !music || !audio || voices != 2 {
		t.Fatal("auxiliary media/subtitles missing", global, caption, music, audio, voices)
	}
	after, _ := json.Marshal(document)
	if !reflect.DeepEqual(before, after) {
		t.Fatal("immutable legacy document was modified")
	}
	production := objectValue(document["production"])
	listValue(production["timeline"])[0].(map[string]any)["takeId"] = "missing"
	if _, err := ProjectLegacyTimeline(document, resources, identities, "import", false); err == nil {
		t.Fatal("missing pinned version fell back to current")
	}
}
func TestLegacyTimelineReusesNonOverlappingAudioLanesAndPreservesMalformedSubtitles(t *testing.T) {
	tracks := []any{}
	for i := 0; i < 100; i++ {
		tracks = append(tracks, map[string]any{"id": fmt.Sprint(i), "mediaId": "audio", "offset": float64(i) / 10, "duration": .1})
	}
	doc := map[string]any{"captionsText": "not valid SRT", "production": map[string]any{"timelineEdited": true, "audioTracks": tracks}}
	result, err := ProjectLegacyTimeline(doc, map[string]model.Resource{"audio": {ID: "audio", DurationMs: 100}}, map[string]map[string]string{}, "import", false)
	if err != nil {
		t.Fatal(err)
	}
	var body map[string]any
	json.Unmarshal(result.Timeline, &body)
	if len(listValue(body["clips"])) != 100 || len(listValue(body["tracks"])) != 3 {
		t.Fatal("serial audio used100 overlapping UI lanes", body)
	}
	if !reflect.DeepEqual(result.PreservedOnly, []string{"captionsText.invalid-timing"}) {
		t.Fatal("malformed subtitle was hidden or invented", result.PreservedOnly)
	}
	for _, bad := range []string{"1\n00:61:00,000 --> 00:62:00,000\ntext", "1\n00:00:02,000 --> 00:00:01,000\ntext", "1\n00:00:01,000 --> 00:00:02,000"} {
		if _, err := ParseLegacySRT(bad); err == nil {
			t.Fatal("invalid legacy SRT accepted", bad)
		}
	}
}

func TestLegacyTimelineTrimPastFinishedVoiceDoesNotInventOrRejectAudio(t *testing.T) {
	document := map[string]any{"nodes": []any{map[string]any{"id": "v", "data": map[string]any{"kind": "video", "mediaId": "video"}}}, "shots": []any{map[string]any{"id": "shot", "videoNodeId": "v", "shotVoiceoverMediaId": "voice", "shotVoiceoverOffsetSeconds": 0}}, "production": map[string]any{"timelineEdited": true, "timeline": []any{map[string]any{"id": "clip", "nodeId": "v", "trimStart": 4, "trimEnd": 6}}, "dialogueCues": []any{map[string]any{"id": "cue", "shotId": "shot", "audioMediaId": "voice", "offset": 0, "duration": 1, "text": "已在裁剪区间前结束的对白"}}}}
	result, err := ProjectLegacyTimeline(document, map[string]model.Resource{"video": {ID: "video", DurationMs: 6000}, "voice": {ID: "voice", DurationMs: 1000}}, map[string]map[string]string{}, "import", false)
	if err != nil {
		t.Fatal("valid video trim rejected because earlier voice had ended", err)
	}
	var body struct {
		Clips []struct {
			Kind       string `json:"kind"`
			DurationMs int64  `json:"durationMs"`
		} `json:"clips"`
	}
	if err := json.Unmarshal(result.Timeline, &body); err != nil || len(body.Clips) != 1 || body.Clips[0].Kind != "video" || body.Clips[0].DurationMs != 2000 {
		t.Fatal("finished voice or caption was extended into a later source window", err, body)
	}
}
