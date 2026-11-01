package app

import (
	"encoding/json"
	"errors"
	"gorm.io/gorm"
	"strings"
	"time"
	"yingce/backend/internal/kernel"

	"yingce/backend/internal/assets"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
	"yingce/backend/internal/repository"
)

type PublicReviewClip struct {
	ID         string `json:"id"`
	Title      string `json:"title"`
	StartMs    int64  `json:"startMs"`
	DurationMs int64  `json:"durationMs"`
}

func (s *Service) activeReviewShare(id, token string) (*model.ProjectReviewShare, *model.Project, *model.ProjectReview, error) {
	share, project, review, err := activeReviewShare(s.repo, id, token)
	if err == nil {
		err = s.workbenchOwnerAvailable(project.UserID)
	}
	return share, project, review, err
}

type PublicProjectReview struct {
	ID             string             `json:"id"`
	Title          string             `json:"title"`
	ProjectName    string             `json:"projectName"`
	TargetSHA256   string             `json:"targetSha256"`
	ResourceSHA256 string             `json:"resourceSha256"`
	ResourceKind   string             `json:"resourceKind"`
	DurationMs     int64              `json:"durationMs"`
	Status         string             `json:"status"`
	AllowComments  bool               `json:"allowComments"`
	ExpiresAt      time.Time          `json:"expiresAt"`
	Clips          []PublicReviewClip `json:"clips"`
}
type PublicReviewComment struct {
	ID             string    `json:"id"`
	AuthorName     string    `json:"authorName"`
	Guest          bool      `json:"guest"`
	TimeMs         *int64    `json:"timeMs,omitempty"`
	EndMs          *int64    `json:"endMs,omitempty"`
	ClipID         string    `json:"clipId,omitempty"`
	Message        string    `json:"message"`
	Resolved       bool      `json:"resolved"`
	ResolutionKind string    `json:"resolutionKind,omitempty"`
	CreatedAt      time.Time `json:"createdAt"`
}
type PublicReviewCommentPage struct {
	Comments   []PublicReviewComment `json:"comments"`
	NextCursor string                `json:"nextCursor,omitempty"`
}
type PublicReviewCommentRequest struct {
	RequestID    string                    `json:"requestId"`
	TargetSHA256 string                    `json:"targetSha256"`
	AuthorName   string                    `json:"authorName"`
	Message      string                    `json:"message"`
	Location     production.ReviewLocation `json:"location"`
}

func publicReviewComment(row model.ProjectReviewComment) PublicReviewComment {
	return PublicReviewComment{ID: row.ID, AuthorName: row.AuthorName, Guest: row.AuthorUserID == "", TimeMs: row.TimeMs, EndMs: row.EndMs, ClipID: row.ClipID, Message: row.Message, Resolved: row.Resolved, ResolutionKind: row.ResolutionKind, CreatedAt: row.CreatedAt}
}

