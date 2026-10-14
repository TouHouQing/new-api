package model

import (
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)

// StudioDocument uses an unbounded text column on every supported database.
// MySQL TEXT is only 64 KiB and cannot hold a production canvas.
type StudioDocument string

func (StudioDocument) GormDataType() string { return "text" }
func (StudioDocument) GormDBDataType(db *gorm.DB, _ *schema.Field) string {
	if db.Dialector.Name() == "mysql" {
		return "longtext"
	}
	return "text"
}

type StudioProject struct {
	ID        string         `json:"id" gorm:"type:varchar(128);primaryKey"`
	OwnerID   int            `json:"owner_id" gorm:"not null;index"`
	Title     string         `json:"title" gorm:"type:varchar(200);not null"`
	Revision  int64          `json:"revision" gorm:"not null"`
	Document  StudioDocument `json:"-"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at" gorm:"index"`
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`
}

type StudioProjectVersion struct {
	ID        uint           `json:"id" gorm:"primaryKey"`
	ProjectID string         `json:"project_id" gorm:"type:varchar(128);not null;uniqueIndex:idx_studio_version"`
	Revision  int64          `json:"revision" gorm:"not null;uniqueIndex:idx_studio_version"`
	AuthorID  int            `json:"author_id"`
	Document  StudioDocument `json:"-"`
	CreatedAt time.Time      `json:"created_at"`
}

type StudioProjectMember struct {
	ID        uint      `json:"-" gorm:"primaryKey"`
	ProjectID string    `json:"project_id" gorm:"type:varchar(128);not null;uniqueIndex:idx_studio_member"`
	UserID    int       `json:"user_id" gorm:"not null;uniqueIndex:idx_studio_member;index"`
	Role      string    `json:"role" gorm:"type:varchar(16);not null"`
	CreatedAt time.Time `json:"created_at"`
}

type StudioMedia struct {
	ID        uint      `json:"-" gorm:"primaryKey"`
	OwnerID   int       `json:"-" gorm:"not null;uniqueIndex:idx_studio_media"`
	MediaID   string    `json:"media_id" gorm:"type:varchar(128);not null;uniqueIndex:idx_studio_media"`
	MimeType  string    `json:"mime_type" gorm:"type:varchar(100)"`
	Size      int64     `json:"size"`
	Digest    string    `json:"digest" gorm:"type:varchar(64)"`
	ObjectKey string    `json:"-" gorm:"type:varchar(1024)"`
	CreatedAt time.Time `json:"created_at"`
}

// Explicit project membership for media prevents an editor from guessing IDs
// belonging to another project owned by the same account. Links survive history.
type StudioProjectMediaLink struct {
	ID        uint   `gorm:"primaryKey"`
	ProjectID string `gorm:"type:varchar(128);not null;uniqueIndex:idx_studio_project_media"`
	MediaID   string `gorm:"type:varchar(128);not null;uniqueIndex:idx_studio_project_media"`
}

type StudioReviewComment struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	ProjectID string    `json:"project_id" gorm:"type:varchar(128);not null;index"`
	Revision  int64     `json:"revision"`
	AuthorID  int       `json:"author_id"`
	NodeID    string    `json:"node_id" gorm:"type:varchar(128)"`
	TakeID    string    `json:"take_id" gorm:"type:varchar(128)"`
	Seconds   float64   `json:"seconds"`
	Message   string    `json:"message" gorm:"type:text"`
	Resolved  bool      `json:"resolved"`
	CreatedAt time.Time `json:"created_at"`
}

type StudioWorkflowJob struct {
	ID          string         `json:"id" gorm:"type:varchar(128);primaryKey"`
	ProjectID   string         `json:"project_id" gorm:"type:varchar(128);not null;index"`
	UserID      int            `json:"user_id" gorm:"not null;index;uniqueIndex:idx_studio_job_request"`
	TokenID     int            `json:"-"`
	RequestID   string         `json:"request_id" gorm:"type:varchar(128);not null;uniqueIndex:idx_studio_job_request"`
	Fingerprint string         `json:"-" gorm:"type:varchar(64)"`
	Kind        string         `json:"kind" gorm:"type:varchar(32)"`
	Status      string         `json:"status" gorm:"type:varchar(24);index"`
	Revision    int64          `json:"revision"`
	Plan        StudioDocument `json:"-"`
	Result      StudioDocument `json:"-"`
	Error       string         `json:"error" gorm:"type:text"`
	Budget      int64          `json:"budget"`
	Reserved    int64          `json:"reserved"`
	Progress    int            `json:"progress"`
	LeaseOwner  string         `json:"-" gorm:"type:varchar(128)"`
	LeaseUntil  int64          `json:"-" gorm:"index"`
	RunAfter    int64          `json:"run_after" gorm:"not null;default:0;index"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
}

