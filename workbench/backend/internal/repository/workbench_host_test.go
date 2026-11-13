package repository

import (
	"os"
	"path/filepath"
	"testing"

	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
)

func TestWorkbenchModelDescriptionSynchronization(t *testing.T) {
	for _, driver := range []string{"sqlite", "postgres", "mysql"} {
		t.Run(driver, func(t *testing.T) {
			dsn := os.Getenv("WORKBENCH_TEST_" + map[string]string{"postgres": "POSTGRES", "mysql": "MYSQL"}[driver] + "_DSN")
			if driver == "sqlite" {
				dsn = filepath.Join(t.TempDir(), "descriptions.db")
			} else if dsn == "" {
				t.Skip("dedicated test database not configured")
			}
			db, err := database.Open(database.Config{Driver: driver, DSN: dsn})
			if err != nil {
				t.Fatal(err)
			}
			connection, err := db.DB()
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { _ = connection.Close() })
			if err := db.AutoMigrate(&model.ModelChannel{}, &model.ChannelModel{}, &model.ChannelModelPriceTier{}); err != nil {
				t.Fatal(err)
			}
			repo := New(db)
			for _, description := range []string{"旧描述", "管理员配置的模型描述，支持换行\n与中文", "修改后的模型描述", "", ""} {
				if err := repo.SyncWorkbenchModel("description-test", "Video", description, "video", "newapi", "{}"); err != nil {
					t.Fatal(err)
				}
				var stored model.ChannelModel
				if err := db.First(&stored, "id = ?", "host-description-test").Error; err != nil {
					t.Fatal(err)
				}
				if stored.Description != description || stored.UnitPriceMicrocredits != 0 {
					t.Fatalf("description was not synchronized or host snapshot became a local price: %#v", stored)
				}
			}
			var version string
			query := "SELECT version()"
			if driver == "sqlite" {
				query = "SELECT sqlite_version()"
			}
			if err := db.Raw(query).Scan(&version).Error; err != nil {
				t.Fatal(err)
			}
			t.Logf("description create/update/clear passed on %s %s", driver, version)
		})
	}
}
