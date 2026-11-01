package app

import (
	"context"
	"encoding/binary"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"yingce/backend/internal/model"
)

func TestRenderOverlappingTracksKeepProgramTimeAndSourceTrim(t *testing.T) {
	back := renderClipFixture("background", "video", "back", 0, 4000, "resource:back")
	back.SourceStartMs = 500
	front := renderClipFixture("foreground", "image", "front", 1000, 1000, "resource:front")
	plan := buildRenderPlan(renderProject{Version: 2, Tracks: []renderTrack{{ID: "back", Kind: "video", Order: 1}, {ID: "front", Kind: "image", Order: 0}}, Clips: []renderClip{back, front}})
	if planDurationMs(plan) != 4000 || len(plan.Segments) != 3 || plan.Segments[1].Clip.ID != "foreground" || plan.Segments[2].Clip.SourceStartMs != 2500 {
		t.Fatalf("stacked clips were concatenated or lost their source trim: %+v", plan)
	}
}

func TestRenderPreflightRejectsMissingForeignAndWrongProjectMedia(t *testing.T) {
	svc, db := newTimelineTaskTestService(t)
	if err := db.Create(&model.Project{ID: "foreign-project", UserID: "another", Status: model.ProjectStatusActive}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.Resource{ID: "foreign", UserID: "another", Kind: "video", Status: model.ResourceStatusReady}).Error; err != nil {
		t.Fatal(err)
	}
	for _, request := range []TimelineRenderCreateRequest{
		{Timeline: renderTestProject("resource:missing")},
		{Timeline: renderTestProject("resource:foreign")},
		{ProjectID: "foreign-project", Timeline: renderTestProject("resource:foreign")},
	} {
		if _, err := svc.CreateTimelineRenderTask("owner", request); err == nil {
			t.Fatal("invalid render was queued")
		}
	}
	var count int64
	if err := db.Model(&model.Task{}).Count(&count).Error; err != nil || count != 0 {
		t.Fatalf("invalid task persisted: %d %v", count, err)
	}
}

func TestRenderCaptionsDoNotOverwriteEachOther(t *testing.T) {
	placements, err := renderCaptionPlacements([]renderClip{{ID: "manual", Kind: "subtitle", StartMs: 500, DurationMs: 2000, Text: "人工字幕"}, {ID: "asr", Kind: "subtitle", StartMs: 0, DurationMs: 2000, Text: "识别字幕"}, {ID: "later", Kind: "subtitle", StartMs: 4000, DurationMs: 1000, Text: "下一句"}})
	if err != nil || placements["asr"].offset != 64 || placements["manual"].offset != 132 || placements["later"].offset != 64 {
		t.Fatalf("overlapping captions: %+v %v", placements, err)
	}
	if _, _, err := wrapRenderCaption(strings.Repeat("字", 200)); err == nil {
		t.Fatal("caption overflow was not rejected")
	}
}

func TestRenderFinishingUsesActualAudioTimingAndChineseCaption(t *testing.T) {
	if os.Getenv("CANVAS_TEST_REAL_FFMPEG") != "1" {
		t.Skip("set CANVAS_TEST_REAL_FFMPEG=1")
	}
	ffmpeg, err := renderFfmpegBinary()
	if err != nil {
		t.Fatal(err)
	}
	directory := t.TempDir()
	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Second)
	defer cancel()
	run := func(args ...string) []byte {
		t.Helper()
		command := exec.CommandContext(ctx, ffmpeg, args...)
		command.Dir = directory
		output, err := command.CombinedOutput()
		if err != nil {
			t.Fatalf("ffmpeg: %v\n%s", err, output)
		}
		return output
	}
	base, audio, target := filepath.Join(directory, "base.mp4"), filepath.Join(directory, "tone.wav"), filepath.Join(directory, "finished.mp4")
	run("-v", "error", "-y", "-f", "lavfi", "-i", "color=c=orange:s=1920x1080:r=30", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", "2", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", base)
	run("-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=2", audio)
	plan := renderPlan{Segments: []renderSegment{{Kind: "gap", DurationMs: 2000}}, Audio: []renderSegment{{Kind: "audio", DurationMs: 1000, Clip: renderClip{StartMs: 250, SourceStartMs: 500, DurationMs: 1000, Volume: 0.6, FadeInMs: 100, FadeOutMs: 100}, Source: &renderSource{Path: audio}}}, TextClips: []renderClip{{Kind: "subtitle", StartMs: 500, DurationMs: 1000, Text: "晨光里的橘猫：100% 自然光"}}}
	args, err := buildRenderFinishArgs(plan, directory, base, target)
	if err != nil {
		t.Fatal(err)
	}
	run(args...)
	// Decode actual samples: silence before/after the occurrence, audible tone
	// only inside it. This catches missing delay, source trim and mix wiring.
	samples := run("-v", "error", "-i", target, "-vn", "-ac", "1", "-ar", "8000", "-f", "f32le", "pipe:1")
	rms := func(start, end float64) float64 {
		var sum float64
		count := 0
		for index := int(start * 8000); index < int(end*8000) && index*4+4 <= len(samples); index++ {
			value := float64(math.Float32frombits(binary.LittleEndian.Uint32(samples[index*4:])))
			sum += value * value
			count++
		}
		if count == 0 {
			t.Fatal("no decoded audio samples")
		}
		return math.Sqrt(sum / float64(count))
	}
	if rms(0.02, 0.2) > 0.001 || rms(0.5, 1) < 0.02 || rms(1.5, 1.9) > 0.001 {
		t.Fatal("independent audio timing or gain is incorrect")
	}
	frame := run("-v", "error", "-ss", "0.8", "-i", target, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1")
	dark := 0
	for y := 950; y < 1040; y++ {
		for x := 400; x < 1520; x++ {
			offset := (y*1920 + x) * 3
			if offset+2 < len(frame) && frame[offset] < 100 && frame[offset+1] < 100 {
				dark++
			}
		}
	}
	if dark < 2000 {
		t.Fatal("caption was not burned into the actual frame")
	}
	if strings.Contains(strings.Join(args, " "), plan.TextClips[0].Text) {
		t.Fatal("caption text entered a filter expression instead of a raster")
	}
}
