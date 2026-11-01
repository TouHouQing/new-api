package app

import (
	"context"
	"encoding/json"
	"gorm.io/gorm"
	"testing"
	"time"
	"yingce/backend/internal/canvas"
	"yingce/backend/internal/database"
	"yingce/backend/internal/imageops"
	"yingce/backend/internal/model"
)

func seedImageLayerWorkflow(t *testing.T, s *Service, db *gorm.DB) (ImageLayerWorkflowRequest, string) {
	t.Helper()
	source := seedNativeImageLayerGroup(t, s, db)
	probe, err := s.InspectImageAlphaBounds(context.Background(), "image-user", source.Composition.Layers[0].ResourceID)
	if err != nil {
		t.Fatal(err)
	}
	return ImageLayerWorkflowRequest{RequestID: "native-layer-workflow-fixture-1", SourceNodeID: "layer-base", ResourceID: probe.ResourceID, ExpectedSourceSHA256: probe.Source.SHA256, Title: "拆层恢复测试", Layers: []ImageLayerWorkflowLayer{{Name: "原图", Method: "source"}, {Name: "局部对象", Method: "source-region", Region: &imageops.Region{Width: 31, Height: 23, BBox: []float64{0, 0, 900, 900}, Shape: "rect"}}}}, source.CanvasID
}

func TestImageLayerWorkflowNativeSingleWorkerAndReplay(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	connection, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	connection.SetMaxOpenConns(1)
	verifyImageLayerWorkflow(t, s, db)
}

func TestImageLayerWorkflowPostgresSingleWorkerAndReplay(t *testing.T) {
	s, db := newProjectNameConflictPostgresService(t)
	s.dataDir = t.TempDir()
	s.activeCancels = map[string]context.CancelFunc{}
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	verifyImageLayerWorkflow(t, s, db)
}

func verifyImageLayerWorkflow(t *testing.T, s *Service, db *gorm.DB) {
	t.Helper()
	req, canvasID := seedImageLayerWorkflow(t, s, db)
	result, err := s.CreateImageLayerWorkflow(context.Background(), "image-user", canvasID, req)
	if err != nil {
		t.Fatal(err)
	}
	replayed, err := s.CreateImageLayerWorkflow(context.Background(), "image-user", canvasID, req)
	if err != nil || !replayed.Replayed || replayed.TaskID != result.TaskID {
		t.Fatal("unknown reply duplicated workflow", err)
	}
	var count int64
	if err := db.Model(&model.Task{}).Where("project_id = ?", canvasID).Count(&count).Error; err != nil || count != 2 {
		t.Fatal("parent/source-region must atomically queue exactly two tasks", count, err)
	}
	deferred := false
	for i := 0; i < 12; i++ {
		// Let already queued children run before advancing a waiting parent's
		// clock. Moving its older row ahead on every iteration invents starvation.
		claimed, err := s.repo.ClaimNextTask("workflow-single-worker", time.Minute)
		if err != nil {
			t.Fatal(err)
		}
		if claimed == nil {
			if err := db.Model(&model.Task{}).Where("project_id = ? AND status = ? AND lease_owner = ''", canvasID, model.TaskStatusRunning).Update("next_poll_at", time.Now().Add(-time.Second)).Error; err != nil {
				t.Fatal(err)
			}
			claimed, err = s.repo.ClaimNextTask("workflow-single-worker", time.Minute)
			if err != nil || claimed == nil {
				t.Fatal("workflow deadlocked without a runnable child", err)
			}
		}
		if err := s.taskWorker().processClaimedTask(claimed, nil); err != nil {
			t.Fatal(claimed.ID, err)
		}
		parent, err := s.repo.Task(result.TaskID)
		if err != nil {
			t.Fatal(err)
		}
		if parent.Status == model.TaskStatusFailed {
			t.Fatal(parent.Stage, parent.Error)
		}
		if claimed.ID == parent.ID && parent.Status == model.TaskStatusRunning {
			deferred = true
			if parent.LeaseOwner != "" || parent.LeaseExpiresAt != nil {
				t.Fatal("waiting parent retained execution slot")
			}
		}
		if parent.Status == model.TaskStatusSucceeded {
			break
		}
	}
	parent, _ := s.repo.Task(result.TaskID)
	if !deferred || parent.Status != model.TaskStatusSucceeded {
		t.Fatal("native workflow not completed", parent.Status, parent.Error)
	}
	if err := s.requireReadyImageLayerGroup("image-user", canvasID, result.NodeID); err != nil {
		t.Fatal("first composition not a native ready image", err)
	}
	compose, err := s.repo.Task(imageLayerWorkflowComposeTaskID(*parent))
	if err != nil || compose.Status != model.TaskStatusSucceeded || compose.ImageLayerDeliveryStatus != "applied" {
		t.Fatal("composition missing durable delivery", err)
	}
	if err := db.Model(&model.Task{}).Where("project_id = ?", canvasID).Count(&count).Error; err != nil || count != 3 {
		t.Fatal("source reuse or resume produced duplicate tasks", count, err)
	}
	req.Title = "different intent"
	if _, err := s.CreateImageLayerWorkflow(context.Background(), "image-user", canvasID, req); err == nil {
		t.Fatal("accepted new intent with old identity")
	}
}

