package service

import (
	"cmp"
	"errors"
	"fmt"
	"math"
	"regexp"
	"slices"
	"strconv"
	"strings"
)

var studioSubtitleTiming = regexp.MustCompile(`^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s+-->\s+(\d{2}):(\d{2}):(\d{2})[,.](\d{3})(.*)$`)

func ShiftStudioSubtitles(raw string, offset float64) (string, error) {
	if math.IsNaN(offset) || math.IsInf(offset, 0) || math.Abs(offset) > 3600 {
		return "", errors.New("invalid subtitle offset")
	}
	lines := strings.Split(strings.ReplaceAll(raw, "\r\n", "\n"), "\n")
	for index, line := range lines {
		if !strings.Contains(line, "-->") {
			continue
		}
		match := studioSubtitleTiming.FindStringSubmatch(line)
		if match == nil {
			if index > 0 {
				if _, err := strconv.Atoi(strings.TrimSpace(lines[index-1])); err == nil {
					return "", errors.New("invalid SRT cue timing")
				}
			}
			continue
		}
		start, end, err := studioSubtitleSeconds(match)
		if err != nil {
			return "", err
		}
		lines[index] = studioSubtitleTime(start+offset) + " --> " + studioSubtitleTime(end+offset) + match[9]
	}
	return strings.Join(lines, "\n"), nil
}

func studioSubtitleSeconds(match []string) (float64, float64, error) {
	if len(match) < 9 {
		return 0, 0, errors.New("invalid SRT cue timing")
	}
	values := make([]int, 8)
	for i := range 8 {
		value, err := strconv.Atoi(match[i+1])
		if err != nil {
			return 0, 0, err
		}
		values[i] = value
	}
	start := float64(values[0]*3600+values[1]*60+values[2]) + float64(values[3])/1000
	end := float64(values[4]*3600+values[5]*60+values[6]) + float64(values[7])/1000
	if values[1] > 59 || values[2] > 59 || values[5] > 59 || values[6] > 59 || start > 3600 || end > 3600 || end <= start {
		return 0, 0, errors.New("SRT cue timing exceeds the supported range")
	}
	return start, end, nil
}

// BuildStudioDeliverySubtitles combines already shifted global/dialogue SRT
// with per-clip captions at the same output times used by the video renderer.
// It builds the sidecar after rendering so clip captions are not burned twice.
func BuildStudioDeliverySubtitles(plan *StudioRenderPlan, durations []float64) (string, error) {
	if plan == nil || len(plan.Clips) != len(durations) {
		return "", errors.New("subtitle export needs matching clip durations")
	}
	type cue struct {
		start, end     float64
		text, settings string
	}
	cues := []cue{}
	for block := range strings.SplitSeq(strings.TrimSpace(strings.ReplaceAll(plan.Subtitles, "\r\n", "\n")), "\n\n") {
		if strings.TrimSpace(block) == "" {
			continue
		}
		lines := strings.Split(block, "\n")
		timing := 0
		if _, err := strconv.Atoi(strings.TrimSpace(lines[0])); err == nil {
			timing = 1
		}
		if timing >= len(lines) {
			return "", errors.New("subtitle export contains an incomplete cue")
		}
		match := studioSubtitleTiming.FindStringSubmatch(strings.TrimSpace(lines[timing]))
		start, end, err := studioSubtitleSeconds(match)
		if err != nil {
			return "", err
		}
		text := strings.TrimSpace(strings.Join(lines[timing+1:], "\n"))
		if text != "" {
			cues = append(cues, cue{start: start, end: end, text: text, settings: match[9]})
		}
	}
	offset := 0.0
	for index, clip := range plan.Clips {
		duration := durations[index]
		if math.IsNaN(duration) || math.IsInf(duration, 0) || duration <= 0 {
			return "", errors.New("subtitle export contains an invalid clip duration")
		}
		start, end := clip.CaptionOffset, duration
		if clip.CaptionDuration > 0 {
			end = min(end, start+clip.CaptionDuration)
		}
		text := strings.TrimSpace(strings.Join(strings.FieldsFunc(clip.Caption, func(r rune) bool { return r == '\r' || r == '\n' }), "\n"))
		if text != "" && end > start {
			cues = append(cues, cue{start: offset + start, end: offset + end, text: text})
		}
		offset += duration
	}
	slices.SortStableFunc(cues, func(a, b cue) int {
		if order := cmp.Compare(a.start, b.start); order != 0 {
			return order
		}
		return cmp.Compare(a.end, b.end)
	})
	var output strings.Builder
	for index, entry := range cues {
		fmt.Fprintf(&output, "%d\n%s --> %s%s\n%s\n\n", index+1, studioSubtitleTime(entry.start), studioSubtitleTime(entry.end), entry.settings, entry.text)
	}
	return output.String(), nil
}
