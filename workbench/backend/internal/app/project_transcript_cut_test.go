package app

import (
	"encoding/json"
	"errors"
	"testing"

	"gorm.io/gorm"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
)

func seedTranscriptCutService(t *testing.T, s *Service, db *gorm.DB) (string, ProjectTranscriptView, ProjectTimelineView) {
	t.Helper()
	project := model.Project{ID: "cut-project", UserID: "owner", Name: "文字剪辑", Status: model.ProjectStatusActive}
	resource := model.Resource{ID: "voice", UserID: "owner", Kind: "audio", MimeType: "audio/wav", DurationMs: 6000, Status: model.ResourceStatusReady}
	image := model.Resource{ID: "image", UserID: "owner", Kind: "image", MimeType: "image/png", Status: model.ResourceStatusReady}
	task := model.Task{ID: "recognition", UserID: "owner", ProjectID: project.ID, Type: model.TaskTypeTimelineTranscription, Status: model.TaskStatusSucceeded, InputJSON: `{"resourceId":"voice","sourceClipId":"first"}`, ResultJSON: `{"resourceId":"voice","sourceClipId":"first","segments":[{"startMs":0,"endMs":2000,"text":"开场"},{"startMs":2000,"endMs":4000,"text":"重复对白"},{"startMs":4000,"endMs":6000,"text":"结尾"}]}`}
	for _, row := range []any{&project, &resource, &image, &task} {
		if err := db.Create(row).Error; err != nil {
			t.Fatal(err)
		}
	}
	transcript, err := s.CreateProjectTranscript("owner", project.ID, ProjectTranscriptCreateRequest{TaskID: task.ID})
	if err != nil {
		t.Fatal(err)
	}
	raw := json.RawMessage(`{"version":2,"tracks":[{"id":"v","kind":"video"},{"id":"a","kind":"audio"}],"clips":[{"id":"first","kind":"audio","trackId":"a","startMs":1000,"durationMs":6000,"directMedia":{"storageKey":"resource:voice"}},{"id":"repeat","kind":"audio","trackId":"a","startMs":10000,"durationMs":3000,"sourceStartMs":1000,"directMedia":{"storageKey":"resource:voice"}},{"id":"frame","kind":"image","trackId":"v","startMs":0,"durationMs":13000,"directMedia":{"storageKey":"resource:image"}}]}`)
	timeline, err := s.SaveProjectTimeline("owner", project.ID, SaveProjectTimelineRequest{Timeline: raw})
	if err != nil {
		t.Fatal(err)
	}
	return project.ID, transcript, timeline
}
func TestTranscriptCutPreviewApplyPermissionsTokenAndStaleTimeline(t *testing.T) {
	svc, db := legacyImportService(t)
	project, transcript, timeline := seedTranscriptCutService(t, svc, db)
	expected := timeline.Revision
	request := TranscriptCutPreviewRequest{ExpectedTimelineRevision: &expected, TranscriptRevisionID: transcript.CurrentVersion.ID, SourceClipID: "first", Mode: "ripple", KeepSegmentIDs: []string{"s-000001", "s-000003"}}
	preview, err := svc.PreviewProjectTranscriptCut("owner", project, transcript.Transcript.ID, request)
	if err != nil {
		t.Fatal(err)
	}
	if preview.RemovedMs != 2000 || preview.AfterDurationMs != 11000 || len(preview.PreviewToken) != 64 {
		t.Fatal("incorrect cut preview")
	}
	before, err := svc.GetProjectTimeline("owner", project)
	if err != nil || before.Revision != timeline.Revision || string(before.Timeline) != string(timeline.Timeline) {
		t.Fatal("preview wrote the cut")
	}
	if _, err := svc.PreviewProjectTranscriptCut("other", project, transcript.Transcript.ID, request); err == nil {
		t.Fatal("foreign preview allowed")
	}
	if _, err := svc.ApplyProjectTranscriptCut("owner", project, transcript.Transcript.ID, TranscriptCutApplyRequest{TranscriptCutPreviewRequest: request, PreviewToken: "bad"}); err == nil {
		t.Fatal("missing confirmation accepted")
	}
	wrong := request
	wrong.Mode = "clip_only"
	if _, err := svc.ApplyProjectTranscriptCut("owner", project, transcript.Transcript.ID, TranscriptCutApplyRequest{TranscriptCutPreviewRequest: wrong, PreviewToken: preview.PreviewToken}); err == nil {
		t.Fatal("changed preview applied")
	}
	advanced, err := svc.SaveProjectTimeline("owner", project, SaveProjectTimelineRequest{ExpectedRevision: timeline.Revision, Timeline: timeline.Timeline})
	if err != nil {
		t.Fatal(err)
	}
	_, err = svc.ApplyProjectTranscriptCut("owner", project, transcript.Transcript.ID, TranscriptCutApplyRequest{TranscriptCutPreviewRequest: request, PreviewToken: preview.PreviewToken})
	var conflict *AppError
	if !errors.As(err, &conflict) || conflict.Status != 409 {
		t.Fatal("stale preview overwrote cut")
	}
	expected = advanced.Revision
	fresh, err := svc.PreviewProjectTranscriptCut("owner", project, transcript.Transcript.ID, request)
	if err != nil {
		t.Fatal(err)
	}
	applied, err := svc.ApplyProjectTranscriptCut("owner", project, transcript.Transcript.ID, TranscriptCutApplyRequest{TranscriptCutPreviewRequest: request, PreviewToken: fresh.PreviewToken})
	if err != nil {
		t.Fatal(err)
	}
	if applied.Revision != advanced.Revision+1 || string(applied.Timeline) != string(fresh.Timeline) {
		t.Fatal("apply didn't save the reviewed snapshot")
	}
	if _, err := svc.ApplyProjectTranscriptCut("owner", project, transcript.Transcript.ID, TranscriptCutApplyRequest{TranscriptCutPreviewRequest: request, PreviewToken: fresh.PreviewToken}); err == nil {
		t.Fatal("duplicate request cut the timeline twice")
	}
	current, _ := svc.GetProjectTimeline("owner", project)
	if current.Revision != applied.Revision {
		t.Fatal("failed retry advanced revision")
	}
}

