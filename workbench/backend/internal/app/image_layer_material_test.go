package app

import (
	"bytes"
	"context"
	"encoding/json"
	"gorm.io/gorm"
	"image/color"
	"image/png"
	"testing"
	"yingce/backend/internal/database"
	"yingce/backend/internal/imageops"
	"yingce/backend/internal/model"
)

func TestImageOperationLayerMaterialsNativeBatchRecoveryAndReplays(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	verifyImageMaterialBatch(t, s, db)
}
func TestImageOperationLayerMaterialsPostgresBatchRecoveryAndReplays(t *testing.T) {
	s, db := newProjectNameConflictPostgresService(t)
	s.dataDir = t.TempDir()
	s.activeCancels = map[string]context.CancelFunc{}
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	verifyImageMaterialBatch(t, s, db)
}
func materialFixture(t *testing.T, s *Service, db *gorm.DB, onlyFull bool) ImageLayerGroupSource {
	t.Helper()
	snapshot := seedNativeImageLayerGroup(t, s, db)
	row, err := s.repo.CanvasProjectForUser("image-user", snapshot.CanvasID)
	if err != nil {
		t.Fatal(err)
	}
	var doc map[string]any
	if err := json.Unmarshal([]byte(row.PayloadJSON), &doc); err != nil {
		t.Fatal(err)
	}
	for _, raw := range doc["nodes"].([]any) {
		node := raw.(map[string]any)
		meta := node["metadata"].(map[string]any)
		if node["id"] == "layer-top" || !onlyFull && node["id"] == "layer-base" {
			meta["imageLayer"] = map[string]any{"kind": "transparent"}
		}
	}
	encoded, _ := json.Marshal(doc)
	row.PayloadJSON = string(encoded)
	if err := s.repo.UpsertCanvasProject(row); err != nil {
		t.Fatal(err)
	}
	snapshot, err = s.ReadImageLayerGroupSource("image-user", snapshot.CanvasID, snapshot.NodeID)
	if err != nil {
		t.Fatal(err)
	}
	task, err := s.CreateImageOperationTask("image-user", nativeLayerRequest(snapshot, "material-native-ready-composition"))
	if err != nil {
		t.Fatal(err)
	}
	completed := runImageOperationTask(t, s, task.ID)
	if completed.ImageLayerDeliveryStatus != "applied" {
		t.Fatal(completed.Error, completed.ImageLayerDeliveryStatus)
	}
	snapshot, err = s.ReadImageLayerGroupSource("image-user", snapshot.CanvasID, snapshot.NodeID)
	if err != nil || !snapshot.Ready {
		t.Fatal(err)
	}
	return snapshot
}
func verifyImageMaterialBatch(t *testing.T, s *Service, db *gorm.DB) {
	t.Helper()
	snapshot := materialFixture(t, s, db, false)
	var countBefore int64
	db.Model(&model.Task{}).Count(&countBefore)
	req := ImageLayerMaterialsRequest{RequestID: "native-materials-first-intent", SourceGroupSHA256: snapshot.SnapshotSHA256}
	result, err := s.CreateImageLayerMaterials(context.Background(), "image-user", snapshot.CanvasID, snapshot.NodeID, req)
	if err != nil {
		t.Fatal(err)
	}
	if result.TaskID == "" || len(result.NodeIDs) != 0 {
		t.Fatal("batch was not durably queued", result)
	}
	before, err := s.repo.CanvasProjectForUser("image-user", snapshot.CanvasID)
	if err != nil {
		t.Fatal(err)
	}
	queued, err := s.repo.TaskForUser("image-user", result.TaskID)
	if err != nil || queued.ImageLayerDeliveryStatus != "pending" {
		t.Fatal("missing durable delivery", err)
	}
	input, err := decodeImageOperationInput(queued)
	if err != nil || len(input.Pieces) != 1 || len(input.Materials) != 2 {
		t.Fatal("expected one crop and one unchanged original", input, err)
	}
	for _, requestID := range []string{req.RequestID, "native-materials-concurrent-intent"} {
		again, err := s.CreateImageLayerMaterials(context.Background(), "image-user", snapshot.CanvasID, snapshot.NodeID, ImageLayerMaterialsRequest{RequestID: requestID, SourceGroupSHA256: req.SourceGroupSHA256})
		if err != nil || !again.Replayed || again.TaskID != result.TaskID {
			t.Fatal("lost reply or concurrent click duplicated batch", err)
		}
	}
	var countAfter int64
	db.Model(&model.Task{}).Count(&countAfter)
	if countAfter != countBefore+1 {
		t.Fatal("batch created extra tasks")
	}
	if _, err := s.CreateImageOperationTask("image-user", input.Request); err == nil {
		t.Fatal("generic endpoint bypassed group admission")
	}
	complete := runImageOperationTask(t, s, result.TaskID)
	if complete.Status != model.TaskStatusSucceeded || complete.ImageLayerDeliveryStatus != "applied" || complete.BillingOrderID != "" {
		t.Fatal("batch failed without browser", complete.Error, complete.ImageLayerDeliveryStatus)
	}
	var output struct {
		Images []imageOperationStoredOutput `json:"images"`
	}
	if err := json.Unmarshal([]byte(complete.ResultJSON), &output); err != nil || len(output.Images) != 1 {
		t.Fatal(err)
	}
	if err := validateImageOperationApplyOutput(s.repo, *complete, input, 0, output.Images[0]); err != nil {
		t.Fatal("wrong per-layer derivation", err)
	}
	sourceID, source := imageOperationOutputSource(input, 0)
	if sourceID == input.Request.ResourceID {
		t.Fatal("cropped composite instead of leaf")
	}
	original, err := s.readImageOperationSource("image-user", sourceID)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := imageops.Decode(context.Background(), original, source)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := s.readImageOperationSource("image-user", output.Images[0].ResourceID)
	if err != nil {
		t.Fatal(err)
	}
	cropped, err := png.Decode(bytes.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	piece := input.Pieces[0]
	for y := 0; y < piece.Height; y++ {
		for x := 0; x < piece.Width; x++ {
			if color.NRGBA64Model.Convert(cropped.At(x, y)) != color.NRGBA64Model.Convert(decoded.At(x+piece.X, y+piece.Y)) {
				t.Fatal("leaf pixels changed", x, y)
			}
		}
	}
	current, err := s.repo.CanvasProjectForUser("image-user", snapshot.CanvasID)
	if err != nil {
		t.Fatal(err)
	}
	var doc struct {
		Nodes []map[string]any `json:"nodes"`
	}
	if json.Unmarshal([]byte(current.PayloadJSON), &doc) != nil || len(doc.Nodes) != 5 {
		t.Fatal("batch missing crops or reused original")
	}
	matched := 0
	for _, node := range doc.Nodes {
		meta, _ := node["metadata"].(map[string]any)
		material, _ := meta["imageLayerMaterial"].(map[string]any)
		if material == nil {
			continue
		}
		matched++
		if material["reusedOriginal"] == true && meta["storageKey"] != "resource:"+input.Materials[1].ResourceID {
			t.Fatal("unchanged original was re-encoded")
		}
	}
	if matched != 2 {
		t.Fatal("missing fixed material provenance")
	}
	completedReplay, err := s.CreateImageLayerMaterials(context.Background(), "image-user", snapshot.CanvasID, snapshot.NodeID, ImageLayerMaterialsRequest{RequestID: "native-materials-other-window-after-complete", SourceGroupSHA256: snapshot.SnapshotSHA256})
	if err != nil || !completedReplay.Replayed || completedReplay.TaskID != complete.ID || len(completedReplay.NodeIDs) != 2 {
		t.Fatal("another window duplicated completed materials", completedReplay, err)
	}
	db.Model(&model.Task{}).Count(&countAfter)
	if countAfter != countBefore+1 {
		t.Fatal("completed batch duplicated task")
	}
	// Simulate a persisted user undo after successful worker delivery. The old
	// task receipt must not recreate removed material nodes or change the marker.
	before.Revision = current.Revision
	if err := s.repo.UpsertCanvasProject(before); err != nil {
		t.Fatal(err)
	}
	replay, err := s.ApplyImageOperationTask("image-user", complete.ID, ImageOperationApplyRequest{RequestID: "native-materials-replay-after-undo"})
	if err != nil || !replay.Replayed {
		t.Fatal("canonical receipt missing", err)
	}
	after, _ := s.repo.CanvasProjectForUser("image-user", snapshot.CanvasID)
	if after.PayloadJSON != before.PayloadJSON {
		t.Fatal("old task resurrected undone materials")
	}
	stale := req
	stale.RequestID = "native-materials-invalid-sha"
	stale.SourceGroupSHA256 = "0000000000000000000000000000000000000000000000000000000000000000"
	if _, err := s.CreateImageLayerMaterials(context.Background(), "image-user", snapshot.CanvasID, snapshot.NodeID, stale); err == nil {
		t.Fatal("stale group admitted")
	}
}
func TestImageOperationLayerMaterialsUnchangedFilesNeedNoTask(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	snapshot := materialFixture(t, s, db, true)
	var tasksBefore, filesBefore int64
	db.Model(&model.Task{}).Count(&tasksBefore)
	db.Model(&model.Resource{}).Count(&filesBefore)
	result, err := s.CreateImageLayerMaterials(context.Background(), "image-user", snapshot.CanvasID, snapshot.NodeID, ImageLayerMaterialsRequest{RequestID: "native-materials-fullframe-reuse", SourceGroupSHA256: snapshot.SnapshotSHA256})
	if err != nil || result.TaskID != "" || len(result.NodeIDs) != 1 {
		t.Fatal("no-op crop should reuse source without queueing", result, err)
	}
	var tasksAfter, filesAfter int64
	db.Model(&model.Task{}).Count(&tasksAfter)
	db.Model(&model.Resource{}).Count(&filesAfter)
	if tasksAfter != tasksBefore || filesAfter != filesBefore {
		t.Fatal("unchanged file created fake task or duplicate media")
	}
	again, err := s.CreateImageLayerMaterials(context.Background(), "image-user", snapshot.CanvasID, snapshot.NodeID, ImageLayerMaterialsRequest{RequestID: "native-materials-fullframe-other-window", SourceGroupSHA256: snapshot.SnapshotSHA256})
	if err != nil || !again.Replayed || len(again.NodeIDs) != 1 || again.NodeIDs[0] != result.NodeIDs[0] {
		t.Fatal("other window duplicated no-op materials", again, err)
	}
}
