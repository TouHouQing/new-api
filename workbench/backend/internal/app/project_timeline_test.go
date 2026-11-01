package app

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"yingce/backend/internal/model"

	"gorm.io/gorm"
)

func TestCancelLocalTimelineRenderStopsActiveWork(t *testing.T) {
	s, db := legacyImportService(t)
	task := model.Task{ID: "owned-cpu-render", UserID: "owner", Type: model.TaskTypeTimelineRender, Provider: "local", Model: "ffmpeg", Status: model.TaskStatusRunning, Stage: "正在渲染…"}
	if err := db.Create(&task).Error; err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	s.activeCancels[task.ID] = cancel
	result, err := s.CancelTask(context.Background(), "owner", task.ID)
	if err != nil || result.Status != model.TaskStatusCancelled {
		t.Fatalf("local render cancellation: %+v %v", result, err)
	}
	if ctx.Err() != context.Canceled {
		t.Fatal("active FFmpeg context was not cancelled")
	}
}

func TestProjectTimelinePersistsWithOwnerAndRevisionGuards(t *testing.T) {
	s, db := legacyImportService(t)
	if err := db.Create(&model.Project{ID: "project-cut", UserID: "owner", Name: "剪辑", Status: model.ProjectStatusActive}).Error; err != nil {
		t.Fatal(err)
	}
	resource := model.Resource{ID: "fixed-image", UserID: "owner", Kind: "image", Status: model.ResourceStatusReady}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatal(err)
	}
	initial, err := s.GetProjectTimeline("owner", "project-cut")
	if err != nil || initial.Exists || initial.Revision != 0 {
		t.Fatalf("initial read: %+v %v", initial, err)
	}
	var count int64
	db.Model(&model.ProjectTimeline{}).Count(&count)
	if count != 0 {
		t.Fatal("read created an empty cut")
	}
	makeCut := func(title string) json.RawMessage {
		raw, err := json.Marshal(map[string]any{"version": 2, "tracks": []any{map[string]any{"id": "video", "kind": "video"}}, "clips": []any{map[string]any{"id": "clip", "kind": "image", "trackId": "video", "startMs": 0, "durationMs": 2000, "title": title, "directMedia": map[string]any{"kind": "image", "storageKey": "resource:fixed-image", "url": "/api/resources/fixed-image/file"}}}, "durationMs": 999})
		if err != nil {
			t.Fatal(err)
		}
		return raw
	}
	first, err := s.SaveProjectTimeline("owner", "project-cut", SaveProjectTimelineRequest{ExpectedRevision: 0, Timeline: makeCut("first")})
	if err != nil || first.Revision != 1 {
		t.Fatalf("first save: %+v %v", first, err)
	}
	second, err := s.SaveProjectTimeline("owner", "project-cut", SaveProjectTimelineRequest{ExpectedRevision: 1, Timeline: makeCut("second")})
	if err != nil || second.Revision != 2 {
		t.Fatalf("second save: %+v %v", second, err)
	}
	if _, err := s.SaveProjectTimeline("owner", "project-cut", SaveProjectTimelineRequest{ExpectedRevision: 1, Timeline: makeCut("stale window")}); err == nil {
		t.Fatal("stale window overwrote current cut")
	}
	loaded, err := s.GetProjectTimeline("owner", "project-cut")
	if err != nil || string(loaded.Timeline) != string(second.Timeline) {
		t.Fatal("cut did not survive a fresh read")
	}
	var timeline map[string]any
	if err := json.Unmarshal(loaded.Timeline, &timeline); err != nil || timeline["durationMs"] != float64(2000) {
		t.Fatal("duration did not follow clip ends")
	}
	if _, err := s.GetProjectTimeline("other", "project-cut"); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("cross-owner read allowed: %v", err)
	}
	if _, err := s.SaveProjectTimeline("other", "project-cut", SaveProjectTimelineRequest{ExpectedRevision: 2, Timeline: makeCut("other user")}); err == nil {
		t.Fatal("cross-owner write allowed")
	}
	refs, err := s.repo.ResourceReferenceSnapshot("owner", "", []string{"fixed-image"})
	if err != nil {
		t.Fatal(err)
	}
	protected := false
	for _, ref := range refs.Documents {
		if ref.Kind == "项目剪辑" {
			protected = true
		}
	}
	if !protected {
		t.Fatal("timeline did not protect fixed source resource")
	}
}

func TestProjectTimelineRejectsInvalidTimingAndForeignMedia(t *testing.T) {
	s, db := legacyImportService(t)
	db.Create(&model.Project{ID: "project-cut", UserID: "owner", Name: "剪辑", Status: model.ProjectStatusActive})
	db.Create(&model.Resource{ID: "foreign", UserID: "other", Kind: "video", Status: model.ResourceStatusReady})
	for _, raw := range []string{
		`{"version":2,"tracks":[{"id":"v","kind":"video"}],"clips":[{"id":"c","kind":"video","trackId":"v","startMs":0,"durationMs":1000,"directMedia":{"storageKey":"resource:foreign"}}]}`,
		`{"version":2,"tracks":[{"id":"v","kind":"video"}],"clips":[{"id":"c","kind":"video","trackId":"v","startMs":-1,"durationMs":1000}]}`,
		`{"version":2,"tracks":[{"id":"v","kind":"video"}],"clips":[{"id":"c","kind":"text","trackId":"v","startMs":0,"durationMs":1000},{"id":"c","kind":"text","trackId":"v","startMs":1000,"durationMs":1000}]}`,
	} {
		if _, err := s.SaveProjectTimeline("owner", "project-cut", SaveProjectTimelineRequest{Timeline: json.RawMessage(raw)}); err == nil {
			t.Fatalf("invalid cut accepted: %s", raw)
		}
	}
	var count int64
	if err := db.Model(&model.ProjectTimeline{}).Count(&count).Error; err != nil || count != 0 {
		t.Fatal("invalid cut persisted")
	}
}
