package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
	"yingce/backend/internal/repository"
)

// timeline 转写任务输入，由画布提交，字段与前端契约一致。
type timelineTranscriptionInput struct {
	ResourceID   string `json:"resourceId"`
	Language     string `json:"language"`
	SourceClipID string `json:"sourceClipId,omitempty"`
}

const whisperLangEnv = "CANVAS_WHISPER_BASE_URL"

// processTimelineTranscription 执行时间线字幕转写：
// 读取资源 -> 本地 ffmpeg 预处理为 16k 单声道 wav -> 本地 whisper.cpp 识别 ->
// 结果写回任务（segments + srt）。任何失败都落到任务终态并携带用户可读原因。
func (w *taskWorkerCoordinator) processTimelineTranscription(task *model.Task, ctx context.Context) error {
	s := w.service
	baseURL := strings.TrimSpace(os.Getenv(whisperLangEnv))
	if baseURL == "" {
		return w.failTimelineTask(task, "转写失败", "未配置本地转写服务：请设置 CANVAS_WHISPER_BASE_URL 指向 whisper.cpp 服务")
	}
	var input timelineTranscriptionInput
	if err := json.Unmarshal([]byte(task.InputJSON), &input); err != nil || strings.TrimSpace(input.ResourceID) == "" {
		return w.failTimelineTask(task, "转写失败", "任务缺少有效的资源引用")
	}
	if err := s.RequireFeature(FeatureTimelineTranscription); err != nil {
		return w.failTimelineTask(task, "转写失败", "字幕转写暂未开放")
	}
	s.logInfo(task.UserID, task.ID, "时间线转写任务开始", "")

	resource, reader, err := s.OpenResource(task.UserID, input.ResourceID)
	if err != nil || reader == nil {
		return w.failTimelineTask(task, "转写失败", "无法读取待转写媒体，可能已被删除")
	}
	defer reader.Close()
	if resource == nil || !isTranscribableMime(resource.MimeType) {
		return w.failTimelineTask(task, "转写失败", "仅支持音视频文件转写")
	}

	if err := w.progress(task, "等待转写服务", 15); err != nil {
		return err
	}
	wavPath, cleanup, err := prepareWhisperWav(ctx, reader, resource.MimeType)
	if cleanup != nil {
		defer cleanup()
	}
	if err != nil {
		return w.failTimelineTask(task, "转写失败", err.Error())
	}
	if err := w.progress(task, "正在转写…", 40); err != nil {
		return err
	}

	client := newWhisperClient(baseURL)
	result, err := client.transcribe(ctx, wavPath, input.Language, task.ID)
	if err != nil {
		return w.failTimelineTask(task, "转写失败", err.Error())
	}
	if err := w.progress(task, "整理字幕…", 80); err != nil {
		return err
	}

	result.SRT = buildTimelineSRT(result.Segments)
	result.ResourceID = input.ResourceID
	result.SourceClipID = input.SourceClipID
	if resource.DurationMs > 0 {
		for _, segment := range result.Segments {
			if segment.EndMs > resource.DurationMs {
				return w.failTimelineTask(task, "转写失败", "识别时间超出来源素材，未采用不可靠结果")
			}
		}
		for _, word := range result.Words {
			if word.EndMs > resource.DurationMs {
				return w.failTimelineTask(task, "转写失败", "逐词时间超出来源素材，未采用不可靠结果")
			}
		}
	}
	payload, err := json.Marshal(result)
	if err != nil {
		return w.failTimelineTask(task, "转写失败", "转写结果序列化失败")
	}
	task.Status = model.TaskStatusSucceeded
	task.Stage = "转写完成"
	task.Progress = 100
	task.ResultJSON = string(payload)
	completedAt := time.Now()
	task.CompletedAt = &completedAt
	if err := s.repo.SaveTaskCompletion(task, model.TaskStatusRunning, nil); err != nil {
		// 冲突/租约已失效时不覆盖他人终态，交由上层判定。
		return fmt.Errorf("写入转写完成态失败: %w", err)
	}
	s.logInfo(task.UserID, task.ID, fmt.Sprintf("时间线转写完成，段落 %d，逐词时间 %d", len(result.Segments), len(result.Words)), "")
	return nil
}

func (w *taskWorkerCoordinator) failTimelineTask(task *model.Task, stage string, message string) error {
	s := w.service
	done, err := s.repo.UpdateTaskTerminalState(task.ID, task.LeaseOwner, model.TaskStatusRunning, model.TaskStatusFailed, stage, message, time.Now())
	if err != nil {
		return fmt.Errorf("写入时间线任务失败态失败: %w", err)
	}
	if !done {
		return fmt.Errorf("时间线任务状态或租约已变化：%w", repository.ErrTaskStateConflict)
	}
	s.logInfo(task.UserID, task.ID, fmt.Sprintf("%s: %s", stage, message), "")
	return nil
}

