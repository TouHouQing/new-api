package main

import (
	"testing"

	"yingce/backend/internal/model"

	"gorm.io/gorm"
)

func TestTasklessRepresentationMigrationPreservesSQLNull(t *testing.T) {
	withMigrationTargets(t, func(t *testing.T, target *gorm.DB) {
		source := sequenceSource(t)
		for _, db := range []*gorm.DB{source, target} {
			if err := db.AutoMigrate(&model.AssetRepresentation{}); err != nil {
				t.Fatal(err)
			}
		}
		rows := []model.AssetRepresentation{
			{ID: "first", AssetVersionID: "version-1", ResourceID: "resource-1", Role: "primary", MediaType: "image"},
			{ID: "second", AssetVersionID: "version-2", ResourceID: "resource-2", Role: "primary", MediaType: "image"},
		}
		if err := source.Omit("TaskID").Create(&rows).Error; err != nil {
			t.Fatal(err)
		}
		generated := model.AssetRepresentation{ID: "generated", TaskID: "real-task", AssetVersionID: "version-3", ResourceID: "resource-3", Role: "primary", MediaType: "image"}
		if err := source.Create(&generated).Error; err != nil {
			t.Fatal(err)
		}
		migration := migrateTable[assetRepresentationMigrationRow]("asset_representations")
		if count, err := migration.run(source, target, true); err != nil || count != 3 {
			t.Fatalf("representation copy: %d %v", count, err)
		}
		var taskless int64
		if err := target.Model(&model.AssetRepresentation{}).Where("task_id IS NULL").Count(&taskless).Error; err != nil {
			t.Fatal(err)
		}
		if taskless != 2 {
			t.Fatalf("NULL references changed: %d", taskless)
		}
		var actual model.AssetRepresentation
		if err := target.First(&actual, "id = ?", "generated").Error; err != nil {
			t.Fatal(err)
		}
		if actual.TaskID != "real-task" {
			t.Fatal("real task identity was lost")
		}
		if _, err := migration.run(source, target, false); err != nil {
			t.Fatalf("verification rerun: %v", err)
		}
	})
}
