package app

import (
	"context"
	"encoding/json"
	"fmt"
	"image"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"yingce/backend/internal/model"
)

const renderAIGCTagMaxBytes = 8192

const renderFfmpegEnv = "CANVAS_FFMPEG_PATH"

// processTimelineRender 执行时间线渲染：按快照把引用的媒体落盘 →
// ffprobe 探测音轨 → ffmpeg concat 合成 → 产物写入资源存储。
// 渲染是本地重编码，不经模型路由与计费；失败一律落明确终态。
func (w *taskWorkerCoordinator) processTimelineRender(task *model.Task, ctx context.Context) error {
	s := w.service
	ffmpegBin, err := renderFfmpegBinary()
	if err != nil {
		return w.failTimelineTask(task, "渲染失败", err.Error())
	}
	var input timelineRenderInput
	if err := json.Unmarshal([]byte(task.InputJSON), &input); err != nil {
		return w.failTimelineTask(task, "渲染失败", "任务缺少有效的时间线快照")
	}
	plan := buildRenderPlan(input.Timeline)
	plan.PropagateID = task.ID
	plan.Output, err = timelineOutputFormat(input.AspectRatio)
	if input.Output == nil && input.Timeline.Width >= 16 && input.Timeline.Height >= 16 {
		plan.Output = timelineRenderFormat{Width: input.Timeline.Width &^ 1, Height: input.Timeline.Height &^ 1, FPS: renderFPS}
		err = validateTimelineOutput(plan.Output)
	}
	if input.Output != nil {
		plan.Output = *input.Output
		err = validateTimelineOutput(plan.Output)
	}
	if err != nil {
		return w.failTimelineTask(task, "渲染失败", err.Error())
	}
	if !plan.HasMedia {
		return w.failTimelineTask(task, "渲染失败", "时间线没有可渲染的媒体片段")
	}

	if err := w.progress(task, "准备媒体…", 10); err != nil {
		return err
	}
	workDir, cleanup, err := materializeRenderSources(ctx, s, task.UserID, &plan)
	if cleanup != nil {
		defer cleanup()
	}
	if err != nil {
		return w.failTimelineTask(task, "渲染失败", err.Error())
	}
	if len(plan.Graphics) > 0 {
		plan.MotionLayers, err = s.prepareMotionLayers(ctx, task.UserID, plan.Graphics, func(name string, picture *image.NRGBA) error { return writeCaptionPNG(workDir, name, picture) })
		if err != nil {
			return w.failTimelineTask(task, "叠层准备失败", err.Error())
		}
	}
	for _, seg := range plan.Segments {
		if seg.Source == nil || seg.Kind == "image" {
			continue
		}
		hasAudio, probeErr := probeHasAudioStream(ctx, seg.Source.Path)
		if probeErr != nil {
			return w.failTimelineTask(task, "渲染失败", probeErr.Error())
		}
		seg.Source.HasAudio = hasAudio
	}

	args := buildRenderFFmpegArgs(plan, filepath.Join(workDir, "render-output.mp4"))
	if len(args) == 0 {
		return w.failTimelineTask(task, "渲染失败", "无法生成渲染命令")
	}
	if err := w.progress(task, "正在渲染…", 30); err != nil {
		return err
	}
	cmd := exec.CommandContext(ctx, ffmpegBin, args...)
	cmd.Dir = workDir
	output, runErr := cmd.CombinedOutput()
	if runErr != nil {
		detail := strings.TrimSpace(string(output))
		if len(detail) > 400 {
			detail = detail[len(detail)-400:]
		}
		return w.failTimelineTask(task, "渲染失败", fmt.Sprintf("ffmpeg 渲染失败：%s", detail))
	}
	renderedPath := filepath.Join(workDir, "render-output.mp4")
	finishPath := filepath.Join(workDir, "render-finished.mp4")
	finishArgs, err := buildRenderFinishArgs(plan, workDir, renderedPath, finishPath)
	if err != nil {
		return w.failTimelineTask(task, "渲染失败", err.Error())
	}
	if len(finishArgs) > 0 {
		if err := w.progress(task, "混合声音与字幕…", 65); err != nil {
			return err
		}
		finish := exec.CommandContext(ctx, ffmpegBin, finishArgs...)
		finish.Dir = workDir
		if output, err := finish.CombinedOutput(); err != nil {
			detail := strings.TrimSpace(string(output))
			if len(detail) > 400 {
				detail = detail[len(detail)-400:]
			}
			return w.failTimelineTask(task, "渲染失败", "声音或字幕合成失败："+detail)
		}
		renderedPath = finishPath
	}

	if err := w.progress(task, "写入资源…", 85); err != nil {
		return err
	}
	file, err := os.Open(renderedPath)
	if err != nil {
		return w.failTimelineTask(task, "渲染失败", "读取渲染产物失败")
	}
	defer file.Close()
	stat, err := file.Stat()
	if err != nil || stat.Size() == 0 {
		return w.failTimelineTask(task, "渲染失败", "渲染产物为空")
	}
	durationMs := planDurationMs(plan)
	width, height, actualDuration, probeErr := inspectProductionImportMedia(ctx, file, "video/mp4")
	if probeErr != nil || width != plan.Output.Width || height != plan.Output.Height || actualDuration < durationMs-150 || actualDuration > durationMs+150 {
		return w.failTimelineTask(task, "渲染失败", "导出文件的实际画幅或时长与剪辑不一致，请保留原剪辑并重试")
	}
	if err := validateRenderedAudio(ctx, renderedPath, durationMs); err != nil {
		return w.failTimelineTask(task, "渲染失败", err.Error())
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return w.failTimelineTask(task, "渲染失败", "无法重新读取导出文件")
	}
	durationMs = actualDuration
	fileName := fmt.Sprintf("timeline-render-%s.mp4", time.Now().Format("20060102-150405"))
	resource, _, err := s.storeResource(task.UserID, "media", fileName, "video/mp4", stat.Size(), plan.Output.Width, plan.Output.Height, durationMs, file, nil, false)
	if err != nil || resource == nil {
		return w.failTimelineTask(task, "渲染失败", "保存渲染产物失败")
	}

	result := timelineRenderOutput{timelineRenderResult: timelineRenderResult{
		Width: plan.Output.Width, Height: plan.Output.Height, FPS: plan.Output.FPS,
		ResourceID:  resource.ID,
		FileName:    fileName,
		Size:        stat.Size(),
		DurationMs:  durationMs,
		SubtitleSRT: plan.SubtitleSRT,
	}, Fit: plan.Fit, AIGC: renderAIGCJSON(plan), Sources: renderSourceRecords(plan)}
	payload, err := json.Marshal(result)
	if err != nil {
		return w.failTimelineTask(task, "渲染失败", "渲染结果序列化失败")
	}
	task.Status = model.TaskStatusSucceeded
	task.Stage = "渲染完成"
	task.Progress = 100
	task.ResultJSON = string(payload)
	completedAt := time.Now()
	task.CompletedAt = &completedAt
	if err := s.repo.SaveTaskCompletion(task, model.TaskStatusRunning, nil); err != nil {
		return fmt.Errorf("写入渲染完成态失败: %w", err)
	}
	s.logInfo(task.UserID, task.ID, fmt.Sprintf("时间线渲染完成，时长 %.1fs", float64(durationMs)/1000), "")
	return nil
}

