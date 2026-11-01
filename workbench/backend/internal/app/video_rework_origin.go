package app

import (
	"encoding/json"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
)

// Clock aliases are accepted only from a completed owned native repair and its
// frozen original clip. A client cannot attach old analysis to arbitrary media.
func (s *Service) validateTimelineVideoReworkOrigins(userID, projectID string, raw []byte) error {
	var doc struct {
		Clips []struct {
			Kind   string                        `json:"kind"`
			Origin *production.VideoReworkOrigin `json:"videoReworkOrigin"`
			Direct struct {
				StorageKey string `json:"storageKey"`
			} `json:"directMedia"`
			Binding struct {
				VersionID string `json:"assetVersionId"`
			} `json:"productionBinding"`
		} `json:"clips"`
	}
	if json.Unmarshal(raw, &doc) != nil {
		return BadAuthRequest("修复来源格式无效")
	}
	for _, clip := range doc.Clips {
		origin := clip.Origin
		if origin == nil {
			continue
		}
		if origin.Version == 1 {
			continue
		}
		if origin.Version != 2 || clip.Kind != "video" {
			return BadAuthRequest("修复来源版本无效")
		}
		task, err := s.repo.TaskForUser(userID, origin.TaskID)
		if err != nil || task.ProjectID != projectID || task.Status != model.TaskStatusSucceeded {
			return BadAuthRequest("修复来源不属于当前项目的已完成任务")
		}
		input, err := decodeVideoReworkInput(task)
		if err != nil || input.Version != 2 || cutSignature(input.Plan) != cutSignature(origin.Plan) {
			return BadAuthRequest("修复来源与原生固定计划不一致")
		}
		var result struct {
			Video struct {
				ResourceID string `json:"resourceId"`
				VersionID  string `json:"assetVersionId"`
			} `json:"video"`
			Rework struct {
				Version int    `json:"version"`
				TaskID  string `json:"taskId"`
				PlanSHA string `json:"planSha256"`
			} `json:"videoRework"`
		}
		if json.Unmarshal([]byte(task.ResultJSON), &result) != nil || result.Rework.Version != 2 || result.Rework.TaskID != task.ID || result.Rework.PlanSHA != cutSignature(input.Plan) || result.Video.ResourceID == "" || result.Video.VersionID == "" || clip.Direct.StorageKey != "resource:"+result.Video.ResourceID || clip.Binding.VersionID != result.Video.VersionID {
			return BadAuthRequest("所选修复片段没有引用原任务的固定资源与版本")
		}
		original, _, err := production.ReadVideoReworkClip(input.SourceTimeline, input.Plan.Request.ClipID)
		if err != nil {
			return err
		}
		aliases, err := production.WholeSourceVideoReworkAliases(original, input.Plan.Source.ResourceID)
		if err != nil || !production.SameVideoReworkAliases(aliases, origin.SourceResourceIDs) {
			return BadAuthRequest("修复源时间继承关系与原记录不同")
		}
	}
	return nil
}
