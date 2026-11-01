package model

import "time"

// UserID is the project owner for the existing quota system. MemberUserID is
// the participating account; a grant is explicit and revocable.
type ProjectMember struct {
	ID           string    `json:"id" gorm:"primaryKey;size:36"`
	UserID       string    `json:"-" gorm:"size:36;not null;index"`
	ProjectID    string    `json:"projectId" gorm:"size:36;not null;uniqueIndex:idx_project_member_identity,priority:1"`
	MemberUserID string    `json:"userId" gorm:"size:36;not null;uniqueIndex:idx_project_member_identity,priority:2;index"`
	Role         string    `json:"role" gorm:"size:24;not null"`
	Active       bool      `json:"active" gorm:"not null;default:false"`
	Revision     int64     `json:"revision" gorm:"not null"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// A review freezes a concrete cut/export, shot artifact or asset version.
// SourceJSON contains explicit identities and clip locations, never whichever
// candidate happens to be selected later.
type ProjectReview struct {
	ID             string    `json:"id" gorm:"primaryKey;size:36"`
	UserID         string    `json:"-" gorm:"size:36;not null;index"`
	ProjectID      string    `json:"projectId" gorm:"size:36;not null;index:idx_project_reviews_created,priority:1"`
	Title          string    `json:"title" gorm:"size:240;not null"`
	TargetKind     string    `json:"targetKind" gorm:"size:24;not null"`
	ParentReviewID string    `json:"parentReviewId,omitempty" gorm:"size:36;index"`
	TargetSHA256   string    `json:"targetSha256" gorm:"size:64;not null"`
	SourceJSON     string    `json:"-" gorm:"type:text;not null"`
	ResourceID     string    `json:"resourceId" gorm:"size:36;not null;index"`
	ResourceSHA256 string    `json:"resourceSha256" gorm:"size:64;not null"`
	ResourceKind   string    `json:"resourceKind" gorm:"size:24;not null"`
	DurationMs     int64     `json:"durationMs" gorm:"not null"`
	Width          int       `json:"width"`
	Height         int       `json:"height"`
	Status         string    `json:"status" gorm:"size:24;not null"`
	Revision       int64     `json:"revision" gorm:"not null"`
	Archived       bool      `json:"archived" gorm:"not null;default:false"`
	CreatedBy      string    `json:"createdBy" gorm:"size:36;not null"`
	CreatedAt      time.Time `json:"createdAt" gorm:"index:idx_project_reviews_created,priority:2"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

type ProjectReviewComment struct {
	ID                 string    `json:"id" gorm:"primaryKey;size:36"`
	UserID             string    `json:"-" gorm:"size:36;not null;index"`
	ProjectID          string    `json:"projectId" gorm:"size:36;not null;index"`
	ReviewID           string    `json:"reviewId" gorm:"size:36;not null;index:idx_project_review_comments_created,priority:1"`
	AuthorUserID       string    `json:"authorUserId,omitempty" gorm:"size:36"`
	AuthorName         string    `json:"authorName" gorm:"size:120;not null"`
	ShareID            string    `json:"-" gorm:"size:36;index"`
	TimeMs             *int64    `json:"timeMs,omitempty"`
	EndMs              *int64    `json:"endMs,omitempty"`
	ClipID             string    `json:"clipId,omitempty" gorm:"size:160"`
	Message            string    `json:"message" gorm:"type:text;not null"`
	Blocking           bool      `json:"blocking" gorm:"not null;default:false"`
	Resolved           bool      `json:"resolved" gorm:"not null;default:false"`
	AssignedUserID     string    `json:"assignedUserId,omitempty" gorm:"size:36;index"`
	ResolutionKind     string    `json:"resolutionKind,omitempty" gorm:"size:24"`
	ResolutionReviewID string    `json:"resolutionReviewId,omitempty" gorm:"size:36;index"`
	ResolutionNote     string    `json:"resolutionNote,omitempty" gorm:"type:text"`
	Revision           int64     `json:"revision" gorm:"not null"`
	CreatedAt          time.Time `json:"createdAt" gorm:"index:idx_project_review_comments_created,priority:2"`
	UpdatedAt          time.Time `json:"updatedAt"`
}

type ProjectReviewShare struct {
	ID            string    `json:"id" gorm:"primaryKey;size:36"`
	UserID        string    `json:"-" gorm:"size:36;not null;index"`
	ProjectID     string    `json:"projectId" gorm:"size:36;not null;index"`
	ReviewID      string    `json:"reviewId" gorm:"size:36;not null;index"`
	TokenHash     string    `json:"-" gorm:"size:64;not null;uniqueIndex"`
	TokenCipher   string    `json:"-" gorm:"type:text;not null"`
	AllowComments bool      `json:"allowComments" gorm:"not null;default:false"`
	Active        bool      `json:"active" gorm:"not null;default:false"`
	Revision      int64     `json:"revision" gorm:"not null"`
	ExpiresAt     time.Time `json:"expiresAt" gorm:"not null;index"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

// Share URLs are reconstructed only for the owner from encrypted share rows;
// plaintext tokens must never appear in the receipt JSON audit history.
type ProjectReviewReceipt struct {
	ID            string    `json:"id" gorm:"primaryKey;size:36"`
	UserID        string    `json:"-" gorm:"size:36;not null;index"`
	ProjectID     string    `json:"projectId" gorm:"size:36;not null;uniqueIndex:idx_project_review_request,priority:1"`
	ActorKey      string    `json:"-" gorm:"size:96;not null;uniqueIndex:idx_project_review_request,priority:2"`
	RequestID     string    `json:"-" gorm:"size:128;not null;uniqueIndex:idx_project_review_request,priority:3"`
	RequestSHA256 string    `json:"-" gorm:"size:64;not null"`
	Kind          string    `json:"kind" gorm:"size:40;not null"`
	ReviewID      string    `json:"reviewId,omitempty" gorm:"size:36;index"`
	ResultJSON    string    `json:"-" gorm:"type:text;not null"`
	CreatedAt     time.Time `json:"createdAt"`
}
