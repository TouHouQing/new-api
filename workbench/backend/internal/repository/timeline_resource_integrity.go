package repository

import (
	"errors"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"yingce/backend/internal/assets"
	"yingce/backend/internal/model"
)

var ErrTimelineResourceChanged = errors.New("timeline source resource is no longer available")

// Persisting a reference and removing its Resource must serialize on the same
// rows, even when the two requests are handled by different backend instances.
// The pure assets collector defines the durable locator contract; reusing it
// here enforces referential integrity without depending on application policy.
func lockTimelineResourceReferences(tx *gorm.DB, userID string, documents ...string) error {
	ids := map[string]struct{}{}
	for _, document := range documents {
		if err := assets.CollectOwnedDocumentReferences(document, ids); err != nil {
			return err
		}
	}
	required := assets.SortedIDs(ids)
	for start := 0; start < len(required); start += 256 {
		batch := required[start:min(start+256, len(required))]
		var found []model.Resource
		query := tx.Select("id").Where("id IN ? AND user_id = ? AND status = ?", batch, userID, model.ResourceStatusReady).Order("id")
		if tx.Dialector.Name() != "sqlite" {
			query = query.Clauses(clause.Locking{Strength: "UPDATE"})
		}
		if err := query.Find(&found).Error; err != nil {
			return err
		}
		if len(found) != len(batch) {
			return ErrTimelineResourceChanged
		}
	}
	return nil
}
