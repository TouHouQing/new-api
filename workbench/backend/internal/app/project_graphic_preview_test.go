package app

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"image/png"
	"strings"
	"testing"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
)

func TestProjectGraphicPreviewUsesOwnedPixelsAndRejectsMixedOrForeignInputs(t *testing.T) {
	s, db := legacyImportService(t)
	project := model.Project{ID: "graphic-project", UserID: "owner", Status: model.ProjectStatusActive}
	if err := db.Create(&project).Error; err != nil {
		t.Fatal(err)
	}
	_, picture := legacyImportArchive(t)
	own, err := s.UploadResourceFile("owner", "logo.png", int64(len(picture)), "image", 0, 0, 0, bytes.NewReader(picture))
	if err != nil {
		t.Fatal(err)
	}
	other, err := s.UploadResourceFile("other", "other.png", int64(len(picture)), "image", 0, 0, 0, bytes.NewReader(picture))
	if err != nil {
		t.Fatal(err)
	}
	graphic := &production.MotionGraphic{Version: 1, Kind: "image", ResourceID: own.ID, X: .5, Y: .5, Size: 64, Color: "#ffffff", Animation: "none", BPM: 120, PhaseDurationMs: 1000}
	clip := renderClip{ID: "logo", Kind: "text", Text: "Logo", DurationMs: 1000, Graphic: graphic}
	raw, _ := json.Marshal(clip)
	request := GraphicPreviewRequest{Output: &timelineRenderFormat{Width: 320, Height: 192, FPS: 24}, Clips: []json.RawMessage{raw}}
	result, err := s.PreviewProjectGraphics(context.Background(), "owner", project.ID, request)
	if err != nil || len(result.Layers) != 1 {
		t.Fatal(result, err)
	}
	layer := result.Layers[0]
	encoded, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(layer.Image, "data:image/png;base64,"))
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := png.Decode(bytes.NewReader(encoded))
	if err != nil || decoded.Bounds().Dx() != 64 || decoded.Bounds().Dy() != 64 || layer.ClipID != "logo" {
		t.Fatal("native pixels or identity missing", err)
	}
	if _, err := s.PreviewProjectGraphics(context.Background(), "other", project.ID, request); err == nil {
		t.Fatal("foreign project preview allowed")
	}
	graphic.ResourceID = other.ID
	raw, _ = json.Marshal(clip)
	request.Clips = []json.RawMessage{raw}
	if _, err := s.PreviewProjectGraphics(context.Background(), "owner", project.ID, request); err == nil {
		t.Fatal("foreign image pixels exposed")
	}
	graphic.ResourceID = own.ID
	raw, _ = json.Marshal(clip)
	var fields map[string]any
	_ = json.Unmarshal(raw, &fields)
	fields["captionPresentation"] = map[string]any{}
	raw, _ = json.Marshal(fields)
	request.Clips = []json.RawMessage{raw}
	if _, err := s.PreviewProjectGraphics(context.Background(), "owner", project.ID, request); err == nil {
		t.Fatal("unsavable mixed caption preview accepted")
	}
	delete(fields, "captionPresentation")
	fields["text"] = ""
	fields["graphic"].(map[string]any)["kind"] = "text"
	delete(fields["graphic"].(map[string]any), "resourceId")
	raw, _ = json.Marshal(fields)
	request.Clips = []json.RawMessage{raw}
	if _, err := s.PreviewProjectGraphics(context.Background(), "owner", project.ID, request); err == nil {
		t.Fatal("empty title preview accepted")
	}
	var count int64
	if err := db.Model(&model.Task{}).Count(&count).Error; err != nil || count != 0 {
		t.Fatal("preview created a task", count, err)
	}
}
