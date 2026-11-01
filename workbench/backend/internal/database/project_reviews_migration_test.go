package database

import (
	"reflect"
	"testing"
	"yingce/backend/internal/model"
)

func TestMigrateSchema68AddsReviewTablesWithoutRewritingPriorProduction(t *testing.T) {
	db, err := Open(Config{Driver: "sqlite", DataDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	connection, _ := db.DB()
	t.Cleanup(func() { connection.Close() })
	if err = MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	tables := []any{&model.ProjectMember{}, &model.ProjectReview{}, &model.ProjectReviewComment{}, &model.ProjectReviewShare{}, &model.ProjectReviewReceipt{}}
	if err = db.Migrator().DropTable(tables...); err != nil {
		t.Fatal(err)
	}
	if err = db.Where("version >= ?", 68).Delete(&schemaMigration{}).Error; err != nil {
		t.Fatal(err)
	}
	timeline := model.ProjectTimeline{ProjectID: "original", UserID: "owner", Revision: 9, PayloadJSON: `{"version":2,"tracks":[],"clips":[],"durationMs":0}`, OriginCutID: "original-cut"}
	cut := model.ProjectCut{ID: "original-cut", UserID: "owner", ProjectID: "original", RequestID: "original-cut-request", PayloadJSON: timeline.PayloadJSON, MetadataJSON: `{"preservedOnly":["legacy-setting"]}`, TimelineSHA256: "original-digest"}
	for _, row := range []any{&timeline, &cut} {
		if err = db.Create(row).Error; err != nil {
			t.Fatal(err)
		}
	}
	if err = db.Where("project_id = ?", "original").Take(&timeline).Error; err != nil {
		t.Fatal(err)
	}
	if err = db.Where("id = ?", cut.ID).Take(&cut).Error; err != nil {
		t.Fatal(err)
	}
	if err = MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	if err = MigrateSchema(db); err != nil {
		t.Fatal("migration not idempotent", err)
	}
	for _, table := range tables {
		if !db.Migrator().HasTable(table) {
			t.Fatal("missing review table")
		}
	}
	var after model.ProjectTimeline
	var afterCut model.ProjectCut
	if err = db.Where("project_id = ?", "original").Take(&after).Error; err != nil {
		t.Fatal(err)
	}
	if err = db.Where("id = ?", cut.ID).Take(&afterCut).Error; err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(after, timeline) || !reflect.DeepEqual(afterCut, cut) {
		t.Fatal("schema68 rewrote original production data")
	}
}
