// Package testdb contains opt-in database integration fixtures. It is imported
// only by tests and never opens or cleans a deployment database.
package testdb

import (
	"crypto/rand"
	"encoding/hex"
	"os"
	"strings"
	"testing"

	sqlmysql "github.com/go-sql-driver/mysql"
	"gorm.io/gorm"
	"yingce/backend/internal/database"
)

func MySQL(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("YINGCE_MYSQL_TEST_DSN")
	if dsn == "" {
		t.Skip("requires an explicitly owned real MySQL test instance")
	}
	parsed, err := sqlmysql.ParseDSN(dsn)
	if err != nil || (parsed.DBName != "yingce_native75" && !strings.HasPrefix(parsed.DBName, "yingce_test_")) {
		t.Fatal("refusing an unowned MySQL test database")
	}
	admin, err := database.Open(database.Config{Driver: "mysql", DSN: dsn})
	if err != nil {
		t.Fatal(err)
	}
	adminSQL, _ := admin.DB()
	adminSQL.SetMaxOpenConns(2)
	nonce := make([]byte, 12)
	if _, err := rand.Read(nonce); err != nil {
		adminSQL.Close()
		t.Fatal(err)
	}
	name := "yingce_test_" + hex.EncodeToString(nonce)
	if err := admin.Exec("CREATE DATABASE `" + name + "` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin").Error; err != nil {
		adminSQL.Close()
		t.Fatal(err)
	}
	var db *gorm.DB
	t.Cleanup(func() {
		if db != nil {
			sqlDB, _ := db.DB()
			_ = sqlDB.Close()
		}
		if err := admin.Exec("DROP DATABASE `" + name + "`").Error; err != nil {
			t.Error("remove owned test database", err)
		}
		_ = adminSQL.Close()
	})
	parsed.DBName = name
	db, err = database.Open(database.Config{Driver: "mysql", DSN: parsed.FormatDSN()})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(10)
	sqlDB.SetMaxIdleConns(3)
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	return db
}
