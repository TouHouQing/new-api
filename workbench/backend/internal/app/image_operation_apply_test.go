package app

import (
	"context"
	"encoding/json"
	"strings"
	"sync"
	"testing"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
)

func seedImageOperationCanvasTask(t *testing.T, s *Service, db *gorm.DB) *model.Task {
	t.Helper()
	resource, _ := seedImageOperationSource(t, s, db)
	now := time.Now().UTC().Format(time.RFC3339Nano)
	payload, err := json.Marshal(map[string]any{"id": "native-image-canvas", "title": "后台图片处理", "createdAt": now, "updatedAt": now, "nodes": []any{map[string]any{"id": "source-node", "type": "image", "title": "原图", "position": map[string]int{"x": 12, "y": 24}, "width": 310, "height": 230, "metadata": map[string]any{"content": resourceFileURL(resource.ID), "storageKey": "resource:" + resource.ID, "naturalWidth": 31, "naturalHeight": 23, "status": "success"}}}, "connections": []any{}, "chatSessions": []any{}, "activeChatId": nil, "viewport": map[string]int{"x": 0, "y": 0, "k": 1}, "directorScenes": []any{}})
	if err != nil {
		t.Fatal(err)
	}
	canvas := model.CanvasProject{ID: "native-image-canvas", UserID: "image-user", Title: "后台图片处理", PayloadJSON: string(payload)}
	if err := s.repo.UpsertCanvasProject(&canvas); err != nil {
		t.Fatal(err)
	}
	req := imageOperationTestRequest(resource.ID)
	req.ProjectID = canvas.ID
	req.SourceNodeID = "source-node"
	task, err := s.CreateImageOperationTask("image-user", req)
	if err != nil {
		t.Fatal(err)
	}
	return runImageOperationTask(t, s, task.ID)
}

func TestImageOperationApplyNativeHistoryIdempotencyAndExplicitReapply(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	verifyImageOperationApply(t, s, db)
}

func TestImageOperationApplyPostgresHistoryIdempotencyAndExplicitReapply(t *testing.T) {
	s, db := newProjectNameConflictPostgresService(t)
	s.dataDir = t.TempDir()
	s.activeCancels = map[string]context.CancelFunc{}
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	verifyImageOperationApply(t, s, db)
}

func verifyImageOperationApply(t *testing.T, s *Service, db *gorm.DB) {
	t.Helper()
	task := seedImageOperationCanvasTask(t, s, db)
	before, err := s.repo.CanvasProjectForUser("image-user", task.ProjectID)
	if err != nil {
		t.Fatal(err)
	}
	req := ImageOperationApplyRequest{RequestID: "native-apply-operation-1"}
	applied, err := s.ApplyImageOperationTask("image-user", task.ID, req)
	if err != nil {
		t.Fatal(err)
	}
	if len(applied.AddedNodeIDs) != 6 || applied.Replayed || applied.Revision <= before.Revision {
		t.Fatalf("apply result: %+v", applied)
	}
	current, err := s.repo.CanvasProjectForUser("image-user", task.ProjectID)
	if err != nil {
		t.Fatal(err)
	}
	var doc struct {
		Nodes       []map[string]any `json:"nodes"`
		Connections []map[string]any `json:"connections"`
	}
	if json.Unmarshal([]byte(current.PayloadJSON), &doc) != nil || len(doc.Nodes) != 7 || len(doc.Connections) != 6 {
		t.Fatal("native apply did not add six nodes and connections")
	}
	meta, _ := doc.Nodes[1]["metadata"].(map[string]any)
	if meta["assetVersionId"] == "" || meta["assetVersionId"] == nil {
		t.Fatal("applied node missing fixed asset version")
	}
	var receipts int64
	db.Model(&model.CanvasMutationReceipt{}).Count(&receipts)
	replayed, err := s.ApplyImageOperationTask("image-user", task.ID, req)
	if err != nil || !replayed.Replayed || replayed.Revision != applied.Revision {
		t.Fatal("lost-response replay changed the action", err)
	}
	var afterReceipts int64
	db.Model(&model.CanvasMutationReceipt{}).Count(&afterReceipts)
	if afterReceipts != receipts {
		t.Fatal("replay duplicated native receipt")
	}
	noop, err := s.ApplyImageOperationTask("image-user", task.ID, ImageOperationApplyRequest{RequestID: "native-apply-operation-2"})
	if err != nil || len(noop.AddedNodeIDs) != 0 || len(noop.ExistingNodeIDs) != 6 || noop.Revision != applied.Revision {
		t.Fatal("new intent duplicated existing results", err)
	}
	// Restore only the fixture's source document, equivalent to an explicit undo.
	restore := *current
	restore.PayloadJSON = before.PayloadJSON
	if err := s.repo.UpsertCanvasProject(&restore); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ApplyImageOperationTask("image-user", task.ID, req); err != nil {
		t.Fatal(err)
	}
	unchanged, err := s.repo.CanvasProjectForUser("image-user", task.ProjectID)
	if err != nil {
		t.Fatal(err)
	}
	if json.Unmarshal([]byte(unchanged.PayloadJSON), &doc) != nil || len(doc.Nodes) != 1 {
		t.Fatal("old receipt overwrote a later undo")
	}
	reapplied, err := s.ApplyImageOperationTask("image-user", task.ID, ImageOperationApplyRequest{RequestID: "native-apply-operation-3"})
	if err != nil || len(reapplied.AddedNodeIDs) != 6 {
		t.Fatal("new explicit intent did not reapply results", err)
	}
	for _, value := range []any{&model.Asset{}, &model.AssetVersion{}, &model.AssetRepresentation{}} {
		var count int64
		db.Model(value).Count(&count)
		if count != 6 {
			t.Fatalf("apply duplicated %T: %d", value, count)
		}
	}
}

