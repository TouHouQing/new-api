package app

import (
	"errors"
	"gorm.io/gorm"
	"testing"
	"time"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

func TestNativeProductionUnitSaveCASRetainsConcurrentSource(t *testing.T) {
	s, db := legacyImportService(t)
	verifyProductionUnitCAS(t, s, db)
}
func TestNativeProductionUnitSaveCASPostgresRetainsConcurrentSource(t *testing.T) {
	s, db := newProjectNameConflictPostgresService(t)
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	verifyProductionUnitCAS(t, s, db)
}

func verifyProductionUnitCAS(t *testing.T, s *Service, db *gorm.DB) {
	t.Helper()
	if err := db.Create(&model.User{ID: "unit-cas-owner", Username: "unit-cas-owner", Role: model.UserRoleUser, Status: model.UserStatusActive}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.Project{ID: "unit-cas-project", UserID: "unit-cas-owner", Name: "章节并发", Status: model.ProjectStatusActive, Revision: 1}).Error; err != nil {
		t.Fatal(err)
	}
	unit, err := s.CreateProjectUnit("unit-cas-owner", "unit-cas-project", CreateProjectUnitRequest{Kind: "chapter", Title: "原章节", SourceText: "<p>原始正文</p>"})
	if err != nil {
		t.Fatal(err)
	}
	original := unit
	if _, err := s.UpdateProjectUnit("unit-cas-owner", "unit-cas-project", unit.ID, UpdateProjectUnitRequest{Title: unit.Title, SourceText: "未带版本的覆盖"}); err == nil {
		t.Fatal("save without original version was accepted")
	}
	saved, err := s.UpdateProjectUnit("unit-cas-owner", "unit-cas-project", unit.ID, UpdateProjectUnitRequest{ExpectedUpdatedAt: &original.UpdatedAt, Title: "另一窗口的新标题", SourceText: "<p>另一窗口的新正文</p>", Status: "ready"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.UpdateProjectUnit("unit-cas-owner", "unit-cas-project", unit.ID, UpdateProjectUnitRequest{ExpectedUpdatedAt: &original.UpdatedAt, Title: "过期的标题", SourceText: "过期的正文"}); err == nil {
		t.Fatal("stale window overwrote source")
	}
	project, err := s.repo.ProjectForUser("unit-cas-owner", "unit-cas-project")
	if err != nil {
		t.Fatal(err)
	}
	revision := project.Revision
	original.Title, original.SourceText, original.UpdatedAt = "旧查询后的覆盖", "旧查询后的正文", time.Now()
	if err := s.repo.UpdateProjectUnit(&original, true, unit.UpdatedAt); !errors.Is(err, repository.ErrCreationConflict) {
		t.Fatal("database update lost its source-version predicate", err)
	}
	current, err := s.GetProjectUnit("unit-cas-owner", "unit-cas-project", unit.ID)
	if err != nil || current.Title != saved.Title || current.SourceText != saved.SourceText || !current.UpdatedAt.Equal(saved.UpdatedAt) {
		t.Fatal("concurrent source was not retained", err)
	}
	project, err = s.repo.ProjectForUser("unit-cas-owner", "unit-cas-project")
	if err != nil || project.Revision != revision {
		t.Fatal("failed save changed project revision", err)
	}
	if _, err := s.UpdateProjectUnit("foreign", "unit-cas-project", unit.ID, UpdateProjectUnitRequest{ExpectedUpdatedAt: &saved.UpdatedAt, SourceText: "foreign"}); err == nil {
		t.Fatal("foreign actor changed native source")
	}
}
