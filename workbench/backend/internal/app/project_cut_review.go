package app

import (
	"encoding/json"
	"errors"
	"slices"
	"strings"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
	"yingce/backend/internal/repository"
)

// This is an explicit decision to discard unconverted settings. It never
// asserts conversion or changes the imported source, cut, or old render.
type ProjectCutReviewRequest struct {
	RequestID        string   `json:"requestId"`
	ExpectedRevision int64    `json:"expectedRevision"`
	DiscardFields    []string `json:"discardFields"`
	PreviewToken     string   `json:"previewToken,omitempty"`
}
type ProjectCutReviewPreview struct {
	CutID            string            `json:"cutId"`
	BackupCutID      string            `json:"backupCutId"`
	SourceCutID      string            `json:"sourceCutId"`
	ExpectedRevision int64             `json:"expectedRevision"`
	Before           ProjectCutSummary `json:"before"`
	DiscardFields    []string          `json:"discardFields"`
	PreviewToken     string            `json:"previewToken"`
}
type ProjectCutReviewResult struct {
	Kind            string                  `json:"kind"`
	Plan            ProjectCutReviewPreview `json:"plan"`
	AppliedRevision int64                   `json:"appliedRevision"`
	Replayed        bool                    `json:"replayed"`
}

func cutReviewSignature(request ProjectCutReviewRequest) string {
	request.PreviewToken = ""
	return cutSignature(struct {
		Kind    string
		Request ProjectCutReviewRequest
	}{"legacy-settings-review-v1", request})
}
func (s *Service) PreviewProjectCutReview(userID, projectID string, request ProjectCutReviewRequest) (ProjectCutReviewPreview, error) {
	var result ProjectCutReviewPreview
	if !validCutRequestID(request.RequestID) || request.ExpectedRevision < 0 || len(request.DiscardFields) == 0 || len(request.DiscardFields) > 128 {
		return result, BadAuthRequest("请明确选择要放弃的旧版设置和当前剪辑版本")
	}
	if _, err := s.activeProjectForUser(userID, projectID); err != nil {
		return result, err
	}
	current, err := s.GetProjectTimeline(userID, projectID)
	if err != nil {
		return result, err
	}
	if current.Revision != request.ExpectedRevision {
		return result, cutConflict("剪辑已变化，请重新核对画面和未处理设置")
	}
	if !slices.Equal(request.DiscardFields, current.DeliveryBlockers) {
		return result, cutConflict("未处理设置已变化，请重新读取并逐项核对")
	}
	for _, field := range current.DeliveryBlockers {
		if strings.HasPrefix(field, "delivery.") || strings.Contains(field, ".source-") || strings.HasSuffix(field, ".converter-mismatch") {
			return result, cutConflict("剪辑来源无法完整核对，请先恢复来源或检查备份")
		}
	}
	clean, err := production.ValidateTimelineDocument(current.Timeline)
	if err != nil {
		return result, NewAppError(500, "当前剪辑无法校验，请先检查备份")
	}
	if err = s.validateProjectTimelineMedia(userID, projectID, clean); err != nil {
		return result, err
	}
	result = ProjectCutReviewPreview{CutID: mediaAnalysisID("legacy-reviewed-v1", userID, projectID, request.RequestID), BackupCutID: mediaAnalysisID("legacy-review-before-v1", userID, projectID, request.RequestID), SourceCutID: current.OriginCutID, ExpectedRevision: current.Revision, Before: cutSummary(clean), DiscardFields: append([]string{}, current.DeliveryBlockers...)}
	result.PreviewToken = cutSignature(struct {
		User, Project, Signature string
		Plan                     ProjectCutReviewPreview
	}{userID, projectID, cutReviewSignature(request), result})
	return result, nil
}
func (s *Service) ReadProjectCutReview(userID, projectID, requestID string) (ProjectCutReviewResult, error) {
	var result ProjectCutReviewResult
	if _, err := s.repo.ProjectForUser(userID, projectID); err != nil {
		return result, NotFound("项目不存在或无权查看")
	}
	if !validCutRequestID(requestID) {
		return result, BadAuthRequest("核对编号无效")
	}
	row, err := s.repo.ProjectCutApplyForRequest(userID, projectID, requestID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return result, NotFound("此核对编号尚无完成回执，请保留原编号重试")
	}
	if err != nil {
		return result, err
	}
	if json.Unmarshal([]byte(row.ResultJSON), &result) != nil {
		return result, NewAppError(500, "核对回执无法读取，请检查备份")
	}
	if result.Kind != "legacy-settings-review" {
		return ProjectCutReviewResult{}, cutConflict("此编号属于其他操作，请使用原操作查询")
	}
	result.Replayed = true
	return result, nil
}
func (s *Service) ApplyProjectCutReview(userID, projectID string, request ProjectCutReviewRequest) (ProjectCutReviewResult, error) {
	var result ProjectCutReviewResult
	if _, err := s.repo.ProjectForUser(userID, projectID); err != nil {
		return result, NotFound("项目不存在或无权查看")
	}
	if !validCutRequestID(request.RequestID) {
		return result, BadAuthRequest("核对编号无效")
	}
	signature := cutReviewSignature(request)
	if prior, err := s.repo.ProjectCutApplyForRequest(userID, projectID, request.RequestID); err == nil {
		if prior.RequestSHA256 != signature {
			return result, cutConflict("此核对编号已用于不同内容")
		}
		return s.ReadProjectCutReview(userID, projectID, request.RequestID)
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return result, err
	}
	plan, err := s.PreviewProjectCutReview(userID, projectID, request)
	if err != nil {
		return result, err
	}
	if request.PreviewToken == "" || request.PreviewToken != plan.PreviewToken {
		return result, cutConflict("请先预览要放弃的设置，再明确确认")
	}
	before, err := s.GetProjectTimeline(userID, projectID)
	if err != nil {
		return result, err
	}
	clean, err := production.ValidateTimelineDocument(before.Timeline)
	if err != nil || before.Revision != plan.ExpectedRevision || cutSummary(clean).SHA256 != plan.Before.SHA256 || before.OriginCutID != plan.SourceCutID || !slices.Equal(before.DeliveryBlockers, plan.DiscardFields) {
		return result, cutConflict("剪辑或来源已变化，请重新核对")
	}
	now := time.Now()
	metadata, _ := json.Marshal(map[string]any{"kind": "legacy-settings-review", "discardedFields": plan.DiscardFields, "sourceCutId": plan.SourceCutID, "requestId": request.RequestID})
	candidate := model.ProjectCut{ID: plan.CutID, UserID: userID, ProjectID: projectID, RequestID: "legacy-reviewed:" + plan.CutID, RequestSHA256: signature, Title: "已核对的剪辑 · " + now.Format("01-02 15:04:05"), Kind: "snapshot", SourceKey: "legacy-reviewed-v1", TimelineRevision: request.ExpectedRevision + 1, TimelineSHA256: plan.Before.SHA256, PayloadJSON: string(clean), MetadataJSON: string(metadata), CreatedAt: now}
	backup := model.ProjectCut{ID: plan.BackupCutID, UserID: userID, ProjectID: projectID, OriginCutID: before.OriginCutID, RequestID: "legacy-review-before:" + plan.BackupCutID, RequestSHA256: signature, Title: "放弃旧版设置前 · " + now.Format("01-02 15:04:05"), Kind: "snapshot", SourceKey: "legacy-review-before-v1", TimelineRevision: request.ExpectedRevision, TimelineSHA256: plan.Before.SHA256, PayloadJSON: string(clean), CreatedAt: now}
	result = ProjectCutReviewResult{Kind: "legacy-settings-review", Plan: plan, AppliedRevision: request.ExpectedRevision + 1}
	raw, _ := json.Marshal(result)
	receipt := model.ProjectCutApplyReceipt{ID: mediaAnalysisID("legacy-review-receipt-v1", userID, projectID, request.RequestID), UserID: userID, ProjectID: projectID, RequestID: request.RequestID, RequestSHA256: signature, CutID: candidate.ID, ResultJSON: string(raw), CreatedAt: now}
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	if err = s.validateProductionDocumentStorage(userID, int64(2*len(clean)+len(metadata)+len(raw))); err != nil {
		return ProjectCutReviewResult{}, err
	}
	if err = s.repo.ApplyTimelineEditCut(&candidate, request.ExpectedRevision, &backup, &receipt); err != nil {
		if prior, e := s.repo.ProjectCutApplyForRequest(userID, projectID, request.RequestID); e == nil && prior.RequestSHA256 == signature {
			return s.ReadProjectCutReview(userID, projectID, request.RequestID)
		}
		if errors.Is(err, repository.ErrTimelineResourceChanged) {
			return ProjectCutReviewResult{}, timelineResourceChangedError()
		}
		if errors.Is(err, repository.ErrProjectTimelineConflict) || errors.Is(err, gorm.ErrRecordNotFound) {
			return ProjectCutReviewResult{}, cutConflict("剪辑已变化，本次未放弃设置，请重新核对")
		}
		return ProjectCutReviewResult{}, err
	}
	return result, nil
}
