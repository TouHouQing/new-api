package app

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/database"

	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
)

// Loading an incomplete historical cut is useful for repair. A fresh save or
// export snapshot must retain that warning until an explicit replacement.
func legacyOriginFixture(t *testing.T) (*Service, *gorm.DB, string, ProjectCutApplyResult, model.ProjectCut) {
	t.Helper()
	s, db := legacyImportService(t)
	return legacyOriginFixtureWithService(t, s, db)
}
func legacyOriginFixtureWithService(t *testing.T, s *Service, db *gorm.DB) (*Service, *gorm.DB, string, ProjectCutApplyResult, model.ProjectCut) {
	t.Helper()
	for _, id := range []string{"owner", "other"} {
		user := model.User{ID: id, Username: id, Email: id + "@example.invalid", Status: model.UserStatusActive, Role: model.UserRoleUser}
		if err := db.Where("id = ?", id).FirstOrCreate(&user).Error; err != nil {
			t.Fatal(err)
		}
	}
	pid := "legacy-origin-project"
	if err := db.Create(&model.Project{ID: pid, UserID: "owner", Revision: 1, AspectRatio: "16:9", Status: model.ProjectStatusActive}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.Resource{ID: "origin-video", UserID: "owner", Kind: "video", MimeType: "video/mp4", Width: 160, Height: 96, DurationMs: 2000, Status: model.ResourceStatusReady}).Error; err != nil {
		t.Fatal(err)
	}
	document := `{"production":{"regionalVersions":[{"id":"old","reframes":{"one":{"analysisId":"old-track"}}}]}}`
	receipt := model.ProductionImport{ID: "origin-import", UserID: "owner", ProjectID: pid, SourceFingerprint: strings.Repeat("a", 64), SourceDocumentJSON: document}
	if err := db.Create(&receipt).Error; err != nil {
		t.Fatal(err)
	}
	metadata, _ := json.Marshal(map[string]any{"converter": "legacy-regional-v2", "sourceSha256": cutSignature(json.RawMessage(document)), "preservedOnly": []string{}, "renderOutput": map[string]any{"width": 160, "height": 96, "fps": 24, "fit": "letterbox"}})
	raw, err := s.SaveProjectTimeline("owner", pid, SaveProjectTimelineRequest{Timeline: json.RawMessage(`{"version":2,"tracks":[{"id":"video","kind":"video","order":0}],"clips":[{"id":"clip","kind":"video","trackId":"video","startMs":0,"durationMs":2000,"sourceStartMs":0,"sourceDurationMs":2000,"directMedia":{"kind":"video","id":"origin-video","storageKey":"resource:origin-video"}}],"durationMs":2000}`)})
	if err != nil {
		t.Fatal(err)
	}
	cut := model.ProjectCut{ID: "old-origin-cut", UserID: "owner", ProjectID: pid, RequestID: "old-origin-request-0001", Kind: "locale", Title: "旧版缺少构图", SourceImportID: receipt.ID, SourceKey: "legacy-regional-v2:old", PayloadJSON: string(raw.Timeline), TimelineSHA256: cutSummary(raw.Timeline).SHA256, MetadataJSON: string(metadata), CreatedAt: time.Now()}
	if err := db.Create(&cut).Error; err != nil {
		t.Fatal(err)
	}
	input := ProjectCutApplyRequest{RequestID: "load-incomplete-origin-0001", ExpectedRevision: raw.Revision, TimelineSHA256: cut.TimelineSHA256}
	preview, err := s.PreviewProjectCutApply("owner", pid, cut.ID, input)
	if err != nil {
		t.Fatal(err)
	}
	input.PreviewToken = preview.PreviewToken
	loaded, err := s.ApplyProjectCut("owner", pid, cut.ID, input)
	if err != nil {
		t.Fatal(err)
	}
	return s, db, pid, loaded, cut
}
func TestProjectCutLegacyBlockersSurviveWorkingLoadAndResave(t *testing.T) {
	s, db, pid, loaded, _ := legacyOriginFixture(t)
	for _, purpose := range []string{"", "export"} {
		kind := "master"
		if purpose == "export" {
			kind = "snapshot"
		}
		fresh, err := s.CreateProjectCut("owner", pid, ProjectCutCreateRequest{RequestID: "derived-origin-" + kind + "-0001", ExpectedRevision: loaded.AppliedRevision, Title: "从旧版继续剪辑", Kind: kind, Purpose: purpose})
		if err != nil {
			t.Fatal(err)
		}
		if len(fresh.DeliveryBlockers) != 1 || fresh.DeliveryBlockers[0] != "regionalVersions.reframes" {
			t.Fatal("working snapshot silently lost unresolved historical framing", purpose, fresh.DeliveryBlockers)
		}
		if _, err := s.CreateProjectCutRender("owner", pid, fresh.Cut.ID, ProjectCutRenderRequest{RequestID: "reject-derived-origin-" + kind + "-0001", TimelineSHA256: fresh.Cut.TimelineSHA256}); err == nil {
			t.Fatal("incomplete working snapshot was exportable", purpose)
		}
	}
	var tasks int64
	if err := db.Model(&model.Task{}).Where("project_id = ?", pid).Count(&tasks).Error; err != nil || tasks != 0 {
		t.Fatal("incomplete export queued a task", tasks, err)
	}
}

