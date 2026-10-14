package service

import (
	"fmt"
	"strconv"
	"strings"
	"unicode"
)

// Conservative layout checks use the renderer's safe area. Wide CJK glyphs
// count as one em and other glyphs as 0.6 em; findings are advisory, never an
// automatic creative approval.
func StudioSubtitleFindings(text string, duration float64, width, height int) []map[string]any {
	findings := []map[string]any{}
	lines := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	for index, line := range lines {
		timing := studioSubtitleTiming.FindStringSubmatch(line)
		if timing == nil {
			continue
		}
		values := make([]int, 8)
		for i := range 8 {
			values[i], _ = strconv.Atoi(timing[i+1])
		}
		start := float64(values[0]*3600+values[1]*60+values[2]) + float64(values[3])/1000
		end := float64(values[4]*3600+values[5]*60+values[6]) + float64(values[7])/1000
		cue := []string{}
		for i := index + 1; i < len(lines) && strings.TrimSpace(lines[i]) != ""; i++ {
			cue = append(cue, lines[i])
		}
		if start < 0 || end <= start || end > duration+.01 {
			findings = append(findings, map[string]any{"code": "subtitle_time_out_of_range", "severity": "warning", "seconds": start, "detail": fmt.Sprintf("Subtitle ends at %.2fs; film duration is %.2fs", end, duration)})
		}
		overflow := len(cue) > 2
		for _, line := range cue {
			ems := 0.0
			for _, r := range line {
				if unicode.In(r, unicode.Han, unicode.Hiragana, unicode.Katakana, unicode.Hangul) {
					ems++
				} else {
					ems += .6
				}
			}
			overflow = overflow || ems*float64(height)*.045 > float64(width)*.9
		}
		if overflow {
			findings = append(findings, map[string]any{"code": "subtitle_layout_overflow", "severity": "warning", "seconds": start, "detail": strings.Join(cue, "\n")})
		}
	}
	return findings
}
