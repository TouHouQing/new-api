package repository

import (
	"errors"
	"gorm.io/gorm"
	"yingce/backend/internal/model"
)

func (r *Repository) createLegacyPlanningRows(rows *ProductionImportRows) error {
	plan := rows.Planning
	if plan == nil {
		return nil
	}
	if plan.Record.UserID != rows.Project.UserID || plan.Record.ProjectID != rows.Project.ID || plan.Record.Kind != "archive" || shotPlanHash(plan.Record.PayloadJSON) != plan.Record.PayloadSHA256 {
		return ErrProjectTimelineConflict
	}
	var existing model.ProjectShotPlanRecord
	err := r.db.Where("id = ?", plan.Record.ID).First(&existing).Error
	if err == nil {
		if existing.UserID != plan.Record.UserID || existing.ProjectID != plan.Record.ProjectID || existing.UnitID != plan.Record.UnitID || existing.PayloadSHA256 != plan.Record.PayloadSHA256 || existing.PayloadJSON != plan.Record.PayloadJSON {
			return ErrProjectTimelineConflict
		}
		return nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	if plan.Unit != nil {
		if plan.Unit.ProjectID != rows.Project.ID || plan.Unit.ID != plan.Record.UnitID {
			return ErrProjectTimelineConflict
		}
		for i := range plan.Versions {
			version := &plan.Versions[i]
			if _, err := r.AssetForUser(rows.Project.UserID, version.AssetID); err != nil {
				return err
			}
			var linked int64
			if err := r.db.Model(&model.ProjectAssetLink{}).Where("project_id = ? AND asset_id = ?", rows.Project.ID, version.AssetID).Count(&linked).Error; err != nil {
				return err
			}
			if linked != 1 {
				return ErrProjectTimelineConflict
			}
			var existing model.AssetVersion
			err := r.db.Where("id = ?", version.ID).First(&existing).Error
			if err == nil {
				if existing.AssetID != version.AssetID || existing.DefinitionJSON != version.DefinitionJSON || existing.Prompt != version.Prompt {
					return ErrProjectTimelineConflict
				}
				continue
			}
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			var maximum int
			if err := r.db.Model(&model.AssetVersion{}).Where("asset_id = ?", version.AssetID).Select("COALESCE(MAX(version), 0)").Scan(&maximum).Error; err != nil {
				return err
			}
			version.Version = maximum + 1
			if err := r.db.Create(version).Error; err != nil {
				return err
			}
		}
		for _, representation := range plan.Representations {
			if err := r.db.Omit("TaskID").Create(&representation).Error; err != nil {
				return err
			}
		}
		for _, reference := range plan.References {
			if _, err := r.AssetVersionForProject(rows.Project.ID, reference.AssetVersionID); err != nil {
				return err
			}
		}
		var maximum int
		if err := r.db.Model(&model.ProjectUnit{}).Where("project_id = ?", rows.Project.ID).Select("COALESCE(MAX(position), -1)").Scan(&maximum).Error; err != nil {
			return err
		}
		plan.Unit.Position = maximum + 1
		if err := r.db.Create(plan.Unit).Error; err != nil {
			return err
		}
		for _, shot := range plan.Shots {
			if shot.ProjectID != rows.Project.ID || shot.UnitID != plan.Unit.ID {
				return ErrProjectTimelineConflict
			}
		}
		if err := insertProductionRows(r.db, plan.Shots); err != nil {
			return err
		}
		if err := insertProductionRows(r.db, plan.Revisions); err != nil {
			return err
		}
		if err := insertProductionRows(r.db, plan.References); err != nil {
			return err
		}
		if err := insertProductionRows(r.db, plan.Artifacts); err != nil {
			return err
		}
	}
	return r.db.Create(&plan.Record).Error
}
