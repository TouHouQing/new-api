package main

import (
	"context"
	"fmt"
	"reflect"
	"strings"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"gorm.io/gorm/schema"
	"yingce/backend/internal/database"
)

// An import is a database snapshot, not a new business object. The normal
// Create callback fills zero timestamps/defaults and mutates the source slice.
// Build a parameterized INSERT with typed field values and the original NULL
// mask instead; do not run application hooks or synthesize historical values.
func snapshotSchema[T any](source *gorm.DB, name string) (*schema.Schema, error) {
	parsed := &gorm.Statement{DB: source}
	if err := parsed.Parse(new(T)); err != nil {
		return nil, err
	}
	if parsed.Schema.Table != name {
		return nil, fmt.Errorf("迁移模型与表名不一致：%s", name)
	}
	columns, err := source.Migrator().ColumnTypes(name)
	if err != nil {
		return nil, err
	}
	for _, column := range columns {
		if _, exists := parsed.Schema.FieldsByDBName[column.Name()]; !exists {
			return nil, fmt.Errorf("来源表 %s 包含未解释的字段 %s，拒绝遗漏数据", name, column.Name())
		}
	}
	if name == "route_attempts" && !source.Migrator().HasColumn(name, "provider_config_cipher") {
		status, err := database.ReadSchemaStatus(source)
		if err != nil {
			return nil, err
		}
		if status.Current < 1 || status.Current >= 62 {
			return nil, fmt.Errorf("来源结构版本%d缺少模型执行配置字段，拒绝遗漏数据", status.Current)
		}
	}
	if (name == "project_cuts" || name == "project_timelines") && !source.Migrator().HasColumn(name, "origin_cut_id") {
		status, err := database.ReadSchemaStatus(source)
		if err != nil {
			return nil, err
		}
		if status.Current < 1 || status.Current >= 67 {
			return nil, fmt.Errorf("来源结构版本%d缺少剪辑来源字段，拒绝遗漏数据", status.Current)
		}
	}
	if name == "tasks" && (!source.Migrator().HasColumn(name, "image_layer_delivery_status") || !source.Migrator().HasColumn(name, "image_layer_delivery_json")) {
		status, err := database.ReadSchemaStatus(source)
		if err != nil {
			return nil, err
		}
		if status.Current < 1 || status.Current >= 69 {
			return nil, fmt.Errorf("来源结构版本%d缺少图层交付字段，拒绝遗漏数据", status.Current)
		}
	}
	for _, column := range []string{"creative_brief_json", "archived", "narrative_json", "reference_states_json", "client_operation_id", "creation_intent_sha256"} {
		if !planningColumn70(name, column) || source.Migrator().HasColumn(name, column) {
			continue
		}
		status, err := database.ReadSchemaStatus(source)
		if err != nil {
			return nil, err
		}
		if status.Current < 1 || status.Current >= 70 {
			return nil, fmt.Errorf("来源结构版本%d缺少制作计划字段 %s.%s，拒绝遗漏数据", status.Current, name, column)
		}
	}
	return parsed.Schema, nil
}

func planningColumn70(table, column string) bool {
	return table == "projects" && column == "creative_brief_json" || table == "shots" && column == "archived" || table == "shot_revisions" && (column == "narrative_json" || column == "reference_states_json") || table == "tasks" && (column == "client_operation_id" || column == "creation_intent_sha256")
}

func insertSnapshotRows[T any](source, target *gorm.DB, name, order string, rows []T, parsed *schema.Schema) error {
	if len(rows) == 0 {
		return nil
	}
	var raw []map[string]any
	if err := source.Unscoped().Table(name).Order(order).Find(&raw).Error; err != nil {
		return err
	}
	if len(raw) != len(rows) {
		return fmt.Errorf("来源表 %s 在读取时发生变化，请使用一致性备份", name)
	}
	var fields []*schema.Field
	var names []clause.Column
	for _, column := range parsed.DBNames {
		field := parsed.FieldsByDBName[column]
		if field.Creatable {
			fields = append(fields, field)
			names = append(names, clause.Column{Name: column})
		}
	}
	ctx := context.Background()
	for start := 0; start < len(rows); start += 100 {
		end := min(start+100, len(rows))
		values := make([][]any, 0, end-start)
		for index := start; index < end; index++ {
			row := reflect.ValueOf(rows[index])
			if snapshotRawKey(parsed.PrimaryFields, raw[index]) != primaryKeyValue(parsed.PrimaryFields, row) {
				return fmt.Errorf("来源表 %s 的主键顺序变化，请使用一致性备份", name)
			}
			value := make([]any, len(fields))
			for i, field := range fields {
				original, exists := raw[index][field.DBName]
				if !exists {
					if planningColumn70(name, field.DBName) {
						// Absence was verified against the declared pre70 schema.
						// Empty means no known historic brief/intent, never a new run.
						if name == "shots" {
							value[i] = false
						} else {
							value[i] = ""
						}
						continue
					}
					if (name == "project_cuts" || name == "project_timelines") && field.DBName == "origin_cut_id" {
						value[i], _ = field.ValueOf(ctx, row)
						continue
					}
					// snapshotSchema already verified this is an older source. An
					// empty value means NO historical config was known, never a
					// fabricated snapshot from the current provider settings.
					if name == "route_attempts" && field.DBName == "provider_config_cipher" {
						value[i] = ""
						continue
					}
					if name == "tasks" && (field.DBName == "image_layer_delivery_status" || field.DBName == "image_layer_delivery_json") {
						// Older snapshots never authorized background group delivery.
						// Keep unknown historical intent empty instead of activating it.
						value[i] = ""
						continue
					}
					return fmt.Errorf("来源表 %s 缺少字段 %s", name, field.DBName)
				}
				if original != nil {
					value[i], _ = field.ValueOf(ctx, row)
				}
			}
			values = append(values, value)
		}
		statement := &gorm.Statement{DB: target, Context: ctx, Clauses: map[string]clause.Clause{}}
		statement.AddClause(clause.Insert{Table: clause.Table{Name: name}})
		statement.AddClause(clause.Values{Columns: names, Values: values})
		statement.Build("INSERT", "VALUES")
		result := target.Exec(statement.SQL.String(), statement.Vars...)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != int64(end-start) {
			return fmt.Errorf("表 %s 写入行数不一致", name)
		}
	}
	return nil
}

func snapshotRawKey(fields []*schema.Field, row map[string]any) string {
	parts := make([]string, 0, len(fields))
	for _, field := range fields {
		value := row[field.DBName]
		if bytes, ok := value.([]byte); ok {
			value = string(bytes)
		}
		parts = append(parts, field.DBName+"="+fmt.Sprint(value))
	}
	return strings.Join(parts, ",")
}
