package model

import (
	"gorm.io/gorm/clause"
	"time"
)

// A numeric database cursor remains stable across database and client time zones.
type StudioWorkflowEvent struct {
	ID        uint64    `json:"id" gorm:"primaryKey"`
	ProjectID string    `json:"project_id" gorm:"type:varchar(128);not null;index"`
	JobID     string    `json:"job_id" gorm:"type:varchar(128);not null;uniqueIndex:idx_studio_event_state"`
	Status    string    `json:"status" gorm:"type:varchar(24);not null;uniqueIndex:idx_studio_event_state"`
	Kind      string    `json:"kind" gorm:"type:varchar(32)"`
	Revision  int64     `json:"revision"`
	Error     string    `json:"error" gorm:"type:text"`
	CreatedAt time.Time `json:"created_at"`
}

func RecordStudioWorkflowEvent(job *StudioWorkflowJob) error {
	if job.Status != "succeeded" && job.Status != "failed" && job.Status != "uncertain" && job.Status != "cancelled" {
		return nil
	}
	event := StudioWorkflowEvent{ProjectID: job.ProjectID, JobID: job.ID, Status: job.Status, Kind: job.Kind, Revision: job.Revision, Error: job.Error, CreatedAt: job.UpdatedAt}
	return DB.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "job_id"}, {Name: "status"}}, DoNothing: true}).Create(&event).Error
}
