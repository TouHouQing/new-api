package app

import (
	"bytes"
	"encoding/json"
	"gorm.io/gorm"
	"testing"
	"time"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
)

func TestProjectCutOutputLoadSaveAndWorkingExportSnapshot(t *testing.T) {
	s, db := legacyImportService(t)
	verifyProjectCutOutput(t, s, db)
}

func verifyProjectCutOutput(t *testing.T, s *Service, db *gorm.DB) {
	t.Helper()
	const pid = "output-project"
	if err := db.Create(&model.Project{ID: pid, UserID: "owner", Name: "区域剪辑", Status: model.ProjectStatusActive, Revision: 1, AspectRatio: "16:9"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.Resource{ID: "output-source", UserID: "owner", Kind: "video", MimeType: "video/mp4", DurationMs: 4000, Status: model.ResourceStatusReady}).Error; err != nil {
		t.Fatal(err)
	}
	initial := json.RawMessage(`{"version":2,"tracks":[{"id":"v","kind":"video","order":0}],"clips":[{"id":"c","nodeId":"n","kind":"video","trackId":"v","startMs":0,"durationMs":2000,"directMedia":{"id":"output-source","kind":"video","storageKey":"resource:output-source"}}],"durationMs":2000}`)
	clean, err := production.ValidateTimelineDocument(initial)
	if err != nil {
		t.Fatal(err)
	}
	current, err := s.SaveProjectTimeline("owner", pid, SaveProjectTimelineRequest{Timeline: clean})
	if err != nil {
		t.Fatal(err)
	}
	legacy := model.ProjectCut{ID: "old-regional-output", UserID: "owner", ProjectID: pid, RequestID: "old-output-request-001", RequestSHA256: "old", Title: "旧竖版", Kind: "locale", TimelineSHA256: cutSummary(clean).SHA256, PayloadJSON: string(clean), MetadataJSON: `{"renderOutput":{"width":384,"height":640,"fps":24,"fit":"blur"}}`, CreatedAt: time.Now()}
	if err := db.Create(&legacy).Error; err != nil {
		t.Fatal(err)
	}
	request := ProjectCutApplyRequest{RequestID: "load-old-output-0001", ExpectedRevision: current.Revision, TimelineSHA256: legacy.TimelineSHA256}
	plan, err := s.PreviewProjectCutApply("owner", pid, legacy.ID, request)
	if err != nil {
		t.Fatal(err)
	}
	request.PreviewToken = plan.PreviewToken
	loaded, err := s.ApplyProjectCut("owner", pid, legacy.ID, request)
	if err != nil {
		t.Fatal(err)
	}
	working, err := s.GetProjectTimeline("owner", pid)
	if err != nil {
		t.Fatal(err)
	}
	output, err := production.TimelineDocumentOutput(working.Timeline)
	expected := timelineRenderFormat{Width: 384, Height: 640, FPS: 24, Fit: "blur"}
	if err != nil || output == nil || *output != expected || cutSummary(working.Timeline).SHA256 != plan.After.SHA256 {
		t.Fatal("regional settings lost after loading", output, err)
	}
	old, err := s.repo.ProjectCut("owner", pid, legacy.ID)
	if err != nil || old.PayloadJSON != legacy.PayloadJSON || old.MetadataJSON != legacy.MetadataJSON || old.TimelineSHA256 != legacy.TimelineSHA256 {
		t.Fatal("old fixed cut changed", err)
	}
	backup, err := s.repo.ProjectCut("owner", pid, loaded.Plan.BackupCutID)
	if err != nil || !bytes.Equal([]byte(backup.PayloadJSON), clean) {
		t.Fatal("original working backup lost", err)
	}
	intent := ProjectCutCreateRequest{RequestID: "working-export-output-001", ExpectedRevision: working.Revision, Title: "导出快照", Kind: "snapshot", Purpose: "export"}
	cut, err := s.CreateProjectCut("owner", pid, intent)
	if err != nil {
		t.Fatal(err)
	}
	if cut.Cut.SourceKey != "working-export-v1" {
		t.Fatal("export cut classification lost")
	}
	stored, err := production.TimelineDocumentOutput(cut.Timeline)
	if err != nil || stored == nil || *stored != expected {
		t.Fatal("saved output differs", stored, err)
	}
	page, err := s.ListProjectCuts("owner", pid, "", false, false, 100)
	if err != nil {
		t.Fatal(err)
	}
	for _, row := range page.Cuts {
		if row.ID == cut.Cut.ID {
			t.Fatal("automatic export snapshot clutters manual versions")
		}
	}
	renderIntent := ProjectCutRenderRequest{RequestID: intent.RequestID, TimelineSHA256: cut.Cut.TimelineSHA256}
	task, err := s.CreateProjectCutRender("owner", pid, cut.Cut.ID, renderIntent)
	if err != nil {
		t.Fatal(err)
	}
	var input timelineRenderInput
	persisted, err := s.repo.TaskForUser("owner", task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if json.Unmarshal([]byte(persisted.InputJSON), &input) != nil || input.Output == nil || *input.Output != expected {
		t.Fatal("task lost original output")
	}
	_, err = s.SaveProjectTimeline("owner", pid, SaveProjectTimelineRequest{ExpectedRevision: working.Revision, Timeline: clean})
	if err != nil {
		t.Fatal(err)
	}
	replayed, err := s.CreateProjectCut("owner", pid, intent)
	if err != nil || !replayed.Replayed || replayed.Cut.ID != cut.Cut.ID {
		t.Fatal("snapshot reply recovery lost", err)
	}
	reused, err := s.CreateProjectCutRender("owner", pid, cut.Cut.ID, renderIntent)
	if err != nil || reused.ID != task.ID {
		t.Fatal("render repeated after unknown reply", err)
	}
	if _, err = s.CreateProjectCutRender("other", pid, cut.Cut.ID, renderIntent); err == nil {
		t.Fatal("foreign export allowed")
	}
}