var ErrStudioRevision = errors.New("project changed; read the current revision before editing")
var ErrStudioAccess = errors.New("project is unavailable")

func RestoreStudioDeletedProject(userID int, projectID string) (*StudioProject, error) {
	var result *StudioProject
	err := DB.Transaction(func(tx *gorm.DB) error {
		var project StudioProject
		if err := lockForUpdate(tx.Unscoped()).Where("id = ? AND owner_id = ? AND deleted_at IS NOT NULL", projectID, userID).First(&project).Error; err != nil {
			return ErrStudioAccess
		}
		updated := tx.Unscoped().Model(&StudioProject{}).Where("id = ? AND owner_id = ? AND revision = ? AND deleted_at IS NOT NULL", projectID, userID, project.Revision).Updates(map[string]any{"deleted_at": nil, "revision": project.Revision + 1, "updated_at": time.Now()})
		if updated.Error != nil {
			return updated.Error
		}
		if updated.RowsAffected != 1 {
			return ErrStudioRevision
		}
		project.DeletedAt = gorm.DeletedAt{}
		project.Revision++
		if err := tx.Create(&StudioProjectVersion{ProjectID: project.ID, Revision: project.Revision, AuthorID: userID, Document: project.Document}).Error; err != nil {
			return err
		}
		result = &project
		return nil
	})
	return result, err
}

func StudioProjectAccess(db *gorm.DB, userID int, projectID string, write bool) (*StudioProject, string, error) {
	var project StudioProject
	if err := db.Where("id = ?", projectID).First(&project).Error; err != nil {
		return nil, "", ErrStudioAccess
	}
	if project.OwnerID == userID {
		return &project, "owner", nil
	}
	var member StudioProjectMember
	if err := db.Where("project_id = ? AND user_id = ?", projectID, userID).First(&member).Error; err != nil {
		return nil, "", ErrStudioAccess
	}
	if write && member.Role != "editor" {
		return nil, "", ErrStudioAccess
	}
	return &project, member.Role, nil
}

func SaveStudioProject(userID int, projectID, title string, expected int64, document string) (*StudioProject, error) {
	return saveStudioProject(userID, projectID, title, expected, document, false)
}

// The review controller constructs this document from the existing revision;
// reviewers can only change review decisions, never arbitrary canvas content.
func SaveStudioProjectReview(userID int, projectID, title string, expected int64, document string) (*StudioProject, error) {
	return saveStudioProject(userID, projectID, title, expected, document, true)
}

func saveStudioProject(userID int, projectID, title string, expected int64, document string, review bool) (*StudioProject, error) {
	var result *StudioProject
	err := DB.Transaction(func(tx *gorm.DB) error {
		if expected == 0 {
			if review {
				return ErrStudioAccess
			}
			project := StudioProject{ID: projectID, OwnerID: userID, Title: title, Revision: 1, Document: StudioDocument(document)}
			if err := tx.Create(&project).Error; err != nil {
				return ErrStudioRevision
			}
			result = &project
		} else {
			project, role, err := StudioProjectAccess(tx, userID, projectID, !review)
			if err != nil {
				return err
			}
			if review && role == "viewer" {
				return ErrStudioAccess
			}
			if project.Revision != expected {
				return ErrStudioRevision
			}
			updated := tx.Model(&StudioProject{}).Where("id = ? AND revision = ?", projectID, expected).Updates(map[string]any{"title": title, "document": StudioDocument(document), "revision": expected + 1, "updated_at": time.Now()})
			if updated.Error != nil {
				return updated.Error
			}
			if updated.RowsAffected != 1 {
				return ErrStudioRevision
			}
			project.Title, project.Document, project.Revision = title, StudioDocument(document), expected+1
			result = project
		}
		return tx.Create(&StudioProjectVersion{ProjectID: projectID, Revision: result.Revision, AuthorID: userID, Document: result.Document}).Error
	})
	return result, err
}
