package app

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
	"yingce/backend/internal/repository"
)

type ProjectCutCreateRequest struct {
	Purpose          string          `json:"purpose,omitempty"`
	RequestID        string          `json:"requestId"`
	ExpectedRevision int64           `json:"expectedRevision"`
	Title            string          `json:"title"`
	Kind             string          `json:"kind"`
	Language         string          `json:"language,omitempty"`
	Region           string          `json:"region,omitempty"`
	AspectRatio      string          `json:"aspectRatio,omitempty"`
	UnitID           string          `json:"unitId,omitempty"`
	Timeline         json.RawMessage `json:"timeline,omitempty"`
}
type ProjectCutView struct {
	Cut              model.ProjectCut `json:"cut"`
	Timeline         json.RawMessage  `json:"timeline"`
	Metadata         json.RawMessage  `json:"metadata,omitempty"`
	Replayed         bool             `json:"replayed"`
	DeliveryBlockers []string         `json:"deliveryBlockers,omitempty"`
}
type ProjectCutPage struct {
	Cuts       []model.ProjectCut `json:"cuts"`
	NextCursor string             `json:"nextCursor,omitempty"`
}
type ProjectCutApplyRequest struct {
	RequestID        string `json:"requestId"`
	ExpectedRevision int64  `json:"expectedRevision"`
	TimelineSHA256   string `json:"timelineSha256"`
	PreviewToken     string `json:"previewToken,omitempty"`
}
type ProjectCutSummary struct {
	Clips      int    `json:"clips"`
	Tracks     int    `json:"tracks"`
	DurationMs int64  `json:"durationMs"`
	SHA256     string `json:"sha256"`
}
type ProjectCutApplyPreview struct {
	CutID            string            `json:"cutId"`
	Title            string            `json:"title"`
	ExpectedRevision int64             `json:"expectedRevision"`
	Before           ProjectCutSummary `json:"before"`
	After            ProjectCutSummary `json:"after"`
	BackupCutID      string            `json:"backupCutId"`
	PreviewToken     string            `json:"previewToken"`
}
type ProjectCutApplyResult struct {
	Plan            ProjectCutApplyPreview `json:"plan"`
	AppliedRevision int64                  `json:"appliedRevision"`
	Replayed        bool                   `json:"replayed"`
}

func cutSignature(value any) string {
	raw, _ := json.Marshal(value)
	return fmt.Sprintf("%x", sha256.Sum256(raw))
}
func cutConflict(message string) *AppError {
	err := NewAppError(409, message)
	err.Reason = "project_cut_conflict"
	return err
}
func validCutRequestID(id string) bool { return len(id) >= 16 && validateProjectCreationKey(id) == nil }
func cutSummary(raw json.RawMessage) ProjectCutSummary {
	var body struct {
		Clips      []json.RawMessage `json:"clips"`
		Tracks     []json.RawMessage `json:"tracks"`
		DurationMs int64             `json:"durationMs"`
	}
	_ = json.Unmarshal(raw, &body)
	return ProjectCutSummary{Clips: len(body.Clips), Tracks: len(body.Tracks), DurationMs: body.DurationMs, SHA256: fmt.Sprintf("%x", sha256.Sum256(raw))}
}
func projectCutView(row *model.ProjectCut, replayed bool) (ProjectCutView, error) {
	clean, err := production.ValidateTimelineDocument(json.RawMessage(row.PayloadJSON))
	if err != nil || fmt.Sprintf("%x", sha256.Sum256(clean)) != row.TimelineSHA256 {
		return ProjectCutView{}, NewAppError(500, "剪辑版本校验失败，请保留原文件并检查备份")
	}
	return ProjectCutView{Cut: *row, Timeline: clean, Metadata: json.RawMessage(row.MetadataJSON), Replayed: replayed}, nil
}
func (s *Service) GetProjectCut(userID, projectID, id string) (ProjectCutView, error) {
	if _, err := s.repo.ProjectForUser(userID, projectID); err != nil {
		return ProjectCutView{}, NotFound("项目不存在或无权查看")
	}
	row, err := s.repo.ProjectCut(userID, projectID, id)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ProjectCutView{}, NotFound("剪辑版本不存在")
	}
	if err != nil {
		return ProjectCutView{}, err
	}
	return s.ownedProjectCutView(row, false)
}

