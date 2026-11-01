package app

import (
	"encoding/json"
	"errors"
	"path"
	"strings"
	"time"
	"unicode/utf8"

	"gorm.io/gorm"
	"yingce/backend/internal/assets"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
	"yingce/backend/internal/repository"
)

type CanvasCutClipView struct {
	production.CanvasCutClip
	PinnedAvailable bool `json:"pinnedAvailable"`
	NeedsResource   bool `json:"needsResource"`
}
type CanvasCutSourcePage struct {
	CanvasID           string              `json:"canvasId"`
	CanvasRevision     int64               `json:"canvasRevision"`
	Title              string              `json:"title"`
	SourceSHA256       string              `json:"sourceSha256"`
	ClipCount          int                 `json:"clipCount"`
	NeedsResourceCount int                 `json:"needsResourceCount"`
	NeedsTextCount     int                 `json:"needsTextCount"`
	Clips              []CanvasCutClipView `json:"clips"`
	NextCursor         *int                `json:"nextCursor,omitempty"`
}
type CanvasCutConvertRequest struct {
	RequestID                string                        `json:"requestId"`
	ExpectedProjectRevision  int64                         `json:"expectedProjectRevision"`
	ExpectedTimelineRevision int64                         `json:"expectedTimelineRevision"`
	CanvasID                 string                        `json:"canvasId"`
	CanvasRevision           int64                         `json:"canvasRevision"`
	SourceSHA256             string                        `json:"sourceSha256"`
	Title                    string                        `json:"title"`
	Mappings                 []production.CanvasCutMapping `json:"mappings"`
	Texts                    []production.CanvasCutText    `json:"texts"`
	PreviewToken             string                        `json:"previewToken,omitempty"`
}
type CanvasCutConvertPreview struct {
	CutID                    string            `json:"cutId"`
	Title                    string            `json:"title"`
	CanvasID                 string            `json:"canvasId"`
	SourceSHA256             string            `json:"sourceSha256"`
	ExpectedProjectRevision  int64             `json:"expectedProjectRevision"`
	ExpectedTimelineRevision int64             `json:"expectedTimelineRevision"`
	Summary                  ProjectCutSummary `json:"summary"`
	PinnedMedia              int               `json:"pinnedMedia"`
	ExplicitMedia            int               `json:"explicitMedia"`
	SupplementedTexts        int               `json:"supplementedTexts"`
	Warnings                 []string          `json:"warnings"`
	PreviewToken             string            `json:"previewToken"`
}

func (s *Service) canvasCutDefinition(userID, projectID, canvasID string) (*model.CanvasProject, production.CanvasCutDefinition, error) {
	var empty production.CanvasCutDefinition
	if !validProductionOpaqueID(canvasID) {
		return nil, empty, BadAuthRequest("请选择当前项目的画布")
	}
	if _, err := s.activeProjectForUser(userID, projectID); err != nil {
		return nil, empty, err
	}
	canvas, err := s.repo.CanvasProjectForUser(userID, canvasID)
	if err != nil || canvas.ProjectID != projectID {
		return nil, empty, NotFound("画布不存在或未关联当前项目")
	}
	var document struct {
		Timeline json.RawMessage `json:"timeline"`
	}
	if json.Unmarshal([]byte(canvas.PayloadJSON), &document) != nil {
		return nil, empty, BadAuthRequest("画布数据无法读取，请保留原工程")
	}
	if len(document.Timeline) == 0 || string(document.Timeline) == "null" {
		return nil, empty, NotFound("此画布没有已保存剪辑，请选择其他画布")
	}
	definition, err := production.InspectCanvasTimelineCut(document.Timeline)
	if err != nil {
		return nil, empty, BadAuthRequest(err.Error())
	}
	return canvas, definition, nil
}

func (s *Service) ReadCanvasTimelineCut(userID, projectID, canvasID, sourceSHA string, cursor, limit int) (CanvasCutSourcePage, error) {
	var result CanvasCutSourcePage
	if cursor < 0 || limit < 1 || limit > 100 || cursor > 0 && len(sourceSHA) != 64 {
		return result, BadAuthRequest("原画布片段分页无效，请携带已读取的剪辑摘要")
	}
	canvas, source, err := s.canvasCutDefinition(userID, projectID, canvasID)
	if err != nil {
		return result, err
	}
	if cursor > len(source.Clips) || sourceSHA != "" && sourceSHA != source.SourceSHA256 {
		return result, canvasCutSourceChangedError()
	}
	ids := map[string]struct{}{}
	for _, clip := range source.Clips {
		if clip.PinnedResourceID != "" {
			ids[clip.PinnedResourceID] = struct{}{}
		}
	}
	available := map[string]string{}
	ordered := assets.SortedIDs(ids)
	for start := 0; start < len(ordered); start += 256 {
		rows, err := s.repo.ResourcesForUserIDs(userID, ordered[start:min(start+256, len(ordered))])
		if err != nil {
			return result, err
		}
		for _, row := range rows {
			if row.Status == model.ResourceStatusReady {
				available[row.ID] = uploadedResourceKind(row.MimeType)
			}
		}
	}
	result = CanvasCutSourcePage{CanvasID: canvas.ID, CanvasRevision: canvas.Revision, Title: canvas.Title, SourceSHA256: source.SourceSHA256, ClipCount: len(source.Clips), Clips: []CanvasCutClipView{}}
	for index, clip := range source.Clips {
		pinnedAvailable := available[clip.PinnedResourceID] == clip.Kind
		needsResource := (clip.Kind == "video" || clip.Kind == "audio" || clip.Kind == "image") && !pinnedAvailable
		if needsResource {
			result.NeedsResourceCount++
		}
		if clip.NeedsText {
			result.NeedsTextCount++
		}
		if index >= cursor && index < cursor+limit {
			result.Clips = append(result.Clips, CanvasCutClipView{CanvasCutClip: clip, PinnedAvailable: pinnedAvailable, NeedsResource: needsResource})
		}
	}
	if next := cursor + limit; next < len(source.Clips) {
		result.NextCursor = &next
	}
	return result, nil
}

