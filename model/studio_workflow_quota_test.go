package model

import (
	"path/filepath"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestStudioWorkflowQuota(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "quota.db")), &gorm.Config{})
	require.NoError(t, err)
	prior := DB
	DB = db
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { DB = prior; sqlDB.Close() })
	require.NoError(t, db.AutoMigrate(&StudioWorkflowJob{}, &StudioWorkflowCharge{}, &Token{}))
	exerciseStudioWorkflowQuota(t, db)
}

// The same invariants run against all real database dialects in the matrix.
func exerciseStudioWorkflowQuota(t *testing.T, db *gorm.DB) {
	t.Helper()
	require.NoError(t, db.Create(&StudioWorkflowJob{ID: "quota-film", UserID: 90, ProjectID: "quota-project", RequestID: "quota-job", Kind: "generate", Status: "running", Budget: 100, Plan: "{}", Result: "{}"}).Error)
	require.NoError(t, EnsureStudioWorkflowCharge(90, "quota-film", "quota-a"))
	require.NoError(t, EnsureStudioWorkflowCharge(90, "quota-film", "quota-b"))
	require.NoError(t, UpdateStudioWorkflowCharge(90, "quota-film", "quota-a", 60, true, false))
	require.ErrorIs(t, UpdateStudioWorkflowCharge(90, "quota-film", "quota-b", 50, true, false), ErrStudioWorkflowBudget)
	require.NoError(t, UpdateStudioWorkflowCharge(90, "quota-film", "quota-b", 40, true, false))
	used, final, err := StudioWorkflowChargeUsage(90, "quota-film")
	require.NoError(t, err)
	assert.EqualValues(t, 100, used)
	assert.False(t, final)
	assert.Error(t, UpdateStudioWorkflowCharge(91, "quota-film", "quota-a", 0, false, true))
	require.NoError(t, UpdateStudioWorkflowCharge(90, "quota-film", "quota-a", 30, false, true))
	require.NoError(t, UpdateStudioWorkflowCharge(90, "quota-film", "quota-b", 40, false, true))
	used, final, err = StudioWorkflowChargeUsage(90, "quota-film")
	require.NoError(t, err)
	assert.EqualValues(t, 70, used)
	assert.True(t, final)
	// Replaying an absolute async settlement never consumes quota twice.
	require.NoError(t, UpdateStudioWorkflowCharge(90, "quota-film", "quota-b", 40, false, true))
	require.NoError(t, UpdateStudioWorkflowCharge(90, "quota-film", "quota-b", 0, false, true))
	used, final, err = StudioWorkflowChargeUsage(90, "quota-film")
	require.NoError(t, err)
	assert.EqualValues(t, 30, used)
	assert.True(t, final)
	assert.ErrorIs(t, UpdateStudioWorkflowCharge(90, "quota-film", "quota-a", 1, true, false), ErrStudioWorkflowBudget)
	require.NoError(t, EnsureStudioWorkflowCharge(90, "quota-film", "quota-free"))
	require.NoError(t, UpdateStudioWorkflowCharge(90, "quota-film", "quota-free", 0, false, true))
	var job StudioWorkflowJob
	require.NoError(t, db.First(&job, "id = ?", "quota-film").Error)
	assert.EqualValues(t, 30, job.Reserved)
	require.NoError(t, db.Model(&StudioWorkflowJob{}).Where("id = ?", job.ID).Update("status", "cancelled").Error)
	assert.Error(t, EnsureStudioWorkflowCharge(90, job.ID, "quota-cancelled"))
	legacyToken := Token{UserId: 90, Key: "legacy-budget-fixture", UsedQuota: 80, Status: 2}
	require.NoError(t, db.Create(&legacyToken).Error)
	legacy := StudioWorkflowJob{ID: "legacy-quota", UserID: 90, ProjectID: "quota-project", TokenID: legacyToken.Id, RequestID: "legacy-quota-job", Status: "running", Kind: "generate", Budget: 100, Plan: "{}", Result: "{}"}
	require.NoError(t, db.Create(&legacy).Error)
	require.NoError(t, EnsureStudioWorkflowCharge(90, legacy.ID, "legacy-quota-request"))
	assert.ErrorIs(t, UpdateStudioWorkflowCharge(90, legacy.ID, "legacy-quota-request", 21, true, false), ErrStudioWorkflowBudget)
	require.NoError(t, UpdateStudioWorkflowCharge(90, legacy.ID, "legacy-quota-request", 20, true, false))
}
