package main

import (
	"errors"

	"gorm.io/gorm"
)

// copyRows is true only inside the transaction that initializes an empty
// destination. Replace schema-created catalog defaults with the exact source
// configuration, including intentional deletions. Never clear on verification.
func migrateSeededTable[T any](name string) tableMigration {
	base := migrateTable[T](name)
	return tableMigration{name: name, run: func(source, target *gorm.DB, copyRows bool) (int, error) {
		if name != "skill_curation_settings" && name != "skill_curation_roots" {
			return 0, errors.New("未声明的初始化数据表，拒绝替换")
		}
		if copyRows {
			if err := target.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(new(T)).Error; err != nil {
				return 0, err
			}
		}
		return base.run(source, target, copyRows)
	}}
}
