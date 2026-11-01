package app

import (
	"bytes"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
)

func TestLegacyRegionalVersionsNativeCutsAndFixedExport(t *testing.T) {
	s, db := legacyImportService(t)
	verifyLegacyRegionalVersions(t, s, db)
}

func TestLegacyRegionalVersionListRetainsPriorV1CutsAndOffersMotionUpgrade(t *testing.T) {
	s, db := legacyImportService(t)
	project := model.Project{ID: "old-regional-project", UserID: "owner", Revision: 1, Status: model.ProjectStatusActive}
	if err := db.Create(&project).Error; err != nil {
		t.Fatal(err)
	}
	document := `{"production":{"episodes":[{"id":"episode","title":"第一集"}],"regionalVersions":[{"id":"plain","episodeId":"episode","title":"原版","timeline":[]},{"id":"motion","episodeId":"episode","title":"动效版","timeline":[],"motionGraphics":[{"id":"retain"}]}]}}`
	receipt := model.ProductionImport{ID: "old-regional-import", UserID: "owner", ProjectID: project.ID, SourceFingerprint: strings.Repeat("d", 64), SourceDocumentJSON: document}
	if err := db.Create(&receipt).Error; err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"plain", "motion"} {
		row := model.ProjectCut{ID: "v1-" + id, UserID: "owner", ProjectID: project.ID, RequestID: "legacy-regional-v1:" + mediaAnalysisID("legacy-regional-request-v1", receipt.ID, id), SourceKey: "legacy-regional-v1:" + id, SourceImportID: receipt.ID, Kind: "locale", PayloadJSON: `{"version":2,"tracks":[],"clips":[],"durationMs":0}`}
		if err := db.Create(&row).Error; err != nil {
			t.Fatal(err)
		}
	}
	page, err := s.ReadLegacyVersions("owner", project.ID, "", 0, 20)
	if err != nil || len(page.Versions) != 2 {
		t.Fatal(page, err)
	}
	for _, entry := range page.Versions {
		if entry.Cut == nil || entry.Cut.ID != "v1-"+entry.ID || entry.RequiresUpgrade != (entry.ID == "motion") {
			t.Fatal("previous conversion disappeared or unnecessary upgrade shown", entry)
		}
	}
}

func TestLegacyRegionalVersionsPostgresNativeCutsAndFixedExport(t *testing.T) {
	base, db := newProjectNameConflictPostgresService(t)
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	connection, _ := db.DB()
	t.Cleanup(func() { connection.Close() })
	s := New(base.repo, t.TempDir())
	t.Cleanup(func() { s.Close() })
	for _, id := range []string{"owner", "other"} {
		if err := db.Create(&model.User{ID: id, Username: id, Email: id + "@example.invalid", Role: model.UserRoleUser, Status: model.UserStatusActive}).Error; err != nil {
			t.Fatal(err)
		}
	}
	verifyLegacyRegionalVersions(t, s, db)
	verifyProjectCutOutput(t, s, db)
}

