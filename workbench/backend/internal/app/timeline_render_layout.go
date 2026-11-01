package app

import (
	"fmt"
	"sort"
)

// Resolve stacked full-frame clips into disjoint visible intervals. Export
// length must follow program time, rather than adding overlapping durations.
// Smaller track order is the foreground. A later clip wins on the same track.
func visibleRenderIntervals(clips []renderClip, tracks []renderTrack) []renderClip {
	orders := map[string]int{}
	for _, track := range tracks {
		orders[track.ID] = track.Order
	}
	boundaries := make([]int64, 0, len(clips)*2)
	for _, clip := range clips {
		boundaries = append(boundaries, clip.StartMs, clip.StartMs+clip.DurationMs)
	}
	sort.Slice(boundaries, func(i, j int) bool { return boundaries[i] < boundaries[j] })
	type interval struct {
		source     int
		start, end int64
	}
	parts := []interval{}
	for i := 0; i+1 < len(boundaries); i++ {
		start, end := boundaries[i], boundaries[i+1]
		if start == end {
			continue
		}
		chosen := -1
		for j, clip := range clips {
			if clip.StartMs > start || clip.StartMs+clip.DurationMs < end {
				continue
			}
			if chosen < 0 || orders[clip.TrackID] < orders[clips[chosen].TrackID] ||
				(orders[clip.TrackID] == orders[clips[chosen].TrackID] && clip.StartMs > clips[chosen].StartMs) {
				chosen = j
			}
		}
		if chosen < 0 {
			continue
		}
		if len(parts) > 0 && parts[len(parts)-1].source == chosen && parts[len(parts)-1].end == start {
			parts[len(parts)-1].end = end
		} else {
			parts = append(parts, interval{chosen, start, end})
		}
	}
	result := make([]renderClip, 0, len(parts))
	for _, part := range parts {
		clip := clips[part.source]
		offset := part.start - clip.StartMs
		clip.fadeOffsetMs += offset
		if clip.fadeDurationMs == 0 {
			clip.fadeDurationMs = clip.DurationMs
		}
		clip.StartMs, clip.DurationMs = part.start, part.end-part.start
		if clip.Kind == "video" {
			clip.SourceStartMs += clip.sourceOffset(offset)
		}
		result = append(result, clip)
	}
	return result
}

func validateRenderLayout(project renderProject) error {
	plan := buildRenderPlan(project)
	if _, err := renderCaptionPlacements(plainCaptionLayoutClips(plan.TextClips)); err != nil {
		return err
	}
	if len(plan.Segments)+len(plan.Audio) > 128 || len(plan.TextClips) > 128 || len(plan.Graphics) > 128 {
		return fmt.Errorf("本次导出超过 128 个片段，请分段导出")
	}
	for _, clip := range plan.TextClips {
		if len([]rune(clip.Text)) > 2000 {
			return fmt.Errorf("单个字幕或文字片段不能超过 2000 字，请拆分后导出")
		}
	}
	return nil
}

func renderVideoFades(clip renderClip) string {
	value := ""
	if clip.FadeInMs <= 0 && clip.FadeOutMs <= 0 {
		return value
	}
	if clip.fadeOffsetMs > 0 {
		value += fmt.Sprintf(",setpts=PTS+%s/TB", renderSeconds(clip.fadeOffsetMs))
	}
	duration := clip.DurationMs
	if clip.fadeDurationMs > 0 {
		duration = clip.fadeDurationMs
	}
	if clip.FadeInMs > 0 {
		value += fmt.Sprintf(",fade=t=in:st=0:d=%s", renderSeconds(clip.FadeInMs))
		if clip.FadeInColor == "white" {
			value += ":color=white"
		}
	}
	if clip.FadeOutMs > 0 {
		value += fmt.Sprintf(",fade=t=out:st=%s:d=%s", renderSeconds(duration-clip.FadeOutMs), renderSeconds(clip.FadeOutMs))
		if clip.FadeOutColor == "white" {
			value += ":color=white"
		}
	}
	if clip.fadeOffsetMs > 0 {
		value += ",setpts=PTS-STARTPTS"
	}
	return value
}
