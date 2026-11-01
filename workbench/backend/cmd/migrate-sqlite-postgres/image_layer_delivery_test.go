package main

import (
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"path/filepath"
	"testing"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
)

func TestImageLayerDeliveryCopyPreservesCurrentAndOlderReadOnlySources(t *testing.T) {
	withMigrationTargets(t, func(t *testing.T, target *gorm.DB) {
		path := filepath.Join(t.TempDir(), "source.db")
		source, err := gorm.Open(sqlite.Open(path), &gorm.Config{})
		if err != nil {
			t.Fatal(err)
		}
		conn, _ := source.DB()
		t.Cleanup(func() { conn.Close() })
		if err := database.MigrateSchema(source); err != nil {
			t.Fatal(err)
		}
		if err := database.MigrateSchema(target); err != nil {
			t.Fatal(err)
		}
		row := model.Task{ID: "delivery-current", UserID: "owner", Type: model.TaskTypeImageOperation, Operation: "compose", Status: model.TaskStatusSucceeded, InputJSON: `{"fixed":true}`, ResultJSON: `{"retained":true}`, ImageLayerDeliveryStatus: "pending", ImageLayerDeliveryJSON: `{"status":"pending"}`}
		if err := source.Create(&row).Error; err != nil {
			t.Fatal(err)
		}
		migration := migrateTable[model.Task]("tasks")
		if count, err := migration.run(source, target, true); err != nil || count != 1 {
			t.Fatal("current delivery lost", count, err)
		}
		var copied model.Task
		if err := target.First(&copied, "id = ?", row.ID).Error; err != nil || copied.ImageLayerDeliveryStatus != "pending" || copied.ImageLayerDeliveryJSON != row.ImageLayerDeliveryJSON {
			t.Fatal("delivery state changed", err)
		}
		if err := target.Where("id = ?", row.ID).Delete(&model.Task{}).Error; err != nil {
			t.Fatal(err)
		}
		for _, field := range []string{"ImageLayerDeliveryStatus", "ImageLayerDeliveryJSON"} {
			if err := source.Migrator().DropColumn(&model.Task{}, field); err != nil {
				t.Fatal(err)
			}
		}
		if _, err := migration.run(source, target, true); err == nil {
			t.Fatal("missing schema69 field silently accepted")
		}
		if err := source.Exec("DELETE FROM schema_migrations WHERE version >= 69").Error; err != nil {
			t.Fatal(err)
		}
		readonly, err := gorm.Open(sqlite.Open("file:"+path+"?mode=ro"), &gorm.Config{})
		if err != nil {
			t.Fatal(err)
		}
		reader, _ := readonly.DB()
		t.Cleanup(func() { reader.Close() })
		for _, copyRows := range []bool{true, false} {
			if count, err := migration.run(readonly, target, copyRows); err != nil || count != 1 {
				t.Fatal("legacy read-only copy failed", count, err)
			}
		}
		copied = model.Task{}
		if err := target.First(&copied, "id = ?", row.ID).Error; err != nil {
			t.Fatal(err)
		}
		if copied.ImageLayerDeliveryStatus != "" || copied.ImageLayerDeliveryJSON != "" || copied.InputJSON != row.InputJSON || copied.ResultJSON != row.ResultJSON {
			t.Fatal("legacy source was activated or altered")
		}
		if readonly.Migrator().HasColumn("tasks", "image_layer_delivery_status") {
			t.Fatal("source was mutated")
		}
	})
}
