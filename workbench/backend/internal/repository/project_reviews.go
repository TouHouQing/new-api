package repository

import (
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"yingce/backend/internal/model"
)

// The service authorizes the actor against this locked project and its grants
// inside the callback. Membership changes use the same lock as review writes.
func (r *Repository) ProjectReviewTransaction(projectID string, apply func(*Repository, *model.Project) error) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var project model.Project
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", projectID).Take(&project).Error; err != nil {
			return err
		}
		return apply(New(tx), &project)
	})
}

func (r *Repository) ReviewGuestCommentCounts(owner, project, review, share string, now time.Time) ([3]int64, error) {
	var counts [3]int64
	query := r.db.Model(&model.ProjectReviewComment{}).Where("user_id = ? AND project_id = ? AND review_id = ?", owner, project, review)
	if err := query.Count(&counts[0]).Error; err != nil {
		return counts, err
	}
	for i, since := range []time.Time{now.Add(-time.Minute), now.Add(-24 * time.Hour)} {
		if err := r.db.Model(&model.ProjectReviewComment{}).Where("user_id = ? AND project_id = ? AND review_id = ? AND share_id = ? AND created_at >= ?", owner, project, review, share, since).Count(&counts[i+1]).Error; err != nil {
			return counts, err
		}
	}
	return counts, nil
}
func (r *Repository) ReviewProject(projectID string) (*model.Project, error) {
	var row model.Project
	err := r.db.Where("id = ?", projectID).Take(&row).Error
	return &row, err
}
func (r *Repository) ProjectMember(ownerID, projectID, memberID string) (*model.ProjectMember, error) {
	var row model.ProjectMember
	err := r.db.Where("user_id = ? AND project_id = ? AND member_user_id = ?", ownerID, projectID, memberID).Take(&row).Error
	return &row, err
}
func (r *Repository) ProjectMembers(ownerID, projectID string) ([]model.ProjectMember, error) {
	rows := []model.ProjectMember{}
	err := r.db.Where("user_id = ? AND project_id = ?", ownerID, projectID).Order("created_at ASC, id ASC").Find(&rows).Error
	return rows, err
}
func (r *Repository) CreateProjectMember(row *model.ProjectMember) error {
	return r.db.Create(row).Error
}
func (r *Repository) UpdateProjectMember(row *model.ProjectMember, expected int64) error {
	result := r.db.Model(&model.ProjectMember{}).Where("id = ? AND user_id = ? AND project_id = ? AND revision = ?", row.ID, row.UserID, row.ProjectID, expected).Select("role", "active", "revision", "updated_at").Updates(row)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrProjectTimelineConflict
	}
	return nil
}
func (r *Repository) ProjectReview(ownerID, projectID, id string) (*model.ProjectReview, error) {
	var row model.ProjectReview
	err := r.db.Where("id = ? AND user_id = ? AND project_id = ?", id, ownerID, projectID).Take(&row).Error
	return &row, err
}
func (r *Repository) ProjectReviewIdentity(id string) (*model.ProjectReview, error) {
	var row model.ProjectReview
	err := r.db.Where("id = ?", id).Take(&row).Error
	return &row, err
}
func (r *Repository) CreateProjectReview(row *model.ProjectReview) error {
	return r.db.Create(row).Error
}
func (r *Repository) UpdateProjectReview(row *model.ProjectReview, expected int64) error {
	result := r.db.Model(&model.ProjectReview{}).Where("id = ? AND user_id = ? AND project_id = ? AND revision = ?", row.ID, row.UserID, row.ProjectID, expected).Select("title", "status", "archived", "revision", "updated_at").Updates(row)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrProjectTimelineConflict
	}
	return nil
}
func (r *Repository) ProjectReviewPage(actorID, projectID string, archived bool, before time.Time, cursor string, limit int) ([]model.ProjectReview, error) {
	rows := []model.ProjectReview{}
	query := r.db.Model(&model.ProjectReview{}).Joins("JOIN projects ON projects.id = project_reviews.project_id AND projects.user_id = project_reviews.user_id").Joins("JOIN users review_owner ON review_owner.id = projects.user_id").Where("review_owner.status = ? AND project_reviews.archived = ?", model.UserStatusActive, archived).
		Where("project_reviews.user_id = ? OR (projects.status = ? AND EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = project_reviews.project_id AND m.user_id = project_reviews.user_id AND m.member_user_id = ? AND m.active = ? AND m.role IN ?))", actorID, model.ProjectStatusActive, actorID, true, []string{"editor", "reviewer", "viewer"})
	if projectID != "" {
		query = query.Where("project_reviews.project_id = ?", projectID)
	}
	if cursor != "" {
		query = query.Where("project_reviews.created_at < ? OR (project_reviews.created_at = ? AND project_reviews.id < ?)", before, before, cursor)
	}
	err := query.Order("project_reviews.created_at DESC, project_reviews.id DESC").Limit(limit + 1).Find(&rows).Error
	return rows, err
}
func (r *Repository) ProjectReviewComments(ownerID, projectID, reviewID string, before time.Time, cursor string, limit int) ([]model.ProjectReviewComment, error) {
	rows := []model.ProjectReviewComment{}
	query := r.db.Where("user_id = ? AND project_id = ? AND review_id = ?", ownerID, projectID, reviewID)
	if cursor != "" {
		query = query.Where("created_at < ? OR (created_at = ? AND id < ?)", before, before, cursor)
	}
	err := query.Order("created_at DESC, id DESC").Limit(limit + 1).Find(&rows).Error
	return rows, err
}
func (r *Repository) ProjectReviewComment(ownerID, projectID, reviewID, id string) (*model.ProjectReviewComment, error) {
	var row model.ProjectReviewComment
	err := r.db.Where("user_id = ? AND project_id = ? AND review_id = ? AND id = ?", ownerID, projectID, reviewID, id).Take(&row).Error
	return &row, err
}
func (r *Repository) CreateProjectReviewComment(row *model.ProjectReviewComment) error {
	return r.db.Create(row).Error
}
func (r *Repository) UpdateProjectReviewComment(row *model.ProjectReviewComment, expected int64) error {
	result := r.db.Model(&model.ProjectReviewComment{}).Where("id = ? AND user_id = ? AND project_id = ? AND review_id = ? AND revision = ?", row.ID, row.UserID, row.ProjectID, row.ReviewID, expected).Select("message", "blocking", "resolved", "assigned_user_id", "resolution_kind", "resolution_review_id", "resolution_note", "revision", "updated_at").Updates(row)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrProjectTimelineConflict
	}
	return nil
}
func (r *Repository) ProjectReviewOpenIssues(ownerID, projectID, reviewID string) (int64, error) {
	var count int64
	err := r.db.Model(&model.ProjectReviewComment{}).Where("user_id = ? AND project_id = ? AND review_id = ? AND blocking = ? AND resolved = ?", ownerID, projectID, reviewID, true, false).Count(&count).Error
	return count, err
}

