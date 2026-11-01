package model

import "time"

// ProjectTranscript pins an immutable source resource and recognition task.
// Editable text lives in append-only revisions, independently of media cuts.
type ProjectTranscript struct {
	ID                string    `json:"id" gorm:"primaryKey;size:36"`
	UserID            string    `json:"userId" gorm:"index;size:36"`
	ProjectID         string    `json:"projectId" gorm:"size:36;index;uniqueIndex:idx_project_transcripts_source,priority:1"`
	SourceKind        string    `json:"sourceKind" gorm:"size:24;uniqueIndex:idx_project_transcripts_source,priority:2"`
	SourceKey         string    `json:"sourceKey" gorm:"size:80;uniqueIndex:idx_project_transcripts_source,priority:3"`
	SourceTaskID      string    `json:"sourceTaskId,omitempty" gorm:"size:80;index"`
	SourceImportID    string    `json:"sourceImportId,omitempty" gorm:"size:36;index"`
	SourceLegacyID    string    `json:"sourceLegacyId,omitempty" gorm:"size:160"`
	ResourceID        string    `json:"resourceId" gorm:"index;size:36"`
	Title             string    `json:"title" gorm:"size:240"`
	SourceETag        string    `json:"sourceETag,omitempty" gorm:"size:160"`
	SourceBytes       int64     `json:"sourceBytes"`
	SourceDurationMs  int64     `json:"sourceDurationMs"`
	CurrentRevisionID string    `json:"currentRevisionId" gorm:"size:36"`
	Revision          int64     `json:"revision"`
	Archived          bool      `json:"archived" gorm:"not null;default:false"`
	CreatedAt         time.Time `json:"createdAt" gorm:"index"`
	UpdatedAt         time.Time `json:"updatedAt"`
}

type ProjectTranscriptRevision struct {
	ID           string    `json:"id" gorm:"primaryKey;size:36"`
	TranscriptID string    `json:"transcriptId" gorm:"size:36;uniqueIndex:idx_transcript_revisions_version,priority:1"`
	Version      int64     `json:"version" gorm:"uniqueIndex:idx_transcript_revisions_version,priority:2"`
	UserID       string    `json:"userId" gorm:"index;size:36"`
	AuthorID     string    `json:"authorId" gorm:"size:36"`
	DocumentJSON string    `json:"-" gorm:"type:text"`
	Note         string    `json:"note" gorm:"size:240"`
	CreatedAt    time.Time `json:"createdAt"`
}