func TestImageLayerWorkflowCancelStopsChildrenAndLateWrites(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	req, canvasID := seedImageLayerWorkflow(t, s, db)
	result, err := s.CreateImageLayerWorkflow(context.Background(), "image-user", canvasID, req)
	if err != nil {
		t.Fatal(err)
	}
	parent, err := s.repo.Task(result.TaskID)
	if err != nil {
		t.Fatal(err)
	}
	input, err := decodeImageLayerWorkflowInput(parent)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.taskLifecycle().cancelTask(context.Background(), parent.UserID, parent.ID); err != nil {
		t.Fatal(err)
	}
	child, err := s.repo.Task(input.InitialTaskIDs[1])
	if err != nil || child.Status != model.TaskStatusCancelled {
		t.Fatal("cancelled parent left queued child", err)
	}
	before, _ := s.repo.CanvasProjectForUser(parent.UserID, canvasID)
	var doc struct {
		Nodes []map[string]any `json:"nodes"`
	}
	if err := json.Unmarshal([]byte(before.PayloadJSON), &doc); err != nil {
		t.Fatal(err)
	}
	for _, node := range doc.Nodes {
		meta, _ := node["metadata"].(map[string]any)
		if (node["id"] == result.NodeID || meta["nativeImageLayerWorkflowParentId"] == parent.ID) && meta["status"] == "loading" {
			t.Fatal("cancelled workflow remained loading")
		}
	}
	if err := s.mutateImageLayerWorkflow(parent, input, "late", func(*Service, map[string]map[string]any, map[string]any, bool) ([]canvas.CanvasOperation, error) {
		t.Fatal("late cancelled worker entered mutation")
		return nil, nil
	}, nil); err == nil {
		t.Fatal("cancelled workflow accepted late writes")
	}
	parent, _ = s.repo.Task(parent.ID)
	if err := s.cancelImageLayerWorkflow(parent); err != nil {
		t.Fatal("cancel replay failed", err)
	}
	after, _ := s.repo.CanvasProjectForUser(parent.UserID, canvasID)
	if after.PayloadJSON != before.PayloadJSON || after.Revision != before.Revision {
		t.Fatal("cancel replay changed canvas")
	}
}

func TestImageLayerWorkflowDoesNotRestoreDeletedChildOrAdmitPartialPlan(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	req, canvasID := seedImageLayerWorkflow(t, s, db)
	before, _ := s.repo.CanvasProjectForUser("image-user", canvasID)
	invalid := req
	invalid.RequestID = "native-layer-workflow-invalid-model"
	invalid.Layers = append([]ImageLayerWorkflowLayer{}, req.Layers...)
	invalid.Layers = append(invalid.Layers, ImageLayerWorkflowLayer{Name: "不能调用的模型", Method: "generate", Generation: &ImageLayerWorkflowModel{Model: "unconfigured-unknown-model", Prompt: "不得发出请求"}})
	if _, err := s.CreateImageLayerWorkflow(context.Background(), "image-user", canvasID, invalid); err == nil {
		t.Fatal("unconfigured model admitted")
	}
	var count int64
	if err := db.Model(&model.Task{}).Where("project_id = ?", canvasID).Count(&count).Error; err != nil || count != 0 {
		t.Fatal("preflight left partially queued plan", count, err)
	}
	unchanged, _ := s.repo.CanvasProjectForUser("image-user", canvasID)
	if unchanged.PayloadJSON != before.PayloadJSON || unchanged.Revision != before.Revision {
		t.Fatal("preflight changed canvas")
	}
	result, err := s.CreateImageLayerWorkflow(context.Background(), "image-user", canvasID, req)
	if err != nil {
		t.Fatal(err)
	}
	current, _ := s.repo.CanvasProjectForUser("image-user", canvasID)
	base := current.Revision
	var beforeRemove struct {
		Nodes []map[string]any `json:"nodes"`
	}
	if err := json.Unmarshal([]byte(current.PayloadJSON), &beforeRemove); err != nil {
		t.Fatal(err)
	}
	var expected json.RawMessage
	for _, node := range beforeRemove.Nodes {
		if node["id"] == result.ChildNodeIDs[0] {
			expected, _ = json.Marshal(node)
		}
	}
	_, err = s.canvasDomain().ApplyUserCanvasOperations("image-user", canvasID, canvas.CanvasOperationsRequest{MutationID: "delete-layer-before-completion", BaseRevision: &base, Operations: []canvas.CanvasOperation{{Type: "remove_node", ID: result.ChildNodeIDs[0], Expected: expected}}})
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 4; i++ {
		claimed, err := s.repo.ClaimNextTask("workflow-edit-worker", time.Minute)
		if err != nil {
			t.Fatal(err)
		}
		if claimed == nil {
			break
		}
		if err := s.taskWorker().processClaimedTask(claimed, nil); err != nil {
			t.Fatal(err)
		}
	}
	parent, err := s.repo.Task(result.TaskID)
	if err != nil || parent.Status != model.TaskStatusFailed || parent.ImageLayerDeliveryStatus != "applied" {
		t.Fatal("detached workflow did not settle", err, parent)
	}
	last, _ := s.repo.CanvasProjectForUser("image-user", canvasID)
	var doc struct {
		Nodes []map[string]any `json:"nodes"`
	}
	if err := json.Unmarshal([]byte(last.PayloadJSON), &doc); err != nil {
		t.Fatal(err)
	}
	for _, node := range doc.Nodes {
		if node["id"] == result.ChildNodeIDs[0] {
			t.Fatal("worker restored deleted child")
		}
		meta, _ := node["metadata"].(map[string]any)
		if (node["id"] == result.NodeID || meta["nativeImageLayerWorkflowParentId"] == parent.ID) && meta["status"] == "loading" {
			t.Fatal("stopped workflow remained loading")
		}
	}
	active, err := s.repo.ActiveTaskCountForUser("image-user")
	if err != nil || active != 0 {
		t.Fatal("detached parent left active child", active, err)
	}
}
