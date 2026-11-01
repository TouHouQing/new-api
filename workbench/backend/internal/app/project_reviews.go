package app

import (
	"encoding/json"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

type ProjectReviewCreateRequest struct {
	RequestID      string                     `json:"requestId"`
	Title          string                     `json:"title"`
	ParentReviewID string                     `json:"parentReviewId,omitempty"`
	Target         ProjectReviewTargetRequest `json:"target"`
}
type ProjectReviewPage struct {
	Reviews    []model.ProjectReview `json:"reviews"`
	NextCursor string                `json:"nextCursor,omitempty"`
}

func (s *Service) GetProjectReview(actor, projectID, id string) (ProjectReviewView, error) {
	var result ProjectReviewView
	project, row, role, err := s.ownedReviewForActor(actor, projectID, id)
	if err != nil {
		return result, err
	}
	source, err := decodeReviewSource(row)
	if err != nil {
		return result, err
	}
	issues, err := s.repo.ProjectReviewOpenIssues(project.UserID, projectID, id)
	if err != nil {
		return result, err
	}
	children, err := s.repo.ProjectReviewChildren(project.UserID, projectID, id)
	if err != nil {
		return result, err
	}
	return ProjectReviewView{Review: *row, Source: source, Role: role, CanComment: !row.Archived && project.Status == model.ProjectStatusActive && role != "viewer", CanDecide: !row.Archived && project.Status == model.ProjectStatusActive && role != "viewer" && len(children) == 0, CanManage: project.Status == model.ProjectStatusActive && role == "owner", OpenIssues: issues, NextReviews: children}, nil
}
func (s *Service) ReadProjectReview(actor, id string) (ProjectReviewView, error) {
	row, err := s.repo.ProjectReviewIdentity(id)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ProjectReviewView{}, reviewMissing()
	}
	if err != nil {
		return ProjectReviewView{}, err
	}
	return s.GetProjectReview(actor, row.ProjectID, id)
}
func (s *Service) ListProjectReviews(actor, projectID, cursor string, archived bool, limit int) (ProjectReviewPage, error) {
	result := ProjectReviewPage{Reviews: []model.ProjectReview{}}
	if limit < 1 || limit > 50 || len(cursor) > 36 {
		return result, BadAuthRequest("审片分页参数无效")
	}
	if projectID != "" {
		if _, _, err := s.projectReviewAccess(actor, projectID); err != nil {
			return result, err
		}
	} else {
		user, err := s.repo.User(actor)
		if err != nil || user.Status != model.UserStatusActive {
			return result, reviewMissing()
		}
	}
	before := time.Time{}
	if cursor != "" {
		view, err := s.ReadProjectReview(actor, cursor)
		if err != nil || projectID != "" && view.Review.ProjectID != projectID || view.Review.Archived != archived {
			return result, BadAuthRequest("审片分页已变化，请重新读取列表")
		}
		before = view.Review.CreatedAt
	}
	rows, err := s.repo.ProjectReviewPage(actor, projectID, archived, before, cursor, limit)
	if err != nil {
		return result, err
	}
	if len(rows) > limit {
		rows = rows[:limit]
		result.NextCursor = rows[len(rows)-1].ID
	}
	result.Reviews = rows
	return result, nil
}
func (s *Service) ReadProjectReviewResult(actor, projectID, requestID string) (ProjectReviewWriteResult, error) {
	var result ProjectReviewWriteResult
	if !validCutRequestID(requestID) {
		return result, BadAuthRequest("审片操作编号无效")
	}
	project, _, err := s.projectReviewAccess(actor, projectID)
	if err != nil {
		return result, err
	}
	row, err := s.repo.ProjectReviewReceipt(project.UserID, projectID, reviewActorKey(actor), requestID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return result, NotFound("此操作编号尚无完成回执，请保留原编号核对")
	}
	if err != nil {
		return result, err
	}
	if json.Unmarshal([]byte(row.ResultJSON), &result) != nil || result.Kind != row.Kind {
		return result, NewAppError(500, "审片操作回执无法读取，请检查备份")
	}
	result.Replayed = true
	return result, nil
}

