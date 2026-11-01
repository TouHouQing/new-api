package app

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
)

func projectStoryFixture(t *testing.T, s *Service, db *gorm.DB) (model.Project, *model.Task) {
	t.Helper()
	seedImageOperationSource(t, s, db)
	project, err := s.CreateProject("image-user", CreateProjectRequest{Name: "后台章节草稿", IdempotencyKey: "native-background-story-project"})
	if err != nil {
		t.Fatal(err)
	}
	input, _ := json.Marshal(map[string]any{"mode": "text", "metadata": map[string]any{"nativeProjectStory": projectStoryTarget{Version: 1, ExpectedProjectRevision: project.Revision}}})
	task := &model.Task{ID: "story-software-contract", UserID: "image-user", ProjectID: project.ID, Type: "canvas_text", Status: model.TaskStatusRunning, Attempts: 1, CanvasDeliveryStatus: "pending", InputJSON: string(input), CreatedAt: time.Now()}
	if err := s.createTaskWithinStorageQuota(task, nil, defaultRuntimePolicy()); err != nil {
		t.Fatal(err)
	}
	return project, task
}

func completeProjectStoryFixture(t *testing.T, s *Service, task *model.Task, text string) {
	t.Helper()
	result, _ := json.Marshal(map[string]any{"text": text})
	if err := s.saveTaskCompletionWithinStorageQuota(task, result, nil, false); err != nil {
		t.Fatal(err)
	}
}

func verifyNativeProjectStory(t *testing.T, s *Service, db *gorm.DB) {
	t.Helper()
	project, task := projectStoryFixture(t, s, db)
	completeProjectStoryFixture(t, s, task, "```json\n{\"title\":\"站台\",\"chapters\":[{\"title\":\"重逢\",\"content\":\"夜雨中的站台。\"},{\"title\":\"离开\",\"content\":\"列车缓慢离开。\"}]}\n```")
	units, err := s.repo.ProjectUnits(project.ID)
	if err != nil || len(units) != 2 {
		t.Fatal("successful model task lost durable chapters", units, err)
	}
	stored, _ := s.repo.Task(task.ID)
	if stored.Status != model.TaskStatusSucceeded || stored.CanvasDeliveryStatus != "applied" || stored.Attempts != 1 {
		t.Fatal("chapter adoption changed original model state", stored)
	}
	view, err := s.ProjectStoryResult(task.UserID, project.ID, task.ID)
	if err != nil || view.Status != "adopted" || !view.Current || len(view.UnitIDs) != 2 {
		t.Fatal(view, err)
	}
	if err := s.reconcileCanvasTaskDelivery(context.Background(), task.ID); err != nil {
		t.Fatal(err)
	}
	again, _ := s.repo.ProjectUnits(project.ID)
	if len(again) != 2 || again[0].ID != units[0].ID {
		t.Fatal("old callback duplicated chapters")
	}
	if err := s.DeleteProjectUnit(task.UserID, project.ID, units[0].ID); err != nil {
		t.Fatal(err)
	}
	view, err = s.ProjectStoryResult(task.UserID, project.ID, task.ID)
	if err != nil || view.Status != "adopted" || view.Current {
		t.Fatal("historical receipt concealed later deletion", view, err)
	}
	if _, err := s.ProjectStoryResult("other", project.ID, task.ID); err == nil {
		t.Fatal("foreign account read generated script")
	}
}

func TestProjectStoryAdoptsEveryChapterWithoutBrowserAndRetainsDeletion(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	verifyNativeProjectStory(t, s, db)
}
func TestProjectStoryPostgresAtomicAppend(t *testing.T) {
	s, db := newProjectNameConflictPostgresService(t)
	s.dataDir = t.TempDir()
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	verifyNativeProjectStory(t, s, db)
}

func TestProjectStoryInvalidReplyOrConcurrentEditPreservesAllOriginalContent(t *testing.T) {
	for _, mode := range []string{"partial", "non-json", "concurrent", "archived"} {
		t.Run(mode, func(t *testing.T) {
			s, db := newMediaRecoveryTestService(t)
			project, task := projectStoryFixture(t, s, db)
			text := `{"chapters":[{"title":"第一章","content":"原回复"}]}`
			switch mode {
			case "partial":
				text = `{"chapters":[{"title":"第一章","content":"原回复"},{"title":"空章节","content":""}]}`
			case "non-json":
				text = "尚未形成完整JSON的原始回复"
			case "concurrent":
				if _, err := s.CreateProjectUnit(task.UserID, project.ID, CreateProjectUnitRequest{Title: "用户后来添加", SourceText: "<p>用户内容</p>"}); err != nil {
					t.Fatal(err)
				}
			case "archived":
				if err := db.Model(&model.Project{}).Where("id = ?", project.ID).Update("status", model.ProjectStatusArchived).Error; err != nil {
					t.Fatal(err)
				}
			}
			completeProjectStoryFixture(t, s, task, text)
			view, err := s.ProjectStoryResult(task.UserID, project.ID, task.ID)
			if err != nil || view.Status != "needs_review" {
				t.Fatal(view, err)
			}
			units, _ := s.repo.ProjectUnits(project.ID)
			expected := 0
			if mode == "concurrent" {
				expected = 1
			}
			if len(units) != expected {
				t.Fatal("invalid reply partly imported or overwrote user work", units)
			}
			stored, _ := s.repo.Task(task.ID)
			var raw struct {
				Text string `json:"text"`
			}
			if json.Unmarshal([]byte(stored.ResultJSON), &raw) != nil || raw.Text != text || stored.Status != model.TaskStatusSucceeded || stored.Attempts != 1 {
				t.Fatal("original model reply was replaced")
			}
		})
	}
}

func TestProjectStoryStorageFailureRollsBackAndRecoversOriginalTask(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	project, task := projectStoryFixture(t, s, db)
	if err := db.Exec(`CREATE TRIGGER reject_story_unit BEFORE INSERT ON project_units BEGIN SELECT RAISE(ABORT, 'isolated chapter storage failure'); END`).Error; err != nil {
		t.Fatal(err)
	}
	completeProjectStoryFixture(t, s, task, `{"chapters":[{"title":"一","content":"第一段"},{"title":"二","content":"第二段"}]}`)
	stored, _ := s.repo.Task(task.ID)
	units, _ := s.repo.ProjectUnits(project.ID)
	if stored.Status != model.TaskStatusSucceeded || stored.CanvasDeliveryStatus != "pending" || len(units) != 0 {
		t.Fatal("storage failure lost task or left half a script")
	}
	if err := db.Exec("DROP TRIGGER reject_story_unit").Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&model.Task{}).Where("id = ?", task.ID).Update("canvas_delivery_next_attempt_at", nil).Error; err != nil {
		t.Fatal(err)
	}
	restarted := &Service{repo: s.repo, dataDir: s.dataDir}
	if err := restarted.reconcileCanvasTaskDelivery(context.Background(), task.ID); err != nil {
		t.Fatal(err)
	}
	units, _ = s.repo.ProjectUnits(project.ID)
	after, _ := s.repo.Task(task.ID)
	if len(units) != 2 || after.CanvasDeliveryStatus != "applied" || after.ResultJSON != stored.ResultJSON || after.Attempts != 1 {
		t.Fatal("recovery did not use the original complete reply")
	}
}
