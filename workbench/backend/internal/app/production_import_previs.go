package app

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"time"
	"yingce/backend/internal/canvas"
	"yingce/backend/internal/repository"
)

// Uses the same revision, resource locks, edit leases and recovery history as
// normal canvas edits. The caller wraps this and the conversion cut in one txn.
func applyLegacyPrevisCanvas(repo *repository.Repository, rows *repository.ProductionImportRows) error {
	incoming := rows.PrevisCanvas
	if incoming == nil {
		return nil
	}
	before, err := repo.CanvasProjectForUser(incoming.UserID, incoming.ID)
	if err != nil {
		return err
	}
	if before.ProjectID != rows.Project.ID || incoming.ProjectID != rows.Project.ID || before.Revision != incoming.Revision || fmt.Sprintf("%x", sha256.Sum256([]byte(before.PayloadJSON))) != rows.PrevisCanvasBeforeSHA {
		return repository.ErrProjectTimelineConflict
	}
	incoming.UpdatedAt = time.Now()
	err = canvas.SaveDocumentWithHistory(repo, before, incoming, "before_legacy_previs")
	if errors.Is(err, repository.ErrCanvasRevisionConflict) {
		return repository.ErrProjectTimelineConflict
	}
	return err
}
