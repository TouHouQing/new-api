package app

import (
	"encoding/json"
	"errors"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
	"yingce/backend/internal/repository"
)

type ProjectLyricsRequest struct {
	RequestID        string                    `json:"requestId"`
	ExpectedRevision *int64                    `json:"expectedRevision"`
	SourceRevisionID string                    `json:"sourceRevisionId"`
	Lyrics           string                    `json:"lyrics"`
	Anchors          []production.LyricsAnchor `json:"anchors"`
	PreviewToken     string                    `json:"previewToken,omitempty"`
}
type ProjectLyricsPreview struct {
	production.LyricsAlignmentPlan
	TranscriptID     string `json:"transcriptId"`
	SourceRevisionID string `json:"sourceRevisionId"`
	ExpectedRevision int64  `json:"expectedRevision"`
	PreviewToken     string `json:"previewToken"`
}
type ProjectLyricsResult struct {
	View      ProjectTranscriptView `json:"view"`
	RequestID string                `json:"requestId"`
	Current   bool                  `json:"current"`
	Replayed  bool                  `json:"replayed"`
}

func lyricsRequestSignature(projectID, id string, input ProjectLyricsRequest) string {
	input.PreviewToken = ""
	return cutSignature(struct {
		ProjectID, TranscriptID string
		Request                 ProjectLyricsRequest
	}{projectID, id, input})
}
func lyricsRevisionID(projectID, id, requestID string) string {
	return mediaAnalysisID("transcript-lyrics-v1", projectID, id, requestID)
}

func (s *Service) ReadProjectLyricsResult(userID, projectID, id, requestID string) (ProjectLyricsResult, error) {
	var result ProjectLyricsResult
	if !validCutRequestID(requestID) {
		return result, BadAuthRequest("歌词采用编号无效，请保留原编号核对")
	}
	view, err := s.GetProjectTranscriptVersion(userID, projectID, id, lyricsRevisionID(projectID, id, requestID))
	if err != nil {
		return result, err
	}
	if view.Document.Version != 2 || view.Document.Lyrics == nil || view.Document.Lyrics.RequestID != requestID {
		return result, NewAppError(500, "歌词回执无法读取，原文字稿和历史版本仍保留")
	}
	return ProjectLyricsResult{View: view, RequestID: requestID, Current: view.Transcript.CurrentRevisionID == view.CurrentVersion.ID && !view.Transcript.Archived, Replayed: true}, nil
}

func (s *Service) PreviewProjectLyrics(userID, projectID, id string, input ProjectLyricsRequest) (ProjectLyricsPreview, error) {
	var result ProjectLyricsPreview
	if _, err := s.activeProjectForUser(userID, projectID); err != nil {
		return result, transcriptReadError(err)
	}
	if !validCutRequestID(input.RequestID) || input.ExpectedRevision == nil || *input.ExpectedRevision < 1 || input.SourceRevisionID == "" || len(input.SourceRevisionID) > 80 {
		return result, BadAuthRequest("请保留歌词采用编号，并选择当前文字稿与原识别版本")
	}
	parent, err := s.repo.ProjectTranscript(userID, projectID, id)
	if err != nil {
		return result, transcriptReadError(err)
	}
	if parent.Archived {
		return result, BadAuthRequest("请先恢复文字稿，再对齐歌词")
	}
	if parent.Revision != *input.ExpectedRevision {
		return result, transcriptConflict()
	}
	source, err := s.GetProjectTranscriptVersion(userID, projectID, id, input.SourceRevisionID)
	if err != nil {
		return result, err
	}
	resource, err := s.repo.ResourceForUser(userID, parent.ResourceID)
	if err != nil {
		return result, transcriptReadError(err)
	}
	if resource.Status != model.ResourceStatusReady || resource.ETag != parent.SourceETag || resource.Size != parent.SourceBytes || parent.SourceDurationMs <= 0 || resource.DurationMs != parent.SourceDurationMs {
		return result, cutConflict("文字稿源素材已变化或缺少实际时长，请核对原音频")
	}
	plan, err := production.PlanLyricsAlignment(source.Document, input.Lyrics, input.Anchors, parent.SourceDurationMs)
	if err != nil {
		return result, BadAuthRequest(err.Error())
	}
	input.PreviewToken = ""
	token := cutSignature(struct {
		Owner, Project, Transcript string
		Request                    ProjectLyricsRequest
		Plan                       production.LyricsAlignmentPlan
	}{userID, projectID, id, input, plan})
	return ProjectLyricsPreview{LyricsAlignmentPlan: plan, TranscriptID: id, SourceRevisionID: input.SourceRevisionID, ExpectedRevision: parent.Revision, PreviewToken: token}, nil
}

