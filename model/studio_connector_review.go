package model

import (
	"strings"

	"gorm.io/gorm"
)

// Serialize imports for one project so simultaneous synchronizations cannot
// create duplicate external comments. The shared lock supports all DB dialects.
func SaveStudioImportedReviewComment(userID int, prefix string, comment *StudioReviewComment) (bool, error) {
	created := false
	err := DB.Transaction(func(tx *gorm.DB) error {
		var project StudioProject
		if err := lockForUpdate(tx).Where("id = ? AND owner_id = ?", comment.ProjectID, userID).First(&project).Error; err != nil {
			return err
		}
		var existing []StudioReviewComment
		if err := tx.Where("project_id = ? AND node_id = ? AND take_id = ?", comment.ProjectID, comment.NodeID, comment.TakeID).Find(&existing).Error; err != nil {
			return err
		}
		for _, value := range existing {
			if strings.HasPrefix(value.Message, prefix) {
				return nil
			}
		}
		if err := tx.Create(comment).Error; err != nil {
			return err
		}
		created = true
		return nil
	})
	return created, err
}