func (s *Service) ownedProjectCutView(row *model.ProjectCut, replayed bool) (ProjectCutView, error) {
	view, err := projectCutView(row, replayed)
	if err != nil {
		return view, err
	}
	view.DeliveryBlockers = s.projectCutDeliveryBlockers(row)
	return view, nil
}

func (s *Service) ReadProjectCutRequest(userID, projectID, requestID string) (ProjectCutView, error) {
	if _, err := s.repo.ProjectForUser(userID, projectID); err != nil {
		return ProjectCutView{}, NotFound("项目不存在或无权查看")
	}
	if !validCutRequestID(requestID) {
		return ProjectCutView{}, BadAuthRequest("保存编号无效")
	}
	row, err := s.repo.ProjectCutForRequest(userID, projectID, requestID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ProjectCutView{}, NotFound("此保存编号尚无完成回执")
	}
	if err != nil {
		return ProjectCutView{}, err
	}
	return s.ownedProjectCutView(row, true)
}
func (s *Service) ListProjectCuts(userID, projectID, cursor string, archived, includeAutomatic bool, limit int) (ProjectCutPage, error) {
	if _, err := s.repo.ProjectForUser(userID, projectID); err != nil {
		return ProjectCutPage{}, NotFound("项目不存在或无权查看")
	}
	if limit < 1 || limit > 100 || len(cursor) > 80 {
		return ProjectCutPage{}, BadAuthRequest("剪辑版本分页无效")
	}
	before := time.Time{}
	if cursor != "" {
		row, err := s.repo.ProjectCut(userID, projectID, cursor)
		if err != nil || row.Archived != archived || (!includeAutomatic && row.IsAutomatic()) {
			return ProjectCutPage{}, BadAuthRequest("分页游标不属于当前筛选")
		}
		before = row.CreatedAt
	}
	rows, err := s.repo.ProjectCutPage(userID, projectID, archived, includeAutomatic, before, cursor, limit)
	if err != nil {
		return ProjectCutPage{}, err
	}
	result := ProjectCutPage{Cuts: rows}
	if len(rows) > limit {
		result.Cuts = rows[:limit]
		result.NextCursor = result.Cuts[limit-1].ID
	}
	return result, nil
}
func (s *Service) CreateProjectCut(userID, projectID string, req ProjectCutCreateRequest) (ProjectCutView, error) {
	if _, err := s.repo.ProjectForUser(userID, projectID); err != nil {
		return ProjectCutView{}, NotFound("项目不存在或无权查看")
	}
	req.Title = strings.TrimSpace(req.Title)
	req.Language = strings.TrimSpace(req.Language)
	req.Region = strings.TrimSpace(req.Region)
	if !validCutRequestID(req.RequestID) || req.ExpectedRevision < 0 || !utf8.ValidString(req.Title) || req.Title == "" || utf8.RuneCountInString(req.Title) > 200 || !utf8.ValidString(req.Language) || utf8.RuneCountInString(req.Language) > 40 || !utf8.ValidString(req.Region) || utf8.RuneCountInString(req.Region) > 100 || len(req.UnitID) > 36 {
		return ProjectCutView{}, BadAuthRequest("请填写有效的版本名称、编号和时间线版本")
	}
	if req.Kind == "" {
		req.Kind = "master"
	}
	switch req.Kind {
	case "master", "teaser", "aspect", "locale", "experiment", "snapshot":
	default:
		return ProjectCutView{}, BadAuthRequest("剪辑版本类型无效")
	}
	if req.Purpose != "" && (req.Purpose != "export" || req.Kind != "snapshot") {
		return ProjectCutView{}, BadAuthRequest("导出快照用途无效")
	}
	if req.AspectRatio != "" {
		switch req.AspectRatio {
		case "16:9", "9:16", "1:1", "4:3", "3:4":
		default:
			return ProjectCutView{}, BadAuthRequest("版本画幅无效")
		}
	}
	if len(req.Timeline) > 0 {
		clean, err := production.ValidateTimelineDocument(req.Timeline)
		if err != nil {
			return ProjectCutView{}, BadAuthRequest("剪辑版本的时间线无效")
		}
		req.Timeline = clean
	}
	signature := cutSignature(req)
	if row, err := s.repo.ProjectCutForRequest(userID, projectID, req.RequestID); err == nil {
		if row.RequestSHA256 != signature {
			return ProjectCutView{}, cutConflict("此保存编号已用于不同内容，请保留原稿并重新保存")
		}
		return s.ownedProjectCutView(row, true)
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return ProjectCutView{}, err
	}
	if _, err := s.activeProjectForUser(userID, projectID); err != nil {
		return ProjectCutView{}, err
	}
	if req.UnitID != "" {
		if _, err := s.repo.ProjectUnit(projectID, req.UnitID); err != nil {
			return ProjectCutView{}, BadAuthRequest("章节不属于当前项目")
		}
	}
	current, err := s.GetProjectTimeline(userID, projectID)
	if err != nil {
		return ProjectCutView{}, err
	}
	if current.Revision != req.ExpectedRevision {
		return ProjectCutView{}, cutConflict("剪辑已更新，请保存当前草稿并重新读取")
	}
	payload := req.Timeline
	if len(payload) == 0 {
		payload = current.Timeline
	}
	clean, err := production.ValidateTimelineDocument(payload)
	if err != nil {
		return ProjectCutView{}, BadAuthRequest("剪辑版本时间线无效")
	}
	clean, err = s.projectCutSaveOutput(userID, projectID, req.AspectRatio, clean)
	if err != nil {
		return ProjectCutView{}, err
	}
	if err := s.validateProjectTimelineMedia(userID, projectID, clean); err != nil {
		return ProjectCutView{}, err
	}
	row := model.ProjectCut{ID: mediaAnalysisID("project-cut-v1", userID, projectID, req.RequestID), UserID: userID, ProjectID: projectID, OriginCutID: current.OriginCutID, RequestID: req.RequestID, RequestSHA256: signature, Title: req.Title, Kind: req.Kind, Language: req.Language, Region: req.Region, AspectRatio: req.AspectRatio, UnitID: req.UnitID, TimelineRevision: current.Revision, TimelineSHA256: fmt.Sprintf("%x", sha256.Sum256(clean)), PayloadJSON: string(clean), CreatedAt: time.Now()}
	if req.Purpose == "export" {
		row.SourceKey = "working-export-v1"
	}
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	if err := s.validateProductionDocumentStorage(userID, int64(len(row.PayloadJSON))); err != nil {
		return ProjectCutView{}, err
	}
	if err := s.repo.CreateProjectCut(&row, req.ExpectedRevision, nil, nil); err != nil {
		if previous, e := s.repo.ProjectCutForRequest(userID, projectID, req.RequestID); e == nil && previous.RequestSHA256 == signature {
			return s.ownedProjectCutView(previous, true)
		}
		if errors.Is(err, repository.ErrTimelineResourceChanged) {
			return ProjectCutView{}, timelineResourceChangedError()
		}
		if errors.Is(err, repository.ErrProjectTimelineConflict) {
			return ProjectCutView{}, cutConflict("剪辑已更新，当前输入已保留，请重新读取")
		}
		return ProjectCutView{}, err
	}
	return s.ownedProjectCutView(&row, false)
}
func (s *Service) SetProjectCutArchived(userID, projectID, id string, expected, archived bool) (ProjectCutView, error) {
	if _, err := s.activeProjectForUser(userID, projectID); err != nil {
		return ProjectCutView{}, err
	}
	row, err := s.repo.ProjectCut(userID, projectID, id)
	if err != nil {
		return ProjectCutView{}, NotFound("剪辑版本不存在")
	}
	if row.Archived == archived {
		return s.ownedProjectCutView(row, true)
	}
	if row.Archived != expected {
		return ProjectCutView{}, cutConflict("版本状态已变化，请刷新列表")
	}
	if err := s.repo.SetProjectCutArchived(userID, projectID, id, expected, archived); err != nil {
		if errors.Is(err, repository.ErrProjectTimelineConflict) {
			return ProjectCutView{}, cutConflict("版本状态已变化，请刷新列表")
		}
		return ProjectCutView{}, err
	}
	row.Archived = archived
	return s.ownedProjectCutView(row, false)
}
func (s *Service) PreviewProjectCutApply(userID, projectID, id string, req ProjectCutApplyRequest) (ProjectCutApplyPreview, error) {
	var result ProjectCutApplyPreview
	if !validCutRequestID(req.RequestID) || req.ExpectedRevision < 0 || len(req.TimelineSHA256) != 64 {
		return result, BadAuthRequest("请提供有效的版本编号和时间线版本")
	}
	if _, err := s.activeProjectForUser(userID, projectID); err != nil {
		return result, err
	}
	view, err := s.GetProjectCut(userID, projectID, id)
	if err != nil {
		return result, err
	}
	if view.Cut.Archived || view.Cut.TimelineSHA256 != req.TimelineSHA256 {
		return result, cutConflict("剪辑版本已归档或内容不匹配，请重新选择")
	}
	editable, err := s.projectCutEditableTimeline(userID, projectID, view)
	if err != nil {
		return result, err
	}
	if err := s.validateProjectTimelineMedia(userID, projectID, editable); err != nil {
		return result, err
	}
	current, err := s.GetProjectTimeline(userID, projectID)
	if err != nil {
		return result, err
	}
	if current.Revision != req.ExpectedRevision {
		return result, cutConflict("工作时间线已更新，请先保存并重新读取")
	}
	clean, err := production.ValidateTimelineDocument(current.Timeline)
	if err != nil {
		return result, NewAppError(500, "当前时间线无法校验，无法安全创建恢复版本")
	}
	result = ProjectCutApplyPreview{CutID: id, Title: view.Cut.Title, ExpectedRevision: current.Revision, Before: cutSummary(clean), After: cutSummary(editable), BackupCutID: mediaAnalysisID("project-cut-apply-backup-v1", userID, projectID, req.RequestID)}
	result.PreviewToken = cutSignature(struct {
		User    string
		Project string
		Request string
		Plan    ProjectCutApplyPreview
	}{userID, projectID, req.RequestID, result})
	return result, nil
}
func (s *Service) ReadProjectCutApply(userID, projectID, requestID string) (ProjectCutApplyResult, error) {
	if _, err := s.repo.ProjectForUser(userID, projectID); err != nil {
		return ProjectCutApplyResult{}, NotFound("项目不存在或无权查看")
	}
	if !validCutRequestID(requestID) {
		return ProjectCutApplyResult{}, BadAuthRequest("应用编号无效")
	}
	row, err := s.repo.ProjectCutApplyForRequest(userID, projectID, requestID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ProjectCutApplyResult{}, NotFound("此应用编号尚无完成回执")
	}
	if err != nil {
		return ProjectCutApplyResult{}, err
	}
	var result ProjectCutApplyResult
	var envelope struct {
		Kind string `json:"kind"`
	}
	if json.Unmarshal([]byte(row.ResultJSON), &envelope) != nil || envelope.Kind != "" {
		return result, cutConflict("此编号属于其他操作，请使用原操作查询回执")
	}
	if json.Unmarshal([]byte(row.ResultJSON), &result) != nil {
		return result, NewAppError(500, "应用回执无法读取，请保留当前剪辑")
	}
	result.Replayed = true
	return result, nil
}
func (s *Service) ApplyProjectCut(userID, projectID, id string, req ProjectCutApplyRequest) (ProjectCutApplyResult, error) {
	var result ProjectCutApplyResult
	if _, err := s.repo.ProjectForUser(userID, projectID); err != nil {
		return result, NotFound("项目不存在或无权查看")
	}
	if !validCutRequestID(req.RequestID) {
		return result, BadAuthRequest("应用编号无效")
	}
	intent := req
	intent.PreviewToken = ""
	signature := cutSignature(struct {
		CutID   string
		Request ProjectCutApplyRequest
	}{id, intent})
	if previous, err := s.repo.ProjectCutApplyForRequest(userID, projectID, req.RequestID); err == nil {
		if previous.RequestSHA256 != signature {
			return result, cutConflict("此应用编号已用于其他内容")
		}
		return s.ReadProjectCutApply(userID, projectID, req.RequestID)
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return result, err
	}
	plan, err := s.PreviewProjectCutApply(userID, projectID, id, req)
	if err != nil {
		return result, err
	}
	if req.PreviewToken == "" || req.PreviewToken != plan.PreviewToken {
		return result, cutConflict("应用预览已变化，请检查影响后重新确认")
	}
	cut, err := s.repo.ProjectCut(userID, projectID, id)
	if err != nil {
		return result, err
	}
	view, err := s.ownedProjectCutView(cut, false)
	if err != nil {
		return result, err
	}
	editable, err := s.projectCutEditableTimeline(userID, projectID, view)
	if err != nil {
		return result, err
	}
	if cutSummary(editable).SHA256 != plan.After.SHA256 {
		return result, cutConflict("版本的画面设置已变化，请重新预览")
	}
	// Only the repository's working-copy argument changes; the archived cut
	// and its original SHA remain intact for old receipts and exact restoration.
	copyCut := *cut
	copyCut.PayloadJSON = string(editable)
	cut = &copyCut
	before, err := s.GetProjectTimeline(userID, projectID)
	if err != nil {
		return result, err
	}
	clean, err := production.ValidateTimelineDocument(before.Timeline)
	if err != nil || cutSummary(clean).SHA256 != plan.Before.SHA256 {
		return result, cutConflict("工作时间线已变化，请重新预览")
	}
	now := time.Now()
	backup := model.ProjectCut{ID: plan.BackupCutID, UserID: userID, ProjectID: projectID, OriginCutID: before.OriginCutID, RequestID: "before-apply:" + plan.BackupCutID, RequestSHA256: signature, Title: "应用前的剪辑 · " + now.Format("01-02 15:04"), Kind: "snapshot", SourceKey: "project-cut-before-v1", TimelineRevision: req.ExpectedRevision, TimelineSHA256: plan.Before.SHA256, PayloadJSON: string(clean), CreatedAt: now}
	result = ProjectCutApplyResult{Plan: plan, AppliedRevision: req.ExpectedRevision + 1}
	raw, _ := json.Marshal(result)
	receipt := model.ProjectCutApplyReceipt{ID: mediaAnalysisID("project-cut-apply-v1", userID, projectID, req.RequestID), UserID: userID, ProjectID: projectID, RequestID: req.RequestID, RequestSHA256: signature, CutID: id, ResultJSON: string(raw), CreatedAt: now}
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	if err := s.validateProductionDocumentStorage(userID, int64(len(cut.PayloadJSON)+len(raw))); err != nil {
		return ProjectCutApplyResult{}, err
	}
	if err := s.repo.ApplyProjectCut(cut, req.ExpectedRevision, &backup, &receipt); err != nil {
		if previous, e := s.repo.ProjectCutApplyForRequest(userID, projectID, req.RequestID); e == nil && previous.RequestSHA256 == signature {
			return s.ReadProjectCutApply(userID, projectID, req.RequestID)
		}
		if errors.Is(err, repository.ErrTimelineResourceChanged) {
			return ProjectCutApplyResult{}, timelineResourceChangedError()
		}
		if errors.Is(err, repository.ErrProjectTimelineConflict) || errors.Is(err, gorm.ErrRecordNotFound) {
			return ProjectCutApplyResult{}, cutConflict("剪辑或版本已变化，请重新预览；当前剪辑仍保留")
		}
		return ProjectCutApplyResult{}, err
	}
	return result, nil
}
