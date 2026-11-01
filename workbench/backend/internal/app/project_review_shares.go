package app

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

type ProjectReviewShareRequest struct {
	RequestID     string `json:"requestId"`
	AllowComments bool   `json:"allowComments"`
	ExpiresDays   int    `json:"expiresDays"`
}
type ProjectReviewShareRevokeRequest struct {
	RequestID        string `json:"requestId"`
	ExpectedRevision int64  `json:"expectedRevision"`
}
type ProjectReviewShareLink struct {
	Share model.ProjectReviewShare `json:"share"`
	URL   string                   `json:"url,omitempty"`
	Issue string                   `json:"issue,omitempty"`
}

func reviewTokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func (s *Service) reviewShareLink(row *model.ProjectReviewShare) (ProjectReviewShareLink, error) {
	result := ProjectReviewShareLink{Share: *row}
	if !row.Active || !time.Now().Before(row.ExpiresAt) {
		return result, nil
	}
	token, err := s.decryptSettingSecret(row.TokenCipher)
	if err != nil || len(token) != 43 || subtle.ConstantTimeCompare([]byte(reviewTokenHash(token)), []byte(row.TokenHash)) != 1 {
		result.Issue = "链接密钥无法恢复，请撤销后重新创建"
		return result, nil
	}
	result.URL = "/review/" + row.ID + "#token=" + token
	return result, nil
}

func (s *Service) ListProjectReviewShares(actor, projectID, reviewID string) ([]ProjectReviewShareLink, error) {
	project, review, role, err := s.ownedReviewForActor(actor, projectID, reviewID)
	if err != nil {
		return nil, err
	}
	if role != "owner" {
		return nil, NewAppError(403, "只有项目所有者可以管理审片链接")
	}
	rows, err := s.repo.ProjectReviewShares(project.UserID, projectID, reviewID)
	if err != nil {
		return nil, err
	}
	result := make([]ProjectReviewShareLink, 0, len(rows))
	for i := range rows {
		link, err := s.reviewShareLink(&rows[i])
		if err != nil {
			return nil, err
		}
		// Archived projects and reviews cannot expose an otherwise active link.
		if project.Status != model.ProjectStatusActive || review.Archived {
			link.URL = ""
		}
		result = append(result, link)
	}
	return result, nil
}

func (s *Service) ReviewShareWriteLink(actor, projectID string, result ProjectReviewWriteResult) (ProjectReviewShareLink, error) {
	if result.Share == nil {
		return ProjectReviewShareLink{}, BadAuthRequest("该操作不是审片链接操作")
	}
	project, review, role, err := s.ownedReviewForActor(actor, projectID, result.Share.ReviewID)
	if err != nil {
		return ProjectReviewShareLink{}, err
	}
	if role != "owner" {
		return ProjectReviewShareLink{}, NewAppError(403, "只有项目所有者可以恢复审片链接")
	}
	row, err := s.repo.ProjectReviewShare(result.Share.ID)
	if err != nil {
		return ProjectReviewShareLink{}, err
	}
	if row.UserID != project.UserID || row.ProjectID != projectID || row.ReviewID != review.ID {
		return ProjectReviewShareLink{}, reviewMissing()
	}
	link, err := s.reviewShareLink(row)
	if review.Archived || project.Status != model.ProjectStatusActive {
		link.URL = ""
	}
	return link, err
}

