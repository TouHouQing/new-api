package repository

import (
	"crypto/sha256"
	"encoding/hex"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"yingce/backend/internal/model"
)

// MySQL transaction locks use the native sequence table under a separate
// namespace. The row lock releases on commit/rollback, including pooled calls.
func lockMySQLNamespace(tx *gorm.DB, namespace string) error {
	digest := sha256.Sum256([]byte(namespace))
	name := "lock:" + hex.EncodeToString(digest[:16])
	if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&model.IDSequence{Name: name, UpdatedAt: time.Now().UTC()}).Error; err != nil {
		return err
	}
	var row model.IDSequence
	return tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&row, "name = ?", name).Error
}
