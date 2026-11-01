package repository

import (
	"encoding/json"
	"errors"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"yingce/backend/internal/model"
)

var ErrMediaAnalysisRevisionChanged = errors.New("media analysis revision changed")
var ErrMediaAnalysisMutationConflict = errors.New("media analysis mutation intent changed")

// The caller holds this transaction through native task quota admission.
func (r *Repository) LockMediaAnalysisAdmission(userID, projectID string, source model.Resource) error {
	if err := lockTranscriptProject(r.db, userID, projectID); err != nil {
		return err
	}
	var current model.Resource
	return r.db.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND user_id = ? AND status = ? AND size = ? AND e_tag = ?", source.ID, userID, model.ResourceStatusReady, source.Size, source.ETag).Take(&current).Error
}

func (r *Repository) ProjectMediaAnalysis(userID, projectID, id string) (*model.ProjectMediaAnalysis, error) {
	var row model.ProjectMediaAnalysis
	err := r.db.Where("id = ? AND user_id = ? AND project_id = ?", id, userID, projectID).Take(&row).Error
	return &row, err
}

func (r *Repository) ProjectMediaAnalysisRevision(userID, analysisID, id string) (*model.ProjectMediaAnalysisRevision, error) {
	var row model.ProjectMediaAnalysisRevision
	err := r.db.Where("id = ? AND analysis_id = ? AND user_id = ?", id, analysisID, userID).Take(&row).Error
	return &row, err
}

func (r *Repository) ProjectMediaAnalysisRevisionForRequest(userID, analysisID, requestID string) (*model.ProjectMediaAnalysisRevision, error) {
	var row model.ProjectMediaAnalysisRevision
	err := r.db.Where("user_id = ? AND analysis_id = ? AND request_id = ?", userID, analysisID, requestID).Take(&row).Error
	return &row, err
}

func (r *Repository) ProjectMediaAnalyses(userID, projectID, resourceID, kind, before string, archived bool, limit int) ([]model.ProjectMediaAnalysis, error) {
	rows := []model.ProjectMediaAnalysis{}
	query := r.db.Where("user_id = ? AND project_id = ? AND archived = ? AND source_kind <> ?", userID, projectID, archived, "reference_checkpoint")
	if resourceID != "" {
		query = query.Where("resource_id = ?", resourceID)
	}
	if kind != "" {
		query = query.Where("kind = ?", kind)
	}
	if before != "" {
		var cursor model.ProjectMediaAnalysis
		if err := r.db.Where("id = ? AND user_id = ? AND project_id = ? AND archived = ? AND source_kind <> ?", before, userID, projectID, archived, "reference_checkpoint").Take(&cursor).Error; err != nil {
			return rows, err
		}
		if (resourceID != "" && cursor.ResourceID != resourceID) || (kind != "" && cursor.Kind != kind) {
			return rows, gorm.ErrRecordNotFound
		}
		query = query.Where("created_at < ? OR (created_at = ? AND id < ?)", cursor.CreatedAt, cursor.CreatedAt, cursor.ID)
	}
	err := query.Order("created_at DESC, id DESC").Limit(limit).Find(&rows).Error
	return rows, err
}

// Checkpoints are real immutable interval analyses. Admission and progress are
// fenced by the task lease so a late cancelled worker cannot register them.
func (r *Repository) SaveReferenceAnalysisCheckpoint(task *model.Task, row *model.ProjectMediaAnalysis, revision *model.ProjectMediaAnalysisRevision, stage string, progress int) error {
	if row.SourceKind != "reference_checkpoint" || row.SourceTaskID != task.ID || row.UserID != task.UserID || row.ProjectID != task.ProjectID || !row.Archived {
		return ErrMediaAnalysisMutationConflict
	}
	return r.db.Transaction(func(tx *gorm.DB) error {
		result := taskLeaseWriter(tx.Model(&model.Task{}), task.LeaseOwner).Where("id = ? AND user_id = ? AND status = ? AND route_run = ?", task.ID, task.UserID, model.TaskStatusRunning, task.RouteRun).Updates(map[string]any{"stage": stage, "progress": progress, "updated_at": row.CreatedAt})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrTaskStateConflict
		}
		_, err := New(tx).CreateProjectMediaAnalysis(row, revision)
		return err
	})
}

func (r *Repository) ProjectMediaAnalysisHistory(userID, analysisID string, beforeVersion int64, limit int) ([]model.ProjectMediaAnalysisRevision, error) {
	rows := []model.ProjectMediaAnalysisRevision{}
	query := r.db.Where("user_id = ? AND analysis_id = ?", userID, analysisID)
	if beforeVersion > 0 {
		query = query.Where("version < ?", beforeVersion)
	}
	err := query.Order("version DESC").Limit(limit).Find(&rows).Error
	return rows, err
}

func (r *Repository) CreateProjectMediaAnalysis(row *model.ProjectMediaAnalysis, revision *model.ProjectMediaAnalysisRevision) (bool, error) {
	return r.createProjectMediaAnalysis(row, revision, nil)
}

