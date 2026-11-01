package app

import (
	"context"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"yingce/backend/internal/model"
)

func TestTimelineTwoImagesRenderWithFiniteAudioAndExactDuration(t *testing.T) {
	if os.Getenv("CANVAS_TEST_REAL_FFMPEG") != "1" {
		t.Skip("set CANVAS_TEST_REAL_FFMPEG=1 for real encoding")
	}
	ffmpeg, err := renderFfmpegBinary()
	if err != nil {
		t.Fatal(err)
	}
	probe, err := exec.LookPath("ffprobe")
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	source := filepath.Join(dir, "image.png")
	file, err := os.Create(source)
	if err != nil {
		t.Fatal(err)
	}
	picture := image.NewRGBA(image.Rect(0, 0, 32, 32))
	for y := 0; y < 32; y++ {
		for x := 0; x < 32; x++ {
			picture.Set(x, y, color.RGBA{R: uint8(x * 8), G: uint8(y * 8), B: 128, A: 255})
		}
	}
	if err := png.Encode(file, picture); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	plan := renderPlan{Segments: []renderSegment{{Kind: "image", DurationMs: 500, Clip: renderClip{Volume: 1}, Source: &renderSource{Path: source}}, {Kind: "image", DurationMs: 750, Clip: renderClip{Volume: 0}, Source: &renderSource{Path: source}}}}
	target := filepath.Join(dir, "result.mp4")
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	output, err := exec.CommandContext(ctx, ffmpeg, buildRenderFFmpegArgs(plan, target)...).CombinedOutput()
	if err != nil {
		t.Fatalf("two-segment render did not finish: %v\n%s", err, output)
	}
	output, err = exec.CommandContext(ctx, probe, "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", target).Output()
	if err != nil {
		t.Fatal(err)
	}
	duration, err := strconv.ParseFloat(strings.TrimSpace(string(output)), 64)
	if err != nil || math.Abs(duration-1.25) > 0.1 {
		t.Fatalf("unexpected encoded duration: %s (%v)", output, err)
	}
	args := strings.Join(buildRenderFFmpegArgs(plan, target), " ")
	if !strings.Contains(args, "volume=0.000") {
		t.Fatal("explicit mute was lost")
	}
}

func TestTimelineClipVolumeDefaultDiffersFromExplicitMute(t *testing.T) {
	for _, test := range []struct {
		raw  string
		want float64
	}{{`{"id":"default"}`, 1}, {`{"id":"muted","volume":0}`, 0}} {
		var clip renderClip
		if err := json.Unmarshal([]byte(test.raw), &clip); err != nil || clip.Volume != test.want {
			t.Fatalf("volume=%v want=%v error=%v", clip.Volume, test.want, err)
		}
	}
}

func TestGeneratedVideoStoresActualContainerMetadataAndRejectsCorruption(t *testing.T) {
	if os.Getenv("CANVAS_TEST_REAL_FFMPEG") != "1" {
		t.Skip("set CANVAS_TEST_REAL_FFMPEG=1 for real encoding")
	}
	ffmpeg, err := renderFfmpegBinary()
	if err != nil {
		t.Fatal(err)
	}
	s, _ := legacyImportService(t)
	target := filepath.Join(t.TempDir(), "video.mp4")
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	if output, err := exec.CommandContext(ctx, ffmpeg, "-y", "-f", "lavfi", "-i", "color=c=orange:s=160x96:r=24", "-t", "0.5", "-c:v", "libx264", target).CombinedOutput(); err != nil {
		t.Fatalf("encode: %v %s", err, output)
	}
	resource, fallback, err := s.storeTaskMediaFile(&model.Task{ID: "real-video-test", UserID: "owner"}, 0, target, "video/mp4", "video", nil)
	if fallback != nil {
		t.Fatal(fallback)
	}
	if err != nil {
		t.Fatal(err)
	}
	if resource.Width != 160 || resource.Height != 96 || math.Abs(float64(resource.DurationMs)-500) > 60 {
		t.Fatalf("container metadata lost: %+v", resource)
	}
	broken := filepath.Join(t.TempDir(), "broken.mp4")
	if err := os.WriteFile(broken, []byte("not a video"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.storeTaskMediaFile(&model.Task{ID: "broken-video-test", UserID: "owner"}, 0, broken, "video/mp4", "video", nil); err == nil {
		t.Fatal("corrupt media was accepted as a generated video")
	}
}
