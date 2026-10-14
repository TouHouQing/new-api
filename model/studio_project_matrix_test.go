package model

import (
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"gorm.io/gorm/schema"
)

func TestStudioProjectDatabaseMatrix(t *testing.T) {
	databases := []struct {
		name, dsn string
		dialect   func(string) gorm.Dialector
	}{
		{"sqlite", ":memory:", func(dsn string) gorm.Dialector { return sqlite.Open(dsn) }},
		{"mysql", os.Getenv("STUDIO_TEST_MYSQL_DSN"), func(dsn string) gorm.Dialector { return mysql.Open(dsn) }},
		{"postgres", os.Getenv("STUDIO_TEST_POSTGRES_DSN"), func(dsn string) gorm.Dialector { return postgres.Open(dsn) }},
	}
	for _, database := range databases {
		t.Run(database.name, func(t *testing.T) {
			if database.dsn == "" {
				t.Skip("dedicated database DSN is not configured")
			}
			prefix := fmt.Sprintf("studio_verify_%d_", time.Now().UnixNano())
			db, err := gorm.Open(database.dialect(database.dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent), NamingStrategy: schema.NamingStrategy{TablePrefix: prefix}})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			sqlDB.SetMaxOpenConns(1)
			original := DB
			DB = db
			models := []any{&StudioWorkflowEvent{}, &StudioReviewShare{}, &StudioWorkflowJob{}, &StudioReviewComment{}, &StudioProjectMediaLink{}, &StudioMedia{}, &StudioProjectMember{}, &StudioProjectVersion{}, &StudioProject{}, &StudioAttempt{}, &StudioProvider{}}
			t.Cleanup(func() {
				DB = original
				for _, item := range models {
					assert.NoError(t, db.Migrator().DropTable(item))
				}
				sqlDB.Close()
			})
			versionSQL := "SELECT version()"
			if database.name == "sqlite" {
				versionSQL = "SELECT sqlite_version()"
			}
			var engineVersion string
			require.NoError(t, db.Raw(versionSQL).Scan(&engineVersion).Error)
			t.Logf("Engine: %s %s", database.name, engineVersion)
			// Verify a new installation before rebuilding only this isolated table
			// prefix as the representative prior Studio schema below.
			for range 2 {
				require.NoError(t, db.AutoMigrate(models...))
			}
			require.NoError(t, db.Create(&StudioWorkflowJob{ID: "fresh-scheduled", ProjectID: "fresh-film", UserID: 90, RequestID: "fresh-request", Kind: "quality", Status: "queued", RunAfter: time.Now().Add(time.Hour).Unix(), Plan: "{}", Result: "{}"}).Error)
			for range 2 {
				require.NoError(t, db.AutoMigrate(models...))
			}
			var freshCount int64
			require.NoError(t, db.Model(&StudioWorkflowJob{}).Where("id = ?", "fresh-scheduled").Count(&freshCount).Error)
			assert.Equal(t, int64(1), freshCount)
			for _, item := range models {
				require.NoError(t, db.Migrator().DropTable(item))
			}
			// Upgrade fixture uses the two Studio tables present before this change.
			require.NoError(t, db.AutoMigrate(&StudioProvider{}, &StudioAttempt{}))
			require.NoError(t, db.Create(&StudioProvider{UserID: 91, Kind: "text", BaseURL: "https://fixture.invalid/v1", EncryptedAPIKey: "fixture-ciphertext"}).Error)
			// A real upgrade from the prior scheduler table, with an existing receipt.
			legacyJobs := db.Table(prefix + "studio_workflow_jobs")
			require.NoError(t, legacyJobs.AutoMigrate(&struct {
				ID        string `gorm:"type:varchar(128);primaryKey"`
				ProjectID string `gorm:"type:varchar(128);not null;index"`
				UserID    int    `gorm:"not null;index;uniqueIndex:idx_studio_job_request"`
				RequestID string `gorm:"type:varchar(128);not null;uniqueIndex:idx_studio_job_request"`
				Kind      string `gorm:"type:varchar(32)"`
				Status    string `gorm:"type:varchar(24);index"`
				Plan      StudioDocument
				Result    StudioDocument
			}{}))
			require.NoError(t, legacyJobs.Create(map[string]any{"id": "legacy-receipt", "project_id": "legacy-film", "user_id": 90, "request_id": "legacy-request", "kind": "generate", "status": "queued", "plan": "{\"frozen\":true}", "result": "{}"}).Error)
			for range 2 {
				require.NoError(t, db.AutoMigrate(models...))
			}
			var legacy StudioWorkflowJob
			require.NoError(t, db.First(&legacy, "id = ?", "legacy-receipt").Error)
			assert.Zero(t, legacy.RunAfter)
			assert.Equal(t, StudioDocument(`{"frozen":true}`), legacy.Plan)
			due := time.Now().Add(time.Hour).Unix()
			require.NoError(t, db.Create(&StudioWorkflowJob{ID: "future-job", ProjectID: "film", UserID: 90, RequestID: "future-request", Kind: "quality", Status: "queued", RunAfter: due, Plan: "{}", Result: "{}"}).Error)
			for range 2 {
				require.NoError(t, db.AutoMigrate(&StudioWorkflowJob{}))
			}
			var ready []StudioWorkflowJob
			require.NoError(t, db.Where("status = ? AND run_after <= ?", "queued", time.Now().Unix()).Find(&ready).Error)
			assert.Len(t, ready, 1)
			assert.Equal(t, "legacy-receipt", ready[0].ID)
			blocked := db.Model(&StudioWorkflowJob{}).Where("id = ? AND status = ? AND run_after <= ?", "future-job", "queued", time.Now().Unix()).Update("status", "running")
			require.NoError(t, blocked.Error)
			assert.Zero(t, blocked.RowsAffected)
			var future StudioWorkflowJob
			require.NoError(t, db.First(&future, "id = ?", "future-job").Error)
			assert.Equal(t, due, future.RunAfter)
			require.NoError(t, db.Delete(&StudioWorkflowJob{}, "id IN ?", []string{"legacy-receipt", "future-job"}).Error)
			provider, err := GetStudioProvider(91, "text")
			require.NoError(t, err)
			require.NotNil(t, provider)
			assert.Equal(t, "fixture-ciphertext", provider.EncryptedAPIKey)
			largeDocument := `{"id":"film","title":"Film","nodes":[],"edges":[],"notes":"` + strings.Repeat("x", 100000) + `"}`
			project, err := SaveStudioProject(91, "film", "Film", 0, largeDocument)
			require.NoError(t, err)
			assert.Equal(t, int64(1), project.Revision)
			loaded, role, err := StudioProjectAccess(db, 91, "film", false)
			require.NoError(t, err)
			assert.Equal(t, "owner", role)
			assert.Equal(t, largeDocument, string(loaded.Document))
			_, _, err = StudioProjectAccess(db, 92, "film", false)
			assert.ErrorIs(t, err, ErrStudioAccess)
			require.NoError(t, db.Create(&StudioProjectMember{ProjectID: "film", UserID: 92, Role: "viewer"}).Error)
			_, _, err = StudioProjectAccess(db, 92, "film", false)
			require.NoError(t, err)
			_, _, err = StudioProjectAccess(db, 92, "film", true)
			assert.ErrorIs(t, err, ErrStudioAccess)
			require.NoError(t, db.Model(&StudioProjectMember{}).Where("project_id = ? AND user_id = ?", "film", 92).Update("role", "editor").Error)
			updated, err := SaveStudioProject(92, "film", "Edited", 1, largeDocument)
			require.NoError(t, err)
			assert.Equal(t, int64(2), updated.Revision)
			_, err = SaveStudioProject(91, "film", "Stale", 1, "{}")
			assert.ErrorIs(t, err, ErrStudioRevision)
			var count int64
			require.NoError(t, db.Model(&StudioProjectVersion{}).Where("project_id = ?", "film").Count(&count).Error)
			assert.Equal(t, int64(2), count)
			require.NoError(t, db.AutoMigrate(models...))
			var version StudioProjectVersion
			require.NoError(t, db.Where("project_id = ? AND revision = ?", "film", 1).First(&version).Error)
			assert.Equal(t, largeDocument, string(version.Document))
			for _, userID := range []int{91, 92} {
				require.NoError(t, db.Create(&StudioWorkflowJob{ID: fmt.Sprint(userID), UserID: userID, ProjectID: "film", RequestID: "same-request", Kind: "quality", Status: "queued", Plan: "{}", Result: "{}"}).Error)
			}
			assert.Error(t, db.Create(&StudioWorkflowJob{ID: "duplicate", UserID: 91, ProjectID: "film", RequestID: "same-request", Kind: "quality", Status: "queued", Plan: "{}", Result: "{}"}).Error)
			require.NoError(t, db.Model(&StudioProjectMember{}).Where("project_id = ? AND user_id = ?", "film", 92).Update("role", "reviewer").Error)
			_, err = SaveStudioProject(92, "film", "Edit", 2, "{}")
			assert.ErrorIs(t, err, ErrStudioAccess)
			reviewed, err := SaveStudioProjectReview(92, "film", "Reviewed", 2, largeDocument)
			require.NoError(t, err)
			assert.Equal(t, int64(3), reviewed.Revision)
			var reviewVersion StudioProjectVersion
			require.NoError(t, db.Where("project_id = ? AND revision = ?", "film", 3).First(&reviewVersion).Error)
			assert.Equal(t, 92, reviewVersion.AuthorID)
			imported := StudioReviewComment{ProjectID: "film", Revision: 3, AuthorID: 91, NodeID: "video", TakeID: "version-a", Seconds: 1, Message: "[frameio:fixture:comment-a] Director: tighten this shot"}
			created, err := SaveStudioImportedReviewComment(91, "[frameio:fixture:comment-a] ", &imported)
			require.NoError(t, err)
			assert.True(t, created)
			duplicate := imported
			duplicate.ID = 0
			created, err = SaveStudioImportedReviewComment(91, "[frameio:fixture:comment-a] ", &duplicate)
			require.NoError(t, err)
			assert.False(t, created)
			_, err = SaveStudioImportedReviewComment(92, "[frameio:fixture:comment-b] ", &duplicate)
			assert.Error(t, err, "collaborators cannot import with the owner's outside credential")
			for range 2 {
				require.NoError(t, db.AutoMigrate(models...))
			}
			require.NoError(t, db.Model(&StudioReviewComment{}).Where("project_id = ? AND take_id = ?", "film", "version-a").Count(&count).Error)
			assert.Equal(t, int64(1), count, "imported comments remain unique after repeated migration")
			require.NoError(t, db.Model(&StudioProjectMember{}).Where("project_id = ? AND user_id = ?", "film", 92).Update("role", "viewer").Error)
			_, err = SaveStudioProjectReview(92, "film", "Invalid", 3, largeDocument)
			assert.ErrorIs(t, err, ErrStudioAccess)
			require.NoError(t, db.Delete(&StudioProject{}, "id = ?", "film").Error)
			_, _, err = StudioProjectAccess(db, 91, "film", false)
			assert.ErrorIs(t, err, ErrStudioAccess)
			require.NoError(t, db.Model(&StudioProjectVersion{}).Where("project_id = ?", "film").Count(&count).Error)
			assert.Equal(t, int64(3), count)
			_, err = RestoreStudioDeletedProject(92, "film")
			assert.ErrorIs(t, err, ErrStudioAccess)
			restored, err := RestoreStudioDeletedProject(91, "film")
			require.NoError(t, err)
			assert.Equal(t, int64(4), restored.Revision)
			assert.Equal(t, largeDocument, string(restored.Document))
			_, role, err = StudioProjectAccess(db, 92, "film", false)
			require.NoError(t, err)
			assert.Equal(t, "viewer", role)
		})
	}
}
