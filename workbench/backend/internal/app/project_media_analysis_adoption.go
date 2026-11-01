package app

import (
	"encoding/json"
	"yingce/backend/internal/production"
)

type MediaAnalysisMarkerRequest struct {
	ExpectedTimelineRevision *int64 `json:"expectedTimelineRevision"`
	AnalysisRevisionID       string `json:"analysisRevisionId"`
	SourceClipID             string `json:"sourceClipId"`
}
type MediaAnalysisMarkerApplyRequest struct {
	MediaAnalysisMarkerRequest
	PreviewToken string `json:"previewToken"`
}
type ProjectMediaAnalysisMarkerPreview struct {
	production.MediaAnalysisMarkerPlan
	BeforeTimeline     json.RawMessage `json:"beforeTimeline"`
	TimelineRevision   int64           `json:"timelineRevision"`
	AnalysisID         string          `json:"analysisId"`
	AnalysisRevisionID string          `json:"analysisRevisionId"`
	PreviewToken       string          `json:"previewToken"`
}

func (s *Service) PreviewProjectMediaAnalysisMarkers(userID, projectID, id string, req MediaAnalysisMarkerRequest) (ProjectMediaAnalysisMarkerPreview, error) {
	var result ProjectMediaAnalysisMarkerPreview
	if _, err := s.activeProjectForUser(userID, projectID); err != nil {
		return result, err
	}
	if req.ExpectedTimelineRevision == nil || *req.ExpectedTimelineRevision < 0 || req.AnalysisRevisionID == "" || len(req.AnalysisRevisionID) > 80 || req.SourceClipID == "" || len(req.SourceClipID) > 128 {
		return result, BadAuthRequest("请先保存剪辑和分析，并携带具体版本")
	}
	view, err := s.GetProjectMediaAnalysis(userID, projectID, id, req.AnalysisRevisionID)
	if err != nil {
		return result, err
	}
	if view.Analysis.Archived {
		return result, BadAuthRequest("请先恢复已归档的分析")
	}
	timeline, err := s.GetProjectTimeline(userID, projectID)
	if err != nil {
		return result, err
	}
	if !timeline.Exists {
		return result, BadAuthRequest("请先把源素材加入并保存到时间线")
	}
	if timeline.Revision != *req.ExpectedTimelineRevision {
		return result, &AppError{Status: 409, Code: 409, Reason: "project_timeline_revision_conflict", Message: "剪辑已更新，请保留本地修改并重新载入"}
	}
	plan, err := production.BuildMediaAnalysisMarkerPlan(timeline.Timeline, id, req.AnalysisRevisionID, req.SourceClipID, view.Analysis.Kind, view.Source, view.Document)
	if err != nil {
		return result, BadAuthRequest(err.Error())
	}
	if err := s.validateProjectTimelineMedia(userID, projectID, plan.Timeline); err != nil {
		return result, err
	}
	return ProjectMediaAnalysisMarkerPreview{MediaAnalysisMarkerPlan: plan, BeforeTimeline: timeline.Timeline, TimelineRevision: timeline.Revision, AnalysisID: id, AnalysisRevisionID: req.AnalysisRevisionID, PreviewToken: mediaAnalysisDigest([]any{userID, projectID, id, req, timeline.Revision, plan.Timeline})}, nil
}

// Native agents use the same planner/CAS as the editor. A stale replay cannot
// insert duplicate markers or reinsert a marker that was subsequently undone.
func (s *Service) ApplyProjectMediaAnalysisMarkers(userID, projectID, id string, req MediaAnalysisMarkerApplyRequest) (ProjectTimelineView, error) {
	if len(req.PreviewToken) != 64 {
		return ProjectTimelineView{}, BadAuthRequest("请先检查标记的采用预览")
	}
	preview, err := s.PreviewProjectMediaAnalysisMarkers(userID, projectID, id, req.MediaAnalysisMarkerRequest)
	if err != nil {
		return ProjectTimelineView{}, err
	}
	if preview.PreviewToken != req.PreviewToken {
		return ProjectTimelineView{}, BadAuthRequest("来源、版本或剪辑已变化，请重新预览")
	}
	return s.SaveProjectTimeline(userID, projectID, SaveProjectTimelineRequest{ExpectedRevision: preview.TimelineRevision, Timeline: preview.Timeline})
}

func (s *Service) validateTimelineAnalysisMarkers(userID, projectID string, raw []byte) error {
	var timeline struct {
		Markers []production.TimelineProductionMarker `json:"productionMarkers"`
	}
	if json.Unmarshal(raw, &timeline) != nil {
		return BadAuthRequest("时间线标记无效")
	}
	versions := map[string]ProjectMediaAnalysisView{}
	for _, marker := range timeline.Markers {
		if marker.Source == nil {
			continue
		}
		source := marker.Source
		key := source.AnalysisID + ":" + source.RevisionID
		view, ok := versions[key]
		if !ok {
			var err error
			view, err = s.GetProjectMediaAnalysis(userID, projectID, source.AnalysisID, source.RevisionID)
			if err != nil {
				return BadAuthRequest("标记的分析版本不存在或不属于当前项目")
			}
			versions[key] = view
		}
		if source.ResourceID != view.Source.ResourceID {
			return BadAuthRequest("标记来源与分析素材不一致")
		}
		found := false
		for _, section := range view.Document.Sections {
			if section.ID == source.ItemID && section.Approved && marker.Kind == "cut" && section.StartMs == source.SourceTimeMs {
				found = true
				break
			}
		}
		for _, beat := range view.Document.Beats {
			if beat.ID == source.ItemID && beat.Approved && marker.Kind == "beat" && beat.TimeMs == source.SourceTimeMs {
				found = true
				break
			}
		}
		if !found {
			return BadAuthRequest("标记没有对应的已核对分析条目，请重新预览")
		}
	}
	return nil
}
