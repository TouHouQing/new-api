package app

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"time"

	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
)

func (s *Service) resolveVideoReworkCandidate(userID, projectID string, command production.TimelineEditCommand) (*production.VideoReworkApplication, error) {
	task, err := s.repo.TaskForUser(userID, command.RepairTaskID)
	if err != nil || task.ProjectID != projectID || task.Status != model.TaskStatusSucceeded {
		return nil, BadAuthRequest("请选择当前项目内已完成的修复候选")
	}
	input, err := decodeVideoReworkInput(task)
	if err != nil || (command.Op != "removeVideoRepair" && input.Plan.Request.ClipID != command.ID) {
		return nil, BadAuthRequest("这个修复候选不属于所选片段实例")
	}
	var result struct {
		Video struct {
			ResourceID     string `json:"resourceId"`
			AssetVersionID string `json:"assetVersionId"`
		} `json:"video"`
		Rework struct {
			TaskID       string `json:"taskId"`
			PlanSHA256   string `json:"planSha256"`
			OutputSHA256 string `json:"outputSha256"`
		} `json:"videoRework"`
	}
	if json.Unmarshal([]byte(task.ResultJSON), &result) != nil || result.Rework.TaskID != task.ID || result.Rework.PlanSHA256 != cutSignature(input.Plan) || result.Video.ResourceID == "" || result.Video.AssetVersionID == "" || result.Rework.OutputSHA256 == "" {
		return nil, BadAuthRequest("修复候选缺少完整来源或固定版本，请核对原任务")
	}
	checkpoint, err := s.decodeMediaCheckpoint(task)
	if err != nil || len(checkpoint.Items) != 1 || checkpoint.Items[0].NativeVideoReworkOutputSHA256 != result.Rework.OutputSHA256 || checkpoint.Items[0].NativeVideoReworkPlanSHA256 != result.Rework.PlanSHA256 || checkpoint.Items[0].ResourceID != result.Video.ResourceID {
		return nil, BadAuthRequest("修复候选与原保存回执不一致")
	}
	directory, err := s.videoReworkTemp()
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(directory)
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	original, _, err := s.readVideoReworkMedia(ctx, userID, input.Plan.Source.ResourceID, filepath.Join(directory, "original"))
	if err != nil || original != input.Plan.Source {
		return nil, BadAuthRequest("原片内容已变化，请重新检查修复来源")
	}
	derived, _, err := s.readVideoReworkMedia(ctx, userID, result.Video.ResourceID, filepath.Join(directory, "derived"))
	if err != nil || derived.SHA256 != result.Rework.OutputSHA256 {
		return nil, BadAuthRequest("已保存的修复候选与原回执摘要不同，未采用")
	}
	version, err := s.repo.AssetVersion(result.Video.AssetVersionID)
	if err != nil || version.AssetID != generationMediaAssetID(task.ID, 0) {
		return nil, BadAuthRequest("候选版本与原修复任务不一致")
	}
	application := &production.VideoReworkApplication{Plan: input.Plan, Derived: derived, AssetVersionID: result.Video.AssetVersionID}
	originalFraming, err := videoReworkOriginalFraming(input)
	if err != nil {
		return nil, err
	}
	if originalFraming != nil {
		analysisID, revisionID := videoReworkFramingIDs(task.ID)
		view, err := s.GetProjectMediaAnalysis(userID, projectID, analysisID, revisionID)
		if err != nil {
			return nil, err
		}
		framing, err := production.BuildTimelineReframe(analysisID, revisionID, view.Source, view.Document, view.Evidence)
		if err != nil {
			return nil, BadAuthRequest("修复候选的构图版本不完整，请保留原构图检查")
		}
		application.Reframe = &framing
	}
	return application, nil
}
