package app

import (
	"encoding/json"
	"errors"
	"strconv"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
	"yingce/backend/internal/repository"
)

type TimelineEditRequest struct {
	RequestID        string                           `json:"requestId"`
	ExpectedRevision int64                            `json:"expectedRevision"`
	Commands         []production.TimelineEditCommand `json:"commands"`
	PreviewToken     string                           `json:"previewToken,omitempty"`
}
type TimelineEditPreview struct {
	CutID            string                           `json:"cutId"`
	BackupCutID      string                           `json:"backupCutId"`
	ExpectedRevision int64                            `json:"expectedRevision"`
	Before           ProjectCutSummary                `json:"before"`
	After            ProjectCutSummary                `json:"after"`
	Changes          []production.TranscriptCutChange `json:"changes"`
	Timeline         json.RawMessage                  `json:"timeline,omitempty"`
	PreviewToken     string                           `json:"previewToken"`
}
type TimelineEditResult struct {
	Kind            string              `json:"kind"`
	Plan            TimelineEditPreview `json:"plan"`
	AppliedRevision int64               `json:"appliedRevision"`
	Replayed        bool                `json:"replayed"`
}

func timelineEditSignature(request TimelineEditRequest) string {
	request.PreviewToken = ""
	return cutSignature(struct {
		Kind    string
		Request TimelineEditRequest
	}{"timeline-edit-v1", request})
}

func timelineEditChanges(before, after json.RawMessage) []production.TranscriptCutChange {
	var left, right struct {
		Clips []json.RawMessage `json:"clips"`
	}
	json.Unmarshal(before, &left)
	json.Unmarshal(after, &right)
	old, current := map[string]json.RawMessage{}, map[string]json.RawMessage{}
	for _, row := range left.Clips {
		var clip struct {
			ID string `json:"id"`
		}
		json.Unmarshal(row, &clip)
		old[clip.ID] = row
	}
	for _, row := range right.Clips {
		var clip struct {
			ID string `json:"id"`
		}
		json.Unmarshal(row, &clip)
		current[clip.ID] = row
	}
	changes := []production.TranscriptCutChange{}
	for _, row := range left.Clips {
		var clip struct{ ID, Title, Kind string }
		json.Unmarshal(row, &clip)
		next, exists := current[clip.ID]
		if exists && string(next) == string(row) {
			continue
		}
		change := production.TranscriptCutChange{ClipID: clip.ID, Title: clip.Title, Kind: clip.Kind, Action: "change", ResultClipIDs: []string{clip.ID}}
		if !exists {
			change.Action = "remove"
			change.ResultClipIDs = []string{}
		}
		changes = append(changes, change)
	}
	for _, row := range right.Clips {
		var clip struct{ ID, Title, Kind string }
		json.Unmarshal(row, &clip)
		if _, exists := old[clip.ID]; !exists {
			changes = append(changes, production.TranscriptCutChange{ClipID: clip.ID, Title: clip.Title, Kind: clip.Kind, Action: "add", ResultClipIDs: []string{clip.ID}})
		}
	}
	return changes
}

