package repository

import (
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
)

var ErrShotPreferencesChanged = errors.New("shot preferences changed")
var ErrShotArtifactUnavailable = errors.New("shot artifact unavailable")

// A write on the stable shot serializes candidate changes with script updates
// on both PostgreSQL and SQLite, including registration of generation outputs.
func lockShotPreferencesTx(tx *gorm.DB, projectID, shotID string, now time.Time) error {
	if _, err := lockProjectMutationTx(tx, projectID); err != nil {
		return err
	}
	result := tx.Model(&model.Shot{}).Where("project_id = ? AND id = ?", projectID, shotID).UpdateColumn("updated_at", now)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (r *Repository) SaveShotVideoSource(projectID, shotID, source, expected string, now time.Time) (*model.Shot, error) {
	var shot model.Shot
	err := r.db.Transaction(func(tx *gorm.DB) error {
		if _, err := lockShotPlanProjectTx(tx, projectID); err != nil {
			return err
		}
		result := tx.Model(&model.Shot{}).Where("project_id = ? AND id = ? AND video_source = ? AND archived = ?", projectID, shotID, expected, false).Updates(map[string]any{"video_source": source, "updated_at": now})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrShotPreferencesChanged
		}
		if strings.HasPrefix(source, "frame:") {
			var count int64
			if err := tx.Model(&model.ShotArtifact{}).Where("project_id = ? AND shot_id = ? AND id = ? AND archived = ? AND status IN ? AND type IN ? AND resource_id <> ?", projectID, shotID, strings.TrimPrefix(source, "frame:"), false, []string{"ready", "stale"}, []string{"storyboard", "start_frame"}, "").Count(&count).Error; err != nil {
				return err
			}
			if count != 1 {
				return ErrShotArtifactUnavailable
			}
		}
		if source != expected {
			if err := tx.Model(&model.Project{}).Where("id = ?", projectID).Updates(map[string]any{"revision": gorm.Expr("revision + 1"), "updated_at": now}).Error; err != nil {
				return err
			}
		}
		return tx.Where("project_id = ? AND id = ?", projectID, shotID).First(&shot).Error
	})
	return &shot, err
}

func (r *Repository) ShotArtifactForShot(projectID, shotID, artifactID string) (*model.ShotArtifact, error) {
	var artifact model.ShotArtifact
	err := r.db.Where("project_id = ? AND shot_id = ? AND id = ?", projectID, shotID, artifactID).First(&artifact).Error
	return &artifact, err
}

func (r *Repository) ChangeShotArtifact(projectID, shotID, artifactID, action, expectedSelectedID string, now time.Time) (*model.ShotArtifact, error) {
	var artifact model.ShotArtifact
	err := r.db.Transaction(func(tx *gorm.DB) error {
		if err := lockShotPreferencesTx(tx, projectID, shotID, now); err != nil {
			return err
		}
		if _, err := (&Repository{db: tx}).ActiveShotForProject(projectID, shotID); err != nil {
			return err
		}
		if err := tx.Where("project_id = ? AND shot_id = ? AND id = ?", projectID, shotID, artifactID).First(&artifact).Error; err != nil {
			return err
		}
		var selected []model.ShotArtifact
		if err := tx.Where("shot_id = ? AND type = ? AND selected = ?", shotID, artifact.Type, true).Find(&selected).Error; err != nil {
			return err
		}
		actual := ""
		if len(selected) > 1 {
			return ErrShotPreferencesChanged
		}
		if len(selected) == 1 {
			actual = selected[0].ID
		}
		if actual != expectedSelectedID {
			return ErrShotPreferencesChanged
		}
		updates := map[string]any{"updated_at": now}
		switch action {
		case "select":
			if artifact.Archived || artifact.ResourceID == "" || (artifact.Status != "ready" && artifact.Status != "stale") {
				return ErrShotArtifactUnavailable
			}
			if actual == artifact.ID {
				return nil
			}
			if err := tx.Model(&model.ShotArtifact{}).Where("shot_id = ? AND type = ?", shotID, artifact.Type).Updates(map[string]any{"selected": false, "updated_at": now}).Error; err != nil {
				return err
			}
			updates["selected"] = true
			if artifact.Status == "stale" {
				if err := invalidateUnitWorkflowTx(tx, projectID, artifact.UnitID, "storyboard", now); err != nil {
					return err
				}
			}
		case "archive":
			if artifact.Selected {
				return ErrShotArtifactUnavailable
			}
			var shot model.Shot
			if err := tx.First(&shot, "id = ?", shotID).Error; err != nil {
				return err
			}
			if shot.VideoSource == "frame:"+artifact.ID {
				return ErrShotArtifactUnavailable
			}
			updates["archived"] = true
		case "restore":
			updates["archived"] = false
		default:
			return ErrShotArtifactUnavailable
		}
		if err := tx.Model(&model.ShotArtifact{}).Where("id = ?", artifact.ID).Updates(updates).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.Project{}).Where("id = ?", projectID).Updates(map[string]any{"revision": gorm.Expr("revision + 1"), "updated_at": now}).Error; err != nil {
			return err
		}
		return tx.First(&artifact, "id = ?", artifact.ID).Error
	})
	return &artifact, err
}
