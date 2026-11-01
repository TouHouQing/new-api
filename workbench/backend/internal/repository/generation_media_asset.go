package repository

import (
	"encoding/json"
	"errors"
	"slices"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"yingce/backend/internal/model"
)

// Generation output versions are immutable. A previously materialized asset
// may have user edits; adding its missing original version never replaces them.
func (r *Repository) CreateGenerationMediaAsset(asset *model.Asset, version *model.AssetVersion, representation *model.AssetRepresentation, sourceIDs []string) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "id"}}, DoNothing: true}).Create(asset).Error; err != nil {
			return err
		}
		var existing model.Asset
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&existing, "id = ?", asset.ID).Error; err != nil {
			return err
		}
		if existing.UserID != asset.UserID || existing.Kind != asset.Kind {
			return errors.New("generation asset owner or media type mismatch")
		}
		ids := append(append([]string{}, sourceIDs...), representation.ResourceID)
		slices.Sort(ids)
		ids = slices.Compact(ids)
		var resources []model.Resource
		if err := tx.Clauses(clause.Locking{Strength: "SHARE"}).Where("id IN ? AND user_id = ? AND status = ?", ids, asset.UserID, model.ResourceStatusReady).Order("id").Find(&resources).Error; err != nil {
			return err
		}
		if len(resources) != len(ids) {
			return errors.New("generation source or output resource is unavailable")
		}
		for _, resource := range resources {
			if resource.ID == representation.ResourceID && resource.Kind != asset.Kind {
				return errors.New("generation output media type mismatch")
			}
		}
		var saved model.AssetVersion
		err := tx.First(&saved, "id = ?", version.ID).Error
		if err == nil {
			if saved.AssetID != asset.ID || saved.DefinitionJSON != version.DefinitionJSON || saved.Prompt != version.Prompt {
				return errors.New("generation output version snapshot mismatch")
			}
		} else if errors.Is(err, gorm.ErrRecordNotFound) {
			var count int
			if err := tx.Model(&model.AssetVersion{}).Where("asset_id = ?", asset.ID).Select("COALESCE(MAX(version), 0)").Scan(&count).Error; err != nil {
				return err
			}
			version.Version = count + 1
			if err := tx.Create(version).Error; err != nil {
				return err
			}
		} else {
			return err
		}
		var previous model.AssetRepresentation
		err = tx.First(&previous, "id = ?", representation.ID).Error
		if err == nil {
			if previous.AssetVersionID != version.ID || previous.ResourceID != representation.ResourceID || previous.TaskID != representation.TaskID || previous.Role != representation.Role || previous.MediaType != representation.MediaType || previous.MetadataJSON != representation.MetadataJSON {
				return errors.New("generation output representation mismatch")
			}
		} else if errors.Is(err, gorm.ErrRecordNotFound) {
			if err := tx.Create(representation).Error; err != nil {
				return err
			}
		} else {
			return err
		}
		var savedMedia struct {
			Data struct {
				StorageKey string `json:"storageKey"`
			} `json:"data"`
		}
		_ = json.Unmarshal([]byte(existing.PayloadJSON), &savedMedia)
		if existing.PrimaryVersionID == "" && savedMedia.Data.StorageKey == "resource:"+representation.ResourceID {
			return tx.Model(&model.Asset{}).Where("id = ? AND user_id = ? AND primary_version_id = ?", asset.ID, asset.UserID, "").Update("primary_version_id", version.ID).Error
		}
		return nil
	})
}
