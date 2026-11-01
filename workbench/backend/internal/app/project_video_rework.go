package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
	"yingce/backend/internal/repository"
)

const videoReworkMaximumBytes int64 = 128 << 20

type VideoReworkCreateRequest struct {
	RequestID        string                        `json:"requestId"`
	ExpectedRevision int64                         `json:"expectedRevision"`
	Edit             production.VideoReworkRequest `json:"edit"`
}

type VideoReworkSource struct {
	Revision   int64                       `json:"revision"`
	Clip       json.RawMessage             `json:"clip"`
	ClipSHA256 string                      `json:"clipSha256"`
	Media      production.VideoReworkMedia `json:"media"`
	HasAudio   bool                        `json:"hasAudio"`
}

type VideoReworkMediaView struct {
	Media    production.VideoReworkMedia `json:"media"`
	HasAudio bool                        `json:"hasAudio"`
}

type videoReworkInput struct {
	Version        int                        `json:"version"`
	ProjectID      string                     `json:"projectId"`
	Request        VideoReworkCreateRequest   `json:"request"`
	RequestSHA256  string                     `json:"requestSha256"`
	SourceTimeline json.RawMessage            `json:"sourceTimeline"`
	Plan           production.VideoReworkPlan `json:"plan"`
}

func (s *Service) videoReworkTemp() (string, error) {
	directory := filepath.Join(s.dataDir, "tmp")
	if err := os.MkdirAll(directory, 0700); err != nil {
		return "", err
	}
	return os.MkdirTemp(directory, "video-rework-*")
}

// Always inspect the original bytes. Browser-supplied duration and dimensions
// cannot authorize a repair or hide a truncated candidate from the native task.
func (s *Service) readVideoReworkMedia(ctx context.Context, userID, resourceID, destination string) (production.VideoReworkMedia, bool, error) {
	var facts production.VideoReworkMedia
	resource, reader, err := s.OpenResource(userID, resourceID)
	if err != nil {
		return facts, false, err
	}
	defer reader.Close()
	if resource.Status != model.ResourceStatusReady || resource.Kind != "video" || !strings.HasPrefix(resource.MimeType, "video/") || resource.Size <= 0 || resource.Size > videoReworkMaximumBytes {
		return facts, false, BadAuthRequest("请选择已保存且不超过128MB的视频原片或候选")
	}
	file, err := os.OpenFile(destination, os.O_RDWR|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return facts, false, err
	}
	defer file.Close()
	hash := sha256.New()
	n, err := io.Copy(io.MultiWriter(file, hash), io.LimitReader(reader, videoReworkMaximumBytes+1))
	if err != nil || n != resource.Size || n > videoReworkMaximumBytes {
		return facts, false, BadAuthRequest("视频文件不完整或超过处理上限，请核对原文件")
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return facts, false, err
	}
	header := make([]byte, 16)
	if _, err := file.ReadAt(header, 0); err != nil || !((string(header[4:8]) == "ftyp" || string(header[4:8]) == "moov" || string(header[4:8]) == "wide") || string(header[:4]) == "\x1a\x45\xdf\xa3") {
		return facts, false, BadAuthRequest("局部修复需要独立的MP4、MOV或WebM视频文件；请先将其他格式导出为视频副本")
	}
	width, height, duration, err := inspectProductionImportMedia(ctx, file, resource.MimeType)
	if err != nil || width < 2 || height < 2 || width > 4096 || height > 4096 || width%2 != 0 || height%2 != 0 || duration <= 0 {
		return facts, false, BadAuthRequest("原片的实际尺寸或时长无法用于修复；请使用宽高为偶数、最长边4096像素以内的视频副本")
	}
	hasAudio, err := probeHasAudioStream(ctx, destination)
	if err != nil {
		return facts, false, BadAuthRequest("无法核对原片或候选的音轨，请检查媒体文件")
	}
	return production.VideoReworkMedia{ResourceID: resourceID, SHA256: hex.EncodeToString(hash.Sum(nil)), Width: width, Height: height, DurationMs: duration}, hasAudio, nil
}

