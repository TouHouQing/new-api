package repository

import (
	"errors"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"yingce/backend/internal/model"
)

// The caller owns the canvas transaction. Lock the original until its first
// durable asset reference commits, serializing registration with deletion.
func (r *Repository) CreateUploadedResourceAsset(asset *model.Asset, version *model.AssetVersion, representation *model.AssetRepresentation) error {
	var resource model.Resource
	if err := r.db.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND user_id = ? AND kind = ? AND status = ?", representation.ResourceID, asset.UserID, asset.Kind, model.ResourceStatusReady).First(&resource).Error; err != nil {
		return err
	}
	var existing model.Asset
	if err := r.db.First(&existing, "id = ? AND user_id = ?", asset.ID, asset.UserID).Error; err == nil {
		var saved model.AssetVersion
		var reference model.AssetRepresentation
		if err := r.db.First(&saved, "id = ? AND asset_id = ?", version.ID, asset.ID).Error; err != nil {
			return err
		}
		if err := r.db.First(&reference, "id = ? AND asset_version_id = ? AND resource_id = ?", representation.ID, version.ID, resource.ID).Error; err != nil {
			return err
		}
		if saved.DefinitionJSON != version.DefinitionJSON {
			return errors.New("original resource asset definition changed")
		}
		*asset = existing
		return nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	if err := r.db.Create(asset).Error; err != nil {
		return err
	}
	if err := r.db.Create(version).Error; err != nil {
		return err
	}
	return r.db.Create(representation).Error
}
