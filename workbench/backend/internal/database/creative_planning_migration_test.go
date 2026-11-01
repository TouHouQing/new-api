package database

import (
	"reflect"
	"testing"
	"yingce/backend/internal/model"
)

func TestCreativePlanningMigration70PreservesOriginalTasksAndShotVersions(t *testing.T) {
	db, err := Open(Config{Driver: "sqlite", DataDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	conn, _ := db.DB()
	t.Cleanup(func() { conn.Close() })
	if err := MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	task := model.Task{ID: "historical-task", UserID: "owner", Type: "canvas_video", Status: model.TaskStatusSucceeded, InputJSON: `{"originalInput":true}`, ResultJSON: `{"originalOutput":true}`}
	shot := model.Shot{ID: "historical-shot", ProjectID: "project", CurrentRevisionID: "revision", Title: "原镜头"}
	revision := model.ShotRevision{ID: "revision", ShotID: shot.ID, PlotDescription: "原画面", ImagePrompt: "原提示词"}
	for _, row := range []any{&task, &shot, &revision} {
		if err := db.Create(row).Error; err != nil {
			t.Fatal(err)
		}
	}
	var beforeTask model.Task
	var beforeShot model.Shot
	var beforeRevision model.ShotRevision
	db.First(&beforeTask, "id = ?", task.ID)
	db.First(&beforeShot, "id = ?", shot.ID)
	db.First(&beforeRevision, "id = ?", revision.ID)
	for _, column := range []struct {
		model any
		field string
	}{{&model.Project{}, "CreativeBriefJSON"}, {&model.Shot{}, "Archived"}, {&model.ShotRevision{}, "NarrativeJSON"}, {&model.ShotRevision{}, "ReferenceStatesJSON"}, {&model.Task{}, "ClientOperationID"}, {&model.Task{}, "CreationIntentSHA256"}} {
		if err := db.Migrator().DropColumn(column.model, column.field); err != nil {
			t.Fatal(err)
		}
	}
	if err := db.Migrator().DropTable(&model.ProjectShotPlanRecord{}); err != nil {
		t.Fatal(err)
	}
	if err := db.Exec("DELETE FROM schema_migrations WHERE version >= 70").Error; err != nil {
		t.Fatal(err)
	}
	if status, err := ReadSchemaStatus(db); err != nil || status.Ready || status.Current != 69 {
		t.Fatal("schema69 readiness was not reported correctly", err)
	}
	if err := RequireSchemaVersion(db); err == nil {
		t.Fatal("schema69 was admitted by server startup")
	}
	for range 2 {
		if err := MigrateSchema(db); err != nil {
			t.Fatal("migration failed or was not idempotent", err)
		}
	}
	var afterTask model.Task
	var afterShot model.Shot
	var afterRevision model.ShotRevision
	db.First(&afterTask, "id = ?", task.ID)
	db.First(&afterShot, "id = ?", shot.ID)
	db.First(&afterRevision, "id = ?", revision.ID)
	if !reflect.DeepEqual(beforeTask, afterTask) || !reflect.DeepEqual(beforeShot, afterShot) || !reflect.DeepEqual(beforeRevision, afterRevision) {
		t.Fatal("schema upgrade rewrote historical production inputs/results")
	}
	if status, err := ReadSchemaStatus(db); err != nil || !status.Ready || status.Current != CurrentSchemaVersion {
		t.Fatal("schema upgrade not ready", err)
	}
}
