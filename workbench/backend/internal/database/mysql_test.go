package database

import (
	"context"
	"gorm.io/gorm/clause"
	"os"
	"strings"
	"testing"
	"time"
	"yingce/backend/internal/model"
)

func TestMySQLNativeFullSchemaAndRestart(t *testing.T) {
	dsn := os.Getenv("YINGCE_MYSQL_TEST_DSN")
	if dsn == "" {
		t.Skip("requires the owned real MySQL acceptance instance")
	}
	db, err := Open(Config{Driver: "mysql", DSN: dsn + "&clientFoundRows=true"})
	if err != nil {
		t.Fatal("MySQL connection failed", err)
	}
	if err := MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	if err := MigrateSchema(db); err != nil {
		t.Fatal("migration restart", err)
	}
	if err := RequireSchemaVersion(db); err != nil {
		t.Fatal(err)
	}
	tables, err := db.Migrator().GetTables()
	if err != nil || len(tables) != 163 {
		t.Fatal("native table count", len(tables), err)
	}
	unit := model.ProjectUnit{ID: "mysql-clock-and-long-text", ProjectID: "mysql-database-fixture", Title: "真实MySQL软件合同", Kind: "chapter", SourceText: strings.Repeat("多语言原文🙂", 18000), CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC()}
	// This fixture belongs exclusively to the opt-in acceptance database.
	if err := db.Where("id = ? AND project_id = ?", unit.ID, unit.ProjectID).Delete(&model.ProjectUnit{}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&unit).Error; err != nil {
		t.Fatal(err)
	}
	duplicate := unit
	duplicate.Title = "must not overwrite"
	ignored := db.Clauses(clause.OnConflict{DoNothing: true}).Create(&duplicate)
	if ignored.Error != nil || ignored.RowsAffected != 0 {
		t.Fatal("native duplicate receipt must remain unchanged", ignored.Error, ignored.RowsAffected)
	}
	var loaded model.ProjectUnit
	if err := db.First(&loaded, "id = ?", unit.ID).Error; err != nil {
		t.Fatal(err)
	}
	if loaded.SourceText != unit.SourceText || loaded.UpdatedAt.UnixMicro() != unit.UpdatedAt.UnixMicro() || loaded.UpdatedAt.Nanosecond()%1000 != 0 {
		t.Fatal("long text or UTC microseconds changed")
	}
	result := db.Model(&model.ProjectUnit{}).Where("id = ? AND updated_at = ?", unit.ID, unit.UpdatedAt).UpdateColumn("title", "CAS 保留微秒")
	if result.Error != nil || result.RowsAffected != 1 {
		t.Fatal("native CAS clock", result.Error)
	}
	sqlDB, _ := db.DB()
	if err := sqlDB.PingContext(context.Background()); err != nil {
		t.Fatal(err)
	}
}
