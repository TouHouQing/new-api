package app

import (
	"bytes"
	"compress/zlib"
	"context"
	"encoding/binary"
	"encoding/json"
	"gorm.io/gorm"
	"hash/crc32"
	"image"
	"image/color"
	"image/png"
	"os"
	"testing"
	"yingce/backend/internal/database"
	"yingce/backend/internal/imageops"
	"yingce/backend/internal/model"
)

func TestImageOperationAlphaBoundsAndPixelCropPreserveRealSource(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	verifyNativeAlphaBounds(t, s, db)
}
func TestImageOperationAlphaBoundsPostgresOwnershipAndExactCrop(t *testing.T) {
	s, db := newProjectNameConflictPostgresService(t)
	s.dataDir = t.TempDir()
	s.activeCancels = map[string]context.CancelFunc{}
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	verifyNativeAlphaBounds(t, s, db)
}
func verifyNativeAlphaBounds(t *testing.T, s *Service, db *gorm.DB) {
	t.Helper()
	seedImageOperationSource(t, s, db)
	if err := db.Model(&model.User{}).Where("id = ?", "image-user").Update("status", model.UserStatusActive).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.User{ID: "alpha-foreign", Username: "alpha-foreign", Role: model.UserRoleUser, Status: model.UserStatusActive}).Error; err != nil {
		t.Fatal(err)
	}
	picture := image.NewNRGBA64(image.Rect(0, 0, 31, 23))
	edge := color.NRGBA64{R: 60000, G: 20000, B: 30000, A: 1}
	picture.SetNRGBA64(1, 2, edge)
	picture.SetNRGBA64(20, 15, color.NRGBA64{R: 10000, G: 40000, B: 50000, A: 65535})
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, picture); err != nil {
		t.Fatal(err)
	}
	profile, err := os.ReadFile("../imageops/testdata/srgb.icc")
	if err != nil {
		t.Fatal(err)
	}
	var compressed bytes.Buffer
	writer := zlib.NewWriter(&compressed)
	if _, err := writer.Write(profile); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	body := append([]byte("alpha-bounds-test\x00\x00"), compressed.Bytes()...)
	chunk := make([]byte, len(body)+12)
	binary.BigEndian.PutUint32(chunk, uint32(len(body)))
	copy(chunk[4:], "iCCP")
	copy(chunk[8:], body)
	binary.BigEndian.PutUint32(chunk[len(chunk)-4:], crc32.ChecksumIEEE(chunk[4:len(chunk)-4]))
	raw := append(append(append([]byte{}, encoded.Bytes()[:33]...), chunk...), encoded.Bytes()[33:]...)
	resource, _, err := s.storeResource("image-user", "image", "alpha-edge-original.png", "image/png", int64(len(raw)), 31, 23, 0, bytes.NewReader(raw), nil, false)
	if err != nil {
		t.Fatal(err)
	}
	var tasksBefore, resourcesBefore int64
	db.Model(&model.Task{}).Count(&tasksBefore)
	db.Model(&model.Resource{}).Count(&resourcesBefore)
	bounds, err := s.InspectImageAlphaBounds(context.Background(), "image-user", resource.ID)
	if err != nil || bounds.Empty || !bounds.TrimNeeded || bounds.Bounds == nil || *bounds.Bounds != (imageops.PixelCrop{X: 1, Y: 2, Width: 20, Height: 14}) {
		t.Fatal("native alpha probe lost16-bit edge", bounds, err)
	}
	if _, err := s.InspectImageAlphaBounds(context.Background(), "alpha-foreign", resource.ID); err == nil {
		t.Fatal("active foreign account read source alpha")
	}
	var tasksAfter, resourcesAfter int64
	db.Model(&model.Task{}).Count(&tasksAfter)
	db.Model(&model.Resource{}).Count(&resourcesAfter)
	if tasksBefore != tasksAfter || resourcesBefore != resourcesAfter {
		t.Fatal("read-only probe created a task or resource")
	}
	request := ImageOperationCreateRequest{RequestID: "alpha47-native-pixel-crop-v1", ResourceID: resource.ID, ExpectedSourceSHA256: bounds.Source.SHA256, Recipe: imageops.Recipe{Operation: "crop", CropPixels: bounds.Bounds}}
	mismatch := request
	mismatch.RequestID = "alpha47-stale-source-sha-v1"
	mismatch.ExpectedSourceSHA256 = "0000000000000000000000000000000000000000000000000000000000000000"
	if _, err := s.CreateImageOperationTask("image-user", mismatch); err == nil {
		t.Fatal("crop ignored expected source hash")
	}
	task, err := s.CreateImageOperationTask("image-user", request)
	if err != nil {
		t.Fatal(err)
	}
	complete := runImageOperationTask(t, s, task.ID)
	if complete.Status != model.TaskStatusSucceeded || complete.BillingOrderID != "" {
		t.Fatal("native crop failed", complete.Error)
	}
	var result struct {
		Images []imageOperationStoredOutput `json:"images"`
	}
	if err := json.Unmarshal([]byte(complete.ResultJSON), &result); err != nil || len(result.Images) != 1 {
		t.Fatal("crop output missing", err)
	}
	data, err := s.readImageOperationSource("image-user", result.Images[0].ResourceID)
	if err != nil {
		t.Fatal(err)
	}
	cropped, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	if cropped.Bounds().Dx() != 20 || cropped.Bounds().Dy() != 14 || color.NRGBA64Model.Convert(cropped.At(0, 0)).(color.NRGBA64) != edge || data[24] != 16 || !bytes.Contains(data, chunk) {
		t.Fatal("native crop changed16-bit unassociated RGB, alpha, ICC or integer bounds")
	}
	original, err := s.readImageOperationSource("image-user", resource.ID)
	if err != nil || !bytes.Equal(original, raw) {
		t.Fatal("source bytes changed", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := s.InspectImageAlphaBounds(ctx, "image-user", resource.ID); err != context.Canceled {
		t.Fatal("probe cancellation not preserved", err)
	}
}
