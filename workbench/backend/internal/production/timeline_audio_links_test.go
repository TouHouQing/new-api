package production

import (
	"bytes"
	"encoding/json"
	"os"
	"reflect"
	"strconv"
	"strings"
	"testing"
)

func TestTimelineAudioEditGoldenContracts(t *testing.T) {
	raw, err := os.ReadFile("testdata/audio_links.golden.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Base  json.RawMessage `json:"base"`
		Cases []struct {
			Name        string                `json:"name"`
			Mode        string                `json:"mode"`
			AudioRate   float64               `json:"audioRate"`
			VideoRate   float64               `json:"videoRate"`
			AudioStart  *int64                `json:"audioStartMs"`
			LinkAnchor  *float64              `json:"linkAnchorMs"`
			Unlink      bool                  `json:"unlink"`
			VoiceLocked bool                  `json:"voiceLocked"`
			Commands    []TimelineEditCommand `json:"commands"`
			Error       string                `json:"error"`
			Expected    []struct {
				StartMs, DurationMs, SourceStartMs int64
				PlaybackRate, AnchorMs             float64
				SourceClipID                       string `json:"sourceClipId"`
			} `json:"expected"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	for _, item := range fixture.Cases {
		t.Run(item.Name, func(t *testing.T) {
			var before map[string]any
			decoder := json.NewDecoder(bytes.NewReader(fixture.Base))
			decoder.UseNumber()
			if err := decoder.Decode(&before); err != nil {
				t.Fatal(err)
			}
			clips := listValue(before["clips"])
			voice := objectValue(clips[2])
			if item.VideoRate != 0 {
				objectValue(clips[0])["playbackRate"] = audioAnchor(item.VideoRate)
			}
			if item.AudioStart != nil {
				voice["startMs"] = audioInteger(float64(*item.AudioStart))
			}
			if item.LinkAnchor != nil {
				objectValue(voice["audioLink"])["anchorMs"] = audioAnchor(*item.LinkAnchor)
			}
			if item.Mode != "" {
				link := objectValue(voice["audioLink"])
				link["mode"] = item.Mode
				link["anchorMs"] = json.Number("500")
			}
			if item.AudioRate != 0 {
				voice["playbackRate"] = json.Number(strconv.FormatFloat(item.AudioRate, 'f', -1, 64))
			}
			if item.Unlink {
				delete(voice, "audioLink")
			}
			if item.VoiceLocked {
				objectValue(listValue(before["tracks"])[1])["locked"] = true
			}
			input, _ := json.Marshal(before)
			after, err := ApplyTimelineEdits(input, item.Commands)
			if item.Error != "" {
				if err == nil || !strings.Contains(err.Error(), item.Error) {
					t.Fatalf("wanted %q; got %v", item.Error, err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			var result map[string]any
			reader := json.NewDecoder(bytes.NewReader(after))
			reader.UseNumber()
			if err := reader.Decode(&result); err != nil {
				t.Fatal(err)
			}
			actual := []map[string]any{}
			for _, row := range listValue(result["clips"]) {
				clip := objectValue(row)
				if clip["audioLink"] != nil {
					actual = append(actual, clip)
				}
			}
			if len(actual) != len(item.Expected) {
				t.Fatalf("wrong attached clip count: %s", after)
			}
			for index, expected := range item.Expected {
				clip := actual[index]
				link := objectValue(clip["audioLink"])
				if audioValue(clip, "startMs") != float64(expected.StartMs) || audioValue(clip, "durationMs") != float64(expected.DurationMs) || audioValue(clip, "sourceStartMs") != float64(expected.SourceStartMs) || audioRate(clip) != expected.PlaybackRate || audioValue(link, "anchorMs") != float64(expected.AnchorMs) || stringValue(link, "sourceClipId") != expected.SourceClipID {
					t.Fatalf("wrong clock or concrete occurrence: %s", after)
				}
			}
			for _, id := range []string{"music", "caption", "repeated-source"} {
				var original, retained map[string]any
				for _, row := range clips {
					clip := objectValue(row)
					if stringValue(clip, "id") == id {
						original = clip
					}
				}
				for _, row := range listValue(result["clips"]) {
					clip := objectValue(row)
					if stringValue(clip, "id") == id {
						retained = clip
					}
				}
				if !reflect.DeepEqual(original, retained) {
					t.Fatalf("unrelated clip changed: %s", id)
				}
			}
			again, err := ApplyTimelineEdits(input, item.Commands)
			if err != nil || string(again) != string(after) {
				t.Fatal("preview/commit would produce different clip identities", err)
			}
		})
	}
}

func TestTimelineAudioLinkDocumentRejectsBrokenRelationships(t *testing.T) {
	for _, link := range []string{`true`, `null`, `{"sourceClipId":"missing","mode":"source","anchorMs":0}`, `{"sourceClipId":"v","mode":"resource","anchorMs":0}`, `{"sourceClipId":"v","mode":"source","anchorMs":"0.5"}`, `{"sourceClipId":"v","mode":"source","anchorMs":-1}`} {
		raw := json.RawMessage(`{"version":2,"tracks":[{"id":"v","kind":"video"},{"id":"a","kind":"audio"}],"clips":[{"id":"v","kind":"video","trackId":"v","startMs":0,"durationMs":1000},{"id":"a","kind":"audio","trackId":"a","startMs":0,"durationMs":500,"audioLink":` + link + `}]}`)
		if _, err := ValidateTimelineDocument(raw); err == nil {
			t.Fatalf("broken audio relation accepted: %s", link)
		}
	}
}
