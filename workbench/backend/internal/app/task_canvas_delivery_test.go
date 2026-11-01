package app

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"
	"yingce/backend/internal/model"
)

func TestCanvasTaskDeliveryRestartsAfterFailureAndCancellationWithoutReopeningTask(t *testing.T) {
	for _, status := range []model.TaskStatus{model.TaskStatusFailed, model.TaskStatusCancelled} {
		t.Run(string(status), func(t *testing.T) {
			s, db, task := canvasTaskDraftFixture(t)
			if err := s.createTaskWithinStorageQuota(task, nil, defaultRuntimePolicy()); err != nil {
				t.Fatal(err)
			}
			if err := db.Model(task).Updates(map[string]any{"status": status, "error": "生成未完成", "stage": "任务已结束", "completed_at": time.Now()}).Error; err != nil {
				t.Fatal(err)
			}
			before, err := s.repo.Task(task.ID)
			if err != nil {
				t.Fatal(err)
			}
			restarted := &Service{repo: s.repo, dataDir: s.dataDir}
			if err := restarted.reconcileCanvasTaskDelivery(context.Background(), task.ID); err != nil {
				t.Fatal(err)
			}
			after, err := s.repo.Task(task.ID)
			if err != nil {
				t.Fatal(err)
			}
			if after.Status != status || after.InputJSON != before.InputJSON || after.ResultJSON != before.ResultJSON || after.Attempts != before.Attempts || after.CanvasDeliveryStatus != "applied" {
				t.Fatal("canvas recovery changed original execution", after)
			}
			nodes := creationMaps(canvasTaskDraftDocument(t, restarted)["nodes"])
			metadata := nodes[1]["metadata"].(map[string]any)
			if metadata["status"] != "error" || metadata["taskStatus"] != string(status) || metadata["errorDetails"] == "" {
				t.Fatal("terminal task left target loading", nodes[1])
			}
			if err := restarted.reconcileCanvasTaskDelivery(context.Background(), task.ID); err != nil {
				t.Fatal(err)
			}
			final, _ := s.repo.Task(task.ID)
			if final.CanvasDeliveryAttempts != 1 || final.Attempts != before.Attempts {
				t.Fatal("delivered terminal state was repeatedly processed", final)
			}
		})
	}
}

