package production

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"strings"
	"unicode/utf16"
)

// Pixel lengths use a 1080px short edge, so the same appearance can be reused
// by landscape and portrait cuts. Provenance remains separate and immutable.
type CaptionPresentation struct {
	Version         int                `json:"version"`
	FontSize        float64            `json:"fontSize"`
	Color           string             `json:"color"`
	Position        string             `json:"position"`
	BackgroundColor string             `json:"backgroundColor"`
	Padding         float64            `json:"padding"`
	MarginPercent   *float64           `json:"marginPercent,omitempty"`
	Highlights      []CaptionHighlight `json:"highlights,omitempty"`
}

type CaptionHighlight struct {
	Start           int     `json:"start"`
	End             int     `json:"end"`
	SourceText      string  `json:"sourceText"`
	Color           string  `json:"color"`
	BackgroundColor string  `json:"backgroundColor"`
	PaddingX        float64 `json:"paddingX"`
	PaddingY        float64 `json:"paddingY"`
	Radius          float64 `json:"radius"`
	Animation       string  `json:"animation"`
}

func DefaultCaptionPresentation() CaptionPresentation {
	return CaptionPresentation{Version: 1, FontSize: 44, Color: "#ffffff", Position: "bottom", BackgroundColor: "#00000099", Padding: 10}
}

func presentationLength(value, minimum, maximum float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0) && value >= minimum && value <= maximum
}

func ValidateCaptionPresentation(value CaptionPresentation, text string) error {
	invalid := func() error {
		return fmt.Errorf("字幕外观无效，请核对字号、颜色、位置和重点文字范围")
	}
	if value.Version != 1 || !presentationLength(value.FontSize, 12, 144) || !captionColor.MatchString(value.Color) || !captionColor.MatchString(value.BackgroundColor) || !presentationLength(value.Padding, 0, 72) || len(value.Highlights) > 64 {
		return invalid()
	}
	if value.Position != "top" && value.Position != "center" && value.Position != "bottom" {
		return invalid()
	}
	if value.MarginPercent != nil && !presentationLength(*value.MarginPercent, 0, 25) {
		return invalid()
	}
	units := utf16.Encode([]rune(text))
	previousEnd := 0
	for _, highlight := range value.Highlights {
		if highlight.SourceText != text || highlight.Start < previousEnd || highlight.Start < 0 || highlight.End <= highlight.Start || highlight.End > len(units) || !captionColor.MatchString(highlight.Color) || !captionColor.MatchString(highlight.BackgroundColor) || !presentationLength(highlight.PaddingX, 0, 72) || !presentationLength(highlight.PaddingY, 0, 72) || !presentationLength(highlight.Radius, 0, 72) {
			return invalid()
		}
		selected := units[highlight.Start:highlight.End]
		if selected[0] >= 0xdc00 && selected[0] <= 0xdfff || selected[len(selected)-1] >= 0xd800 && selected[len(selected)-1] <= 0xdbff {
			return invalid()
		}
		if highlight.Animation != "none" && highlight.Animation != "pop" && highlight.Animation != "wipe" {
			return invalid()
		}
		previousEnd = highlight.End
	}
	return nil
}

// CaptionPresentationForClip also resolves older saved styles without rewriting
// source records. A stale historical highlight is shown only after it is fixed.
func CaptionPresentationForClip(clip map[string]any) (CaptionPresentation, error) {
	text, _ := clip["text"].(string)
	if raw, exists := clip["captionPresentation"]; exists && raw != nil {
		encoded, err := json.Marshal(raw)
		if err != nil {
			return CaptionPresentation{}, err
		}
		decoder := json.NewDecoder(bytes.NewReader(encoded))
		decoder.DisallowUnknownFields()
		var result CaptionPresentation
		if err := decoder.Decode(&result); err != nil {
			return result, fmt.Errorf("字幕外观字段无效")
		}
		if decoder.Decode(new(any)) != io.EOF {
			return result, fmt.Errorf("字幕外观字段无效")
		}
		return result, ValidateCaptionPresentation(result, text)
	}
	result := DefaultCaptionPresentation()
	origin, _ := clip["captionOrigin"].(map[string]any)
	style, _ := clip["subtitleStyle"].(map[string]any)
	if style == nil {
		style, _ = origin["subtitleStyle"].(map[string]any)
	}
	if style == nil {
		return result, nil
	}
	// Legacy CSS sizes have no saved output-pixel basis. The migration policy
	// uses a 360px reference short edge; the original values remain in provenance.
	result.BackgroundColor = "#00000000"
	result.Padding = 0
	if n, ok := audioNumber(style["fontSize"]); ok {
		result.FontSize = n * 3
	}
	if value, ok := style["color"].(string); ok {
		result.Color = value
	}
	if value, ok := style["position"].(string); ok {
		result.Position = value
	}
	margin := 6.0
	if result.Position == "bottom" {
		margin = 8
	}
	result.MarginPercent = &margin
	if enabled, _ := style["highlightEnabled"].(bool); enabled {
		rows, _ := clip["subtitleHighlights"].([]any)
		if rows == nil {
			rows, _ = origin["subtitleHighlights"].([]any)
		}
		entry, exists := audioNumber(clip["subtitleEntryIndex"])
		if !exists {
			entry, exists = audioNumber(origin["entryIndex"])
		}
		for _, raw := range rows {
			row, _ := raw.(map[string]any)
			index, valid := audioNumber(row["entryIndex"])
			if !exists || !valid || index != entry || row["sourceText"] != text {
				continue
			}
			start, a := audioNumber(row["start"])
			end, b := audioNumber(row["end"])
			if !a || !b || start != math.Trunc(start) || end != math.Trunc(end) {
				return result, fmt.Errorf("原字幕重点范围无效")
			}
			h := CaptionHighlight{Start: int(start), End: int(end), SourceText: text, Color: "#ffd54a", BackgroundColor: "#111111", PaddingX: 18, PaddingY: 6, Radius: 12, Animation: "pop"}
			if value, ok := style["highlightTextColor"].(string); ok {
				h.Color = value
			}
			if value, ok := style["highlightBackgroundColor"].(string); ok {
				h.BackgroundColor = value
			}
			if n, ok := audioNumber(style["highlightPaddingX"]); ok {
				h.PaddingX = n * 3
			}
			if n, ok := audioNumber(style["highlightPaddingY"]); ok {
				h.PaddingY = n * 3
			}
			if n, ok := audioNumber(style["highlightRadius"]); ok {
				h.Radius = n * 3
			}
			if value, ok := style["highlightAnimation"].(string); ok {
				h.Animation = value
			}
			result.Highlights = append(result.Highlights, h)
		}
	}
	if strings.TrimSpace(text) == "" && len(result.Highlights) > 0 {
		return result, fmt.Errorf("重点文字缺少字幕内容")
	}
	return result, ValidateCaptionPresentation(result, text)
}
