package repository

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"yingce/backend/internal/model"
)

var ErrCanvasTimelineSourceChanged = errors.New("saved canvas timeline changed before conversion")

type CanvasTimelineCutSource struct {
	CanvasID string
	Revision int64
	SHA256   string
}

// The project/CAS, source canvas and required resources are checked in the
// same transaction. Canvas writers lock their canvas before Resource rows;
// taking the locks in that order here avoids a conversion/autosave deadlock.
func (r *Repository) CreateCanvasTimelineCut(row *model.ProjectCut, source CanvasTimelineCutSource, expectedTimeline, expectedProject int64) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := lockProjectCutTimeline(tx, row.UserID, row.ProjectID, expectedTimeline, &expectedProject); err != nil {
			return err
		}
		var canvas model.CanvasProject
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND user_id = ? AND project_id = ?", source.CanvasID, row.UserID, row.ProjectID).First(&canvas).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrCanvasTimelineSourceChanged
			}
			return err
		}
		var payload struct {
			Timeline json.RawMessage `json:"timeline"`
		}
		if canvas.Revision < source.Revision || json.Unmarshal([]byte(canvas.PayloadJSON), &payload) != nil {
			return ErrCanvasTimelineSourceChanged
		}
		var timeline map[string]any
		decoder := json.NewDecoder(bytes.NewReader(payload.Timeline))
		decoder.UseNumber()
		if decoder.Decode(&timeline) != nil || timeline == nil {
			return ErrCanvasTimelineSourceChanged
		}
		canonical, err := json.Marshal(timeline)
		if err != nil || fmt.Sprintf("%x", sha256.Sum256(canonical)) != source.SHA256 {
			return ErrCanvasTimelineSourceChanged
		}
		if err := lockTimelineResourceReferences(tx, row.UserID, row.PayloadJSON); err != nil {
			return err
		}
		return tx.Create(row).Error
	})
}
