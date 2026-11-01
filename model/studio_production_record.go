package model

import (
	"errors"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

// Production records keep large analyses and immutable edit plans outside the
// autosaved project. Payloads use StudioDocument on all three SQL engines.
type StudioProductionRecord struct {
	ID              string         `json:"id" gorm:"type:varchar(128);primaryKey"`
	ProjectID       string         `json:"project_id" gorm:"type:varchar(128);index"`
	OwnerID         int            `json:"-" gorm:"not null;index"`
	AuthorID        int            `json:"author_id"`
	ParentID        string         `json:"parent_id,omitempty" gorm:"type:varchar(128);index"`
	Kind            string         `json:"kind" gorm:"type:varchar(32);not null;index"`
	Fingerprint     string         `json:"-" gorm:"type:varchar(64);not null"`
	Revision        int64          `json:"revision" gorm:"not null"`
	State           string         `json:"state" gorm:"type:varchar(24);not null"`
	AppliedRevision int64          `json:"applied_revision,omitempty"`
	Document        StudioDocument `json:"-"`
	CreatedAt       time.Time      `json:"created_at"`
	UpdatedAt       time.Time      `json:"updated_at"`
}

func ReadStudioProductionRecord(userID int, id string, write bool) (*StudioProductionRecord, error) {
	var record StudioProductionRecord
	if err := DB.First(&record, "id = ?", id).Error; err != nil {
		return nil, ErrStudioAccess
	}
	if record.ProjectID != "" {
		if _, _, err := StudioProjectAccess(DB, userID, record.ProjectID, write); err != nil {
			return nil, err
		}
	} else if record.OwnerID != userID {
		return nil, ErrStudioAccess
	}
	return &record, nil
}

func CreateStudioProductionRecord(userID int, value *StudioProductionRecord) (*StudioProductionRecord, error) {
	value.AuthorID, value.OwnerID = userID, userID
	if value.ProjectID != "" {
		project, _, err := StudioProjectAccess(DB, userID, value.ProjectID, true)
		if err != nil {
			return nil, err
		}
		value.OwnerID = project.OwnerID
	}
	if existing, err := ReadStudioProductionRecord(userID, value.ID, true); err == nil {
		if existing.ProjectID != value.ProjectID || existing.Kind != value.Kind || existing.Fingerprint != value.Fingerprint {
			return nil, ErrStudioRevision
		}
		return existing, nil
	}
	if err := DB.Create(value).Error; err != nil {
		// A concurrent duplicate is accepted only if it is the same request.
		if existing, readErr := ReadStudioProductionRecord(userID, value.ID, true); readErr == nil && existing.ProjectID == value.ProjectID && existing.Kind == value.Kind && existing.Fingerprint == value.Fingerprint {
			return existing, nil
		}
		return nil, ErrStudioRevision
	}
	return value, nil
}

// ApplyStudioEditRecord commits the project, its history and the plan receipt in
// one transaction. A lost response can be retried without applying the edit twice.
func ApplyStudioEditRecord(userID int, recordID string, expected int64, validators ...func(*gorm.DB, *StudioProject, *StudioProductionRecord) error) (*StudioProject, *StudioProductionRecord, error) {
	var project *StudioProject
	var record StudioProductionRecord
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).First(&record, "id = ? AND kind = ?", recordID, "edit_plan").Error; err != nil {
			return ErrStudioAccess
		}
		current, _, err := StudioProjectAccess(tx, userID, record.ProjectID, true)
		if err != nil {
			return err
		}
		project = current
		if record.State == "applied" {
			return nil
		}
		if record.State != "ready" || expected < 1 || current.Revision != expected || record.Revision != expected {
			return ErrStudioRevision
		}
		var plan struct {
			NextDocument map[string]any `json:"next_document"`
		}
		if err := common.Unmarshal([]byte(record.Document), &plan); err != nil || plan.NextDocument["id"] != current.ID {
			return errors.New("edit plan document is invalid")
		}
		// Source-dependent plans revalidate against this transaction's current
		// project before committing. Applied receipts remain idempotent above.
		for _, validate := range validators {
			if validate != nil {
				if err := validate(tx, current, &record); err != nil {
					return err
				}
			}
		}
		title, ok := plan.NextDocument["title"].(string)
		if !ok {
			return errors.New("edit plan title is invalid")
		}
		raw, err := common.Marshal(plan.NextDocument)
		if err != nil {
			return err
		}
		updated := tx.Model(&StudioProject{}).Where("id = ? AND revision = ?", current.ID, expected).Updates(map[string]any{"document": StudioDocument(raw), "title": title, "revision": expected + 1, "updated_at": time.Now()})
		if updated.Error != nil {
			return updated.Error
		}
		if updated.RowsAffected != 1 {
			return ErrStudioRevision
		}
		current.Document, current.Title, current.Revision = StudioDocument(raw), title, expected+1
		if err := tx.Create(&StudioProjectVersion{ProjectID: current.ID, Revision: current.Revision, AuthorID: userID, Document: current.Document}).Error; err != nil {
			return err
		}
		record.State, record.AppliedRevision = "applied", current.Revision
		return tx.Model(&record).Updates(map[string]any{"state": record.State, "applied_revision": record.AppliedRevision}).Error
	})
	return project, &record, err
}
