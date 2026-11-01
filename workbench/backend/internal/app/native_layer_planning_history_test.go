package app

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"yingce/backend/internal/database"
	"yingce/backend/internal/imageops"
	"yingce/backend/internal/model"
)

func TestNativeLayerPlanningHistoryIgnoresUnrelatedNewestTasksAndPagesStableTies(t *testing.T) {
	s, input := nativeLayerPlanningFixture(t)
	verifyNativeLayerPlanningHistory(t, s, input)
}

func TestNativeLayerPlanningHistoryPostgresUsesSameOwnedSourceAndCursor(t *testing.T) {
	s, db := newProjectNameConflictPostgresService(t)
	s.dataDir = t.TempDir()
	s.activeCancels = map[string]context.CancelFunc{}
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	resource, data := seedImageOperationSource(t, s, db)
	source, err := imageops.Inspect(data)
	if err != nil {
		t.Fatal(err)
	}
	payload, _ := json.Marshal(map[string]any{"nodes": []any{map[string]any{"id": "original-node", "type": "image", "metadata": map[string]any{"storageKey": "resource:" + resource.ID}}}})
	if err := s.repo.Create(&model.CanvasProject{ID: "native-edit-canvas", UserID: "image-user", PayloadJSON: string(payload)}); err != nil {
		t.Fatal(err)
	}
	input := map[string]any{"mode": "text", "metadata": map[string]any{"nativeLayerPlanning": map[string]any{"version": 1, "sourceNodeId": "original-node", "resourceId": resource.ID, "expectedSourceSha256": source.SHA256, "instructions": "提取完整素材", "purpose": "materials", "input": "preview"}}}
	verifyNativeLayerPlanningHistory(t, s, input)
}

func verifyNativeLayerPlanningHistory(t *testing.T, s *Service, input map[string]any) {
	t.Helper()
	if err := s.prepareNativeLayerPlanning("image-user", "native-edit-canvas", input); err != nil {
		t.Fatal(err)
	}
	plan, err := decodeNativeLayerPlanning(input["metadata"].(map[string]any)["nativeLayerPlanning"])
	if err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(input)
	created := time.Date(2026, 10, 29, 0, 0, 0, 0, time.UTC)
	for _, id := range []string{"saved-plan-a", "saved-plan-b", "saved-plan-c"} {
		result, _ := json.Marshal(map[string]any{"imageLayerPlanning": map[string]any{"taskId": id, "status": "needs_correction", "reason": "原回复需要人工核对"}})
		if err := s.repo.Create(&model.Task{ID: id, UserID: "image-user", ProjectID: "native-edit-canvas", Type: "canvas_text", Status: model.TaskStatusSucceeded, CreatedAt: created, InputJSON: string(encoded), ResultJSON: string(result)}); err != nil {
			t.Fatal(err)
		}
	}
	other := make([]model.Task, 75)
	for i := range other {
		other[i] = model.Task{ID: newID(), UserID: "image-user", ProjectID: "native-edit-canvas", Type: "canvas_text", Status: model.TaskStatusSucceeded, CreatedAt: created.Add(time.Hour), InputJSON: `{"metadata":{"edit":"notes","sourceNodeId":"original-node"}}`}
	}
	if err := s.repo.Create(&other); err != nil {
		t.Fatal(err)
	}
	cursor := ""
	for _, expected := range []string{"saved-plan-c", "saved-plan-b", "saved-plan-a"} {
		page, err := s.ReadImageLayerPlanningHistory("image-user", "native-edit-canvas", "original-node", plan.ResourceID, cursor, 1)
		if err != nil || len(page.Entries) != 1 || page.Entries[0].TaskID != expected || page.Entries[0].Legacy || page.Source != plan.Source {
			t.Fatalf("source-bound planning pagination: %v %+v", err, page)
		}
		if expected != "saved-plan-a" && page.NextCursor == "" || expected == "saved-plan-a" && page.NextCursor != "" {
			t.Fatal("unstable history boundary")
		}
		cursor = page.NextCursor
	}
	if _, err := s.ReadImageLayerPlanningHistory("foreign-user", "native-edit-canvas", "original-node", plan.ResourceID, "", 20); err == nil {
		t.Fatal("foreign planning history exposed")
	}
	if _, err := s.ReadImageLayerPlanningHistory("image-user", "native-edit-canvas", "original-node", plan.ResourceID, "not-a-valid-cursor", 20); err == nil {
		t.Fatal("invalid source cursor accepted")
	}
	if _, err := s.ReadImageLayerPlanningHistory("image-user", "native-edit-canvas", "original-node", plan.ResourceID, "", 51); err == nil {
		t.Fatal("unbounded planning page admitted")
	}
}
