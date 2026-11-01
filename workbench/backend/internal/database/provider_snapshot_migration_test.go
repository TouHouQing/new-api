package database

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
)

func TestProviderConfigSnapshotUpgrade61PreservesHistoricalReceipts(t *testing.T) {
	for _, driver := range []string{"sqlite", "postgres"} {
		t.Run(driver, func(t *testing.T) {
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
				schema := fmt.Sprintf("provider_snapshot_migrate_%d", time.Now().UnixNano())
				if err := admin.Exec("CREATE SCHEMA " + schema).Error; err != nil {
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
				config = Config{Driver: "postgres", DSN: testDSN}
			}
			db, err := Open(config)
			if err != nil {
				t.Fatal(err)
			}
			connection, _ := db.DB()
			t.Cleanup(func() { connection.Close() })
			testSnapshotMigration(t, db)
		})
	}
}

func testSnapshotMigration(t *testing.T, db *gorm.DB) {
	t.Helper()
	if err := MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	row := model.RouteAttempt{ID: "before62", TaskID: "historical-task", RouteRun: 1, AttemptNumber: 1, DispatchState: "accepted", ProviderRequestID: "preserved-receipt", FailureMessage: "preserved history"}
	if err := db.Create(&row).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Migrator().DropColumn(&model.RouteAttempt{}, "ProviderConfigCipher"); err != nil {
		t.Fatal(err)
	}
	if _, err := ReadSchemaStatus(db); err == nil {
		t.Fatal("current schema missing column appeared ready")
	}
	if err := db.Exec("DELETE FROM schema_migrations WHERE version = 62").Error; err != nil {
		t.Fatal(err)
	}
	if err := MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	var restored model.RouteAttempt
	if err := db.First(&restored, "id = ?", row.ID).Error; err != nil {
		t.Fatal(err)
	}
	if restored.ProviderConfigCipher != "" || restored.ProviderRequestID != row.ProviderRequestID || restored.FailureMessage != row.FailureMessage {
		t.Fatal("upgrade changed historical receipt or fabricated config")
	}
	if status, err := ReadSchemaStatus(db); err != nil || !status.Ready || status.Current != CurrentSchemaVersion {
		t.Fatal("upgraded schema not ready", err)
	}
}
