package main

import (
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"testing"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
)

func TestIntroducedCutTablesCopyAndVerifyImmutableHistory(t *testing.T) {
	withMigrationTargets(t, func(t *testing.T, target *gorm.DB) {
		source, err := gorm.Open(sqlite.Open("file:"+t.TempDir()+"/cuts.db"), &gorm.Config{})
		if err != nil {
			t.Fatal(err)
		}
		connection, _ := source.DB()
		t.Cleanup(func() { connection.Close() })
		for _, db := range []*gorm.DB{source, target} {
			if err := database.MigrateSchema(db); err != nil {
				t.Fatal(err)
			}
		}
		cut := model.ProjectCut{ID: "cut", UserID: "owner", ProjectID: "project", RequestID: "original-cut-intent", Title: "原始剪辑", PayloadJSON: `{"version":2,"clips":[],"tracks":[],"durationMs":0}`, MetadataJSON: `{"sourceImportId":"source"}`}
		receipt := model.ProjectCutApplyReceipt{ID: "receipt", UserID: "owner", ProjectID: "project", RequestID: "original-apply-intent", CutID: "cut", ResultJSON: `{"appliedRevision":4,"backupCutId":"backup"}`}
		if err := source.Create(&cut).Error; err != nil {
			t.Fatal(err)
		}
		if err := source.Create(&receipt).Error; err != nil {
			t.Fatal(err)
		}
		for _, item := range []struct {
			table     any
			migration tableMigration
		}{
			{&model.ProjectCut{}, migrateIntroducedTable[model.ProjectCut]("project_cuts", 66)},
			{&model.ProjectCutApplyReceipt{}, migrateIntroducedTable[model.ProjectCutApplyReceipt]("project_cut_apply_receipts", 66)},
		} {
			if count, err := item.migration.run(source, target, true); err != nil || count != 1 {
				t.Fatal("new history not copied", count, err)
			}
			if count, err := item.migration.run(source, target, false); err != nil || count != 1 {
				t.Fatal("new history verification failed", count, err)
			}
			if err := source.Migrator().DropTable(item.table); err != nil {
				t.Fatal(err)
			}
			if _, err := item.migration.run(source, target, false); err == nil {
				t.Fatal("missing current66 table ignored")
			}
		}
		if err := source.Exec("DELETE FROM schema_migrations WHERE version >= 66").Error; err != nil {
			t.Fatal(err)
		}
		for _, item := range []struct {
			table     any
			migration tableMigration
		}{
			{&model.ProjectCut{}, migrateIntroducedTable[model.ProjectCut]("project_cuts", 66)},
			{&model.ProjectCutApplyReceipt{}, migrateIntroducedTable[model.ProjectCutApplyReceipt]("project_cut_apply_receipts", 66)},
		} {
			if _, err := item.migration.run(source, target, false); err == nil {
				t.Fatal("old empty source accepted nonempty target")
			}
			if err := target.Where("project_id = ?", "project").Delete(item.table).Error; err != nil {
				t.Fatal(err)
			}
			if count, err := item.migration.run(source, target, false); err != nil || count != 0 {
				t.Fatal("read-only old65 empty source not supported", count, err)
			}
		}
	})
}