func (w *taskWorkerCoordinator) progress(task *model.Task, stage string, progress int) error {
	if err := w.service.repo.UpdateTaskProgressForLease(task.ID, task.LeaseOwner, stage, progress); err != nil {
		return fmt.Errorf("更新转写进度失败: %w", err)
	}
	return nil
}

func (s *Service) logInfo(userID string, taskID string, message string, extra string) {
	s.log(userID, taskID, "info", message, extra)
}

func isTranscribableMime(mime string) bool {
	return strings.HasPrefix(mime, "video/") || strings.HasPrefix(mime, "audio/")
}

// prepareWhisperWav 将媒体流经本地 ffmpeg 转为 whisper.cpp 期望的
// 16k 单声道 PCM wav；返回临时文件路径与清理函数。
func prepareWhisperWav(ctx context.Context, reader io.Reader, mime string) (string, func(), error) {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		return "", nil, fmt.Errorf("音频预处理依赖未安装（需要 ffmpeg）")
	}
	tmpDir, err := os.MkdirTemp("", "yingce-whisper-*")
	if err != nil {
		return "", nil, fmt.Errorf("创建临时目录失败: %w", err)
	}
	cleanup := func() { _ = os.RemoveAll(tmpDir) }
	inPath := filepath.Join(tmpDir, "input"+extForMime(mime))
	inFile, err := os.Create(inPath)
	if err != nil {
		cleanup()
		return "", nil, fmt.Errorf("写入待转写媒体失败: %w", err)
	}
	if _, err := io.Copy(inFile, reader); err != nil {
		inFile.Close()
		cleanup()
		return "", nil, fmt.Errorf("读取待转写媒体失败: %w", err)
	}
	if err := inFile.Close(); err != nil {
		cleanup()
		return "", nil, fmt.Errorf("关闭临时文件失败: %w", err)
	}
	wavPath := filepath.Join(tmpDir, "audio16k.wav")
	cmd := exec.CommandContext(ctx, "ffmpeg", "-nostdin", "-y", "-i", inPath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wavPath)
	output, runErr := cmd.CombinedOutput()
	if runErr != nil {
		cleanup()
		detail := strings.TrimSpace(string(output))
		if len(detail) > 400 {
			detail = detail[len(detail)-400:]
		}
		return "", nil, fmt.Errorf("音频预处理失败（ffmpeg）: %s", detail)
	}
	return wavPath, cleanup, nil
}

func extForMime(mime string) string {
	switch {
	case strings.HasPrefix(mime, "video/mp4"), strings.HasPrefix(mime, "audio/mp4"):
		return ".mp4"
	case strings.HasPrefix(mime, "video/webm"), strings.HasPrefix(mime, "audio/webm"):
		return ".webm"
	case strings.HasPrefix(mime, "video/quicktime"):
		return ".mov"
	case strings.HasPrefix(mime, "audio/mpeg"), strings.HasPrefix(mime, "audio/mp3"):
		return ".mp3"
	case strings.HasPrefix(mime, "audio/wav"), strings.HasPrefix(mime, "audio/x-wav"), strings.HasPrefix(mime, "audio/wave"):
		return ".wav"
	case strings.HasPrefix(mime, "audio/flac"):
		return ".flac"
	case strings.HasPrefix(mime, "audio/aac"):
		return ".aac"
	case strings.HasPrefix(mime, "audio/ogg"), strings.HasPrefix(mime, "video/ogg"):
		return ".ogg"
	default:
		return ".bin"
	}
}

// TimelineTranscriptionCreateRequest 是画布提交字幕转写任务的入参。
type TimelineTranscriptionCreateRequest struct {
	ResourceID   string `json:"resourceId"`
	Language     string `json:"language"`
	ProjectID    string `json:"projectId"`
	SourceClipID string `json:"sourceClipId"`
}

