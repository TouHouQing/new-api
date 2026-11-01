package app

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"yingce/backend/internal/production"
)

func TestReframeActualRotatedPhoneVideoUsesDisplayedDimensions(t *testing.T) {
	if os.Getenv("CANVAS_TEST_REAL_FFMPEG") != "1" {
		t.Skip("explicit actual FFmpeg acceptance required")
	}
	directory := t.TempDir()
	original := filepath.Join(directory, "encoded-landscape.mp4")
	rotated := filepath.Join(directory, "phone-rotated.mp4")
	for _, args := range [][]string{
		{"-v", "error", "-y", "-f", "lavfi", "-i", "color=red:s=320x180:r=8:d=1,drawbox=x=160:y=0:w=160:h=180:c=blue:t=fill", "-c:v", "libx264", "-pix_fmt", "yuv420p", original},
		{"-v", "error", "-y", "-display_rotation:v:0", "90", "-i", original, "-c", "copy", rotated},
	} {
		if output, err := exec.Command("ffmpeg", args...).CombinedOutput(); err != nil {
			t.Fatalf("actual phone rotation fixture: %v %s", err, output)
		}
	}
	metadata, err := exec.Command("ffprobe", "-v", "error", "-show_entries", "stream_side_data=rotation", "-of", "json", rotated).Output()
	if err != nil {
		t.Fatal(err)
	}
	var proof struct {
		Streams []struct {
			SideData []struct {
				Rotation int `json:"rotation"`
			} `json:"side_data_list"`
		} `json:"streams"`
	}
	if json.Unmarshal(metadata, &proof) != nil || len(proof.Streams) == 0 || len(proof.Streams[0].SideData) == 0 || proof.Streams[0].SideData[0].Rotation != 90 {
		t.Fatal("fixture has no actual90-degree display rotation")
	}
	file, err := os.Open(rotated)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	width, height, duration, err := inspectProductionImportMedia(context.Background(), file, "video/mp4")
	if err != nil || width != 180 || height != 320 || duration != 1000 {
		t.Fatalf("phone displayed dimensions must follow FFmpeg/browser autorotation: %dx%d %d %v", width, height, duration, err)
	}
	inputBytes, err := os.ReadFile(rotated)
	if err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(inputBytes)
	reframe := &production.TimelineReframe{AnalysisID: "phone-analysis", RevisionID: "phone-version", ResourceID: "phone-original", SourceSHA256: hex.EncodeToString(digest[:]), SourceWidth: width, SourceHeight: height, Width: 1, Height: 1, StartMs: 0, EndMs: 1000, Keys: []production.ReframeKey{{TimeMs: 0}, {TimeMs: 875}}}
	clip := renderClip{Kind: "video", DurationMs: 1000, Volume: 1, Reframe: reframe}
	target := filepath.Join(directory, "actual-phone-portrait.mp4")
	plan := renderPlan{Output: timelineRenderFormat{Width: 90, Height: 160, FPS: 24}, Segments: []renderSegment{{Kind: "video", DurationMs: 1000, Clip: clip, Source: &renderSource{Path: rotated}}}}
	if output, err := exec.Command("ffmpeg", buildRenderFFmpegArgs(plan, target)...).CombinedOutput(); err != nil {
		t.Fatalf("actual rotated reframe export: %v %s", err, output)
	}
	decode := func(path string) []byte {
		t.Helper()
		output, err := exec.Command("ffmpeg", "-v", "error", "-ss", "0.5", "-i", path, "-frames:v", "1", "-vf", "scale=90:160", "-pix_fmt", "rgb24", "-f", "rawvideo", "-").Output()
		if err != nil {
			t.Fatal(err)
		}
		return output
	}
	a, b := decode(rotated), decode(target)
	if len(a) != 90*160*3 || len(b) != len(a) {
		t.Fatal("rotated export has no complete frame")
	}
	var difference int64
	for i := range a {
		difference += int64(math.Abs(float64(int(a[i]) - int(b[i]))))
	}
	if float64(difference)/float64(len(a)) > 5 {
		t.Fatal("export changed phone display orientation")
	}
	s, db := newMediaRecoveryTestService(t)
	seedAnalysisAudio(t, s, db)
	resource, _, err := s.storeResource("analysis-user", "video", "rotated-phone.mp4", "video/mp4", int64(len(inputBytes)), 320, 180, 0, bytes.NewReader(inputBytes), nil, false)
	if err != nil {
		t.Fatal(err)
	}
	oldSource := production.MediaAnalysisSource{ResourceID: resource.ID, ETag: resource.ETag, SHA256: hex.EncodeToString(digest[:]), Bytes: resource.Size, Width: 320, Height: 180}
	if err := s.verifyReframeSourceGeometry("analysis-user", oldSource); err == nil {
		t.Fatal("adopted an old rotated analysis with encoded geometry")
	}
	oldSource.Width, oldSource.Height = 180, 320
	if err := s.verifyReframeSourceGeometry("analysis-user", oldSource); err != nil {
		t.Fatal("rejected previously verified display geometry", err)
	}
	unchanged, err := os.ReadFile(rotated)
	if err != nil || !bytes.Equal(unchanged, inputBytes) {
		t.Fatal("rotation source changed")
	}
}

func TestDisplayedProductionVideoDimensionsValidateOrthogonalMetadata(t *testing.T) {
	for _, angle := range []float64{0, 90, -90, 180, 270, 450, -450} {
		width, height, err := displayedProductionVideoDimensions(320, 180, angle)
		if err != nil {
			t.Fatal(err)
		}
		if math.Mod(math.Abs(angle/90), 2) == 1 {
			if width != 180 || height != 320 {
				t.Fatal("quarter rotation not swapped")
			}
		} else if width != 320 || height != 180 {
			t.Fatal("half rotation swapped")
		}
	}
	for _, angle := range []float64{45, 89, math.NaN(), math.Inf(1), 1e12} {
		if _, _, err := displayedProductionVideoDimensions(320, 180, angle); err == nil {
			t.Fatal("unverified transform accepted", angle)
		}
	}
	if _, _, err := displayedProductionVideoDimensions(65536, 65536, 0); err == nil {
		t.Fatal("unbounded video frame accepted")
	}
}