func (r *Repository) ProjectReviewChildren(ownerID, projectID, reviewID string) ([]model.ProjectReview, error) {
	rows := []model.ProjectReview{}
	err := r.db.Where("user_id = ? AND project_id = ? AND parent_review_id = ?", ownerID, projectID, reviewID).Order("created_at DESC, id DESC").Find(&rows).Error
	return rows, err
}

func (r *Repository) RevokeProjectReviewShares(ownerID, projectID, reviewID string, now time.Time) error {
	return r.db.Model(&model.ProjectReviewShare{}).Where("user_id = ? AND project_id = ? AND review_id = ? AND active = ?", ownerID, projectID, reviewID, true).Updates(map[string]any{"active": false, "revision": gorm.Expr("revision + 1"), "updated_at": now}).Error
}
func (r *Repository) ProjectReviewReceipt(ownerID, projectID, actorKey, requestID string) (*model.ProjectReviewReceipt, error) {
	var row model.ProjectReviewReceipt
	err := r.db.Where("user_id = ? AND project_id = ? AND actor_key = ? AND request_id = ?", ownerID, projectID, actorKey, requestID).Take(&row).Error
	return &row, err
}
func (r *Repository) CreateProjectReviewReceipt(row *model.ProjectReviewReceipt) error {
	return r.db.Create(row).Error
}
func (r *Repository) ProjectReviewShare(id string) (*model.ProjectReviewShare, error) {
	var row model.ProjectReviewShare
	err := r.db.Where("id = ?", id).Take(&row).Error
	return &row, err
}
func (r *Repository) ProjectReviewShares(ownerID, projectID, reviewID string) ([]model.ProjectReviewShare, error) {
	rows := []model.ProjectReviewShare{}
	err := r.db.Where("user_id = ? AND project_id = ? AND review_id = ?", ownerID, projectID, reviewID).Order("created_at DESC, id DESC").Find(&rows).Error
	return rows, err
}
func (r *Repository) CreateProjectReviewShare(row *model.ProjectReviewShare) error {
	return r.db.Create(row).Error
}
func (r *Repository) UpdateProjectReviewShare(row *model.ProjectReviewShare, expected int64) error {
	result := r.db.Model(&model.ProjectReviewShare{}).Where("id = ? AND user_id = ? AND project_id = ? AND review_id = ? AND revision = ?", row.ID, row.UserID, row.ProjectID, row.ReviewID, expected).Select("active", "allow_comments", "expires_at", "revision", "updated_at").Updates(row)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrProjectTimelineConflict
	}
	return nil
}
func (r *Repository) ReviewShotArtifact(projectID, id string) (*model.ShotArtifact, error) {
	var row model.ShotArtifact
	err := r.db.Where("id = ? AND project_id = ?", id, projectID).Take(&row).Error
	return &row, err
}

func (r *Repository) LockProjectReviewResource(ownerID, id string) (*model.Resource, error) {
	var row model.Resource
	err := r.db.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND user_id = ?", id, ownerID).Take(&row).Error
	return &row, err
}
