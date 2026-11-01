package app

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"yingce/backend/internal/production"
)

type TranscriptCutPreviewRequest struct {
	ExpectedTimelineRevision *int64   `json:"expectedTimelineRevision"`
	TranscriptRevisionID     string   `json:"transcriptRevisionId"`
	SourceClipID             string   `json:"sourceClipId"`
	Mode                     string   `json:"mode"`
	KeepSegmentIDs           []string `json:"keepSegmentIds"`
	KeepWordIDs              []string `json:"keepWordIds"`
	Unit                     string   `json:"unit"`
	PreservePauses           bool     `json:"preservePauses"`
}
type TranscriptCutApplyRequest struct {
	TranscriptCutPreviewRequest
	PreviewToken string `json:"previewToken"`
}
type ProjectTranscriptCutPreview struct {
	production.TranscriptCutPlan
	TimelineRevision     int64           `json:"timelineRevision"`
	TranscriptID         string          `json:"transcriptId"`
	TranscriptRevisionID string          `json:"transcriptRevisionId"`
	PreviewToken         string          `json:"previewToken"`
	BeforeTimeline       json.RawMessage `json:"beforeTimeline"`
}

func (s *Service) PreviewProjectTranscriptCut(userID, projectID, id string, request TranscriptCutPreviewRequest) (ProjectTranscriptCutPreview, error) {
	empty := ProjectTranscriptCutPreview{}
	if _, err := s.activeProjectForUser(userID, projectID); err != nil {
		return empty, transcriptReadError(err)
	}
	if request.ExpectedTimelineRevision == nil || *request.ExpectedTimelineRevision < 0 || request.SourceClipID == "" || len(request.SourceClipID) > 128 || request.TranscriptRevisionID == "" || len(request.TranscriptRevisionID) > 80 || len(request.KeepSegmentIDs) > 10000 || len(request.KeepWordIDs) > 100000 {
		return empty, BadAuthRequest("请携带已保存剪辑和文字稿的具体版本")
	}
	view, err := s.GetProjectTranscriptVersion(userID, projectID, id, request.TranscriptRevisionID)
	if err != nil {
		return empty, err
	}
	if view.Transcript.Archived {
		return empty, BadAuthRequest("请先恢复文字稿，再进行文字剪辑")
	}
	timeline, err := s.GetProjectTimeline(userID, projectID)
	if err != nil {
		return empty, err
	}
	if !timeline.Exists {
		return empty, BadAuthRequest("请先保存包含这个素材片段的剪辑")
	}
	if timeline.Revision != *request.ExpectedTimelineRevision {
		failure := NewAppError(409, "剪辑已在其他页面更新，请保留当前剪辑并重新载入")
		failure.Reason = "project_timeline_revision_conflict"
		return empty, failure
	}
	if err := s.validateProjectTimelineMedia(userID, projectID, timeline.Timeline); err != nil {
		return empty, err
	}
	keepIDs := request.KeepSegmentIDs
	if request.Unit == "word" {
		if len(request.KeepSegmentIDs) != 0 {
			return empty, BadAuthRequest("按词剪辑不能同时提交按句选择")
		}
		keepIDs = request.KeepWordIDs
	} else if len(request.KeepWordIDs) != 0 {
		return empty, BadAuthRequest("请明确选择按词剪辑")
	}
	plan, err := production.PlanTranscriptCut(timeline.Timeline, view.Document, id, request.TranscriptRevisionID, view.Transcript.ResourceID, request.SourceClipID, request.Mode, keepIDs, production.TranscriptCutOptions{Unit: request.Unit, PreservePauses: request.PreservePauses})
	if err != nil {
		return empty, BadAuthRequest(err.Error())
	}
	if err := s.validateProjectTimelineMedia(userID, projectID, plan.Timeline); err != nil {
		return empty, err
	}
	encoded, _ := json.Marshal([]any{projectID, id, request.TranscriptRevisionID, timeline.Revision, request.SourceClipID, request.Mode, request.Unit, request.PreservePauses, json.RawMessage(plan.Timeline)})
	digest := sha256.Sum256(encoded)
	return ProjectTranscriptCutPreview{TranscriptCutPlan: plan, TimelineRevision: timeline.Revision, TranscriptID: id, TranscriptRevisionID: request.TranscriptRevisionID, PreviewToken: hex.EncodeToString(digest[:]), BeforeTimeline: timeline.Timeline}, nil
}

// The editor saves the same preview through its normal timeline command/CAS
// queue, retaining local undo. Agents use this action with the same planner and
// SaveProjectTimeline boundary. Repeated stale applications fail closed at CAS.
func (s *Service) ApplyProjectTranscriptCut(userID, projectID, id string, request TranscriptCutApplyRequest) (ProjectTimelineView, error) {
	if len(request.PreviewToken) != 64 {
		return ProjectTimelineView{}, BadAuthRequest("请先检查文字剪辑预览")
	}
	preview, err := s.PreviewProjectTranscriptCut(userID, projectID, id, request.TranscriptCutPreviewRequest)
	if err != nil {
		return ProjectTimelineView{}, err
	}
	if preview.PreviewToken != request.PreviewToken {
		return ProjectTimelineView{}, BadAuthRequest("文字剪辑参数或预览已变化，请重新检查影响")
	}
	return s.SaveProjectTimeline(userID, projectID, SaveProjectTimelineRequest{ExpectedRevision: preview.TimelineRevision, Timeline: preview.Timeline})
}