func (s *Service) ReadPublicReviewCommentResult(id, token, requestID string) (PublicReviewComment, error) {
	var result PublicReviewComment
	if !validCutRequestID(requestID) {
		return result, BadAuthRequest("留言操作编号无效")
	}
	_, project, review, err := s.activeReviewShare(id, token)
	if err != nil {
		return result, err
	}
	row, err := s.repo.ProjectReviewReceipt(project.UserID, project.ID, "share:"+id, requestID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return result, NotFound("此操作尚无完成回执，请保留原编号")
	}
	if err != nil {
		return result, err
	}
	var write ProjectReviewWriteResult
	if row.Kind != "review-guest-comment" || row.ReviewID != review.ID || json.Unmarshal([]byte(row.ResultJSON), &write) != nil || write.Comment == nil || write.Comment.ReviewID != review.ID {
		return result, NewAppError(500, "访客留言回执无法校验，请联系项目所有者检查")
	}
	comment, err := s.repo.ProjectReviewComment(project.UserID, project.ID, review.ID, write.Comment.ID)
	if err != nil {
		return result, err
	}
	if comment.ShareID != id {
		return result, reviewMissing()
	}
	return publicReviewComment(*comment), nil
}
func (s *Service) PublicProjectReview(id, token string) (PublicProjectReview, error) {
	var result PublicProjectReview
	share, project, review, err := s.activeReviewShare(id, token)
	if err != nil {
		return result, err
	}
	source, err := decodeReviewSource(review)
	if err != nil {
		return result, err
	}
	result = PublicProjectReview{ID: review.ID, Title: review.Title, ProjectName: project.Name, TargetSHA256: review.TargetSHA256, ResourceSHA256: review.ResourceSHA256, ResourceKind: review.ResourceKind, DurationMs: review.DurationMs, Status: review.Status, AllowComments: share.AllowComments, ExpiresAt: share.ExpiresAt, Clips: []PublicReviewClip{}}
	for _, clip := range source.Clips {
		result.Clips = append(result.Clips, PublicReviewClip{ID: clip.ID, Title: clip.Title, StartMs: clip.StartMs, DurationMs: clip.DurationMs})
	}
	return result, nil
}
func (s *Service) ListPublicReviewComments(id, token, cursor string, limit int) (PublicReviewCommentPage, error) {
	result := PublicReviewCommentPage{Comments: []PublicReviewComment{}}
	if limit < 1 || limit > 50 || len(cursor) > 36 {
		return result, BadAuthRequest("意见分页参数无效")
	}
	_, project, review, err := s.activeReviewShare(id, token)
	if err != nil {
		return result, err
	}
	before := time.Time{}
	if cursor != "" {
		row, err := s.repo.ProjectReviewComment(project.UserID, project.ID, review.ID, cursor)
		if err != nil {
			return result, BadAuthRequest("意见分页不属于这个审片")
		}
		before = row.CreatedAt
	}
	rows, err := s.repo.ProjectReviewComments(project.UserID, project.ID, review.ID, before, cursor, limit)
	if err != nil {
		return result, err
	}
	if len(rows) > limit {
		rows = rows[:limit]
		result.NextCursor = rows[len(rows)-1].ID
	}
	for _, row := range rows {
		result.Comments = append(result.Comments, publicReviewComment(row))
	}
	return result, nil
}
func (s *Service) AddPublicReviewComment(id, token string, input PublicReviewCommentRequest) (PublicReviewComment, error) {
	var result PublicReviewComment
	input.Message = strings.TrimSpace(input.Message)
	input.AuthorName = strings.TrimSpace(input.AuthorName)
	if !validCutRequestID(input.RequestID) || !validReviewText(input.Message, 4000) || !validReviewText(input.AuthorName, 80) || len(input.TargetSHA256) != 64 {
		return result, BadAuthRequest("请填写称呼和意见，并核对原片版本")
	}
	share, project, review, err := s.activeReviewShare(id, token)
	if err != nil {
		return result, err
	}
	if !share.AllowComments {
		return result, NewAppError(403, "这个链接仅供查看，不能提交意见")
	}
	actorKey := "share:" + id
	signature := cutSignature(struct {
		Kind, Share string
		Request     PublicReviewCommentRequest
	}{"review-guest-comment", id, input})
	if prior, err := projectReviewReplay(s.repo, project.UserID, project.ID, actorKey, input.RequestID, signature, "review-guest-comment"); err != nil || prior != nil {
		if prior != nil && prior.Comment != nil {
			return publicReviewComment(*prior.Comment), nil
		}
		return result, err
	}
	if input.TargetSHA256 != review.TargetSHA256 {
		return result, reviewConflict("审片版本不匹配，请重新打开原链接")
	}
	source, err := decodeReviewSource(review)
	if err != nil {
		return result, err
	}
	if _, err = production.ResolveReviewLocation(source, input.Location); err != nil {
		return result, BadAuthRequest(err.Error())
	}
	now := time.Now()
	row := model.ProjectReviewComment{ID: mediaAnalysisID("review-comment-v1", project.ID, actorKey, input.RequestID), UserID: project.UserID, ProjectID: project.ID, ReviewID: review.ID, ShareID: id, AuthorName: input.AuthorName, Message: input.Message, TimeMs: input.Location.TimeMs, EndMs: input.Location.EndMs, ClipID: input.Location.ClipID, Revision: 1, CreatedAt: now, UpdatedAt: now}
	write := ProjectReviewWriteResult{Kind: "review-guest-comment", Comment: &row}
	raw, _ := json.Marshal(write)
	receipt := model.ProjectReviewReceipt{ID: mediaAnalysisID("review-write-v1", project.ID, actorKey, input.RequestID), UserID: project.UserID, ProjectID: project.ID, ActorKey: actorKey, RequestID: input.RequestID, RequestSHA256: signature, Kind: write.Kind, ReviewID: review.ID, ResultJSON: string(raw), CreatedAt: now}
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	if err = s.validateProductionDocumentStorage(project.UserID, int64(len(raw)+len(row.Message)+len(row.AuthorName))); err != nil {
		return result, err
	}
	err = s.repo.ProjectReviewTransaction(project.ID, func(r *repository.Repository, current *model.Project) error {
		liveShare, liveProject, live, err := activeReviewShare(r, id, token)
		if err != nil {
			return err
		}
		if liveProject.ID != current.ID || live.UserID != project.UserID || !liveShare.AllowComments || live.TargetSHA256 != input.TargetSHA256 {
			return reviewConflict("链接或审片权限已变化，本次没有提交意见")
		}
		counts, err := r.ReviewGuestCommentCounts(project.UserID, project.ID, review.ID, id, now)
		if err != nil {
			return err
		}
		if counts[0] >= 5000 {
			return NewAppError(429, "本轮意见已达到上限，请联系项目所有者整理后继续")
		}
		if counts[1] >= 10 || counts[2] >= 200 {
			return NewAppError(429, "这个链接的留言较频繁，请稍后再试")
		}
		revision := live.Revision
		live.Revision++
		live.UpdatedAt = now
		if err = r.CreateProjectReviewComment(&row); err != nil {
			return err
		}
		if err = r.UpdateProjectReview(live, revision); err != nil {
			return err
		}
		return r.CreateProjectReviewReceipt(&receipt)
	})
	if err != nil {
		if prior, lookup := projectReviewReplay(s.repo, project.UserID, project.ID, actorKey, input.RequestID, signature, write.Kind); lookup == nil && prior != nil && prior.Comment != nil {
			return publicReviewComment(*prior.Comment), nil
		}
		return result, err
	}
	return publicReviewComment(row), nil
}

