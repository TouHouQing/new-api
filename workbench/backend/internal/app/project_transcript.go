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

type ProjectTranscriptCreateRequest struct {
	TaskID string `json:"taskId"`
	Title  string `json:"title"`
}
type ProjectTranscriptWriteRequest struct {
	ExpectedRevision  *int64                            `json:"expectedRevision"`
	Title             *string                           `json:"title,omitempty"`
	Changes           []production.TranscriptCorrection `json:"changes,omitempty"`
	Action            string                            `json:"action,omitempty"`
	RestoreRevisionID string                            `json:"restoreRevisionId,omitempty"`
	Note              string                            `json:"note,omitempty"`
}
type ProjectTranscriptView struct {
	Transcript     model.ProjectTranscript         `json:"transcript"`
	CurrentVersion model.ProjectTranscriptRevision `json:"currentVersion"`
	Document       production.TranscriptDocument   `json:"document"`
}
type ProjectTranscriptPage struct {
	Transcripts []model.ProjectTranscript `json:"transcripts"`
	NextCursor  string                    `json:"nextCursor,omitempty"`
}
type ProjectTranscriptHistoryPage struct {
	Versions          []model.ProjectTranscriptRevision `json:"versions"`
	NextBeforeVersion int64                             `json:"nextBeforeVersion,omitempty"`
}

