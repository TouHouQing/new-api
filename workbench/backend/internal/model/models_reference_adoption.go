package model

import "time"

// Native chapter/shot creation receipt survives chapter deletion, so an
// unknown response cannot recreate work that the user later removed.
type ProjectReferenceAdoption struct {
	ID                 string    `json:"id" gorm:"primaryKey;size:36"`
	UserID             string    `json:"-" gorm:"size:36;index"`
	ProjectID          string    `json:"projectId" gorm:"size:36;index"`
	RequestSHA256      string    `json:"-" gorm:"size:64"`
	AnalysisID         string    `json:"analysisId" gorm:"size:36;index"`
	AnalysisRevisionID string    `json:"analysisRevisionId" gorm:"size:36"`
	UnitID             string    `json:"unitId" gorm:"size:36;index"`
	ResultJSON         string    `json:"-" gorm:"type:text"`
	CreatedAt          time.Time `json:"createdAt"`
}
