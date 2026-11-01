package repository

import (
	"errors"
	"slices"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"yingce/backend/internal/model"
)

// CreateDerivedImageAsset is called inside native task completion registration.
// Both original and output resources stay locked until their version references
// commit; replay never overwrites an asset the user has since renamed or edited.
func (r *Repository) CreateDerivedImageAsset(asset *model.Asset, version *model.AssetVersion, representation *model.AssetRepresentation, sourceID string) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var existing model.Asset
		err := tx.First(&existing, "id = ?", asset.ID).Error
		if err == nil {
			if existing.UserID != asset.UserID {
				return errors.New("derived asset owner mismatch")
			}
			var saved model.AssetRepresentation
			if err := tx.First(&saved, "id = ? AND asset_version_id = ? AND resource_id = ? AND task_id = ?", representation.ID, version.ID, representation.ResourceID, representation.TaskID).Error; err != nil {
				return err
			}
			var savedVersion model.AssetVersion
			if err := tx.First(&savedVersion, "id = ? AND asset_id = ?", version.ID, asset.ID).Error; err != nil {
				return err
			}
			if savedVersion.DefinitionJSON != version.DefinitionJSON {
				return errors.New("derived image recipe mismatch")
			}
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		ids := []string{sourceID, representation.ResourceID}
		slices.Sort(ids)
		ids = slices.Compact(ids)
		var resources []model.Resource
		if err := tx.Clauses(clause.Locking{Strength: "SHARE"}).Where("id IN ? AND user_id = ? AND kind = ? AND status = ?", ids, asset.UserID, "image", model.ResourceStatusReady).Order("id").Find(&resources).Error; err != nil {
			return err
		}
		if len(resources) != len(ids) {
			return errors.New("derived image source or output is unavailable")
		}
		if err := tx.Create(asset).Error; err != nil {
			return err
		}
		if err := tx.Create(version).Error; err != nil {
			return err
		}
		return tx.Create(representation).Error
	})
}
