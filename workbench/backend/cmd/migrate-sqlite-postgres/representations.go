package main

import "yingce/backend/internal/model"

// The public model uses an empty string for taskless representations. Reading
// through it would turn SQL NULL into "" and collapse imported candidates at
// the task/role unique index. This migration projection keeps the SQL value.
type assetRepresentationMigrationRow struct {
	model.AssetRepresentation
	TaskID *string `gorm:"column:task_id;size:36"`
}

func (assetRepresentationMigrationRow) TableName() string { return "asset_representations" }
