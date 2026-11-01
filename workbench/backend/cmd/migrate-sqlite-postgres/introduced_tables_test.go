package main

import (
	"strings"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
)

func TestIntroducedReferenceAdoptionCopiesHistoryAndRejectsMissingCurrentRows(t *testing.T) {
	withMigrationTargets(t, func(t *testing.T, target *gorm.DB) {
		source, err := gorm.Open(sqlite.Open("file:"+t.TempDir()+"/reference-source.db"), &gorm.Config{})
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
		row := model.ProjectReferenceAdoption{ID: "adoption", UserID: "owner", ProjectID: "project", AnalysisID: "analysis", AnalysisRevisionID: "version", UnitID: "chapter", RequestSHA256: strings.Repeat("a", 64), ResultJSON: `{"title":"参考章节","shots":[{"shotId":"shot","startMs":500,"endMs":2500}]}`}
		if err := source.Create(&row).Error; err != nil {
			t.Fatal(err)
		}
		migration := migrateIntroducedTable[model.ProjectReferenceAdoption]("project_reference_adoptions", 65)
		if count, err := migration.run(source, target, true); err != nil || count != 1 {
			t.Fatal("receipt not copied", count, err)
		}
		if count, err := migration.run(source, target, false); err != nil || count != 1 {
			t.Fatal("receipt verification failed", count, err)
		}
		if err := target.Model(&row).Update("result_json", `{"changed":true}`).Error; err != nil {
			t.Fatal(err)
		}
		if _, err := migration.run(source, target, false); err == nil {
			t.Fatal("changed target receipt accepted")
		}
		if err := source.Migrator().DropTable(&model.ProjectReferenceAdoption{}); err != nil {
			t.Fatal(err)
		}
		if _, err := migration.run(source, target, false); err == nil {
			t.Fatal("missing current65 receipt table silently skipped")
		}
		if err := source.Exec("DELETE FROM schema_migrations WHERE version >= 65").Error; err != nil {
			t.Fatal(err)
		}
		if _, err := migration.run(source, target, false); err == nil {
			t.Fatal("older empty source accepted nonempty target")
		}
		if err := target.Delete(&row).Error; err != nil {
			t.Fatal(err)
		}
		if count, err := migration.run(source, target, false); err != nil || count != 0 {
			t.Fatal("older64 source not accepted for empty new table", count, err)
		}
		if source.Migrator().HasTable(&model.ProjectReferenceAdoption{}) {
			t.Fatal("read-only source was upgraded")
		}
	})
}

func TestIntroducedProjectReceiptRequiresOlderSourceAndEmptyTarget(t *testing.T) {
	withMigrationTargets(t, func(t *testing.T, target *gorm.DB) {
		source, err := gorm.Open(sqlite.Open("file:"+t.TempDir()+"/project62.db"), &gorm.Config{})
		if err != nil {
			t.Fatal(err)
		}
		connection, _ := source.DB()
		t.Cleanup(func() { connection.Close() })
		if err := database.MigrateSchema(source); err != nil {
			t.Fatal(err)
		}
		if err := database.MigrateSchema(target); err != nil {
			t.Fatal(err)
		}
		if err := source.Migrator().DropTable(&model.ProjectCreationReceipt{}); err != nil {
			t.Fatal(err)
		}
		migration := migrateIntroducedTable[model.ProjectCreationReceipt]("project_creation_receipts", 63)
		if _, err := migration.run(source, target, true); err == nil {
			t.Fatal("missing current receipt table accepted")
		}
		if err := source.Exec("DELETE FROM schema_migrations WHERE version >= 63").Error; err != nil {
			t.Fatal(err)
		}
		for _, copyRows := range []bool{true, false} {
			if count, err := migration.run(source, target, copyRows); err != nil || count != 0 {
				t.Fatalf("older source receipt verification = %d %v", count, err)
			}
		}
		if source.Migrator().HasTable(&model.ProjectCreationReceipt{}) {
			t.Fatal("read-only source was modified")
		}
		if err := target.Create(&model.ProjectCreationReceipt{ID: "existing-receipt", UserID: "owner", ProjectID: "project", PayloadSHA256: "digest"}).Error; err != nil {
			t.Fatal(err)
		}
		if _, err := migration.run(source, target, false); err == nil {
			t.Fatal("nonempty target receipt table accepted")
		}
	})
}

func TestIntroducedTranscriptTableRequiresOlderSourceAndEmptyTarget(t *testing.T) {
	withMigrationTargets(t, func(t *testing.T, target *gorm.DB) {
		source, err := gorm.Open(sqlite.Open("file:"+t.TempDir()+"/old.db"), &gorm.Config{})
		if err != nil {
			t.Fatal(err)
		}
		connection, _ := source.DB()
		t.Cleanup(func() { connection.Close() })
		if err := database.MigrateSchema(source); err != nil {
			t.Fatal(err)
		}
		if err := database.MigrateSchema(target); err != nil {
			t.Fatal(err)
		}
		if err := source.Migrator().DropTable(&model.ProjectTranscriptRevision{}, &model.ProjectTranscript{}); err != nil {
			t.Fatal(err)
		}
		migration := migrateIntroducedTable[model.ProjectTranscript]("project_transcripts", 61)
		if _, err := migration.run(source, target, true); err == nil {
			t.Fatal("missing current-schema table was silently skipped")
		}
		if err := source.Exec("DELETE FROM schema_migrations WHERE version >= ?", 61).Error; err != nil {
			t.Fatal(err)
		}
		for _, copyRows := range []bool{true, false} {
			if count, err := migration.run(source, target, copyRows); err != nil || count != 0 {
				t.Fatalf("older source should verify an empty new table: %d %v", count, err)
			}
		}
		if source.Migrator().HasTable(&model.ProjectTranscript{}) {
			t.Fatal("read-only source was upgraded or modified")
		}
		if err := target.Create(&model.ProjectTranscript{ID: "existing-transcript", UserID: "owner", ProjectID: "project", SourceKind: "recognition", SourceKey: "task"}).Error; err != nil {
			t.Fatal(err)
		}
		if _, err := migration.run(source, target, false); err == nil {
			t.Fatal("nonempty target was accepted for a missing source table")
		}
	})
}
