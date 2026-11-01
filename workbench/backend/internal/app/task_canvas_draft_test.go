// SPDX-License-Identifier: AGPL-3.0-or-later
package app

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/protocol"
)

func canvasTaskDraftFixture(t *testing.T) (*Service, *gorm.DB, *model.Task) {
	t.Helper()
	s, db, _, _ := creationTestService(t)
	if err := db.Create(&model.Resource{ID: "original", UserID: "user", Kind: "audio", Status: "ready", MimeType: "audio/wav", Size: 400, DurationMs: 4000}).Error; err != nil {
		t.Fatal(err)
	}
	source := map[string]any{"id": "original", "type": "audio", "title": "原录音", "position": map[string]any{"x": 0., "y": 0.}, "width": 300., "height": 100., "metadata": map[string]any{"content": "/api/resources/original/file", "storageKey": "resource:original", "status": "success"}}
	doc, _ := json.Marshal(map[string]any{"nodes": []any{source}, "connections": []any{}})
	if err := db.Create(&model.CanvasProject{ID: "draft-canvas", UserID: "user", PayloadJSON: string(doc)}).Error; err != nil {
		t.Fatal(err)
	}
	draft := map[string]any{"node": map[string]any{"id": "separation-root", "type": "audio", "title": "分离声音", "position": map[string]any{"x": 500., "y": 0.}, "width": 300., "height": 100., "metadata": map[string]any{"status": "loading"}}, "connections": []any{map[string]any{"id": "source-to-root", "fromNodeId": "original", "toNodeId": "separation-root"}}}
	input, _ := json.Marshal(map[string]any{"mode": "audio", "metadata": map[string]any{"nodeId": "separation-root", "clientOperationId": "separate-once", "canvasTaskDraft": draft}})
	task := &model.Task{ID: "durable-separation", UserID: "user", ProjectID: "draft-canvas", Type: "canvas_audio", Status: model.TaskStatusQueued, InputJSON: string(input), CreatedAt: time.Now()}
	return s, db, task
}

func canvasTaskDraftDocument(t *testing.T, s *Service) map[string]any {
	t.Helper()
	project, err := s.repo.CanvasProjectForUser("user", "draft-canvas")
	if err != nil {
		t.Fatal(err)
	}
	doc, err := creationDocument(project.PayloadJSON)
	if err != nil {
		t.Fatal(err)
	}
	return doc
}

func TestCanvasTaskDraftPersistsTargetAndTaskInOneAdmission(t *testing.T) {
	s, _, task := canvasTaskDraftFixture(t)
	if err := s.createTaskWithinStorageQuota(task, nil, defaultRuntimePolicy()); err != nil {
		t.Fatal(err)
	}
	doc := canvasTaskDraftDocument(t, s)
	nodes := creationMaps(doc["nodes"])
	if len(nodes) != 2 || len(creationMaps(doc["connections"])) != 1 || nodes[1]["metadata"].(map[string]any)["taskId"] != task.ID {
		t.Fatal("acknowledged task has no durable canvas target", doc)
	}
	saved, err := s.repo.Task(task.ID)
	if err != nil || saved.Status != model.TaskStatusQueued {
		t.Fatal("target exists without original native task", saved, err)
	}
}

func TestCanvasTaskDraftAdmissionFailureRollsBackCanvasAndTask(t *testing.T) {
	for _, failure := range []string{"active-limit", "foreign-owner", "missing-source", "invalid-draft"} {
		t.Run(failure, func(t *testing.T) {
			s, db, task := canvasTaskDraftFixture(t)
			policy := defaultRuntimePolicy()
			switch failure {
			case "active-limit":
				policy.Task.ActiveTaskLimit = 1
				if err := db.Create(&model.Task{ID: "already-running", UserID: "user", Status: model.TaskStatusRunning}).Error; err != nil {
					t.Fatal(err)
				}
			case "foreign-owner":
				task.UserID = "other"
			case "missing-source":
				var input map[string]any
				_ = json.Unmarshal([]byte(task.InputJSON), &input)
				metadata := input["metadata"].(map[string]any)
				metadata["canvasTaskDraft"].(map[string]any)["connections"].([]any)[0].(map[string]any)["fromNodeId"] = "deleted"
				raw, _ := json.Marshal(input)
				task.InputJSON = string(raw)
			case "invalid-draft":
				task.InputJSON = `{"mode":"audio","metadata":{"nodeId":"separation-root","canvasTaskDraft":null}}`
			}
			before, _ := json.Marshal(canvasTaskDraftDocument(t, s))
			if err := s.createTaskWithinStorageQuota(task, nil, policy); err == nil {
				t.Fatal("invalid admission accepted")
			}
			after, _ := json.Marshal(canvasTaskDraftDocument(t, s))
			if string(before) != string(after) {
				t.Fatal("rejected task changed the canvas")
			}
			var count int64
			db.Model(&model.Task{}).Where("id = ?", task.ID).Count(&count)
			if count != 0 {
				t.Fatal("rejected draft left an executable task")
			}
		})
	}
}

