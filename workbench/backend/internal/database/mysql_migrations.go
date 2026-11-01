package database

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"gorm.io/gorm"
)

// MySQL DDL commits implicitly. A connection-owned migration lock survives
// those commits; the existing per-step migration receipts still support a
// restart without treating partially executed DDL as a completed migration.
func migrateMySQLSchema(db *gorm.DB) error {
	return db.Connection(func(connection *gorm.DB) error {
		connection = connection.Session(&gorm.Session{})
		var databaseName string
		if err := connection.Raw("SELECT DATABASE()").Scan(&databaseName).Error; err != nil {
			return err
		}
		digest := sha256.Sum256([]byte(databaseName))
		name := "yingce-schema:" + hex.EncodeToString(digest[:20])
		var acquired int
		if err := connection.Raw("SELECT GET_LOCK(?, 60)", name).Scan(&acquired).Error; err != nil {
			return err
		}
		if acquired != 1 {
			return errors.New("无法取得 MySQL 迁移锁")
		}
		defer connection.Exec("SELECT RELEASE_LOCK(?)", name)
		if !connection.Migrator().HasTable(&schemaMigration{}) {
			tables, err := connection.Migrator().GetTables()
			if err != nil {
				return err
			}
			if len(tables) > 0 {
				return errors.New("MySQL 中已有其他结构；请使用新的数据库并从完整工程迁移，不在原数据库上自动覆盖")
			}
		}
		return migrateSchema(connection)
	})
}
