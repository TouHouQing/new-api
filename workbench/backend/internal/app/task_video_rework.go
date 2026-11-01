package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
)

var videoReworkSlots = make(chan struct{}, 1)

func decodeVideoReworkInput(task *model.Task) (videoReworkInput, error) {
	var input videoReworkInput
	decoder := json.NewDecoder(strings.NewReader(task.InputJSON))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&input) != nil || (input.Version != 1 && input.Version != 2) || input.Plan.Version != input.Version || input.ProjectID == "" || input.ProjectID != task.ProjectID || input.RequestSHA256 != cutSignature(input.Request) || task.Type != model.TaskTypeVideoRework || task.Provider != "local" || task.Model != "ffmpeg" {
		return input, errors.New("修复任务的固定输入无效，请核对原任务")
	}
	var extra any
	if decoder.Decode(&extra) != io.EOF {
		return input, errors.New("修复任务包含多份输入")
	}
	plan, err := production.PlanVideoRework(input.SourceTimeline, input.Request.Edit, input.Plan.Source, input.Plan.Candidate)
	if input.Version == 2 {
		plan, err = production.PlanWholeSourceVideoRework(input.SourceTimeline, input.Request.Edit, input.Plan.Source, input.Plan.Candidate)
	}
	if err != nil || cutSignature(plan) != cutSignature(input.Plan) {
		return input, errors.New("修复时间、来源或候选与固定输入不同")
	}
	return input, nil
}