func TestImageOperationApplyRefusesChangedSourceAndForeignTask(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	task := seedImageOperationCanvasTask(t, s, db)
	if _, err := s.ApplyImageOperationTask("someone-else", task.ID, ImageOperationApplyRequest{RequestID: "foreign-apply-operation"}); err == nil {
		t.Fatal("foreign task applied")
	}
	project, err := s.repo.CanvasProjectForUser("image-user", task.ProjectID)
	if err != nil {
		t.Fatal(err)
	}
	var doc map[string]any
	if err := json.Unmarshal([]byte(project.PayloadJSON), &doc); err != nil {
		t.Fatal(err)
	}
	nodes := doc["nodes"].([]any)
	node := nodes[0].(map[string]any)
	node["metadata"].(map[string]any)["storageKey"] = "resource:replacement"
	raw, err := json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	project.PayloadJSON = string(raw)
	if err := s.repo.UpsertCanvasProject(project); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ApplyImageOperationTask("image-user", task.ID, ImageOperationApplyRequest{RequestID: "changed-source-operation"}); err == nil {
		t.Fatal("changed source silently adopted old outputs")
	}
	var count int64
	db.Model(&model.CanvasMutationReceipt{}).Count(&count)
	if count != 0 {
		t.Fatal("rejected action left a receipt")
	}
}

func TestImageOperationApplyPostgresMultipleInstancesHaveOneReceiptAndOneGraphDelta(t *testing.T) {
	s, db := newProjectNameConflictPostgresService(t)
	s.dataDir = t.TempDir()
	s.activeCancels = map[string]context.CancelFunc{}
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	task := seedImageOperationCanvasTask(t, s, db)
	var wg sync.WaitGroup
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			instance := &Service{repo: s.repo, dataDir: s.dataDir}
			result, err := instance.ApplyImageOperationTask("image-user", task.ID, ImageOperationApplyRequest{RequestID: "concurrent-native-image-apply"})
			if err != nil {
				t.Error(err)
				return
			}
			if len(result.AddedNodeIDs) != 6 {
				t.Error("concurrent replay did not return the original effect receipt")
			}
		}()
	}
	wg.Wait()
	var count int64
	if err := db.Model(&model.CanvasMutationReceipt{}).Count(&count).Error; err != nil || count != 1 {
		t.Fatal("concurrent action duplicated receipts", count, err)
	}
	project, err := s.repo.CanvasProjectForUser("image-user", task.ProjectID)
	if err != nil {
		t.Fatal(err)
	}
	var doc struct {
		Nodes       []any `json:"nodes"`
		Connections []any `json:"connections"`
	}
	if json.Unmarshal([]byte(project.PayloadJSON), &doc) != nil || len(doc.Nodes) != 7 || len(doc.Connections) != 6 {
		t.Fatal("concurrent action duplicated graph objects")
	}
}

func TestImageOperationApplyUsesNativeCanvasQuotaAndRollsBackReceipt(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	task := seedImageOperationCanvasTask(t, s, db)
	policy := defaultRuntimePolicy()
	policy.Resource.StructuredDataMB = 1
	if _, err := s.UpdateRuntimePolicySetting(&model.User{ID: "quota-admin", Role: model.UserRoleAdmin}, policy); err != nil {
		t.Fatal(err)
	}
	usage, err := s.repo.UserStructuredStorageUsage("image-user")
	if err != nil {
		t.Fatal(err)
	}
	makePayload := func(text string) []byte {
		data, err := json.Marshal(map[string]any{"id": "quota-filler", "kind": "text", "title": "容量测试", "tags": []string{}, "data": map[string]any{"text": text}})
		if err != nil {
			t.Fatal(err)
		}
		return data
	}
	remaining := megabytes(1) - usage.AssetBytes - usage.CanvasBytes - int64(len(makePayload(""))) - 512
	if remaining <= 0 {
		t.Fatal("quota fixture already full")
	}
	filler := model.Asset{ID: "quota-filler", UserID: "image-user", Kind: "text", Category: model.AssetCategoryMaterial, Status: model.AssetVersionStatusConfirmed, Title: "容量测试", PayloadJSON: string(makePayload(strings.Repeat("x", int(remaining))))}
	if err := db.Create(&filler).Error; err != nil {
		t.Fatal(err)
	}
	before, err := s.repo.CanvasProjectForUser("image-user", task.ProjectID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.ApplyImageOperationTask("image-user", task.ID, ImageOperationApplyRequest{RequestID: "quota-blocked-native-image-apply"}); err == nil {
		t.Fatal("native canvas quota was bypassed")
	}
	after, err := s.repo.CanvasProjectForUser("image-user", task.ProjectID)
	if err != nil {
		t.Fatal(err)
	}
	if before.PayloadJSON != after.PayloadJSON || before.Revision != after.Revision {
		t.Fatal("quota failure changed canvas")
	}
	var count int64
	db.Model(&model.CanvasMutationReceipt{}).Count(&count)
	if count != 0 {
		t.Fatal("quota failure committed a receipt")
	}
}
