package model

import "time"

// ProjectTimeline is the project's editable cut. Canvas-local timelines remain
// separate sketches; final project editing has one server-owned document.
type ProjectTimeline struct {
	OriginCutID string    `json:"-" gorm:"size:36;not null;default:''"`
	ProjectID   string    `json:"projectId" gorm:"primaryKey;size:36"`
	UserID      string    `json:"-" gorm:"index;size:36"`
	Revision    int64     `json:"revision" gorm:"not null;default:1"`
	PayloadJSON string    `json:"-" gorm:"type:text"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}