func canvasCutSourceChangedError() *AppError {
	err := NewAppError(409, "原画布剪辑已变化，本次未转换；请重新读取并核对片段")
	err.Reason = "canvas_timeline_source_changed"
	return err
}
func normalizedCanvasCutRequest(req CanvasCutConvertRequest) (CanvasCutConvertRequest, string, error) {
	req.Title = strings.TrimSpace(req.Title)
	if req.Mappings == nil {
		req.Mappings = []production.CanvasCutMapping{}
	}
	if req.Texts == nil {
		req.Texts = []production.CanvasCutText{}
	}
	if !validCutRequestID(req.RequestID) || !validProductionOpaqueID(req.CanvasID) || req.CanvasRevision < 1 || req.ExpectedProjectRevision < 1 || req.ExpectedTimelineRevision < 0 || len(req.SourceSHA256) != 64 || strings.Trim(req.SourceSHA256, "0123456789abcdef") != "" || req.Title == "" || utf8.RuneCountInString(req.Title) > 200 || len(req.Mappings) > 5000 || len(req.Texts) > 5000 {
		return req, "", BadAuthRequest("请核对画布来源、项目版本、剪辑名称和具体片段选择")
	}
	input := req
	input.PreviewToken = ""
	return req, cutSignature(struct {
		Kind  string
		Input CanvasCutConvertRequest
	}{"canvas-timeline-cut-v1", input}), nil
}

func (s *Service) buildCanvasTimelineCut(userID, projectID string, req CanvasCutConvertRequest, signature string) (*model.ProjectCut, CanvasCutConvertPreview, error) {
	var plan CanvasCutConvertPreview
	canvas, source, err := s.canvasCutDefinition(userID, projectID, req.CanvasID)
	if err != nil {
		return nil, plan, err
	}
	if canvas.Revision < req.CanvasRevision || source.SourceSHA256 != req.SourceSHA256 {
		return nil, plan, canvasCutSourceChangedError()
	}
	project, err := s.activeProjectForUser(userID, projectID)
	if err != nil {
		return nil, plan, err
	}
	current, err := s.GetProjectTimeline(userID, projectID)
	if err != nil {
		return nil, plan, err
	}
	if project.Revision != req.ExpectedProjectRevision || current.Revision != req.ExpectedTimelineRevision {
		return nil, plan, cutConflict("项目或工作剪辑已变化，请保留选择并重新预览")
	}
	// Explicit replacements supersede only their own occurrence's original.
	// Do not demand an unavailable original that the user is replacing.
	selected := map[string]string{}
	for _, mapping := range req.Mappings {
		selected[mapping.ClipID] = mapping.ResourceID
	}
	ids := map[string]struct{}{}
	for _, clip := range source.Clips {
		if clip.Kind != "video" && clip.Kind != "audio" && clip.Kind != "image" {
			continue
		}
		id := selected[clip.ID]
		if id == "" {
			id = clip.PinnedResourceID
		}
		if id != "" {
			ids[id] = struct{}{}
		}
	}
	media := map[string]production.TimelineEditMedia{}
	for _, id := range assets.SortedIDs(ids) {
		resource, err := s.resourceAdoptionMetadata(userID, id)
		if err != nil || resource.Status != model.ResourceStatusReady {
			if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, plan, err
			}
			return nil, plan, BadAuthRequest("所选原片不存在、不属于当前账号或尚未就绪，请替换对应片段")
		}
		media[id] = production.TimelineEditMedia{ResourceID: id, Kind: uploadedResourceKind(resource.MimeType), MIME: resource.MimeType, ETag: resource.ETag, Bytes: resource.Size, Width: resource.Width, Height: resource.Height, DurationMs: resource.DurationMs, Title: path.Base(resource.ObjectKey)}
	}
	timeline, origins, err := production.ConvertCanvasTimelineCut(source, req.Mappings, req.Texts, media)
	if err != nil {
		return nil, plan, BadAuthRequest(err.Error())
	}
	if err := s.validateProjectTimelineMedia(userID, projectID, timeline); err != nil {
		return nil, plan, err
	}
	summary := cutSummary(timeline)
	metadata, err := json.Marshal(map[string]any{"kind": "canvas-timeline-cut-v1", "requestId": req.RequestID, "source": map[string]any{"canvasId": req.CanvasID, "canvasRevision": req.CanvasRevision, "sourceSha256": source.SourceSHA256}, "originalTimeline": source.OriginalTimeline, "media": origins, "supplementedTexts": req.Texts})
	if err != nil {
		return nil, plan, err
	}
	cut := &model.ProjectCut{ID: mediaAnalysisID("canvas-timeline-cut-v1", userID, projectID, req.RequestID), UserID: userID, ProjectID: projectID, RequestID: req.RequestID, RequestSHA256: signature, Title: req.Title, Kind: "snapshot", SourceKey: "canvas-timeline-cut-v1:" + source.SourceSHA256, TimelineRevision: req.ExpectedTimelineRevision, TimelineSHA256: summary.SHA256, PayloadJSON: string(timeline), MetadataJSON: string(metadata), CreatedAt: time.Now()}
	plan = CanvasCutConvertPreview{CutID: cut.ID, Title: req.Title, CanvasID: req.CanvasID, SourceSHA256: source.SourceSHA256, ExpectedProjectRevision: req.ExpectedProjectRevision, ExpectedTimelineRevision: req.ExpectedTimelineRevision, Summary: summary, SupplementedTexts: len(req.Texts), Warnings: []string{"将增加一个独立剪辑版本；原画布剪辑与当前工作剪辑保留。", "字幕样式等设定会保留；成片效果仍需实际预览、导出核对。"}}
	for _, origin := range origins {
		if origin.Resolution == "pinned" {
			plan.PinnedMedia++
		} else {
			plan.ExplicitMedia++
		}
	}
	plan.PreviewToken = cutSignature(struct{ UserID, ProjectID, RequestSHA256, TimelineSHA256, Metadata string }{userID, projectID, signature, summary.SHA256, string(metadata)})
	return cut, plan, nil
}

