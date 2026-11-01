package app

import (
	"encoding/json"
	"errors"
	"testing"
	"time"

	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
	"yingce/backend/internal/repository"
)

func TestTimelineTranscriptVersionBindingRequiresProjectOwnerAndExistingSpan(t *testing.T) {
	svc, db := legacyImportService(t)
	for _, row := range []any{
		&model.Project{ID: "project", UserID: "owner", Name: "字幕", Status: model.ProjectStatusActive},
		&model.Project{ID: "other-project", UserID: "owner", Name: "另一个项目", Status: model.ProjectStatusActive},
		&model.ProjectTranscript{ID: "transcript", UserID: "owner", ProjectID: "project", CurrentRevisionID: "revision", Revision: 1, SourceKind: "recognition", SourceKey: "source"},
		&model.ProjectTranscriptRevision{ID: "revision", TranscriptID: "transcript", UserID: "owner", Version: 1, DocumentJSON: `{"version":1,"precision":"segment","segments":[{"id":"s-1","startMs":0,"endMs":1000,"text":"字幕"}]}`},
	} {
		if err := db.Create(row).Error; err != nil {
			t.Fatal(err)
		}
	}
	makeTimeline := func(span string) json.RawMessage {
		return json.RawMessage(`{"version":2,"tracks":[{"id":"s","kind":"subtitle"}],"clips":[{"id":"sub","kind":"subtitle","trackId":"s","startMs":0,"durationMs":1000,"text":"字幕","productionBinding":{"transcriptId":"transcript","transcriptRevisionId":"revision","transcriptSegmentId":"` + span + `","sourceClipId":"occurrence"}}]}`)
	}
	if _, err := svc.SaveProjectTimeline("owner", "project", SaveProjectTimelineRequest{Timeline: makeTimeline("s-1")}); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SaveProjectTimeline("owner", "other-project", SaveProjectTimelineRequest{Timeline: makeTimeline("s-1")}); err == nil {
		t.Fatal("foreign project transcript adopted")
	}
	if _, err := svc.SaveProjectTimeline("owner", "project", SaveProjectTimelineRequest{ExpectedRevision: 1, Timeline: makeTimeline("unknown")}); err == nil {
		t.Fatal("unknown source span adopted")
	}
	loaded, err := svc.GetProjectTimeline("owner", "project")
	if err != nil || loaded.Revision != 1 {
		t.Fatal("invalid adoption changed timeline")
	}
}

func TestProjectTranscriptPostgresConcurrentCreationAndCorrection(t *testing.T) {
	svc, db := newProjectNameConflictPostgresService(t)
	connection, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = connection.Close() })
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	project := model.Project{ID: "concurrent-transcript", UserID: "owner", Name: "文字稿并发", Status: model.ProjectStatusActive}
	if err := db.Create(&project).Error; err != nil {
		t.Fatal(err)
	}
	// Two independent writers exercise the database contract, not a process mutex.
	start := make(chan struct{})
	type createdResult struct {
		created bool
		err     error
	}
	results := make(chan createdResult, 2)
	for _, suffix := range []string{"a", "b"} {
		go func(suffix string) {
			<-start
			now := time.Now()
			parent := model.ProjectTranscript{ID: "transcript-" + suffix, UserID: "owner", ProjectID: project.ID, SourceKind: "recognition", SourceKey: "same-task", SourceTaskID: "same-task", ResourceID: "source", Revision: 1, CurrentRevisionID: "revision-" + suffix, CreatedAt: now, UpdatedAt: now}
			revision := model.ProjectTranscriptRevision{ID: parent.CurrentRevisionID, TranscriptID: parent.ID, UserID: "owner", AuthorID: "owner", Version: 1, DocumentJSON: `{"version":1,"precision":"segment","segments":[{"id":"s-1","startMs":0,"endMs":1000,"text":"原稿"}]}`, CreatedAt: now}
			created, err := svc.repo.CreateProjectTranscript(&parent, &revision)
			results <- createdResult{created, err}
		}(suffix)
	}
	close(start)
	winners := 0
	for range 2 {
		result := <-results
		if result.err != nil {
			t.Fatal(result.err)
		}
		if result.created {
			winners++
		}
	}
	var parent model.ProjectTranscript
	if err := db.Where("project_id = ?", project.ID).Take(&parent).Error; err != nil {
		t.Fatal(err)
	}
	if winners != 1 {
		t.Fatalf("created %d transcripts for the same source", winners)
	}
	start = make(chan struct{})
	writes := make(chan error, 2)
	for _, suffix := range []string{"c", "d"} {
		go func(suffix string) {
			<-start
			copy := parent
			copy.UpdatedAt = time.Now()
			revision := model.ProjectTranscriptRevision{ID: "revision-" + suffix, TranscriptID: parent.ID, UserID: "owner", AuthorID: "owner", DocumentJSON: `{}`, CreatedAt: copy.UpdatedAt}
			writes <- svc.repo.SaveProjectTranscript(&copy, parent.Revision, &revision)
		}(suffix)
	}
	close(start)
	winners, conflicts := 0, 0
	for range 2 {
		err := <-writes
		if err == nil {
			winners++
		} else if errors.Is(err, repository.ErrTranscriptRevisionChanged) {
			conflicts++
		} else {
			t.Fatal(err)
		}
	}
	var versions []model.ProjectTranscriptRevision
	if err := db.Where("transcript_id = ?", parent.ID).Order("version").Find(&versions).Error; err != nil {
		t.Fatal(err)
	}
	if winners != 1 || conflicts != 1 || len(versions) != 2 || versions[0].Version != 1 || versions[1].Version != 2 {
		t.Fatalf("lost transcript CAS: wins=%d conflicts=%d versions=%v", winners, conflicts, versions)
	}
}