func canvasTaskDraftComplete(t *testing.T, s *Service, db *gorm.DB, task *model.Task) {
	t.Helper()
	task.Status = model.TaskStatusRunning
	if err := db.Model(task).Update("status", task.Status).Error; err != nil {
		t.Fatal(err)
	}
	checkpoint := mediaCheckpoint{Mode: "audio", StartedAt: time.Now()}
	outputs := []any{}
	for i, role := range []string{"vocals", "instrumental", "drums", "bass", "other"} {
		id := fmt.Sprintf("track-%d", i)
		if err := db.Create(&model.Resource{ID: id, UserID: task.UserID, Kind: "audio", Status: "ready", MimeType: "audio/wav", Size: 400, DurationMs: 4000}).Error; err != nil {
			t.Fatal(err)
		}
		checkpoint.Items = append(checkpoint.Items, mediaCheckpointItem{ResourceID: id, MIMEType: "audio/wav", Reference: protocol.MediaReference{Name: role, Role: role}})
		outputs = append(outputs, map[string]any{"storageKey": "resource:" + id, "name": role, "role": role})
	}
	encoded, err := json.Marshal(checkpoint)
	if err != nil {
		t.Fatal(err)
	}
	task.MediaRecoveryJSON, err = s.encryptSettingSecret(string(encoded))
	if err != nil {
		t.Fatal(err)
	}
	if err = db.Model(task).Update("media_recovery_json", task.MediaRecoveryJSON).Error; err != nil {
		t.Fatal(err)
	}
	result, _ := json.Marshal(map[string]any{"audio": outputs[0], "audios": outputs})
	if err = s.saveTaskCompletionWithinStorageQuota(task, result, nil, false); err != nil {
		t.Fatal(err)
	}
}

func TestCanvasTaskDraftCompletesEveryTrackWithoutBrowserAndPreservesLaterEdits(t *testing.T) {
	s, db, task := canvasTaskDraftFixture(t)
	if err := s.createTaskWithinStorageQuota(task, nil, defaultRuntimePolicy()); err != nil {
		t.Fatal(err)
	}
	canvasTaskDraftComplete(t, s, db, task)
	// Read from persistence without invoking any browser materialization consumer.
	doc := canvasTaskDraftDocument(t, s)
	nodes := creationMaps(doc["nodes"])
	if task.Status != model.TaskStatusSucceeded || len(nodes) != 6 {
		t.Fatal("native completion lost outputs", task.Status, doc)
	}
	for i, node := range nodes[1:] {
		meta := node["metadata"].(map[string]any)
		if meta["taskId"] != task.ID || meta["status"] != "success" || meta["storageKey"] != fmt.Sprintf("resource:track-%d", i) || meta["assetId"] != generationMediaAssetID(task.ID, i) {
			t.Fatal("track is not bound to its owned asset", node)
		}
	}
	nodes[1]["title"] = "用户保留的人声"
	nodes[1]["position"] = map[string]any{"x": 900., "y": 700.}
	kept := make([]any, 0, len(nodes)-1)
	for i, node := range nodes {
		if i != 3 {
			kept = append(kept, node)
		}
	}
	doc["nodes"] = kept
	raw, _ := json.Marshal(doc)
	if err := db.Model(&model.CanvasProject{}).Where("id = ?", task.ProjectID).Update("payload_json", string(raw)).Error; err != nil {
		t.Fatal(err)
	}
	if err := publishCanvasTaskDraft(s.repo, *task, defaultRuntimePolicy()); err != nil {
		t.Fatal(err)
	}
	reopened := creationMaps(canvasTaskDraftDocument(t, s)["nodes"])
	if len(reopened) != 5 || reopened[1]["title"] != "用户保留的人声" || reopened[1]["position"].(map[string]any)["y"] != 700. {
		t.Fatal("replaying original result resurrected deletion or overwrote user edits", reopened)
	}
}

func TestCanvasTaskDraftCompletionPreservesDeletedOrReassignedTarget(t *testing.T) {
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
				nodes[1]["metadata"].(map[string]any)["taskId"] = "another-task"
			}
			raw, _ := json.Marshal(doc)
			if err := db.Model(&model.CanvasProject{}).Where("id = ?", task.ProjectID).Update("payload_json", string(raw)).Error; err != nil {
				t.Fatal(err)
			}
			canvasTaskDraftComplete(t, s, db, task)
			after, _ := json.Marshal(canvasTaskDraftDocument(t, s))
			if string(raw) != string(after) {
				t.Fatal("late completion changed deleted or reassigned target")
			}
			var count int64
			db.Model(&model.Asset{}).Where("user_id = ?", task.UserID).Count(&count)
			if count != 5 {
				t.Fatal("original output assets were lost", count)
			}
		})
	}
}

func TestCanvasTaskDraftMarkerOnlyAppliesToExactMetadataMember(t *testing.T) {
	if hasCanvasTaskDraft(model.Task{InputJSON: `{"mode":"text","prompt":"canvasTaskDraft","metadata":{"other":"canvasTaskDraft"}}`}) {
		t.Fatal("prompt text activated draft persistence")
	}
	if !hasCanvasTaskDraft(model.Task{InputJSON: `{"metadata":{"canvasTaskDraft":null}}`}) {
		t.Fatal("invalid explicit draft must be validated, not silently ignored")
	}
}
