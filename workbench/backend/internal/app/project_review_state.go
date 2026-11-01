package app

import (
	"encoding/json"
	"strings"
	"time"

	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

type ProjectReviewStateRequest struct {
	RequestID        string  `json:"requestId"`
	ExpectedRevision int64   `json:"expectedRevision"`
	Title            *string `json:"title,omitempty"`
	Status           *string `json:"status,omitempty"`
	Archived         *bool   `json:"archived,omitempty"`
	Note             string  `json:"note,omitempty"`
}

func (s *Service) SetProjectReviewState(actor, projectID, id string, input ProjectReviewStateRequest) (ProjectReviewWriteResult, error) {
	var result ProjectReviewWriteResult
	changes := 0
	for _, present := range []bool{input.Title != nil, input.Status != nil, input.Archived != nil} {
		if present {
			changes++
		}
	}
	input.Note = strings.TrimSpace(input.Note)
	if !validCutRequestID(input.RequestID) || input.ExpectedRevision < 1 || changes != 1 || len([]rune(input.Note)) > 2000 || strings.ContainsRune(input.Note, 0) {
		return result, BadAuthRequest("请提交一项明确的审片状态修改和当前版本")
	}
	if input.Title != nil && !validReviewText(strings.TrimSpace(*input.Title), 240) {
		return result, BadAuthRequest("审片名称不能为空或超过240字")
	}
	if input.Status != nil && *input.Status != "in_review" && *input.Status != "changes_requested" && *input.Status != "approved" {
		return result, BadAuthRequest("审片状态无效")
	}
	if input.Status != nil && *input.Status == "changes_requested" && input.Note == "" {
		return result, BadAuthRequest("请说明需要修改的原因，或先添加具体时间点的问题")
	}
	project, review, role, err := s.ownedReviewForActor(actor, projectID, id)
	if err != nil {
		return result, err
	}
	if err = requireReviewWrite(project, role, input.Status == nil); err != nil {
		return result, err
	}
	signature := cutSignature(struct {
		Kind, Review string
		Request      ProjectReviewStateRequest
	}{"review-state", id, input})
	actorKey := reviewActorKey(actor)
	if prior, err := projectReviewReplay(s.repo, project.UserID, projectID, actorKey, input.RequestID, signature, "review-state"); err != nil || prior != nil {
		if prior != nil {
			return *prior, nil
		}
		return result, err
	}
	if review.Revision != input.ExpectedRevision {
		return result, reviewConflict("审片已有新意见或状态，请保留输入并重新读取")
	}
	if review.Archived && input.Status != nil {
		return result, reviewConflict("请先恢复此审片，再更新审片结论")
	}
	row := *review
	if input.Title != nil {
		row.Title = strings.TrimSpace(*input.Title)
	}
	if input.Status != nil {
		row.Status = *input.Status
	}
	if input.Archived != nil {
		row.Archived = *input.Archived
	}
	now := time.Now()
	row.Revision++
	row.UpdatedAt = now
	result = ProjectReviewWriteResult{Kind: "review-state", Review: &row, Note: input.Note}
	// A change request must be visible and actionable to the whole review, not
	// hidden solely in the actor's private idempotency receipt.
	if input.Status != nil && input.Note != "" {
		user, err := s.repo.User(actor)
		if err != nil {
			return ProjectReviewWriteResult{}, err
		}
		result.Comment = &model.ProjectReviewComment{ID: mediaAnalysisID("review-comment-v1", projectID, actorKey, input.RequestID), UserID: project.UserID, ProjectID: projectID, ReviewID: id, AuthorUserID: actor, AuthorName: user.Username, Message: input.Note, Blocking: *input.Status == "changes_requested", Resolved: *input.Status == "approved", Revision: 1, CreatedAt: now, UpdatedAt: now}
		if result.Comment.Resolved {
			result.Comment.ResolutionKind = "acknowledged"
		}
	}
	raw, _ := json.Marshal(result)
	receipt := model.ProjectReviewReceipt{ID: mediaAnalysisID("review-write-v1", projectID, actorKey, input.RequestID), UserID: project.UserID, ProjectID: projectID, ActorKey: actorKey, RequestID: input.RequestID, RequestSHA256: signature, Kind: result.Kind, ReviewID: id, ResultJSON: string(raw), CreatedAt: now}
	additional := int64(len(raw) + len(row.Title) - len(review.Title))
	if result.Comment != nil {
		additional += int64(len(result.Comment.Message) + len(result.Comment.AuthorName))
	}
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	if err = s.validateProductionDocumentStorage(project.UserID, additional); err != nil {
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
		if err = requireReviewWrite(current, role, input.Status == nil); err != nil {
			return err
		}
		live, err := r.ProjectReview(project.UserID, projectID, id)
		if err != nil {
			return err
		}
		if live.Revision != input.ExpectedRevision || live.Archived && input.Status != nil {
			return reviewConflict("审片已有新的意见或状态，本次未覆盖")
		}
		if _, err = decodeReviewSource(live); err != nil {
			return err
		}
		if input.Status != nil && *input.Status == "approved" {
			issues, err := r.ProjectReviewOpenIssues(project.UserID, projectID, id)
			if err != nil {
				return err
			}
			if issues > 0 {
				issue := reviewConflict("还有需要修改的问题未处理，请先核对修复版本或说明不采纳原因")
				issue.Reason = "project_review_open_issues"
				issue.Details = map[string]any{"openIssues": issues}
				return issue
			}
			children, err := r.ProjectReviewChildren(project.UserID, projectID, id)
			if err != nil {
				return err
			}
			if len(children) > 0 {
				return reviewConflict("这轮审片已有后续版本，请在对应的新一轮审片中确认结果")
			}
		}
		if input.Archived != nil && *input.Archived {
			if err = r.RevokeProjectReviewShares(project.UserID, projectID, id, now); err != nil {
				return err
			}
		}
		if result.Comment != nil {
			if err = r.CreateProjectReviewComment(result.Comment); err != nil {
				return err
			}
		}
		if err = r.UpdateProjectReview(&row, input.ExpectedRevision); err != nil {
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
