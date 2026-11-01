package repository

import (
	"gorm.io/gorm"
	"time"
	"yingce/backend/internal/model"
)

// Attach the creator's current canvas exactly once. A concurrent user relink
// cannot redirect or be overwritten by an Agent finishing project creation.
func (r *Repository) AssignCanvasToProjectIfUnbound(userID, canvasID, projectID string) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var project model.Project
		if err := tx.Where("id = ? AND user_id = ? AND status = ?", projectID, userID, model.ProjectStatusActive).First(&project).Error; err != nil {
			return err
		}
		result := tx.Model(&model.CanvasProject{}).Where("id = ? AND user_id = ? AND (project_id = '' OR project_id IS NULL)", canvasID, userID).Updates(map[string]any{"project_id": projectID, "revision": gorm.Expr("revision + 1"), "updated_at": time.Now()})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 1 {
			return tx.Model(&model.Project{}).Where("id = ?", projectID).Updates(map[string]any{"revision": gorm.Expr("revision + 1"), "updated_at": time.Now()}).Error
		}
		var current model.CanvasProject
		if err := tx.Where("id = ? AND user_id = ?", canvasID, userID).First(&current).Error; err != nil {
			return err
		}
		if current.ProjectID == projectID {
			return nil
		}
		return ErrCreationConflict
	})
}
