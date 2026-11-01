package production

import (
	"bytes"
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

func TestManualCaptionLinksSharedSourceClockGoldens(t *testing.T) {
	raw, err := os.ReadFile("testdata/caption_links.golden.json")
	if err != nil {
		t.Fatal(err)
	}
	type example struct {
		Name     string                `json:"name"`
		Commands []TimelineEditCommand `json:"commands"`
		Captions [][]float64           `json:"captions"`
	}
	var fixture struct {
		FractionalBase  json.RawMessage `json:"fractionalBase"`
		FractionalCases []example       `json:"fractionalCases"`
		NestedCaption   json.RawMessage `json:"nestedCaption"`
		NestedCases     []example       `json:"nestedCases"`
	}
	if err := json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	audioRaw, _ := os.ReadFile("testdata/audio_links.golden.json")
	var audio struct {
		Base json.RawMessage `json:"base"`
	}
	json.Unmarshal(audioRaw, &audio)
	var nested map[string]json.RawMessage
	json.Unmarshal(audio.Base, &nested)
	var clips []json.RawMessage
	json.Unmarshal(nested["clips"], &clips)
	clips = append(clips, fixture.NestedCaption)
	nested["clips"], _ = json.Marshal(clips)
	nestedRaw, _ := json.Marshal(nested)
	for _, group := range []struct {
		name  string
		base  json.RawMessage
		cases []example
	}{{"fractional", fixture.FractionalBase, fixture.FractionalCases}, {"nested", nestedRaw, fixture.NestedCases}} {
		for _, entry := range group.cases {
			t.Run(group.name+"/"+entry.Name, func(t *testing.T) {
				after, err := ApplyTimelineEdits(group.base, entry.Commands)
				if err != nil {
					t.Fatal(err)
				}
				var document map[string]any
				decoder := json.NewDecoder(bytes.NewReader(after))
				decoder.UseNumber()
				decoder.Decode(&document)
				found := [][]float64{}
				parents := map[string]bool{}
				for _, row := range listValue(document["clips"]) {
					parents[stringValue(objectValue(row), "id")] = true
				}
				for _, row := range listValue(document["clips"]) {
					clip := objectValue(row)
					if link := objectValue(clip["captionLink"]); link != nil {
						if !parents[stringValue(link, "sourceClipId")] {
							t.Fatal("dangling caption parent")
						}
						found = append(found, []float64{audioValue(clip, "startMs"), audioValue(clip, "durationMs"), audioValue(link, "sourceStartMs"), audioValue(link, "sourceEndMs")})
					}
				}
				if !reflect.DeepEqual(found, entry.Captions) {
					t.Fatalf("manual source-clock mismatch got=%v want=%v", found, entry.Captions)
				}
				if group.name == "nested" {
					var before map[string]json.RawMessage
					json.Unmarshal(group.base, &before)
					var oldClips []json.RawMessage
					json.Unmarshal(before["clips"], &oldClips)
					var newClips []json.RawMessage
					var current map[string]json.RawMessage
					json.Unmarshal(after, &current)
					json.Unmarshal(current["clips"], &newClips)
					for _, id := range []string{"music", "repeated-source", "caption"} {
						var left, right any
						for _, row := range oldClips {
							var c map[string]any
							json.Unmarshal(row, &c)
							if c["id"] == id {
								left = c
							}
						}
						for _, row := range newClips {
							var c map[string]any
							json.Unmarshal(row, &c)
							if c["id"] == id {
								right = c
							}
						}
						if !reflect.DeepEqual(left, right) {
							t.Fatal("unrelated occurrence changed", id)
						}
					}
				}
			})
		}
	}
}
