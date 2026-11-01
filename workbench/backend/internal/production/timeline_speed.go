package production

import (
	"encoding/json"
	"math"
)

// Playback rate belongs to one use of a source. Timeline times remain program
// milliseconds; source offsets advance by rate * program milliseconds.
func TimelinePlaybackRate(clip map[string]any) (float64, bool) {
	rate := 1.0
	if value, exists := clip["playbackRate"]; exists {
		number, ok := value.(json.Number)
		if !ok {
			return 0, false
		}
		var err error
		rate, err = number.Float64()
		if err != nil || math.IsNaN(rate) || math.IsInf(rate, 0) || rate < .25 || rate > 4 {
			return 0, false
		}
	}
	for _, key := range []string{"speed", "rate"} {
		if value, exists := clip[key]; exists {
			number, ok := value.(json.Number)
			legacy, err := number.Float64()
			if !ok || err != nil || legacy != 1 {
				return 0, false
			}
		}
	}
	for _, key := range []string{"speedRamp", "timeRemap", "retime"} {
		if value, exists := clip[key]; exists && value != nil && value != "" {
			return 0, false
		}
	}
	if kind := stringValue(clip, "kind"); rate != 1 && kind != "video" && kind != "audio" {
		return 0, false
	}
	return rate, true
}

func sourceOffset(programMs int64, rate float64) int64 {
	return int64(math.Round(float64(programMs) * rate))
}

func programOffset(sourceMs int64, rate float64) int64 {
	return int64(math.Round(float64(sourceMs) / rate))
}
