package production

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

const canvasCutFixture = `{"version":2,"tracks":[{"id":"v","kind":"video","label":"画面","order":0,"locked":true},{"id":"s","kind":"subtitle","order":1}],"clips":[{"id":"fixed","nodeId":"same-node","kind":"video","trackId":"v","title":"保留镜头名","startMs":0,"durationMs":2000,"sourceStartMs":1000,"sourceDurationMs":9999,"playbackRate":2,"volume":0.7,"fadeInMs":200,"directMedia":{"id":"old-id","assetId":"old-asset","title":"原素材名","storageKey":"resource:original-video"}},{"id":"repeat-a","nodeId":"same-node","kind":"video","trackId":"v","startMs":2000,"durationMs":1000,"sourceStartMs":500},{"id":"repeat-b","nodeId":"same-node","kind":"video","trackId":"v","startMs":3000,"durationMs":1000,"sourceStartMs":1500},{"id":"caption","nodeId":"subtitle","kind":"subtitle","trackId":"s","startMs":500,"durationMs":1000,"captionLink":{"sourceClipId":"fixed","sourceStartMs":2000,"sourceEndMs":4000},"subtitleEntryIndex":7,"subtitleStyle":{"fontSize":22,"color":"#ff0000"}}],"durationMs":4000,"customEditingNote":"保留独立剪辑设定"}`

func canvasCutMediaFixture() map[string]TimelineEditMedia {
	return map[string]TimelineEditMedia{
		"original-video":  {ResourceID: "original-video", Kind: "video", Width: 160, Height: 90, DurationMs: 6000, Bytes: 123, ETag: "original-etag", MIME: "video/mp4", Title: "内部文件名.mp4"},
		"alternate-video": {ResourceID: "alternate-video", Kind: "video", Width: 320, Height: 180, DurationMs: 7000, Bytes: 456, ETag: "alternate-etag", MIME: "video/mp4", Title: "另一个原片.mp4"},
	}
}

func TestCanvasCutConversionRequiresExactOccurrenceMappingsAndMissingText(t *testing.T) {
	source, err := InspectCanvasTimelineCut([]byte(canvasCutFixture))
	if err != nil {
		t.Fatal(err)
	}
	if len(source.Clips) != 4 || source.Clips[0].PinnedResourceID != "original-video" || source.Clips[1].PinnedResourceID != "" || source.Clips[2].PinnedResourceID != "" || !source.Clips[3].NeedsText {
		t.Fatal("node identifiers were guessed as immutable takes", source.Clips)
	}
	media := canvasCutMediaFixture()
	for _, mappings := range [][]CanvasCutMapping{nil, {{ClipID: "repeat-a", ResourceID: "original-video"}}} {
		if _, _, err := ConvertCanvasTimelineCut(source, mappings, []CanvasCutText{{ClipID: "caption", Text: "确切的旧台词"}}, media); err == nil {
			t.Fatal("unresolved repeated occurrence silently used current node media")
		}
	}
	mappings := []CanvasCutMapping{{ClipID: "repeat-a", ResourceID: "alternate-video"}, {ClipID: "repeat-b", ResourceID: "original-video"}}
	if _, _, err := ConvertCanvasTimelineCut(source, mappings, nil, media); err == nil {
		t.Fatal("missing old caption silently reconstructed from a mutable node")
	}
	raw, origins, err := ConvertCanvasTimelineCut(source, mappings, []CanvasCutText{{ClipID: "caption", Text: "确切的旧台词"}}, media)
	if err != nil {
		t.Fatal(err)
	}
	var document map[string]any
	if json.Unmarshal(raw, &document) != nil {
		t.Fatal("invalid converted timeline")
	}
	clips := document["clips"].([]any)
	fixed := clips[0].(map[string]any)
	if fixed["durationMs"] != float64(2000) || fixed["sourceStartMs"] != float64(1000) || fixed["sourceDurationMs"] != float64(6000) || fixed["playbackRate"] != float64(2) || fixed["fadeInMs"] != float64(200) || fixed["volume"] != float64(.7) || fixed["title"] != "保留镜头名" {
		t.Fatal("conversion retimed or renamed the pinned take", fixed)
	}
	if fixed["directMedia"].(map[string]any)["assetId"] != "old-asset" || document["tracks"].([]any)[0].(map[string]any)["locked"] != true || document["customEditingNote"] != "保留独立剪辑设定" {
		t.Fatal("editing fields were discarded")
	}
	for index, id := range []string{"original-video", "alternate-video", "original-video"} {
		if clips[index].(map[string]any)["directMedia"].(map[string]any)["storageKey"] != "resource:"+id {
			t.Fatal("repeated node occurrences were rebound together")
		}
	}
	caption := clips[3].(map[string]any)
	if caption["text"] != "确切的旧台词" || caption["subtitleStyle"].(map[string]any)["fontSize"] != float64(22) || caption["captionLink"].(map[string]any)["sourceClipId"] != "fixed" || caption["subtitleEntryIndex"] != float64(7) {
		t.Fatal("caption style, timing or original occurrence link changed", caption)
	}
	if len(origins) != 3 || origins[0].Resolution != "pinned" || origins[1].Resolution != "explicit" || origins[1].ETag != "alternate-etag" {
		t.Fatal("exact source proof was lost", origins)
	}
	var original map[string]any
	json.Unmarshal(source.OriginalTimeline, &original)
	if _, exists := original["clips"].([]any)[1].(map[string]any)["directMedia"]; exists {
		t.Fatal("conversion mutated its archived source")
	}
}