func (s *Service) CreateProjectReviewShare(actor, projectID, reviewID string, input ProjectReviewShareRequest) (ProjectReviewWriteResult, error) {
	var result ProjectReviewWriteResult
	if !validCutRequestID(input.RequestID) || input.ExpiresDays < 1 || input.ExpiresDays > 30 {
		return result, BadAuthRequest("请选择1至30天的审片链接有效期")
	}
	project, review, role, err := s.ownedReviewForActor(actor, projectID, reviewID)
	if err != nil {
		return result, err
	}
	if err = requireReviewWrite(project, role, true); err != nil {
		return result, err
	}
	actorKey := reviewActorKey(actor)
	signature := cutSignature(struct {
		Review  string
		Request ProjectReviewShareRequest
	}{reviewID, input})
	if prior, err := projectReviewReplay(s.repo, project.UserID, projectID, actorKey, input.RequestID, signature, "review-share-create"); err != nil || prior != nil {
		if prior != nil {
			return *prior, nil
		}
		return result, err
	}
	if review.Archived {
		return result, reviewConflict("请先恢复审片，再创建新的分享链接")
	}
	if _, err = decodeReviewSource(review); err != nil {
		return result, err
	}
	tokenBytes := make([]byte, 32)
	if _, err = rand.Read(tokenBytes); err != nil {
		return result, err
	}
	token := base64.RawURLEncoding.EncodeToString(tokenBytes)
	cipher, err := s.encryptSettingSecret(token)
	if err != nil {
		return result, err
	}
	now := time.Now()
	row := model.ProjectReviewShare{ID: mediaAnalysisID("review-share-v1", projectID, actorKey, input.RequestID), UserID: project.UserID, ProjectID: projectID, ReviewID: reviewID, TokenHash: reviewTokenHash(token), TokenCipher: cipher, AllowComments: input.AllowComments, Active: true, Revision: 1, ExpiresAt: now.Add(time.Duration(input.ExpiresDays) * 24 * time.Hour), CreatedAt: now, UpdatedAt: now}
	result = ProjectReviewWriteResult{Kind: "review-share-create", Share: &row}
	raw, _ := json.Marshal(result)
	receipt := model.ProjectReviewReceipt{ID: mediaAnalysisID("review-write-v1", projectID, actorKey, input.RequestID), UserID: project.UserID, ProjectID: projectID, ActorKey: actorKey, RequestID: input.RequestID, RequestSHA256: signature, Kind: result.Kind, ReviewID: reviewID, ResultJSON: string(raw), CreatedAt: now}
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	if err = s.validateProductionDocumentStorage(project.UserID, int64(len(raw)+len(cipher))); err != nil {
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
		if err = requireReviewWrite(current, role, true); err != nil {
			return err
		}
		live, err := r.ProjectReview(project.UserID, projectID, reviewID)
		if err != nil {
			return err
		}
		if live.Archived {
			return reviewConflict("审片已归档，本次未创建链接")
		}
		rows, err := r.ProjectReviewShares(project.UserID, projectID, reviewID)
		if err != nil {
			return err
		}
		if len(rows) >= 100 {
			return BadAuthRequest("本轮审片已达到100个链接，请使用已有链接或发起新一轮审片")
		}
		if err = r.CreateProjectReviewShare(&row); err != nil {
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

func (s *Service) RevokeProjectReviewShare(actor, projectID, reviewID, id string, input ProjectReviewShareRevokeRequest) (ProjectReviewWriteResult, error) {
	var result ProjectReviewWriteResult
	if !validCutRequestID(input.RequestID) || input.ExpectedRevision < 1 {
		return result, BadAuthRequest("请核对链接版本和操作编号")
	}
	project, _, role, err := s.ownedReviewForActor(actor, projectID, reviewID)
	if err != nil {
		return result, err
	}
	// Revocation remains possible after the project has been archived.
	if role != "owner" {
		return result, NewAppError(403, "只有项目所有者可以撤销审片链接")
	}
	actorKey := reviewActorKey(actor)
	signature := cutSignature(struct {
		Review, Share string
		Request       ProjectReviewShareRevokeRequest
	}{reviewID, id, input})
	if prior, err := projectReviewReplay(s.repo, project.UserID, projectID, actorKey, input.RequestID, signature, "review-share-revoke"); err != nil || prior != nil {
		if prior != nil {
			return *prior, nil
		}
		return result, err
	}
	row, err := s.repo.ProjectReviewShare(id)
	if err != nil || row.UserID != project.UserID || row.ProjectID != projectID || row.ReviewID != reviewID {
		return result, reviewMissing()
	}
	if row.Revision != input.ExpectedRevision {
		return result, reviewConflict("链接状态已经变化，请刷新列表")
	}
	row.Active = false
	row.Revision++
	row.UpdatedAt = time.Now()
	result = ProjectReviewWriteResult{Kind: "review-share-revoke", Share: row}
	raw, _ := json.Marshal(result)
	receipt := model.ProjectReviewReceipt{ID: mediaAnalysisID("review-write-v1", projectID, actorKey, input.RequestID), UserID: project.UserID, ProjectID: projectID, ActorKey: actorKey, RequestID: input.RequestID, RequestSHA256: signature, Kind: result.Kind, ReviewID: reviewID, ResultJSON: string(raw), CreatedAt: row.UpdatedAt}
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	if err = s.validateProductionDocumentStorage(project.UserID, int64(len(raw))); err != nil {
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
		if role != "owner" {
			return reviewMissing()
		}
		if err = r.UpdateProjectReviewShare(row, input.ExpectedRevision); err != nil {
			return reviewConflict("链接已更新，本次未覆盖新状态")
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

// Every guest operation checks the link, owner, project and exact review again.
func activeReviewShare(r *repository.Repository, id, token string) (*model.ProjectReviewShare, *model.Project, *model.ProjectReview, error) {
	missing := func() (*model.ProjectReviewShare, *model.Project, *model.ProjectReview, error) {
		return nil, nil, nil, NotFound("审片链接无效、已到期或已被撤销")
	}
	if len(id) > 36 || len(token) != 43 || strings.ContainsAny(token, " \r\n\t") {
		return missing()
	}
	share, err := r.ProjectReviewShare(id)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return missing()
	}
	if err != nil {
		return nil, nil, nil, err
	}
	if !share.Active || !time.Now().Before(share.ExpiresAt) || subtle.ConstantTimeCompare([]byte(reviewTokenHash(token)), []byte(share.TokenHash)) != 1 {
		return missing()
	}
	project, err := r.ReviewProject(share.ProjectID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return missing()
	}
	if err != nil {
		return nil, nil, nil, err
	}
	if project.UserID != share.UserID || project.Status != model.ProjectStatusActive {
		return missing()
	}
	owner, err := r.User(project.UserID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return missing()
	}
	if err != nil {
		return nil, nil, nil, err
	}
	if owner.Status != model.UserStatusActive {
		return missing()
	}
	review, err := r.ProjectReview(project.UserID, project.ID, share.ReviewID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return missing()
	}
	if err != nil {
		return nil, nil, nil, err
	}
	if review.Archived {
		return missing()
	}
	if _, err = decodeReviewSource(review); err != nil {
		return nil, nil, nil, err
	}
	return share, project, review, nil
}
