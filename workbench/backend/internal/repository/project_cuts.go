package repository

import (
	"encoding/json"
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"yingce/backend/internal/model"
)

// Fixed-render inputs are written by Go's compact JSON encoder. The fallback
// retains the first native render receipts that predate the operation tag;
// app also decodes and checks the root identity before exposing any row.
func (r *Repository) ProjectCutRenderTaskPage(userID, projectID, cutID string, before time.Time, cursor string, limit int) ([]model.Task, error) {
	quoted, _ := json.Marshal(cutID)
	query := r.db.Where("user_id = ? AND project_id = ? AND type = ?", userID, projectID, model.TaskTypeTimelineRender).
		Where("operation = ? OR ((operation = ? OR operation IS NULL) AND input_json LIKE ?)", "cut-render:"+cutID, "", `%"cutId":`+string(quoted)+`%`)
	if cursor != "" {
		query = query.Where("created_at < ? OR (created_at = ? AND id < ?)", before, before, cursor)
	}
	rows := []model.Task{}
	err := query.Order("created_at DESC").Order("id DESC").Limit(limit + 1).Find(&rows).Error
	return rows, err
}

func (r *Repository) ProjectCut(userID, projectID, id string) (*model.ProjectCut, error) {
	var row model.ProjectCut
	err := r.db.Where("user_id = ? AND project_id = ? AND id = ?", userID, projectID, id).First(&row).Error
	return &row, err
}
func (r *Repository) ProjectCutForRequest(userID, projectID, requestID string) (*model.ProjectCut, error) {
	var row model.ProjectCut
	err := r.db.Where("user_id = ? AND project_id = ? AND request_id = ?", userID, projectID, requestID).First(&row).Error
	return &row, err
}

func (r *Repository) FirstImportedProjectCut(userID, projectID string) (*model.ProjectCut, error) {
	var row model.ProjectCut
	err := r.db.Where("user_id = ? AND project_id = ? AND source_key LIKE ?", userID, projectID, "studio-native-v%").Order("created_at ASC").Order("id ASC").Take(&row).Error
	return &row, err
}
func (r *Repository) ProjectCutPage(userID, projectID string, archived, includeAutomatic bool, before time.Time, cursor string, limit int) ([]model.ProjectCut, error) {
	rows := []model.ProjectCut{}
	query := r.db.Where("user_id = ? AND project_id = ? AND archived = ?", userID, projectID, archived)
	if !includeAutomatic {
		query = query.Where("NOT (kind = ? AND (COALESCE(source_key, '') IN ? OR (COALESCE(source_key, '') = '' AND request_id LIKE ?)))", "snapshot", []string{"timeline-edit-v1", "timeline-edit-before-v1", "project-cut-before-v1", "working-export-v1", "legacy-review-before-v1"}, "before-apply:%")
	}
	if cursor != "" {
		query = query.Where("created_at < ? OR (created_at = ? AND id < ?)", before, before, cursor)
	}
	err := query.Order("created_at DESC").Order("id DESC").Limit(limit + 1).Find(&rows).Error
	return rows, err
}
func (r *Repository) ProjectCutApplyForRequest(userID, projectID, requestID string) (*model.ProjectCutApplyReceipt, error) {
	var row model.ProjectCutApplyReceipt
	err := r.db.Where("user_id = ? AND project_id = ? AND request_id = ?", userID, projectID, requestID).First(&row).Error
	return &row, err
}

// Serializes with native timeline writes. Extra native conversion rows commit
// in the same transaction as their immutable cut receipt.
func (r *Repository) CreateProjectCut(row *model.ProjectCut, expectedTimeline int64, expectedProject *int64, extra func(*Repository) error) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := lockProjectCutTimeline(tx, row.UserID, row.ProjectID, expectedTimeline, expectedProject); err != nil {
			return err
		}
		if row.OriginCutID != "" {
			var source model.ProjectCut
			if err := tx.Select("id").Where("id = ? AND user_id = ? AND project_id = ?", row.OriginCutID, row.UserID, row.ProjectID).Take(&source).Error; err != nil {
				return err
			}
		}
		if err := lockTimelineResourceReferences(tx, row.UserID, row.PayloadJSON); err != nil {
			return err
		}
		if err := tx.Create(row).Error; err != nil {
			return err
		}
		if extra != nil {
			return extra(New(tx))
		}
		return nil
	})
}
func lockProjectCutTimeline(tx *gorm.DB, userID, projectID string, expected int64, expectedProject *int64) error {
	var project model.Project
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ? AND id = ?", userID, projectID).First(&project).Error; err != nil {
		return err
	}
	if project.Status == model.ProjectStatusArchived || (expectedProject != nil && project.Revision != *expectedProject) {
		return ErrProjectTimelineConflict
	}
	var timeline model.ProjectTimeline
	err := tx.Where("user_id = ? AND project_id = ?", userID, projectID).First(&timeline).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		if expected == 0 {
			return nil
		}
		return ErrProjectTimelineConflict
	}
	if err != nil {
		return err
	}
	if timeline.Revision != expected {
		return ErrProjectTimelineConflict
	}
	return nil
}
func (r *Repository) ApplyProjectCut(cut *model.ProjectCut, expected int64, backup *model.ProjectCut, receipt *model.ProjectCutApplyReceipt) error {
	return r.applyProjectCut(cut, expected, backup, receipt, false)
}

func (r *Repository) ApplyTimelineEditCut(cut *model.ProjectCut, expected int64, backup *model.ProjectCut, receipt *model.ProjectCutApplyReceipt) error {
	return r.applyProjectCut(cut, expected, backup, receipt, true)
}

func (r *Repository) applyProjectCut(cut *model.ProjectCut, expected int64, backup *model.ProjectCut, receipt *model.ProjectCutApplyReceipt, createCandidate bool) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := lockProjectCutTimeline(tx, cut.UserID, cut.ProjectID, expected, nil); err != nil {
			return err
		}
		if err := lockTimelineResourceReferences(tx, cut.UserID, cut.PayloadJSON, backup.PayloadJSON); err != nil {
			return err
		}
		if createCandidate {
			if err := tx.Create(cut).Error; err != nil {
				return err
			}
		}
		var current model.ProjectCut
		if err := tx.Where("id = ? AND user_id = ? AND project_id = ? AND archived = ?", cut.ID, cut.UserID, cut.ProjectID, false).First(&current).Error; err != nil {
			return err
		}
		if current.TimelineSHA256 != cut.TimelineSHA256 {
			return ErrProjectTimelineConflict
		}
		if err := tx.Create(backup).Error; err != nil {
			return err
		}
		if _, err := New(tx).SaveProjectTimeline(cut.UserID, cut.ProjectID, cut.PayloadJSON, expected, cut.ID); err != nil {
			return err
		}
		return tx.Create(receipt).Error
	})
}
func (r *Repository) SetProjectCutArchived(userID, projectID, id string, expected, archived bool) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var project model.Project
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND user_id = ?", projectID, userID).First(&project).Error; err != nil {
			return err
		}
		if project.Status == model.ProjectStatusArchived {
			return ErrProjectTimelineConflict
		}
		result := tx.Model(&model.ProjectCut{}).Where("id = ? AND user_id = ? AND project_id = ? AND archived = ?", id, userID, projectID, expected).Update("archived", archived)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrProjectTimelineConflict
		}
		return nil
	})
}