func (s *Service) ReadVideoReworkMedia(userID, projectID, resourceID string) (VideoReworkMediaView, error) {
	var result VideoReworkMediaView
	if _, err := s.repo.ProjectForUser(userID, projectID); err != nil {
		return result, err
	}
	directory, err := s.videoReworkTemp()
	if err != nil {
		return result, err
	}
	defer os.RemoveAll(directory)
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	result.Media, result.HasAudio, err = s.readVideoReworkMedia(ctx, userID, resourceID, filepath.Join(directory, "candidate"))
	return result, err
}

func videoReworkSourceSnapshot(raw json.RawMessage, clipID string) (json.RawMessage, error) {
	clip, _, err := production.ReadVideoReworkClip(raw, clipID)
	if err != nil {
		return nil, err
	}
	var selected struct {
		TrackID    string `json:"trackId"`
		StartMs    int64  `json:"startMs"`
		DurationMs int64  `json:"durationMs"`
	}
	var document struct {
		Tracks []json.RawMessage `json:"tracks"`
	}
	if json.Unmarshal(clip, &selected) != nil || json.Unmarshal(raw, &document) != nil {
		return nil, production.ErrVideoRework
	}
	for _, track := range document.Tracks {
		var target struct {
			ID string `json:"id"`
		}
		if json.Unmarshal(track, &target) == nil && target.ID == selected.TrackID {
			encoded, err := json.Marshal(map[string]any{"version": 2, "tracks": []json.RawMessage{track}, "clips": []json.RawMessage{clip}, "durationMs": selected.StartMs + selected.DurationMs})
			if err != nil {
				return nil, err
			}
			return production.ValidateTimelineDocument(encoded)
		}
	}
	return nil, production.ErrVideoRework
}

func (s *Service) ReadVideoReworkTask(userID, projectID, requestID string) (*model.Task, error) {
	if !validCutRequestID(requestID) {
		return nil, BadAuthRequest("修复编号无效")
	}
	task, err := s.repo.TaskForUser(userID, mediaAnalysisID("video-rework-v1", userID, projectID, requestID))
	if err != nil {
		return nil, NotFound("此修复编号尚无已保存任务，请保留原编号核对")
	}
	input, err := decodeVideoReworkInput(task)
	if err != nil || task.ProjectID != projectID || input.Request.RequestID != requestID {
		return nil, BadAuthRequest("修复回执与当前项目不匹配")
	}
	return taskForOutput(*task), nil
}

func (s *Service) ReadVideoReworkSource(userID, projectID, clipID string) (VideoReworkSource, error) {
	var result VideoReworkSource
	if _, err := s.repo.ProjectForUser(userID, projectID); err != nil {
		return result, err
	}
	timeline, err := s.GetProjectTimeline(userID, projectID)
	if err != nil {
		return result, err
	}
	clip, digest, err := production.ReadVideoReworkClip(timeline.Timeline, clipID)
	if err != nil {
		return result, BadAuthRequest("请选择时间线上的具体视频片段")
	}
	var value struct {
		DirectMedia struct {
			StorageKey string `json:"storageKey"`
		} `json:"directMedia"`
	}
	if json.Unmarshal(clip, &value) != nil || !strings.HasPrefix(value.DirectMedia.StorageKey, "resource:") {
		return result, BadAuthRequest("这个片段尚未固定原片，请从素材库重新加入剪辑")
	}
	directory, err := s.videoReworkTemp()
	if err != nil {
		return result, err
	}
	defer os.RemoveAll(directory)
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	result.Media, result.HasAudio, err = s.readVideoReworkMedia(ctx, userID, strings.TrimPrefix(value.DirectMedia.StorageKey, "resource:"), filepath.Join(directory, "original"))
	result.Revision, result.Clip, result.ClipSHA256 = timeline.Revision, clip, digest
	return result, err
}

