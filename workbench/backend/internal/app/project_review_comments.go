package app

import (
	"encoding/json"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
	"yingce/backend/internal/repository"
)

type ProjectReviewCommentRequest struct {
	RequestID    string                    `json:"requestId"`
	TargetSHA256 string                    `json:"targetSha256"`
	Location     production.ReviewLocation `json:"location"`
	Message      string                    `json:"message"`
	Blocking     bool                      `json:"blocking"`
}
type ProjectReviewCommentPatch struct {
	RequestID          string  `json:"requestId"`
	ExpectedRevision   int64   `json:"expectedRevision"`
	TargetSHA256       string  `json:"targetSha256"`
	Message            *string `json:"message,omitempty"`
	Blocking           *bool   `json:"blocking,omitempty"`
	Resolved           *bool   `json:"resolved,omitempty"`
	AssignedUserID     *string `json:"assignedUserId,omitempty"`
	ResolutionKind     string  `json:"resolutionKind,omitempty"`
	ResolutionReviewID string  `json:"resolutionReviewId,omitempty"`
	ResolutionNote     string  `json:"resolutionNote,omitempty"`
}
type ProjectReviewCommentPage struct {
	Comments   []model.ProjectReviewComment `json:"comments"`
	NextCursor string                       `json:"nextCursor,omitempty"`
}

func (s *Service) ListProjectReviewComments(actor, projectID, reviewID, cursor string, limit int) (ProjectReviewCommentPage, error) {
	result := ProjectReviewCommentPage{Comments: []model.ProjectReviewComment{}}
	if limit < 1 || limit > 50 || len(cursor) > 36 {
		return result, BadAuthRequest("意见分页参数无效")
	}
	project, _, _, err := s.ownedReviewForActor(actor, projectID, reviewID)
	if err != nil {
		return result, err
	}
	before := time.Time{}
	if cursor != "" {
		row, err := s.repo.ProjectReviewComment(project.UserID, projectID, reviewID, cursor)
		if err != nil {
			return result, BadAuthRequest("意见分页不属于当前审片")
		}
		before = row.CreatedAt
	}
	rows, err := s.repo.ProjectReviewComments(project.UserID, projectID, reviewID, before, cursor, limit)
	if err != nil {
		return result, err
	}
	if len(rows) > limit {
		rows = rows[:limit]
		result.NextCursor = rows[len(rows)-1].ID
	}
	result.Comments = rows
	return result, nil
}

