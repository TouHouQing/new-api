package model

import "time"

// Evidence and source identity never change; corrections are append-only.
type ProjectMediaAnalysis struct {
	ID                string    `json:"id" gorm:"primaryKey;size:36"`
	UserID            string    `json:"userId" gorm:"size:36;index"`
	ProjectID         string    `json:"projectId" gorm:"size:36;index;uniqueIndex:idx_media_analysis_source,priority:1"`
	Kind              string    `json:"kind" gorm:"size:32;index"`
	SourceKind        string    `json:"sourceKind" gorm:"size:24;uniqueIndex:idx_media_analysis_source,priority:2"`
	SourceKey         string    `json:"sourceKey" gorm:"size:160;uniqueIndex:idx_media_analysis_source,priority:3"`
	SourceTaskID      string    `json:"sourceTaskId,omitempty" gorm:"size:80;index"`
	SourceImportID    string    `json:"sourceImportId,omitempty" gorm:"size:36;index"`
	SourceLegacyID    string    `json:"sourceLegacyId,omitempty" gorm:"size:160"`
	ResourceID        string    `json:"resourceId" gorm:"size:36;index"`
	Title             string    `json:"title" gorm:"size:240"`
	SourceJSON        string    `json:"-" gorm:"type:text"`
	EvidenceJSON      string    `json:"-" gorm:"type:text"`
	CurrentRevisionID string    `json:"currentRevisionId" gorm:"size:36"`
	Revision          int64     `json:"revision"`
	Archived          bool      `json:"archived" gorm:"not null;default:false"`
	CreatedAt         time.Time `json:"createdAt" gorm:"index"`
	UpdatedAt         time.Time `json:"updatedAt"`
}

type ProjectMediaAnalysisRevision struct {
	ID            string    `json:"id" gorm:"primaryKey;size:36"`
	AnalysisID    string    `json:"analysisId" gorm:"size:36;uniqueIndex:idx_media_analysis_revisions_version,priority:1;uniqueIndex:idx_media_analysis_revision_request,priority:1"`
	RequestID     string    `json:"-" gorm:"size:128;uniqueIndex:idx_media_analysis_revision_request,priority:2"`
	RequestSHA256 string    `json:"-" gorm:"size:64"`
	Version       int64     `json:"version" gorm:"uniqueIndex:idx_media_analysis_revisions_version,priority:2"`
	UserID        string    `json:"userId" gorm:"size:36;index"`
	AuthorID      string    `json:"authorId" gorm:"size:36"`
	DocumentJSON  string    `json:"-" gorm:"type:text"`
	Note          string    `json:"note" gorm:"size:240"`
	CreatedAt     time.Time `json:"createdAt"`
}
