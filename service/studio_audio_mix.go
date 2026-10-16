package service

import (
	"fmt"
	"math"
	"strings"
)

// All times are film times, after adelay. Overlapping voices reduce music once.
func studioMusicVolumeFilter(volume, total float64, mix *StudioAudioMix, windows [][2]float64) string {
	gain := fmt.Sprintf("%g", volume)
	if mix.VoicePriority && len(windows) > 0 {
		terms := make([]string, 0, len(windows))
		for _, window := range windows {
			if window[1] <= window[0] {
				continue
			}
			terms = append(terms, fmt.Sprintf("between(t,%g,%g)", math.Max(0, window[0]), math.Min(total, window[1])))
		}
		if len(terms) > 0 {
			gain += fmt.Sprintf("*if(gt(%s,0),%g,1)", strings.Join(terms, "+"), mix.MusicGain)
		}
	}
	filter := fmt.Sprintf("volume='%s':eval=frame", gain)
	if mix.FadeOut > 0 {
		fade := math.Min(total, mix.FadeOut)
		filter += fmt.Sprintf(",afade=t=out:st=%g:d=%g", total-fade, fade)
	}
	return filter
}
