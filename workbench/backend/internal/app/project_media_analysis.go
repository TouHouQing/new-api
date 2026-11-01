package app

import (
	"encoding/json"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
	"yingce/backend/internal/repository"
)

type ProjectMediaAnalysisView struct {
	Analysis       model.ProjectMediaAnalysis         `json:"analysis"`
	CurrentVersion model.ProjectMediaAnalysisRevision `json:"currentVersion"`
	Source         production.MediaAnalysisSource     `json:"source"`
	Evidence       json.RawMessage                    `json:"evidence"`
	Document       production.MediaAnalysisEdits      `json:"document"`
	IsCurrent      bool                               `json:"isCurrent"`
}

type ProjectMediaAnalysisPage struct {
	Analyses   []model.ProjectMediaAnalysis `json:"analyses"`
	NextCursor string                       `json:"nextCursor,omitempty"`
}

type ProjectMediaAnalysisHistoryPage struct {
	Versions          []model.ProjectMediaAnalysisRevision `json:"versions"`
	NextBeforeVersion int64                                `json:"nextBeforeVersion,omitempty"`
}

type ProjectMediaAnalysisWriteRequest struct {
	RequestID         string                         `json:"requestId"`
	ExpectedRevision  *int64                         `json:"expectedRevision"`
	Title             *string                        `json:"title,omitempty"`
	Archived          *bool                          `json:"archived,omitempty"`
	Document          *production.MediaAnalysisEdits `json:"document,omitempty"`
	RestoreRevisionID string                         `json:"restoreRevisionId,omitempty"`
	Note              string                         `json:"note,omitempty"`
}

type ProjectMediaAnalysisWriteResult struct {
	View           ProjectMediaAnalysisView           `json:"view"`
	AppliedVersion model.ProjectMediaAnalysisRevision `json:"appliedVersion"`
	Replayed       bool                               `json:"replayed"`
}

func (s *Service) GetProjectMediaAnalysis(userID, projectID, id, revisionID string) (ProjectMediaAnalysisView, error) {
	var view ProjectMediaAnalysisView
	if strings.TrimSpace(userID) == "" {
		return view, Unauthorized("请先登录")
	}
	if _, err := s.repo.ProjectForUser(userID, projectID); err != nil {
		return view, NotFound("项目不存在或无权查看")
	}
	row, err := s.repo.ProjectMediaAnalysis(userID, projectID, id)
	if err != nil {
		return view, NotFound("分析结果不存在或无权查看")
	}
	if revisionID == "" {
		revisionID = row.CurrentRevisionID
	}
	version, err := s.repo.ProjectMediaAnalysisRevision(userID, id, revisionID)
	if err != nil {
		return view, NotFound("分析版本不存在或不属于当前分析")
	}
	if json.Unmarshal([]byte(row.SourceJSON), &view.Source) != nil || json.Unmarshal([]byte(version.DocumentJSON), &view.Document) != nil || view.Source.ResourceID != row.ResourceID || production.ValidateMediaAnalysisSource(view.Source, row.Kind) != nil || !json.Valid([]byte(row.EvidenceJSON)) {
		return view, WrapAppError(500, "分析记录不完整，原始素材保留", production.ErrMediaAnalysis)
	}
	view.Document, err = production.ValidateMediaAnalysisEdits(view.Source, row.Kind, view.Document)
	if err != nil {
		return view, WrapAppError(500, "分析版本的数据不完整", err)
	}
	view.Analysis, view.CurrentVersion, view.Evidence, view.IsCurrent = *row, *version, json.RawMessage(row.EvidenceJSON), row.CurrentRevisionID == version.ID
	return view, nil
}

func (s *Service) ListProjectMediaAnalyses(userID, projectID, resourceID, kind, cursor string, archived bool, limit int) (ProjectMediaAnalysisPage, error) {
	page := ProjectMediaAnalysisPage{Analyses: []model.ProjectMediaAnalysis{}}
	if _, err := s.repo.ProjectForUser(userID, projectID); err != nil {
		return page, NotFound("项目不存在或无权查看")
	}
	if limit < 1 || limit > 50 {
		return page, BadAuthRequest("分析列表每页为1至50条")
	}
	if kind != "" && kind != "reference_video" && kind != "audio_structure" && kind != "subject_track" {
		return page, BadAuthRequest("分析类型无效")
	}
	rows, err := s.repo.ProjectMediaAnalyses(userID, projectID, resourceID, kind, cursor, archived, limit+1)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return page, BadAuthRequest("分页位置不属于当前项目或筛选条件")
	}
	if err != nil {
		return page, err
	}
	if len(rows) > limit {
		rows = rows[:limit]
		page.NextCursor = rows[len(rows)-1].ID
	}
	page.Analyses = rows
	return page, nil
}

func (s *Service) ProjectMediaAnalysisHistory(userID, projectID, id string, before int64, limit int) (ProjectMediaAnalysisHistoryPage, error) {
	page := ProjectMediaAnalysisHistoryPage{Versions: []model.ProjectMediaAnalysisRevision{}}
	if _, err := s.GetProjectMediaAnalysis(userID, projectID, id, ""); err != nil {
		return page, err
	}
	if limit < 1 || limit > 50 || before < 0 {
		return page, BadAuthRequest("历史版本分页参数无效")
	}
	rows, err := s.repo.ProjectMediaAnalysisHistory(userID, id, before, limit+1)
	if err != nil {
		return page, err
	}
	if len(rows) > limit {
		rows = rows[:limit]
		page.NextBeforeVersion = rows[len(rows)-1].Version
	}
	page.Versions = rows
	return page, nil
}

