package database

import (
	"fmt"
	"gorm.io/gorm"
	"os"
	"path/filepath"
	"testing"
	"time"
	"yingce/backend/internal/model"
)

func TestProjectCreationReceiptUpgradePreservesExistingProjects(t *testing.T) {
	for _, dialect := range []string{"sqlite", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			var db *gorm.DB
			config := Config{Driver: "sqlite", DataDir: filepath.Join(t.TempDir(), "db")}
			if dialect == "postgres" {
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
				schema := fmt.Sprintf("project_creation_migrate_%d", time.Now().UnixNano())
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
			var err error
			db, err = Open(config)
			if err != nil {
				t.Fatal(err)
			}
			connection, _ := db.DB()
			t.Cleanup(func() { connection.Close() })
			if err := MigrateSchema(db); err != nil {
				t.Fatal(err)
			}
			original := model.Project{ID: "before63", UserID: "owner", Name: "保留原项目", Status: model.ProjectStatusActive, Revision: 7}
			if err := db.Create(&original).Error; err != nil {
				t.Fatal(err)
			}
			if err := db.Migrator().DropTable(&model.ProjectCreationReceipt{}); err != nil {
				t.Fatal(err)
			}
			if err := db.Exec("DELETE FROM schema_migrations WHERE version = 63").Error; err != nil {
				t.Fatal(err)
			}
			if err := MigrateSchema(db); err != nil {
				t.Fatal(err)
			}
			var stored model.Project
			if err := db.First(&stored, "id = ?", original.ID).Error; err != nil || stored.Name != original.Name || stored.Revision != original.Revision {
				t.Fatal("migration changed original project", err)
			}
			var count int64
			if err := db.Model(&model.ProjectCreationReceipt{}).Count(&count).Error; err != nil || count != 0 {
				t.Fatal("migration fabricated creation receipts", err)
			}
			if status, err := ReadSchemaStatus(db); err != nil || !status.Ready || status.Current != CurrentSchemaVersion {
				t.Fatal("new schema not ready", err)
			}
		})
	}
}
