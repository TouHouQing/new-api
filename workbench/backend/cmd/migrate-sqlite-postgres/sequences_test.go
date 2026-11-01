package main

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"testing"
	"time"

	"yingce/backend/internal/database"
	"yingce/backend/internal/model"

	"gorm.io/gorm"
)

func sequenceSource(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := database.Open(database.Config{Driver: "sqlite", DSN: filepath.Join(t.TempDir(), "source.db")})
	if err != nil {
		t.Fatal(err)
	}
	connection, _ := db.DB()
	t.Cleanup(func() { _ = connection.Close() })
	if err := db.AutoMigrate(&model.IDSequence{}); err != nil {
		t.Fatal(err)
	}
	return db
}

func TestSequenceMigrationPreservesHighWaterAndVerifiesReruns(t *testing.T) {
	withMigrationTargets(t, testSequenceCopy)
}

func withMigrationTargets(t *testing.T, run func(*testing.T, *gorm.DB)) {
	t.Helper()
	t.Run("sqlite", func(t *testing.T) { run(t, sequenceSource(t)) })
	t.Run("postgres", func(t *testing.T) {
		dsn := os.Getenv("CANVAS_TEST_POSTGRES_DSN")
		if dsn == "" {
			t.Skip("set CANVAS_TEST_POSTGRES_DSN to an isolated test database")
		}
		admin, err := database.Open(database.Config{Driver: "postgres", DSN: dsn})
		if err != nil {
			t.Fatal(err)
		}
		name := fmt.Sprintf("migration_sequences_%d", time.Now().UnixNano())
		if err := admin.Exec("CREATE SCHEMA " + name).Error; err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() {
			_ = admin.Exec("DROP SCHEMA " + name + " CASCADE").Error
			connection, _ := admin.DB()
			_ = connection.Close()
		})
		parsed, err := url.Parse(dsn)
		if err != nil {
			t.Fatal(err)
		}
		query := parsed.Query()
		query.Set("search_path", name)
		parsed.RawQuery = query.Encode()
		target, err := database.Open(database.Config{Driver: "postgres", DSN: parsed.String()})
		if err != nil {
			t.Fatal(err)
		}
		connection, _ := target.DB()
		t.Cleanup(func() { _ = connection.Close() })
		if err := target.AutoMigrate(&model.IDSequence{}); err != nil {
			t.Fatal(err)
		}
		run(t, target)
	})
}

func testSequenceCopy(t *testing.T, target *gorm.DB) {
	t.Helper()
	source := sequenceSource(t)
	oldTime := time.Unix(1_700_000_000, 0).UTC()
	rows := []model.IDSequence{{Name: "id:CHANNEL", Value: 25, UpdatedAt: oldTime}, {Name: "id:MODEL", Value: 4, UpdatedAt: oldTime}}
	if err := source.Create(&rows).Error; err != nil {
		t.Fatal(err)
	}
	seeds := []model.IDSequence{{Name: "id:CHANNEL", Value: 0}, {Name: "id:MODEL", Value: 40}, {Name: "id:ROUTE", Value: 0}}
	if err := target.Create(&seeds).Error; err != nil {
		t.Fatal(err)
	}
	migration := migrateIDSequences()
	if count, err := migration.run(source, target, true); err != nil || count != 2 {
		t.Fatalf("counter copy: %d %v", count, err)
	}
	var copied model.IDSequence
	if err := target.First(&copied, "name = ?", "id:CHANNEL").Error; err != nil {
		t.Fatal(err)
	}
	if copied.Value != 25 || !copied.UpdatedAt.Equal(oldTime) {
		t.Fatalf("source high-water not preserved: %#v", copied)
	}
	var higher model.IDSequence
	if err := target.First(&higher, "name = ?", "id:MODEL").Error; err != nil {
		t.Fatal(err)
	}
	if higher.Value != 40 {
		t.Fatal("existing allocator high-water regressed")
	}
	if _, err := migration.run(source, target, false); err != nil {
		t.Fatalf("verification-only rerun failed: %v", err)
	}
	if err := target.Model(&model.IDSequence{}).Where("name = ?", "id:CHANNEL").Update("value", 1).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := migration.run(source, target, false); err == nil {
		t.Fatal("regressed counter was accepted")
	}
}

func TestFullFreshSchemaCopyDoesNotDuplicateSeededSequences(t *testing.T) {
	source, target := sequenceSource(t), sequenceSource(t)
	for _, db := range []*gorm.DB{source, target} {
		if err := database.MigrateSchema(db); err != nil {
			t.Fatal(err)
		}
	}
	if err := target.Transaction(func(tx *gorm.DB) error {
		for _, migration := range migrations() {
			if _, err := migration.run(source, tx, true); err != nil {
				return fmt.Errorf("%s: %w", migration.name, err)
			}
		}
		return database.ReconcilePrefixedIDSequences(tx)
	}); err != nil {
		t.Fatal(err)
	}
	for _, migration := range migrations() {
		if _, err := migration.run(source, target, false); err != nil {
			t.Fatalf("second verification %s: %v", migration.name, err)
		}
	}
}
