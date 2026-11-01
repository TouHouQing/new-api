package app

import (
	"context"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
	"yingce/backend/internal/production"
)

func TestRenderActualMotionVariantsBoundariesAndSourceClock(t *testing.T) {
	if os.Getenv("CANVAS_TEST_REAL_FFMPEG") != "1" {
		t.Skip("set CANVAS_TEST_REAL_FFMPEG=1 for actual motion frames")
	}
	ffmpeg, err := renderFfmpegBinary()
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	directory := t.TempDir()
	base := filepath.Join(directory, "base.mp4")
	run := func(cwd string, args ...string) []byte {
		t.Helper()
		command := exec.CommandContext(ctx, ffmpeg, args...)
		command.Dir = cwd
		out, err := command.Output()
		if err != nil {
			if failure, ok := err.(*exec.ExitError); ok {
				t.Fatalf("ffmpeg: %s", failure.Stderr)
			}
			t.Fatal(err)
		}
		return out
	}
	run(directory, "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=160x96:r=24", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=2", "-t", "2", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", base)
	frame := func(target string, seconds float64) []byte {
		raw := run(directory, "-v", "error", "-ss", fmt.Sprintf("%.6f", seconds), "-i", target, "-frames:v", "1", "-pix_fmt", "rgb24", "-f", "rawvideo", "-")
		if len(raw) != 160*96*3 {
			t.Fatal("decoded motion frame dimensions changed")
		}
		return raw
	}
	redBounds := func(raw []byte) (int, int, int, int, int) {
		left, top, right, bottom, count := 160, 96, -1, -1, 0
		for y := 0; y < 96; y++ {
			for x := 0; x < 160; x++ {
				i := (y*160 + x) * 3
				if int(raw[i]) > int(raw[i+1])+30 && raw[i] > 35 {
					left = min(left, x)
					right = max(right, x)
					top = min(top, y)
					bottom = max(bottom, y)
					count++
				}
			}
		}
		return left, top, right, bottom, count
	}
	var pulse []byte
	for _, animation := range []string{"none", "fade", "slide", "pulse", "bounce", "rotate", "morph"} {
		t.Run(animation, func(t *testing.T) {
			work := filepath.Join(directory, animation)
			if err := os.Mkdir(work, 0700); err != nil {
				t.Fatal(err)
			}
			g := &production.MotionGraphic{Version: 1, Kind: "shape", Shape: "square", X: .5, Y: .65, Size: 32, Color: "#ff0000", Animation: animation, BPM: 120, PhaseDurationMs: 1500}
			if animation == "rotate" {
				g.Kind = "icon"
				g.Icon = "arrow"
			}
			clip := renderClip{ID: "title", Kind: "text", TrackID: "titles", StartMs: 250, DurationMs: 1250, Text: "literal {%{pts}}", Graphic: g}
			plan := renderPlan{Output: timelineRenderFormat{Width: 160, Height: 96, FPS: 24}, Segments: []renderSegment{{Kind: "gap", DurationMs: 2000}}, Graphics: []renderClip{clip}}
			target := filepath.Join(work, "finished.mp4")
			args, err := buildRenderFinishArgs(plan, work, base, target)
			if err != nil {
				t.Fatal(err)
			}
			run(work, args...)
			for _, seconds := range []float64{.125, 1.75} {
				_, _, _, _, count := redBounds(frame(target, seconds))
				if count != 0 {
					t.Fatalf("graphic leaked outside occurrence at %.3f: %d pixels", seconds, count)
				}
			}
			active := frame(target, .875)
			left, top, right, bottom, count := redBounds(active)
			sample := production.SampleMotionGraphic(*g, 250, 1250, 0, 875, 160, 96)
			if count < 60 || math.Abs(float64(left+right)/2-sample.X) > 7 || math.Abs(float64(top+bottom)/2-sample.Y) > 7 {
				t.Fatalf("motion position differs: bounds=%d,%d,%d,%d pixels=%d sample=%+v", left, top, right, bottom, count, sample)
			}
			if animation == "morph" {
				if active[(47*160+65)*3] > 40 {
					t.Fatal("morph peak did not become a circle")
				}
				square := frame(target, .625)
				if square[(47*160+65)*3] < 170 {
					t.Fatal("morph trough did not return to square")
				}
			}
			if animation == "pulse" {
				pulse = active
				mid := frame(target, .75)
				maximum := byte(0)
				for i := 0; i < len(mid); i += 3 {
					maximum = max(maximum, mid[i])
				}
				if maximum < 130 || maximum > 180 {
					t.Fatalf("pulse opacity differs from original formula: %d", maximum)
				}
			}
			audio := run(directory, "-v", "error", "-ss", "1.9", "-i", target, "-t", "0.08", "-vn", "-ac", "1", "-ar", "44100", "-f", "s16le", "-")
			if len(audio) < 6000 {
				t.Fatal("motion finishing truncated program audio")
			}
		})
	}
	work := filepath.Join(directory, "split")
	if err := os.Mkdir(work, 0700); err != nil {
		t.Fatal(err)
	}
	g := &production.MotionGraphic{Version: 1, Kind: "shape", Shape: "square", X: .5, Y: .65, Size: 32, Color: "#ff0000", Animation: "pulse", BPM: 120, PhaseDurationMs: 1500}
	plan := renderPlan{Output: timelineRenderFormat{Width: 160, Height: 96, FPS: 24}, Segments: []renderSegment{{Kind: "gap", DurationMs: 2000}}, Graphics: []renderClip{{ID: "left", Kind: "text", StartMs: 250, DurationMs: 500, Graphic: g}, {ID: "right", Kind: "text", StartMs: 750, DurationMs: 750, SourceStartMs: 500, Graphic: g}}}
	target := filepath.Join(work, "split.mp4")
	args, err := buildRenderFinishArgs(plan, work, base, target)
	if err != nil {
		t.Fatal(err)
	}
	run(work, args...)
	actual := frame(target, .875)
	var errorSum int
	for i := range actual {
		errorSum += int(math.Abs(float64(actual[i]) - float64(pulse[i])))
	}
	if float64(errorSum)/float64(len(actual)) > 3 {
		t.Fatal("split reset or changed actual animation clock")
	}
}
