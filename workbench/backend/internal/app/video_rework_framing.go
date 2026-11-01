package app

import (
	"encoding/json"
	"fmt"

	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
)

func videoReworkOriginalFraming(input videoReworkInput) (*production.TimelineReframe, error) {
	var document struct {
		Clips []struct {
			ID      string                      `json:"id"`
			Reframe *production.TimelineReframe `json:"reframe"`
		} `json:"clips"`
	}
	if json.Unmarshal(input.SourceTimeline, &document) != nil {
		return nil, BadAuthRequest("固定原片的构图记录无法读取")
	}
	for _, clip := range document.Clips {
		if clip.ID == input.Plan.Request.ClipID {
			return clip.Reframe, nil
		}
	}
	return nil, BadAuthRequest("固定原片的片段实例不存在")
}

func videoReworkFramingIDs(taskID string) (string, string) {
	return mediaAnalysisID("video-rework-framing", taskID), mediaAnalysisID("video-rework-framing-version", taskID)
}

// Called by the existing asset/completion transaction. The inherited curve is
// a native manual-framing revision with explicit provenance, not a fabricated
// subject-tracking measurement or a reference back to the wrong media clock.
func (s *Service) registerVideoReworkFraming(task model.Task, resource model.Resource, outputSHA string) error {
	input, err := decodeVideoReworkInput(&task)
	if err != nil {
		return err
	}
	original, err := videoReworkOriginalFraming(input)
	if err != nil || original == nil {
		return err
	}
	id, revisionID := videoReworkFramingIDs(task.ID)
	derived := production.VideoReworkMedia{ResourceID: resource.ID, SHA256: outputSHA, Width: resource.Width, Height: resource.Height, DurationMs: resource.DurationMs}
	projected, err := production.ProjectVideoReworkReframe(*original, input.Plan, derived, id, revisionID)
	if err != nil {
		return BadAuthRequest("原片构图无法准确映射到修复候选，请保留原构图检查")
	}
	return s.registerVideoReworkFramingProjection(task, resource, outputSHA, *original, projected, id, revisionID, input, "video_rework")
}

func (s *Service) registerVideoReworkFramingProjection(task model.Task, resource model.Resource, outputSHA string, original, projected production.TimelineReframe, id, revisionID string, input videoReworkInput, sourceKind string) error {
	source := production.MediaAnalysisSource{DisplayGeometryVersion: 1, ResourceID: resource.ID, SHA256: outputSHA, ETag: resource.ETag, Bytes: resource.Size, DurationMs: resource.DurationMs, StartMs: projected.StartMs, EndMs: projected.EndMs, Width: resource.Width, Height: resource.Height}
	document := production.MediaAnalysisEdits{Version: 1, Sections: []production.AnalysisSection{}, Beats: []production.AnalysisBeat{}, Tracking: []production.AnalysisTrackingPoint{}}
	points := []map[string]any{}
	for index, key := range projected.Keys {
		crop := production.AnalysisRectangle{X: key.X, Y: key.Y, Width: projected.Width, Height: projected.Height}
		document.Tracking = append(document.Tracking, production.AnalysisTrackingPoint{ID: fmt.Sprintf("point:%d", index), TimeMs: key.TimeMs, ROI: crop, Crop: crop, Reviewed: true, Manual: true})
		points = append(points, map[string]any{"time": float64(key.TimeMs-source.StartMs) / 1000, "roi": crop, "crop": crop, "confidence": 0, "review_required": false, "reason": "inherited_reviewed_framing"})
	}
	evidence := map[string]any{"kind": "subject_track", "method": production.ManualFramingMethod, "duration": float64(source.EndMs-source.StartMs) / 1000, "algorithm_measurement": false, "points": points, "projection": map[string]any{"sourceAnalysisId": original.AnalysisID, "sourceRevisionId": original.RevisionID, "sourceResourceId": original.ResourceID, "taskId": task.ID, "planSha256": cutSignature(input.Plan), "sourceStartMs": input.Plan.Request.SourceStartMs, "sourceEndMs": input.Plan.Request.SourceEndMs}}
	evidenceJSON, err := json.Marshal(evidence)
	if err != nil {
		return err
	}
	verified, err := production.BuildTimelineReframe(id, revisionID, source, document, evidenceJSON)
	if err != nil || cutSignature(verified) != cutSignature(projected) {
		return BadAuthRequest("修复构图与原片曲线不一致，未采用简化结果")
	}
	sourceJSON, err := json.Marshal(source)
	if err != nil {
		return err
	}
	documentJSON, err := json.Marshal(document)
	if err != nil {
		return err
	}
	if err := s.validateProductionDocumentStorage(task.UserID, int64(len(sourceJSON)+len(evidenceJSON)+len(documentJSON)+200)); err != nil {
		return err
	}
	now := task.CreatedAt
	row := model.ProjectMediaAnalysis{ID: id, UserID: task.UserID, ProjectID: task.ProjectID, Kind: "subject_track", SourceKind: sourceKind, SourceKey: id, SourceTaskID: task.ID, ResourceID: resource.ID, Title: "视频修复保留的构图", SourceJSON: string(sourceJSON), EvidenceJSON: string(evidenceJSON), CurrentRevisionID: revisionID, Revision: 1, CreatedAt: now, UpdatedAt: now}
	if sourceKind == "video_rework" {
		row.SourceKey = task.ID
	}
	revision := model.ProjectMediaAnalysisRevision{ID: revisionID, AnalysisID: id, RequestID: "video-rework-framing:" + id, RequestSHA256: cutSignature(map[string]string{"planSha256": cutSignature(input.Plan), "outputSha256": outputSHA, "documentSha256": cutSignature(projected)}), Version: 1, UserID: task.UserID, AuthorID: task.UserID, DocumentJSON: string(documentJSON), Note: "继承已核对的构图与准确源时间，未执行新的主体测量", CreatedAt: now}
	if sourceKind == "video_rework" {
		revision.RequestID = "video-rework-framing:" + task.ID
		revision.RequestSHA256 = cutSignature(map[string]string{"planSha256": cutSignature(input.Plan), "outputSha256": outputSHA})
	}
	_, err = s.repo.CreateProjectMediaAnalysis(&row, &revision)
	return err
}
