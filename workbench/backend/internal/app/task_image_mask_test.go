package app

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"image/color"
	"image/png"
	"io"
	"testing"

	"yingce/backend/internal/imageops"
	"yingce/backend/internal/model"
)

func TestImageMaskNativeQueueRetainsRecipeSourceAndDerivedVersion(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	resource, original := seedImageOperationSource(t, s, db)
	request := ImageOperationCreateRequest{RequestID: "mask-native-original-intent", ResourceID: resource.ID, Recipe: imageops.Recipe{Operation: "mask", Mask: &imageops.Mask{Width: 31, Height: 23, Mode: "keep", Strokes: []imageops.MaskStroke{{Diameter: 8, Points: [][]float64{{15.5, 10.5}}}}}}}
	if _, err := s.CreateImageOperationTask("another-user", request); err == nil {
		t.Fatal("mask accepted another user's original")
	}
	task, err := s.CreateImageOperationTask("image-user", request)
	if err != nil {
		t.Fatal(err)
	}
	replayed, err := s.CreateImageOperationTask("image-user", request)
	if err != nil || replayed.ID != task.ID {
		t.Fatal("mask task lost stable intent", err)
	}
	completed := runImageOperationTask(t, s, task.ID)
	if completed.Status != model.TaskStatusSucceeded {
		t.Fatal(completed.Error)
	}
	input, err := decodeImageOperationInput(completed)
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(original)
	if input.Request.Recipe.Mask == nil || input.Source.SHA256 != hex.EncodeToString(sum[:]) || input.Request.Recipe.Mask.Strokes[0].Points[0][0] != 15.5 {
		t.Fatal("persisted mask recipe/source changed")
	}
	var result struct {
		Images []struct {
			ResourceID     string `json:"resourceId"`
			AssetVersionID string `json:"assetVersionId"`
		}
	}
	if err := json.Unmarshal([]byte(completed.ResultJSON), &result); err != nil || len(result.Images) != 1 || result.Images[0].AssetVersionID == "" {
		t.Fatal("missing native mask asset", err)
	}
	_, reader, err := s.OpenResource("image-user", result.Images[0].ResourceID)
	if err != nil {
		t.Fatal(err)
	}
	output, err := io.ReadAll(reader)
	reader.Close()
	if err != nil {
		t.Fatal(err)
	}
	picture, err := png.Decode(bytes.NewReader(output))
	if err != nil {
		t.Fatal(err)
	}
	before, err := png.Decode(bytes.NewReader(original))
	if err != nil {
		t.Fatal(err)
	}
	for y := 0; y < 23; y++ {
		for x := 0; x < 31; x++ {
			got := color.NRGBA64Model.Convert(picture.At(x, y)).(color.NRGBA64)
			originalPixel, ok := before.At(x, y).(color.NRGBA)
			if !ok {
				t.Fatal("expected the explicit 8-bit unassociated PNG fixture")
			}
			want := color.NRGBA64{R: uint16(originalPixel.R) * 257, G: uint16(originalPixel.G) * 257, B: uint16(originalPixel.B) * 257, A: uint16(originalPixel.A) * 257}
			if got.R != want.R || got.G != want.G || got.B != want.B {
				t.Fatal("native mask changed source RGB")
			}
		}
	}
	if _, _, _, a := picture.At(0, 0).RGBA(); a != 0 {
		t.Fatal("mask did not make exterior transparent")
	}
	var version model.AssetVersion
	if err := db.First(&version, "id = ?", result.Images[0].AssetVersionID).Error; err != nil {
		t.Fatal(err)
	}
	var derivation imageOperationDerivation
	if err := json.Unmarshal([]byte(version.DefinitionJSON), &derivation); err != nil || derivation.Recipe.Mask == nil || derivation.Source.SHA256 != input.Source.SHA256 {
		t.Fatal("derived asset lost mask document", err)
	}
	request.Recipe.Mask.Mode = "remove"
	if _, err := s.CreateImageOperationTask("image-user", request); err == nil {
		t.Fatal("same intent accepted a changed mask")
	}
	_, reader, err = s.OpenResource("image-user", resource.ID)
	if err != nil {
		t.Fatal(err)
	}
	after, err := io.ReadAll(reader)
	reader.Close()
	if err != nil || !bytes.Equal(original, after) {
		t.Fatal("mask overwrote original source", err)
	}
}