func (s *Service) PreviewCanvasTimelineCut(userID, projectID string, req CanvasCutConvertRequest) (CanvasCutConvertPreview, error) {
	normalized, signature, err := normalizedCanvasCutRequest(req)
	if err != nil {
		return CanvasCutConvertPreview{}, err
	}
	_, plan, err := s.buildCanvasTimelineCut(userID, projectID, normalized, signature)
	return plan, err
}
func (s *Service) ApplyCanvasTimelineCut(userID, projectID string, req CanvasCutConvertRequest) (ProjectCutView, error) {
	normalized, signature, err := normalizedCanvasCutRequest(req)
	if err != nil {
		return ProjectCutView{}, err
	}
	if _, err := s.repo.ProjectForUser(userID, projectID); err != nil {
		return ProjectCutView{}, NotFound("项目不存在或无权查看")
	}
	if previous, err := s.repo.ProjectCutForRequest(userID, projectID, req.RequestID); err == nil {
		if previous.RequestSHA256 != signature {
			return ProjectCutView{}, cutConflict("同一转换编号已用于不同选择，请先核对原结果")
		}
		return projectCutView(previous, true)
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return ProjectCutView{}, err
	}
	cut, plan, err := s.buildCanvasTimelineCut(userID, projectID, normalized, signature)
	if err != nil {
		return ProjectCutView{}, err
	}
	if req.PreviewToken == "" || req.PreviewToken != plan.PreviewToken {
		return ProjectCutView{}, cutConflict("转换预览已变化，请重新核对原片与片段")
	}
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	if err := s.validateProductionDocumentStorage(userID, int64(len(cut.PayloadJSON)+len(cut.MetadataJSON))); err != nil {
		return ProjectCutView{}, err
	}
	err = s.repo.CreateCanvasTimelineCut(cut, repository.CanvasTimelineCutSource{CanvasID: req.CanvasID, Revision: req.CanvasRevision, SHA256: req.SourceSHA256}, req.ExpectedTimelineRevision, req.ExpectedProjectRevision)
	if err != nil {
		if previous, e := s.repo.ProjectCutForRequest(userID, projectID, req.RequestID); e == nil && previous.RequestSHA256 == signature {
			return projectCutView(previous, true)
		}
		if errors.Is(err, repository.ErrCanvasTimelineSourceChanged) {
			return ProjectCutView{}, canvasCutSourceChangedError()
		}
		if errors.Is(err, repository.ErrTimelineResourceChanged) {
			return ProjectCutView{}, timelineResourceChangedError()
		}
		if errors.Is(err, repository.ErrProjectTimelineConflict) {
			return ProjectCutView{}, cutConflict("项目或工作剪辑已变化，转换未写入，请重新预览")
		}
		return ProjectCutView{}, err
	}
	return projectCutView(cut, false)
}