func transcriptReadError(err error) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return NotFound("文字稿或来源不存在")
	}
	return err
}
func transcriptConflict() *AppError {
	err := NewAppError(409, "文字稿已在其他页面更新，请保留当前修改后载入新版")
	err.Reason = "transcript_revision_conflict"
	return err
}
func (s *Service) transcriptView(userID, projectID, id string) (ProjectTranscriptView, error) {
	parent, err := s.repo.ProjectTranscript(userID, projectID, id)
	if err != nil {
		return ProjectTranscriptView{}, transcriptReadError(err)
	}
	revision, err := s.repo.ProjectTranscriptRevision(userID, parent.ID, parent.CurrentRevisionID)
	if err != nil {
		return ProjectTranscriptView{}, transcriptReadError(err)
	}
	var document production.TranscriptDocument
	if json.Unmarshal([]byte(revision.DocumentJSON), &document) != nil || production.ValidateTranscript(document) != nil {
		failure := NewAppError(500, "文字稿版本无法读取，原始识别结果仍保留，请检查历史版本")
		failure.Reason = "transcript_document_unreadable"
		failure.Details = map[string]any{"transcriptId": parent.ID, "expectedRevision": parent.Revision}
		return ProjectTranscriptView{}, failure
	}
	return ProjectTranscriptView{Transcript: *parent, CurrentVersion: *revision, Document: document}, nil
}
func (s *Service) GetProjectTranscript(userID, projectID, id string) (ProjectTranscriptView, error) {
	if _, err := s.repo.ProjectForUser(userID, projectID); err != nil {
		return ProjectTranscriptView{}, transcriptReadError(err)
	}
	return s.transcriptView(userID, projectID, id)
}
func (s *Service) GetProjectTranscriptForTask(userID, projectID, taskID string) (ProjectTranscriptView, error) {
	if _, err := s.repo.ProjectForUser(userID, projectID); err != nil {
		return ProjectTranscriptView{}, transcriptReadError(err)
	}
	parent, err := s.repo.ProjectTranscriptForTask(userID, projectID, taskID)
	if err != nil {
		return ProjectTranscriptView{}, transcriptReadError(err)
	}
	return s.transcriptView(userID, projectID, parent.ID)
}
func (s *Service) ListProjectTranscripts(userID, projectID, resourceID, cursor string, archived bool, limit int) (ProjectTranscriptPage, error) {
	if _, err := s.repo.ProjectForUser(userID, projectID); err != nil {
		return ProjectTranscriptPage{}, transcriptReadError(err)
	}
	if limit < 1 || limit > 100 || len(resourceID) > 80 || len(cursor) > 80 {
		return ProjectTranscriptPage{}, BadAuthRequest("文字稿分页参数无效")
	}
	before := time.Time{}
	if cursor != "" {
		parent, err := s.repo.ProjectTranscript(userID, projectID, cursor)
		if err != nil || parent.Archived != archived || (resourceID != "" && parent.ResourceID != resourceID) {
			return ProjectTranscriptPage{}, BadAuthRequest("文字稿游标不属于当前筛选，请重新加载")
		}
		before = parent.CreatedAt
	}
	rows, err := s.repo.ProjectTranscriptPage(userID, projectID, resourceID, archived, before, cursor, limit)
	if err != nil {
		return ProjectTranscriptPage{}, err
	}
	page := ProjectTranscriptPage{Transcripts: rows}
	if len(rows) > limit {
		page.Transcripts = rows[:limit]
		page.NextCursor = page.Transcripts[limit-1].ID
	}
	if page.Transcripts == nil {
		page.Transcripts = []model.ProjectTranscript{}
	}
	return page, nil
}
func (s *Service) ProjectTranscriptHistory(userID, projectID, id string, beforeVersion int64, limit int) (ProjectTranscriptHistoryPage, error) {
	if _, err := s.repo.ProjectForUser(userID, projectID); err != nil {
		return ProjectTranscriptHistoryPage{}, transcriptReadError(err)
	}
	if _, err := s.repo.ProjectTranscript(userID, projectID, id); err != nil {
		return ProjectTranscriptHistoryPage{}, transcriptReadError(err)
	}
	if limit < 1 || limit > 100 || beforeVersion < 0 {
		return ProjectTranscriptHistoryPage{}, BadAuthRequest("文字稿历史分页参数无效")
	}
	rows, err := s.repo.ProjectTranscriptHistory(userID, id, beforeVersion, limit)
	if err != nil {
		return ProjectTranscriptHistoryPage{}, err
	}
	page := ProjectTranscriptHistoryPage{Versions: rows}
	if len(rows) > limit {
		page.Versions = rows[:limit]
		page.NextBeforeVersion = page.Versions[limit-1].Version
	}
	if page.Versions == nil {
		page.Versions = []model.ProjectTranscriptRevision{}
	}
	return page, nil
}
func (s *Service) GetProjectTranscriptVersion(userID, projectID, id, revisionID string) (ProjectTranscriptView, error) {
	if _, err := s.repo.ProjectForUser(userID, projectID); err != nil {
		return ProjectTranscriptView{}, transcriptReadError(err)
	}
	parent, err := s.repo.ProjectTranscript(userID, projectID, id)
	if err != nil {
		return ProjectTranscriptView{}, transcriptReadError(err)
	}
	view := ProjectTranscriptView{Transcript: *parent}
	revision, err := s.repo.ProjectTranscriptRevision(userID, id, revisionID)
	if err != nil {
		return ProjectTranscriptView{}, transcriptReadError(err)
	}
	if json.Unmarshal([]byte(revision.DocumentJSON), &view.Document) != nil || production.ValidateTranscript(view.Document) != nil {
		return ProjectTranscriptView{}, NewAppError(500, "此文字稿历史版本无法读取")
	}
	view.CurrentVersion = *revision
	return view, nil
}

