package database

import (
	"reflect"
	"testing"
	"yingce/backend/internal/model"
)

func TestImageLayerDeliveryMigration69PreservesHistoricalTasks(t *testing.T) {
	db, err := Open(Config{Driver: "sqlite", DataDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	conn, _ := db.DB()
	t.Cleanup(func() { conn.Close() })
	if err := MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	row := model.Task{ID: "before69", UserID: "owner", Type: model.TaskTypeImageOperation, Operation: "compose", Status: model.TaskStatusSucceeded, InputJSON: `{"historicalInput":true}`, ResultJSON: `{"historicalOutput":true}`}
	if err := db.Create(&row).Error; err != nil {
		t.Fatal(err)
	}
	var persisted model.Task
	if err := db.First(&persisted, "id = ?", row.ID).Error; err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{"ImageLayerDeliveryStatus", "ImageLayerDeliveryJSON"} {
		if err := db.Migrator().DropColumn(&model.Task{}, field); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := ReadSchemaStatus(db); err == nil {
		t.Fatal("schema69 missing delivery fields appeared ready")
	}
	if err := db.Exec("DELETE FROM schema_migrations WHERE version >= 69").Error; err != nil {
		t.Fatal(err)
	}
	if err := MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	if err := MigrateSchema(db); err != nil {
		t.Fatal("not idempotent", err)
	}
	var after model.Task
	if err := db.First(&after, "id = ?", row.ID).Error; err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(after, persisted) {
		t.Fatal("historical task was rewritten or automatically activated")
	}
	if status, err := ReadSchemaStatus(db); err != nil || !status.Ready || status.Current != CurrentSchemaVersion {
		t.Fatal("migration not ready", err)
	}
}
