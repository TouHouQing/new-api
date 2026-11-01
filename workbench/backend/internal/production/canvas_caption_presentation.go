package production

import (
	"fmt"
	"regexp"
	"unicode/utf16"
)

var captionColor = regexp.MustCompile(`^#[a-fA-F0-9]{6}([a-fA-F0-9]{2})?$`)

// Keep the existing node presentation contract bounded. Offsets use browser
// UTF-16 units, including emoji; stale highlights must be corrected explicitly.
func validateCanvasCaptionPresentation(source CanvasNodeCaptionSnapshot) error {
	invalid := func() error {
		return fmt.Errorf("字幕样式或重点标记无效，请在画布中重新保存字幕")
	}
	if source.Style != nil {
		style, ok := source.Style.(map[string]any)
		if !ok {
			return invalid()
		}
		for key, value := range style {
			switch key {
			case "fontSize":
				n, ok := audioNumber(value)
				if !ok || n < 12 || n > 40 {
					return invalid()
				}
			case "highlightPaddingX", "highlightPaddingY", "highlightRadius":
				n, ok := audioNumber(value)
				if !ok || n < 0 || n > 24 {
					return invalid()
				}
			case "maxCharsPerEntry":
				n, ok := audioNumber(value)
				if !ok || n < 20 || n > 60 || n != float64(int(n)) {
					return invalid()
				}
			case "color", "highlightBackgroundColor", "highlightTextColor":
				s, ok := value.(string)
				if !ok || !captionColor.MatchString(s) {
					return invalid()
				}
			case "position":
				if value != "top" && value != "center" && value != "bottom" {
					return invalid()
				}
			case "highlightAnimation":
				if value != "none" && value != "pop" && value != "wipe" {
					return invalid()
				}
			case "highlightEnabled", "autoResegment":
				if _, ok := value.(bool); !ok {
					return invalid()
				}
			default:
				return invalid()
			}
		}
	}
	if source.Highlights == nil {
		return nil
	}
	rows, ok := source.Highlights.([]any)
	if !ok || len(rows) > len(source.Captions) {
		return invalid()
	}
	entries := map[int]string{}
	used := map[int]bool{}
	for _, cue := range source.Captions {
		entries[cue.Index] = cue.Text
	}
	for _, row := range rows {
		highlight, ok := row.(map[string]any)
		if !ok || len(highlight) != 5 {
			return invalid()
		}
		for key := range highlight {
			if key != "entryIndex" && key != "start" && key != "end" && key != "highlightText" && key != "sourceText" {
				return invalid()
			}
		}
		index, ok := audioNumber(highlight["entryIndex"])
		if !ok || index != float64(int(index)) || used[int(index)] {
			return invalid()
		}
		text, exists := entries[int(index)]
		if !exists || highlight["sourceText"] != text {
			return invalid()
		}
		from, a := audioNumber(highlight["start"])
		to, b := audioNumber(highlight["end"])
		units := utf16.Encode([]rune(text))
		if !a || !b || from < 0 || to <= from || to > float64(len(units)) || from != float64(int(from)) || to != float64(int(to)) {
			return invalid()
		}
		selected := units[int(from):int(to)]
		// A half-surrogate highlight would render differently across preview
		// and export, so it is never silently normalized.
		if utf16.IsSurrogate(rune(selected[0])) && selected[0] >= 0xdc00 || utf16.IsSurrogate(rune(selected[len(selected)-1])) && selected[len(selected)-1] < 0xdc00 {
			return invalid()
		}
		if highlight["highlightText"] != string(utf16.Decode(selected)) {
			return invalid()
		}
		used[int(index)] = true
	}
	return nil
}
