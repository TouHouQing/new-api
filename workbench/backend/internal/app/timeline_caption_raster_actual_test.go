package app

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"yingce/backend/internal/production"
)

func TestRenderActualCaptionPresentationColorPositionAndAnimatedHighlight(t *testing.T) {
	if os.Getenv("CANVAS_TEST_REAL_FFMPEG") != "1" {
		t.Skip("set CANVAS_TEST_REAL_FFMPEG=1 for decoded presentation verification")
	}
	ffmpeg, err := renderFfmpegBinary()
	if err != nil {
		t.Fatal(err)
	}
	directory := t.TempDir()
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	run := func(args ...string) []byte {
		t.Helper()
		command := exec.CommandContext(ctx, ffmpeg, args...)
		command.Dir = directory
		output, err := command.Output()
		if err != nil {
			if failure, ok := err.(*exec.ExitError); ok {
				t.Fatalf("ffmpeg: %v %s", err, failure.Stderr)
			}
			t.Fatal(err)
		}
		return output
	}
	base, target := filepath.Join(directory, "base.mp4"), filepath.Join(directory, "finished.mp4")
	run("-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=1920x1080:r=30", "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=44100:duration=2", "-t", "2", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", base)
	style := production.DefaultCaptionPresentation()
	style.FontSize = 80
	style.Color = "#ff0000"
	style.BackgroundColor = "#00000000"
	style.Position = "top"
	plan := renderPlan{Segments: []renderSegment{{Kind: "gap", DurationMs: 2000}}, TextClips: []renderClip{{ID: "red", Kind: "subtitle", Text: "安全原文 {\\N} %{pts}", StartMs: 250, DurationMs: 1500, Presentation: style}}}
	for _, position := range []string{"center", "bottom"} {
		style := production.DefaultCaptionPresentation()
		style.FontSize = 80
		style.Position = position
		style.BackgroundColor = "#00000000"
		animation := "wipe"
		if position == "bottom" {
			animation = "pop"
		}
		style.Highlights = []production.CaptionHighlight{{Start: 2, End: 4, SourceText: "开场重点完成", Color: "#ffff00", BackgroundColor: "#0000ff", PaddingX: 12, PaddingY: 10, Radius: 12, Animation: animation}}
		plan.TextClips = append(plan.TextClips, renderClip{ID: position, Kind: "subtitle", Text: "开场重点完成", StartMs: 500, DurationMs: 1000, Presentation: style})
	}
	args, err := buildRenderFinishArgs(plan, directory, base, target)
	if err != nil {
		t.Fatal(err)
	}
	run(args...)
	frame := func(seconds string) []byte {
		return run("-v", "error", "-ss", seconds, "-i", target, "-frames:v", "1", "-pix_fmt", "rgb24", "-f", "rawvideo", "-")
	}
	count := func(raw []byte, top, bottom int, blue bool) int {
		total := 0
		for y := top; y < bottom; y++ {
			for x := 200; x < 1720; x++ {
				i := (y*1920 + x) * 3
				if i+2 >= len(raw) {
					t.Fatal("decoded frame incomplete")
				}
				if blue {
					if raw[i] < 70 && raw[i+1] < 70 && raw[i+2] > 160 {
						total++
					}
				} else if raw[i] > 160 && raw[i+1] < 70 && raw[i+2] < 70 {
					total++
				}
			}
		}
		return total
	}
	before, early, settled, after := frame("0.1"), frame("0.533"), frame("0.9"), frame("1.9")
	if count(before, 0, 1080, true) > 20 || count(after, 0, 1080, true) > 20 || count(before, 0, 1080, false) > 20 {
		t.Fatal("caption appeared outside its exact program interval")
	}
	if count(settled, 35, 260, false) < 400 {
		t.Fatal("top caption did not use the selected red color")
	}
	for _, bounds := range [][2]int{{400, 680}, {800, 1040}} {
		first, last := count(early, bounds[0], bounds[1], true), count(settled, bounds[0], bounds[1], true)
		if last < 300 || first >= last || first < 10 {
			t.Fatalf("highlight reveal/scale was not rendered: bounds=%v early=%d settled=%d", bounds, first, last)
		}
	}
	if err := validateRenderedAudio(ctx, target, 2000); err != nil {
		t.Fatal("caption finishing truncated the original audio", err)
	}
}
