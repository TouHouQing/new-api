package app

import (
	"context"
	"encoding/json"
	"gorm.io/gorm"
	"testing"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
)

func TestImageOperationLayerGroupCreateAtomicallyQueuesNativeTask(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	verifyImageLayerGroupCreate(t, s, db)
}
func TestImageOperationLayerGroupCreatePostgresAtomicQueue(t *testing.T) {
	s, db := newProjectNameConflictPostgresService(t)
	s.dataDir = t.TempDir()
	s.activeCancels = map[string]context.CancelFunc{}
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	verifyImageLayerGroupCreate(t, s, db)
}
func verifyImageLayerGroupCreate(t *testing.T, s *Service, db *gorm.DB) {
	t.Helper()
	snapshot := seedNativeImageLayerGroup(t, s, db)
	req := ImageLayerGroupCreateRequest{RequestID: "manual-native-layer-group-v1", Title: "产品图", Width: 41, Height: 29, Sources: []ImageLayerGroupCreateSource{{NodeID: snapshot.Composition.Layers[0].ID, ResourceID: snapshot.Composition.Layers[0].ResourceID}, {NodeID: snapshot.Composition.Layers[1].ID, ResourceID: snapshot.Composition.Layers[1].ResourceID}}}
	result, err := s.CreateImageLayerGroup("image-user", snapshot.CanvasID, req)
	if err != nil {
		t.Fatal(err)
	}
	queued, err := s.repo.TaskForUser("image-user", result.TaskID)
	if err != nil || queued.Status != model.TaskStatusQueued || queued.ImageLayerDeliveryStatus != "pending" {
		t.Fatal("group committed without queued native delivery", err)
	}
	before, err := s.repo.CanvasProjectForUser("image-user", snapshot.CanvasID)
	if err != nil {
		t.Fatal(err)
	}
	again, err := s.CreateImageLayerGroup("image-user", snapshot.CanvasID, req)
	if err != nil || !again.Replayed || again.TaskID != result.TaskID || again.NodeID != result.NodeID {
		t.Fatal("lost reply duplicated group/task", err)
	}
	if err := s.requireReadyImageLayerGroup("image-user", snapshot.CanvasID, result.NodeID); err == nil {
		t.Fatal("pending source preview accepted as production image")
	}
	complete := runImageOperationTask(t, s, result.TaskID)
	if complete.Status != model.TaskStatusSucceeded || complete.ImageLayerDeliveryStatus != "applied" {
		t.Fatal("native task not delivered", complete.Error, complete.ImageLayerDeliveryStatus)
	}
	if err := s.requireReadyImageLayerGroup("image-user", snapshot.CanvasID, result.NodeID); err != nil {
		t.Fatal("actual composed output rejected", err)
	}
	current, err := s.repo.CanvasProjectForUser("image-user", snapshot.CanvasID)
	if err != nil {
		t.Fatal(err)
	}
	var doc struct {
		Nodes []map[string]any `json:"nodes"`
	}
	if json.Unmarshal([]byte(current.PayloadJSON), &doc) != nil || len(doc.Nodes) != 4 {
		t.Fatal("manual grouping lost source nodes")
	}
	if current.Revision <= before.Revision {
		t.Fatal("delivery did not advance native revision")
	}
	// A replayed old receipt must never undo a later user action, including undo.
	before.Revision = current.Revision
	if err := s.repo.UpsertCanvasProject(before); err != nil {
		t.Fatal("fixture user edit must use the current CAS revision", err)
	}
	replay, err := s.ApplyImageOperationTask("image-user", result.TaskID, ImageOperationApplyRequest{RequestID: "manual-native-replay-after-undo"})
	if err != nil || !replay.Replayed {
		t.Fatal("receipt not recovered", err)
	}
	after, err := s.repo.CanvasProjectForUser("image-user", snapshot.CanvasID)
	if err != nil || after.PayloadJSON != before.PayloadJSON {
		t.Fatal("historical adoption overrode user undo", err)
	}
	invalid := req
	invalid.RequestID = "manual-native-invalid-group-v1"
	invalid.Sources = append([]ImageLayerGroupCreateSource{}, req.Sources...)
	invalid.Sources[1].ResourceID = "foreign-resource"
	if _, err := s.CreateImageLayerGroup("image-user", snapshot.CanvasID, invalid); err == nil {
		t.Fatal("changed source was accepted")
	}
	unchanged, _ := s.repo.CanvasProjectForUser("image-user", snapshot.CanvasID)
	if unchanged.PayloadJSON != after.PayloadJSON || unchanged.Revision != after.Revision {
		t.Fatal("failed creation left a partial group")
	}
	req.Title = "conflicting intent"
	if _, err := s.CreateImageLayerGroup("image-user", snapshot.CanvasID, req); err == nil {
		t.Fatal("same identity accepted different group intent")
	}
}
