package app

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"gorm.io/gorm"
	"io"
	"testing"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
)

func legacyPrevisArchive(t *testing.T) []byte {
	t.Helper()
	original, _ := legacyImportArchive(t)
	reader, err := zip.NewReader(bytes.NewReader(original), int64(len(original)))
	if err != nil {
		t.Fatal(err)
	}
	var buffer bytes.Buffer
	writer := zip.NewWriter(&buffer)
	for _, entry := range reader.File {
		in, err := entry.Open()
		if err != nil {
			t.Fatal(err)
		}
		body, err := io.ReadAll(in)
		in.Close()
		if err != nil {
			t.Fatal(err)
		}
		if entry.Name == "project.json" {
			var manifest map[string]any
			if json.Unmarshal(body, &manifest) != nil {
				t.Fatal("manifest")
			}
			project := manifest["project"].(map[string]any)
			project["production"].(map[string]any)["previs"] = map[string]any{"duration": 2, "actors": []any{map[string]any{"id": "actor", "title": "跟随角色", "x": 0, "z": 0, "endX": 2, "endZ": 0, "pose": "point"}}, "props": []any{}, "advanced": map[string]any{"followId": "actor"}}
			body, err = json.Marshal(manifest)
			if err != nil {
				t.Fatal(err)
			}
		}
		out, err := writer.Create(entry.Name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = out.Write(body); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}

func TestLegacyNativePrevisAtomicCanvasUpgradeAndConcurrentEdit(t *testing.T) {
	s, db := legacyImportService(t)
	verifyLegacyPrevisAtomic(t, s, db)
}

func TestLegacyNativePrevisPostgresAtomicCanvasUpgradeAndConcurrentEdit(t *testing.T) {
	base, db := newProjectNameConflictPostgresService(t)
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	connection, _ := db.DB()
	t.Cleanup(func() { connection.Close() })
	s := New(base.repo, t.TempDir())
	t.Cleanup(func() { s.Close() })
	for _, id := range []string{"owner", "other"} {
		if err := db.Create(&model.User{ID: id, Username: id, Email: id + "@example.invalid", Status: model.UserStatusActive, Role: model.UserRoleUser}).Error; err != nil {
			t.Fatal(err)
		}
	}
	verifyLegacyPrevisAtomic(t, s, db)
}

func verifyLegacyPrevisAtomic(t *testing.T, s *Service, db *gorm.DB) {
	t.Helper()
	ctx := context.Background()
	archive := legacyPrevisArchive(t)
	inspection, err := s.InspectLegacyProject("owner", bytes.NewReader(archive), int64(len(archive)))
	if err != nil {
		t.Fatal(err)
	}
	first, err := s.ImportLegacyProject(ctx, "owner", bytes.NewReader(archive), int64(len(archive)), inspection.SourceFingerprint, "预演转换测试")
	if err != nil {
		t.Fatal(err)
	}
	if first.Report.Previs == nil || first.Receipt.ContractVersion != production.LegacyNativeProjectionVersion {
		t.Fatal("initial import missing native scene")
	}
	pid := first.Receipt.ProjectID
	canvas, err := s.repo.CanvasProjectForUser("owner", first.Receipt.CanvasID)
	if err != nil {
		t.Fatal(err)
	}
	var initialPayload map[string]any
	if json.Unmarshal([]byte(canvas.PayloadJSON), &initialPayload) != nil {
		t.Fatal("native canvas JSON")
	}
	for _, scene := range creationMaps(initialPayload["previsScenes"]) {
		if err := cloudAgentPrevisValidateScene(scene); err != nil {
			t.Fatal("migrated scene cannot be edited by native Agent", err)
		}
	}
	// Disposable predecessor fixture: only its scene/entry/current cut are
	// removed, representing an accepted v9 import before native 3D conversion.
	var payload map[string]any
	json.Unmarshal([]byte(canvas.PayloadJSON), &payload)
	payload["previsScenes"] = []any{}
	nodes := []any{}
	for _, raw := range payload["nodes"].([]any) {
		if raw.(map[string]any)["id"] != first.Report.Previs.NodeID {
			nodes = append(nodes, raw)
		}
	}
	payload["nodes"] = nodes
	encoded, _ := json.Marshal(payload)
	canvas.PayloadJSON = string(encoded)
	if err := s.repo.UpsertCanvasProject(canvas); err != nil {
		t.Fatal(err)
	}
	if err := db.Where("project_id = ?", pid).Delete(&model.ProjectCut{}).Error; err != nil {
		t.Fatal(err)
	}
	oldReport := first.Report
	oldReport.Previs = nil
	reportJSON, _ := json.Marshal(oldReport)
	if err := db.Model(&model.ProductionImport{}).Where("id = ?", first.Receipt.ID).Updates(map[string]any{"contract_version": 9, "report_json": string(reportJSON)}).Error; err != nil {
		t.Fatal(err)
	}
	original, err := s.repo.ProductionImportForProject("owner", pid)
	if err != nil {
		t.Fatal(err)
	}
	receiptBefore, _ := json.Marshal(original)
	project, err := s.repo.ProjectForUser("owner", pid)
	if err != nil {
		t.Fatal(err)
	}
	timeline, err := s.GetProjectTimeline("owner", pid)
	if err != nil {
		t.Fatal(err)
	}
	storedTimelineBefore, err := s.repo.ProjectTimeline("owner", pid)
	if err != nil {
		t.Fatal(err)
	}
	timelineBefore, _ := json.Marshal(storedTimelineBefore)
	req := LegacyNativeRequest{ExpectedProjectRevision: project.Revision, ExpectedTimelineRevision: timeline.Revision}
	if _, err := s.PreviewLegacyNative(ctx, "other", pid, req); err == nil {
		t.Fatal("foreign preview allowed")
	}
	plan, err := s.PreviewLegacyNative(ctx, "owner", pid, req)
	if err != nil || plan.Report.Previs == nil {
		t.Fatal("preview", err)
	}
	req.PreviewToken = plan.PreviewToken
	canvas, err = s.repo.CanvasProjectForUser("owner", canvas.ID)
	if err != nil {
		t.Fatal(err)
	}
	json.Unmarshal([]byte(canvas.PayloadJSON), &payload)
	payload["backgroundMode"] = "human-edit-after-preview"
	encoded, _ = json.Marshal(payload)
	canvas.PayloadJSON = string(encoded)
	if err := s.repo.UpsertCanvasProject(canvas); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ApplyLegacyNative(ctx, "owner", pid, req); err == nil {
		t.Fatal("stale canvas confirmation accepted")
	}
	plan, err = s.PreviewLegacyNative(ctx, "owner", pid, req)
	if err != nil {
		t.Fatal(err)
	}
	req.PreviewToken = plan.PreviewToken
	before, err := s.repo.CanvasProjectForUser("owner", canvas.ID)
	if err != nil {
		t.Fatal(err)
	}
	callback := "test_legacy_previs_rollback"
	wroteCanvas := false
	if err := db.Callback().Update().After("gorm:update").Register(callback, func(tx *gorm.DB) {
		values, ok := tx.Statement.Dest.(map[string]any)
		_, hasPayload := values["payload_json"]
		if tx.Statement.Table == "canvas_projects" && ok && hasPayload {
			wroteCanvas = true
			tx.AddError(errors.New("injected canvas write failure"))
		}
	}); err != nil {
		t.Fatal(err)
	}
	_, applyErr := s.ApplyLegacyNative(ctx, "owner", pid, req)
	db.Callback().Update().Remove(callback)
	if applyErr == nil || !wroteCanvas {
		t.Fatal("write fault accepted")
	}
	afterFault, err := s.repo.CanvasProjectForUser("owner", canvas.ID)
	if err != nil || !reflectCanvasEqual(before, afterFault) {
		t.Fatal("failed transaction changed canvas", err)
	}
	var cuts int64
	db.Model(&model.ProjectCut{}).Where("project_id = ?", pid).Count(&cuts)
	if cuts != 0 {
		t.Fatal("failed transaction left cut receipt")
	}
	result, err := s.ApplyLegacyNative(ctx, "owner", pid, req)
	if err != nil {
		t.Fatal("confirm", err)
	}
	if replay, err := s.ApplyLegacyNative(ctx, "owner", pid, req); err != nil || replay.Cut.ID != result.Cut.ID {
		t.Fatal("confirmation replay", err)
	}
	final, err := s.repo.CanvasProjectForUser("owner", canvas.ID)
	if err != nil {
		t.Fatal(err)
	}
	json.Unmarshal([]byte(final.PayloadJSON), &payload)
	if final.Revision != before.Revision+1 || len(payload["previsScenes"].([]any)) != 1 || payload["backgroundMode"] != "human-edit-after-preview" {
		t.Fatal("canvas content or revision lost")
	}
	var snapshot model.CanvasSnapshot
	if err := db.Where("canvas_id = ? AND revision = ? AND reason = ?", canvas.ID, before.Revision, "before_legacy_previs").First(&snapshot).Error; err != nil {
		t.Fatal("conversion recovery history missing", err)
	}
	var snapshotPayload map[string]any
	if json.Unmarshal([]byte(snapshot.PayloadJSON), &snapshotPayload) != nil || snapshotPayload["backgroundMode"] != "human-edit-after-preview" || len(snapshotPayload["previsScenes"].([]any)) != 0 {
		t.Fatal("conversion recovery did not preserve preimage")
	}
	finalReceipt, _ := s.repo.ProductionImportForProject("owner", pid)
	receiptAfter, _ := json.Marshal(finalReceipt)
	if !bytes.Equal(receiptBefore, receiptAfter) {
		t.Fatal("immutable source receipt changed")
	}
	finalTimeline, _ := s.repo.ProjectTimeline("owner", pid)
	timelineAfter, _ := json.Marshal(finalTimeline)
	if !bytes.Equal(timelineBefore, timelineAfter) {
		t.Fatal("working timeline changed")
	}
	var tasks int64
	db.Model(&model.Task{}).Where("user_id = ?", "owner").Count(&tasks)
	if tasks != 0 {
		t.Fatal("conversion generated a model task")
	}
}

func reflectCanvasEqual(a, b *model.CanvasProject) bool {
	return a != nil && b != nil && a.ID == b.ID && a.Revision == b.Revision && a.PayloadJSON == b.PayloadJSON
}