func (s *Service) PreviewTimelineEdits(userID, projectID string, request TimelineEditRequest) (TimelineEditPreview, error) {
	var result TimelineEditPreview
	if !validCutRequestID(request.RequestID) || request.ExpectedRevision < 0 {
		return result, BadAuthRequest("请提供明确的编辑编号和当前时间线版本")
	}
	if _, err := s.activeProjectForUser(userID, projectID); err != nil {
		return result, err
	}
	current, err := s.GetProjectTimeline(userID, projectID)
	if err != nil {
		return result, err
	}
	if current.Revision != request.ExpectedRevision {
		return result, cutConflict("剪辑已更新，请保留输入并重新预览")
	}
	before, err := production.ValidateTimelineDocument(current.Timeline)
	if err != nil {
		return result, NewAppError(500, "当前剪辑无法校验，请保留原文件并检查备份")
	}
	if err := s.validateProjectTimelineMedia(userID, projectID, before); err != nil {
		return result, err
	}
	for index := range request.Commands {
		command := &request.Commands[index]
		if command.Op == "arrangeToBeats" {
			view, readErr := s.GetProjectMediaAnalysis(userID, projectID, command.AnalysisID, command.AnalysisRevisionID)
			if readErr != nil {
				return result, readErr
			}
			if command.AnalysisRevisionID == "" || view.Analysis.Archived || view.Analysis.Kind != "audio_structure" {
				return result, BadAuthRequest("请选择未归档的固定音乐分析版本")
			}
			resource, readErr := s.repo.ResourceForUser(userID, view.Source.ResourceID)
			if readErr != nil || resource.Status != model.ResourceStatusReady || resource.ETag != view.Source.ETag || resource.Size != view.Source.Bytes || resource.DurationMs != view.Source.DurationMs {
				return result, cutConflict("音乐来源已变化，请核对原分析与素材")
			}
			command.Beats = &production.BeatArrangementSource{Source: view.Source, Document: view.Document}
			continue
		}
		if command.Op == "removeVideoRepair" {
			command.RepairRestoration, err = s.resolveVideoReworkRestoration(userID, projectID, before, *command)
			if err != nil {
				return result, err
			}
			continue
		}
		if command.Op == "applyVideoRepair" {
			command.Repair, err = s.resolveVideoReworkCandidate(userID, projectID, *command)
			if err != nil {
				return result, err
			}
			continue
		}
		if command.Op != "addResource" && command.Op != "addCanvasNode" {
			continue
		}
		resource, err := s.resourceAdoptionMetadata(userID, command.ResourceID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return result, BadAuthRequest("素材不存在、不属于当前账号或尚未就绪")
			}
			return result, err
		}
		if resource.Status != model.ResourceStatusReady {
			return result, BadAuthRequest("素材不存在、不属于当前账号或尚未就绪")
		}
		kind := uploadedResourceKind(resource.MimeType)
		if kind != "image" && kind != "video" && kind != "audio" {
			return result, BadAuthRequest("请选择图片、视频或声音素材")
		}
		command.Media = &production.TimelineEditMedia{ClipID: mediaAnalysisID("timeline-ingest-clip-v1", userID, projectID, request.RequestID, strconv.Itoa(index)), ResourceID: resource.ID, Kind: kind, MIME: resource.MimeType, ETag: resource.ETag, Bytes: resource.Size, Width: resource.Width, Height: resource.Height, DurationMs: resource.DurationMs}
		if command.Op == "addCanvasNode" {
			if err := s.resolveCanvasTimelineMedia(userID, projectID, command); err != nil {
				return result, err
			}
		}
	}
	after, err := production.ApplyTimelineEdits(before, request.Commands)
	if err != nil {
		return result, BadAuthRequest(err.Error())
	}
	if err := s.validateProjectTimelineMedia(userID, projectID, after); err != nil {
		return result, err
	}
	result = TimelineEditPreview{CutID: mediaAnalysisID("timeline-edit-cut-v1", userID, projectID, request.RequestID), BackupCutID: mediaAnalysisID("timeline-edit-before-v1", userID, projectID, request.RequestID), ExpectedRevision: current.Revision, Before: cutSummary(before), After: cutSummary(after), Changes: timelineEditChanges(before, after), Timeline: after}
	if len(result.Changes) == 0 {
		return TimelineEditPreview{}, BadAuthRequest("这些动作没有改变剪辑，请调整后再应用")
	}
	proof := result
	proof.Timeline = nil
	result.PreviewToken = cutSignature(struct {
		User, Project, Signature string
		Plan                     TimelineEditPreview
	}{userID, projectID, timelineEditSignature(request), proof})
	return result, nil
}

func (s *Service) ReadTimelineEditResult(userID, projectID, requestID string) (TimelineEditResult, error) {
	var result TimelineEditResult
	if _, err := s.repo.ProjectForUser(userID, projectID); err != nil {
		return result, NotFound("项目不存在或无权查看")
	}
	if !validCutRequestID(requestID) {
		return result, BadAuthRequest("编辑编号无效")
	}
	row, err := s.repo.ProjectCutApplyForRequest(userID, projectID, requestID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return result, NotFound("此编辑编号尚无完成回执")
	}
	if err != nil {
		return result, err
	}
	if json.Unmarshal([]byte(row.ResultJSON), &result) != nil {
		return result, NewAppError(500, "编辑回执无法读取，请保留当前剪辑")
	}
	if result.Kind != "timeline-edit" {
		return TimelineEditResult{}, cutConflict("此编号属于另一种剪辑操作，请使用原操作核对回执")
	}
	result.Replayed = true
	return result, nil
}

