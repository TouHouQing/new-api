package database

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
)

func cutOriginsMigrationDB(t *testing.T, driver string) *gorm.DB {
	t.Helper()
	config := Config{Driver: "sqlite", DataDir: filepath.Join(t.TempDir(), "db")}
	if driver == "postgres" {
		dsn := os.Getenv("CANVAS_TEST_POSTGRES_DSN")
		if dsn == "" {
			t.Skip("isolated PostgreSQL not configured")
		}
		admin, err := Open(Config{Driver: "postgres", DSN: dsn})
		if err != nil {
			t.Fatal(err)
		}
		connection, _ := admin.DB()
		t.Cleanup(func() { connection.Close() })
		schema := fmt.Sprintf("cut_origins_%d", time.Now().UnixNano())
		if err = admin.Exec("CREATE SCHEMA " + schema).Error; err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() {
			if err := admin.Exec("DROP SCHEMA " + schema + " CASCADE").Error; err != nil {
				t.Error(err)
			}
		})
		testDSN, err := postgresDSNWithSearchPath(dsn, schema)
		if err != nil {
			t.Fatal(err)
		}
		config = Config{Driver: driver, DSN: testDSN}
	}
	db, err := Open(config)
	if err != nil {
		t.Fatal(err)
	}
	connection, _ := db.DB()
	t.Cleanup(func() { connection.Close() })
	if err = MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	return db
}

func TestProjectCutOrigins67UpgradePreservesBytesAndCompressesLongHistory(t *testing.T) {
	for _, driver := range []string{"sqlite", "postgres"} {
		t.Run(driver, func(t *testing.T) {
			db := cutOriginsMigrationDB(t, driver)
			base := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
			rows := []model.ProjectCut{
				{ID: "native", UserID: "owner", ProjectID: "p", RequestID: "native", SourceKey: "studio-native-v7", CreatedAt: base},
				{ID: "regional", UserID: "owner", ProjectID: "p", RequestID: "regional", SourceKey: "legacy-regional-v2:old", CreatedAt: base.Add(time.Second)},
				{ID: "saved", UserID: "owner", ProjectID: "p", RequestID: "saved", TimelineRevision: 2, CreatedAt: base.Add(2 * time.Second)},
				{ID: "edited", UserID: "owner", ProjectID: "p", RequestID: "edited", SourceKey: "timeline-edit-v1", TimelineRevision: 3, CreatedAt: base.Add(3 * time.Second)},
				{ID: "foreign-native", UserID: "other", ProjectID: "q", RequestID: "foreign-native", SourceKey: "studio-native-v7", CreatedAt: base},
				{ID: "healthy", UserID: "owner", ProjectID: "new", RequestID: "healthy", CreatedAt: base},
			}
			receipts := []model.ProjectCutApplyReceipt{}
			addReceipt := func(id string, rev int64) {
				raw, _ := json.Marshal(map[string]any{"appliedRevision": rev})
				receipts = append(receipts, model.ProjectCutApplyReceipt{ID: "receipt-" + id, UserID: "owner", ProjectID: "p", RequestID: "apply-" + id, CutID: id, ResultJSON: string(raw), CreatedAt: base.Add(time.Duration(rev) * time.Second)})
			}
			addReceipt("regional", 2)
			addReceipt("edited", 3)
			for i := 0; i < 400; i++ {
				id := fmt.Sprintf("snapshot-%03d", i)
				rev := int64(i + 3)
				rows = append(rows, model.ProjectCut{ID: id, UserID: "owner", ProjectID: "p", RequestID: id, SourceKey: "working-export-v1", TimelineRevision: rev, CreatedAt: base.Add(time.Duration(i+4) * time.Second)})
				addReceipt(id, rev+1)
			}
			for i := range rows {
				rows[i].PayloadJSON = ` {"version":2,"tracks":[],"clips":[],"durationMs":0} `
				rows[i].MetadataJSON = ` {"original":"unchanged"} `
				rows[i].TimelineSHA256 = strings.Repeat("a", 64)
				if err := db.Create(&rows[i]).Error; err != nil {
					t.Fatal(err)
				}
			}
			if err := db.Create(&receipts).Error; err != nil {
				t.Fatal(err)
			}
			timeline := model.ProjectTimeline{UserID: "owner", ProjectID: "p", Revision: 403, PayloadJSON: rows[0].PayloadJSON, CreatedAt: base, UpdatedAt: base.Add(450 * time.Second)}
			if err := db.Create(&timeline).Error; err != nil {
				t.Fatal(err)
			}
			for _, entity := range []any{&model.ProjectCut{}, &model.ProjectTimeline{}} {
				if err := db.Migrator().DropColumn(entity, "OriginCutID"); err != nil {
					t.Fatal(err)
				}
			}
			if err := db.Where("version = ?", 67).Delete(&schemaMigration{}).Error; err != nil {
				t.Fatal(err)
			}
			if err := MigrateSchema(db); err != nil {
				t.Fatal(err)
			}
			if err := MigrateSchema(db); err != nil {
				t.Fatal("repeated migration", err)
			}
			for _, before := range rows {
				var after model.ProjectCut
				if err := db.First(&after, "id = ?", before.ID).Error; err != nil {
					t.Fatal(err)
				}
				if after.PayloadJSON != before.PayloadJSON || after.MetadataJSON != before.MetadataJSON || after.TimelineSHA256 != before.TimelineSHA256 || !after.CreatedAt.Equal(before.CreatedAt) {
					t.Fatal("immutable cut changed", before.ID)
				}
				expected := ""
				if before.ID == "saved" || before.ID == "edited" || strings.HasPrefix(before.ID, "snapshot-") {
					expected = "regional"
				}
				if after.OriginCutID != expected {
					t.Fatal("wrong origin", before.ID, after.OriginCutID, expected)
				}
			}
			var after model.ProjectTimeline
			if err := db.First(&after, "project_id = ?", "p").Error; err != nil {
				t.Fatal(err)
			}
			if after.OriginCutID != "regional" || after.PayloadJSON != timeline.PayloadJSON || after.Revision != timeline.Revision || !after.UpdatedAt.Equal(timeline.UpdatedAt) {
				t.Fatal("working timeline or origin changed", after)
			}
			for _, before := range receipts {
				var kept model.ProjectCutApplyReceipt
				if err := db.First(&kept, "id = ?", before.ID).Error; err != nil || kept.ResultJSON != before.ResultJSON || !kept.CreatedAt.Equal(before.CreatedAt) {
					t.Fatal("receipt changed", before.ID, err)
				}
			}
		})
	}
}

