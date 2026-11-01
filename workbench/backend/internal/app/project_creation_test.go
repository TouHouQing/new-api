package app

import (
	"errors"
	"net/http"
	"sync"
	"testing"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
)

func TestProjectCreationIntentSurvivesRetryRenameAndDeletion(t *testing.T) {
	for _, dialect := range []string{"sqlite", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			var service *Service
			var db *gorm.DB
			if dialect == "postgres" {
				service, db = newProjectNameConflictPostgresService(t)
			} else {
				service, db = newProjectSettingsTestService(t)
			}
			if err := db.AutoMigrate(&model.Project{}, &model.ProjectCreationReceipt{}, &model.WorkflowTemplateVersion{}, &model.WorkflowInstance{}, &model.WorkflowStepInstance{}); err != nil {
				t.Fatal(err)
			}
			request := CreateProjectRequest{Name: "原始创作", IdempotencyKey: "native-project-intent-1234", Description: "固定创作意图"}
			first, err := service.CreateProject("creator", request)
			if err != nil {
				t.Fatal(err)
			}
			if err := db.Model(&model.Project{}).Where("id = ?", first.ID).Update("name", "用户后来改名").Error; err != nil {
				t.Fatal(err)
			}
			replayed, err := service.CreateProject("creator", request)
			if err != nil {
				t.Fatal(err)
			}
			if replayed.ID != first.ID || replayed.Name != "用户后来改名" {
				t.Fatalf("retry replaced project: %+v", replayed)
			}
			changed := request
			changed.Description = "另一个创作要求"
			_, err = service.CreateProject("creator", changed)
			requireProjectCreationStatus(t, err, http.StatusConflict)
			other, err := service.CreateProject("another-user", request)
			if err != nil || other.ID == first.ID {
				t.Fatalf("cross-user identity not isolated: %v", err)
			}
			var workflows int64
			if err := db.Model(&model.WorkflowInstance{}).Where("project_id = ?", first.ID).Count(&workflows).Error; err != nil || workflows != 1 {
				t.Fatalf("workflows = %d: %v", workflows, err)
			}
			if err := db.Delete(&model.Project{}, "id = ?", first.ID).Error; err != nil {
				t.Fatal(err)
			}
			_, err = service.CreateProject("creator", request)
			requireProjectCreationStatus(t, err, http.StatusGone)
			var count int64
			db.Model(&model.Project{}).Where("user_id = ?", "creator").Count(&count)
			if count != 0 {
				t.Fatal("retry recreated deleted project")
			}
		})
	}
}

func requireProjectCreationStatus(t *testing.T, err error, status int) {
	t.Helper()
	var failure *AppError
	if !errors.As(err, &failure) || failure.Status != status {
		t.Fatalf("error = %v; want status %d", err, status)
	}
}

func TestProjectCreationRollsBackProjectWorkflowAndReceipt(t *testing.T) {
	service, db := newProjectWorkflowV2TestService(t)
	if err := db.AutoMigrate(&model.ProjectCreationReceipt{}); err != nil {
		t.Fatal(err)
	}
	if err := service.EnsureBuiltinProjectWorkflowTemplate(); err != nil {
		t.Fatal(err)
	}
	if err := db.Callback().Create().Before("gorm:create").Register("test:reject-project-workflow", func(tx *gorm.DB) {
		if tx.Statement.Table == "workflow_step_instances" {
			tx.AddError(errors.New("controlled workflow failure"))
		}
	}); err != nil {
		t.Fatal(err)
	}
	request := CreateProjectRequest{Name: "失败后可恢复的项目", IdempotencyKey: "atomic-create-project-1234"}
	if _, err := service.CreateProject("creator", request); err == nil {
		t.Fatal("controlled failure was accepted")
	}
	for _, table := range []any{&model.Project{}, &model.WorkflowInstance{}, &model.WorkflowStepInstance{}, &model.ProjectCreationReceipt{}} {
		var count int64
		if err := db.Model(table).Count(&count).Error; err != nil || count != 0 {
			t.Fatalf("partial project transaction: count=%d error=%v", count, err)
		}
	}
	if err := db.Callback().Create().Remove("test:reject-project-workflow"); err != nil {
		t.Fatal(err)
	}
	if _, err := service.CreateProject("creator", request); err != nil {
		t.Fatal(err)
	}
}

func TestConcurrentProjectCreationUsesOneWorkflow(t *testing.T) {
	service, db := newProjectNameConflictPostgresService(t)
	if err := db.AutoMigrate(&model.Project{}, &model.ProjectCreationReceipt{}, &model.WorkflowTemplateVersion{}, &model.WorkflowInstance{}, &model.WorkflowStepInstance{}); err != nil {
		t.Fatal(err)
	}
	if err := service.EnsureBuiltinProjectWorkflowTemplate(); err != nil {
		t.Fatal(err)
	}
	var group sync.WaitGroup
	ids := make(chan string, 4)
	failures := make(chan error, 4)
	for range 4 {
		group.Add(1)
		go func() {
			defer group.Done()
			project, err := service.CreateProject("creator", CreateProjectRequest{Name: "并发创作", IdempotencyKey: "concurrent-project-1234"})
			if err != nil {
				failures <- err
			} else {
				ids <- project.ID
			}
		}()
	}
	group.Wait()
	close(ids)
	close(failures)
	for err := range failures {
		t.Fatal(err)
	}
	unique := map[string]bool{}
	for id := range ids {
		unique[id] = true
	}
	if len(unique) != 1 {
		t.Fatalf("created %d projects", len(unique))
	}
	for _, table := range []any{&model.Project{}, &model.WorkflowInstance{}, &model.ProjectCreationReceipt{}} {
		var count int64
		if err := db.Model(table).Count(&count).Error; err != nil || count != 1 {
			t.Fatalf("duplicate creation: count=%d error=%v", count, err)
		}
	}
}

func TestProjectCreationRejectsInvalidRequestIdentity(t *testing.T) {
	service, _ := newProjectSettingsTestService(t)
	for _, key := range []string{"short", "with space-in-key-1234", "\nnewline-in-key-1234", "非ASCII请求编号123456789"} {
		_, err := service.CreateProject("creator", CreateProjectRequest{Name: "不可创建", IdempotencyKey: key})
		requireProjectCreationStatus(t, err, http.StatusBadRequest)
	}
}
