package repository

import (
	"errors"
	"time"

	"yingce/backend/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var ErrProjectTimelineConflict = errors.New("project timeline revision conflict")

func (r *Repository) ProjectTimeline(userID, projectID string) (*model.ProjectTimeline, error) {
	var timeline model.ProjectTimeline
	if err := r.db.Where("user_id = ? AND project_id = ?", userID, projectID).First(&timeline).Error; err != nil {
		return nil, err
	}
	return &timeline, nil
}

func (r *Repository) SaveProjectTimeline(userID, projectID, payload string, expected int64, originCutID ...string) (*model.ProjectTimeline, error) {
	var timeline model.ProjectTimeline
	err := r.db.Transaction(func(tx *gorm.DB) error {
		var project model.Project
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND user_id = ?", projectID, userID).First(&project).Error; err != nil {
			return err
		}
		if project.Status == model.ProjectStatusArchived {
			return ErrProjectTimelineConflict
		}
		if err := lockTimelineResourceReferences(tx, userID, payload); err != nil {
			return err
		}
		if len(originCutID) > 0 && originCutID[0] != "" {
			var source model.ProjectCut
			if err := tx.Select("id").Where("id = ? AND user_id = ? AND project_id = ?", originCutID[0], userID, projectID).Take(&source).Error; err != nil {
				return err
			}
		}
		now := time.Now()
		if expected == 0 {
			timeline = model.ProjectTimeline{ProjectID: projectID, UserID: userID, Revision: 1, PayloadJSON: payload, CreatedAt: now, UpdatedAt: now}
			if len(originCutID) > 0 {
				timeline.OriginCutID = originCutID[0]
			}
			result := tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "project_id"}}, DoNothing: true}).Create(&timeline)
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return ErrProjectTimelineConflict
			}
			return nil
		}
		updates := map[string]any{"payload_json": payload, "revision": expected + 1, "updated_at": now}
		if len(originCutID) > 0 {
			updates["origin_cut_id"] = originCutID[0]
		}
		result := tx.Model(&model.ProjectTimeline{}).Where("user_id = ? AND project_id = ? AND revision = ?", userID, projectID, expected).Updates(updates)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrProjectTimelineConflict
		}
		return tx.Where("user_id = ? AND project_id = ?", userID, projectID).First(&timeline).Error
	})
	return &timeline, err
}
