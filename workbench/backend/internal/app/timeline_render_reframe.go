package app

import (
	"fmt"
	"math"
	"yingce/backend/internal/production"
)

// crop x/y are evaluated for each frame. Build a balanced expression instead
// of linear nested ifs, preserving the same source-time interpolation as UI.
// https://ffmpeg.org/ffmpeg-filters.html#crop
func renderReframeFilter(clip renderClip) string {
	if clip.Reframe == nil {
		return ""
	}
	r := clip.Reframe
	keys := r.Keys
	coordinate := func(axis string) string {
		value := func(key production.ReframeKey) float64 {
			if axis == "x" {
				return key.X
			}
			return key.Y
		}
		time := fmt.Sprintf("(t*1000+%d)", clip.SourceStartMs)
		var expression func(int, int) string
		expression = func(first, last int) string {
			if last-first == 1 {
				a, b := keys[first], keys[last]
				return fmt.Sprintf("(%.10f+(%.10f)*clip((%s-%d)/%d,0,1))", value(a), value(b)-value(a), time, a.TimeMs, b.TimeMs-a.TimeMs)
			}
			middle := (first + last) / 2
			return fmt.Sprintf("if(lt(%s,%d),%s,%s)", time, keys[middle].TimeMs, expression(first, middle), expression(middle, last))
		}
		return expression(0, len(keys)-1)
	}
	width := int(math.Floor(r.Width*float64(r.SourceWidth)/2)) * 2
	height := int(math.Floor(r.Height*float64(r.SourceHeight)/2)) * 2
	return fmt.Sprintf("setpts=PTS-STARTPTS,crop=%d:%d:'2*floor(iw*(%s)/2)':'2*floor(ih*(%s)/2)',", width, height, coordinate("x"), coordinate("y"))
}
