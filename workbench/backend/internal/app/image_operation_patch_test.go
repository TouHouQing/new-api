package app

import (
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"testing"
	"yingce/backend/internal/assets"
	"yingce/backend/internal/imageops"
	"yingce/backend/internal/model"
)

func TestImageOperationBackgroundPatchNativeFilesVersionsAndSourceRetention(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	seedImageOperationSource(t, s, db)
	if err := db.Model(&model.User{}).Where("id = ?", "image-user").Update("status", model.UserStatusActive).Error; err != nil {
		t.Fatal(err)
	}
	resources := []*model.Resource{}
	pictures := []*image.NRGBA64{}
	for i := 0; i < 2; i++ {
		picture := image.NewNRGBA64(image.Rect(0, 0, 12, 8))
		for y := 0; y < 8; y++ {
			for x := 0; x < 12; x++ {
				picture.SetNRGBA64(x, y, color.NRGBA64{R: uint16(1000 + i*30000 + x*19), G: uint16(23456 + i*10000 + y*23), B: 45678, A: 65535})
			}
		}
		var encoded bytes.Buffer
		if err := png.Encode(&encoded, picture); err != nil {
			t.Fatal(err)
		}
		resource, _, err := s.storeResource("image-user", "image", "patch-source.png", "image/png", int64(encoded.Len()), 12, 8, 0, bytes.NewReader(encoded.Bytes()), nil, false)
		if err != nil {
			t.Fatal(err)
		}
		resources = append(resources, resource)
		pictures = append(pictures, picture)
	}
	probe, err := s.InspectImageAlphaBounds(context.Background(), "image-user", resources[1].ID)
	if err != nil {
		t.Fatal(err)
	}
	req := ImageOperationCreateRequest{RequestID: "native-background-patch-0001", ResourceID: resources[0].ID, Recipe: imageops.Recipe{Operation: "background-patch", Patch: &imageops.BackgroundPatch{Width: 12, Height: 8, GeneratedResourceID: resources[1].ID, GeneratedSHA256: probe.Source.SHA256, Regions: []imageops.Region{{Width: 12, Height: 8, BBox: []float64{0, 0, 500, 1000}, Shape: "rect"}}}}}
	task, err := s.CreateImageOperationTask("image-user", req)
	if err != nil {
		t.Fatal(err)
	}
	completed := runImageOperationTask(t, s, task.ID)
	if completed.Status != model.TaskStatusSucceeded {
		t.Fatal(completed.Error)
	}
	var result struct {
		Images []imageOperationStoredOutput `json:"images"`
	}
	if err := json.Unmarshal([]byte(completed.ResultJSON), &result); err != nil || len(result.Images) != 1 {
		t.Fatal(err)
	}
	data, err := s.readImageOperationSource("image-user", result.Images[0].ResourceID)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	for y := 0; y < 8; y++ {
		for x := 0; x < 12; x++ {
			which := 0
			if x < 6 {
				which = 1
			}
			got := color.NRGBA64Model.Convert(decoded.At(x, y)).(color.NRGBA64)
			if got != pictures[which].NRGBA64At(x, y) {
				t.Fatal("native patch changed pixel contract", x, y, got)
			}
		}
	}
	version, err := s.repo.AssetVersion(result.Images[0].AssetVersionID)
	if err != nil {
		t.Fatal(err)
	}
	var derivation imageOperationDerivation
	if json.Unmarshal([]byte(version.DefinitionJSON), &derivation) != nil || derivation.PatchSource == nil || derivation.PatchSource.Source != probe.Source || derivation.SourceResourceID != resources[0].ID {
		t.Fatal("native version lost second immutable input")
	}
	refs, err := assets.CollectDocumentResourceReferences(version.DefinitionJSON)
	if err != nil {
		t.Fatal(err)
	}
	ids := map[string]bool{}
	for _, ref := range refs {
		ids[ref.ResourceID] = true
	}
	if !ids[resources[0].ID] || !ids[resources[1].ID] {
		t.Fatal("derived version does not retain both source files")
	}
	again, err := s.CreateImageOperationTask("image-user", req)
	if err != nil || again.ID != task.ID {
		t.Fatal("replay duplicated patch", err)
	}
	if _, err := s.CreateImageOperationTask("image-user", ImageOperationCreateRequest{RequestID: "native-normalize-no-work-0001", ResourceID: resources[0].ID, Recipe: imageops.Recipe{Operation: "normalize", Normalize: &imageops.Normalize{Width: 12, Height: 8, Algorithm: "high"}}}); err == nil {
		t.Fatal("same-size normalization duplicated source")
	}
	resized, err := s.CreateImageOperationTask("image-user", ImageOperationCreateRequest{RequestID: "native-normalize-exact-0001", ResourceID: resources[1].ID, Recipe: imageops.Recipe{Operation: "normalize", Normalize: &imageops.Normalize{Width: 24, Height: 16, Algorithm: "high"}}})
	if err != nil {
		t.Fatal(err)
	}
	finished := runImageOperationTask(t, s, resized.ID)
	if finished.Status != model.TaskStatusSucceeded {
		t.Fatal(finished.Error)
	}
	if err := json.Unmarshal([]byte(finished.ResultJSON), &result); err != nil || len(result.Images) != 1 || result.Images[0].Width != 24 || result.Images[0].Height != 16 {
		t.Fatal("exact-size normalization not stored", err)
	}
}
