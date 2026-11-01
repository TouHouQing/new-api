package main

import (
	"fmt"
	"os"
	"testing"

	"yingce/backend/internal/database"

	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func TestRealReadOnlySnapshotCopyAndVerification(t *testing.T) {
	path := os.Getenv("CANVAS_TEST_SOURCE_SNAPSHOT_PATH")
	if path == "" {
		t.Skip("set CANVAS_TEST_SOURCE_SNAPSHOT_PATH to a task-owned consistent SQLite backup")
	}
	withMigrationTargets(t, func(t *testing.T, destination *gorm.DB) {
		source, err := database.Open(database.Config{Driver: "sqlite", DSN: "file:" + path + "?mode=ro"})
		if err != nil {
			t.Fatal(err)
		}
		connection, _ := source.DB()
		t.Cleanup(func() { _ = connection.Close() })
		source = source.Session(&gorm.Session{Logger: logger.Default.LogMode(logger.Silent)})
		target := destination.Session(&gorm.Session{Logger: logger.Default.LogMode(logger.Silent)})
		if err := verifySQLite(source); err != nil {
			t.Fatal(err)
		}
		if err := verifyMigrationCoverage(source); err != nil {
			t.Fatal(err)
		}
		copied := 0
		if err := target.Transaction(func(tx *gorm.DB) error {
			if err := database.MigrateSchema(tx); err != nil {
				return err
			}
			for _, migration := range migrations() {
				count, err := migration.run(source, tx, true)
				if err != nil {
					return fmt.Errorf("%s: %w", migration.name, err)
				}
				copied += count
			}
			return database.ReconcilePrefixedIDSequences(tx)
		}); err != nil {
			t.Fatal(err)
		}
		for _, migration := range migrations() {
			if _, err := migration.run(source, target, false); err != nil {
				t.Fatalf("verification %s: %v", migration.name, err)
			}
		}
		sourceTables := 0
		for _, migration := range migrations() {
			if source.Migrator().HasTable(migration.name) {
				sourceTables++
			}
		}
		t.Logf("real read-only snapshot: %d source business tables, %d target table checks, %d business rows; fresh copy and reread verified", sourceTables, len(migrations()), copied)
	})
}
