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

func TestRenderActualMixedOverlayOrderAndCaptionFrameClock(t *testing.T) {
	if os.Getenv("CANVAS_TEST_REAL_FFMPEG") != "1" {
		t.Skip("actual FFmpeg requested explicitly")
	}
	binary, err := renderFfmpegBinary()
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	for _, fps := range []int{24, 25, 60} {
		for _, graphicOnTop := range []bool{true, false} {
			t.Run(fmt.Sprintf("fps%d-graphicTop%v", fps, graphicOnTop), func(t *testing.T) {
				dir := t.TempDir()
				run := func(args ...string) []byte {
					t.Helper()
					command := exec.CommandContext(ctx, binary, args...)
					command.Dir = dir
					out, err := command.Output()
					if err != nil {
						if failure, ok := err.(*exec.ExitError); ok {
							t.Fatalf("ffmpeg: %s", failure.Stderr)
						}
						t.Fatal(err)
					}
					return out
				}
				base := filepath.Join(dir, "base.mp4")
				run("-v", "error", "-y", "-f", "lavfi", "-i", fmt.Sprintf("color=c=black:s=320x192:r=%d", fps), "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", "1", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", base)
				g := &production.MotionGraphic{Version: 1, Kind: "shape", Shape: "square", X: .5, Y: .5, Size: 120, Color: "#ff0000", Animation: "none", BPM: 120, PhaseDurationMs: 1000}
				caption := renderClip{ID: "caption", Kind: "subtitle", TrackID: "caption", StartMs: 0, DurationMs: 1000, Text: "测试", Presentation: production.CaptionPresentation{Version: 1, FontSize: 144, Color: "#ffffff", BackgroundColor: "#00ff00", Position: "center", Padding: 20, Highlights: []production.CaptionHighlight{{Start: 0, End: 2, SourceText: "测试", Color: "#ffffff", BackgroundColor: "#0000ff", PaddingX: 8, PaddingY: 4, Animation: "wipe"}}}}
				graphic := renderClip{ID: "graphic", Kind: "text", TrackID: "graphic", StartMs: 0, DurationMs: 1000, Text: "Square", Graphic: g}
				order := 0
				if !graphicOnTop {
					order = 2
				}
				plan := buildRenderPlan(renderProject{Version: 2, Tracks: []renderTrack{{ID: "graphic", Kind: "text", Order: order}, {ID: "caption", Kind: "subtitle", Order: 1}}, Clips: []renderClip{graphic, caption}})
				plan.Output = timelineRenderFormat{Width: 320, Height: 192, FPS: fps}
				if !plan.HasMedia || planDurationMs(plan) != 1000 {
					t.Fatal("standalone overlays did not form a complete program")
				}
				target := filepath.Join(dir, "final.mp4")
				args, err := buildRenderFinishArgs(plan, dir, base, target)
				if err != nil {
					t.Fatal(err)
				}
				run(args...)
				raw := run("-v", "error", "-ss", "0.5", "-i", target, "-frames:v", "1", "-pix_fmt", "rgb24", "-f", "rawvideo", "-")
				if len(raw) != 320*192*3 {
					t.Fatal("invalid frame")
				}
				green := 0
				for i := 0; i < len(raw); i += 3 {
					if raw[i+1] > 80 && int(raw[i+1]) > int(raw[i])+40 && int(raw[i+1]) > int(raw[i+2])+40 {
						green++
					}
				}
				if graphicOnTop && green != 0 || !graphicOnTop && green < 200 {
					t.Fatalf("mixed z order differs from timeline: green%d graphicTop%v", green, graphicOnTop)
				}
				if !graphicOnTop {
					blueWidth := func(pixels []byte) int {
						left, right := 320, -1
						for y := 0; y < 192; y++ {
							for x := 0; x < 320; x++ {
								i := (y*320 + x) * 3
								if pixels[i+2] > 100 && int(pixels[i+2]) > int(pixels[i])+70 && int(pixels[i+2]) > int(pixels[i+1])+70 {
									left = min(left, x)
									right = max(right, x)
								}
							}
						}
						return max(0, right-left+1)
					}
					full := blueWidth(raw)
					if full < 20 {
						t.Fatal("caption highlight not rendered")
					}
					early := run("-v", "error", "-i", target, "-vf", `select=eq(n\,2)`, "-frames:v", "1", "-pix_fmt", "rgb24", "-f", "rawvideo", "-")
					if len(early) != len(raw) {
						t.Fatal("early frame missing")
					}
					want := float64(full) * 2 / float64(fps) / .18
					if math.Abs(float64(blueWidth(early))-want) > 4 {
						t.Fatalf("caption clock at frame2/%dfps: width%d expected%.2f full%d", fps, blueWidth(early), want, full)
					}
				}
			})
		}
	}
}
