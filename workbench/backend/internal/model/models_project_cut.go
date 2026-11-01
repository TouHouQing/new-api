package model

import (
	"strings"
	"time"
)

// A cut is an immutable, editable timeline snapshot. Rendering it is a separate
// task; selecting it never changes source files, candidates or other snapshots.
type ProjectCut struct {
	OriginCutID      string    `json:"-" gorm:"size:36;not null;default:''"`
	ID               string    `json:"id" gorm:"primaryKey;size:36"`
	UserID           string    `json:"-" gorm:"size:36;index"`
	ProjectID        string    `json:"projectId" gorm:"size:36;index;uniqueIndex:idx_project_cut_request,priority:1"`
	RequestID        string    `json:"-" gorm:"size:128;uniqueIndex:idx_project_cut_request,priority:2"`
	RequestSHA256    string    `json:"-" gorm:"size:64"`
	Title            string    `json:"title" gorm:"size:200"`
	Kind             string    `json:"kind" gorm:"size:32"`
	Language         string    `json:"language,omitempty" gorm:"size:40"`
	Region           string    `json:"region,omitempty" gorm:"size:100"`
	AspectRatio      string    `json:"aspectRatio,omitempty" gorm:"size:16"`
	UnitID           string    `json:"unitId,omitempty" gorm:"size:36;index"`
	SourceImportID   string    `json:"sourceImportId,omitempty" gorm:"size:36;index"`
	SourceKey        string    `json:"sourceKey,omitempty" gorm:"size:160"`
	TimelineRevision int64     `json:"timelineRevision"`
	TimelineSHA256   string    `json:"timelineSha256" gorm:"size:64"`
	PayloadJSON      string    `json:"-" gorm:"type:text"`
	MetadataJSON     string    `json:"-" gorm:"type:text"`
	Archived         bool      `json:"archived" gorm:"not null;default:false"`
	CreatedAt        time.Time `json:"createdAt" gorm:"index"`
}

// These snapshots continue the working edit. Imported and canvas conversions
// describe independent sources, and must not inherit unrelated settings.
func (cut ProjectCut) DerivesFromWorkingCut() bool {
	switch cut.SourceKey {
	case "", "working-export-v1", "timeline-edit-v1", "timeline-edit-before-v1", "project-cut-before-v1", "legacy-review-before-v1":
		return true
	}
	return false
}

func (cut ProjectCut) WorkingOriginRevision() int64 {
	if cut.SourceKey == "timeline-edit-v1" && cut.TimelineRevision > 0 {
		return cut.TimelineRevision - 1
	}
	return cut.TimelineRevision
}

func (cut ProjectCut) IsAutomatic() bool {
	if cut.Kind != "snapshot" {
		return false
	}
	switch cut.SourceKey {
	case "timeline-edit-v1", "timeline-edit-before-v1", "project-cut-before-v1", "legacy-review-before-v1":
		return true
	}
	// Earlier native cut loads had a stable internal request prefix but no
	// source key. Titles are user editable and must never classify history.
	return cut.SourceKey == "" && strings.HasPrefix(cut.RequestID, "before-apply:")
}

// Unknown apply replies recover through this receipt. A later edit or deletion
// cannot turn a replay into a second replacement of the working timeline.
type ProjectCutApplyReceipt struct {
	ID            string    `json:"id" gorm:"primaryKey;size:36"`
	UserID        string    `json:"-" gorm:"size:36;index"`
	ProjectID     string    `json:"projectId" gorm:"size:36;index;uniqueIndex:idx_project_cut_apply_request,priority:1"`
	RequestID     string    `json:"-" gorm:"size:128;uniqueIndex:idx_project_cut_apply_request,priority:2"`
	RequestSHA256 string    `json:"-" gorm:"size:64"`
	CutID         string    `json:"cutId" gorm:"size:36;index"`
	ResultJSON    string    `json:"-" gorm:"type:text"`
	CreatedAt     time.Time `json:"createdAt"`
}
