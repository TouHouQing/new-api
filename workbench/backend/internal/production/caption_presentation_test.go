package production

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestCaptionPresentationKeepsLegacyStylesAndIgnoresStaleHistoricalHighlights(t *testing.T) {
	decode := func(raw string) map[string]any {
		var clip map[string]any
		d := json.NewDecoder(strings.NewReader(raw))
		d.UseNumber()
		if err := d.Decode(&clip); err != nil {
			t.Fatal(err)
		}
		return clip
	}
	clip := decode(`{"text":"你好🌟世界","captionOrigin":{"entryIndex":7,"subtitleStyle":{"fontSize":22,"color":"#ff0000","position":"top","highlightEnabled":true,"highlightAnimation":"wipe"},"subtitleHighlights":[{"entryIndex":7,"start":2,"end":4,"highlightText":"🌟","sourceText":"你好🌟世界"}]}}`)
	got, err := CaptionPresentationForClip(clip)
	if err != nil {
		t.Fatal(err)
	}
	if got.FontSize != 66 || got.Color != "#ff0000" || got.Position != "top" || got.BackgroundColor != "#00000000" || len(got.Highlights) != 1 || got.Highlights[0].End != 4 || got.Highlights[0].Animation != "wipe" {
		t.Fatalf("lost legacy presentation: %+v", got)
	}
	clip["text"] = "后来校正的字幕"
	got, err = CaptionPresentationForClip(clip)
	if err != nil || len(got.Highlights) != 0 || got.FontSize != 66 {
		t.Fatalf("stale highlights must not move to unrelated text: %+v %v", got, err)
	}
	if clip["captionOrigin"].(map[string]any)["subtitleHighlights"].([]any)[0].(map[string]any)["sourceText"] != "你好🌟世界" {
		t.Fatal("source provenance was modified")
	}
}

func TestCaptionPresentationRejectsMalformedOrOverlappingNativeHighlights(t *testing.T) {
	text := "你好🌟世界"
	valid := DefaultCaptionPresentation()
	valid.Highlights = []CaptionHighlight{{Start: 2, End: 4, SourceText: text, Color: "#ffd54a", BackgroundColor: "#111111cc", PaddingX: 8, PaddingY: 2, Radius: 4, Animation: "pop"}}
	if err := ValidateCaptionPresentation(valid, text); err != nil {
		t.Fatal(err)
	}
	for name, change := range map[string]func(*CaptionPresentation){
		"half surrogate":    func(v *CaptionPresentation) { v.Highlights[0].Start = 3 },
		"stale text":        func(v *CaptionPresentation) { v.Highlights[0].SourceText = "旧文字" },
		"overlap":           func(v *CaptionPresentation) { v.Highlights = append(v.Highlights, v.Highlights[0]) },
		"filter injection":  func(v *CaptionPresentation) { v.Color = "red:enable=1" },
		"huge raster":       func(v *CaptionPresentation) { v.FontSize = 1e9 },
		"unknown animation": func(v *CaptionPresentation) { v.Highlights[0].Animation = "script" },
	} {
		t.Run(name, func(t *testing.T) {
			bad := valid
			bad.Highlights = append([]CaptionHighlight(nil), valid.Highlights...)
			change(&bad)
			if ValidateCaptionPresentation(bad, text) == nil {
				t.Fatal("invalid presentation accepted")
			}
		})
	}
	encoded, _ := json.Marshal(valid)
	var raw map[string]any
	_ = json.Unmarshal(encoded, &raw)
	raw["fontSzie"] = 44
	if _, err := CaptionPresentationForClip(map[string]any{"text": text, "captionPresentation": raw}); err == nil {
		t.Fatal("unknown native field accepted")
	}
}

func TestCaptionPresentationEditsStayOnOneOccurrenceAndClearChangedTextHighlights(t *testing.T) {
	before := json.RawMessage(`{"version":2,"tracks":[{"id":"s","kind":"subtitle"}],"clips":[{"id":"cue","nodeId":"same-node","trackId":"s","kind":"subtitle","startMs":0,"durationMs":1000,"text":"你好🌟世界","captionOrigin":{"originalText":"最早的文字"}},{"id":"other","nodeId":"same-node","trackId":"s","kind":"subtitle","startMs":1000,"durationMs":1000,"text":"其他实例"}],"durationMs":2000}`)
	style := DefaultCaptionPresentation()
	style.Position = "top"
	style.Color = "#ff0000"
	style.Highlights = []CaptionHighlight{{Start: 2, End: 4, SourceText: "你好🌟世界", Color: "#ffff00", BackgroundColor: "#111111", PaddingX: 8, PaddingY: 2, Radius: 4, Animation: "wipe"}}
	styled, err := ApplyTimelineEdits(before, []TimelineEditCommand{{Op: "setCaptionPresentation", ID: "cue", CaptionPresentation: &style}})
	if err != nil {
		t.Fatal(err)
	}
	text := "修改后的台词"
	corrected, err := ApplyTimelineEdits(styled, []TimelineEditCommand{{Op: "setCaptionText", ID: "cue", Text: &text}})
	if err != nil {
		t.Fatal(err)
	}
	var final map[string]any
	decoder := json.NewDecoder(strings.NewReader(string(corrected)))
	decoder.UseNumber()
	_ = decoder.Decode(&final)
	clips := listValue(final["clips"])
	first, other := objectValue(clips[0]), objectValue(clips[1])
	appearance, err := CaptionPresentationForClip(first)
	if err != nil || len(appearance.Highlights) != 0 || appearance.Color != "#ff0000" || appearance.Position != "top" || first["text"] != text || other["text"] != "其他实例" || objectValue(first["captionOrigin"])["originalText"] != "最早的文字" {
		t.Fatalf("appearance edit changed provenance or other occurrence: %s %v", corrected, err)
	}
	if strings.Contains(string(before), "captionPresentation") || !strings.Contains(string(styled), "highlights") {
		t.Fatal("input or prior appearance snapshot changed")
	}
	if _, err := ApplyTimelineEdits(before, []TimelineEditCommand{{Op: "removeClip", ID: "cue", CaptionPresentation: &style}}); err == nil {
		t.Fatal("unrelated command accepted appearance arguments")
	}
	if _, err := ApplyTimelineEdits(before, []TimelineEditCommand{{Op: "addResource", ResourceID: "r", CaptionPresentation: &style}}); err == nil {
		t.Fatal("resource adoption ignored appearance arguments")
	}
	locked := json.RawMessage(strings.Replace(string(before), `"kind":"subtitle"}`, `"kind":"subtitle","locked":true}`, 1))
	if _, err := ApplyTimelineEdits(locked, []TimelineEditCommand{{Op: "setCaptionText", ID: "cue", Text: &text}}); err == nil {
		t.Fatal("locked track edited")
	}
}
