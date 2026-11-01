package app

import (
	"context"
	"testing"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
	"yingce/backend/internal/testdb"
)

func mysqlNativeService(t *testing.T) (*Service, *gorm.DB) {
	t.Helper()
	db := testdb.MySQL(t)
	return &Service{repo: repository.New(db), dataDir: t.TempDir(), activeCancels: map[string]context.CancelFunc{}}, db
}

func TestMySQLNativeProjectStarters(t *testing.T) {
	s, db := mysqlNativeService(t)
	verifyProjectStarterGoals(t, s, db)
}

func TestMySQLNativeImageLayersAndWorkerRecovery(t *testing.T) {
	s, db := mysqlNativeService(t)
	verifyImageLayerWorkflow(t, s, db)
}

func TestMySQLNativeDeliveryOriginalMediaAndReplay(t *testing.T) {
	s, db := mysqlNativeService(t)
	verifyProjectDelivery(t, s, db)
}

func TestMySQLNativeCutsImmutableApplyAndRollback(t *testing.T) {
	db := testdb.MySQL(t)
	s := New(repository.New(db), t.TempDir())
	t.Cleanup(func() { _ = s.Close() })
	for _, id := range []string{"owner", "other"} {
		if err := db.Create(&model.User{ID: id, Username: id, Email: id + "@example.invalid", Status: model.UserStatusActive, Role: model.UserRoleUser}).Error; err != nil {
			t.Fatal(err)
		}
	}
	verifyProjectCuts(t, s, db)
}
