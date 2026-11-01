package app

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

func TestTimelineFixedOutputFitActualDecodedPixelsAndFrameRate(t *testing.T) {
	if os.Getenv("CANVAS_TEST_REAL_FFMPEG") != "1" {
		t.Skip("actual ffmpeg verification is explicitly enabled")
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
	run := func(args ...string) []byte {
		t.Helper()
		data, err := exec.CommandContext(ctx, ffmpeg, args...).Output()
		if err != nil {
			if exit, ok := err.(*exec.ExitError); ok {
				t.Fatalf("ffmpeg: %v %s", err, exit.Stderr)
			}
			t.Fatal(err)
		}
		return data
	}
	directory := t.TempDir()
	source := filepath.Join(directory, "borders.mp4")
	run("-y", "-f", "lavfi", "-i", "color=c=blue:s=320x180:r=24:d=1,drawbox=x=0:y=0:w=64:h=ih:c=red:t=fill,drawbox=x=256:y=0:w=64:h=ih:c=green:t=fill", "-f", "lavfi", "-i", "sine=frequency=660:sample_rate=16000:duration=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", source)
	for _, fit := range []string{"letterbox", "crop", "blur"} {
		t.Run(fit, func(t *testing.T) {
			format := timelineRenderFormat{Width: 90, Height: 160, FPS: 24, Fit: fit}
			if err := validateTimelineOutput(format); err != nil {
				t.Fatal(err)
			}
			clip := renderClip{Kind: "video", DurationMs: 1000, Volume: 1}
			segment := renderSegment{Kind: "video", DurationMs: 1000, Clip: clip, Source: &renderSource{Path: source, HasAudio: true}}
			plan := renderPlan{Output: format, Segments: []renderSegment{segment, segment}}
			target := filepath.Join(directory, fit+".mp4")
			run(buildRenderFFmpegArgs(plan, target)...)
			meta, err := exec.CommandContext(ctx, probe, "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate,nb_frames", "-of", "json", target).Output()
			var parsed struct {
				Streams []struct {
					Width, Height int
					Rate          string `json:"r_frame_rate"`
					Frames        string `json:"nb_frames"`
				}
			}
			if err != nil || json.Unmarshal(meta, &parsed) != nil || len(parsed.Streams) != 1 || parsed.Streams[0].Width != 90 || parsed.Streams[0].Height != 160 || parsed.Streams[0].Rate != "24/1" || parsed.Streams[0].Frames != "48" {
				t.Fatal("actual pinned output differs", string(meta), err)
			}
			pixel := func(crop string) []byte {
				return run("-v", "error", "-ss", "1.5", "-i", target, "-frames:v", "1", "-vf", crop+",scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-")
			}
			top, edge := pixel("crop=2:2:44:8"), pixel("crop=2:2:4:80")
			if len(top) != 3 || len(edge) != 3 {
				t.Fatal("missing decoded pixels")
			}
			if fit == "letterbox" && (top[0] > 25 || top[1] > 25 || top[2] > 25) {
				t.Fatal("letterbox bar not black", top)
			}
			if fit != "letterbox" && (top[2] < 150 || top[0] > 60) {
				t.Fatal("frame was not filled", top)
			}
			if fit == "crop" && (edge[2] < 150 || edge[0] > 60) {
				t.Fatal("center crop is wrong", edge)
			}
			if fit != "crop" && (edge[0] < 150 || edge[2] > 60) {
				t.Fatal("foreground was cropped", edge)
			}
			assertDecodedPitch(t, run("-v", "error", "-ss", "1.8", "-i", target, "-t", "0.12", "-f", "s16le", "-ac", "1", "-ar", "16000", "-"), 660)
		})
	}
}
