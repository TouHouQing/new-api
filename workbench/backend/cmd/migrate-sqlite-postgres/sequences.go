package main

import (
	"errors"
	"fmt"

	"yingce/backend/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Schema migrations create allocator seeds before business rows are copied.
// Counters are operational high-water marks: preserve deleted IDs and never
// move an existing counter backwards, including during verification-only reruns.
func migrateIDSequences() tableMigration {
	return tableMigration{name: "id_sequences", run: func(source, target *gorm.DB, copyRows bool) (int, error) {
		var rows []model.IDSequence
		if err := source.Order("name").Find(&rows).Error; err != nil {
			return 0, err
		}
		if err := validateExplicitStringLengths(source, "id_sequences", rows); err != nil {
			return 0, err
		}
		for _, row := range rows {
			if row.Value < 0 || row.Name == "" {
				return 0, errors.New("源编号计数器无效")
			}
		}
		if copyRows && len(rows) > 0 {
			conflict := clause.OnConflict{Columns: []clause.Column{{Name: "name"}}, DoUpdates: clause.Assignments(map[string]any{
				"value":      gorm.Expr("CASE WHEN id_sequences.value < excluded.value THEN excluded.value ELSE id_sequences.value END"),
				"updated_at": gorm.Expr("CASE WHEN id_sequences.value <= excluded.value THEN excluded.updated_at ELSE id_sequences.updated_at END"),
			})}
			if err := target.Clauses(conflict).CreateInBatches(&rows, 100).Error; err != nil {
				return 0, err
			}
		}
		var actual []model.IDSequence
		if err := target.Find(&actual).Error; err != nil {
			return 0, err
		}
		byName := make(map[string]int64, len(actual))
		for _, row := range actual {
			if row.Value < 0 {
				return 0, errors.New("目标编号计数器无效")
			}
			byName[row.Name] = row.Value
		}
		for _, row := range rows {
			if value, exists := byName[row.Name]; !exists || value < row.Value {
				return 0, fmt.Errorf("编号计数器 %s 缺失或小于来源高水位", row.Name)
			}
		}
		return len(rows), nil
	}}
}