func (s *Service) CreateProjectReview(actor, projectID string, input ProjectReviewCreateRequest) (ProjectReviewWriteResult, error) {
	var result ProjectReviewWriteResult
	input.Title = strings.TrimSpace(input.Title)
	if !validCutRequestID(input.RequestID) || !validReviewText(input.Title, 240) || len(input.ParentReviewID) > 36 || !validReviewTarget(input.Target) {
		return result, BadAuthRequest("请填写审片名称并选择一个明确的原片版本")
	}
	if input.Target.Kind == "snapshot" && input.ParentReviewID != input.Target.ReviewID {
		return result, BadAuthRequest("重新审同一原片时，请关联其上一轮审片")
	}
	project, role, err := s.projectReviewAccess(actor, projectID)
	if err != nil {
		return result, err
	}
	if err = requireReviewWrite(project, role, false); err != nil {
		return result, err
	}
	if role != "owner" && role != "editor" {
		return result, NewAppError(403, "只有项目所有者或制作协作者可以发起新的审片")
	}
	signature := cutSignature(struct {
		Kind    string
		Request ProjectReviewCreateRequest
	}{"review-create", input})
	actorKey := reviewActorKey(actor)
	if prior, err := projectReviewReplay(s.repo, project.UserID, projectID, actorKey, input.RequestID, signature, "review-create"); err != nil || prior != nil {
		if prior != nil {
			return *prior, nil
		}
		return result, err
	}
	if input.ParentReviewID != "" {
		parent, err := s.repo.ProjectReview(project.UserID, projectID, input.ParentReviewID)
		if err != nil {
			return result, reviewMissing()
		}
		if input.Target.Kind != "snapshot" && parent.TargetKind != input.Target.Kind {
			return result, BadAuthRequest("复审应关联同一类原片，请重新选择上一轮审片")
		}
	}
	source, resource, err := s.projectReviewSource(project.UserID, projectID, input.Target)
	if err != nil {
		return result, err
	}
	if input.ParentReviewID != "" {
		parent, err := s.repo.ProjectReview(project.UserID, projectID, input.ParentReviewID)
		if err != nil {
			return result, reviewMissing()
		}
		previous, err := decodeReviewSource(parent)
		if err != nil {
			return result, err
		}
		if previous.ResourceKind != source.ResourceKind || source.Kind == "asset" && previous.AssetID != source.AssetID || source.Kind == "artifact" && previous.ShotID != source.ShotID {
			return result, BadAuthRequest("复审应关联同一类原片中的同一角色资产或镜头，请核对上一轮审片")
		}
	}
	encoded, _ := json.Marshal(source)
	now := time.Now()
	row := model.ProjectReview{ID: mediaAnalysisID("project-review-v1", projectID, actorKey, input.RequestID), UserID: project.UserID, ProjectID: projectID, Title: input.Title, TargetKind: source.Kind, ParentReviewID: input.ParentReviewID, TargetSHA256: cutSignature(source), SourceJSON: string(encoded), ResourceID: source.ResourceID, ResourceSHA256: source.ResourceSHA256, ResourceKind: source.ResourceKind, DurationMs: source.DurationMs, Width: resource.Width, Height: resource.Height, Status: "in_review", Revision: 1, CreatedBy: actor, CreatedAt: now, UpdatedAt: now}
	result = ProjectReviewWriteResult{Kind: "review-create", Review: &row}
	raw, _ := json.Marshal(result)
	receipt := model.ProjectReviewReceipt{ID: mediaAnalysisID("review-write-v1", projectID, actorKey, input.RequestID), UserID: project.UserID, ProjectID: projectID, ActorKey: actorKey, RequestID: input.RequestID, RequestSHA256: signature, Kind: result.Kind, ReviewID: row.ID, ResultJSON: string(raw), CreatedAt: now}
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	if err = s.validateProductionDocumentStorage(project.UserID, int64(len(encoded)+len(raw)+len(row.Title))); err != nil {
		return ProjectReviewWriteResult{}, err
	}
	err = s.repo.ProjectReviewTransaction(projectID, func(r *repository.Repository, current *model.Project) error {
		if current.UserID != project.UserID {
			return reviewMissing()
		}
		role, err := projectReviewRole(r, actor, current)
		if err != nil {
			return err
		}
		if err = requireReviewWrite(current, role, false); err != nil {
			return err
		}
		if role != "owner" && role != "editor" {
			return NewAppError(403, "当前权限不能发起审片")
		}
		if input.ParentReviewID != "" {
			parent, err := r.ProjectReview(project.UserID, projectID, input.ParentReviewID)
			if err != nil {
				return err
			}
			if parent.TargetKind != source.Kind {
				return reviewConflict("上一轮审片来源已变化，请重新选择")
			}
		}
		if err = verifyReviewSourceIdentity(r, project.UserID, projectID, source, resource); err != nil {
			return err
		}
		if err = r.CreateProjectReview(&row); err != nil {
			return err
		}
		return r.CreateProjectReviewReceipt(&receipt)
	})
	if err != nil {
		if prior, lookup := projectReviewReplay(s.repo, project.UserID, projectID, actorKey, input.RequestID, signature, result.Kind); lookup == nil && prior != nil {
			return *prior, nil
		}
		return ProjectReviewWriteResult{}, err
	}
	return result, nil
}
