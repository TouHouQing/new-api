package model

import "time"

// Archive records pin the old plan; mutation records retain canonical replies
// so a lost response cannot replace a later plan a second time.
type ProjectShotPlanRecord struct {
	ID            string    `json:"id" gorm:"primaryKey;size:64"`
	UserID        string    `json:"userId" gorm:"index;size:36"`
	ProjectID     string    `json:"projectId" gorm:"index;size:36;index:idx_shot_plan_unit_created,priority:1"`
	UnitID        string    `json:"unitId" gorm:"index;size:36;index:idx_shot_plan_unit_created,priority:2"`
	Kind          string    `json:"kind" gorm:"size:24;index"`
	Title         string    `json:"title" gorm:"size:240"`
	PayloadJSON   string    `json:"-" gorm:"type:text"`
	PayloadSHA256 string    `json:"payloadSha256" gorm:"size:64"`
	RequestID     string    `json:"requestId,omitempty" gorm:"size:128"`
	RequestSHA256 string    `json:"requestSha256,omitempty" gorm:"size:64"`
	ShotCount     int       `json:"shotCount"`
	CreatedAt     time.Time `json:"createdAt" gorm:"index:idx_shot_plan_unit_created,priority:3"`
}
type ShotPlanEntry struct {
	ShotID      string `json:"shotId"`
	RevisionID  string `json:"revisionId"`
	Title       string `json:"title"`
	Position    int    `json:"position"`
	DurationMs  int64  `json:"durationMs"`
	Status      string `json:"status"`
	VideoSource string `json:"videoSource"`
}
type ShotPlanSelection struct {
	ShotID     string `json:"shotId"`
	ArtifactID string `json:"artifactId"`
	ResourceID string `json:"resourceId"`
	RevisionID string `json:"revisionId"`
	Status     string `json:"status"`
}
type ShotPlanSnapshot struct {
	ProjectDescription  string               `json:"projectDescription"`
	Version             int                  `json:"version"`
	ProjectID           string               `json:"projectId"`
	UnitID              string               `json:"unitId"`
	SourceTextAtArchive string               `json:"sourceTextAtArchive"`
	ProjectBriefJSON    string               `json:"projectBriefJson"`
	Entries             []ShotPlanEntry      `json:"entries"`
	References          []ShotAssetReference `json:"references"`
	Selections          []ShotPlanSelection  `json:"selections"`
}
type ShotPlanWriteResult struct {
	Warnings       []string `json:"warnings,omitempty"`
	Current        bool     `json:"current"`
	Shots          []Shot   `json:"shots"`
	BackupRecordID string   `json:"backupRecordId,omitempty"`
	SourceRecordID string   `json:"sourceRecordId,omitempty"`
	Replayed       bool     `json:"replayed"`
}
