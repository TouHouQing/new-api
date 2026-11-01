package app

import (
	"context"
	"encoding/binary"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
	"yingce/backend/internal/production"
)

func TestNativeVideoReworkWholeSourceActualFrameClockAudioSpliceAndUnbakedFades(t *testing.T) {
	if os.Getenv("CANVAS_TEST_REAL_FFMPEG") != "1" {
		t.Skip("actual FFmpeg required")
	}
	ffmpeg, err := renderFfmpegBinary()
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	dir := t.TempDir()
	original, candidate := filepath.Join(dir, "original.mp4"), filepath.Join(dir, "candidate.mp4")
	run := func(args ...string) []byte {
		t.Helper()
		data, err := exec.CommandContext(ctx, ffmpeg, args...).CombinedOutput()
		if err != nil {
			t.Fatalf("FFmpeg: %v %s", err, data)
		}
		return data
	}
	for _, f := range []struct{ file, color, hz string }{{original, "red", "600"}, {candidate, "blue", "1100"}} {
		run("-v", "error", "-y", "-f", "lavfi", "-i", "color=c="+f.color+":s=64x64:r=25:d=2", "-f", "lavfi", "-i", "sine=frequency="+f.hz+":sample_rate=48000:duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", f.file)
	}
	plan := production.VideoReworkPlan{Version: 2, Source: production.VideoReworkMedia{Width: 64, Height: 64, DurationMs: 2000}, Candidate: production.VideoReworkMedia{Width: 64, Height: 64, DurationMs: 2000}, Request: production.VideoReworkRequest{SourceStartMs: 500, SourceEndMs: 1500, CandidateStartMs: 250, Region: &production.VideoReworkRegion{X: 17, Y: 15, Width: 31, Height: 33}}, PlaybackRate: 1, OriginalFade: &production.VideoReworkFade{DurationMs: 2000, FadeInMs: 1000, FadeOutMs: 1000}}
	for _, mode := range []string{"original", "candidate", "mute"} {
		t.Run(mode, func(t *testing.T) {
			output := filepath.Join(dir, "repaired-"+mode+".mp4")
			plan.Request.Audio = mode
			args, err := buildVideoReworkFFmpegArgs(plan, original, candidate, output, 24, true, true)
			if err != nil {
				t.Fatal(err)
			}
			run(args...)
			file, err := os.Open(output)
			if err != nil {
				t.Fatal(err)
			}
			w, h, ms, err := inspectProductionImportMedia(ctx, file, "video/mp4")
			file.Close()
			if err != nil || w != 64 || h != 64 || ms != 2000 {
				t.Fatalf("source clock/dimensions changed: %d %d %d %v", w, h, ms, err)
			}
			frames := run("-v", "error", "-i", output, "-an", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1")
			if len(frames) != 50*64*64*3 {
				t.Fatal("25fps source frames were dropped/duplicated")
			}
			for index := 0; index < 50; index++ {
				frame := frames[index*64*64*3 : (index+1)*64*64*3]
				inside := frame[(32*64+32)*3:]
				outside := frame[(2*64+2)*3:]
				wantBlue := index >= 13 && index <= 37
				if outside[0] < 220 || outside[2] > 30 || wantBlue && (inside[2] < 220 || inside[0] > 30) || !wantBlue && (inside[0] < 220 || inside[2] > 30) {
					t.Fatalf("frame %d changed outside range/ROI or baked fade: %v %v", index, outside[:3], inside[:3])
				}
			}
			pcm := run("-v", "error", "-i", output, "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "pipe:1")
			energy := func(from, to int, hz float64) float64 {
				var x, y float64
				for i := from; i < to; i++ {
					value := float64(math.Float32frombits(binary.LittleEndian.Uint32(pcm[i*4:])))
					angle := 2 * math.Pi * hz * float64(i) / 16000
					x += value * math.Sin(angle)
					y += value * math.Cos(angle)
				}
				return math.Hypot(x, y)
			}
			if len(pcm) < 32000*4 {
				t.Fatal("full original audio clock truncated")
			}
			for _, span := range [][2]int{{1600, 6400}, {25600, 30400}} {
				if energy(span[0], span[1], 600) < 20*energy(span[0], span[1], 1100) {
					t.Fatal("outside interval audio changed")
				}
			}
			a, b := energy(10400, 21600, 600), energy(10400, 21600, 1100)
			if mode == "original" && a < 20*b || mode == "candidate" && b < 20*a || mode == "mute" && (a > .001 || b > .001) {
				t.Fatalf("wrong selected sound: %s %f %f", mode, a, b)
			}
		})
	}
}
