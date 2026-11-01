package main

import (
	"crypto/sha256"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"os"
	"path/filepath"
	"testing"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
)

func TestCreativePlanningCopy70AndReadOnly69PreservesNativeHistory(t *testing.T) {
	withMigrationTargets(t, func(t *testing.T, target *gorm.DB) {
		path := filepath.Join(t.TempDir(), "source.db")
		source, err := gorm.Open(sqlite.Open(path), &gorm.Config{})
		if err != nil {
			t.Fatal(err)
		}
		conn, _ := source.DB()
		t.Cleanup(func() { conn.Close() })
		for _, db := range []*gorm.DB{source, target} {
			if err := database.MigrateSchema(db); err != nil {
				t.Fatal(err)
			}
		}
		rows := []struct {
			value any
			copy  tableMigration
		}{
			{&model.Project{ID: "project", UserID: "owner", Name: "原目标", CreativeBriefJSON: `{"version":1,"goal":"story"}`}, migrateTable[model.Project]("projects")},
			{&model.Shot{ID: "shot", ProjectID: "project", CurrentRevisionID: "revision", Title: "原镜头", Archived: true}, migrateTable[model.Shot]("shots")},
			{&model.ShotRevision{ID: "revision", ShotID: "shot", PlotDescription: "原画面", NarrativeJSON: `{"purpose":"opening"}`, ReferenceStatesJSON: `[]`}, migrateTable[model.ShotRevision]("shot_revisions")},
			{&model.Task{ID: "task", UserID: "owner", Type: "canvas_text", Status: model.TaskStatusSucceeded, InputJSON: `{"original":true}`, ResultJSON: `{"originalResult":true}`, ClientOperationID: "original-operation-id", CreationIntentSHA256: "fixed-intent"}, migrateTable[model.Task]("tasks")},
			{&model.ProjectShotPlanRecord{ID: "plan", UserID: "owner", ProjectID: "project", UnitID: "unit", Kind: "archive", PayloadJSON: `{"version":1}`, PayloadSHA256: "fixed-plan"}, migrateIntroducedTable[model.ProjectShotPlanRecord]("project_shot_plan_records", 70)},
		}
		for _, row := range rows {
			if err := source.Create(row.value).Error; err != nil {
				t.Fatal(err)
			}
			for _, copyRows := range []bool{true, false} {
				if count, err := row.copy.run(source, target, copyRows); err != nil || count != 1 {
					t.Fatal("native current copy/verify failed", count, err)
				}
			}
		}
		for _, column := range []struct {
			model any
			field string
		}{{&model.Project{}, "CreativeBriefJSON"}, {&model.Shot{}, "Archived"}, {&model.ShotRevision{}, "NarrativeJSON"}, {&model.ShotRevision{}, "ReferenceStatesJSON"}, {&model.Task{}, "ClientOperationID"}, {&model.Task{}, "CreationIntentSHA256"}} {
			if err := source.Migrator().DropColumn(column.model, column.field); err != nil {
				t.Fatal(err)
			}
		}
		if _, err := migrateTable[model.Task]("tasks").run(source, target, false); err == nil {
			t.Fatal("claimed70 missing intent columns accepted")
		}
		if err := source.Migrator().DropTable(&model.ProjectShotPlanRecord{}); err != nil {
			t.Fatal(err)
		}
		if err := source.Exec("DELETE FROM schema_migrations WHERE version >= 70").Error; err != nil {
			t.Fatal(err)
		}
		if _, err := rows[4].copy.run(source, target, false); err == nil {
			t.Fatal("absent old table hid existing target history")
		}
		for _, row := range rows {
			if err := target.Delete(row.value).Error; err != nil {
				t.Fatal(err)
			}
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
		for index, row := range rows {
			wanted := 1
			if index == 4 {
				wanted = 0
			}
			for _, copyRows := range []bool{true, false} {
				if count, err := row.copy.run(readonly, target, copyRows); err != nil || count != wanted {
					t.Fatal("readonly69 copy/verify failed", count, err)
				}
			}
		}
		after, err := os.ReadFile(path)
		if err != nil || sha256.Sum256(before) != sha256.Sum256(after) {
			t.Fatal("readonly source mutated", err)
		}
		var task model.Task
		target.First(&task, "id = ?", "task")
		if task.ClientOperationID != "" || task.CreationIntentSHA256 != "" || task.InputJSON != `{"original":true}` || task.ResultJSON != `{"originalResult":true}` {
			t.Fatal("unknown old intent activated or history rewritten")
		}
	})
}
