package app

import (
	"context"
	"encoding/binary"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestTimelinePlaybackRateActualFramesAudioPitchAndIndependentTrack(t *testing.T) {
	if os.Getenv("CANVAS_TEST_REAL_FFMPEG") != "1" {
		t.Skip("set CANVAS_TEST_REAL_FFMPEG=1 for decoded media verification")
	}
	ffmpeg, err := renderFfmpegBinary()
	if err != nil {
		t.Fatal(err)
	}
	probe, err := exec.LookPath("ffprobe")
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	run := func(t *testing.T, args ...string) []byte {
		t.Helper()
		output, err := exec.CommandContext(ctx, ffmpeg, args...).Output()
		if err != nil {
			if exit, ok := err.(*exec.ExitError); ok {
				t.Fatalf("ffmpeg failed: %v %s", err, exit.Stderr)
			}
			t.Fatal(err)
		}
		return output
	}
	directory := t.TempDir()
	source := filepath.Join(directory, "source.mp4")
	video := "color=c=black:s=160x96:r=24:d=6,drawbox=c=red:t=fill:enable='lt(t,2)',drawbox=c=green:t=fill:enable='gte(t,2)*lt(t,4)',drawbox=c=blue:t=fill:enable='gte(t,4)'"
	audio := "aevalsrc=0.2*sin(2*PI*if(lt(t\\,2)\\,220\\,if(lt(t\\,4)\\,660\\,880))*t):s=16000:d=6"
	run(t, "-y", "-f", "lavfi", "-i", video, "-f", "lavfi", "-i", audio, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", source)
	for _, rate := range []float64{.25, .5, 2, 4} {
		t.Run(strconv.FormatFloat(rate, 'f', -1, 64), func(t *testing.T) {
			duration := int64(math.Round(4000 / rate))
			clip := renderClip{Kind: "video", SourceStartMs: 1000, DurationMs: duration, PlaybackRate: rate, Volume: 1}
			plan := renderPlan{Output: timelineRenderFormat{Width: 160, Height: 96, FPS: 24}, Segments: []renderSegment{{Kind: "video", DurationMs: duration, Clip: clip, Source: &renderSource{Path: source, HasAudio: true}}}}
			target := filepath.Join(directory, "speed-"+strconv.FormatFloat(rate, 'f', -1, 64)+".mp4")
			run(t, buildRenderFFmpegArgs(plan, target)...)
			output, err := exec.CommandContext(ctx, probe, "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", target).Output()
			seconds, parseErr := strconv.ParseFloat(strings.TrimSpace(string(output)), 64)
			if err != nil || parseErr != nil || math.Abs(seconds-float64(duration)/1000) > .09 {
				t.Fatalf("wrong encoded duration: %s %v %v", output, err, parseErr)
			}
			for _, point := range []struct {
				sourceSeconds float64
				color         int
			}{{1.3, 0}, {2.7, 1}, {4.5, 2}} {
				position := fmtSeconds((point.sourceSeconds - 1) / rate)
				pixel := run(t, "-v", "error", "-ss", position, "-i", target, "-frames:v", "1", "-vf", "scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-")
				if len(pixel) != 3 || int(pixel[point.color]) < 100 || int(pixel[point.color]) < int(pixel[(point.color+1)%3])+60 {
					t.Fatalf("source/program frame mismatch at %s: %v", position, pixel)
				}
			}
			assertDecodedPitch(t, run(t, "-v", "error", "-ss", fmtSeconds(1.5/rate), "-i", target, "-t", "0.12", "-f", "s16le", "-ac", "1", "-ar", "16000", "-"), 660)
			// Mute the source and mix a separately sped occurrence. This must
			// use its own cursor/rate, rather than the visible video's rate.
			plan.Segments[0].Clip.Volume = 0
			base := filepath.Join(directory, "base.mp4")
			run(t, buildRenderFFmpegArgs(plan, base)...)
			plan.Audio = []renderSegment{{Kind: "audio", Clip: renderClip{Kind: "audio", StartMs: 0, DurationMs: 500, SourceStartMs: 2200, PlaybackRate: 2, Volume: 1}, Source: &renderSource{Path: source}}}
			mixed := filepath.Join(directory, "mix.mp4")
			args, err := buildRenderFinishArgs(plan, directory, base, mixed)
			if err != nil {
				t.Fatal(err)
			}
			run(t, args...)
			assertDecodedPitch(t, run(t, "-v", "error", "-ss", "0.15", "-i", mixed, "-t", "0.12", "-f", "s16le", "-ac", "1", "-ar", "16000", "-"), 660)
		})
	}
}

func fmtSeconds(value float64) string { return strconv.FormatFloat(value, 'f', 6, 64) }

func assertDecodedPitch(t *testing.T, pcm []byte, expected float64) {
	t.Helper()
	if len(pcm) < 1600 {
		t.Fatal("decoded audio is missing or too short")
	}
	magnitude := func(hz float64) float64 {
		var real, imag float64
		for i := 0; i < len(pcm)/2; i++ {
			sample := float64(int16(binary.LittleEndian.Uint16(pcm[2*i:])))
			angle := 2 * math.Pi * hz * float64(i) / 16000
			real += sample * math.Cos(angle)
			imag += sample * math.Sin(angle)
		}
		return math.Hypot(real, imag)
	}
	signal := magnitude(expected)
	if signal < 100000 {
		t.Fatal("expected decoded tone is silent")
	}
	for _, other := range []float64{165, 220, 330, 880, 1320, 2640} {
		if signal < magnitude(other)*3 {
			t.Fatalf("pitch shifted or wrong source interval: expected %v, competitor %v", expected, other)
		}
	}
}
