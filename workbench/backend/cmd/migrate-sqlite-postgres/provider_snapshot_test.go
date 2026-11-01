package main

import (
	"path/filepath"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
)

func TestProviderConfigSnapshotIntroducedColumnPreservesOlderReadOnlySources(t *testing.T) {
	withMigrationTargets(t, func(t *testing.T, target *gorm.DB) {
		path := filepath.Join(t.TempDir(), "source.db")
		source, err := gorm.Open(sqlite.Open(path), &gorm.Config{})
		if err != nil {
			t.Fatal(err)
		}
		conn, _ := source.DB()
		t.Cleanup(func() { conn.Close() })
		if err := database.MigrateSchema(source); err != nil {
			t.Fatal(err)
		}
		if err := database.MigrateSchema(target); err != nil {
			t.Fatal(err)
		}
		row := model.RouteAttempt{ID: "legacy-attempt", TaskID: "task", RouteRun: 1, AttemptNumber: 1, DispatchState: "accepted", ProviderRequestID: "original-receipt"}
		if err := source.Create(&row).Error; err != nil {
			t.Fatal(err)
		}
		if err := source.Migrator().DropColumn(&model.RouteAttempt{}, "ProviderConfigCipher"); err != nil {
			t.Fatal(err)
		}
		migration := migrateTable[model.RouteAttempt]("route_attempts")
		if _, err := migration.run(source, target, true); err == nil {
			t.Fatal("missing current schema field silently accepted")
		}
		if err := source.Exec("DELETE FROM schema_migrations WHERE version >= 62").Error; err != nil {
			t.Fatal(err)
		}
		readonly, err := gorm.Open(sqlite.Open("file:"+path+"?mode=ro"), &gorm.Config{})
		if err != nil {
			t.Fatal(err)
		}
		reader, _ := readonly.DB()
		t.Cleanup(func() { reader.Close() })
		for _, copyRows := range []bool{true, false} {
			if count, err := migration.run(readonly, target, copyRows); err != nil || count != 1 {
				t.Fatal("older snapshot failed verification", count, err)
			}
		}
		var copied model.RouteAttempt
		if err := target.First(&copied, "id = ?", row.ID).Error; err != nil {
			t.Fatal(err)
		}
		if copied.ProviderConfigCipher != "" || copied.ProviderRequestID != row.ProviderRequestID || copied.DispatchState != row.DispatchState {
			t.Fatal("historical data or unknown config changed")
		}
		if readonly.Migrator().HasColumn("route_attempts", "provider_config_cipher") {
			t.Fatal("read-only source was upgraded")
		}
	})
}