func (s *Service) CreateProjectTranscript(userID, projectID string, input ProjectTranscriptCreateRequest) (ProjectTranscriptView, error) {
	if _, err := s.activeProjectForUser(userID, projectID); err != nil {
		return ProjectTranscriptView{}, transcriptReadError(err)
	}
	taskID := strings.TrimSpace(input.TaskID)
	if taskID == "" || len(taskID) > 80 {
		return ProjectTranscriptView{}, BadAuthRequest("请选择已完成的本项目识别任务")
	}
	if previous, err := s.repo.ProjectTranscriptForTask(userID, projectID, taskID); err == nil {
		return s.transcriptView(userID, projectID, previous.ID)
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return ProjectTranscriptView{}, err
	}
	task, err := s.repo.TaskForUser(userID, taskID)
	if err != nil {
		return ProjectTranscriptView{}, transcriptReadError(err)
	}
	if task.ProjectID != projectID || task.Type != model.TaskTypeTimelineTranscription || task.Status != model.TaskStatusSucceeded {
		return ProjectTranscriptView{}, BadAuthRequest("请选择当前项目已完成的识别任务")
	}
	var source struct {
		ResourceID   string `json:"resourceId"`
		SourceClipID string `json:"sourceClipId"`
	}
	var output struct {
		ResourceID   string `json:"resourceId"`
		SourceClipID string `json:"sourceClipId"`
	}
	if json.Unmarshal([]byte(task.InputJSON), &source) != nil || json.Unmarshal([]byte(task.ResultJSON), &output) != nil || source.ResourceID == "" || source.ResourceID != output.ResourceID || source.SourceClipID != output.SourceClipID {
		return ProjectTranscriptView{}, BadAuthRequest("识别结果缺少可靠的素材对应关系，未创建文字稿")
	}
	resource, err := s.repo.ResourceForUser(userID, source.ResourceID)
	if err != nil {
		return ProjectTranscriptView{}, transcriptReadError(err)
	}
	if resource.Status != model.ResourceStatusReady || !isTranscribableMime(resource.MimeType) {
		return ProjectTranscriptView{}, BadAuthRequest("识别来源不是可用的音视频素材")
	}
	document, err := production.ParseRecognitionTranscript([]byte(task.ResultJSON))
	if err != nil {
		return ProjectTranscriptView{}, BadAuthRequest(err.Error())
	}
	for _, spans := range [][]production.TranscriptSpan{document.Segments, document.Words} {
		for _, span := range spans {
			if resource.DurationMs > 0 && span.EndMs > resource.DurationMs {
				return ProjectTranscriptView{}, BadAuthRequest("识别时间超出来源素材，请核对识别结果")
			}
		}
	}
	title := strings.TrimSpace(input.Title)
	if title == "" {
		title = "素材文字稿"
	}
	if utf8.RuneCountInString(title) > 240 {
		return ProjectTranscriptView{}, BadAuthRequest("文字稿名称最多240字")
	}
	encoded, _ := json.Marshal(document)
	now := time.Now()
	parent := model.ProjectTranscript{ID: newID(), UserID: userID, ProjectID: projectID, SourceKind: "recognition", SourceKey: taskID, SourceTaskID: taskID, ResourceID: resource.ID, Title: title, SourceETag: resource.ETag, SourceBytes: resource.Size, SourceDurationMs: resource.DurationMs, Revision: 1, CreatedAt: now, UpdatedAt: now}
	revision := model.ProjectTranscriptRevision{ID: newID(), TranscriptID: parent.ID, Version: 1, UserID: userID, AuthorID: userID, DocumentJSON: string(encoded), Note: "识别原稿", CreatedAt: now}
	parent.CurrentRevisionID = revision.ID
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	if previous, err := s.repo.ProjectTranscriptForTask(userID, projectID, taskID); err == nil {
		return s.transcriptView(userID, projectID, previous.ID)
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return ProjectTranscriptView{}, err
	}
	if err := s.validateProductionDocumentStorage(userID, int64(len(encoded))); err != nil {
		return ProjectTranscriptView{}, err
	}
	created, err := s.repo.CreateProjectTranscript(&parent, &revision)
	if err != nil {
		return ProjectTranscriptView{}, transcriptReadError(err)
	}
	if !created {
		existing, err := s.repo.ProjectTranscriptForTask(userID, projectID, taskID)
		if err != nil {
			return ProjectTranscriptView{}, transcriptReadError(err)
		}
		return s.transcriptView(userID, projectID, existing.ID)
	}
	return ProjectTranscriptView{Transcript: parent, CurrentVersion: revision, Document: document}, nil
}

func (s *Service) validateProductionDocumentStorage(userID string, delta int64) error {
	policy, err := s.RuntimePolicy()
	if err != nil {
		return err
	}
	usage, err := s.repo.UserStructuredStorageUsage(userID)
	if err != nil {
		return err
	}
	return validateStructuredStorageQuotaWithPolicy(usage, "canvas", false, delta, policy.Resource)
}

