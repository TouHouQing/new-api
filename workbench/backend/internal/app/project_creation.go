package app

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

func validateProjectCreationKey(key string) error {
	if key == "" {
		return nil
	}
	if len(key) < 16 || len(key) > 128 || strings.TrimSpace(key) != key {
		return BadAuthRequest("项目请求编号须为16到128个可打印ASCII字符")
	}
	for _, character := range key {
		if character < 33 || character > 126 {
			return BadAuthRequest("项目请求编号须为16到128个可打印ASCII字符")
		}
	}
	return nil
}

func projectCreationHash(value []byte) string {
	digest := sha256.Sum256(value)
	return hex.EncodeToString(digest[:])
}

func (s *Service) commitProjectCreation(userID, key string, project *model.Project, starter *ProjectStarterRequest) error {
	// Exclude generated identity, clocks and mutable runtime status from the
	// intent digest, while preserving every normalized creation parameter.
	intent := *project
	intent.ID, intent.UserID, intent.Status = "", "", ""
	intent.Revision, intent.CreatedAt, intent.UpdatedAt = 0, time.Time{}, time.Time{}
	raw, err := json.Marshal(intent)
	if starter != nil {
		raw, err = json.Marshal(struct {
			Project model.Project
			Starter *ProjectStarterRequest
		}{intent, starter})
	}
	if err != nil {
		return err
	}
	return s.repo.Transaction(func(tx *repository.Repository) error {
		if key != "" {
			receipt := model.ProjectCreationReceipt{ID: projectCreationHash([]byte(userID + "\x00" + key)), UserID: userID, PayloadSHA256: projectCreationHash(raw), ProjectID: project.ID, CreatedAt: time.Now()}
			created, err := tx.TryCreateProjectCreationReceipt(&receipt)
			if err != nil {
				return err
			}
			if !created {
				previous, err := tx.ProjectCreationReceiptForUser(userID, receipt.ID)
				if err != nil {
					return err
				}
				if previous.PayloadSHA256 != receipt.PayloadSHA256 {
					return NewAppError(http.StatusConflict, "同一项目请求编号不能用于不同的创建内容")
				}
				stored, err := tx.ProjectForUser(userID, previous.ProjectID)
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return NewAppError(http.StatusGone, "原请求创建的项目已删除，请明确使用新的请求编号新建")
				}
				if err != nil {
					return err
				}
				*project = *stored
				return nil
			}
		}
		writer := &Service{repo: tx, dataDir: s.dataDir, pendingStorage: s.pendingStorage}
		if project.CreativeBriefJSON != "" || starter != nil {
			if err := writer.validateProductionDocumentStorage(userID, int64(len(project.CreativeBriefJSON))); err != nil {
				return err
			}
		}
		if err := tx.CreateProject(project); err != nil {
			return err
		}
		if _, err := (&Service{repo: tx}).createProjectWorkflow(project.ID, "", "project"); err != nil {
			return err
		}
		if err := writer.applyProjectStarter(userID, project, starter); err != nil {
			return err
		}
		if project.CreativeBriefJSON != "" || starter != nil {
			if err := writer.validateProductionDocumentStorage(userID, 0); err != nil {
				return err
			}
		}
		stored, err := tx.ProjectForUser(userID, project.ID)
		if err != nil {
			return err
		}
		*project = *stored
		return nil
	})
}
