package main

import (
	"crypto/sha256"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
)

func TestProjectCutOriginsOlderReadOnlySnapshotCopyAndVerification(t *testing.T) {
	withMigrationTargets(t, func(t *testing.T, target *gorm.DB) {
		path := filepath.Join(t.TempDir(), "source66.db")
		source, err := gorm.Open(sqlite.Open(path), &gorm.Config{})
		if err != nil {
			t.Fatal(err)
		}
		connection, _ := source.DB()
		t.Cleanup(func() { connection.Close() })
		for _, db := range []*gorm.DB{source, target} {
			if err = database.MigrateSchema(db); err != nil {
				t.Fatal(err)
			}
		}
		base := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
		raw := ` {"version":2,"tracks":[],"clips":[],"durationMs":0} `
		rows := []model.ProjectCut{
			{ID: "original", UserID: "owner", ProjectID: "p", RequestID: "old-origin", SourceKey: "legacy-regional-v2:old", PayloadJSON: raw, MetadataJSON: ` {"preservedOnly":["regionalVersions.reframes"]} `, TimelineSHA256: strings.Repeat("a", 64), CreatedAt: base},
			{ID: "saved", UserID: "owner", ProjectID: "p", RequestID: "old-saved", PayloadJSON: raw, TimelineSHA256: strings.Repeat("a", 64), TimelineRevision: 3, CreatedAt: base.Add(time.Second)},
		}
		if err = source.Create(&rows).Error; err != nil {
			t.Fatal(err)
		}
		timeline := model.ProjectTimeline{UserID: "owner", ProjectID: "p", Revision: 4, PayloadJSON: raw, CreatedAt: base, UpdatedAt: base.Add(2 * time.Second)}
		receipt := model.ProjectCutApplyReceipt{ID: "old-receipt", UserID: "owner", ProjectID: "p", RequestID: "original-request", CutID: "original", ResultJSON: ` {"appliedRevision":3} `, CreatedAt: base}
		if err = source.Create(&timeline).Error; err != nil {
			t.Fatal(err)
		}
		if err = source.Create(&receipt).Error; err != nil {
			t.Fatal(err)
		}
		for _, entity := range []any{&model.ProjectCut{}, &model.ProjectTimeline{}} {
			if err = source.Migrator().DropColumn(entity, "OriginCutID"); err != nil {
				t.Fatal(err)
			}
		}
		if err = source.Exec("DELETE FROM schema_migrations WHERE version >= 67").Error; err != nil {
			t.Fatal(err)
		}
		before, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		readonly, err := gorm.Open(sqlite.Open("file:"+path+"?mode=ro"), &gorm.Config{})
		if err != nil {
			t.Fatal(err)
		}
		reader, _ := readonly.DB()
		t.Cleanup(func() { reader.Close() })
		for _, copyRows := range []bool{true, false} {
			for _, migration := range []tableMigration{migrateTable[model.ProjectCut]("project_cuts"), migrateTable[model.ProjectTimeline]("project_timelines"), migrateTable[model.ProjectCutApplyReceipt]("project_cut_apply_receipts")} {
				if _, err = migration.run(readonly, target, copyRows); err != nil {
					t.Fatal("read-only66 copy/verify", migration.name, copyRows, err)
				}
			}
		}
		var saved model.ProjectCut
		if err = target.First(&saved, "id = ?", "saved").Error; err != nil || saved.OriginCutID != "original" || saved.PayloadJSON != raw || saved.TimelineSHA256 != rows[1].TimelineSHA256 {
			t.Fatal("copied snapshot lost provenance or bytes", saved, err)
		}
		var working model.ProjectTimeline
		if err = target.First(&working, "project_id = ?", "p").Error; err != nil || working.OriginCutID != "original" || working.Revision != timeline.Revision || !working.UpdatedAt.Equal(timeline.UpdatedAt) {
			t.Fatal("working origin lost", working, err)
		}
		var kept model.ProjectCutApplyReceipt
		if err = target.First(&kept, "id = ?", receipt.ID).Error; err != nil || kept.ResultJSON != receipt.ResultJSON {
			t.Fatal("receipt changed", err)
		}
		after, err := os.ReadFile(path)
		if err != nil || sha256.Sum256(before) != sha256.Sum256(after) {
			t.Fatal("read-only source changed", err)
		}
	})
}

func TestProjectCutOriginsCurrentSnapshotMissingColumnsIsRejected(t *testing.T) {
	withMigrationTargets(t, func(t *testing.T, target *gorm.DB) {
		source := sequenceSource(t)
		for _, db := range []*gorm.DB{source, target} {
			if err := database.MigrateSchema(db); err != nil {
				t.Fatal(err)
			}
		}
		for _, item := range []struct {
			entity any
			run    tableMigration
		}{
			{&model.ProjectCut{}, migrateTable[model.ProjectCut]("project_cuts")},
			{&model.ProjectTimeline{}, migrateTable[model.ProjectTimeline]("project_timelines")},
		} {
			if err := source.Migrator().DropColumn(item.entity, "OriginCutID"); err != nil {
				t.Fatal(err)
			}
			if _, err := item.run.run(source, target, true); err == nil {
				t.Fatal("current67 missing provenance silently accepted", item.run.name)
			}
			var count int64
			if err := target.Table(item.run.name).Count(&count).Error; err != nil || count != 0 {
				t.Fatal("rejected source wrote target", count, err)
			}
		}
	})
}
