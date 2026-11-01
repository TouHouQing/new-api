package app

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
)

func TestReferenceShotAdoptionNativeSubsetReplayDeletionAndRollback(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	verifyReferenceShotAdoption(t, s, db)
}
func TestReferenceShotAdoptionPostgresNativeSubsetReplayDeletionAndRollback(t *testing.T) {
	s, db := newProjectNameConflictPostgresService(t)
	s.dataDir = t.TempDir()
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	verifyReferenceShotAdoption(t, s, db)
}

func verifyReferenceShotAdoption(t *testing.T, s *Service, db *gorm.DB) {
	t.Helper()
	if os.Getenv("CANVAS_TEST_REAL_FFMPEG") != "1" {
		t.Skip("explicit installed FFmpeg required")
	}
	seedAnalysisAudio(t, s, db)
	if err := s.EnsureBuiltinProjectWorkflowTemplate(); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(t.TempDir(), "reference.mp4")
	if out, err := exec.Command("ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=160x90:r=8:d=6", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-threads", "1", file).CombinedOutput(); err != nil {
		t.Fatalf("actual source file: %v %s", err, out)
	}
	original, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	resource, _, err := s.storeResource("analysis-user", "video", "reference.mp4", "video/mp4", int64(len(original)), 160, 90, 6000, bytes.NewReader(original), nil, false)
	if err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(original)
	source := production.MediaAnalysisSource{DisplayGeometryVersion: 1, ResourceID: resource.ID, ETag: resource.ETag, SHA256: hex.EncodeToString(digest[:]), Bytes: resource.Size, DurationMs: 6000, StartMs: 0, EndMs: 6000, Width: 160, Height: 90}
	// Hand-authored boundary fixture tests persistence/adoption only; real CPU
	// boundaries and actual restart recovery have their own independent test.
	doc := production.MediaAnalysisEdits{Version: 1, Sections: []production.AnalysisSection{{ID: "section:0", StartMs: 0, EndMs: 2000, Title: "街景", Approved: true}, {ID: "section:1", StartMs: 2000, EndMs: 4000, Title: "人物", Approved: true}, {ID: "section:2", StartMs: 4000, EndMs: 6000, Title: "结束", Approved: true}}}
	encodedSource, _ := json.Marshal(source)
	encodedDoc, _ := json.Marshal(doc)
	now := time.Now()
	row := model.ProjectMediaAnalysis{ID: "reference-adoption-analysis", UserID: "analysis-user", ProjectID: "analysis-project", Kind: "reference_video", SourceKind: "contract_fixture", SourceKey: "reference-adoption-fixture", ResourceID: resource.ID, Title: "参考片", SourceJSON: string(encodedSource), EvidenceJSON: `{"method":"hand-authored-persistence-boundary-fixture"}`, Revision: 1, CurrentRevisionID: "reference-adoption-version", CreatedAt: now, UpdatedAt: now}
	initial := model.ProjectMediaAnalysisRevision{ID: row.CurrentRevisionID, AnalysisID: row.ID, UserID: row.UserID, AuthorID: row.UserID, Version: 1, RequestID: "reference-initial-fixture-1", RequestSHA256: mediaAnalysisDigest(doc), DocumentJSON: string(encodedDoc), CreatedAt: now}
	if _, err := s.repo.CreateProjectMediaAnalysis(&row, &initial); err != nil {
		t.Fatal(err)
	}
	project, err := s.repo.ProjectForUser(row.UserID, row.ProjectID)
	if err != nil {
		t.Fatal(err)
	}
	req := ReferenceShotRequest{RequestID: "reference-adoption-stable-1", AnalysisRevisionID: initial.ID, ExpectedProjectRevision: project.Revision, SectionIDs: []string{"section:0"}, Title: "参考章节"}
	if _, err := s.PreviewReferenceShots("foreign", row.ProjectID, row.ID, req); err == nil {
		t.Fatal("foreign preview allowed")
	}
	preview, err := s.PreviewReferenceShots(row.UserID, row.ProjectID, row.ID, req)
	if err != nil || len(preview.Shots) != 1 || preview.Shots[0].SectionID != "section:0" {
		t.Fatal("subset expanded to other approved sections", err, preview)
	}
	if _, err := s.ApplyReferenceShots(row.UserID, row.ProjectID, row.ID, ReferenceShotApplyRequest{ReferenceShotRequest: req, PreviewToken: "invalid"}); err == nil {
		t.Fatal("adopted without valid preview")
	}
	apply := ReferenceShotApplyRequest{ReferenceShotRequest: req, PreviewToken: preview.PreviewToken}
	result, err := s.ApplyReferenceShots(row.UserID, row.ProjectID, row.ID, apply)
	if err != nil || result.Replayed {
		t.Fatal(err, result)
	}
	shot, err := s.repo.ShotForProject(row.ProjectID, preview.Shots[0].ShotID)
	if err != nil || shot.DurationMs != 2000 || shot.Status != "draft" || shot.CurrentRevisionID != preview.Shots[0].RevisionID {
		t.Fatal("native shot/revision not created", err, shot)
	}
	workflows, err := s.ProjectWorkflows(row.ProjectID)
	if err != nil || len(workflows) != 1 || workflows[0].Instance.UnitID != preview.UnitID {
		t.Fatal("native chapter workflow missing", err, workflows)
	}
	// Later edits survive receipt replay and project CAS no longer matches.
	changedTitle := "后续修改后的镜头"
	if err := db.Model(&model.Shot{}).Where("id = ?", shot.ID).Update("title", changedTitle).Error; err != nil {
		t.Fatal(err)
	}
	replay, err := s.ApplyReferenceShots(row.UserID, row.ProjectID, row.ID, apply)
	if err != nil || !replay.Replayed {
		t.Fatal("lost-response replay unavailable", err)
	}
	current, _ := s.repo.ShotForProject(row.ProjectID, shot.ID)
	if current.Title != changedTitle {
		t.Fatal("replay overwrote later shot edit")
	}
	read, err := s.ReadReferenceShotAdoption(row.UserID, row.ProjectID, req.RequestID)
	if err != nil || read.Plan.SourceSHA256 != source.SHA256 || read.Plan.Shots[0].StartMs != 0 {
		t.Fatal("native receipt source missing", err, read)
	}
	changed := apply
	changed.Title = "不同创建意图"
	if _, err := s.ApplyReferenceShots(row.UserID, row.ProjectID, row.ID, changed); err == nil {
		t.Fatal("reused request with different body accepted")
	}
	if _, err := s.ReadReferenceShotAdoption("foreign", row.ProjectID, req.RequestID); err == nil {
		t.Fatal("foreign receipt read allowed")
	}
	stale := req
	stale.RequestID = "reference-stale-project-1"
	if _, err := s.PreviewReferenceShots(row.UserID, row.ProjectID, row.ID, stale); err == nil {
		t.Fatal("stale project plan accepted")
	}
	if err := s.repo.DeleteProjectUnit(row.ProjectID, preview.UnitID); err != nil {
		t.Fatal(err)
	}
	_, err = s.ApplyReferenceShots(row.UserID, row.ProjectID, row.ID, apply)
	var failure *AppError
	if !errors.As(err, &failure) || failure.Status != 410 {
		t.Fatal("deleted chapter recreated by old request", err)
	}
	tombstone, err := s.ReadReferenceShotAdoption(row.UserID, row.ProjectID, req.RequestID)
	if err != nil || !tombstone.UnitDeleted {
		t.Fatal("deleted state not readable", err, tombstone)
	}
	project, _ = s.repo.ProjectForUser(row.UserID, row.ProjectID)
	fresh := req
	fresh.RequestID = "reference-rollback-intent-1"
	fresh.ExpectedProjectRevision = project.Revision
	newPlan, err := s.PreviewReferenceShots(row.UserID, row.ProjectID, row.ID, fresh)
	if err != nil {
		t.Fatal(err)
	}
	// Failure after unit/shot inserts must roll back every native object.
	if err := db.Where("template_key = ?", builtinShortDramaWorkflowKey).Delete(&model.WorkflowTemplateVersion{}).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := s.ApplyReferenceShots(row.UserID, row.ProjectID, row.ID, ReferenceShotApplyRequest{ReferenceShotRequest: fresh, PreviewToken: newPlan.PreviewToken}); err == nil {
		t.Fatal("missing workflow template did not abort adoption")
	}
	var units, shots, receipts int64
	db.Model(&model.ProjectUnit{}).Count(&units)
	db.Model(&model.Shot{}).Count(&shots)
	db.Model(&model.ProjectReferenceAdoption{}).Count(&receipts)
	if units != 0 || shots != 0 || receipts != 1 {
		t.Fatal("partial native adoption escaped transaction", units, shots, receipts)
	}
	var tasks int64
	db.Model(&model.Task{}).Count(&tasks)
	if tasks != 0 {
		t.Fatal("reference adoption started model task")
	}
}
