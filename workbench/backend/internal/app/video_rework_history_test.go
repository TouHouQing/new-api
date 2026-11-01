package app

import (
	"encoding/json"
	"gorm.io/gorm"
	"testing"
	"time"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
)

func TestNativeVideoReworkHistoryOwnedOccurrencePaginationAndColdRecovery(t *testing.T) {
	s, db := legacyImportService(t)
	verifyVideoReworkHistory(t, s, db)
}
func TestNativeVideoReworkHistoryPostgresUsesSameSourceAndCursor(t *testing.T) {
	s, db := newProjectNameConflictPostgresService(t)
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	verifyVideoReworkHistory(t, s, db)
}
func verifyVideoReworkHistory(t *testing.T, s *Service, db *gorm.DB) {
	t.Helper()
	user := model.User{ID: "owner", Username: "owner", Role: model.UserRoleUser, Status: model.UserStatusActive}
	if err := db.Where("id = ?", user.ID).FirstOrCreate(&user).Error; err != nil {
		t.Fatal(err)
	}
	project := "repair-history-project"
	if err := db.Create(&model.Project{ID: project, UserID: "owner", Name: "修复历史", Status: model.ProjectStatusActive, Revision: 1}).Error; err != nil {
		t.Fatal(err)
	}
	target := "one-use_%!"
	raw := json.RawMessage(`{"version":2,"tracks":[{"id":"v","kind":"video","order":0}],"clips":[{"id":"one-use_%!","kind":"video","trackId":"v","startMs":0,"durationMs":2000,"sourceStartMs":0,"sourceDurationMs":2000,"directMedia":{"id":"original","kind":"video","storageKey":"resource:original"}},{"id":"one-use-AX!","kind":"video","trackId":"v","startMs":2000,"durationMs":2000,"sourceStartMs":0,"sourceDurationMs":2000,"directMedia":{"id":"original","kind":"video","storageKey":"resource:original"}}],"durationMs":4000}`)
	if err := db.Create(&model.ProjectTimeline{ProjectID: project, UserID: "owner", PayloadJSON: string(raw), Revision: 1}).Error; err != nil {
		t.Fatal(err)
	}
	facts := production.VideoReworkMedia{ResourceID: "original", SHA256: projectCreationHash([]byte("original")), Width: 512, Height: 512, DurationMs: 2000}
	candidate := facts
	candidate.ResourceID = "candidate"
	candidate.SHA256 = projectCreationHash([]byte("candidate"))
	inputFor := func(clip string) string {
		t.Helper()
		_, hash, err := production.ReadVideoReworkClip(raw, clip)
		if err != nil {
			t.Fatal(err)
		}
		request := VideoReworkCreateRequest{RequestID: "history-stable-request-0001", ExpectedRevision: 1, Edit: production.VideoReworkRequest{ClipID: clip, ClipSHA256: hash, SourceResourceID: facts.ResourceID, SourceSHA256: facts.SHA256, SourceStartMs: 500, SourceEndMs: 1500, CandidateResourceID: candidate.ResourceID, CandidateSHA256: candidate.SHA256, CandidateStartMs: 0, Audio: "original"}}
		plan, err := production.PlanVideoRework(raw, request.Edit, facts, candidate)
		if err != nil {
			t.Fatal(err)
		}
		encoded, _ := json.Marshal(videoReworkInput{Version: 1, ProjectID: project, Request: request, RequestSHA256: cutSignature(request), SourceTimeline: raw, Plan: plan})
		return string(encoded)
	}
	base := time.Date(2026, 10, 30, 0, 0, 0, 0, time.UTC)
	input := inputFor(target)
	for _, id := range []string{"saved-repair-a", "saved-repair-b", "saved-repair-c"} {
		if err := db.Create(&model.Task{ID: id, UserID: "owner", ProjectID: project, Type: model.TaskTypeVideoRework, Status: model.TaskStatusSucceeded, Provider: "local", Model: "ffmpeg", InputJSON: input, CreatedAt: base}).Error; err != nil {
			t.Fatal(err)
		}
	}
	other := inputFor("one-use-AX!")
	for i := 0; i < 60; i++ {
		if err := db.Create(&model.Task{ID: newID(), UserID: "owner", ProjectID: project, Type: model.TaskTypeVideoRework, Status: model.TaskStatusSucceeded, Provider: "local", Model: "ffmpeg", InputJSON: other, CreatedAt: base.Add(time.Hour)}).Error; err != nil {
			t.Fatal(err)
		}
	}
	if err := db.Create(&model.Task{ID: "foreign-owner-repair", UserID: "foreign", ProjectID: project, Type: model.TaskTypeVideoRework, Status: model.TaskStatusSucceeded, Provider: "local", Model: "ffmpeg", InputJSON: input, CreatedAt: base.Add(time.Hour)}).Error; err != nil {
		t.Fatal(err)
	}
	cursor := ""
	for _, id := range []string{"saved-repair-c", "saved-repair-b", "saved-repair-a"} {
		page, err := s.ReadVideoReworkHistory("owner", project, target, cursor, 1)
		if err != nil || len(page.Entries) != 1 || page.Entries[0].TaskID != id {
			t.Fatalf("source history omitted or mixed records: %+v %v", page, err)
		}
		if id != "saved-repair-a" && page.NextCursor == "" {
			t.Fatal("stable tied-page cursor lost")
		}
		if id == "saved-repair-c" {
			if _, err := s.ReadVideoReworkHistory("owner", project, "one-use-AX!", page.NextCursor, 1); err == nil {
				t.Fatal("source cursor reused on another occurrence")
			}
		}
		cursor = page.NextCursor
	}
	if cursor != "" {
		t.Fatal("history never exhausted")
	}
	if _, err := s.ReadVideoReworkHistory("foreign", project, target, "", 10); err == nil {
		t.Fatal("foreign owner read history")
	}
	if _, err := s.ReadVideoReworkHistory("owner", project, target, "not-a-cursor", 10); err == nil {
		t.Fatal("invalid cursor admitted")
	}
	if _, err := s.ReadVideoReworkHistory("owner", project, target, "", 51); err == nil {
		t.Fatal("unbounded history admitted")
	}
}
