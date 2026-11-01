package repository

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"slices"
	"sort"
	"time"
	"yingce/backend/internal/model"
)

var ErrShotPlanChanged = errors.New("shot plan changed")
var ErrShotPlanIntentChanged = errors.New("shot plan request does not match original intent")

func shotPlanHash(value string) string {
	digest := sha256.Sum256([]byte(value))
	return hex.EncodeToString(digest[:])
}

type ShotPlanMutation struct {
	ExpectedRevisionID string
	RequestID          string
	RequestSHA256      string
	ExpectedSHA256     string
	Result             *model.ShotPlanWriteResult
	CheckQuota         func(*Repository, int64) error
}

func (r *Repository) CurrentShotPlan(userID, projectID, unitID string) (model.ShotPlanSnapshot, string, error) {
	var snapshot model.ShotPlanSnapshot
	project, err := r.ProjectForUser(userID, projectID)
	if err != nil {
		return snapshot, "", err
	}
	unit, err := r.ProjectUnit(projectID, unitID)
	if err != nil {
		return snapshot, "", err
	}
	snapshot = model.ShotPlanSnapshot{Version: 1, ProjectID: projectID, UnitID: unitID, SourceTextAtArchive: unit.SourceText, ProjectBriefJSON: project.CreativeBriefJSON, ProjectDescription: project.Description, Entries: []model.ShotPlanEntry{}, References: []model.ShotAssetReference{}, Selections: []model.ShotPlanSelection{}}
	var shots []model.Shot
	if err := r.db.Where("project_id = ? AND unit_id = ? AND archived = ?", projectID, unitID, false).Order("position asc, id asc").Find(&shots).Error; err != nil {
		return snapshot, "", err
	}
	ids := []string{}
	for _, shot := range shots {
		ids = append(ids, shot.ID)
		snapshot.Entries = append(snapshot.Entries, model.ShotPlanEntry{ShotID: shot.ID, RevisionID: shot.CurrentRevisionID, Title: shot.Title, Position: shot.Position, DurationMs: shot.DurationMs, Status: shot.Status, VideoSource: shot.VideoSource})
	}
	if len(ids) > 0 {
		if err := r.db.Where("shot_id IN ?", ids).Order("shot_id asc, role asc, asset_version_id asc, id asc").Find(&snapshot.References).Error; err != nil {
			return snapshot, "", err
		}
		for index := range snapshot.References {
			snapshot.References[index].CreatedAt = snapshot.References[index].CreatedAt.UTC()
		}
		var selected []model.ShotArtifact
		if err := r.db.Where("shot_id IN ? AND selected = ? AND archived = ?", ids, true, false).Order("shot_id asc, type asc, id asc").Find(&selected).Error; err != nil {
			return snapshot, "", err
		}
		for _, artifact := range selected {
			snapshot.Selections = append(snapshot.Selections, model.ShotPlanSelection{ShotID: artifact.ShotID, ArtifactID: artifact.ID, ResourceID: artifact.ResourceID, RevisionID: artifact.RevisionID, Status: artifact.Status})
		}
	}
	raw, err := json.Marshal(snapshot)
	if err != nil {
		return snapshot, "", err
	}
	if len(raw) > 4<<20 {
		return snapshot, "", errors.New("分镜方案超过4MiB，请先拆分章节；原方案保持可用")
	}
	return snapshot, shotPlanHash(string(raw)), nil
}

