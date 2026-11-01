package app

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"gorm.io/gorm"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
)

func TestProjectCutVersionsImmutableApplyRecoveryAndRollback(t *testing.T) {
	s, db := legacyImportService(t)
	verifyProjectCuts(t, s, db)
}
func TestProjectCutVersionsPostgresImmutableApplyRecoveryAndRollback(t *testing.T) {
	base, db := newProjectNameConflictPostgresService(t)
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	connection, _ := db.DB()
	t.Cleanup(func() { connection.Close() })
	s := New(base.repo, t.TempDir())
	t.Cleanup(func() { _ = s.Close() })
	for _, id := range []string{"owner", "other"} {
		if err := db.Create(&model.User{ID: id, Username: id, Email: id + "@example.invalid", Status: model.UserStatusActive, Role: model.UserRoleUser}).Error; err != nil {
			t.Fatal(err)
		}
	}
	verifyProjectCuts(t, s, db)
}
func verifyProjectCuts(t *testing.T, s *Service, db *gorm.DB) {
	t.Helper()
	if err := db.Create(&model.Project{ID: "cut-project", UserID: "owner", Name: "剪辑版本", Revision: 1, Status: model.ProjectStatusActive}).Error; err != nil {
		t.Fatal(err)
	}
	// Contract fixtures exercise persistence/permissions. The release trial
	// separately uploads, plays and renders actual audio/video bytes.
	for _, resource := range []model.Resource{{ID: "cut-first", UserID: "owner", Kind: "image", MimeType: "image/png", Status: model.ResourceStatusReady}, {ID: "cut-second", UserID: "owner", Kind: "image", MimeType: "image/png", Status: model.ResourceStatusReady}, {ID: "foreign-media", UserID: "other", Kind: "image", Status: model.ResourceStatusReady}} {
		if err := db.Create(&resource).Error; err != nil {
			t.Fatal(err)
		}
	}
	makeTimeline := func(resource, title string) json.RawMessage {
		raw, _ := json.Marshal(map[string]any{"version": 2, "tracks": []any{map[string]any{"id": "v", "kind": "video"}, map[string]any{"id": "s", "kind": "subtitle"}}, "clips": []any{map[string]any{"id": "picture", "kind": "image", "nodeId": "picture", "trackId": "v", "startMs": 0, "durationMs": 2000, "directMedia": map[string]any{"id": resource, "kind": "image", "storageKey": "resource:" + resource}}, map[string]any{"id": "subtitle", "kind": "subtitle", "nodeId": "subtitle", "trackId": "s", "startMs": 200, "durationMs": 1600, "text": title}}, "durationMs": 2000})
		return raw
	}
	current, err := s.SaveProjectTimeline("owner", "cut-project", SaveProjectTimelineRequest{Timeline: makeTimeline("cut-first", "第一版字幕")})
	if err != nil {
		t.Fatal(err)
	}
	req := ProjectCutCreateRequest{RequestID: "cut-save-stable-request-1", ExpectedRevision: current.Revision, Title: "固定母版", Kind: "master", AspectRatio: "16:9"}
	first, err := s.CreateProjectCut("owner", "cut-project", req)
	if err != nil || first.Replayed {
		t.Fatal("create", err, first)
	}
	if first.Cut.TimelineSHA256 != cutSummary(first.Timeline).SHA256 || !strings.Contains(string(first.Timeline), "第一版字幕") {
		t.Fatal("snapshot lost immutable subtitle/media")
	}
	if _, err := s.CreateProjectCut("other", "cut-project", req); err == nil {
		t.Fatal("foreign create allowed")
	}
	current, err = s.SaveProjectTimeline("owner", "cut-project", SaveProjectTimelineRequest{ExpectedRevision: current.Revision, Timeline: makeTimeline("cut-second", "继续编辑")})
	if err != nil {
		t.Fatal(err)
	}
	replay, err := s.CreateProjectCut("owner", "cut-project", req)
	if err != nil || !replay.Replayed || string(replay.Timeline) != string(first.Timeline) {
		t.Fatal("unknown create reply changed snapshot", err)
	}
	changed := req
	changed.Title = "不同意图"
	if _, err := s.CreateProjectCut("owner", "cut-project", changed); err == nil {
		t.Fatal("same key changed intent accepted")
	}
	foreign := req
	foreign.RequestID = "cut-save-foreign-media-1"
	foreign.ExpectedRevision = current.Revision
	foreign.Timeline = makeTimeline("foreign-media", "越权")
	if _, err := s.CreateProjectCut("owner", "cut-project", foreign); err == nil {
		t.Fatal("foreign media snapshot accepted")
	}
	apply := ProjectCutApplyRequest{RequestID: "cut-apply-stable-request-1", ExpectedRevision: current.Revision, TimelineSHA256: first.Cut.TimelineSHA256}
	plan, err := s.PreviewProjectCutApply("owner", "cut-project", first.Cut.ID, apply)
	if err != nil || plan.Before.Clips != 2 || plan.After.DurationMs != 2000 {
		t.Fatal("preview", err, plan)
	}
	if _, err := s.ApplyProjectCut("owner", "cut-project", first.Cut.ID, apply); err == nil {
		t.Fatal("applied without explicit preview token")
	}
	apply.PreviewToken = plan.PreviewToken
	result, err := s.ApplyProjectCut("owner", "cut-project", first.Cut.ID, apply)
	if err != nil || result.Replayed || result.AppliedRevision != 3 {
		t.Fatal("apply", err, result)
	}
	backup, err := s.GetProjectCut("owner", "cut-project", result.Plan.BackupCutID)
	if err != nil || !strings.Contains(string(backup.Timeline), "继续编辑") {
		t.Fatal("before-apply recovery lost", err)
	}
	after, err := s.GetProjectTimeline("owner", "cut-project")
	if err != nil || string(after.Timeline) != string(first.Timeline) {
		t.Fatal("native timeline not loaded", err)
	}
	after, err = s.SaveProjectTimeline("owner", "cut-project", SaveProjectTimelineRequest{ExpectedRevision: after.Revision, Timeline: makeTimeline("cut-second", "应用后继续编辑")})
	if err != nil {
		t.Fatal(err)
	}
	recovered, err := s.ApplyProjectCut("owner", "cut-project", first.Cut.ID, apply)
	if err != nil || !recovered.Replayed || recovered.AppliedRevision != 3 {
		t.Fatal("unknown apply response not recovered", err)
	}
	unchanged, _ := s.GetProjectTimeline("owner", "cut-project")
	if string(unchanged.Timeline) != string(after.Timeline) || unchanged.Revision != after.Revision {
		t.Fatal("receipt replay overwrote later edits")
	}
	apply.ExpectedRevision = after.Revision
	if _, err := s.ApplyProjectCut("owner", "cut-project", first.Cut.ID, apply); err == nil {
		t.Fatal("changed apply intent accepted")
	}
	for _, read := range []func() error{func() error { _, err := s.GetProjectCut("other", "cut-project", first.Cut.ID); return err }, func() error { _, err := s.ReadProjectCutRequest("other", "cut-project", req.RequestID); return err }, func() error { _, err := s.ReadProjectCutApply("other", "cut-project", apply.RequestID); return err }, func() error { _, err := s.ListProjectCuts("other", "cut-project", "", false, true, 20); return err }, func() error {
		_, err := s.SetProjectCutArchived("other", "cut-project", first.Cut.ID, false, true)
		return err
	}, func() error {
		_, err := s.PreviewProjectCutApply("other", "cut-project", first.Cut.ID, apply)
		return err
	}} {
		if read() == nil {
			t.Fatal("foreign cut operation accepted")
		}
	}
	apply.RequestID = "cut-apply-rollback-request"
	apply.PreviewToken = ""
	plan, err = s.PreviewProjectCutApply("owner", "cut-project", first.Cut.ID, apply)
	if err != nil {
		t.Fatal(err)
	}
	apply.PreviewToken = plan.PreviewToken
	callback := "cut-receipt-rollback"
	if err := db.Callback().Create().Before("gorm:create").Register(callback, func(tx *gorm.DB) {
		if _, ok := tx.Statement.Dest.(*model.ProjectCutApplyReceipt); ok {
			tx.AddError(errors.New("intentional receipt persistence failure"))
		}
	}); err != nil {
		t.Fatal(err)
	}
	_, failure := s.ApplyProjectCut("owner", "cut-project", first.Cut.ID, apply)
	db.Callback().Create().Remove(callback)
	if failure == nil {
		t.Fatal("injected receipt write did not fail")
	}
	unchanged, _ = s.GetProjectTimeline("owner", "cut-project")
	if string(unchanged.Timeline) != string(after.Timeline) || unchanged.Revision != after.Revision {
		t.Fatal("failed receipt did not roll back native timeline")
	}
	if _, err := s.repo.ProjectCut("owner", "cut-project", plan.BackupCutID); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatal("failed apply left partial backup", err)
	}
	page, err := s.ListProjectCuts("owner", "cut-project", "", false, true, 1)
	if err != nil || len(page.Cuts) != 1 || page.NextCursor == "" {
		t.Fatal("cut pagination", err, page)
	}
	more, err := s.ListProjectCuts("owner", "cut-project", page.NextCursor, false, true, 1)
	if err != nil || len(more.Cuts) != 1 || more.Cuts[0].ID == page.Cuts[0].ID {
		t.Fatal("pagination repeated cut", err)
	}
	if _, err := s.SetProjectCutArchived("owner", "cut-project", first.Cut.ID, false, true); err != nil {
		t.Fatal(err)
	}
	if _, err := s.PreviewProjectCutApply("owner", "cut-project", first.Cut.ID, apply); err == nil {
		t.Fatal("archived cut applied")
	}
	refs, err := s.repo.ResourceReferenceSnapshot("owner", "", []string{"cut-first"})
	if err != nil {
		t.Fatal(err)
	}
	protected := false
	for _, ref := range refs.Documents {
		if ref.Kind == "剪辑版本" && ref.ID == first.Cut.ID {
			protected = true
		}
	}
	if !protected {
		t.Fatal("archived immutable cut no longer protects source")
	}
	if _, err := s.SetProjectCutArchived("owner", "cut-project", first.Cut.ID, true, false); err != nil {
		t.Fatal(err)
	}
	apply.RequestID = "cut-stale-preview-request"
	plan, err = s.PreviewProjectCutApply("owner", "cut-project", first.Cut.ID, apply)
	if err != nil {
		t.Fatal(err)
	}
	apply.PreviewToken = plan.PreviewToken
	after, err = s.SaveProjectTimeline("owner", "cut-project", SaveProjectTimelineRequest{ExpectedRevision: after.Revision, Timeline: makeTimeline("cut-second", "另一个窗口")})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.ApplyProjectCut("owner", "cut-project", first.Cut.ID, apply); err == nil {
		t.Fatal("stale preview overwrote other window")
	}
	if err := db.Model(&model.Project{}).Where("id = ?", "cut-project").Update("status", model.ProjectStatusArchived).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := s.PreviewProjectCutApply("owner", "cut-project", first.Cut.ID, apply); err == nil {
		t.Fatal("archived project edited")
	}
	if _, err := s.ReadProjectCutApply("owner", "cut-project", "cut-apply-stable-request-1"); err != nil {
		t.Fatal("archive hid immutable receipt", err)
	}
	if err := s.DeleteProject("owner", "cut-project"); err != nil {
		t.Fatal(err)
	}
	for _, row := range []any{&model.ProjectCut{}, &model.ProjectCutApplyReceipt{}} {
		var count int64
		if err := db.Model(row).Where("project_id = ?", "cut-project").Count(&count).Error; err != nil || count != 0 {
			t.Fatal("project deletion left orphan cut rows", count, err)
		}
	}
}