func TestProjectCutLegacyBlockersSurviveSaveEditAndDirectRender(t *testing.T) {
	s, db, pid, loaded, _ := legacyOriginFixture(t)
	current, err := s.GetProjectTimeline("owner", pid)
	if err != nil {
		t.Fatal(err)
	}
	saved, err := s.SaveProjectTimeline("owner", pid, SaveProjectTimelineRequest{ExpectedRevision: loaded.AppliedRevision, Timeline: current.Timeline})
	if err != nil {
		t.Fatal(err)
	}
	if len(saved.DeliveryBlockers) != 1 {
		t.Fatal("ordinary save erased warnings", saved)
	}
	duration := int64(1500)
	request := TimelineEditRequest{RequestID: "origin-native-edit-0001", ExpectedRevision: saved.Revision, Commands: []production.TimelineEditCommand{{Op: "trimClip", ID: "clip", DurationMs: &duration}}}
	preview, err := s.PreviewTimelineEdits("owner", pid, request)
	if err != nil {
		t.Fatal(err)
	}
	request.PreviewToken = preview.PreviewToken
	edited, err := s.ApplyTimelineEdits("owner", pid, request)
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{edited.Plan.CutID, edited.Plan.BackupCutID} {
		view, err := s.GetProjectCut("owner", pid, id)
		if err != nil || len(view.DeliveryBlockers) != 1 {
			t.Fatal("native edit erased warnings", id, view.DeliveryBlockers, err)
		}
	}
	current, err = s.GetProjectTimeline("owner", pid)
	if err != nil {
		t.Fatal(err)
	}
	var timeline renderProject
	if err = json.Unmarshal(current.Timeline, &timeline); err != nil {
		t.Fatal(err)
	}
	if _, err = s.CreateTimelineRenderTask("owner", TimelineRenderCreateRequest{ProjectID: pid, Timeline: timeline, AspectRatio: "16:9"}); err == nil {
		t.Fatal("generic project render bypassed pending settings")
	}
	var tasks int64
	db.Model(&model.Task{}).Where("project_id = ?", pid).Count(&tasks)
	if tasks != 0 {
		t.Fatal("pending settings queued a render", tasks)
	}
}