func (s *Service) existingVideoRework(userID, projectID, taskID, signature string) (*model.Task, error) {
	task, err := s.repo.TaskForUser(userID, taskID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var input videoReworkInput
	if task.Type != model.TaskTypeVideoRework || task.ProjectID != projectID || json.Unmarshal([]byte(task.InputJSON), &input) != nil || input.RequestSHA256 != signature {
		return nil, cutConflict("这个修复编号已用于其他内容，请核对原任务")
	}
	return taskForOutput(*task), nil
}

func (s *Service) CreateVideoReworkTask(userID, projectID string, request VideoReworkCreateRequest) (*model.Task, error) {
	return s.createVideoReworkTaskWithVersion(userID, projectID, request, 2)
}

func (s *Service) createVideoReworkTaskWithVersion(userID, projectID string, request VideoReworkCreateRequest, version int) (*model.Task, error) {
	if version != 1 && version != 2 {
		return nil, BadAuthRequest("修复版本无效")
	}
	if !validCutRequestID(request.RequestID) || request.ExpectedRevision < 0 {
		return nil, BadAuthRequest("请提供明确的修复编号和当前剪辑版本")
	}
	taskID, signature := mediaAnalysisID("video-rework-v1", userID, projectID, request.RequestID), cutSignature(request)
	if previous, err := s.existingVideoRework(userID, projectID, taskID, signature); err != nil || previous != nil {
		return previous, err
	}
	if _, err := s.activeProjectForUser(userID, projectID); err != nil {
		return nil, err
	}
	if s.IsDraining() {
		return nil, &AppError{Status: 503, Code: 503, Message: "服务正在维护，请保留修复编号稍后核对", Retryable: true}
	}
	timeline, err := s.GetProjectTimeline(userID, projectID)
	if err != nil {
		return nil, err
	}
	if timeline.Revision != request.ExpectedRevision {
		return nil, cutConflict("剪辑已更新，请保留选择并重新预览修复")
	}
	if err := s.validateProjectTimelineMedia(userID, projectID, timeline.Timeline); err != nil {
		return nil, err
	}
	directory, err := s.videoReworkTemp()
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(directory)
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	source, _, err := s.readVideoReworkMedia(ctx, userID, request.Edit.SourceResourceID, filepath.Join(directory, "original"))
	if err != nil {
		return nil, err
	}
	candidate, candidateAudio, err := s.readVideoReworkMedia(ctx, userID, request.Edit.CandidateResourceID, filepath.Join(directory, "candidate"))
	if err != nil {
		return nil, err
	}
	plan, err := production.PlanVideoRework(timeline.Timeline, request.Edit, source, candidate)
	if version == 2 {
		plan, err = production.PlanWholeSourceVideoRework(timeline.Timeline, request.Edit, source, candidate)
	}
	if err != nil {
		return nil, BadAuthRequest("原片、候选或片段时间已变化，或区域越界；请重新核对，候选须与原片同尺寸并覆盖完整修复时长")
	}
	if request.Edit.Audio == "candidate" && !candidateAudio {
		return nil, BadAuthRequest("候选没有音轨，请选择保留原声或静音")
	}
	snapshot, err := videoReworkSourceSnapshot(timeline.Timeline, request.Edit.ClipID)
	if err != nil {
		return nil, err
	}
	input := videoReworkInput{Version: version, ProjectID: projectID, Request: request, RequestSHA256: signature, SourceTimeline: snapshot, Plan: plan}
	encoded, err := json.Marshal(input)
	if err != nil {
		return nil, err
	}
	task := model.Task{ID: taskID, UserID: userID, ProjectID: projectID, Type: model.TaskTypeVideoRework, Status: model.TaskStatusQueued, Stage: "等待合成修复候选", Prompt: "合成所选时间与区域的视频修复候选", Operation: "video-rework-v1", Provider: "local", Model: "ffmpeg", InputJSON: string(encoded)}
	policy, err := s.RuntimePolicy()
	if err != nil {
		return nil, err
	}
	if err := s.requireStoredFileCapacityForTask(userID, task.Type, policy); err != nil {
		return nil, err
	}
	if err := s.createTaskWithinStorageQuota(&task, nil, policy); err != nil {
		if previous, readErr := s.existingVideoRework(userID, projectID, taskID, signature); readErr == nil && previous != nil {
			return previous, nil
		}
		if errors.Is(err, repository.ErrActiveTaskLimit) {
			return nil, BadAuthRequest(fmt.Sprintf("同时排队或运行的任务最多%d个，请稍后核对原修复编号", policy.Task.ActiveTaskLimit))
		}
		return nil, err
	}
	s.recordActivity(userID, "task", 1)
	s.wakeTaskDispatcher()
	return taskForOutput(task), nil
}
