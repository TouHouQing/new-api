package app

import (
	"fmt"
	"sort"
	"strings"
)

type captionPlacement struct {
	text         string
	lane, offset int
}

func wrapRenderCaption(text string, lineUnits ...int) (string, int, error) {
	limit := 76
	if len(lineUnits) > 0 {
		limit = lineUnits[0]
	}
	lines := []string{}
	for _, input := range strings.Split(strings.ReplaceAll(strings.TrimSpace(text), "\r\n", "\n"), "\n") {
		var line strings.Builder
		units := 0
		for _, char := range input {
			width := 1
			if char >= 0x2e80 {
				width = 2
			}
			if units+width > limit {
				lines = append(lines, line.String())
				line.Reset()
				units = 0
			}
			line.WriteRune(char)
			units += width
		}
		lines = append(lines, line.String())
	}
	if len(lines) > 3 {
		return "", 0, fmt.Errorf("单条字幕超过三行，请拆分字幕后导出")
	}
	return strings.Join(lines, "\n"), len(lines), nil
}

func renderCaptionPlacements(clips []renderClip, lineUnits ...int) (map[string]captionPlacement, error) {
	ordered := append([]renderClip(nil), clips...)
	sort.SliceStable(ordered, func(i, j int) bool {
		if ordered[i].StartMs != ordered[j].StartMs {
			return ordered[i].StartMs < ordered[j].StartMs
		}
		return ordered[i].ID < ordered[j].ID
	})
	ends := []int64{}
	heights := []int{}
	placements := map[string]captionPlacement{}
	for _, clip := range ordered {
		if clip.Kind != "subtitle" {
			continue
		}
		text, lines, err := wrapRenderCaption(clip.Text, lineUnits...)
		if err != nil {
			return nil, err
		}
		lane := 0
		for lane < len(ends) && ends[lane] > clip.StartMs {
			lane++
		}
		if lane == len(ends) {
			ends = append(ends, 0)
			heights = append(heights, 0)
		}
		if lane >= 4 {
			return nil, fmt.Errorf("同时显示的字幕超过四条，请整理字幕或隐藏多余轨道")
		}
		ends[lane] = clip.StartMs + clip.DurationMs
		heights[lane] = max(heights[lane], lines*54+14)
		placements[clip.ID] = captionPlacement{text: text, lane: lane}
	}
	for id, placement := range placements {
		placement.offset = 64
		for lane := 0; lane < placement.lane; lane++ {
			placement.offset += heights[lane]
		}
		placements[id] = placement
	}
	return placements, nil
}

func plainCaptionLayoutClips(clips []renderClip) []renderClip {
	result := make([]renderClip, 0, len(clips))
	for _, clip := range clips {
		style := clip.Presentation
		if !clip.legacyCaptionStyle && (style.Version == 0 || style.FontSize == 44 && style.Padding == 10 && style.Position == "bottom" && len(style.Highlights) == 0) {
			result = append(result, clip)
		}
	}
	return result
}