// Reviews always proxy the pinned original, so a revoked link cannot leave a
// reusable storage URL behind. Range requests remain streamable for long media.
func (s *Service) prepareReviewMedia(review *model.ProjectReview, rangeHeader, path string) (*ResourceDelivery, error) {
	source, err := decodeReviewSource(review)
	if err != nil {
		return nil, err
	}
	resource, err := s.repo.ResourceForUser(review.UserID, review.ResourceID)
	if err != nil {
		return nil, NotFound("审片原片不可用，请联系项目所有者")
	}
	if reviewResourceIdentity(resource) != source.StorageIdentity || resource.Size != source.ResourceBytes || resource.ETag != source.ResourceETag || resource.Status != model.ResourceStatusReady {
		return nil, reviewConflict("审片原片存储已变化，请检查原文件和备份")
	}
	stream, err := s.openResourceRange(review.UserID, resource, rangeHeader)
	if err != nil {
		return nil, err
	}
	return &ResourceDelivery{Resource: resource, Stream: stream, Access: &assets.ResourceAccess{ResourceID: resource.ID, RequestedVariant: assets.VariantOriginal, ActualVariant: assets.VariantOriginal, URL: path, Delivery: assets.DeliveryProxy}}, nil
}
func (s *Service) PreparePublicReviewMedia(id, token, rangeHeader string) (*ResourceDelivery, error) {
	_, _, review, err := s.activeReviewShare(id, token)
	if err != nil {
		return nil, err
	}
	return s.prepareReviewMedia(review, rangeHeader, kernel.APIPath("/review-shares/"+id+"/media"))
}
func (s *Service) PrepareProjectReviewMedia(actor, id, rangeHeader string) (*ResourceDelivery, error) {
	view, err := s.ReadProjectReview(actor, id)
	if err != nil {
		return nil, err
	}
	return s.prepareReviewMedia(&view.Review, rangeHeader, kernel.APIPath("/reviews/"+id+"/media"))
}
