package app

import (
	"encoding/json"
	"errors"
	"strings"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
	"yingce/backend/internal/repository"
)

type ProjectMemberView struct {
	model.ProjectMember
	Username string `json:"username"`
}
type ProjectReviewView struct {
	Review      model.ProjectReview     `json:"review"`
	Source      production.ReviewSource `json:"source"`
	Role        string                  `json:"role"`
	CanComment  bool                    `json:"canComment"`
	CanDecide   bool                    `json:"canDecide"`
	CanManage   bool                    `json:"canManage"`
	OpenIssues  int64                   `json:"openIssues"`
	NextReviews []model.ProjectReview   `json:"nextReviews"`
}
type ProjectReviewWriteResult struct {
	Kind          string                      `json:"kind"`
	Member        *ProjectMemberView          `json:"member,omitempty"`
	Review        *model.ProjectReview        `json:"review,omitempty"`
	Comment       *model.ProjectReviewComment `json:"comment,omitempty"`
	BeforeComment *model.ProjectReviewComment `json:"beforeComment,omitempty"`
	Note          string                      `json:"note,omitempty"`
	Share         *model.ProjectReviewShare   `json:"share,omitempty"`
	Replayed      bool                        `json:"replayed"`
}

func reviewConflict(message string) *AppError {
	err := NewAppError(409, message)
	err.Reason = "project_review_conflict"
	return err
}
func reviewMissing() *AppError {
	return NotFound("审片或项目不存在，或当前账号没有访问权限")
}

func projectReviewRole(r *repository.Repository, actor string, project *model.Project) (string, error) {
	if actor == "" {
		return "", reviewMissing()
	}
	user, err := r.User(actor)
	if errors.Is(err, gorm.ErrRecordNotFound) || err == nil && user.Status != model.UserStatusActive {
		return "", reviewMissing()
	}
	if err != nil {
		return "", err
	}
	if actor != project.UserID {
		owner, err := r.User(project.UserID)
		if errors.Is(err, gorm.ErrRecordNotFound) || err == nil && owner.Status != model.UserStatusActive {
			return "", reviewMissing()
		}
		if err != nil {
			return "", err
		}
	}
	if project.UserID == actor {
		return "owner", nil
	}
	if project.Status != model.ProjectStatusActive {
		return "", reviewMissing()
	}
	member, err := r.ProjectMember(project.UserID, project.ID, actor)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", reviewMissing()
	}
	if err != nil {
		return "", err
	}
	if !member.Active || member.Role != "editor" && member.Role != "reviewer" && member.Role != "viewer" {
		return "", reviewMissing()
	}
	return member.Role, nil
}
func (s *Service) projectReviewAccess(actor, projectID string) (*model.Project, string, error) {
	project, err := s.repo.ReviewProject(projectID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, "", reviewMissing()
	}
	if err != nil {
		return nil, "", err
	}
	role, err := projectReviewRole(s.repo, actor, project)
	return project, role, err
}
func requireReviewWrite(project *model.Project, role string, manage bool) error {
	if project.Status != model.ProjectStatusActive {
		return reviewConflict("项目已归档，请恢复项目后再修改审片")
	}
	if role == "owner" || !manage && (role == "editor" || role == "reviewer") {
		return nil
	}
	return NewAppError(403, "当前权限不能执行此审片操作，请联系项目所有者")
}
func reviewActorKey(userID string) string { return "user:" + userID }
func projectReviewReplay(r *repository.Repository, owner, project, actor, requestID, signature, kind string) (*ProjectReviewWriteResult, error) {
	row, err := r.ProjectReviewReceipt(owner, project, actor, requestID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if row.RequestSHA256 != signature || row.Kind != kind {
		return nil, reviewConflict("这个操作编号已用于其他内容，请核对原操作回执")
	}
	var result ProjectReviewWriteResult
	if json.Unmarshal([]byte(row.ResultJSON), &result) != nil || result.Kind != kind {
		return nil, NewAppError(500, "审片操作回执无法校验，请保留原编号并检查备份")
	}
	result.Replayed = true
	return &result, nil
}
func decodeReviewSource(row *model.ProjectReview) (production.ReviewSource, error) {
	var source production.ReviewSource
	if json.Unmarshal([]byte(row.SourceJSON), &source) != nil || source.Version != 1 || source.Kind != row.TargetKind || cutSignature(source) != row.TargetSHA256 || source.ResourceID != row.ResourceID || source.ResourceSHA256 != row.ResourceSHA256 || source.ResourceKind != row.ResourceKind || source.DurationMs != row.DurationMs {
		return source, NewAppError(500, "固定审片来源无法校验，请保留原版本并检查备份")
	}
	if _, err := production.ResolveReviewLocation(source, production.ReviewLocation{}); err != nil {
		return source, NewAppError(500, "固定审片的时间范围无效，请检查原始记录")
	}
	return source, nil
}
func (s *Service) ownedReviewForActor(actor, projectID, reviewID string) (*model.Project, *model.ProjectReview, string, error) {
	project, role, err := s.projectReviewAccess(actor, projectID)
	if err != nil {
		return nil, nil, "", err
	}
	row, err := s.repo.ProjectReview(project.UserID, projectID, reviewID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil, "", reviewMissing()
	}
	if err != nil {
		return nil, nil, "", err
	}
	return project, row, role, nil
}
func validReviewText(value string, max int) bool {
	return strings.TrimSpace(value) != "" && len([]rune(value)) <= max && !strings.ContainsRune(value, 0)
}
