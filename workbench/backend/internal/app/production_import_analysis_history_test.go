package app

import (
	"errors"
	"testing"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

func TestLegacyNativeAnalysisHistoryAtomicityAndHumanEdits(t *testing.T) {
	_, db := legacyImportService(t)
	verifyLegacyAnalysisHistory(t, db)
}

func TestLegacyNativeAnalysisHistoryPostgresAtomicityAndHumanEdits(t *testing.T) {
	_, db := newProjectNameConflictPostgresService(t)
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	connection, _ := db.DB()
	t.Cleanup(func() { connection.Close() })
	verifyLegacyAnalysisHistory(t, db)
}

func verifyLegacyAnalysisHistory(t *testing.T, db *gorm.DB) {
	t.Helper()
	row := model.ProjectMediaAnalysis{ID: "imported-analysis", UserID: "owner", ProjectID: "imported-project", Kind: "audio_structure", SourceKind: "legacy_import", SourceKey: "imported-source", SourceImportID: "import", SourceLegacyID: "old-analysis", ResourceID: "resource", Title: "导入音乐分析", SourceJSON: `{"resourceId":"resource"}`, EvidenceJSON: `{"method":"old CPU measurement"}`, CurrentRevisionID: "imported-revision-2", Revision: 2, CreatedAt: time.Now(), UpdatedAt: time.Now()}
	versions := []model.ProjectMediaAnalysisRevision{
		{ID: "imported-revision-1", AnalysisID: row.ID, UserID: "owner", AuthorID: "owner", Version: 1, RequestID: "imported-request-1", RequestSHA256: "one", DocumentJSON: `{"version":1,"beats":[]}`},
		{ID: "imported-revision-2", AnalysisID: row.ID, UserID: "owner", AuthorID: "owner", Version: 2, RequestID: "imported-request-2", RequestSHA256: "two", DocumentJSON: `{"version":1,"beats":[{"timeMs":1000}]}`},
	}
	rows := &repository.ProductionImportRows{MediaAnalyses: []model.ProjectMediaAnalysis{row}, MediaAnalysisRevisions: versions}
	write := func() error {
		return db.Transaction(func(tx *gorm.DB) error { return repository.New(tx).CreateLegacySupplementRows(rows) })
	}
	callback := "legacy-analysis-intentional-failure"
	if err := db.Callback().Create().Before("gorm:create").Register(callback, func(tx *gorm.DB) {
		if revision, ok := tx.Statement.Dest.(*model.ProjectMediaAnalysisRevision); ok && revision.Version == 2 {
			tx.AddError(errors.New("intentional imported analysis revision failure"))
		}
	}); err != nil {
		t.Fatal(err)
	}
	failed := write()
	db.Callback().Create().Remove(callback)
	if failed == nil {
		t.Fatal("failure injection was not reached")
	}
	var count int64
	db.Model(&model.ProjectMediaAnalysis{}).Where("id = ?", row.ID).Count(&count)
	if count != 0 {
		t.Fatal("partial analysis survived rollback")
	}
	db.Model(&model.ProjectMediaAnalysisRevision{}).Where("analysis_id = ?", row.ID).Count(&count)
	if count != 0 {
		t.Fatal("partial history survived rollback")
	}
	if err := write(); err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&model.ProjectMediaAnalysis{}).Where("id = ?", row.ID).Updates(map[string]any{"title": "用户最新名称", "revision": 3, "current_revision_id": "human-revision", "archived": true}).Error; err != nil {
		t.Fatal(err)
	}
	if err := write(); err != nil {
		t.Fatal("identical historical rows not reusable", err)
	}
	var actual model.ProjectMediaAnalysis
	if err := db.First(&actual, "id = ?", row.ID).Error; err != nil || actual.Title != "用户最新名称" || actual.Revision != 3 || actual.CurrentRevisionID != "human-revision" || !actual.Archived {
		t.Fatal("upgrade reset human work", err, actual)
	}
	rows.MediaAnalysisRevisions[1].DocumentJSON = `{"changed":true}`
	rows.Cut = &model.ProjectCut{ID: "conflicting-analysis-cut", UserID: "owner", ProjectID: row.ProjectID, RequestID: "conflicting-analysis-request", Title: "冲突应回滚", Kind: "master", PayloadJSON: `{}`, MetadataJSON: `{}`, CreatedAt: time.Now()}
	if err := write(); !errors.Is(err, repository.ErrProjectTimelineConflict) {
		t.Fatal("conflicting immutable history accepted", err)
	}
	db.Model(&model.ProjectCut{}).Where("id = ?", rows.Cut.ID).Count(&count)
	if count != 0 {
		t.Fatal("cut survived conflicting history rollback")
	}
}
