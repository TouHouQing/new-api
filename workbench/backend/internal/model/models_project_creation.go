package model

import "time"

// Creation receipts outlive project deletion so an uncertain retry cannot
// recreate a project that the user intentionally removed.
type ProjectCreationReceipt struct {
	ID            string    `gorm:"primaryKey;size:64"`
	UserID        string    `gorm:"size:80;not null;index"`
	PayloadSHA256 string    `gorm:"size:64;not null"`
	ProjectID     string    `gorm:"size:80;not null;index"`
	CreatedAt     time.Time `gorm:"not null"`
}
