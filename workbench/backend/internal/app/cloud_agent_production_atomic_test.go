package app

import (
	"errors"
	"testing"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

func TestNativeProductionMetadataRollbackCannotLeaveDuplicateOrPhantomReceipt(t *testing.T) {
	s, db, run, state := agentImageOperationFixture(t, "auto")
	project := model.Project{ID: "atomic-production-project", UserID: "user", Name: "事务验收", Status: model.ProjectStatusActive, Revision: 1}
	if err := db.Create(&project).Error; err != nil {
		t.Fatal(err)
	}
	if err := s.repo.AssignCanvasToProject("user", state.Request.CanvasID, project.ID); err != nil {
		t.Fatal(err)
	}
	state.Request.ContextScope = []string{"canvas", "project"}
	state.Request.ProductionProjectID = project.ID
	call := cloudAgentCall{ID: "atomic-production-call-01"}
	call.Function.Name = "production_edit"
	call.Function.Arguments = `{"action":"unit.create","intentId":"atomic-production-intent-01","arguments":{"request":{"title":"原生章节","sourceText":"<p>保留原文</p>"}}}`
	state.Calls, state.CallIndex = []cloudAgentCall{call}, 0
	if err := s.repo.MutateCloudAgent("user", run.ID, run.Revision, func(current *model.CloudAgentExecution, _ *repository.Repository) error {
		return cloudAgentSave(current, &state)
	}); err != nil {
		t.Fatal(err)
	}
	run, state = reloadAgentImageOperation(t, s, run.ID)
	injected := false
	if err := db.Callback().Update().Before("gorm:update").Register("test:production-receipt-failure", func(tx *gorm.DB) {
		var chapters int64
		if _, savingExecution := tx.Statement.Dest.(*model.CloudAgentExecution); !savingExecution || injected {
			return
		}
		if err := tx.Session(&gorm.Session{NewDB: true}).Model(&model.ProjectUnit{}).Where("project_id = ?", project.ID).Count(&chapters).Error; err != nil {
			tx.AddError(err)
			return
		}
		if chapters > 0 {
			injected = true
			tx.AddError(errors.New("declared checkpoint write failure"))
		}
	}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Callback().Update().Remove("test:production-receipt-failure") })
	if err := s.advanceCloudAgentProduction(run, &state, call); err == nil || !injected {
		t.Fatal("checkpoint failure was not exercised", err)
	}
	if state.ProductionIntents["atomic-production-intent-01"] == nil || state.ProductionIntents["atomic-production-intent-01"].Complete || state.CallIndex != 0 {
		t.Fatal("rolled back mutation survived in memory as complete")
	}
	var count int64
	if err := db.Model(&model.ProjectUnit{}).Where("project_id = ?", project.ID).Count(&count).Error; err != nil || count != 0 {
		t.Fatal("chapter survived receipt rollback", count, err)
	}
	current, err := s.repo.ProjectForUser("user", project.ID)
	if err != nil || current.Revision != project.Revision {
		t.Fatal("project revision survived rollback", err)
	}
	if err := db.Callback().Update().Remove("test:production-receipt-failure"); err != nil {
		t.Fatal(err)
	}
	run, state = reloadAgentImageOperation(t, s, run.ID)
	if err := s.advanceCloudAgentProduction(run, &state, call); err != nil {
		t.Fatal(err)
	}
	_, state = reloadAgentImageOperation(t, s, run.ID)
	if !state.ProductionIntents["atomic-production-intent-01"].Complete {
		t.Fatal("retry lacks committed native receipt")
	}
	if err := db.Model(&model.ProjectUnit{}).Where("project_id = ?", project.ID).Count(&count).Error; err != nil || count != 1 {
		t.Fatal("retry did not create exactly one chapter", count, err)
	}
}
