package app

import (
	"context"
	"encoding/json"
	"reflect"
	"time"
	"yingce/backend/internal/production"
)

type ProjectMediaAnalysisReframePreview struct {
	production.MediaAnalysisReframePlan
	BeforeTimeline     json.RawMessage `json:"beforeTimeline"`
	TimelineRevision   int64           `json:"timelineRevision"`
	AnalysisID         string          `json:"analysisId"`
	AnalysisRevisionID string          `json:"analysisRevisionId"`
	PreviewToken       string          `json:"previewToken"`
}

func (s *Service) PreviewProjectMediaAnalysisReframe(userID, projectID, id string, req MediaAnalysisMarkerRequest) (ProjectMediaAnalysisReframePreview, error) {
	var result ProjectMediaAnalysisReframePreview
	if _, err := s.activeProjectForUser(userID, projectID); err != nil {
		return result, err
	}
	if req.ExpectedTimelineRevision == nil || *req.ExpectedTimelineRevision < 0 || req.AnalysisRevisionID == "" || len(req.AnalysisRevisionID) > 80 || req.SourceClipID == "" || len(req.SourceClipID) > 128 {
		return result, BadAuthRequest("请先保存剪辑及跟踪校正，并选择具体片段")
	}
	view, err := s.GetProjectMediaAnalysis(userID, projectID, id, req.AnalysisRevisionID)
	if err != nil {
		return result, err
	}
	if view.Analysis.Archived || view.Analysis.Kind != "subject_track" {
		return result, BadAuthRequest("请选择未归档的主体跟踪分析")
	}
	timeline, err := s.GetProjectTimeline(userID, projectID)
	if err != nil {
		return result, err
	}
	if !timeline.Exists || timeline.Revision != *req.ExpectedTimelineRevision {
		return result, &AppError{Status: 409, Code: 409, Reason: "project_timeline_revision_conflict", Message: "剪辑已变化，请保留草稿后重新读取"}
	}
	plan, err := production.BuildMediaAnalysisReframePlan(timeline.Timeline, id, req.AnalysisRevisionID, req.SourceClipID, view.Source, view.Document, view.Evidence)
	if err != nil {
		return result, BadAuthRequest(err.Error())
	}
	if err := s.validateProjectTimelineMedia(userID, projectID, plan.Timeline); err != nil {
		return result, err
	}
	return ProjectMediaAnalysisReframePreview{MediaAnalysisReframePlan: plan, BeforeTimeline: timeline.Timeline, TimelineRevision: timeline.Revision, AnalysisID: id, AnalysisRevisionID: req.AnalysisRevisionID, PreviewToken: mediaAnalysisDigest([]any{"reframe", userID, projectID, id, req, timeline.Revision, plan.Timeline})}, nil
}

func (s *Service) ApplyProjectMediaAnalysisReframe(userID, projectID, id string, req MediaAnalysisMarkerApplyRequest) (ProjectTimelineView, error) {
	if len(req.PreviewToken) != 64 {
		return ProjectTimelineView{}, BadAuthRequest("请先检查构图采用预览")
	}
	preview, err := s.PreviewProjectMediaAnalysisReframe(userID, projectID, id, req.MediaAnalysisMarkerRequest)
	if err != nil {
		return ProjectTimelineView{}, err
	}
	if preview.PreviewToken != req.PreviewToken {
		return ProjectTimelineView{}, BadAuthRequest("构图来源或版本已变化，请重新预览")
	}
	return s.SaveProjectTimeline(userID, projectID, SaveProjectTimelineRequest{ExpectedRevision: preview.TimelineRevision, Timeline: preview.Timeline})
}

type projectReframeResolver func(analysisID, revisionID string) (ProjectMediaAnalysisView, error)

func (s *Service) validateTimelineReframes(userID, projectID string, raw []byte, projected ...projectReframeResolver) error {
	var timeline struct {
		Clips []struct {
			Reframe *production.TimelineReframe `json:"reframe"`
		} `json:"clips"`
	}
	if json.Unmarshal(raw, &timeline) != nil {
		return BadAuthRequest("构图数据无效")
	}
	verified := map[string]production.TimelineReframe{}
	for _, clip := range timeline.Clips {
		if clip.Reframe == nil {
			continue
		}
		r := *clip.Reframe
		key := r.AnalysisID + ":" + r.RevisionID
		expected, ok := verified[key]
		if !ok {
			var view ProjectMediaAnalysisView
			var err error
			if len(projected) > 0 {
				view, err = projected[0](r.AnalysisID, r.RevisionID)
			} else {
				view, err = s.GetProjectMediaAnalysis(userID, projectID, r.AnalysisID, r.RevisionID)
			}
			if err != nil || view.Analysis.Kind != "subject_track" {
				return BadAuthRequest("构图分析版本不存在或不属于当前项目")
			}
			expected, err = production.BuildTimelineReframe(r.AnalysisID, r.RevisionID, view.Source, view.Document, view.Evidence)
			if err != nil {
				return BadAuthRequest(err.Error())
			}
			if err := s.verifyReframeSourceGeometry(userID, view.Source); err != nil {
				return err
			}
			resource, err := s.repo.ResourceForUser(userID, r.ResourceID)
			if err != nil || resource.ETag != view.Source.ETag || resource.Size != view.Source.Bytes {
				return BadAuthRequest("构图原始素材已变化")
			}
			verified[key] = expected
		}
		if !reflect.DeepEqual(r, expected) {
			return BadAuthRequest("构图轨迹与已核对的分析版本不一致，请重新预览")
		}
	}
	return nil
}

// Earlier analyses stored encoded dimensions. Recheck immutable sources before
// adoption. Rotated clips require a new analysis; unrotated corrections stay usable.
func (s *Service) verifyReframeSourceGeometry(userID string, source production.MediaAnalysisSource) error {
	if source.DisplayGeometryVersion == 1 {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	resource, file, digest, cleanup, err := s.spoolAnalysisSource(ctx, userID, source.ResourceID)
	if cleanup != nil {
		defer cleanup()
	}
	if err != nil {
		return err
	}
	if digest != source.SHA256 || resource.ETag != source.ETag || resource.Size != source.Bytes {
		return BadAuthRequest("构图原始素材已变化")
	}
	width, height, _, err := inspectProductionImportMedia(ctx, file, resource.MimeType)
	if err != nil {
		return err
	}
	if width != source.Width || height != source.Height {
		return BadAuthRequest("旧分析使用了编码尺寸；请重新分析旋转视频，原校正历史仍保留")
	}
	return nil
}
