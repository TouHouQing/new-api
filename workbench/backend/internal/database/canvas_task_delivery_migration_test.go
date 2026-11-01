package database

import (
	"fmt"
	"gorm.io/gorm"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"
	"yingce/backend/internal/model"
)

func TestCanvasTaskDeliveryMigration71PreservesHistoricalTasks(t *testing.T) {
	db, err := Open(Config{Driver: "sqlite", DataDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	connection, _ := db.DB()
	t.Cleanup(func() { connection.Close() })
	checkCanvasTaskDeliveryMigration71(t, db)
}

func TestPostgresCanvasTaskDeliveryMigration71PreservesHistoricalTasks(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("CANVAS_TEST_POSTGRES_DSN"))
	if dsn == "" {
		t.Skip("CANVAS_TEST_POSTGRES_DSN is not configured")
	}
	base, err := Open(Config{Driver: "postgres", DSN: dsn})
	if err != nil {
		t.Fatal(err)
	}
	connection, _ := base.DB()
	defer connection.Close()
	schema := fmt.Sprintf("canvas_delivery71_%d", time.Now().UnixNano())
	if err = base.Exec(`CREATE SCHEMA "` + schema + `"`).Error; err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := base.Exec(`DROP SCHEMA "` + schema + `" CASCADE`).Error; err != nil {
			t.Error(err)
		}
	}()
	isolated, err := postgresDSNWithSearchPath(dsn, schema)
	if err != nil {
		t.Fatal(err)
	}
	db, err := Open(Config{Driver: "postgres", DSN: isolated})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := db.DB()
	defer sqlDB.Close()
	checkCanvasTaskDeliveryMigration71(t, db)
}

func checkCanvasTaskDeliveryMigration71(t *testing.T, db *gorm.DB) {
	t.Helper()
	if err := MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	row := model.Task{ID: "before71", UserID: "owner", Type: "canvas_audio", Status: model.TaskStatusSucceeded, InputJSON: `{"mode":"audio","metadata":{"nodeId":"old-root"}}`, ResultJSON: `{"historicalOutput":true}`}
	if err := db.Create(&row).Error; err != nil {
		t.Fatal(err)
	}
	var before model.Task
	if err := db.First(&before, "id = ?", row.ID).Error; err != nil {
		t.Fatal(err)
	}
	var dropIndexErr error
	if db.Dialector.Name() == "postgres" {
		dropIndexErr = db.Exec(`DROP INDEX "idx_tasks_canvas_delivery_pending"`).Error
	} else {
		dropIndexErr = db.Migrator().DropIndex(&model.Task{}, "idx_tasks_canvas_delivery_pending")
	}
	if dropIndexErr != nil {
		t.Fatal(dropIndexErr)
	}
	for _, field := range []string{"CanvasDeliveryStatus", "CanvasDeliveryAttempts", "CanvasDeliveryError", "CanvasDeliveryNextAttemptAt"} {
		if err := db.Migrator().DropColumn(&model.Task{}, field); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := ReadSchemaStatus(db); err == nil {
		t.Fatal("incomplete schema71 appeared ready")
	}
	if err := db.Exec("DELETE FROM schema_migrations WHERE version >= 71").Error; err != nil {
		t.Fatal(err)
	}
	if err := MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	if err := MigrateSchema(db); err != nil {
		t.Fatal("not idempotent", err)
	}
	var after model.Task
	// This fixture drops/re-adds columns through one connection pool. Use a
	// fresh query shape, as the production API opens a fresh pool after migrate.
	read := db.Where("id = ?", row.ID).Find(&after)
	if read.Error != nil || read.RowsAffected != 1 {
		t.Fatal("read migrated historical task", read.Error, read.RowsAffected)
	}
	if !reflect.DeepEqual(before, after) {
		t.Fatal("historical input, result or delivery state was rewritten")
	}
	status, err := ReadSchemaStatus(db)
	if err != nil || !status.Ready || status.Current != CurrentSchemaVersion {
		t.Fatal(status, err)
	}
	if !db.Migrator().HasIndex(&model.Task{}, "idx_tasks_canvas_delivery_pending") {
		t.Fatal("durable delivery scan index missing")
	}
}