func archiveShotPlanTx(tx *gorm.DB, userID, projectID, unitID, title string, mutation ShotPlanMutation) (*model.ProjectShotPlanRecord, error) {
	repo := &Repository{db: tx}
	snapshot, digest, err := repo.CurrentShotPlan(userID, projectID, unitID)
	if err != nil {
		return nil, err
	}
	if mutation.ExpectedSHA256 != "" && mutation.ExpectedSHA256 != digest {
		return nil, ErrShotPlanChanged
	}
	if len(snapshot.Entries) == 0 {
		return nil, nil
	}
	id := shotPlanHash("shot-plan-v1\x00" + userID + "\x00" + projectID + "\x00" + unitID + "\x00" + digest)[:32]
	var existing model.ProjectShotPlanRecord
	err = tx.First(&existing, "id = ? AND user_id = ? AND project_id = ?", id, userID, projectID).Error
	if err == nil {
		return &existing, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	raw, err := json.Marshal(snapshot)
	if err != nil {
		return nil, err
	}
	if mutation.CheckQuota != nil {
		if err := mutation.CheckQuota(repo, int64(len(raw)+len(title)+128)); err != nil {
			return nil, err
		}
	}
	record := model.ProjectShotPlanRecord{ID: id, UserID: userID, ProjectID: projectID, UnitID: unitID, Kind: "archive", Title: title, PayloadJSON: string(raw), PayloadSHA256: digest, ShotCount: len(snapshot.Entries), CreatedAt: time.Now()}
	if err := tx.Create(&record).Error; err != nil {
		return nil, err
	}
	return &record, nil
}

func shotPlanReplayTx(tx *gorm.DB, project *model.Project, unitID, kind string, mutation ShotPlanMutation) (*model.ProjectShotPlanRecord, error) {
	if mutation.RequestID == "" {
		return nil, nil
	}
	id := shotPlanHash("shot-plan-mutation-v1\x00" + project.UserID + "\x00" + project.ID + "\x00" + unitID + "\x00" + mutation.RequestID)[:32]
	var record model.ProjectShotPlanRecord
	err := tx.First(&record, "id = ? AND user_id = ?", id, project.UserID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if record.Kind != kind || record.RequestSHA256 != mutation.RequestSHA256 {
		return nil, ErrShotPlanIntentChanged
	}
	var result model.ShotPlanWriteResult
	if json.Unmarshal([]byte(record.PayloadJSON), &result) != nil {
		return nil, errors.New("原分镜操作回执无法读取")
	}
	result.Replayed = true
	if mutation.Result != nil {
		*mutation.Result = result
	}
	return &record, nil
}

func (r *Repository) ReplayShotPlanMutation(userID, projectID, unitID, kind, requestID, requestSHA string) (*model.ShotPlanWriteResult, error) {
	project, err := r.ProjectForUser(userID, projectID)
	if err != nil {
		return nil, err
	}
	result := model.ShotPlanWriteResult{}
	prior, err := shotPlanReplayTx(r.db, project, unitID, kind, ShotPlanMutation{RequestID: requestID, RequestSHA256: requestSHA, Result: &result})
	if err != nil || prior == nil {
		return nil, err
	}
	return &result, nil
}
func saveShotPlanMutationTx(tx *gorm.DB, project *model.Project, unitID, kind string, mutation ShotPlanMutation, result model.ShotPlanWriteResult) error {
	if mutation.Result != nil {
		*mutation.Result = result
	}
	if mutation.RequestID == "" {
		return nil
	}
	raw, err := json.Marshal(result)
	if err != nil {
		return err
	}
	if mutation.CheckQuota != nil {
		if err := mutation.CheckQuota(&Repository{db: tx}, int64(len(raw)+len(mutation.RequestID)+128)); err != nil {
			return err
		}
	}
	record := model.ProjectShotPlanRecord{ID: shotPlanHash("shot-plan-mutation-v1\x00" + project.UserID + "\x00" + project.ID + "\x00" + unitID + "\x00" + mutation.RequestID)[:32], UserID: project.UserID, ProjectID: project.ID, UnitID: unitID, Kind: kind, RequestID: mutation.RequestID, RequestSHA256: mutation.RequestSHA256, PayloadJSON: string(raw), PayloadSHA256: shotPlanHash(string(raw)), ShotCount: len(result.Shots), CreatedAt: time.Now()}
	return tx.Create(&record).Error
}

func lockShotPlanProjectTx(tx *gorm.DB, projectID string) (*model.Project, error) {
	project, err := lockProjectMutationTx(tx, projectID)
	if err != nil {
		return nil, err
	}
	if project.Status != model.ProjectStatusActive {
		return nil, ErrShotPlanChanged
	}
	return project, nil
}

func lockProjectMutationTx(tx *gorm.DB, projectID string) (*model.Project, error) {
	var project model.Project
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&project, "id = ?", projectID).Error; err != nil {
		return nil, err
	}
	return &project, nil
}

func (r *Repository) ShotPlanRecords(userID, projectID, unitID string, page, pageSize int) ([]model.ProjectShotPlanRecord, int64, error) {
	rows := []model.ProjectShotPlanRecord{}
	query := r.db.Model(&model.ProjectShotPlanRecord{}).Where("user_id = ? AND project_id = ? AND unit_id = ? AND kind = ?", userID, projectID, unitID, "archive")
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := query.Omit("payload_json").Order("created_at desc, id desc").Offset((page - 1) * pageSize).Limit(pageSize).Find(&rows).Error
	return rows, total, err
}
func (r *Repository) ShotPlanRecord(userID, projectID, id string) (*model.ProjectShotPlanRecord, error) {
	var row model.ProjectShotPlanRecord
	if err := r.db.First(&row, "id = ? AND user_id = ? AND project_id = ? AND kind = ?", id, userID, projectID, "archive").Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *Repository) RestoreShotPlan(userID, projectID, recordID, sourceSHA string, expectedIDs []string, mutation ShotPlanMutation) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		project, err := lockShotPlanProjectTx(tx, projectID)
		if err != nil {
			return err
		}
		if project.UserID != userID {
			return gorm.ErrRecordNotFound
		}
		if prior, err := shotPlanReplayTx(tx, project, "", "restore", mutation); err != nil || prior != nil {
			return err
		}
		repo := &Repository{db: tx}
		record, err := repo.ShotPlanRecord(userID, projectID, recordID)
		if err != nil {
			return err
		}
		if record.PayloadSHA256 != sourceSHA || shotPlanHash(record.PayloadJSON) != sourceSHA {
			return ErrShotPlanChanged
		}
		var snapshot model.ShotPlanSnapshot
		if json.Unmarshal([]byte(record.PayloadJSON), &snapshot) != nil || snapshot.Version != 1 || snapshot.ProjectID != projectID || snapshot.UnitID != record.UnitID {
			return errors.New("原分镜方案固定来源无法读取")
		}
		var activeIDs []string
		if err := tx.Model(&model.Shot{}).Where("project_id = ? AND unit_id = ? AND archived = ?", projectID, record.UnitID, false).Order("id asc").Pluck("id", &activeIDs).Error; err != nil {
			return err
		}
		expected := append([]string{}, expectedIDs...)
		sort.Strings(expected)
		if !slices.Equal(activeIDs, expected) {
			return ErrShotPlanChanged
		}
		backup, err := archiveShotPlanTx(tx, userID, projectID, record.UnitID, "恢复历史方案前", mutation)
		if err != nil {
			return err
		}
		if err := tx.Model(&model.Shot{}).Where("project_id = ? AND unit_id = ? AND archived = ?", projectID, record.UnitID, false).Update("archived", true).Error; err != nil {
			return err
		}
		now := time.Now()
		shots := []model.Shot{}
		wanted := map[string]bool{}
		for _, entry := range snapshot.Entries {
			if wanted[entry.ShotID] {
				return errors.New("原方案镜头编号重复")
			}
			wanted[entry.ShotID] = true
			var shot model.Shot
			if err := tx.First(&shot, "id = ? AND project_id = ? AND unit_id = ?", entry.ShotID, projectID, record.UnitID).Error; err != nil {
				return err
			}
			description := shot.Description
			if entry.RevisionID != "" {
				revision, err := repo.ShotRevisionForShot(shot.ID, entry.RevisionID)
				if err != nil {
					return err
				}
				description = revision.PlotDescription
			}
			values := map[string]any{"archived": false, "current_revision_id": entry.RevisionID, "title": entry.Title, "description": description, "position": entry.Position, "duration_ms": entry.DurationMs, "status": entry.Status, "video_source": entry.VideoSource, "updated_at": now}
			if err := tx.Model(&model.Shot{}).Where("id = ?", shot.ID).Updates(values).Error; err != nil {
				return err
			}
			if err := tx.First(&shot, "id = ?", shot.ID).Error; err != nil {
				return err
			}
			shots = append(shots, shot)
		}
		ids := []string{}
		for id := range wanted {
			ids = append(ids, id)
		}
		if len(ids) > 0 {
			if err := tx.Where("shot_id IN ?", ids).Delete(&model.ShotAssetReference{}).Error; err != nil {
				return err
			}
			for _, ref := range snapshot.References {
				if !wanted[ref.ShotID] || ref.ID == "" || ref.AssetVersionID == "" {
					return errors.New("原参考关系无法读取")
				}
				if _, err := repo.AssetVersionForProject(projectID, ref.AssetVersionID); err != nil {
					return err
				}
			}
			if len(snapshot.References) > 0 {
				if err := tx.Create(&snapshot.References).Error; err != nil {
					return err
				}
			}
			if err := tx.Model(&model.ShotArtifact{}).Where("shot_id IN ?", ids).Update("selected", false).Error; err != nil {
				return err
			}
			for _, selection := range snapshot.Selections {
				if !wanted[selection.ShotID] {
					return errors.New("原候选选择不属于该方案")
				}
				if selection.Status != "ready" && selection.Status != "stale" {
					return errors.New("原候选状态无法恢复")
				}
				result := tx.Model(&model.ShotArtifact{}).Where("id = ? AND shot_id = ? AND project_id = ? AND resource_id = ? AND revision_id = ?", selection.ArtifactID, selection.ShotID, projectID, selection.ResourceID, selection.RevisionID).Updates(map[string]any{"selected": true, "archived": false, "status": selection.Status, "updated_at": now})
				if result.Error != nil {
					return result.Error
				}
				if result.RowsAffected != 1 {
					return fmt.Errorf("原候选文件关联已不可用")
				}
			}
		}
		if err := invalidateUnitWorkflowTx(tx, projectID, record.UnitID, "storyboard", now); err != nil {
			return err
		}
		if err := tx.Model(&model.Project{}).Where("id = ?", projectID).Updates(map[string]any{"revision": gorm.Expr("revision + 1"), "updated_at": now}).Error; err != nil {
			return err
		}
		result := model.ShotPlanWriteResult{Shots: shots, SourceRecordID: record.ID}
		unit, err := repo.ProjectUnit(projectID, record.UnitID)
		if err != nil {
			return err
		}
		if unit.SourceText != snapshot.SourceTextAtArchive || project.CreativeBriefJSON != snapshot.ProjectBriefJSON || project.Description != snapshot.ProjectDescription {
			result.Warnings = []string{"章节正文或创作目标已有后续修改，请核对恢复后的镜头、接戏和生成计划"}
		}
		if backup != nil {
			result.BackupRecordID = backup.ID
		}
		// Restore receipts use the project-wide request namespace; a replay never
		// reactivates its historical rows after subsequent editing or replacement.
		return saveShotPlanMutationTx(tx, project, "", "restore", mutation, result)
	})
}