func TestProjectCutOrigins67RejectsForeignAmbiguousAndCyclicSources(t *testing.T) {
	for _, driver := range []string{"sqlite", "postgres"} {
		for _, scenario := range []string{"foreign", "ambiguous", "cycle"} {
			t.Run(driver+"/"+scenario, func(t *testing.T) {
				db := cutOriginsMigrationDB(t, driver)
				a := model.ProjectCut{ID: "a", UserID: "owner", ProjectID: "p", RequestID: "a", SourceKey: "working-export-v1", TimelineRevision: 4}
				b := model.ProjectCut{ID: "b", UserID: "owner", ProjectID: "p", RequestID: "b", SourceKey: "working-export-v1", TimelineRevision: 4}
				if scenario == "foreign" {
					b.UserID = "other"
					b.ProjectID = "q"
				}
				if scenario == "cycle" {
					a.OriginCutID = "b"
					b.OriginCutID = "a"
				}
				if err := db.Create(&[]model.ProjectCut{a, b}).Error; err != nil {
					t.Fatal(err)
				}
				if scenario != "cycle" {
					receipts := []model.ProjectCutApplyReceipt{{ID: "r1", UserID: "owner", ProjectID: "p", RequestID: "r1", CutID: "b", ResultJSON: `{"appliedRevision":3}`}}
					if scenario == "ambiguous" {
						receipts = append(receipts, model.ProjectCutApplyReceipt{ID: "r2", UserID: "owner", ProjectID: "p", RequestID: "r2", CutID: "a", ResultJSON: `{"appliedRevision":3}`})
					}
					if err := db.Create(&receipts).Error; err != nil {
						t.Fatal(err)
					}
				}
				if err := db.Transaction(migrateProjectCutOrigins); err == nil {
					t.Fatal("invalid origin migration accepted", scenario)
				}
				var kept model.ProjectCut
				db.First(&kept, "id = ?", "a")
				if kept.OriginCutID != a.OriginCutID {
					t.Fatal("rejected migration partially changed data")
				}
			})
		}
	}
}
