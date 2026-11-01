package app

import (
	"encoding/json"
	"strings"
	"testing"

	"yingce/backend/internal/model"
)

func TestTaskHistoryReadsOwnedNativeCanvasLabelsWithoutBrowserState(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	for _, canvas := range []model.CanvasProject{
		{ID: "native-canvas", UserID: "owner", ProjectID: "film-project", Title: "MCP 新建画布", PayloadJSON: `{"private":"not-a-list-field"}`},
		{ID: "foreign-canvas", UserID: "another-user", Title: "foreign-private-title", PayloadJSON: `{}`},
	} {
		if err := db.Create(&canvas).Error; err != nil {
			t.Fatal(err)
		}
	}
	for _, task := range []model.Task{
		{ID: "one", UserID: "owner", ProjectID: "native-canvas", Type: "canvas_image"},
		{ID: "two", UserID: "owner", ProjectID: "native-canvas", Type: "canvas_text"},
		{ID: "foreign", UserID: "owner", ProjectID: "foreign-canvas", Type: "canvas_video"},
		{ID: "removed", UserID: "owner", ProjectID: "removed-canvas", Type: "canvas_audio"},
		{ID: "project", UserID: "owner", ProjectID: "film-project", Type: "timeline_render"},
	} {
		task.Status, task.InputJSON = model.TaskStatusSucceeded, `{}`
		if err := db.Create(&task).Error; err != nil {
			t.Fatal(err)
		}
	}
	check := func(title string) {
		t.Helper()
		page, err := s.TaskPage("owner", TaskPageRequest{Limit: 20})
		if err != nil {
			t.Fatal(err)
		}
		if len(page.Tasks) != 5 {
			t.Fatal("task list changed", len(page.Tasks))
		}
		for _, task := range page.Tasks {
			switch task.ID {
			case "one", "two":
				if task.CanvasContext == nil || task.CanvasContext.Status != "available" || task.CanvasContext.Title != title || task.CanvasContext.ProjectID != "film-project" {
					t.Fatal("native label missing", task)
				}
			case "foreign", "removed":
				if task.CanvasContext == nil || task.CanvasContext.Status != "unavailable" || task.CanvasContext.Title != "" || task.CanvasContext.ProjectID != "" {
					t.Fatal("unavailable canvas leaked context", task)
				}
			case "project":
				if task.CanvasContext != nil {
					t.Fatal("project task was mislabeled as a removed canvas", task)
				}
			}
		}
		raw, _ := json.Marshal(page)
		if strings.Contains(string(raw), "foreign-private-title") || strings.Contains(string(raw), "not-a-list-field") {
			t.Fatal("task history exposed a foreign label or canvas payload")
		}
	}
	check("MCP 新建画布")
	if err := db.Model(&model.CanvasProject{}).Where("id = ?", "native-canvas").Update("title", "另一台设备改名").Error; err != nil {
		t.Fatal(err)
	}
	check("另一台设备改名")
}

func TestTaskHistoryCanvasReadFailureCannotMasqueradeAsDeletion(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	if err := db.Create(&model.Task{ID: "task", UserID: "owner", ProjectID: "canvas", Type: "canvas_image", InputJSON: `{}`}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Migrator().DropTable(&model.CanvasProject{}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.TaskPage("owner", TaskPageRequest{Limit: 20}); err == nil {
		t.Fatal("database failure became a false unavailable/deleted result")
	}
}
