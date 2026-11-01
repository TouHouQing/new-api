package model

import "time"

// ProductionImport records an owner-scoped, immutable migration receipt. It is
// not a second project or task store; editing uses the native rows it created.
type ProductionImport struct {
	ID                 string    `json:"id" gorm:"primaryKey;size:36"`
	UserID             string    `json:"-" gorm:"size:36;uniqueIndex:idx_production_import_source,priority:1"`
	SourceFingerprint  string    `json:"sourceFingerprint" gorm:"size:64;uniqueIndex:idx_production_import_source,priority:2"`
	SourceProjectID    string    `json:"sourceProjectId" gorm:"size:128"`
	ProjectID          string    `json:"projectId" gorm:"index;size:36"`
	CanvasID           string    `json:"canvasId" gorm:"size:80"`
	ContractVersion    int       `json:"contractVersion"`
	SourceDocumentJSON string    `json:"-" gorm:"type:text"`
	ResourceRefsJSON   string    `json:"-" gorm:"type:text"`
	ReportJSON         string    `json:"-" gorm:"type:text"`
	IdentityMapJSON    string    `json:"-" gorm:"type:text"`
	CreatedAt          time.Time `json:"createdAt"`
}