func (s *Service) SaveProjectMediaAnalysis(userID, projectID, id string, req ProjectMediaAnalysisWriteRequest) (ProjectMediaAnalysisWriteResult, error) {
	var result ProjectMediaAnalysisWriteResult
	view, err := s.GetProjectMediaAnalysis(userID, projectID, id, "")
	if err != nil {
		return result, err
	}
	if view.Analysis.SourceKind == "reference_checkpoint" {
		return result, BadAuthRequest("参考片检查点由任务管理，不能改写；请编辑已完成的汇总分析")
	}
	if req.ExpectedRevision == nil {
		return result, &AppError{Status: 428, Code: 428, Reason: "media_analysis_revision_required", Message: "请先读取分析当前版本再保存"}
	}
	req.RequestID, req.Note, req.RestoreRevisionID = strings.TrimSpace(req.RequestID), strings.TrimSpace(req.Note), strings.TrimSpace(req.RestoreRevisionID)
	if len(req.RequestID) < 16 || len(req.RequestID) > 128 || strings.ContainsAny(req.RequestID, "\x00\r\n") || *req.ExpectedRevision < 1 || !utf8.ValidString(req.Note) || utf8.RuneCountInString(req.Note) > 240 {
		return result, BadAuthRequest("保存编号、版本或备注无效")
	}
	if req.Title != nil {
		title := strings.TrimSpace(*req.Title)
		if title == "" || !utf8.ValidString(title) || utf8.RuneCountInString(title) > 240 {
			return result, BadAuthRequest("分析名称需为1至240个字符")
		}
		req.Title = &title
	}
	if req.RestoreRevisionID != "" && req.Document != nil {
		return result, BadAuthRequest("恢复历史版本与直接修改不能同时提交")
	}
	if req.Document != nil {
		doc, err := production.ValidateMediaAnalysisEdits(view.Source, view.Analysis.Kind, *req.Document)
		if err != nil {
			return result, BadAuthRequest("分析修改超出来源区间、包含重叠片段或未核对的手动跟踪点")
		}
		req.Document = &doc
	}
	signature := mediaAnalysisDigest(req)
	if previous, err := s.repo.ProjectMediaAnalysisRevisionForRequest(userID, id, req.RequestID); err == nil {
		if previous.RequestSHA256 != signature {
			return result, &AppError{Status: 409, Code: 409, Reason: "media_analysis_request_conflict", Message: "保存编号已用于其他修改，请先核对当前版本"}
		}
		return ProjectMediaAnalysisWriteResult{View: view, AppliedVersion: *previous, Replayed: true}, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return result, err
	}
	if _, err := s.activeProjectForUser(userID, projectID); err != nil {
		return result, err
	}
	if view.Analysis.Archived && (req.Archived == nil || *req.Archived) {
		return result, BadAuthRequest("请先恢复已归档的分析，再进行修改")
	}
	document := view.Document
	if req.RestoreRevisionID != "" {
		restored, err := s.GetProjectMediaAnalysis(userID, projectID, id, req.RestoreRevisionID)
		if err != nil {
			return result, err
		}
		document = restored.Document
	}
	if req.Document != nil {
		document = *req.Document
	}
	row := view.Analysis
	if req.Title != nil {
		row.Title = *req.Title
	}
	if req.Archived != nil {
		row.Archived = *req.Archived
	}
	row.UpdatedAt = time.Now()
	encoded, _ := json.Marshal(document)
	revision := model.ProjectMediaAnalysisRevision{ID: mediaAnalysisID("media-analysis-edit", id, req.RequestID), AnalysisID: id, UserID: userID, AuthorID: userID, DocumentJSON: string(encoded), RequestID: req.RequestID, RequestSHA256: signature, Note: req.Note, CreatedAt: row.UpdatedAt}
	if revision.Note == "" {
		revision.Note = "保存人工校正"
		if req.RestoreRevisionID != "" {
			revision.Note = "恢复历史校正版本"
		}
	}
	s.storageMu.Lock()
	if err := s.validateProductionDocumentStorage(userID, int64(len(encoded))); err != nil {
		s.storageMu.Unlock()
		return result, err
	}
	replayed, err := s.repo.SaveProjectMediaAnalysis(&row, *req.ExpectedRevision, &revision)
	s.storageMu.Unlock()
	if errors.Is(err, repository.ErrMediaAnalysisRevisionChanged) {
		return result, &AppError{Status: 409, Code: 409, Reason: "media_analysis_revision_changed", Message: "分析已被其他窗口修改，请保留草稿并读取最新版本"}
	}
	if errors.Is(err, repository.ErrMediaAnalysisMutationConflict) {
		return result, &AppError{Status: 409, Code: 409, Reason: "media_analysis_request_conflict", Message: "保存编号已用于其他修改，请先核对当前版本"}
	}
	if err != nil {
		return result, err
	}
	current, err := s.GetProjectMediaAnalysis(userID, projectID, id, "")
	if err != nil {
		return result, err
	}
	return ProjectMediaAnalysisWriteResult{View: current, AppliedVersion: revision, Replayed: replayed}, nil
}