func TestProjectCutReviewIsExplicitReplayableAndRestorable(t *testing.T) {
	s, db, pid, loaded, old := legacyOriginFixture(t)
	verifyProjectCutReview(t, s, db, pid, loaded, old)
}
func verifyProjectCutReview(t *testing.T, s *Service, db *gorm.DB, pid string, loaded ProjectCutApplyResult, old model.ProjectCut) {
	t.Helper()
	request := ProjectCutReviewRequest{RequestID: "explicit-legacy-review-0001", ExpectedRevision: loaded.AppliedRevision, DiscardFields: []string{"regionalVersions.reframes"}}
	if _, err := s.PreviewProjectCutReview("other", pid, request); err == nil {
		t.Fatal("foreign owner could review")
	}
	if _, err := s.ApplyProjectCutReview("owner", pid, request); err == nil {
		t.Fatal("review applied without confirmation preview")
	}
	plan, err := s.PreviewProjectCutReview("owner", pid, request)
	if err != nil {
		t.Fatal(err)
	}
	forged := request
	forged.DiscardFields = []string{"unknown"}
	if _, err = s.PreviewProjectCutReview("owner", pid, forged); err == nil {
		t.Fatal("partial or forged field review accepted")
	}
	request.PreviewToken = plan.PreviewToken
	result, err := s.ApplyProjectCutReview("owner", pid, request)
	if err != nil {
		t.Fatal(err)
	}
	again, err := s.ApplyProjectCutReview("owner", pid, request)
	if err != nil || !again.Replayed || again.AppliedRevision != result.AppliedRevision {
		t.Fatal("review replay replaced twice", again, err)
	}
	if _, err := s.ReadProjectCutApply("owner", pid, request.RequestID); err == nil {
		t.Fatal("review receipt was misrepresented as a cut-load receipt")
	}
	if _, err = s.ReadProjectCutReview("other", pid, request.RequestID); err == nil {
		t.Fatal("foreign owner read review receipt")
	}
	current, err := s.GetProjectTimeline("owner", pid)
	if err != nil || len(current.DeliveryBlockers) != 0 {
		t.Fatal("explicit review did not clear selected settings", current, err)
	}
	snapshot, err := s.CreateProjectCut("owner", pid, ProjectCutCreateRequest{RequestID: "reviewed-new-master-0001", ExpectedRevision: current.Revision, Title: "已核对母版", Kind: "master"})
	if err != nil || len(snapshot.DeliveryBlockers) != 0 {
		t.Fatal("reviewed save inherited unrelated notices", snapshot, err)
	}
	backup, err := s.GetProjectCut("owner", pid, result.Plan.BackupCutID)
	if err != nil || len(backup.DeliveryBlockers) != 1 {
		t.Fatal("recovery lost original warnings", backup, err)
	}
	original, err := s.GetProjectCut("owner", pid, old.ID)
	if err != nil || original.Cut.PayloadJSON != old.PayloadJSON || original.Cut.MetadataJSON != old.MetadataJSON || original.Cut.TimelineSHA256 != old.TimelineSHA256 {
		t.Fatal("review rewrote imported cut", err)
	}
	restore := ProjectCutApplyRequest{RequestID: "restore-before-review-0001", ExpectedRevision: current.Revision, TimelineSHA256: backup.Cut.TimelineSHA256}
	restorePlan, err := s.PreviewProjectCutApply("owner", pid, backup.Cut.ID, restore)
	if err != nil {
		t.Fatal(err)
	}
	restore.PreviewToken = restorePlan.PreviewToken
	if _, err = s.ApplyProjectCut("owner", pid, backup.Cut.ID, restore); err != nil {
		t.Fatal(err)
	}
	current, err = s.GetProjectTimeline("owner", pid)
	if err != nil || len(current.DeliveryBlockers) != 1 {
		t.Fatal("restoring old cut silently cleared warning", current, err)
	}
	var receipts int64
	db.Model(&model.ProjectCutApplyReceipt{}).Where("request_id = ?", request.RequestID).Count(&receipts)
	if receipts != 1 {
		t.Fatal("duplicate review receipts", receipts)
	}
}

func TestProjectCutReviewPostgresReplayAndRestore(t *testing.T) {
	base, db := newProjectNameConflictPostgresService(t)
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	connection, _ := db.DB()
	t.Cleanup(func() { connection.Close() })
	s := New(base.repo, t.TempDir())
	t.Cleanup(func() { s.Close() })
	s, db, pid, loaded, old := legacyOriginFixtureWithService(t, s, db)
	verifyProjectCutReview(t, s, db, pid, loaded, old)
}

