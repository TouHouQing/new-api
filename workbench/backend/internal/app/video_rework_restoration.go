package app

import (
	"encoding/json"
	"yingce/backend/internal/production"
)

// Restore media identity while retaining later timing and reviewed crop edits.
// V1's independent interval occurrence continues to use its original removal.
func (s *Service) resolveVideoReworkRestoration(userID, projectID string, raw json.RawMessage, command production.TimelineEditCommand) (*production.VideoReworkRestoration, error) {
	selected, digest, err := production.ReadVideoReworkClip(raw, command.ID)
	if err != nil || digest != command.ExpectedClipSHA256 {
		return nil, cutConflict("片段已变化，请重新预览撤销")
	}
	var clip struct {
		Origin  production.VideoReworkOrigin `json:"videoReworkOrigin"`
		Reframe *production.TimelineReframe  `json:"reframe"`
	}
	if json.Unmarshal(selected, &clip) != nil || clip.Origin.TaskID != command.RepairTaskID {
		return nil, BadAuthRequest("这个片段没有所选修复来源")
	}
	if clip.Origin.Version == 1 {
		return nil, nil
	}
	if clip.Origin.Version != 2 {
		return nil, BadAuthRequest("无法读取修复版本")
	}
	candidate, err := s.resolveVideoReworkCandidate(userID, projectID, command)
	if err != nil {
		return nil, err
	}
	task, err := s.repo.TaskForUser(userID, command.RepairTaskID)
	if err != nil {
		return nil, err
	}
	input, err := decodeVideoReworkInput(task)
	if err != nil || input.Version != 2 {
		return nil, BadAuthRequest("修复来源与原任务不一致")
	}
	original, _, err := production.ReadVideoReworkClip(input.SourceTimeline, input.Plan.Request.ClipID)
	if err != nil {
		return nil, err
	}
	restored := &production.VideoReworkRestoration{OriginalClip: original, Source: input.Plan.Source, Derived: candidate.Derived}
	if clip.Reframe == nil {
		return restored, nil
	}
	if cutSignature(clip.Reframe) == cutSignature(candidate.Reframe) {
		restored.Reframe, err = videoReworkOriginalFraming(input)
		return restored, err
	}
	id := mediaAnalysisID("video-rework-undo-framing", task.ID, cutSignature(clip.Reframe))
	revision := mediaAnalysisID("video-rework-undo-framing-version", id)
	projected, err := production.RelinkVideoReworkReframe(*clip.Reframe, candidate.Derived, input.Plan.Source, id, revision)
	if err != nil {
		return nil, BadAuthRequest("后续构图无法保留，请核对其源范围")
	}
	resource, err := s.repo.ResourceForUser(userID, input.Plan.Source.ResourceID)
	if err != nil {
		return nil, err
	}
	if err := s.registerVideoReworkFramingProjection(*task, *resource, input.Plan.Source.SHA256, *clip.Reframe, projected, id, revision, input, "video_rework_undo"); err != nil {
		return nil, err
	}
	restored.Reframe = &projected
	return restored, nil
}