// CreateTimelineTranscriptionTask 创建时间线字幕转写任务：转写由本地
// whisper.cpp 执行，不经模型路由与计费；创建时校验功能门控、资源归属
// 与可转写类型，排队计入 active 限额。
func (s *Service) CreateTimelineTranscriptionTask(userID string, req TimelineTranscriptionCreateRequest) (*model.Task, error) {
	if s.IsDraining() {
		return nil, &AppError{Status: 503, Code: 503, Message: "服务正在维护，暂不接受新的生成任务", Retryable: true}
	}
	if err := s.RequireFeature(FeatureTimelineTranscription); err != nil {
		return nil, err
	}
	resourceID := strings.TrimSpace(req.ResourceID)
	if resourceID == "" {
		return nil, BadAuthRequest("必须指定待转写媒体")
	}
	resource, err := s.Resource(userID, resourceID)
	if err != nil || resource == nil {
		return nil, BadAuthRequest("无法读取待转写媒体，可能已被删除")
	}
	if !isTranscribableMime(resource.MimeType) {
		return nil, BadAuthRequest("仅支持音视频文件转写")
	}
	if req.ProjectID != "" {
		if _, err := s.activeProjectForUser(userID, strings.TrimSpace(req.ProjectID)); err != nil {
			return nil, err
		}
	}
	if req.SourceClipID != "" {
		if req.ProjectID == "" || len(req.SourceClipID) > 128 {
			return nil, BadAuthRequest("请先保存要识别的剪辑片段")
		}
		cut, err := s.GetProjectTimeline(userID, req.ProjectID)
		if err != nil {
			return nil, err
		}
		var timeline renderProject
		if json.Unmarshal(cut.Timeline, &timeline) != nil {
			return nil, BadAuthRequest("无法读取要识别的剪辑片段")
		}
		found := false
		for _, clip := range timeline.Clips {
			id, ok := mediaResourceID(clip)
			if clip.ID == req.SourceClipID && ok && id == resourceID && (clip.Kind == "audio" || clip.Kind == "video") {
				found = true
				break
			}
		}
		if !found {
			return nil, BadAuthRequest("片段已变更或尚未同步，请先保存剪辑再识别")
		}
	}
	policy, err := s.RuntimePolicy()
	if err != nil {
		return nil, err
	}
	input := timelineTranscriptionInput{ResourceID: resourceID, Language: strings.TrimSpace(req.Language), SourceClipID: req.SourceClipID}
	inputJSON, _ := json.Marshal(input)
	task := model.Task{
		ID: newID(), UserID: userID, ProjectID: req.ProjectID,
		Type: model.TaskTypeTimelineTranscription, Status: model.TaskStatusQueued,
		Stage: "等待队列调度", Progress: 5, Prompt: "字幕转写",
		Provider: "local", Model: "whisper.cpp", InputJSON: string(inputJSON),
	}
	if err := s.createTaskWithinStorageQuota(&task, nil, policy); err != nil {
		if errors.Is(err, repository.ErrActiveTaskLimit) {
			return nil, BadAuthRequest(fmt.Sprintf("同时排队或运行的任务最多 %d 个，请等待已有任务完成", policy.Task.ActiveTaskLimit))
		}
		return nil, err
	}
	s.recordActivity(userID, "task", 1)
	_ = s.log(userID, task.ID, "info", "字幕转写任务已进入队列", "")
	return taskForOutput(task), nil
}

// TimelineRenderCreateRequest 是画布提交时间线渲染任务的入参；
// Timeline 为前端 TimelineProject 快照（v2：tracks/clips 平铺）。
// 片段通过 directMedia.storageKey=resource:<id> 引用后端资源。
type TimelineRenderCreateRequest struct {
	AspectRatio string `json:"aspectRatio,omitempty"`
	cutRender   *timelineCutRenderContext
	prepareOnly bool
	ProjectID   string        `json:"projectId"`
	Timeline    renderProject `json:"timeline"`
}

type timelineRenderInput struct {
	ProjectID     string                `json:"projectId"`
	Timeline      renderProject         `json:"timeline"`
	AspectRatio   string                `json:"aspectRatio,omitempty"`
	Output        *timelineRenderFormat `json:"output,omitempty"`
	CutID         string                `json:"cutId,omitempty"`
	CutSHA256     string                `json:"cutSha256,omitempty"`
	RequestSHA256 string                `json:"requestSha256,omitempty"`
}

type timelineRenderResult struct {
	Width       int    `json:"width"`
	Height      int    `json:"height"`
	FPS         int    `json:"fps"`
	ResourceID  string `json:"resourceId"`
	FileName    string `json:"fileName"`
	Size        int64  `json:"size"`
	DurationMs  int64  `json:"durationMs"`
	SubtitleSRT string `json:"subtitleSrt,omitempty"`
}

