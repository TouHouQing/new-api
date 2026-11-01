package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"testing"
	"time"

	"yingce/backend/internal/model"
)

func TestTaskPageUsesCreationTimeAndIDWithoutLosingOlderTranscriptions(t *testing.T) {
	svc, db := newProjectWorkflowV2TestService(t)
	if err := db.AutoMigrate(&model.BillingOrder{}, &model.ApiCallLog{}); err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	expected := []model.Task{}
	rows := []model.Task{}
	for i := 0; i < 125; i++ {
		task := model.Task{ID: fmt.Sprintf("random-%03d", 124-i), UserID: "owner", ProjectID: "project", Type: model.TaskTypeTimelineTranscription, Status: model.TaskStatusSucceeded, InputJSON: `{"config":{"apiKey":"private-marker"},"resourceId":"sound"}`, ResultJSON: `{"segments":[]}`, CreatedAt: now.Add(time.Duration(i%7) * time.Second), UpdatedAt: now}
		rows = append(rows, task)
		expected = append(expected, task)
		rows = append(rows, model.Task{ID: fmt.Sprintf("new-video-%03d", i), UserID: "owner", ProjectID: "project", Type: "canvas_video", Status: model.TaskStatusSucceeded, CreatedAt: now.Add(time.Hour), InputJSON: `{}`})
	}
	rows = append(rows, model.Task{ID: "foreign-user", UserID: "someone-else", ProjectID: "project", Type: model.TaskTypeTimelineTranscription, Status: model.TaskStatusSucceeded, CreatedAt: now, InputJSON: `{}`}, model.Task{ID: "foreign-project", UserID: "owner", ProjectID: "another-project", Type: model.TaskTypeTimelineTranscription, Status: model.TaskStatusSucceeded, CreatedAt: now, InputJSON: `{}`})
	if err := db.CreateInBatches(rows, 25).Error; err != nil {
		t.Fatal(err)
	}
	sort.Slice(expected, func(i, j int) bool {
		if expected[i].CreatedAt.Equal(expected[j].CreatedAt) {
			return expected[i].ID > expected[j].ID
		}
		return expected[i].CreatedAt.After(expected[j].CreatedAt)
	})
	input := TaskPageRequest{Limit: 30, ProjectID: "project", Type: model.TaskTypeTimelineTranscription}
	seen := []string{}
	pages := 0
	for {
		page, err := svc.TaskPage("owner", input)
		if err != nil {
			t.Fatal(err)
		}
		encoded, _ := json.Marshal(page)
		if strings.Contains(string(encoded), "private-marker") || strings.Contains(string(encoded), "inputJson") || strings.Contains(string(encoded), "resultJson") {
			t.Fatal("task list leaked protected documents")
		}
		for _, task := range page.Tasks {
			seen = append(seen, task.ID)
		}
		pages++
		if pages > 5 {
			t.Fatal("cursor did not advance")
		}
		if page.NextCursor == "" {
			break
		}
		if pages == 1 {
			// A recently updated old job must not jump to another page.
			if err := db.Model(&model.Task{}).Where("id = ?", expected[90].ID).Update("updated_at", now.Add(10*time.Hour)).Error; err != nil {
				t.Fatal(err)
			}
			if err := db.Create(&model.Task{ID: "newly-created", UserID: "owner", ProjectID: "project", Type: model.TaskTypeTimelineTranscription, Status: model.TaskStatusSucceeded, CreatedAt: now.Add(2 * time.Hour), InputJSON: `{}`}).Error; err != nil {
				t.Fatal(err)
			}
			_, err = svc.TaskPage("owner", TaskPageRequest{Limit: 30, ProjectID: "another-project", Type: input.Type, Cursor: page.NextCursor})
			var conflict *AppError
			if !errors.As(err, &conflict) || conflict.Status != 400 {
				t.Fatal("cursor crossed project filters")
			}
		}
		input.Cursor = page.NextCursor
	}
	if len(seen) != len(expected) {
		t.Fatalf("history lost or repeated rows: got %d want %d", len(seen), len(expected))
	}
	for i, id := range seen {
		if id != expected[i].ID {
			t.Fatalf("wrong cursor order at %d: %s", i, id)
		}
	}
}

func TestTaskPageRejectsMalformedScopeAndSupportsZeroLegacyTimestamps(t *testing.T) {
	svc, db := newProjectWorkflowV2TestService(t)
	if err := db.AutoMigrate(&model.BillingOrder{}, &model.ApiCallLog{}); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"old-a", "old-b"} {
		task := model.Task{ID: id, UserID: "owner", ProjectID: "project", Type: model.TaskTypeTimelineTranscription, InputJSON: `{}`}
		if err := db.Create(&task).Error; err != nil {
			t.Fatal(err)
		}
		if err := db.Model(&task).UpdateColumn("created_at", time.Time{}).Error; err != nil {
			t.Fatal(err)
		}
	}
	input := TaskPageRequest{Limit: 1, ProjectID: "project", Type: model.TaskTypeTimelineTranscription}
	first, err := svc.TaskPage("owner", input)
	if err != nil || first.NextCursor == "" {
		t.Fatalf("first old page: %v", err)
	}
	input.Cursor = first.NextCursor
	second, err := svc.TaskPage("owner", input)
	if err != nil || len(second.Tasks) != 1 || second.Tasks[0].ID == first.Tasks[0].ID || second.NextCursor != "" {
		t.Fatalf("zero timestamp cursor failed: %v", err)
	}
	for _, bad := range []TaskPageRequest{{Limit: 101}, {Limit: 0}, {Limit: 1, Cursor: "not-base64!"}, {Limit: 1, Cursor: strings.Repeat("x", 1025)}} {
		if _, err := svc.TaskPage("owner", bad); err == nil {
			t.Fatal("invalid paging parameters accepted")
		}
	}
}