func TestProjectCutReviewPostgresConcurrentConfirmationHasOneCommit(t *testing.T) {
	base, db := newProjectNameConflictPostgresService(t)
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	connection, _ := db.DB()
	t.Cleanup(func() { connection.Close() })
	s := New(base.repo, t.TempDir())
	t.Cleanup(func() { s.Close() })
	s, db, pid, loaded, _ := legacyOriginFixtureWithService(t, s, db)
	second := New(base.repo, t.TempDir())
	t.Cleanup(func() { second.Close() })
	requests := []ProjectCutReviewRequest{}
	for _, id := range []string{"parallel-review-one-0001", "parallel-review-two-0001"} {
		request := ProjectCutReviewRequest{RequestID: id, ExpectedRevision: loaded.AppliedRevision, DiscardFields: []string{"regionalVersions.reframes"}}
		plan, err := s.PreviewProjectCutReview("owner", pid, request)
		if err != nil {
			t.Fatal(err)
		}
		request.PreviewToken = plan.PreviewToken
		requests = append(requests, request)
	}
	errors := make(chan error, 2)
	start := make(chan struct{})
	for index, svc := range []*Service{s, second} {
		go func(index int, svc *Service) {
			<-start
			_, err := svc.ApplyProjectCutReview("owner", pid, requests[index])
			errors <- err
		}(index, svc)
	}
	close(start)
	success := 0
	for range 2 {
		if err := <-errors; err == nil {
			success++
		}
	}
	if success != 1 {
		t.Fatal("concurrent confirmations did not have exactly one winner", success)
	}
	current, err := s.GetProjectTimeline("owner", pid)
	if err != nil || current.Revision != loaded.AppliedRevision+1 || len(current.DeliveryBlockers) != 0 {
		t.Fatal("concurrent review changed timeline twice", current, err)
	}
	for _, source := range []string{"legacy-reviewed-v1", "legacy-review-before-v1"} {
		var count int64
		db.Model(&model.ProjectCut{}).Where("project_id = ? AND source_key = ?", pid, source).Count(&count)
		if count != 1 {
			t.Fatal("partial or duplicate review snapshots", source, count)
		}
	}
}

func TestProjectCutReviewRejectsStalePreviewAndDamagedOrigin(t *testing.T) {
	s, db, pid, loaded, old := legacyOriginFixture(t)
	request := ProjectCutReviewRequest{RequestID: "stale-legacy-review-0001", ExpectedRevision: loaded.AppliedRevision, DiscardFields: []string{"regionalVersions.reframes"}}
	preview, err := s.PreviewProjectCutReview("owner", pid, request)
	if err != nil {
		t.Fatal(err)
	}
	request.PreviewToken = preview.PreviewToken
	current, _ := s.GetProjectTimeline("owner", pid)
	if _, err = s.SaveProjectTimeline("owner", pid, SaveProjectTimelineRequest{ExpectedRevision: current.Revision, Timeline: current.Timeline}); err != nil {
		t.Fatal(err)
	}
	if _, err = s.ApplyProjectCutReview("owner", pid, request); err == nil {
		t.Fatal("stale review was applied")
	}
	if err = db.Model(&model.ProjectCut{}).Where("id = ?", old.ID).UpdateColumn("origin_cut_id", old.ID).Error; err != nil {
		t.Fatal(err)
	}
	current, err = s.GetProjectTimeline("owner", pid)
	if err != nil {
		t.Fatal(err)
	}
	request.ExpectedRevision = current.Revision
	request.DiscardFields = current.DeliveryBlockers
	request.PreviewToken = ""
	if _, err = s.PreviewProjectCutReview("owner", pid, request); err == nil {
		t.Fatal("damaged source was silently discarded")
	}
}
