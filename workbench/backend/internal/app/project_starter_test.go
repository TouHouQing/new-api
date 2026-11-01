package app

import (
	"context"
	"encoding/json"
	"testing"

	"gorm.io/gorm"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
)

func verifyProjectStarterGoals(t *testing.T, s *Service, db *gorm.DB) {
	t.Helper()
	seedImageOperationSource(t, s, db)
	if err := db.Model(&model.User{}).Where("id = ?", "image-user").Update("status", model.UserStatusActive).Error; err != nil {
		t.Fatal(err)
	}
	for _, preset := range ProjectStarterPresets() {
		t.Run(preset.Goal, func(t *testing.T) {
			req := CreateProjectRequest{Name: "创作起点 · " + preset.Goal, IdempotencyKey: "native-starter-" + preset.Key + "-once", Type: "short-drama", AspectRatio: "16:9", SourceType: "template", CreativeBrief: &model.ProjectCreativeBrief{Version: 1, Goal: preset.Goal, KeyMessage: "把这个主题讲清楚", TargetDurationMs: 15000, Language: "zh-CN"}, Starter: &ProjectStarterRequest{Entry: "template", PresetKey: preset.Key}}
			project, err := s.CreateProject("image-user", req)
			if err != nil {
				t.Fatal(err)
			}
			units, err := s.repo.ProjectUnits(project.ID)
			if err != nil || len(units) != 1 {
				t.Fatal("starter unit not atomic", units, err)
			}
			var shots []model.Shot
			if err := db.Where("project_id = ?", project.ID).Order("position").Find(&shots).Error; err != nil || len(shots) != len(preset.Steps) {
				t.Fatal("template shots missing", len(shots), err)
			}
			var total int64
			for _, shot := range shots {
				total += shot.DurationMs
				if shot.UnitID != units[0].ID || shot.Status != "draft" {
					t.Fatal("template is not an editable native draft", shot)
				}
			}
			if total != 15000 {
				t.Fatal("draft duration differs from selected brief", total)
			}
			var tasks int64
			if err := db.Model(&model.Task{}).Count(&tasks).Error; err != nil || tasks != 0 {
				t.Fatal("template silently invoked a model", tasks, err)
			}
			updated := units[0]
			updated.Title = "用户后来改名"
			if err := db.Model(&model.ProjectUnit{}).Where("id = ?", updated.ID).Update("title", updated.Title).Error; err != nil {
				t.Fatal(err)
			}
			again, err := s.CreateProject("image-user", req)
			if err != nil || again.ID != project.ID {
				t.Fatal("lost creation reply duplicated project", err)
			}
			units, err = s.repo.ProjectUnits(project.ID)
			if err != nil || len(units) != 1 || units[0].Title != updated.Title {
				t.Fatal("creation replay overwrote user edits", units, err)
			}
			req.Starter.SourceText = "不同的初始内容"
			if _, err := s.CreateProject("image-user", req); err == nil {
				t.Fatal("same creation intent accepted another starter")
			}
		})
	}
}

func TestProjectStarterSixGoalsAreNativeAtomicAndReplayable(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	verifyProjectStarterGoals(t, s, db)
}

func TestProjectStarterPostgresSixGoalsAndVersions(t *testing.T) {
	s, db := newProjectNameConflictPostgresService(t)
	s.dataDir = t.TempDir()
	s.activeCancels = map[string]context.CancelFunc{}
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	verifyProjectStarterGoals(t, s, db)
}

func TestProjectStarterUploadsRetainOriginalResourcesAndRejectForeignSourcesAtomically(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	resource, beforeBytes := seedImageOperationSource(t, s, db)
	if err := db.Model(&model.User{}).Where("id = ?", "image-user").Update("status", model.UserStatusActive).Error; err != nil {
		t.Fatal(err)
	}
	request := CreateProjectRequest{Name: "上传起步", IdempotencyKey: "native-starter-upload-unchanged", AspectRatio: "9:16", SourceType: "upload", CreativeBrief: &model.ProjectCreativeBrief{Version: 1, Goal: "product", KeyMessage: "展示绿植", Language: "zh-CN"}, Starter: &ProjectStarterRequest{Entry: "upload", ResourceID: resource.ID}}
	project, err := s.CreateProject("image-user", request)
	if err != nil {
		t.Fatal(err)
	}
	var canvases []model.CanvasProject
	if err := db.Where("user_id = ?", "image-user").Find(&canvases).Error; err != nil || len(canvases) != 1 {
		t.Fatal("uploaded source is not in a linked native canvas", len(canvases), err)
	}
	var doc map[string]any
	if err := json.Unmarshal([]byte(canvases[0].PayloadJSON), &doc); err != nil {
		t.Fatal(err)
	}
	nodes := creationMaps(doc["nodes"])
	if doc["projectId"] != project.ID || len(nodes) != 1 || nodes[0]["metadata"].(map[string]any)["storageKey"] != "resource:"+resource.ID {
		t.Fatal("upload not adopted as exact resource", doc)
	}
	after, err := s.readImageOperationSource("image-user", resource.ID)
	if err != nil || string(beforeBytes) != string(after) {
		t.Fatal("starter changed uploaded source bytes", err)
	}
	request.Name, request.IdempotencyKey, request.Starter.ResourceID = "禁止越权", "native-starter-upload-foreign", "foreign"
	if err := db.Create(&model.Resource{ID: "foreign", UserID: "other", Kind: "image", Status: "ready", MimeType: "image/png", Size: 50}).Error; err != nil {
		t.Fatal(err)
	}
	var before, following int64
	if err := db.Model(&model.Project{}).Count(&before).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateProject("image-user", request); err == nil {
		t.Fatal("foreign resource accepted")
	}
	if err := db.Model(&model.Project{}).Count(&following).Error; err != nil {
		t.Fatal(err)
	}
	if before != following {
		t.Fatal("rejected starter left a partial project")
	}
}
