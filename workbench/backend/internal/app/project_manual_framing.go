package app

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"strings"
	"time"
	"unicode/utf8"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
	"yingce/backend/internal/repository"
)

type ProjectManualFramingRequest struct {
	RequestID                string  `json:"requestId"`
	ProjectID                string  `json:"projectId,omitempty"`
	ResourceID               string  `json:"resourceId"`
	SourceClipID             string  `json:"sourceClipId"`
	ExpectedTimelineRevision *int64  `json:"expectedTimelineRevision"`
	StartMs                  *int64  `json:"startMs,omitempty"`
	EndMs                    *int64  `json:"endMs,omitempty"`
	TargetAspect             float64 `json:"targetAspect,omitempty"`
	Title                    string  `json:"title,omitempty"`
}

type ProjectManualFramingResult struct {
	View     ProjectMediaAnalysisView `json:"view"`
	Replayed bool                     `json:"replayed"`
}

func (s *Service) CreateProjectManualFraming(ctx context.Context, userID, projectID string, req ProjectManualFramingRequest) (ProjectManualFramingResult, error) {
	var result ProjectManualFramingResult
	project, err := s.activeProjectForUser(userID, projectID)
	if err != nil {
		return result, err
	}
	req.RequestID, req.ResourceID, req.SourceClipID, req.Title = strings.TrimSpace(req.RequestID), strings.TrimSpace(req.ResourceID), strings.TrimSpace(req.SourceClipID), strings.TrimSpace(req.Title)
	if (req.ProjectID != "" && req.ProjectID != projectID) || len(req.RequestID) < 16 || len(req.RequestID) > 128 || strings.ContainsAny(req.RequestID, "\x00\r\n") || req.ResourceID == "" || len(req.ResourceID) > 80 || req.SourceClipID == "" || len(req.SourceClipID) > 128 || req.ExpectedTimelineRevision == nil || *req.ExpectedTimelineRevision < 1 || !utf8.ValidString(req.Title) || utf8.RuneCountInString(req.Title) > 240 || math.IsNaN(req.TargetAspect) || math.IsInf(req.TargetAspect, 0) || (req.TargetAspect != 0 && (req.TargetAspect < .1 || req.TargetAspect > 10)) {
		return result, BadAuthRequest("请保存剪辑、选择视频片段并提供有效的手工构图参数")
	}
	req.ProjectID = projectID
	id := mediaAnalysisID("manual-framing", userID, projectID, req.RequestID)
	revisionID := mediaAnalysisID("manual-framing-initial-version", id)
	signature := mediaAnalysisDigest(req)
	replay := func() (ProjectManualFramingResult, error) {
		row, err := s.repo.ProjectMediaAnalysis(userID, projectID, id)
		if err != nil {
			return result, err
		}
		initial, err := s.repo.ProjectMediaAnalysisRevision(userID, id, revisionID)
		if err != nil {
			return result, err
		}
		if row.SourceKind != "manual_framing" || row.ResourceID != req.ResourceID || initial.RequestSHA256 != signature {
			return result, &AppError{Status: 409, Code: 409, Reason: "manual_framing_request_conflict", Message: "此创建编号已用于其他构图，请先查看已保存的草稿"}
		}
		view, err := s.GetProjectMediaAnalysis(userID, projectID, id, "")
		return ProjectManualFramingResult{View: view, Replayed: true}, err
	}
	if existing, err := replay(); err == nil {
		return existing, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return result, err
	}
	if s.IsDraining() {
		return result, &AppError{Status: 503, Code: 503, Message: "服务正在维护，请稍后创建构图", Retryable: true}
	}
	timeline, err := s.GetProjectTimeline(userID, projectID)
	if err != nil {
		return result, err
	}
	if !timeline.Exists || timeline.Revision != *req.ExpectedTimelineRevision {
		return result, &AppError{Status: 409, Code: 409, Reason: "project_timeline_revision_conflict", Message: "剪辑已变化，请保留草稿并重新读取"}
	}
	binding, start, end, err := s.analysisOccurrence(userID, projectID, req.SourceClipID, req.ResourceID)
	if err != nil {
		return result, err
	}
	if req.StartMs != nil {
		if *req.StartMs < start || *req.StartMs >= end {
			return result, BadAuthRequest("构图起点超出所选片段")
		}
		start = *req.StartMs
	}
	if req.EndMs != nil {
		if *req.EndMs > end {
			return result, BadAuthRequest("构图终点超出所选片段")
		}
		end = *req.EndMs
	}
	if start < 0 || end-start < 50 || end-start > 120000 {
		return result, BadAuthRequest("手工构图区间需为0.05至120秒，可先拆分较长片段")
	}
	aspect := req.TargetAspect
	if aspect == 0 {
		format, err := timelineOutputFormat(project.AspectRatio)
		if err != nil {
			return result, err
		}
		aspect = float64(format.Width) / float64(format.Height)
	}
	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	resource, file, digest, cleanup, err := s.spoolAnalysisSource(ctx, userID, req.ResourceID)
	if cleanup != nil {
		defer cleanup()
	}
	if err != nil {
		return result, err
	}
	if resource.Kind != "video" {
		return result, BadAuthRequest("手工构图需要视频素材")
	}
	width, height, duration, err := inspectProductionImportMedia(ctx, file, resource.MimeType)
	if err != nil {
		return result, err
	}
	source := production.MediaAnalysisSource{DisplayGeometryVersion: 1, ResourceID: resource.ID, SHA256: digest, ETag: resource.ETag, Bytes: resource.Size, DurationMs: duration, StartMs: start, EndMs: end, Width: width, Height: height, SourceClipID: req.SourceClipID, ClipBindingSHA256: binding}
	if production.ValidateMediaAnalysisSource(source, "subject_track") != nil {
		return result, BadAuthRequest("构图区间超出原视频，请先调整片段")
	}
	crop := production.AnalysisRectangle{Width: 1, Height: 1}
	originalAspect := float64(width) / float64(height)
	if originalAspect > aspect {
		crop.Width = aspect / originalAspect
	} else {
		crop.Height = originalAspect / aspect
	}
	crop.X, crop.Y = (1-crop.Width)/2, (1-crop.Height)/2
	if crop.Width*float64(width) < 2 || crop.Height*float64(height) < 2 {
		return result, BadAuthRequest("原片尺寸不足以使用这个构图比例")
	}
	// Proposed endpoints remain unapproved. This record has no model or
	// tracking task; user confirmation is separate from algorithm evidence.
	document := production.MediaAnalysisEdits{Version: 1, Sections: []production.AnalysisSection{}, Beats: []production.AnalysisBeat{}, Tracking: []production.AnalysisTrackingPoint{
		{ID: "point:0", TimeMs: start, ROI: crop, Crop: crop},
		{ID: "point:1", TimeMs: end - 1, ROI: crop, Crop: crop},
	}}
	evidence := map[string]any{"kind": "subject_track", "method": production.ManualFramingMethod, "duration": float64(end-start) / 1000, "target_aspect": aspect, "algorithm_measurement": false, "points": []map[string]any{
		{"time": 0, "roi": crop, "crop": crop, "confidence": 0, "review_required": true, "reason": "manual_framing_proposal"},
		{"time": float64(end-start-1) / 1000, "roi": crop, "crop": crop, "confidence": 0, "review_required": true, "reason": "manual_framing_proposal"},
	}}
	sourceJSON, _ := json.Marshal(source)
	evidenceJSON, _ := json.Marshal(evidence)
	documentJSON, _ := json.Marshal(document)
	title := req.Title
	if title == "" {
		title = "手工构图"
	}
	now := time.Now()
	row := model.ProjectMediaAnalysis{ID: id, UserID: userID, ProjectID: projectID, Kind: "subject_track", SourceKind: "manual_framing", SourceKey: id, ResourceID: resource.ID, Title: title, SourceJSON: string(sourceJSON), EvidenceJSON: string(evidenceJSON), CurrentRevisionID: revisionID, Revision: 1, CreatedAt: now, UpdatedAt: now}
	revision := model.ProjectMediaAnalysisRevision{ID: revisionID, AnalysisID: id, RequestID: "manual-initial:" + id, RequestSHA256: signature, Version: 1, UserID: userID, AuthorID: userID, DocumentJSON: string(documentJSON), Note: "手工构图初始建议，等待核对", CreatedAt: now}
	s.storageMu.Lock()
	if err := s.validateProductionDocumentStorage(userID, int64(len(sourceJSON)+len(evidenceJSON)+len(documentJSON)+len(title))); err != nil {
		s.storageMu.Unlock()
		return result, err
	}
	created, err := s.repo.CreateProjectManualFraming(&row, &revision, *req.ExpectedTimelineRevision)
	s.storageMu.Unlock()
	if errors.Is(err, repository.ErrProjectTimelineConflict) {
		if existing, lookupErr := replay(); lookupErr == nil {
			return existing, nil
		}
		return result, &AppError{Status: 409, Code: 409, Reason: "project_timeline_revision_conflict", Message: "创建期间剪辑已变化，请保留草稿并重新读取"}
	}
	if errors.Is(err, repository.ErrMediaAnalysisMutationConflict) {
		return replay()
	}
	if err != nil {
		return result, err
	}
	if !created {
		return replay()
	}
	view, err := s.GetProjectMediaAnalysis(userID, projectID, id, "")
	return ProjectManualFramingResult{View: view}, err
}
