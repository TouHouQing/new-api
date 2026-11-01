package model

import (
	"path/filepath"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func TestStudioProjectDatabaseOutageIsNotARevokedPermission(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "availability.db")), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&StudioProject{}, &StudioProjectMember{}))
	_, _, err = StudioProjectAccess(db, 1, "missing", false)
	require.ErrorIs(t, err, ErrStudioAccess)
	require.NoError(t, db.Create(&StudioProject{ID: "own-film", OwnerID: 1, Title: "Film", Document: "{}"}).Error)
	_, role, err := StudioProjectAccess(db, 1, "own-film", false)
	require.NoError(t, err)
	require.Equal(t, "owner", role)
	_, _, err = StudioProjectAccess(db, 2, "own-film", false)
	require.ErrorIs(t, err, ErrStudioAccess)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	require.NoError(t, sqlDB.Close())
	_, _, err = StudioProjectAccess(db, 1, "own-film", false)
	require.ErrorIs(t, err, ErrStudioStorageUnavailable)
	require.NotErrorIs(t, err, ErrStudioAccess)
}
