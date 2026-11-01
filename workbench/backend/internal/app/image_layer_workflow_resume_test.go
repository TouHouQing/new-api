package app

import (
	"context"
	"encoding/json"
	"gorm.io/gorm"
	"testing"
	"time"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
)

func runLayerWorkflowUntilTerminal(t *testing.T, s *Service, db *gorm.DB, id string) *model.Task {
	t.Helper()
	for i := 0; i < 24; i++ {
		task, err := s.repo.Task(id)
		if err != nil {
			t.Fatal(err)
		}
		if task.Status == model.TaskStatusSucceeded || task.Status == model.TaskStatusFailed || task.Status == model.TaskStatusCancelled {
			return task
		}
		claimed, err := s.repo.ClaimNextTask("resume-single-worker", time.Minute)
		if err != nil {
			t.Fatal(err)
		}
		if claimed == nil {
			if err := db.Model(&model.Task{}).Where("project_id = ? AND status = ? AND lease_owner = ''", task.ProjectID, model.TaskStatusRunning).Update("next_poll_at", time.Now().Add(-time.Second)).Error; err != nil {
				t.Fatal(err)
			}
			continue
		}
		if err := s.taskWorker().processClaimedTask(claimed, nil); err != nil {
			t.Fatal(err)
		}
	}
	t.Fatal("continued native workflow did not settle")
	return nil
}

