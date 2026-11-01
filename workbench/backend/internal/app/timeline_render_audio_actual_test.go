package app

import (
	"context"
	"encoding/binary"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

func TestRenderActualSeparatedWavTracksCoverFractionalVideoCut(t *testing.T) {
	if os.Getenv("CANVAS_TEST_REAL_FFMPEG") != "1" {
		t.Skip("set CANVAS_TEST_REAL_FFMPEG=1 for decoded media verification")
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
		output, err := exec.CommandContext(ctx, ffmpeg, args...).CombinedOutput()
		if err != nil {
			t.Fatalf("ffmpeg failed: %v %s", err, output)
		}
		return output
	}
	video := filepath.Join(directory, "silent-24fps.mp4")
	run("-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=24:d=2.042", "-frames:v", "49", "-c:v", "libx264", "-pix_fmt", "yuv420p", video)
	plan := renderPlan{Output: timelineRenderFormat{Width: 320, Height: 180, FPS: 24, Fit: "letterbox"}, Segments: []renderSegment{
		{Kind: "video", DurationMs: 2042, Clip: renderClip{Kind: "video", DurationMs: 2042, Volume: 0, PlaybackRate: 1}, Source: &renderSource{Path: video}},
		{Kind: "video", DurationMs: 1557, Clip: renderClip{Kind: "video", StartMs: 2042, DurationMs: 1557, Volume: 0, PlaybackRate: 1}, Source: &renderSource{Path: video}},
	}}
	for i, hz := range []int{440, 660} {
		audio := filepath.Join(directory, fmt.Sprintf("stem-%d.wav", i))
		run("-v", "error", "-y", "-f", "lavfi", "-i", fmt.Sprintf("sine=frequency=%d:sample_rate=44100:duration=3.598503401", hz), "-ac", "2", "-c:a", "pcm_s16le", audio)
		plan.Audio = append(plan.Audio, renderSegment{Kind: "audio", DurationMs: 3599, Clip: renderClip{Kind: "audio", DurationMs: 3599, Volume: 1, PlaybackRate: 1}, Source: &renderSource{Path: audio}})
	}
	base, target := filepath.Join(directory, "base.mp4"), filepath.Join(directory, "final.mp4")
	run(buildRenderFFmpegArgs(plan, base)...)
	if err := validateRenderedAudio(ctx, base, 3599); err != nil {
		t.Fatal("base audio", err)
	}
	args, err := buildRenderFinishArgs(plan, directory, base, target)
	if err != nil {
		t.Fatal(err)
	}
	run(args...)
	probe, err := renderFFprobeBinary()
	if err != nil {
		t.Fatal(err)
	}
	summary, _ := exec.CommandContext(ctx, probe, "-v", "error", "-show_entries", "stream=codec_type,start_time,duration", "-of", "json", target).Output()
	if err := validateRenderedAudio(ctx, target, 3599); err != nil {
		t.Fatalf("finished audio: %v; streams=%s", err, summary)
	}
	pcm := exec.CommandContext(ctx, ffmpeg, "-v", "error", "-i", target, "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "-")
	decoded, err := pcm.Output()
	if err != nil {
		t.Fatal(err)
	}
	if len(decoded) < 4*57120 {
		t.Fatalf("independent stems ended early: %.3fs", float64(len(decoded))/64000)
	}
	// Check both real tones near the end, so padding silence cannot hide lost
	// samples and keeping only one of the two stems cannot pass.
	for _, hz := range []float64{440, 660} {
		var real, imaginary float64
		for i := 56160; i < 57120; i++ {
			value := float64(math.Float32frombits(binary.LittleEndian.Uint32(decoded[i*4:])))
			window := .5 - .5*math.Cos(2*math.Pi*float64(i-56160)/959)
			angle := 2 * math.Pi * hz * float64(i) / 16000
			real += value * window * math.Cos(angle)
			imaginary += value * window * math.Sin(angle)
		}
		if math.Hypot(real, imaginary) < 12 {
			t.Fatalf("independent %.0fHz stem is missing from the final 80ms", hz)
		}
	}
}

func TestRenderActualRetimedVoicesSurviveCaptionFinishingToLastFrame(t *testing.T) {
	if os.Getenv("CANVAS_TEST_REAL_FFMPEG") != "1" {
		t.Skip("set CANVAS_TEST_REAL_FFMPEG=1 for decoded media verification")
	}
	ffmpeg, err := renderFfmpegBinary()
	if err != nil {
		t.Fatal(err)
	}
	directory := t.TempDir()
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Second)
	defer cancel()
	run := func(args ...string) []byte {
		t.Helper()
		command := exec.CommandContext(ctx, ffmpeg, args...)
		command.Dir = directory
		output, err := command.Output()
		if err != nil {
			if exit, ok := err.(*exec.ExitError); ok {
				t.Fatalf("ffmpeg: %v %s", err, exit.Stderr)
			}
			t.Fatal(err)
		}
		return output
	}
	first, second, music, voice := filepath.Join(directory, "first.mp4"), filepath.Join(directory, "second.mp4"), filepath.Join(directory, "music.wav"), filepath.Join(directory, "voice.wav")
	for _, item := range []struct{ path, color, tone string }{{first, "red", "440"}, {second, "blue", "660"}} {
		run("-v", "error", "-y", "-f", "lavfi", "-i", "color=c="+item.color+":s=160x96:r=10:d=6", "-f", "lavfi", "-i", "sine=frequency="+item.tone+":sample_rate=48000:duration=6", "-c:v", "libx264", "-c:a", "aac", item.path)
	}
	run("-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=48000:duration=6", music)
	run("-v", "error", "-y", "-f", "lavfi", "-i", "aevalsrc=0.125*sin(2*PI*if(lt(t\\,2)\\,880\\,1100)*t):s=48000:d=6", voice)
	plan := renderPlan{Segments: []renderSegment{
		{Kind: "video", DurationMs: 1000, Clip: renderClip{Kind: "video", DurationMs: 1000, SourceStartMs: 500, PlaybackRate: 2, Volume: 0}, Source: &renderSource{Path: first, HasAudio: true}},
		{Kind: "video", DurationMs: 4000, Clip: renderClip{Kind: "video", StartMs: 1000, DurationMs: 4000, SourceStartMs: 1000, PlaybackRate: .5, Volume: 0}, Source: &renderSource{Path: second, HasAudio: true}},
	}, TextClips: []renderClip{{ID: "caption", Kind: "subtitle", StartMs: 0, DurationMs: 800, Text: "完整成片：声音保留到最后一帧"}}}
	for _, item := range []struct {
		path                    string
		start, source, duration int64
		rate, volume            float64
	}{{voice, 250, 100, 1000, 1, .4}, {music, 0, 0, 5000, 1, .1}, {voice, 3000, 0, 2000, 1, .2}, {voice, 0, 0, 1000, 2, .25}, {voice, 1000, 500, 4000, .5, .25}} {
		plan.Audio = append(plan.Audio, renderSegment{Kind: "audio", DurationMs: item.duration, Clip: renderClip{Kind: "audio", StartMs: item.start, SourceStartMs: item.source, DurationMs: item.duration, PlaybackRate: item.rate, Volume: item.volume}, Source: &renderSource{Path: item.path}})
	}
	for _, aspect := range []string{"16:9", "9:16"} {
		t.Run(aspect, func(t *testing.T) {
			plan.Output, err = timelineOutputFormat(aspect)
			if err != nil {
				t.Fatal(err)
			}
			base, target := filepath.Join(directory, "base.mp4"), filepath.Join(directory, "final.mp4")
			run(buildRenderFFmpegArgs(plan, base)...)
			if err := validateRenderedAudio(ctx, base, 5000); err != nil {
				t.Fatal("base audio", err)
			}
			args, err := buildRenderFinishArgs(plan, directory, base, target)
			if err != nil {
				t.Fatal(err)
			}
			run(args...)
			if err := validateRenderedAudio(ctx, target, 5000); err != nil {
				t.Fatal("finished audio", err)
			}
			pcm := run("-v", "error", "-i", target, "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "-")
			if len(pcm) < 4*79680 {
				t.Fatalf("decoded audio ended early: %.3fs", float64(len(pcm))/64000)
			}
			// Check actual last-quarter-second tones, not just MP4 metadata or
			// padded silence. Muted source video tones must remain absent.
			magnitude := func(hz float64) float64 {
				var real, imaginary float64
				for i := 76000; i < 79200; i++ {
					value := float64(math.Float32frombits(binary.LittleEndian.Uint32(pcm[i*4:])))
					window := .5 - .5*math.Cos(2*math.Pi*float64(i-76000)/3199)
					angle := 2 * math.Pi * hz * float64(i) / 16000
					real += value * window * math.Cos(angle)
					imaginary += value * window * math.Sin(angle)
				}
				return math.Hypot(real, imaginary)
			}
			background := magnitude(220)
			if background < 1 || magnitude(880)/background < 1.5 || magnitude(1100)/background < 1.8 || magnitude(440)/background > .1 || magnitude(660)/background > .1 {
				t.Fatal("late independent voices/music are missing, or muted video audio leaked")
			}
		})
	}
	short := filepath.Join(directory, "short-audio.mp4")
	run("-v", "error", "-y", "-f", "lavfi", "-i", "color=s=160x96:r=10:d=5", "-f", "lavfi", "-i", "sine=frequency=880:duration=4", "-c:v", "libx264", "-c:a", "aac", short)
	if err := validateRenderedAudio(ctx, short, 5000); err == nil {
		t.Fatal("short audio was accepted because the video container was five seconds long")
	}
}
