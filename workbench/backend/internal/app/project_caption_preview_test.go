package app

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"image/png"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func captionPreviewFiles(t *testing.T, root string) map[string]string {
	t.Helper()
	result := map[string]string{}
	if err := filepath.WalkDir(root, func(name string, item fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !item.IsDir() {
			data, err := os.ReadFile(name)
			if err != nil {
				return err
			}
			sum := sha256.Sum256(data)
			relative, _ := filepath.Rel(root, name)
			result[relative] = hex.EncodeToString(sum[:])
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	return result
}

func TestProjectCaptionPreviewUsesExportPixelsWithoutPersistentWrites(t *testing.T) {
	if os.Getenv("CANVAS_TEST_REAL_FFMPEG") != "1" {
		t.Skip("set CANVAS_TEST_REAL_FFMPEG=1 for installed-font raster verification")
	}
	for _, driver := range []string{"sqlite", "postgres"} {
		t.Run(driver, func(t *testing.T) {
			s, db, project, _, _, _ := canvasCutServiceFixture(t, driver)
			baseline, err := s.GetProjectTimeline("image-user", project.ID)
			if err != nil {
				t.Fatal(err)
			}
			counts := func() map[string]int64 {
				result := map[string]int64{}
				for _, name := range []string{"resources", "tasks", "project_cuts", "project_timelines", "assets"} {
					var n int64
					if err := db.Table(name).Count(&n).Error; err != nil {
						t.Fatal(err)
					}
					result[name] = n
				}
				return result
			}
			beforeCounts, beforeFiles := counts(), captionPreviewFiles(t, s.dataDir)
			req := CaptionPreviewRequest{AspectRatio: "16:9", Clips: []json.RawMessage{json.RawMessage(`{"id":"cue","kind":"subtitle","startMs":250,"durationMs":1250,"text":"旧画布的红色字幕","subtitleStyle":{"fontSize":22,"color":"#ff0000","position":"top"}}`)}}
			if _, err := s.PreviewProjectCaptions(context.Background(), "another-user", project.ID, req); err == nil {
				t.Fatal("foreign project preview allowed")
			}
			got, err := s.PreviewProjectCaptions(context.Background(), "image-user", project.ID, req)
			if err != nil {
				t.Fatal(err)
			}
			if got.Width != 1920 || got.Height != 1080 || len(got.Layers) != 1 || got.Layers[0].StartMs != 250 || got.Layers[0].EndMs != 1500 || got.Layers[0].Y < 50 || got.Layers[0].Y > 80 {
				t.Fatalf("preview geometry or source clock lost: %+v", got)
			}
			encoded := strings.TrimPrefix(got.Layers[0].Image, "data:image/png;base64,")
			raw, err := base64.StdEncoding.DecodeString(encoded)
			if err != nil {
				t.Fatal(err)
			}
			picture, err := png.Decode(bytes.NewReader(raw))
			if err != nil {
				t.Fatal(err)
			}
			red := 0
			for y := picture.Bounds().Min.Y; y < picture.Bounds().Max.Y; y++ {
				for x := picture.Bounds().Min.X; x < picture.Bounds().Max.X; x++ {
					r, g, b, a := picture.At(x, y).RGBA()
					if r > 50000 && g < 15000 && b < 15000 && a > 50000 {
						red++
					}
				}
			}
			if red < 100 {
				t.Fatal("preview did not contain real red glyph pixels")
			}
			for _, raw := range []string{`{"id":"bad","kind":"image","startMs":0,"durationMs":1000,"text":"伪造类型"}`, `{"id":"bad","kind":"text","startMs":9223372036854775807,"durationMs":1,"text":"溢出"}`, `{"id":"bad","kind":"text","startMs":0,"durationMs":1000,"text":"x","captionPresentation":{"version":1,"fontSize":9999}}`} {
				if _, err := s.PreviewProjectCaptions(context.Background(), "image-user", project.ID, CaptionPreviewRequest{AspectRatio: "16:9", Clips: []json.RawMessage{json.RawMessage(raw)}}); err == nil {
					t.Fatal("invalid preview accepted", raw)
				}
			}
			empty, err := s.PreviewProjectCaptions(context.Background(), "image-user", project.ID, CaptionPreviewRequest{AspectRatio: "9:16", Clips: []json.RawMessage{}})
			if err != nil || empty.Width != 1080 || empty.Height != 1920 || len(empty.Layers) != 0 {
				t.Fatal("empty portrait preview invalid", empty, err)
			}
			current, err := s.GetProjectTimeline("image-user", project.ID)
			if err != nil || !reflect.DeepEqual(current, baseline) {
				t.Fatal("preview changed working cut", err)
			}
			if !reflect.DeepEqual(beforeCounts, counts()) || !reflect.DeepEqual(beforeFiles, captionPreviewFiles(t, s.dataDir)) {
				t.Fatal("preview created persistent files, resources, tasks or cuts")
			}
		})
	}
}