func TestProjectTranscriptCorrectionHistoryArchiveRecoveryAndSourceProtection(t *testing.T) {
	svc, db := legacyImportService(t)
	project := model.Project{ID: "speech-project", UserID: "owner", Name: "文字稿测试", Status: model.ProjectStatusActive}
	resource := model.Resource{ID: "speech-source", UserID: "owner", Kind: "audio", MimeType: "audio/wav", Status: model.ResourceStatusReady, DurationMs: 2000, Size: 100, ETag: "fixture-etag"}
	original := `{"resourceId":"speech-source","sourceClipId":"occurrence","language":"zh","segments":[{"startMs":200,"endMs":1500,"text":"窗边直物"}]}`
	task := model.Task{ID: "speech-recognition", UserID: "owner", ProjectID: project.ID, Type: model.TaskTypeTimelineTranscription, Status: model.TaskStatusSucceeded, Provider: "local", Model: "whisper.cpp", InputJSON: `{"resourceId":"speech-source","sourceClipId":"occurrence"}`, ResultJSON: original}
	for _, row := range []any{&project, &resource, &task} {
		if err := db.Create(row).Error; err != nil {
			t.Fatal(err)
		}
	}
	before, err := svc.repo.UserStructuredStorageUsage("owner")
	if err != nil {
		t.Fatal(err)
	}
	view, err := svc.CreateProjectTranscript("owner", project.ID, ProjectTranscriptCreateRequest{TaskID: task.ID, Title: "窗边旁白"})
	if err != nil {
		t.Fatal(err)
	}
	id, firstRevision := view.Transcript.ID, view.CurrentVersion.ID
	if view.Transcript.Revision != 1 || view.CurrentVersion.Version != 1 || view.Document.Precision != "segment" || view.Transcript.SourceETag != resource.ETag {
		t.Fatal("source snapshot/version missing")
	}
	repeated, err := svc.CreateProjectTranscript("owner", project.ID, ProjectTranscriptCreateRequest{TaskID: task.ID})
	if err != nil || repeated.Transcript.ID != id {
		t.Fatal("recognition was imported twice")
	}
	text, speaker := "窗边植物", "旁白"
	expected := view.Transcript.Revision
	corrected, err := svc.UpdateProjectTranscript("owner", project.ID, id, ProjectTranscriptWriteRequest{ExpectedRevision: &expected, Changes: []production.TranscriptCorrection{{ID: view.Document.Segments[0].ID, Text: &text, Speaker: &speaker}}})
	if err != nil {
		t.Fatal(err)
	}
	if corrected.Document.Segments[0].StartMs != 200 || corrected.Document.Segments[0].EndMs != 1500 || corrected.Document.Segments[0].Text != text || corrected.CurrentVersion.Version != 2 {
		t.Fatal("correction lost time, text or version")
	}
	_, err = svc.UpdateProjectTranscript("owner", project.ID, id, ProjectTranscriptWriteRequest{ExpectedRevision: &expected, Action: "archive"})
	var conflict *AppError
	if !errors.As(err, &conflict) || conflict.Status != 409 || conflict.Reason != "transcript_revision_conflict" {
		t.Fatalf("stale change overwrote transcript: %v", err)
	}
	expected = corrected.Transcript.Revision
	unchanged, err := svc.UpdateProjectTranscript("owner", project.ID, id, ProjectTranscriptWriteRequest{ExpectedRevision: &expected, Changes: []production.TranscriptCorrection{{ID: view.Document.Segments[0].ID, Text: &text}}})
	if err != nil || unchanged.Transcript.Revision != expected {
		t.Fatal("no-op correction created a redundant revision")
	}
	usage, err := svc.repo.UserStructuredStorageUsage("owner")
	if err != nil || usage.CanvasBytes <= before.CanvasBytes {
		t.Fatal("transcript history not counted in structured quota")
	}
	archived, err := svc.UpdateProjectTranscript("owner", project.ID, id, ProjectTranscriptWriteRequest{ExpectedRevision: &expected, Action: "archive"})
	if err != nil || !archived.Transcript.Archived {
		t.Fatal("archive failed")
	}
	afterArchive, err := svc.repo.UserStructuredStorageUsage("owner")
	if err != nil || afterArchive.CanvasBytes != usage.CanvasBytes {
		t.Fatal("archive duplicated the full transcript")
	}
	page, err := svc.ListProjectTranscripts("owner", project.ID, resource.ID, "", false, 30)
	if err != nil || len(page.Transcripts) != 0 {
		t.Fatal("archived document remained in active list")
	}
	refs, err := svc.repo.ResourceReferenceSnapshot("owner", "", []string{resource.ID})
	if err != nil {
		t.Fatal(err)
	}
	protected := false
	for _, ref := range refs.Direct {
		if ref.Kind == "项目文字稿" && ref.ID == id && ref.ResourceID == resource.ID {
			protected = true
		}
	}
	if !protected {
		t.Fatal("archived transcript no longer protects source media")
	}
	expected = archived.Transcript.Revision
	restored, err := svc.UpdateProjectTranscript("owner", project.ID, id, ProjectTranscriptWriteRequest{ExpectedRevision: &expected, Action: "restore_version", RestoreRevisionID: firstRevision})
	if err != nil {
		t.Fatal(err)
	}
	if restored.Transcript.Archived || restored.CurrentVersion.Version != 3 || restored.Document.Segments[0].Text != "窗边直物" {
		t.Fatal("historical recovery did not append a version")
	}
	old, err := svc.GetProjectTranscriptVersion("owner", project.ID, id, corrected.CurrentVersion.ID)
	if err != nil || old.Document.Segments[0].Text != text {
		t.Fatal("recovery overwrote historical correction")
	}
	if err := db.Model(&model.ProjectTranscriptRevision{}).Where("id = ?", restored.CurrentVersion.ID).Update("document_json", "{}").Error; err != nil {
		t.Fatal(err)
	}
	if _, err := svc.GetProjectTranscript("owner", project.ID, id); err == nil {
		t.Fatal("corrupt document was silently accepted")
	}
	expected = restored.Transcript.Revision
	repaired, err := svc.UpdateProjectTranscript("owner", project.ID, id, ProjectTranscriptWriteRequest{ExpectedRevision: &expected, Action: "restore_version", RestoreRevisionID: firstRevision})
	if err != nil || repaired.CurrentVersion.Version != 4 {
		t.Fatalf("valid history couldn't recover corrupt current version: %v", err)
	}
	for _, actor := range []string{"other", "missing"} {
		if _, err := svc.GetProjectTranscript(actor, project.ID, id); err == nil {
			t.Fatal("another account read transcript")
		}
	}
	var source model.Task
	if err := db.First(&source, "id = ?", task.ID).Error; err != nil || source.ResultJSON != original {
		t.Fatal("correction changed original recognition result")
	}
	if err := svc.DeleteProject("owner", project.ID); err != nil {
		t.Fatal(err)
	}
	for _, table := range []any{&model.ProjectTranscript{}, &model.ProjectTranscriptRevision{}} {
		var count int64
		if err := db.Model(table).Count(&count).Error; err != nil || count != 0 {
			t.Fatal("project deletion left transcript records")
		}
	}
	var remaining int64
	if err := db.Model(&model.Resource{}).Where("id = ?", resource.ID).Count(&remaining).Error; err != nil || remaining != 1 {
		t.Fatal("project deletion removed original source media")
	}
}