func (s *Service) ApplyProjectLyrics(userID, projectID, id string, input ProjectLyricsRequest) (ProjectLyricsResult, error) {
	var result ProjectLyricsResult
	if _, err := s.activeProjectForUser(userID, projectID); err != nil {
		return result, transcriptReadError(err)
	}
	if !validCutRequestID(input.RequestID) {
		return result, BadAuthRequest("歌词采用编号无效，请保留原编号核对")
	}
	signature := lyricsRequestSignature(projectID, id, input)
	prior := func() (ProjectLyricsResult, error) {
		found, err := s.ReadProjectLyricsResult(userID, projectID, id, input.RequestID)
		if err != nil {
			return found, err
		}
		if found.View.Document.Lyrics.RequestSHA256 != signature {
			return result, cutConflict("这个歌词编号已用于其他内容，请核对原回执")
		}
		return found, nil
	}
	if found, err := prior(); err == nil {
		return found, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		var appErr *AppError
		if !errors.As(err, &appErr) || appErr.Status != 404 {
			return result, err
		}
	}
	if !cloudAgentSHA256(input.PreviewToken) {
		return result, BadAuthRequest("请先预览并核对每句歌词的真实时间")
	}
	plan, err := s.PreviewProjectLyrics(userID, projectID, id, input)
	if err != nil {
		return result, err
	}
	if plan.PreviewToken != input.PreviewToken {
		return result, cutConflict("歌词、来源或时间方案已变化，请保留草稿并重新预览")
	}
	if !plan.CanApply || plan.Document == nil {
		return result, BadAuthRequest("仍有歌词未匹配或未核对，请保留草稿并完成时间校正")
	}
	view, err := s.GetProjectTranscript(userID, projectID, id)
	if err != nil {
		return result, err
	}
	document := *plan.Document
	document.Version = 2
	document.Lyrics = &production.TranscriptLyrics{Text: input.Lyrics, Version: 1, SourceRevisionID: input.SourceRevisionID, SourceDocumentSHA256: plan.SourceDocumentSHA256, LyricsSHA256: plan.LyricsSHA256, RequestID: input.RequestID, RequestSHA256: signature, Lines: plan.Evidence}
	if err := production.ValidateTranscript(document); err != nil {
		return result, BadAuthRequest(err.Error())
	}
	raw, err := json.Marshal(document)
	if err != nil {
		return result, err
	}
	now := time.Now().UTC().Truncate(time.Microsecond)
	revision := &model.ProjectTranscriptRevision{ID: lyricsRevisionID(projectID, id, input.RequestID), TranscriptID: id, UserID: userID, AuthorID: userID, DocumentJSON: string(raw), Note: "歌词时间对齐；原识别版本保留", CreatedAt: now}
	view.Transcript.UpdatedAt = now
	s.storageMu.Lock()
	err = s.validateProductionDocumentStorage(userID, int64(len(raw)))
	if err == nil {
		err = s.repo.SaveProjectTranscript(&view.Transcript, *input.ExpectedRevision, revision)
	}
	s.storageMu.Unlock()
	if err != nil {
		if found, replayErr := prior(); replayErr == nil {
			return found, nil
		}
		if errors.Is(err, repository.ErrTranscriptRevisionChanged) {
			return result, transcriptConflict()
		}
		return result, transcriptReadError(err)
	}
	view.CurrentVersion = *revision
	view.Document = document
	return ProjectLyricsResult{View: view, RequestID: input.RequestID, Current: true, Replayed: false}, nil
}