func videoReworkFileSHA(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func (s *Service) stageVideoReworkFile(path string, maximum int64) (string, string, error) {
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() || info.Size() <= 0 || info.Size() > maximum {
		return "", "", errors.New("修复产物为空、不是普通文件或超过当前文件上限")
	}
	input, err := os.Open(path)
	if err != nil {
		return "", "", err
	}
	defer input.Close()
	output, err := s.newMediaTemp(info.Size())
	if err != nil {
		return "", "", err
	}
	name, complete := output.Name(), false
	defer func() {
		output.Close()
		if !complete {
			os.Remove(name)
		}
	}()
	hash := sha256.New()
	n, err := io.Copy(io.MultiWriter(output, hash), io.LimitReader(input, maximum+1))
	if err != nil || n != info.Size() || n > maximum {
		return "", "", errors.New("修复文件在暂存期间变化，未采用不完整结果")
	}
	if err := output.Sync(); err != nil {
		return "", "", err
	}
	if err := output.Close(); err != nil {
		return "", "", err
	}
	complete = true
	return filepath.Base(name), hex.EncodeToString(hash.Sum(nil)), nil
}

func (w *taskWorkerCoordinator) processVideoRework(task *model.Task, ctx context.Context) (failure error) {
	s := w.service
	defer func() {
		if latest, err := s.repo.Task(task.ID); err == nil && latest.Status == model.TaskStatusCancelled {
			s.cleanupMediaCheckpointFiles(latest)
			if errors.Is(failure, context.Canceled) {
				failure = nil
			}
		}
	}()
	input, err := decodeVideoReworkInput(task)
	if err != nil {
		return w.failTimelineTask(task, "视频修复失败", err.Error())
	}
	if _, err := s.mediaTaskProject(task); err != nil {
		return w.failTimelineTask(task, "视频修复失败", err.Error())
	}
	select {
	case videoReworkSlots <- struct{}{}:
		defer func() { <-videoReworkSlots }()
	case <-ctx.Done():
		return w.imageOperationInterrupted(task, ctx.Err())
	}
	var checkpoint *mediaCheckpoint
	planSHA := cutSignature(input.Plan)
	if task.MediaRecoveryJSON == "" {
		checkpoint = &mediaCheckpoint{Mode: "video", StartedAt: time.Now(), Items: []mediaCheckpointItem{{MIMEType: "video/mp4", NativeVideoReworkPlanSHA256: planSHA}}}
		err = s.saveMediaCheckpoint(task, checkpoint, "checkpoint")
	} else {
		checkpoint, err = s.decodeMediaCheckpoint(task)
	}
	if err != nil {
		return err
	}
	if checkpoint.Mode != "video" || len(checkpoint.Items) != 1 || checkpoint.Items[0].NativeVideoReworkPlanSHA256 != planSHA {
		return w.failTimelineTask(task, "视频修复失败", "修复回执与原任务不一致，未重新合成")
	}
	item := &checkpoint.Items[0]
	resource, err := s.resourceForUploadKey(task.UserID, mediaUploadKey(task.ID, 0))
	if err != nil {
		return s.handleMediaRecoveryFailure(task, err)
	}
	directory, err := s.videoReworkTemp()
	if err != nil {
		return w.failTimelineTask(task, "视频修复失败", "无法创建修复暂存目录")
	}
	defer os.RemoveAll(directory)
	if resource == nil || resource.Status != model.ResourceStatusReady {
		staged := s.mediaTempPath(item.TempName)
		_, stagedErr := os.Lstat(staged)
		if staged != "" && stagedErr == nil {
			actual, err := videoReworkFileSHA(staged)
			if err != nil || actual != item.NativeVideoReworkOutputSHA256 {
				return w.failTimelineTask(task, "视频修复失败", "暂存候选与原回执摘要不同，请保留原文件检查")
			}
		} else {
			if err := w.progress(task, "核对原片与修复候选", 10); err != nil {
				return err
			}
			sourcePath, candidatePath := filepath.Join(directory, "original"), filepath.Join(directory, "candidate")
			source, sourceAudio, err := s.readVideoReworkMedia(ctx, task.UserID, input.Plan.Source.ResourceID, sourcePath)
			if err != nil {
				return w.failTimelineTask(task, "视频修复失败", "无法读取固定原片，请核对原文件")
			}
			candidate, candidateAudio, err := s.readVideoReworkMedia(ctx, task.UserID, input.Plan.Candidate.ResourceID, candidatePath)
			if err != nil || source != input.Plan.Source || candidate != input.Plan.Candidate {
				return w.failTimelineTask(task, "视频修复失败", "原片或候选内容在提交后变化，未采用新内容")
			}
			ffmpeg, err := renderFfmpegBinary()
			if err != nil {
				return w.failTimelineTask(task, "视频修复失败", err.Error())
			}
			output := filepath.Join(directory, "repaired.mp4")
			args, err := buildVideoReworkFFmpegArgs(input.Plan, sourcePath, candidatePath, output, 24, sourceAudio, candidateAudio)
			if err != nil {
				return w.failTimelineTask(task, "视频修复失败", err.Error())
			}
			if err := w.progress(task, "合成所选区域与时间", 35); err != nil {
				return err
			}
			if output, err := exec.CommandContext(ctx, ffmpeg, args...).CombinedOutput(); err != nil {
				if ctx.Err() != nil {
					return w.imageOperationInterrupted(task, ctx.Err())
				}
				return w.failTimelineTask(task, "视频修复失败", "所选素材无法合成，请检查候选并保留原文件："+truncateRunes(redactUpstreamAddress(string(output)), 400))
			}
			file, err := os.Open(output)
			if err != nil {
				return w.failTimelineTask(task, "视频修复失败", "修复候选未能写出")
			}
			width, height, duration, probeErr := inspectProductionImportMedia(ctx, file, "video/mp4")
			file.Close()
			length := input.Plan.Request.SourceEndMs - input.Plan.Request.SourceStartMs
			if input.Version == 2 {
				length = input.Plan.Source.DurationMs
			}
			if probeErr != nil || width != input.Plan.Source.Width || height != input.Plan.Source.Height || duration < length || duration > length+44 {
				return w.failTimelineTask(task, "视频修复失败", "合成文件的实际尺寸或时间与修复计划不一致")
			}
			policy, err := s.RuntimePolicy()
			if err != nil {
				return err
			}
			name, hash, err := s.stageVideoReworkFile(output, min(videoReworkMaximumBytes, megabytes(policy.Resource.GeneratedFileMB)))
			if err != nil {
				return s.handleMediaRecoveryFailure(task, &mediaRecoveryError{stage: "local_save", cause: err})
			}
			if item.NativeVideoReworkOutputSHA256 != "" && item.NativeVideoReworkOutputSHA256 != hash {
				os.Remove(s.mediaTempPath(name))
				return w.failTimelineTask(task, "视频修复失败", "原暂存候选已过期，重新合成结果的摘要不同；请核对后另建修复，不覆盖原回执")
			}
			item.TempName, item.NativeVideoReworkOutputSHA256 = name, hash
			if err := s.saveMediaCheckpoint(task, checkpoint, "checkpoint"); err != nil {
				os.Remove(s.mediaTempPath(name))
				return err
			}
		}
	} else {
		actual, _, err := s.readVideoReworkMedia(ctx, task.UserID, resource.ID, filepath.Join(directory, "saved-output"))
		if err != nil || item.NativeVideoReworkOutputSHA256 == "" || actual.SHA256 != item.NativeVideoReworkOutputSHA256 {
			return w.failTimelineTask(task, "视频修复失败", "已保存的候选与原回执不同，未覆盖现有结果")
		}
	}
	result, err := s.materializeTaskMedia(ctx, task, providerConfig{}, checkpoint)
	if err != nil {
		return s.handleMediaRecoveryFailure(task, err)
	}
	result["videoRework"] = map[string]any{"version": input.Version, "taskId": task.ID, "plan": input.Plan, "planSha256": planSHA, "outputSha256": item.NativeVideoReworkOutputSHA256}
	video, ok := result["video"].(map[string]any)
	if !ok || stringValue(video["resourceId"]) == "" {
		return w.failTimelineTask(task, "视频修复失败", "修复结果没有固定资源")
	}
	saved, _, err := s.readVideoReworkMedia(ctx, task.UserID, stringValue(video["resourceId"]), filepath.Join(directory, "verified-final-output"))
	if err != nil || saved.SHA256 != item.NativeVideoReworkOutputSHA256 {
		return w.failTimelineTask(task, "视频修复失败", "保存后的修复文件与原回执摘要不同，请保留原候选检查")
	}
	return s.finishTaskMediaRecovery(task, result, nil)
}