func (r *Repository) CreateProjectManualFraming(row *model.ProjectMediaAnalysis, revision *model.ProjectMediaAnalysisRevision, expectedTimelineRevision int64) (bool, error) {
	if row.SourceKind != "manual_framing" || expectedTimelineRevision < 1 {
		return false, ErrMediaAnalysisMutationConflict
	}
	return r.createProjectMediaAnalysis(row, revision, &expectedTimelineRevision)
}

func (r *Repository) createProjectMediaAnalysis(row *model.ProjectMediaAnalysis, revision *model.ProjectMediaAnalysisRevision, expectedTimelineRevision *int64) (bool, error) {
	if revision == nil || row.ID == "" || row.UserID == "" || revision.AnalysisID != row.ID || revision.UserID != row.UserID || row.CurrentRevisionID != revision.ID || revision.RequestID == "" || revision.Version != 1 || row.Revision != 1 {
		return false, ErrMediaAnalysisMutationConflict
	}
	created := false
	err := r.db.Transaction(func(tx *gorm.DB) error {
		if err := lockTranscriptProject(tx, row.UserID, row.ProjectID); err != nil {
			return err
		}
		if expectedTimelineRevision != nil {
			var timeline model.ProjectTimeline
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ? AND project_id = ? AND revision = ?", row.UserID, row.ProjectID, *expectedTimelineRevision).Take(&timeline).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return ErrProjectTimelineConflict
				}
				return err
			}
		}
		var source model.Resource
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND user_id = ? AND status = ?", row.ResourceID, row.UserID, model.ResourceStatusReady).Take(&source).Error; err != nil {
			return err
		}
		var fixed struct {
			ResourceID string `json:"resourceId"`
			ETag       string `json:"etag"`
			Bytes      int64  `json:"bytes"`
		}
		if json.Unmarshal([]byte(row.SourceJSON), &fixed) != nil || fixed.ResourceID != source.ID || fixed.ETag != source.ETag || fixed.Bytes != source.Size {
			return ErrMediaAnalysisMutationConflict
		}
		result := tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "project_id"}, {Name: "source_kind"}, {Name: "source_key"}}, DoNothing: true}).Create(row)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			var existing model.ProjectMediaAnalysis
			if err := tx.Where("project_id = ? AND source_kind = ? AND source_key = ? AND user_id = ?", row.ProjectID, row.SourceKind, row.SourceKey, row.UserID).Take(&existing).Error; err != nil {
				return err
			}
			if existing.ID != row.ID || existing.ResourceID != row.ResourceID || existing.SourceJSON != row.SourceJSON || existing.EvidenceJSON != row.EvidenceJSON {
				return ErrMediaAnalysisMutationConflict
			}
			return nil
		}
		if err := tx.Create(revision).Error; err != nil {
			return err
		}
		created = true
		return tx.Model(&model.Project{}).Where("id = ?", row.ProjectID).Updates(map[string]any{"revision": gorm.Expr("revision + 1"), "updated_at": row.UpdatedAt}).Error
	})
	return created, err
}

func (r *Repository) SaveProjectMediaAnalysis(row *model.ProjectMediaAnalysis, expected int64, revision *model.ProjectMediaAnalysisRevision) (bool, error) {
	if revision == nil || revision.AnalysisID != row.ID || revision.UserID != row.UserID || revision.RequestID == "" || revision.RequestSHA256 == "" {
		return false, ErrMediaAnalysisMutationConflict
	}
	replayed := false
	err := r.db.Transaction(func(tx *gorm.DB) error {
		if err := lockTranscriptProject(tx, row.UserID, row.ProjectID); err != nil {
			return err
		}
		var previous model.ProjectMediaAnalysisRevision
		lookup := tx.Where("analysis_id = ? AND user_id = ? AND request_id = ?", row.ID, row.UserID, revision.RequestID).Take(&previous).Error
		if lookup == nil {
			if previous.RequestSHA256 != revision.RequestSHA256 {
				return ErrMediaAnalysisMutationConflict
			}
			*revision = previous
			replayed = true
			return nil
		}
		if !errors.Is(lookup, gorm.ErrRecordNotFound) {
			return lookup
		}
		changes := map[string]any{"revision": expected + 1, "title": row.Title, "archived": row.Archived, "updated_at": row.UpdatedAt}
		if revision != nil {
			changes["current_revision_id"] = revision.ID
		}
		result := tx.Model(&model.ProjectMediaAnalysis{}).Where("id = ? AND project_id = ? AND user_id = ? AND revision = ?", row.ID, row.ProjectID, row.UserID, expected).Updates(changes)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrMediaAnalysisRevisionChanged
		}
		if revision != nil {
			var latest int64
			if err := tx.Model(&model.ProjectMediaAnalysisRevision{}).Where("analysis_id = ?", row.ID).Select("COALESCE(MAX(version),0)").Scan(&latest).Error; err != nil {
				return err
			}
			revision.Version = latest + 1
			if err := tx.Create(revision).Error; err != nil {
				return err
			}
			row.CurrentRevisionID = revision.ID
		}
		row.Revision = expected + 1
		return tx.Model(&model.Project{}).Where("id = ?", row.ProjectID).Updates(map[string]any{"revision": gorm.Expr("revision + 1"), "updated_at": row.UpdatedAt}).Error
	})
	return replayed, err
}