func verifyImageLayerWorkflowResume(t *testing.T, s *Service, db *gorm.DB, extracted bool) {
	t.Helper()
	ctx := context.Background()
	req, canvasID := seedImageLayerWorkflow(t, s, db)
	created, err := s.CreateImageLayerWorkflow(ctx, "image-user", canvasID, req)
	if err != nil {
		t.Fatal(err)
	}
	claimed, err := s.repo.ClaimNextTask("resume-original-worker", time.Minute)
	if err != nil || claimed == nil || claimed.ID != created.TaskID {
		t.Fatal("original parent not claimed", err)
	}
	if err := s.taskWorker().processClaimedTask(claimed, nil); err != nil {
		t.Fatal(err)
	}
	if extracted {
		claimed, err = s.repo.ClaimNextTask("resume-original-worker", time.Minute)
		if err != nil || claimed == nil || claimed.Operation != "region" {
			t.Fatal("original extraction not claimed", err)
		}
		if err := s.taskWorker().processClaimedTask(claimed, nil); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := s.taskLifecycle().cancelTask(ctx, "image-user", created.TaskID); err != nil {
		t.Fatal(err)
	}
	old, err := s.repo.Task(created.TaskID)
	if err != nil || old.ImageLayerDeliveryStatus != "applied" {
		t.Fatal("original cleanup incomplete", err)
	}
	frozenInput, frozenResult := old.InputJSON, old.ResultJSON
	var public imageLayerWorkflowInput
	if json.Unmarshal([]byte(taskForOutput(*old).InputJSON), &public) != nil || public.Request.RequestID != req.RequestID {
		t.Fatal("public plan not available for explicit continuation")
	}
	req.ResumeTaskID, req.RequestID = created.TaskID, "resume-native-workflow-request-0001"
	var existingCount int64
	if err := db.Model(&model.Task{}).Where("project_id = ?", canvasID).Count(&existingCount).Error; err != nil {
		t.Fatal(err)
	}
	failedChildID := public.InitialTaskIDs[1]
	if !extracted {
		if _, err := s.taskLifecycle().retryTask("image-user", failedChildID); err == nil {
			t.Fatal("individual child retry bypassed parent budget approval")
		}
		if err := db.Model(&model.Task{}).Where("id = ?", failedChildID).Update("billing_order_id", "missing-billing-order").Error; err != nil {
			t.Fatal(err)
		}
		if _, err := s.CreateImageLayerWorkflow(ctx, "image-user", canvasID, req); err == nil {
			t.Fatal("unknown billing allowed another submission")
		}
		if err := db.Model(&model.Task{}).Where("id = ?", failedChildID).Update("billing_order_id", "").Error; err != nil {
			t.Fatal(err)
		}
		var afterCount int64
		db.Model(&model.Task{}).Where("project_id = ?", canvasID).Count(&afterCount)
		if afterCount != existingCount {
			t.Fatal("unknown billing left partially admitted continuation")
		}
		// A stopped deterministic CPU checkpoint can be recomputed for free;
		// it is not an uncertain already-paid model response.
		if err := db.Model(&model.Task{}).Where("id = ?", failedChildID).Update("media_recovery_json", "{}").Error; err != nil {
			t.Fatal(err)
		}
	}
	modified := req
	modified.Layers = append([]ImageLayerWorkflowLayer{}, req.Layers...)
	modified.Layers[1].Name = "silently changed plan"
	if _, err := s.CreateImageLayerWorkflow(ctx, "image-user", canvasID, modified); err == nil {
		t.Fatal("changed plan continued without new planning")
	}
	if _, err := s.CreateImageLayerWorkflow(ctx, "foreign-user", canvasID, req); err == nil {
		t.Fatal("foreign user continued workflow")
	}
	resumed, err := s.CreateImageLayerWorkflow(ctx, "image-user", canvasID, req)
	if err != nil {
		t.Fatal(err)
	}
	repeat, err := s.CreateImageLayerWorkflow(ctx, "image-user", canvasID, req)
	if err != nil || repeat.TaskID != resumed.TaskID || !repeat.Replayed {
		t.Fatal("continued lost reply created duplicate", err)
	}
	next, err := s.repo.Task(resumed.TaskID)
	if err != nil {
		t.Fatal(err)
	}
	input, err := decodeImageLayerWorkflowInput(next)
	if err != nil {
		t.Fatal(err)
	}
	if input.ReusedLayers[0].ResourceID != public.Request.ResourceID || input.InitialTaskIDs[0] != "" {
		t.Fatal("completed original layer was regenerated")
	}
	if extracted && (input.ReusedLayers[1].ExtractionTaskID != public.InitialTaskIDs[1] || input.InitialTaskIDs[1] != public.InitialTaskIDs[1]) {
		t.Fatal("completed unpublished extraction was regenerated")
	}
	if extracted {
		if _, err := s.taskLifecycle().cancelTask(ctx, "image-user", resumed.TaskID); err != nil {
			t.Fatal(err)
		}
		req.ResumeTaskID, req.RequestID = resumed.TaskID, "resume-native-workflow-request-0002"
		resumed, err = s.CreateImageLayerWorkflow(ctx, "image-user", canvasID, req)
		if err != nil {
			t.Fatal("second continuation could not retain grandparent extraction", err)
		}
		third, _ := s.repo.Task(resumed.TaskID)
		if _, err := decodeImageLayerWorkflowInput(third); err != nil {
			t.Fatal(err)
		}
	}
	next = runLayerWorkflowUntilTerminal(t, s, db, resumed.TaskID)
	if next.Status != model.TaskStatusSucceeded {
		t.Fatal(next.Stage, next.Error)
	}
	if err := s.requireReadyImageLayerGroup("image-user", canvasID, resumed.NodeID); err != nil {
		t.Fatal(err)
	}
	old, err = s.repo.Task(created.TaskID)
	if err != nil || old.InputJSON != frozenInput || old.ResultJSON != frozenResult || old.Status != model.TaskStatusCancelled {
		t.Fatal("continuation rewrote old task", err)
	}
	var regions int64
	if err := db.Model(&model.Task{}).Where("project_id = ? AND operation = ?", canvasID, "region").Count(&regions).Error; err != nil {
		t.Fatal(err)
	}
	expected := int64(2)
	if extracted {
		expected = 1
	}
	if regions != expected {
		t.Fatal("unexpected repeated extraction count", regions, expected)
	}
}

func TestImageLayerWorkflowResumeSQLitePreservesCompletedLayers(t *testing.T) {
	for _, extracted := range []bool{false, true} {
		t.Run(map[bool]string{false: "published-base", true: "unpublished-extraction"}[extracted], func(t *testing.T) {
			s, db := newMediaRecoveryTestService(t)
			sqlDB, _ := db.DB()
			sqlDB.SetMaxOpenConns(1)
			verifyImageLayerWorkflowResume(t, s, db, extracted)
		})
	}
}
func TestImageLayerWorkflowResumePostgresPreservesCompletedExtraction(t *testing.T) {
	s, db := newProjectNameConflictPostgresService(t)
	s.dataDir = t.TempDir()
	s.activeCancels = map[string]context.CancelFunc{}
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	verifyImageLayerWorkflowResume(t, s, db, true)
}
