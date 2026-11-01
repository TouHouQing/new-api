package app

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
	"yingce/backend/internal/production"
)

func TestReframeActualPortraitLandscapeSpeedAndIndependentOccurrence(t *testing.T) {
	if os.Getenv("CANVAS_TEST_REAL_FFMPEG") != "1" {
		t.Skip("explicit actual FFmpeg acceptance required")
	}
	ffmpeg, err := renderFfmpegBinary()
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	run := func(args ...string) []byte {
		t.Helper()
		out, err := exec.CommandContext(ctx, ffmpeg, args...).Output()
		if err != nil {
			if e, ok := err.(*exec.ExitError); ok {
				t.Fatalf("actual ffmpeg: %v %s", err, e.Stderr)
			}
			t.Fatal(err)
		}
		return out
	}
	directory := t.TempDir()
	source := filepath.Join(directory, "known-red-blue.mp4")
	run("-y", "-f", "lavfi", "-i", "color=red:s=320x180:r=24:d=4,drawbox=x=160:y=0:w=160:h=180:c=blue:t=fill", "-c:v", "libx264", "-pix_fmt", "yuv420p", source)
	reframe := &production.TimelineReframe{AnalysisID: "analysis", RevisionID: "revision", ResourceID: "original", SourceSHA256: strings.Repeat("a", 64), SourceWidth: 320, SourceHeight: 180, Width: .5, Height: 1, StartMs: 1000, EndMs: 3000, Keys: []production.ReframeKey{{TimeMs: 1000, X: 0, Y: 0}, {TimeMs: 2000, X: .25, Y: 0}, {TimeMs: 2875, X: .5, Y: 0}}}
	if !reframe.Valid() {
		t.Fatal("invalid actual crop fixture")
	}
	for _, format := range []timelineRenderFormat{{Width: 320, Height: 180, FPS: 24}, {Width: 90, Height: 160, FPS: 24}} {
		t.Run(strings.ReplaceAll(fmtSeconds(float64(format.Width)), ".", "-"), func(t *testing.T) {
			clip := renderClip{Kind: "video", SourceStartMs: 1000, DurationMs: 1000, PlaybackRate: 2, Volume: 1, Reframe: reframe}
			original := clip
			original.Reframe = nil
			original.SourceStartMs = 0
			original.PlaybackRate = 1
			plan := renderPlan{Output: format, Segments: []renderSegment{{Kind: "video", DurationMs: 1000, Clip: clip, Source: &renderSource{Path: source}}, {Kind: "video", DurationMs: 1000, Clip: original, Source: &renderSource{Path: source}}}}
			target := filepath.Join(directory, "actual-"+fmtSeconds(float64(format.Width))+".mp4")
			run(buildRenderFFmpegArgs(plan, target)...)
			pixel := func(seconds string, x int) []byte {
				return run("-v", "error", "-ss", seconds, "-i", target, "-frames:v", "1", "-vf", "crop=1:1:"+fmtSeconds(float64(x))+":"+fmtSeconds(float64(format.Height/2))+":exact=1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-")
			}
			early, late := pixel("0.05", format.Width/2), pixel("0.95", format.Width/2)
			if len(early) != 3 || early[0] < 180 || early[2] > 50 || len(late) != 3 || late[2] < 180 || late[0] > 50 {
				t.Fatalf("source-time crop differs at2x: %v -> %v", early, late)
			}
			independent := pixel("1.5", format.Width/4)
			if len(independent) != 3 || independent[0] < 180 || independent[2] > 50 {
				t.Fatal("independent occurrence was cropped", independent)
			}
			if format.Height > format.Width {
				padding := run("-v", "error", "-ss", "0.5", "-i", target, "-frames:v", "1", "-vf", "crop=1:1:45:1:exact=1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-")
				if len(padding) != 3 || padding[0] > 10 || padding[1] > 10 || padding[2] > 10 {
					t.Fatal("portrait padding differs", padding)
				}
			}
		})
	}
}