// CreateTimelineRenderTask 创建时间线渲染任务：本地 ffmpeg 合成，不经模型
// 路由与计费；创建时校验快照至少包含画面、标题或图形片段。
func (s *Service) CreateTimelineRenderTask(userID string, req TimelineRenderCreateRequest) (*model.Task, error) {
	if s.IsDraining() {
		return nil, &AppError{Status: 503, Code: 503, Message: "服务正在维护，暂不接受新的生成任务", Retryable: true}
	}
	plan := buildRenderPlan(req.Timeline)
	if !plan.HasMedia {
		return nil, BadAuthRequest("时间线没有可渲染的媒体片段")
	}
	aspectRatio := strings.TrimSpace(req.AspectRatio)
	if req.ProjectID != "" {
		project, err := s.activeProjectForUser(userID, strings.TrimSpace(req.ProjectID))
		if err != nil {
			return nil, err
		}
		if aspectRatio == "" {
			aspectRatio = project.AspectRatio
		}
		if req.cutRender == nil {
			working, err := s.GetProjectTimeline(userID, project.ID)
			if err != nil {
				return nil, err
			}
			if len(working.DeliveryBlockers) > 0 {
				return nil, cutDeliveryPending()
			}
		}
	}
	output, err := timelineOutputFormat(aspectRatio)
	if err != nil {
		return nil, BadAuthRequest(err.Error())
	}
	if req.Timeline.Output != nil {
		output = *req.Timeline.Output
		if err := validateTimelineOutput(output); err != nil {
			return nil, BadAuthRequest(err.Error())
		}
	}
	if req.cutRender != nil {
		output = req.cutRender.Output
		if err := validateTimelineOutput(output); err != nil {
			return nil, BadAuthRequest(err.Error())
		}
	}
	raw, err := json.Marshal(req.Timeline)
	if err != nil {
		return nil, BadAuthRequest("时间线快照无效")
	}
	if _, err := production.ValidateTimelineDocument(raw); err != nil {
		return nil, BadAuthRequest("时间线轨道、片段或时长无效")
	}
	if err := s.validateProjectTimelineMedia(userID, req.ProjectID, raw); err != nil {
		return nil, err
	}
	if err := validateRenderLayout(req.Timeline); err != nil {
		return nil, BadAuthRequest(err.Error())
	}
	if len(plan.TextClips)+len(plan.Graphics) > 0 {
		select {
		case captionPreviewSlots <- struct{}{}:
			defer func() { <-captionPreviewSlots }()
		default:
			return nil, NewAppError(http.StatusTooManyRequests, "字幕布局正在核对，请稍后重试")
		}
		if len(plan.TextClips) > 0 {
			data, err := readRenderFont()
			if err != nil {
				return nil, BadAuthRequest(err.Error())
			}
			if _, err := buildCaptionLayers(plan.TextClips, output, data, func(string, *image.NRGBA) error { return nil }); err != nil {
				return nil, BadAuthRequest(err.Error())
			}
		}
		if len(plan.Graphics) > 0 {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			if _, err := s.prepareMotionLayers(ctx, userID, plan.Graphics, func(string, *image.NRGBA) error { return nil }); err != nil {
				return nil, BadAuthRequest(err.Error())
			}
		}
	}
	policy, err := s.RuntimePolicy()
	if err != nil {
		return nil, err
	}
	input := timelineRenderInput{ProjectID: strings.TrimSpace(req.ProjectID), Timeline: req.Timeline, AspectRatio: aspectRatio}
	if req.Timeline.Output != nil {
		input.Output = &output
	}
	if req.cutRender != nil {
		input.Output = &output
		input.CutID = req.cutRender.CutID
		input.CutSHA256 = req.cutRender.CutSHA256
		input.RequestSHA256 = req.cutRender.RequestSHA256
	}
	inputJSON, _ := json.Marshal(input)
	task := model.Task{
		ID: newID(), UserID: userID, ProjectID: strings.TrimSpace(req.ProjectID),
		Type: model.TaskTypeTimelineRender, Status: model.TaskStatusQueued,
		Stage: "等待队列调度", Progress: 5, Prompt: "时间线渲染",
		Provider: "local", Model: "ffmpeg", InputJSON: string(inputJSON),
	}
	if req.cutRender != nil {
		task.ID = req.cutRender.TaskID
		task.Operation = "cut-render:" + req.cutRender.CutID
	}
	if req.prepareOnly {
		return &task, nil
	}
	if err := s.createTaskWithinStorageQuota(&task, nil, policy); err != nil {
		if req.cutRender != nil {
			if previous, readErr := s.existingProjectCutRender(userID, req.ProjectID, *req.cutRender); readErr == nil && previous != nil {
				return previous, nil
			}
		}
		if errors.Is(err, repository.ErrActiveTaskLimit) {
			return nil, BadAuthRequest(fmt.Sprintf("同时排队或运行的任务最多 %d 个，请等待已有任务完成", policy.Task.ActiveTaskLimit))
		}
		return nil, err
	}
	s.recordActivity(userID, "task", 1)
	_ = s.log(userID, task.ID, "info", "时间线渲染任务已进入队列", "")
	return taskForOutput(task), nil
}