func planDurationMs(plan renderPlan) int64 {
	var total int64
	for _, seg := range plan.Segments {
		total += seg.DurationMs
	}
	return total
}

func renderFfmpegBinary() (string, error) {
	if configured := strings.TrimSpace(os.Getenv(renderFfmpegEnv)); configured != "" {
		return configured, nil
	}
	path, err := exec.LookPath("ffmpeg")
	if err != nil {
		return "", fmt.Errorf("渲染依赖未安装（需要 ffmpeg，可通过 %s 指定）", renderFfmpegEnv)
	}
	return path, nil
}

// materializeRenderSources 把计划中每个媒体片段对应的资源下载到临时目录，
// 同资源复用同一份本地文件；返回工作目录与清理函数。
func materializeRenderSources(ctx context.Context, s *Service, userID string, plan *renderPlan) (string, func(), error) {
	tmpDir, err := os.MkdirTemp("", "yingce-render-*")
	if err != nil {
		return "", nil, fmt.Errorf("创建临时目录失败: %w", err)
	}
	cleanup := func() { _ = os.RemoveAll(tmpDir) }
	cache := map[string]string{}
	segments := make([]*renderSegment, 0, len(plan.Segments)+len(plan.Audio))
	for i := range plan.Segments {
		segments = append(segments, &plan.Segments[i])
	}
	for i := range plan.Audio {
		segments = append(segments, &plan.Audio[i])
	}
	var materialized int64
	for _, seg := range segments {
		if seg.Kind == "gap" {
			continue
		}
		resourceID, ok := mediaResourceID(seg.Clip)
		if !ok {
			cleanup()
			return "", nil, fmt.Errorf("时间线片段缺少固定素材，请重新添加后导出")
		}
		path, cached := cache[resourceID]
		if !cached {
			resource, reader, err := s.OpenResource(userID, resourceID)
			if err != nil || reader == nil {
				cleanup()
				return "", nil, fmt.Errorf("无法读取时间线引用的媒体，可能已被删除")
			}
			if resource.Size < 0 || resource.Size > 512<<20 || materialized+resource.Size > 2<<30 {
				reader.Close()
				cleanup()
				return "", nil, fmt.Errorf("本次渲染素材超过临时空间上限，请分段导出")
			}
			ext := extForMime(resource.MimeType)
			path = filepath.Join(tmpDir, fmt.Sprintf("src-%d%s", len(cache), ext))
			file, err := os.Create(path)
			if err != nil {
				reader.Close()
				cleanup()
				return "", nil, fmt.Errorf("写入临时媒体失败: %w", err)
			}
			written, copyErr := io.Copy(file, io.LimitReader(reader, 512<<20+1))
			closeErr := file.Close()
			reader.Close()
			if copyErr != nil || closeErr != nil || written > 512<<20 || (resource.Size > 0 && written != resource.Size) {
				cleanup()
				return "", nil, fmt.Errorf("读取时间线媒体失败或文件不完整")
			}
			materialized += written
			cache[resourceID] = path
		}
		seg.Source = &renderSource{ResourceID: resourceID, Clip: seg.Clip, Path: path, Ext: filepath.Ext(path)}
		if info, probeErr := probeMediaFile(ctx, path); probeErr == nil {
			seg.Source.Width, seg.Source.Height = info.Width, info.Height
			if tag := mediaProbeTag(info.Tags, "AIGC"); len(tag) <= renderAIGCTagMaxBytes {
				seg.Source.AIGC = tag
			}
		}
		if seg.Kind == "audio" {
			hasAudio, err := probeHasAudioStream(ctx, path)
			if err != nil || !hasAudio {
				cleanup()
				return "", nil, fmt.Errorf("独立音轨素材无法解码或没有音频流")
			}
			seg.Source.HasAudio = true
		}
	}
	plan.AudioOverlays = plan.Audio
	return tmpDir, cleanup, nil
}

// probeHasAudioStream 用 ffprobe 判断媒体是否含音轨，供滤镜图选择静音回退。
func probeHasAudioStream(ctx context.Context, path string) (bool, error) {
	bin, err := renderFFprobeBinary()
	if err != nil {
		return false, fmt.Errorf("媒体探测依赖未安装（需要 ffprobe）")
	}
	cmd := exec.CommandContext(ctx, bin,
		"-v", "error", "-select_streams", "a:0", "-show_entries", "stream=index",
		"-of", "csv=p=0", path)
	output, runErr := cmd.Output()
	if runErr != nil {
		return false, fmt.Errorf("时间线素材无法探测，保留原素材并停止导出")
	}
	return strings.TrimSpace(string(output)) != "", nil
}