func TestCanvasCutConversionRejectsAmbiguousMappingAndShortReplacement(t *testing.T) {
	source, err := InspectCanvasTimelineCut([]byte(canvasCutFixture))
	if err != nil {
		t.Fatal(err)
	}
	valid := []CanvasCutMapping{{ClipID: "repeat-a", ResourceID: "alternate-video"}, {ClipID: "repeat-b", ResourceID: "original-video"}}
	texts := []CanvasCutText{{ClipID: "caption", Text: "原有台词"}}
	for _, extra := range []CanvasCutMapping{{ClipID: "repeat-a", ResourceID: "original-video"}, {ClipID: "not-a-clip", ResourceID: "original-video"}, {ClipID: "caption", ResourceID: "original-video"}, {ClipID: "fixed", ResourceID: " original-video"}} {
		mappings := append(append([]CanvasCutMapping{}, valid...), extra)
		if _, _, err := ConvertCanvasTimelineCut(source, mappings, texts, canvasCutMediaFixture()); err == nil {
			t.Fatal("ambiguous or foreign clip mapping accepted", extra)
		}
	}
	media := canvasCutMediaFixture()
	short := media["original-video"]
	short.DurationMs = 4000
	media["original-video"] = short
	if _, _, err := ConvertCanvasTimelineCut(source, valid, texts, media); err == nil {
		t.Fatal("short original silently trimmed the source interval")
	}
	media = canvasCutMediaFixture()
	wrong := media["alternate-video"]
	wrong.Kind = "image"
	media["alternate-video"] = wrong
	if _, _, err := ConvertCanvasTimelineCut(source, valid, texts, media); err == nil {
		t.Fatal("wrong media kind accepted")
	}
	if _, _, err := ConvertCanvasTimelineCut(source, valid, append(texts, CanvasCutText{ClipID: "caption", Text: "重复补字"}), canvasCutMediaFixture()); err == nil {
		t.Fatal("duplicate replacement text accepted")
	}
}

func TestCanvasCutSourceFingerprintPreservesOriginalAndRejectsConflictingLocators(t *testing.T) {
	source, err := InspectCanvasTimelineCut([]byte(canvasCutFixture))
	if err != nil {
		t.Fatal(err)
	}
	var value map[string]any
	json.Unmarshal([]byte(canvasCutFixture), &value)
	formatted, _ := json.MarshalIndent(value, "", "  ")
	again, err := InspectCanvasTimelineCut(formatted)
	if err != nil || again.SourceSHA256 != source.SourceSHA256 || !reflect.DeepEqual(again.Clips, source.Clips) {
		t.Fatal("format-only changes altered exact source identity", err)
	}
	changed := strings.Replace(canvasCutFixture, `"storageKey":"resource:original-video"`, `"storageKey":"resource:original-video","url":"/api/resources/different-video/file"`, 1)
	conflict, err := InspectCanvasTimelineCut([]byte(changed))
	if err != nil || conflict.Clips[0].PinnedResourceID != "" || conflict.Clips[0].SourceWarning == "" || conflict.SourceSHA256 == source.SourceSHA256 {
		t.Fatal("conflicting source identity was silently normalized", err)
	}
	withText := strings.Replace(canvasCutFixture, `"subtitleEntryIndex":7`, `"text":"已存在的原台词","subtitleEntryIndex":7`, 1)
	populated, err := InspectCanvasTimelineCut([]byte(withText))
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := ConvertCanvasTimelineCut(populated, []CanvasCutMapping{{ClipID: "repeat-a", ResourceID: "original-video"}, {ClipID: "repeat-b", ResourceID: "original-video"}}, []CanvasCutText{{ClipID: "caption", Text: "不应偷偷改写原文"}}, canvasCutMediaFixture()); err == nil {
		t.Fatal("conversion overwrote existing caption text")
	}
}