func TestTranscriptCutPostgresConcurrentApplyHasOneWinner(t *testing.T) {
	svc, db := newProjectNameConflictPostgresService(t)
	connection, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = connection.Close() })
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	project, transcript, timeline := seedTranscriptCutService(t, svc, db)
	request := TranscriptCutPreviewRequest{ExpectedTimelineRevision: &timeline.Revision, TranscriptRevisionID: transcript.CurrentVersion.ID, SourceClipID: "first", Mode: "clip_only", KeepSegmentIDs: []string{"s-000001", "s-000003"}}
	preview, err := svc.PreviewProjectTranscriptCut("owner", project, transcript.Transcript.ID, request)
	if err != nil {
		t.Fatal(err)
	}
	start := make(chan struct{})
	results := make(chan error, 2)
	for range 2 {
		go func() {
			<-start
			_, err := svc.ApplyProjectTranscriptCut("owner", project, transcript.Transcript.ID, TranscriptCutApplyRequest{TranscriptCutPreviewRequest: request, PreviewToken: preview.PreviewToken})
			results <- err
		}()
	}
	close(start)
	wins, conflicts := 0, 0
	for range 2 {
		err := <-results
		if err == nil {
			wins++
		} else {
			var failure *AppError
			if errors.As(err, &failure) && failure.Status == 409 {
				conflicts++
			} else {
				t.Fatal(err)
			}
		}
	}
	current, err := svc.GetProjectTimeline("owner", project)
	if err != nil || wins != 1 || conflicts != 1 || current.Revision != timeline.Revision+1 {
		t.Fatalf("cut CAS failed wins=%d conflicts=%d error=%v", wins, conflicts, err)
	}
}

func TestRenderSnapshotRetainsTranscriptBindingAndChecksBeforeQueue(t *testing.T) {
	svc, db := legacyImportService(t)
	project, transcript, timeline := seedTranscriptCutService(t, svc, db)
	var document map[string]any
	if err := json.Unmarshal(timeline.Timeline, &document); err != nil {
		t.Fatal(err)
	}
	tracks := document["tracks"].([]any)
	document["tracks"] = append(tracks, map[string]any{"id": "s", "kind": "subtitle"})
	caption := map[string]any{"id": "caption", "kind": "subtitle", "trackId": "s", "startMs": 1000, "durationMs": 2000, "text": "开场", "productionBinding": map[string]any{"transcriptId": transcript.Transcript.ID, "transcriptRevisionId": transcript.CurrentVersion.ID, "transcriptSegmentId": "missing", "sourceClipId": "first"}}
	document["clips"] = append(document["clips"].([]any), caption)
	decode := func() renderProject {
		raw, _ := json.Marshal(document)
		var render renderProject
		if err := json.Unmarshal(raw, &render); err != nil {
			t.Fatal(err)
		}
		return render
	}
	if _, err := svc.CreateTimelineRenderTask("owner", TimelineRenderCreateRequest{ProjectID: project, Timeline: decode()}); err == nil {
		t.Fatal("render discarded the invalid transcript binding")
	}
	caption["productionBinding"].(map[string]any)["transcriptSegmentId"] = "s-000001"
	frame := document["clips"].([]any)[2].(map[string]any)
	frame["directMedia"].(map[string]any)["url"] = "/api/resources/different/file"
	if _, err := svc.CreateTimelineRenderTask("owner", TimelineRenderCreateRequest{ProjectID: project, Timeline: decode()}); err == nil {
		t.Fatal("render discarded the mismatched direct-media URL")
	}
	var count int64
	if err := db.Model(&model.Task{}).Where("type = ?", model.TaskTypeTimelineRender).Count(&count).Error; err != nil || count != 0 {
		t.Fatal("rejected render created a task")
	}
	frame["directMedia"].(map[string]any)["url"] = "/api/resources/image/file"
	task, err := svc.CreateTimelineRenderTask("owner", TimelineRenderCreateRequest{ProjectID: project, Timeline: decode()})
	if err != nil {
		t.Fatal(err)
	}
	var queued timelineRenderInput
	stored, err := svc.repo.TaskForUser("owner", task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal([]byte(stored.InputJSON), &queued); err != nil || queued.Timeline.Clips[3].ProductionBinding == nil || queued.Timeline.Clips[3].ProductionBinding.TranscriptID != transcript.Transcript.ID {
		t.Fatal("queued snapshot lost valid transcript identity")
	}
}
