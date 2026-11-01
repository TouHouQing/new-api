package repository

import (
	"gorm.io/gorm/clause"
	"yingce/backend/internal/model"
)

func (r *Repository) TryCreateProjectCreationReceipt(receipt *model.ProjectCreationReceipt) (bool, error) {
	result := r.db.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "id"}}, DoNothing: true}).Create(receipt)
	return result.RowsAffected == 1, result.Error
}

func (r *Repository) ProjectCreationReceiptForUser(userID, id string) (*model.ProjectCreationReceipt, error) {
	var receipt model.ProjectCreationReceipt
	if err := r.db.Where("user_id = ? AND id = ?", userID, id).First(&receipt).Error; err != nil {
		return nil, err
	}
	return &receipt, nil
}