func (s *Service) AddProjectReviewComment(actor, projectID, reviewID string, input ProjectReviewCommentRequest) (ProjectReviewWriteResult, error) {
	var result ProjectReviewWriteResult
	input.Message = strings.TrimSpace(input.Message)
	if !validCutRequestID(input.RequestID) || !validReviewText(input.Message, 4000) || len(input.TargetSHA256) != 64 {
		return result, BadAuthRequest("请填写意见并核对固定审片版本")
	}
	project, review, role, err := s.ownedReviewForActor(actor, projectID, reviewID)
	if err != nil {
		return result, err
	}
	if err = requireReviewWrite(project, role, false); err != nil {
		return result, err
	}
	signature := cutSignature(struct {
		Kind, Review string
		Request      ProjectReviewCommentRequest
	}{"review-comment-create", reviewID, input})
	actorKey := reviewActorKey(actor)
	if prior, err := projectReviewReplay(s.repo, project.UserID, projectID, actorKey, input.RequestID, signature, "review-comment-create"); err != nil || prior != nil {
		if prior != nil {
			return *prior, nil
		}
		return result, err
	}
	if review.Archived || review.TargetSHA256 != input.TargetSHA256 {
		return result, reviewConflict("审片已归档或来源不匹配，请重新核对当前这一个版本")
	}
	source, err := decodeReviewSource(review)
	if err != nil {
		return result, err
	}
	if _, err = production.ResolveReviewLocation(source, input.Location); err != nil {
		return result, BadAuthRequest(err.Error())
	}
	user, err := s.repo.User(actor)
	if err != nil {
		return result, err
	}
	now := time.Now()
	comment := model.ProjectReviewComment{ID: mediaAnalysisID("review-comment-v1", projectID, actorKey, input.RequestID), UserID: project.UserID, ProjectID: projectID, ReviewID: reviewID, AuthorUserID: actor, AuthorName: user.Username, TimeMs: input.Location.TimeMs, EndMs: input.Location.EndMs, ClipID: input.Location.ClipID, Message: input.Message, Blocking: input.Blocking, Revision: 1, CreatedAt: now, UpdatedAt: now}
	result = ProjectReviewWriteResult{Kind: "review-comment-create", Comment: &comment}
	raw, _ := json.Marshal(result)
	receipt := model.ProjectReviewReceipt{ID: mediaAnalysisID("review-write-v1", projectID, actorKey, input.RequestID), UserID: project.UserID, ProjectID: projectID, ActorKey: actorKey, RequestID: input.RequestID, RequestSHA256: signature, Kind: result.Kind, ReviewID: reviewID, ResultJSON: string(raw), CreatedAt: now}
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	if err = s.validateProductionDocumentStorage(project.UserID, int64(len(raw)+len(comment.Message)+len(comment.AuthorName))); err != nil {
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
		live, err := r.ProjectReview(project.UserID, projectID, reviewID)
		if err != nil {
			return err
		}
		if live.Archived || live.TargetSHA256 != input.TargetSHA256 {
			return reviewConflict("审片来源或状态已变化，请重新核对")
		}
		if _, err = decodeReviewSource(live); err != nil {
			return err
		}
		previous := live.Revision
		live.Revision++
		live.UpdatedAt = now
		if input.Blocking {
			live.Status = "changes_requested"
		}
		if err = r.CreateProjectReviewComment(&comment); err != nil {
			return err
		}
		if err = r.UpdateProjectReview(live, previous); err != nil {
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

func verifyReviewResolution(r *repository.Repository, project *model.Project, review *model.ProjectReview, comment *model.ProjectReviewComment, input ProjectReviewCommentPatch) error {
	if input.Resolved == nil {
		if input.ResolutionKind != "" || input.ResolutionReviewID != "" || input.ResolutionNote != "" {
			return BadAuthRequest("处理说明必须对应明确的意见状态操作")
		}
		return nil
	}
	if !*input.Resolved {
		if input.ResolutionKind != "" || input.ResolutionReviewID != "" || input.ResolutionNote != "" {
			return BadAuthRequest("重新打开意见时不应提交新的处理结论")
		}
		comment.ResolutionKind = ""
		comment.ResolutionReviewID = ""
		comment.ResolutionNote = ""
		return nil
	}
	if len([]rune(input.ResolutionNote)) > 2000 || strings.ContainsRune(input.ResolutionNote, 0) || len(input.ResolutionReviewID) > 36 {
		return BadAuthRequest("处理说明或修复版本编号无效")
	}
	switch input.ResolutionKind {
	case "dismissed":
		if !validReviewText(input.ResolutionNote, 2000) || input.ResolutionReviewID != "" {
			return BadAuthRequest("不采纳意见时请说明原因，不要关联另一种处理结论")
		}
	case "acknowledged":
		if comment.Blocking || input.ResolutionReviewID != "" {
			return BadAuthRequest("需要修改的问题不能仅标记为已阅，请关联修复版本或说明不采纳原因")
		}
	case "fixed":
		if input.ResolutionReviewID == "" || input.ResolutionReviewID == review.ID {
			return BadAuthRequest("请关联实际提交的新一轮审片")
		}
		fixed, err := r.ProjectReview(project.UserID, project.ID, input.ResolutionReviewID)
		if err != nil {
			return reviewMissing()
		}
		if fixed.Archived || fixed.TargetKind != review.TargetKind || fixed.ResourceSHA256 == review.ResourceSHA256 {
			return BadAuthRequest("请选择内容已经变化且可用的新版本；不改原片时可明确说明不采纳原因")
		}
		found := false
		parent := fixed.ParentReviewID
		seen := map[string]bool{}
		for parent != "" && len(seen) < 256 {
			if parent == review.ID {
				found = true
				break
			}
			if seen[parent] {
				break
			}
			seen[parent] = true
			row, err := r.ProjectReview(project.UserID, project.ID, parent)
			if err != nil {
				return reviewMissing()
			}
			parent = row.ParentReviewID
		}
		if !found {
			return BadAuthRequest("修复版本没有关联到本轮审片，请先正确关联复审来源")
		}
	default:
		return BadAuthRequest("请选择修复并复审、不采纳并说明原因，或建议已阅")
	}
	comment.ResolutionKind = input.ResolutionKind
	comment.ResolutionReviewID = input.ResolutionReviewID
	comment.ResolutionNote = strings.TrimSpace(input.ResolutionNote)
	return nil
}

func (s *Service) PatchProjectReviewComment(actor, projectID, reviewID, id string, input ProjectReviewCommentPatch) (ProjectReviewWriteResult, error) {
	var result ProjectReviewWriteResult
	if !validCutRequestID(input.RequestID) || input.ExpectedRevision < 1 || len(input.TargetSHA256) != 64 || input.Message == nil && input.Blocking == nil && input.Resolved == nil && input.AssignedUserID == nil {
		return result, BadAuthRequest("请提供明确的意见修改与当前版本")
	}
	project, review, role, err := s.ownedReviewForActor(actor, projectID, reviewID)
	if err != nil {
		return result, err
	}
	if err = requireReviewWrite(project, role, false); err != nil {
		return result, err
	}
	signature := cutSignature(struct {
		Kind, Review, Comment string
		Request               ProjectReviewCommentPatch
	}{"review-comment-update", reviewID, id, input})
	actorKey := reviewActorKey(actor)
	if prior, err := projectReviewReplay(s.repo, project.UserID, projectID, actorKey, input.RequestID, signature, "review-comment-update"); err != nil || prior != nil {
		if prior != nil {
			return *prior, nil
		}
		return result, err
	}
	if review.Archived || review.TargetSHA256 != input.TargetSHA256 {
		return result, reviewConflict("请重新核对这个固定审片版本")
	}
	before, err := s.repo.ProjectReviewComment(project.UserID, projectID, reviewID, id)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return result, NotFound("意见不存在或不属于这个审片")
	}
	if err != nil {
		return result, err
	}
	if before.Revision != input.ExpectedRevision {
		return result, reviewConflict("意见已被更新，请保留输入并重新读取")
	}
	row := *before
	if input.Message != nil {
		if row.AuthorUserID != actor {
			return result, NewAppError(403, "只能修改本人提交的意见文字")
		}
		row.Message = strings.TrimSpace(*input.Message)
		if !validReviewText(row.Message, 4000) {
			return result, BadAuthRequest("意见文字不能为空或超过4000字")
		}
	}
	if input.Blocking != nil {
		row.Blocking = *input.Blocking
	}
	if row.Message != before.Message && before.Resolved || row.Blocking && row.Resolved && row.ResolutionKind == "acknowledged" {
		if input.Resolved != nil && *input.Resolved {
			return result, BadAuthRequest("意见内容或问题级别已改变，请先重新打开，再核对新的处理结论")
		}
		row.Resolved = false
		row.ResolutionKind = ""
		row.ResolutionReviewID = ""
		row.ResolutionNote = ""
	}
	if input.AssignedUserID != nil {
		row.AssignedUserID = strings.TrimSpace(*input.AssignedUserID)
		if len(row.AssignedUserID) > 36 {
			return result, BadAuthRequest("指派账号无效")
		}
		if role != "owner" && role != "editor" && row.AssignedUserID != actor && !(row.AssignedUserID == "" && before.AssignedUserID == actor) {
			return result, NewAppError(403, "审片者可以认领意见；指派他人请联系项目所有者或制作协作者")
		}
	}
	if err = verifyReviewResolution(s.repo, project, review, &row, input); err != nil {
		return result, err
	}
	if input.Resolved != nil {
		row.Resolved = *input.Resolved
	}
	now := time.Now()
	row.Revision++
	row.UpdatedAt = now
	result = ProjectReviewWriteResult{Kind: "review-comment-update", Comment: &row, BeforeComment: before}
	raw, _ := json.Marshal(result)
	receipt := model.ProjectReviewReceipt{ID: mediaAnalysisID("review-write-v1", projectID, actorKey, input.RequestID), UserID: project.UserID, ProjectID: projectID, ActorKey: actorKey, RequestID: input.RequestID, RequestSHA256: signature, Kind: result.Kind, ReviewID: reviewID, ResultJSON: string(raw), CreatedAt: now}
	additional := int64(len(raw) + len(row.Message) - len(before.Message) + len(row.ResolutionNote) - len(before.ResolutionNote))
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	if err = s.validateProductionDocumentStorage(project.UserID, additional); err != nil {
		return ProjectReviewWriteResult{}, err
	}
	err = s.repo.ProjectReviewTransaction(projectID, func(r *repository.Repository, current *model.Project) error {
		if current.UserID != project.UserID {
			return reviewMissing()
		}
		currentRole, err := projectReviewRole(r, actor, current)
		if err != nil {
			return err
		}
		if err = requireReviewWrite(current, currentRole, false); err != nil {
			return err
		}
		live, err := r.ProjectReview(project.UserID, projectID, reviewID)
		if err != nil {
			return err
		}
		if live.Archived || live.TargetSHA256 != input.TargetSHA256 {
			return reviewConflict("审片状态已变化，请重新核对")
		}
		if _, err = decodeReviewSource(live); err != nil {
			return err
		}
		prior, err := r.ProjectReviewComment(project.UserID, projectID, reviewID, id)
		if err != nil {
			return err
		}
		if prior.Revision != input.ExpectedRevision {
			return reviewConflict("意见已更新，本次未覆盖其他人的修改")
		}
		if input.AssignedUserID != nil {
			if currentRole != "owner" && currentRole != "editor" && row.AssignedUserID != actor && !(row.AssignedUserID == "" && prior.AssignedUserID == actor) {
				return NewAppError(403, "当前权限不能指派其他协作者")
			}
			if row.AssignedUserID != "" {
				targetRole, err := projectReviewRole(r, row.AssignedUserID, current)
				if err != nil {
					return BadAuthRequest("被指派账号已停用或不再有项目权限")
				}
				if targetRole == "viewer" {
					return BadAuthRequest("只读查看者不能被指派处理意见")
				}
			}
		}
		check := row
		if err = verifyReviewResolution(r, current, live, &check, input); err != nil {
			return err
		}
		revision := live.Revision
		live.Revision++
		live.UpdatedAt = now
		if row.Blocking && !row.Resolved {
			live.Status = "changes_requested"
		}
		if err = r.UpdateProjectReviewComment(&row, input.ExpectedRevision); err != nil {
			return err
		}
		if err = r.UpdateProjectReview(live, revision); err != nil {
			return err
		}
		return r.CreateProjectReviewReceipt(&receipt)
	})
	if err != nil {
		if prior, lookup := projectReviewReplay(s.repo, project.UserID, projectID, actorKey, input.RequestID, signature, result.Kind); lookup == nil && prior != nil {
			return *prior, nil
		}
		if errors.Is(err, repository.ErrProjectTimelineConflict) {
			return ProjectReviewWriteResult{}, reviewConflict("意见已变化，请重新读取后确认")
		}
		return ProjectReviewWriteResult{}, err
	}
	return result, nil
}
