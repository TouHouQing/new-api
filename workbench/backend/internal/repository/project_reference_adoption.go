package repository

import (
	"gorm.io/gorm/clause"
	"yingce/backend/internal/model"
)

func (r *Repository) ProjectReferenceAdoption(userID, projectID, id string) (*model.ProjectReferenceAdoption, error) {
	var receipt model.ProjectReferenceAdoption
	err := r.db.Where("id = ? AND user_id = ? AND project_id = ?", id, userID, projectID).Take(&receipt).Error
	return &receipt, err
}

func (r *Repository) LockReferenceAdoptionProject(userID, projectID string, expected int64) (*model.Project, error) {
	var project model.Project
	if err := r.db.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND user_id = ? AND status = ?", projectID, userID, model.ProjectStatusActive).Take(&project).Error; err != nil {
		return nil, err
	}
	if project.Revision != expected {
		return nil, ErrProjectTimelineConflict
	}
	return &project, nil
}

func (r *Repository) CreateReferenceAdoptionReceipt(receipt *model.ProjectReferenceAdoption) error {
	return r.db.Create(receipt).Error
}
