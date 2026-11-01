package database

import (
	"testing"
	"yingce/backend/internal/model"
)

func TestMigrateSchema66PreservesExistingProjectTimelineAndReferenceReceipts(t *testing.T) {
	db, err := Open(Config{Driver: "sqlite", DataDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	connection, _ := db.DB()
	t.Cleanup(func() { connection.Close() })
	if err := MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	if err := db.Migrator().DropTable(&model.ProjectCut{}, &model.ProjectCutApplyReceipt{}); err != nil {
		t.Fatal(err)
	}
	if err := db.Where("version = ?", 66).Delete(&schemaMigration{}).Error; err != nil {
		t.Fatal(err)
	}
	old := model.ProjectTimeline{ProjectID: "original", UserID: "owner", Revision: 7, PayloadJSON: `{"version":2,"tracks":[],"clips":[],"durationMs":0}`}
	receipt := model.ProjectReferenceAdoption{ID: "original-receipt", ProjectID: "original", UserID: "owner", ResultJSON: `{"shots":[{"id":"original-shot"}]}`}
	if err := db.Create(&old).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&receipt).Error; err != nil {
		t.Fatal(err)
	}
	if err := MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	if err := MigrateSchema(db); err != nil {
		t.Fatal("migration not idempotent", err)
	}
	var current model.ProjectTimeline
	db.First(&current, "project_id = ?", old.ProjectID)
	if current.Revision != old.Revision || current.PayloadJSON != old.PayloadJSON {
		t.Fatal("old working cut changed")
	}
	var kept model.ProjectReferenceAdoption
	db.First(&kept, "id = ?", receipt.ID)
	if kept.ResultJSON != receipt.ResultJSON {
		t.Fatal("old adoption receipt changed")
	}
	for _, table := range []any{&model.ProjectCut{}, &model.ProjectCutApplyReceipt{}} {
		if !db.Migrator().HasTable(table) {
			t.Fatal("schema66 cut tables missing")
		}
	}
}