func TestCanvasTaskDeliveryQuotaFailureKeepsSuccessfulTextAndRetriesOnlyCanvasAfterRestart(t *testing.T) {
	s, db, task := canvasTaskDraftFixture(t)
	var input map[string]any
	_ = json.Unmarshal([]byte(task.InputJSON), &input)
	input["mode"] = "text"
	input["metadata"].(map[string]any)["canvasTaskDraft"].(map[string]any)["node"].(map[string]any)["type"] = "text"
	raw, _ := json.Marshal(input)
	task.InputJSON, task.Type = string(raw), "canvas_text"
	if err := s.createTaskWithinStorageQuota(task, nil, defaultRuntimePolicy()); err != nil {
		t.Fatal(err)
	}
	task.Status = model.TaskStatusRunning
	if err := db.Model(task).Update("status", task.Status).Error; err != nil {
		t.Fatal(err)
	}
	policy := defaultRuntimePolicy()
	policy.Resource.StructuredDataMB = 1
	encoded, _ := json.Marshal(policy)
	if err := db.Create(&model.SystemSetting{Key: runtimePolicySettingKey, ValueJSON: string(encoded)}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.Asset{ID: "quota-control", UserID: task.UserID, Kind: "text", PayloadJSON: strings.Repeat("x", 1024*1024)}).Error; err != nil {
		t.Fatal(err)
	}
	completing := &Service{repo: s.repo, dataDir: s.dataDir}
	result := []byte(`{"text":"第一镜：晨光。\n第二镜：人物走入画面。"}`)
	if err := completing.saveTaskCompletionWithinStorageQuota(task, result, nil, false); err != nil {
		t.Fatal("completed model result was blocked by canvas-only storage", err)
	}
	saved, err := s.repo.Task(task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if saved.Status != model.TaskStatusSucceeded || saved.ResultJSON != string(result) || saved.CanvasDeliveryStatus != "pending" || saved.CanvasDeliveryNextAttemptAt == nil || saved.CanvasDeliveryAttempts != 1 {
		t.Fatal("missing durable canvas retry", saved)
	}
	if err := db.Delete(&model.Asset{}, "id = ?", "quota-control").Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Model(saved).Update("canvas_delivery_next_attempt_at", time.Now().Add(-time.Second)).Error; err != nil {
		t.Fatal(err)
	}
	restarted := &Service{repo: s.repo, dataDir: s.dataDir}
	if err := restarted.reconcileCanvasTaskDelivery(context.Background(), task.ID); err != nil {
		t.Fatal(err)
	}
	final, _ := s.repo.Task(task.ID)
	if final.Status != model.TaskStatusSucceeded || final.ResultJSON != string(result) || final.Attempts != saved.Attempts || final.CanvasDeliveryStatus != "applied" || final.CanvasDeliveryError != "" {
		t.Fatal("recovery changed model result or execution", final)
	}
	metadata := creationMaps(canvasTaskDraftDocument(t, restarted)["nodes"])[1]["metadata"].(map[string]any)
	if metadata["status"] != "success" || metadata["content"] != "第一镜：晨光。\n第二镜：人物走入画面。" {
		t.Fatal("original complete text not published", metadata)
	}
}

func TestCanvasTaskDeliverySkipsTargetsDeletedOrReassignedWhileBrowserClosed(t *testing.T) {
	for _, change := range []string{"deleted", "reassigned"} {
		t.Run(change, func(t *testing.T) {
			s, db, task := canvasTaskDraftFixture(t)
			if err := s.createTaskWithinStorageQuota(task, nil, defaultRuntimePolicy()); err != nil {
				t.Fatal(err)
			}
			doc := canvasTaskDraftDocument(t, s)
			nodes := creationMaps(doc["nodes"])
			if change == "deleted" {
				doc["nodes"] = []any{nodes[0]}
				doc["connections"] = []any{}
			} else {
				nodes[1]["metadata"].(map[string]any)["taskId"] = "replacement"
			}
			raw, _ := json.Marshal(doc)
			if err := db.Model(&model.CanvasProject{}).Where("id = ?", task.ProjectID).Update("payload_json", string(raw)).Error; err != nil {
				t.Fatal(err)
			}
			if err := db.Model(task).Update("status", model.TaskStatusCancelled).Error; err != nil {
				t.Fatal(err)
			}
			if err := s.reconcileCanvasTaskDelivery(context.Background(), task.ID); err != nil {
				t.Fatal(err)
			}
			after, _ := json.Marshal(canvasTaskDraftDocument(t, s))
			if string(after) != string(raw) {
				t.Fatal("terminal state revived a deleted or reassigned target")
			}
			saved, _ := s.repo.Task(task.ID)
			if saved.CanvasDeliveryStatus != "skipped" {
				t.Fatal("detachment is not a permanent delivery outcome", saved)
			}
		})
	}
}

func TestCanvasTaskDraftRejectsMissingExistingTargetBeforeAdmission(t *testing.T) {
	s, db, task := canvasTaskDraftFixture(t)
	var input map[string]any
	_ = json.Unmarshal([]byte(task.InputJSON), &input)
	input["metadata"].(map[string]any)["canvasTaskDraft"].(map[string]any)["requireExisting"] = true
	raw, _ := json.Marshal(input)
	task.InputJSON = string(raw)
	if err := s.createTaskWithinStorageQuota(task, nil, defaultRuntimePolicy()); err == nil {
		t.Fatal("stale in-place request recreated deleted node")
	}
	var count int64
	db.Model(&model.Task{}).Where("id = ?", task.ID).Count(&count)
	if count != 0 || len(creationMaps(canvasTaskDraftDocument(t, s)["nodes"])) != 1 {
		t.Fatal("rejected in-place request changed task or canvas")
	}
}