func (s *Service) UpdateProjectTranscript(userID, projectID, id string, input ProjectTranscriptWriteRequest) (ProjectTranscriptView, error) {
	if _, err := s.activeProjectForUser(userID, projectID); err != nil {
		return ProjectTranscriptView{}, transcriptReadError(err)
	}
	if input.ExpectedRevision == nil || *input.ExpectedRevision < 1 || utf8.RuneCountInString(input.Note) > 240 {
		return ProjectTranscriptView{}, BadAuthRequest("请携带文字稿当前版本，备注最多240字")
	}
	if input.Action == "restore_version" && (input.RestoreRevisionID == "" || len(input.RestoreRevisionID) > 80 || len(input.Changes) > 0 || input.Title != nil) {
		return ProjectTranscriptView{}, BadAuthRequest("请选择要恢复的具体历史版本")
	}
	var view ProjectTranscriptView
	var err error
	if input.Action == "restore_version" {
		view, err = s.GetProjectTranscriptVersion(userID, projectID, id, input.RestoreRevisionID)
	} else {
		view, err = s.transcriptView(userID, projectID, id)
	}
	if err != nil {
		return ProjectTranscriptView{}, err
	}
	if view.Transcript.Revision != *input.ExpectedRevision {
		return ProjectTranscriptView{}, transcriptConflict()
	}
	beforeDocument, _ := json.Marshal(view.Document)
	beforeTitle := view.Transcript.Title
	var revision *model.ProjectTranscriptRevision
	switch input.Action {
	case "archive", "restore":
		if len(input.Changes) > 0 || input.Title != nil || input.RestoreRevisionID != "" {
			return ProjectTranscriptView{}, BadAuthRequest("归档与恢复不同时修改文字")
		}
		archived := input.Action == "archive"
		if view.Transcript.Archived == archived {
			return view, nil
		}
		view.Transcript.Archived = archived
	case "restore_version":
		view.Transcript.Archived = false
	case "":
		if view.Transcript.Archived {
			return ProjectTranscriptView{}, BadAuthRequest("请先恢复文字稿，再校正内容")
		}
		if input.RestoreRevisionID != "" || (len(input.Changes) == 0 && input.Title == nil) {
			return ProjectTranscriptView{}, BadAuthRequest("没有需要保存的修改")
		}
		if len(input.Changes) > 0 {
			corrected, err := production.CorrectTranscript(view.Document, input.Changes)
			if err != nil {
				return ProjectTranscriptView{}, BadAuthRequest(err.Error())
			}
			view.Document = corrected
		}
		if input.Title != nil {
			title := strings.TrimSpace(*input.Title)
			if title == "" || utf8.RuneCountInString(title) > 240 {
				return ProjectTranscriptView{}, BadAuthRequest("文字稿名称需要1到240字")
			}
			view.Transcript.Title = title
		}
	default:
		return ProjectTranscriptView{}, BadAuthRequest("不支持的文字稿操作")
	}
	afterDocument, _ := json.Marshal(view.Document)
	if input.Action == "" && string(beforeDocument) == string(afterDocument) && beforeTitle == view.Transcript.Title {
		return view, nil
	}
	if len(input.Changes) > 0 || input.Action == "restore_version" {
		encoded, _ := json.Marshal(view.Document)
		note := strings.TrimSpace(input.Note)
		if note == "" {
			if input.Action == "restore_version" {
				note = "恢复历史文字稿"
			} else {
				note = "校正文字与说话人"
			}
		}
		revision = &model.ProjectTranscriptRevision{ID: newID(), TranscriptID: id, UserID: userID, AuthorID: userID, DocumentJSON: string(encoded), Note: note, CreatedAt: time.Now()}
	}
	view.Transcript.UpdatedAt = time.Now()
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	if revision != nil {
		if err := s.validateProductionDocumentStorage(userID, int64(len(revision.DocumentJSON))); err != nil {
			return ProjectTranscriptView{}, err
		}
	}
	if err := s.repo.SaveProjectTranscript(&view.Transcript, *input.ExpectedRevision, revision); err != nil {
		if errors.Is(err, repository.ErrTranscriptRevisionChanged) {
			return ProjectTranscriptView{}, transcriptConflict()
		}
		return ProjectTranscriptView{}, transcriptReadError(err)
	}
	if revision != nil {
		view.CurrentVersion = *revision
	}
	return view, nil
}