func verifyLegacyRegionalVersions(t *testing.T, s *Service, db *gorm.DB) {
	t.Helper()
	pid := "regional-project"
	if err := db.Create(&model.Project{ID: pid, UserID: "owner", Name: "多版本", Revision: 1, AspectRatio: "16:9", Status: model.ProjectStatusActive}).Error; err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"original", "second", "music"} {
		kind, mime := "video", "video/mp4"
		if id == "music" {
			kind, mime = "audio", "audio/wav"
		}
		if err := db.Create(&model.Resource{ID: id, UserID: "owner", Kind: kind, MimeType: mime, DurationMs: 6000, Status: model.ResourceStatusReady}).Error; err != nil {
			t.Fatal(err)
		}
	}
	document := `{"nodes":[],"production":{"episodes":[{"id":"episode","title":"第一集"}],"regionalVersions":[{"id":"ja","episodeId":"episode","title":"日本語版","language":"ja","region":"JP","width":160,"height":96,"fps":24,"fit":"blur","timeline":[{"id":"one","nodeId":"deleted","sourceMediaId":"original","trimStart":1,"trimEnd":3,"muted":true},{"id":"two","nodeId":"deleted","sourceMediaId":"second","trimStart":0,"trimEnd":2}],"audioTracks":[{"id":"sound","mediaId":"music","start":0.5,"offset":0.25,"duration":3,"volume":0.2}]},{"id":"en","episodeId":"episode","title":"English","language":"en","region":"GB","width":160,"height":96,"fps":24,"fit":"crop","timeline":[{"id":"one","nodeId":"deleted","sourceMediaId":"second","trimStart":0,"trimEnd":2}]}]}}`
	receipt := model.ProductionImport{ID: "regional-import", UserID: "owner", ProjectID: pid, SourceFingerprint: strings.Repeat("e", 64), ContractVersion: 2, SourceDocumentJSON: document, IdentityMapJSON: `{}`, ResourceRefsJSON: `[{"resourceId":"original"},{"resourceId":"second"},{"resourceId":"music"}]`, ReportJSON: `{}`}
	if err := db.Create(&receipt).Error; err != nil {
		t.Fatal(err)
	}
	working, err := s.SaveProjectTimeline("owner", pid, SaveProjectTimelineRequest{Timeline: json.RawMessage(`{"version":2,"tracks":[{"id":"v","kind":"video","order":0}],"clips":[{"id":"working","kind":"video","nodeId":"n","trackId":"v","startMs":0,"durationMs":1000,"directMedia":{"id":"second","kind":"video","storageKey":"resource:second"}}]}`)})
	if err != nil {
		t.Fatal(err)
	}
	page, err := s.ReadLegacyVersions("owner", pid, "", 0, 1)
	if err != nil || len(page.Versions) != 1 || page.NextCursor != 1 || page.Versions[0].Episode != "第一集" {
		t.Fatal("source page", page, err)
	}
	if _, err := s.ReadLegacyVersions("other", pid, "", 0, 1); err == nil {
		t.Fatal("foreign source read")
	}
	if _, err := s.ReadLegacyVersions("owner", pid, "", 1, 1); err == nil {
		t.Fatal("unbound pagination accepted")
	}
	last, err := s.ReadLegacyVersions("owner", pid, page.SourceSHA256, 1, 1)
	if err != nil || len(last.Versions) != 1 || last.Versions[0].ID != "en" {
		t.Fatal("second source page", last, err)
	}
	request := LegacyVersionRequest{SourceID: "ja", SourceSHA256: page.SourceSHA256, ExpectedProjectRevision: 1, ExpectedTimelineRevision: working.Revision}
	if _, err := s.PreviewLegacyVersion("other", pid, request); err == nil {
		t.Fatal("foreign preview")
	}
	preview, err := s.PreviewLegacyVersion("owner", pid, request)
	if err != nil || preview.Summary.Clips != 3 || preview.Summary.DurationMs != 4000 || preview.Output.FPS != 24 || preview.Output.Fit != "blur" {
		t.Fatal("native projection", preview, err)
	}
	if _, err := s.ApplyLegacyVersion("owner", pid, request); err == nil {
		t.Fatal("unconfirmed conversion")
	}
	request.PreviewToken = preview.PreviewToken
	callback := "regional-cut-failure"
	db.Callback().Create().Before("gorm:create").Register(callback, func(tx *gorm.DB) {
		if _, ok := tx.Statement.Dest.(*model.ProjectCut); ok {
			tx.AddError(errors.New("injected cut write failure"))
		}
	})
	_, failure := s.ApplyLegacyVersion("owner", pid, request)
	db.Callback().Create().Remove(callback)
	if failure == nil {
		t.Fatal("injected failure was ignored")
	}
	var count int64
	db.Model(&model.ProjectCut{}).Where("project_id = ?", pid).Count(&count)
	if count != 0 {
		t.Fatal("partial cut survived rollback")
	}
	view, err := s.ApplyLegacyVersion("owner", pid, request)
	if err != nil || view.Cut.Kind != "locale" || view.Cut.Language != "ja" || !bytes.Contains(view.Timeline, []byte("resource:original")) || !bytes.Contains(view.Timeline, []byte("resource:second")) {
		t.Fatal("conversion", err)
	}
	after, _ := s.GetProjectTimeline("owner", pid)
	if after.Revision != working.Revision || !bytes.Equal(after.Timeline, working.Timeline) {
		t.Fatal("conversion replaced working edit")
	}
	var changed map[string]any
	json.Unmarshal(working.Timeline, &changed)
	changed["clips"].([]any)[0].(map[string]any)["title"] = "后续独立修改"
	encoded, _ := json.Marshal(changed)
	updated, err := s.SaveProjectTimeline("owner", pid, SaveProjectTimelineRequest{ExpectedRevision: working.Revision, Timeline: encoded})
	if err != nil {
		t.Fatal(err)
	}
	replayed, err := s.ApplyLegacyVersion("owner", pid, request)
	if err != nil || !replayed.Replayed || replayed.Cut.ID != view.Cut.ID {
		t.Fatal("lost reply not recovered", err)
	}
	render := ProjectCutRenderRequest{RequestID: "regional-export-00001", TimelineSHA256: view.Cut.TimelineSHA256}
	if _, err := s.CreateProjectCutRender("other", pid, view.Cut.ID, render); err == nil {
		t.Fatal("foreign render")
	}
	wrong := render
	wrong.TimelineSHA256 = strings.Repeat("a", 64)
	if _, err := s.CreateProjectCutRender("owner", pid, view.Cut.ID, wrong); err == nil {
		t.Fatal("changed cut accepted")
	}
	task, err := s.CreateProjectCutRender("owner", pid, view.Cut.ID, render)
	if err != nil {
		t.Fatal("fixed cut queue", err)
	}
	stored, _ := s.repo.TaskForUser("owner", task.ID)
	var input timelineRenderInput
	if json.Unmarshal([]byte(stored.InputJSON), &input) != nil || input.CutID != view.Cut.ID || input.CutSHA256 != view.Cut.TimelineSHA256 || input.Output == nil || input.Output.Width != 160 || input.Output.FPS != 24 || input.Output.Fit != "blur" || len(input.Timeline.Clips) != 3 {
		t.Fatal("fixed render input lost", stored.InputJSON)
	}
	if err := db.Model(&model.Project{}).Where("id = ?", pid).Update("aspect_ratio", "9:16").Error; err != nil {
		t.Fatal(err)
	}
	if _, err := s.SetProjectCutArchived("owner", pid, view.Cut.ID, false, true); err != nil {
		t.Fatal(err)
	}
	second, err := s.CreateProjectCutRender("owner", pid, view.Cut.ID, render)
	if err != nil || second.ID != task.ID {
		t.Fatal("duplicate export after settings change", err)
	}
	if _, err := s.CreateProjectCutRender("owner", pid, view.Cut.ID, wrong); err == nil {
		t.Fatal("request identity reused with different content")
	}
	if _, err := s.ReadProjectCutRender("other", pid, view.Cut.ID, render.RequestID); err == nil {
		t.Fatal("foreign export read")
	}
	if _, err := s.ReadProjectCutRender("owner", pid, "wrong-cut", render.RequestID); err == nil {
		t.Fatal("cross-cut export read")
	}
	if read, err := s.ReadProjectCutRender("owner", pid, view.Cut.ID, render.RequestID); err != nil || read.ID != task.ID {
		t.Fatal("read-only receipt missing", err)
	}
	final, _ := s.GetProjectTimeline("owner", pid)
	source, _ := s.repo.ProductionImportForProject("owner", pid)
	if final.Revision != updated.Revision || !bytes.Equal(final.Timeline, updated.Timeline) || source.SourceDocumentJSON != document {
		t.Fatal("fixed export mutated working or archive")
	}
	db.Model(&model.Task{}).Where("project_id = ?", pid).Count(&count)
	if count != 1 {
		t.Fatal("duplicate render task", count)
	}
	// Another browser can discover this exact task without its local request ID.
	history, err := s.ListProjectCutRenders("owner", pid, view.Cut.ID, "", 10)
	if err != nil || len(history.Tasks) != 1 || history.Tasks[0].ID != task.ID {
		t.Fatal("server export history missing", history, err)
	}
	older := *stored
	older.ID = "regional-older-export"
	older.Operation = ""
	older.Status = model.TaskStatusFailed
	older.CreatedAt = stored.CreatedAt.Add(-time.Minute)
	older.UpdatedAt = older.CreatedAt
	if err := db.Create(&older).Error; err != nil {
		t.Fatal(err)
	}
	firstPage, err := s.ListProjectCutRenders("owner", pid, view.Cut.ID, "", 1)
	if err != nil || len(firstPage.Tasks) != 1 || firstPage.Tasks[0].ID != task.ID || firstPage.NextCursor != task.ID {
		t.Fatal("latest export page", firstPage, err)
	}
	secondPage, err := s.ListProjectCutRenders("owner", pid, view.Cut.ID, firstPage.NextCursor, 1)
	if err != nil || len(secondPage.Tasks) != 1 || secondPage.Tasks[0].ID != older.ID || secondPage.NextCursor != "" {
		t.Fatal("earlier export page", secondPage, err)
	}
	if _, err := s.ListProjectCutRenders("other", pid, view.Cut.ID, "", 10); err == nil {
		t.Fatal("foreign export history")
	}
	if _, err := s.ListProjectCutRenders("owner", pid, view.Cut.ID, "foreign-task", 10); err == nil {
		t.Fatal("foreign history cursor")
	}
	if err := db.Model(&model.Task{}).Where("id = ?", task.ID).Update("operation", "").Error; err != nil {
		t.Fatal(err)
	}
	legacyHistory, err := s.ListProjectCutRenders("owner", pid, view.Cut.ID, "", 10)
	if err != nil || len(legacyHistory.Tasks) != 2 || legacyHistory.Tasks[0].ID != task.ID {
		t.Fatal("earlier native render receipt disappeared", legacyHistory, err)
	}
	// A render-affecting old setting is never silently omitted from delivery.
	var archived map[string]any
	if json.Unmarshal([]byte(document), &archived) != nil {
		t.Fatal("fixture")
	}
	versions := archived["production"].(map[string]any)["regionalVersions"].([]any)
	versions[1].(map[string]any)["motionGraphics"] = []any{map[string]any{"id": "unconverted-graphic"}}
	versions[1].(map[string]any)["reframes"] = map[string]any{"one": map[string]any{"analysisId": "old-track", "sourceMediaId": "second", "sourceDigest": strings.Repeat("a", 64), "width": 1080, "height": 1920}}
	sourceJSON, _ := json.Marshal(archived)
	if err := db.Model(&model.ProductionImport{}).Where("id = ?", receipt.ID).Update("source_document_json", string(sourceJSON)).Error; err != nil {
		t.Fatal(err)
	}
	refreshed, err := s.ReadLegacyVersions("owner", pid, "", 0, 20)
	if err != nil {
		t.Fatal(err)
	}
	english := LegacyVersionRequest{SourceID: "en", SourceSHA256: refreshed.SourceSHA256, ExpectedProjectRevision: 1, ExpectedTimelineRevision: updated.Revision}
	plan, err := s.PreviewLegacyVersion("owner", pid, english)
	if err != nil || len(plan.PreservedOnly) != 2 {
		t.Fatal("unconverted render settings not reported", plan, err)
	}
	english.PreviewToken = plan.PreviewToken
	if _, err := s.ApplyLegacyVersion("owner", pid, english); err == nil {
		t.Fatal("unconverted fields accepted without acknowledgment")
	}
	english.AcceptPreservedFields = plan.PreservedOnly
	incomplete, err := s.ApplyLegacyVersion("owner", pid, english)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateProjectCutRender("owner", pid, incomplete.Cut.ID, ProjectCutRenderRequest{RequestID: "incomplete-export-00001", TimelineSHA256: incomplete.Cut.TimelineSHA256}); err == nil {
		t.Fatal("incomplete archived version exported silently")
	}
	// Simulate an immutable v1 cut created before record-shaped reframes were
	// recognized. Its cached report is empty, but its pinned source still names
	// the missing trajectory; reading must surface it without rewriting history.
	versions[1].(map[string]any)["motionGraphics"] = []any{}
	oldSourceJSON, _ := json.Marshal(archived)
	if err := db.Model(&model.ProductionImport{}).Where("id = ?", receipt.ID).Update("source_document_json", string(oldSourceJSON)).Error; err != nil {
		t.Fatal(err)
	}
	var oldMetadata map[string]any
	if json.Unmarshal(incomplete.Metadata, &oldMetadata) != nil {
		t.Fatal("fixture metadata")
	}
	oldMetadata["sourceSha256"] = cutSignature(json.RawMessage(oldSourceJSON))
	oldMetadata["converter"] = "legacy-regional-v1"
	oldMetadata["preservedOnly"] = []string{}
	oldMetadataJSON, _ := json.Marshal(oldMetadata)
	cached := incomplete.Cut
	cached.SourceKey = "legacy-regional-v1:en"
	cached.ID = "cached-record-cut"
	cached.RequestID = "cached-record-request-001"
	cached.MetadataJSON = string(oldMetadataJSON)
	cached.PayloadJSON = string(incomplete.Timeline)
	if err := db.Create(&cached).Error; err != nil {
		t.Fatal(err)
	}
	guarded, err := s.GetProjectCut("owner", pid, cached.ID)
	if err != nil || len(guarded.DeliveryBlockers) != 1 || guarded.DeliveryBlockers[0] != "regionalVersions.reframes" {
		t.Fatal("older cached report hides its original reframe", guarded.DeliveryBlockers, err)
	}
	_, denied := s.CreateProjectCutRender("owner", pid, cached.ID, ProjectCutRenderRequest{RequestID: "cached-record-export-001", TimelineSHA256: cached.TimelineSHA256})
	var blocked *AppError
	if !errors.As(denied, &blocked) || blocked.Status != 409 || blocked.Reason != "cut_delivery_pending" {
		t.Fatal("older incomplete cut was exportable", denied)
	}
	retained, err := s.repo.ProjectCut("owner", pid, cached.ID)
	if err != nil || retained.MetadataJSON != cached.MetadataJSON {
		t.Fatal("historical conversion report overwritten", err)
	}
}
