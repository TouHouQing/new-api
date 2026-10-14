package model

import "time"

// Only a SHA-256 digest is persisted. The bearer token is returned once to its
// creator and travels in a URL fragment and request header, never query logs.
type StudioReviewShare struct {
	ID            string     `json:"id" gorm:"type:varchar(128);primaryKey"`
	ProjectID     string     `json:"project_id" gorm:"type:varchar(128);not null;index"`
	CreatorID     int        `json:"-"`
	TokenHash     string     `json:"-" gorm:"type:varchar(64);not null;uniqueIndex"`
	Revision      int64      `json:"revision"`
	MediaID       string     `json:"media_id" gorm:"type:varchar(128)"`
	NodeID        string     `json:"node_id" gorm:"type:varchar(128)"`
	TakeID        string     `json:"take_id" gorm:"type:varchar(128)"`
	AllowComments bool       `json:"allow_comments"`
	ExpiresAt     time.Time  `json:"expires_at"`
	RevokedAt     *time.Time `json:"revoked_at"`
	CreatedAt     time.Time  `json:"created_at"`
}
