package repository

import (
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"yingce/backend/internal/model"
)

var ErrTranscriptRevisionChanged = errors.New("transcript revision changed")

func lockTranscriptProject(tx *gorm.DB, userID, projectID string) error {
	var project model.Project
	return tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND user_id = ? AND status = ?", projectID, userID, model.ProjectStatusActive).Take(&project).Error
}

func (r *Repository) ProjectTranscript(userID, projectID, id string) (*model.ProjectTranscript, error) {
	var transcript model.ProjectTranscript
	err := r.db.Where("id = ? AND user_id = ? AND project_id = ?", id, userID, projectID).Take(&transcript).Error
	return &transcript, err
}

func (r *Repository) ProjectTranscriptForTask(userID, projectID, taskID string) (*model.ProjectTranscript, error) {
	var transcript model.ProjectTranscript
	err := r.db.Where("user_id = ? AND project_id = ? AND source_kind = ? AND source_task_id = ?", userID, projectID, "recognition", taskID).Take(&transcript).Error
	return &transcript, err
}

func (r *Repository) ProjectTranscriptPage(userID, projectID, resourceID string, archived bool, beforeTime time.Time, beforeID string, limit int) ([]model.ProjectTranscript, error) {
	if limit < 1 || limit > 100 {
		limit = 30
	}
	query := r.db.Where("user_id = ? AND project_id = ? AND archived = ?", userID, projectID, archived)
	if resourceID != "" {
		query = query.Where("resource_id = ?", resourceID)
	}
	if beforeID != "" {
		query = query.Where("created_at < ? OR (created_at = ? AND id < ?)", beforeTime, beforeTime, beforeID)
	}
	var result []model.ProjectTranscript
	err := query.Order("created_at desc, id desc").Limit(limit + 1).Find(&result).Error
	return result, err
}

func (r *Repository) ProjectTranscriptRevision(userID, transcriptID, revisionID string) (*model.ProjectTranscriptRevision, error) {
	var revision model.ProjectTranscriptRevision
	err := r.db.Where("id = ? AND transcript_id = ? AND user_id = ?", revisionID, transcriptID, userID).Take(&revision).Error
	return &revision, err
}

func (r *Repository) ProjectTranscriptHistory(userID, transcriptID string, beforeVersion int64, limit int) ([]model.ProjectTranscriptRevision, error) {
	if limit < 1 || limit > 100 {
		limit = 30
	}
	query := r.db.Select("id", "transcript_id", "user_id", "author_id", "version", "note", "created_at").Where("user_id = ? AND transcript_id = ?", userID, transcriptID)
	if beforeVersion > 0 {
		query = query.Where("version < ?", beforeVersion)
	}
	var revisions []model.ProjectTranscriptRevision
	err := query.Order("version desc").Limit(limit + 1).Find(&revisions).Error
	return revisions, err
}

// Create only writes the recognition version once. Repeated requests preserve
// any later corrections made to the same source task.
func (r *Repository) CreateProjectTranscript(transcript *model.ProjectTranscript, revision *model.ProjectTranscriptRevision) (bool, error) {
	created := false
	err := r.db.Transaction(func(tx *gorm.DB) error {
		if err := lockTranscriptProject(tx, transcript.UserID, transcript.ProjectID); err != nil {
			return err
		}
		result := tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "project_id"}, {Name: "source_kind"}, {Name: "source_key"}}, DoNothing: true}).Create(transcript)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return nil
		}
		if err := tx.Create(revision).Error; err != nil {
			return err
		}
		created = true
		return tx.Model(&model.Project{}).Where("id = ?", transcript.ProjectID).Updates(map[string]any{"revision": gorm.Expr("revision + 1"), "updated_at": transcript.UpdatedAt}).Error
	})
	return created, err
}

// A new text revision and the parent CAS commit together. Preferences can
// increment the parent token without creating redundant document snapshots.
func (r *Repository) SaveProjectTranscript(transcript *model.ProjectTranscript, expected int64, revision *model.ProjectTranscriptRevision) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := lockTranscriptProject(tx, transcript.UserID, transcript.ProjectID); err != nil {
			return err
		}
		changes := map[string]any{"revision": expected + 1, "archived": transcript.Archived, "title": transcript.Title, "updated_at": transcript.UpdatedAt}
		if revision != nil {
			changes["current_revision_id"] = revision.ID
		}
		result := tx.Model(&model.ProjectTranscript{}).Where("id = ? AND user_id = ? AND project_id = ? AND revision = ?", transcript.ID, transcript.UserID, transcript.ProjectID, expected).Updates(changes)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrTranscriptRevisionChanged
		}
		if revision != nil {
			var current int64
			if err := tx.Model(&model.ProjectTranscriptRevision{}).Where("transcript_id = ?", transcript.ID).Select("COALESCE(MAX(version),0)").Scan(&current).Error; err != nil {
				return err
			}
			revision.Version = current + 1
			if err := tx.Create(revision).Error; err != nil {
				return err
			}
			transcript.CurrentRevisionID = revision.ID
		}
		transcript.Revision = expected + 1
		return tx.Model(&model.Project{}).Where("id = ?", transcript.ProjectID).Updates(map[string]any{"revision": gorm.Expr("revision + 1"), "updated_at": transcript.UpdatedAt}).Error
	})
}