func (s *Service) ApplyTimelineEdits(userID, projectID string, request TimelineEditRequest) (TimelineEditResult, error) {
	var result TimelineEditResult
	if _, err := s.repo.ProjectForUser(userID, projectID); err != nil {
		return result, NotFound("项目不存在或无权查看")
	}
	if !validCutRequestID(request.RequestID) {
		return result, BadAuthRequest("编辑编号无效")
	}
	signature := timelineEditSignature(request)
	if previous, err := s.repo.ProjectCutApplyForRequest(userID, projectID, request.RequestID); err == nil {
		if previous.RequestSHA256 != signature {
			return result, cutConflict("此编辑编号已用于不同内容")
		}
		return s.ReadTimelineEditResult(userID, projectID, request.RequestID)
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return result, err
	}
	plan, err := s.PreviewTimelineEdits(userID, projectID, request)
	if err != nil {
		return result, err
	}
	if request.PreviewToken == "" || request.PreviewToken != plan.PreviewToken {
		return result, cutConflict("编辑预览已变化，请重新检查并确认")
	}
	before, err := s.GetProjectTimeline(userID, projectID)
	if err != nil {
		return result, err
	}
	clean, err := production.ValidateTimelineDocument(before.Timeline)
	if err != nil || before.Revision != plan.ExpectedRevision || cutSummary(clean).SHA256 != plan.Before.SHA256 {
		return result, cutConflict("剪辑已变化，请保留输入并重新预览")
	}
	now := time.Now()
	metadata, _ := json.Marshal(map[string]any{"kind": "timeline-edit", "requestId": request.RequestID, "commands": request.Commands, "beforeSHA256": plan.Before.SHA256})
	candidate := model.ProjectCut{ID: plan.CutID, UserID: userID, ProjectID: projectID, RequestID: "timeline-edit-result:" + plan.CutID, RequestSHA256: signature, Title: "编辑结果 · " + now.Format("01-02 15:04:05"), Kind: "snapshot", SourceKey: "timeline-edit-v1", TimelineRevision: request.ExpectedRevision + 1, TimelineSHA256: plan.After.SHA256, PayloadJSON: string(plan.Timeline), MetadataJSON: string(metadata), CreatedAt: now}
	backup := model.ProjectCut{ID: plan.BackupCutID, UserID: userID, ProjectID: projectID, RequestID: "timeline-edit-before:" + plan.BackupCutID, RequestSHA256: signature, Title: "编辑前 · " + now.Format("01-02 15:04:05"), Kind: "snapshot", SourceKey: "timeline-edit-before-v1", TimelineRevision: request.ExpectedRevision, TimelineSHA256: plan.Before.SHA256, PayloadJSON: string(clean), CreatedAt: now}
	candidate.OriginCutID = before.OriginCutID
	backup.OriginCutID = before.OriginCutID
	plan.Timeline = nil
	result = TimelineEditResult{Kind: "timeline-edit", Plan: plan, AppliedRevision: request.ExpectedRevision + 1}
	encoded, _ := json.Marshal(result)
	receipt := model.ProjectCutApplyReceipt{ID: mediaAnalysisID("timeline-edit-receipt-v1", userID, projectID, request.RequestID), UserID: userID, ProjectID: projectID, RequestID: request.RequestID, RequestSHA256: signature, CutID: candidate.ID, ResultJSON: string(encoded), CreatedAt: now}
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	// Two snapshots plus the working-cut delta: A+B+(A-B), plus metadata
	// and receipt. The previous working cut is already included in usage.
	if err := s.validateProductionDocumentStorage(userID, int64(2*len(candidate.PayloadJSON)+len(metadata)+len(encoded))); err != nil {
		return TimelineEditResult{}, err
	}
	if err := s.repo.ApplyTimelineEditCut(&candidate, request.ExpectedRevision, &backup, &receipt); err != nil {
		if previous, e := s.repo.ProjectCutApplyForRequest(userID, projectID, request.RequestID); e == nil && previous.RequestSHA256 == signature {
			return s.ReadTimelineEditResult(userID, projectID, request.RequestID)
		}
		if errors.Is(err, repository.ErrTimelineResourceChanged) {
			return TimelineEditResult{}, timelineResourceChangedError()
		}
		if errors.Is(err, repository.ErrProjectTimelineConflict) || errors.Is(err, gorm.ErrRecordNotFound) {
			return TimelineEditResult{}, cutConflict("剪辑已更新，未应用本次编辑，请重新预览")
		}
		return TimelineEditResult{}, err
	}
	return result, nil
}
