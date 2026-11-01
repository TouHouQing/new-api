package app

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
	"yingce/backend/internal/repository"
)

type MediaAnalysisOptions struct {
	Threshold    *float64                      `json:"threshold,omitempty"`
	ROI          *production.AnalysisRectangle `json:"roi,omitempty"`
	AnchorTimeMs *int64                        `json:"anchorTimeMs,omitempty"`
	TargetAspect *float64                      `json:"targetAspect,omitempty"`
}

type MediaAnalysisCreateRequest struct {
	RequestID     string               `json:"requestId"`
	ProjectID     string               `json:"projectId"`
	ResourceID    string               `json:"resourceId"`
	Kind          string               `json:"kind"`
	Title         string               `json:"title,omitempty"`
	SourceClipID  string               `json:"sourceClipId,omitempty"`
	StartMs       *int64               `json:"startMs,omitempty"`
	EndMs         *int64               `json:"endMs,omitempty"`
	Options       MediaAnalysisOptions `json:"options"`
	LongReference bool                 `json:"longReference,omitempty"`
}

type mediaAnalysisTaskInput struct {
	Version            int                            `json:"version"`
	Request            MediaAnalysisCreateRequest     `json:"request"`
	RequestSHA256      string                         `json:"requestSha256"`
	Source             production.MediaAnalysisSource `json:"source"`
	SourceStorageKey   string                         `json:"sourceStorageKey"`
	WorkerConfigCipher string                         `json:"workerConfigCipher,omitempty"`
}

var mediaAnalysisSlots = make(chan struct{}, 1)

func mediaAnalysisDigest(value any) string {
	encoded, _ := json.Marshal(value)
	digest := sha256.Sum256(encoded)
	return hex.EncodeToString(digest[:])
}

func mediaAnalysisID(namespace string, values ...string) string {
	digest := sha256.Sum256([]byte(namespace + "\x00" + strings.Join(values, "\x00")))
	return hex.EncodeToString(digest[:16])
}

func (s *Service) existingMediaAnalysisTask(userID, id, signature string) (*model.Task, error) {
	task, err := s.repo.TaskForUser(userID, id)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var input mediaAnalysisTaskInput
	if task.Type != model.TaskTypeMediaAnalysis || json.Unmarshal([]byte(task.InputJSON), &input) != nil || input.RequestSHA256 != signature {
		return nil, &AppError{Status: 409, Code: 409, Reason: "media_analysis_request_conflict", Message: "分析编号已用于其他参数，请重新确认"}
	}
	return taskForOutput(*task), nil
}

func mediaAnalysisLabel(kind string) string {
	switch kind {
	case "reference_video":
		return "参考视频分析"
	case "audio_structure":
		return "音乐节拍与结构"
	case "subject_track":
		return "主体跟踪"
	default:
		return "素材分析"
	}
}

func mediaAnalysisWorkerOptions(input mediaAnalysisTaskInput) (map[string]any, error) {
	opts, source, kind := input.Request.Options, input.Source, input.Request.Kind
	result := map[string]any{}
	finite := func(value float64) bool { return !math.IsNaN(value) && !math.IsInf(value, 0) }
	switch kind {
	case "audio_structure":
		if opts.Threshold != nil || opts.ROI != nil || opts.AnchorTimeMs != nil || opts.TargetAspect != nil {
			return nil, production.ErrMediaAnalysis
		}
	case "reference_video":
		if opts.ROI != nil || opts.AnchorTimeMs != nil || opts.TargetAspect != nil {
			return nil, production.ErrMediaAnalysis
		}
		if opts.Threshold != nil {
			if !finite(*opts.Threshold) || *opts.Threshold < 0.15 || *opts.Threshold > 0.95 {
				return nil, production.ErrMediaAnalysis
			}
			result["threshold"] = *opts.Threshold
		}
	case "subject_track":
		if opts.Threshold != nil || opts.ROI == nil || !opts.ROI.Valid() {
			return nil, production.ErrMediaAnalysis
		}
		anchor := source.StartMs
		if opts.AnchorTimeMs != nil {
			anchor = *opts.AnchorTimeMs
		}
		if anchor < source.StartMs || anchor >= source.EndMs {
			return nil, production.ErrMediaAnalysis
		}
		aspect := float64(9) / 16
		if opts.TargetAspect != nil {
			aspect = *opts.TargetAspect
		}
		if !finite(aspect) || aspect < 0.25 || aspect > 4 {
			return nil, production.ErrMediaAnalysis
		}
		result["roi"], result["anchor_time"], result["target_aspect"] = opts.ROI, float64(anchor-source.StartMs)/1000, aspect
	default:
		return nil, production.ErrMediaAnalysis
	}
	return result, nil
}

func (s *Service) analysisOccurrence(userID, projectID, clipID, resourceID string) (string, int64, int64, error) {
	cut, err := s.GetProjectTimeline(userID, projectID)
	if err != nil {
		return "", 0, 0, err
	}
	var timeline renderProject
	if json.Unmarshal(cut.Timeline, &timeline) != nil {
		return "", 0, 0, BadAuthRequest("无法读取分析片段，请先保存剪辑")
	}
	for _, clip := range timeline.Clips {
		id, ok := mediaResourceID(clip)
		if clip.ID != clipID {
			continue
		}
		if !ok || id != resourceID || (clip.Kind != "video" && clip.Kind != "audio") {
			break
		}
		start, end := clip.SourceStartMs, clip.SourceStartMs+int64(math.Round(float64(clip.DurationMs)*clip.rate()))
		var version string
		if clip.ProductionBinding != nil {
			version = clip.ProductionBinding.AssetVersionID
		}
		binding := struct {
			Resource   string
			Version    string
			Start, End int64
			Rate       float64
		}{id, version, start, end, clip.rate()}
		return mediaAnalysisDigest(binding), start, end, nil
	}
	return "", 0, 0, BadAuthRequest("片段来源已变化，请先保存剪辑后重新选择")
}

func (s *Service) spoolAnalysisSource(ctx context.Context, userID, resourceID string) (*model.Resource, *os.File, string, func(), error) {
	resource, reader, err := s.OpenResource(userID, resourceID)
	if err != nil {
		return nil, nil, "", nil, NotFound("无法读取原始素材")
	}
	if reader == nil {
		return nil, nil, "", nil, NotFound("无法打开原始素材")
	}
	defer reader.Close()
	stopClosing := context.AfterFunc(ctx, func() { _ = reader.Close() })
	defer stopClosing()
	if resource == nil || resource.Status != model.ResourceStatusReady || (resource.Kind != "audio" && resource.Kind != "video") || !isTranscribableMime(resource.MimeType) || resource.Size <= 0 || resource.Size > 1<<30 {
		return nil, nil, "", nil, BadAuthRequest("请选择不超过1GB的已保存音视频原始素材")
	}
	file, err := os.CreateTemp("", "yingce-analysis-source-*")
	if err != nil {
		return nil, nil, "", nil, err
	}
	cleanup := func() { _ = file.Close(); _ = os.Remove(file.Name()) }
	digest := sha256.New()
	count, err := io.Copy(io.MultiWriter(file, digest), io.LimitReader(reader, resource.Size+1))
	if err == nil {
		err = ctx.Err()
	}
	if err != nil || count != resource.Size {
		cleanup()
		if err != nil {
			return nil, nil, "", nil, err
		}
		return nil, nil, "", nil, BadAuthRequest("原始素材不完整，未开始分析")
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		cleanup()
		return nil, nil, "", nil, err
	}
	return resource, file, hex.EncodeToString(digest.Sum(nil)), cleanup, nil
}

func (s *Service) CreateMediaAnalysisTask(ctx context.Context, userID string, req MediaAnalysisCreateRequest) (*model.Task, error) {
	if strings.TrimSpace(userID) == "" {
		return nil, Unauthorized("请先登录")
	}
	req.RequestID, req.ProjectID, req.ResourceID, req.Kind, req.SourceClipID, req.Title = strings.TrimSpace(req.RequestID), strings.TrimSpace(req.ProjectID), strings.TrimSpace(req.ResourceID), strings.TrimSpace(req.Kind), strings.TrimSpace(req.SourceClipID), strings.TrimSpace(req.Title)
	if len(req.RequestID) < 16 || len(req.RequestID) > 128 || strings.ContainsAny(req.RequestID, "\x00\r\n") || req.ProjectID == "" || req.ResourceID == "" || len(req.ResourceID) > 80 || len(req.SourceClipID) > 128 || !utf8.ValidString(req.Title) || utf8.RuneCountInString(req.Title) > 240 {
		return nil, BadAuthRequest("素材分析参数或请求编号无效")
	}
	if req.Kind != "reference_video" && req.Kind != "audio_structure" && req.Kind != "subject_track" {
		return nil, BadAuthRequest("请选择支持的素材分析方式")
	}
	if req.LongReference && req.Kind != "reference_video" {
		return nil, BadAuthRequest("长参考检查点只适用于视频分段")
	}
	if _, err := s.activeProjectForUser(userID, req.ProjectID); err != nil {
		return nil, err
	}
	id, signature := mediaAnalysisID("media-analysis-v1", userID, req.RequestID), mediaAnalysisDigest(req)
	if existing, err := s.existingMediaAnalysisTask(userID, id, signature); err != nil || existing != nil {
		return existing, err
	}
	if s.IsDraining() {
		return nil, &AppError{Status: 503, Code: 503, Message: "服务正在维护，请稍后分析", Retryable: true}
	}
	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	cipher, err := s.pinMediaAnalysisWorker(ctx)
	if err != nil {
		return nil, WrapAppError(503, "本地素材分析暂不可用", err)
	}
	resource, file, digest, cleanup, err := s.spoolAnalysisSource(ctx, userID, req.ResourceID)
	if cleanup != nil {
		defer cleanup()
	}
	if err != nil {
		return nil, err
	}
	width, height, duration, err := inspectProductionImportMedia(ctx, file, resource.MimeType)
	if err != nil || duration <= 0 {
		return nil, BadAuthRequest("无法确认原始素材的有效时长，请先检查音视频")
	}
	if req.Kind != "audio_structure" && resource.Kind != "video" {
		return nil, BadAuthRequest("参考视频分析和主体跟踪需要视频素材")
	}
	source := production.MediaAnalysisSource{ResourceID: resource.ID, SHA256: digest, ETag: resource.ETag, Bytes: resource.Size, DurationMs: duration, Width: width, Height: height, Windowed: req.LongReference}
	if resource.Kind == "video" {
		source.DisplayGeometryVersion = 1
	}
	start, end := int64(0), duration
	if req.SourceClipID != "" {
		source.ClipBindingSHA256, start, end, err = s.analysisOccurrence(userID, req.ProjectID, req.SourceClipID, req.ResourceID)
		if err != nil {
			return nil, err
		}
		source.SourceClipID = req.SourceClipID
		if start < 0 || end > duration {
			return nil, BadAuthRequest("剪辑片段超出原始素材范围，请先调整剪辑")
		}
	}
	if req.StartMs != nil {
		if *req.StartMs < start || *req.StartMs >= end {
			return nil, BadAuthRequest("分析起点超出所选素材或片段")
		}
		start = *req.StartMs
	}
	if req.EndMs != nil {
		if *req.EndMs > end {
			return nil, BadAuthRequest("分析终点超出所选素材或片段")
		}
		end = *req.EndMs
	}
	maximum := int64(60000)
	if req.LongReference {
		maximum = 1800000
	}
	if req.Kind == "subject_track" {
		maximum = 120000
	}
	if req.EndMs == nil && end-start > maximum {
		end = start + maximum
	}
	source.StartMs, source.EndMs = start, end
	if production.ValidateMediaAnalysisSource(source, req.Kind) != nil {
		return nil, BadAuthRequest("分析区间无效：每次需50毫秒至60秒，主体跟踪最多120秒")
	}
	input := mediaAnalysisTaskInput{Version: 1, Request: req, RequestSHA256: signature, Source: source, SourceStorageKey: "resource:" + resource.ID, WorkerConfigCipher: cipher}
	if _, err := mediaAnalysisWorkerOptions(input); err != nil {
		return nil, BadAuthRequest("分析参数无效，请检查主体框、锚点或目标比例")
	}
	encoded, _ := json.Marshal(input)
	task := model.Task{ID: id, UserID: userID, ProjectID: req.ProjectID, Type: model.TaskTypeMediaAnalysis, Provider: "local", Model: "cpu-analysis-v1", Operation: req.Kind, Status: model.TaskStatusQueued, Stage: "等待素材分析", Progress: 3, Prompt: mediaAnalysisLabel(req.Kind), InputJSON: string(encoded)}
	policy, err := s.RuntimePolicy()
	if err != nil {
		return nil, err
	}
	s.storageMu.Lock()
	err = s.repo.Transaction(func(repo *repository.Repository) error {
		if err := repo.LockMediaAnalysisAdmission(userID, req.ProjectID, *resource); err != nil {
			return err
		}
		return createTaskWithStorageQuotaRepository(repo, &task, nil, policy)
	})
	s.storageMu.Unlock()
	if err != nil {
		if existing, readErr := s.existingMediaAnalysisTask(userID, id, signature); readErr == nil && existing != nil {
			return existing, nil
		}
		if errors.Is(err, repository.ErrActiveTaskLimit) {
			return nil, BadAuthRequest(fmt.Sprintf("同时排队或运行的任务最多%d个，请等待已有任务完成", policy.Task.ActiveTaskLimit))
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, NotFound("项目或素材已被删除、归档或替换，未创建分析任务")
		}
		return nil, err
	}
	s.wakeTaskDispatcher()
	s.recordActivity(userID, "task", 1)
	return taskForOutput(task), nil
}

func (w *taskWorkerCoordinator) processMediaAnalysis(task *model.Task, ctx context.Context) error {
	s := w.service
	var input mediaAnalysisTaskInput
	if json.Unmarshal([]byte(task.InputJSON), &input) != nil || input.Version != 1 || input.Source.Windowed != input.Request.LongReference || input.Request.ProjectID != task.ProjectID || input.RequestSHA256 != mediaAnalysisDigest(input.Request) || input.SourceStorageKey != "resource:"+input.Source.ResourceID || input.Source.ResourceID != input.Request.ResourceID || production.ValidateMediaAnalysisSource(input.Source, input.Request.Kind) != nil {
		return w.failTimelineTask(task, "分析失败", "任务缺少有效的固定素材与分析区间")
	}
	if _, err := s.activeProjectForUser(task.UserID, task.ProjectID); err != nil {
		return w.failTimelineTask(task, "分析失败", "项目已归档或不可用，原始素材保留")
	}
	worker, err := s.restoreMediaAnalysisWorker(input.WorkerConfigCipher)
	if err != nil {
		return w.failTimelineTask(task, "分析失败", err.Error())
	}
	if err := w.progress(task, "等待本地分析资源", 5); err != nil {
		return err
	}
	select {
	case mediaAnalysisSlots <- struct{}{}:
		defer func() { <-mediaAnalysisSlots }()
	case <-ctx.Done():
		return w.failMediaAnalysis(task, ctx, ctx.Err())
	}
	if err := w.progress(task, "核对原始素材", 10); err != nil {
		return err
	}
	resource, file, digest, cleanup, err := s.spoolAnalysisSource(ctx, task.UserID, input.Source.ResourceID)
	if cleanup != nil {
		defer cleanup()
	}
	if err != nil {
		return w.failMediaAnalysis(task, ctx, err)
	}
	if digest != input.Source.SHA256 || resource.Size != input.Source.Bytes || resource.ETag != input.Source.ETag {
		return w.failTimelineTask(task, "分析失败", "源文件内容已变化，未分析替换后的素材")
	}
	if err := w.progress(task, "测量素材，原始文件保留", 40); err != nil {
		return err
	}
	var evidence []byte
	var edits production.MediaAnalysisEdits
	if input.Request.LongReference {
		evidence, edits, err = w.measureReferenceWindows(ctx, task, input, worker, file.Name())
	} else {
		evidence, edits, err = measureMediaAnalysisInterval(ctx, input, worker, file.Name())
	}
	if err != nil {
		return w.failMediaAnalysis(task, ctx, err)
	}
	if err := ctx.Err(); err != nil {
		return w.failMediaAnalysis(task, ctx, err)
	}
	if err := w.progress(task, "保存分析与初始版本", 90); err != nil {
		return err
	}
	now := time.Now()
	analysisID, revisionID := mediaAnalysisID("project-media-analysis", task.ID), mediaAnalysisID("media-analysis-initial-version", task.ID)
	title := input.Request.Title
	if title == "" {
		title = mediaAnalysisLabel(input.Request.Kind)
	}
	sourceJSON, _ := json.Marshal(input.Source)
	documentJSON, _ := json.Marshal(edits)
	row := model.ProjectMediaAnalysis{ID: analysisID, UserID: task.UserID, ProjectID: task.ProjectID, Kind: input.Request.Kind, SourceKind: "cpu_analysis", SourceKey: task.ID, SourceTaskID: task.ID, ResourceID: input.Source.ResourceID, Title: title, SourceJSON: string(sourceJSON), EvidenceJSON: string(evidence), CurrentRevisionID: revisionID, Revision: 1, CreatedAt: now, UpdatedAt: now}
	revision := model.ProjectMediaAnalysisRevision{ID: revisionID, AnalysisID: analysisID, UserID: task.UserID, AuthorID: task.UserID, Version: 1, RequestID: "initial:" + task.ID, RequestSHA256: input.RequestSHA256, DocumentJSON: string(documentJSON), Note: "原始测量，等待人工核对", CreatedAt: now}
	result, _ := json.Marshal(map[string]any{"analysisId": analysisID, "initialRevisionId": revisionID, "kind": row.Kind, "source": input.Source, "engineSHA256": worker.EngineSHA256})
	s.storageMu.Lock()
	if err := s.validateProductionDocumentStorage(task.UserID, int64(len(sourceJSON)+len(evidence)+len(documentJSON))); err != nil {
		s.storageMu.Unlock()
		return w.failTimelineTask(task, "分析结果未保存", "结构化数据空间不足，请清理项目数据后恢复此任务；原素材和测量缓存保留")
	}
	defer s.storageMu.Unlock()
	task.Status, task.Stage, task.Progress, task.ResultJSON, task.CompletedAt = model.TaskStatusSucceeded, "分析已保存，请核对后采用", 100, string(result), &now
	return s.repo.SaveTaskCompletionWithRegistration(task, model.TaskStatusRunning, nil, func(repo *repository.Repository) error {
		_, err := repo.CreateProjectMediaAnalysis(&row, &revision)
		return err
	})
}

func measureMediaAnalysisInterval(ctx context.Context, input mediaAnalysisTaskInput, worker mediaAnalysisWorkerSnapshot, file string) ([]byte, production.MediaAnalysisEdits, error) {
	var edits production.MediaAnalysisEdits
	options, err := mediaAnalysisWorkerOptions(input)
	if err != nil {
		return nil, edits, err
	}
	normalized, cleanup, err := normalizeMediaAnalysis(ctx, file, input)
	if cleanup != nil {
		defer cleanup()
	}
	if err != nil {
		return nil, edits, err
	}
	proxySHA := sha256.Sum256(normalized)
	body, _ := json.Marshal(map[string]any{"engineVersion": worker.EngineVersion, "engineSHA256": worker.EngineSHA256, "action": input.Request.Kind, "media": base64.StdEncoding.EncodeToString(normalized), "options": options})
	// Only an explicit busy rejection is safe to retry. Transport timeouts or
	// other unknown replies retain the existing user-controlled retry boundary.
	waitCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()
	var evidence []byte
	for attempt := 0; ; attempt++ {
		evidence, err = mediaAnalysisWorkerRequest(waitCtx, worker, "POST", "/v1/analyze", body, 5*time.Minute)
		if !errors.Is(err, errMediaAnalysisWorkerBusy) || attempt >= 60 {
			break
		}
		timer := time.NewTimer(min(time.Duration(attempt+1), 5) * time.Second)
		select {
		case <-waitCtx.Done():
			timer.Stop()
			return nil, edits, waitCtx.Err()
		case <-timer.C:
		}
	}
	if err != nil {
		return nil, edits, err
	}
	var engine struct {
		EngineSHA256 string `json:"engine_sha256"`
	}
	if json.Unmarshal(evidence, &engine) != nil || engine.EngineSHA256 != worker.EngineSHA256 {
		return nil, edits, errors.New("分析服务与任务固定版本不一致，未采用结果")
	}
	edits, err = production.InitialMediaAnalysisEdits(input.Source, input.Request.Kind, evidence, hex.EncodeToString(proxySHA[:]))
	if err != nil {
		return nil, edits, errors.New("测量结果与固定素材区间不一致，未采用结果")
	}
	return evidence, edits, nil
}

func (w *taskWorkerCoordinator) failMediaAnalysis(task *model.Task, ctx context.Context, cause error) error {
	if ctx.Err() != nil {
		latest, err := w.service.repo.Task(task.ID)
		if err != nil {
			return err
		}
		if latest.Status == model.TaskStatusCancelled {
			return nil
		}
		return ctx.Err()
	}
	return w.failTimelineTask(task, "分析未完成", cause.Error())
}

func normalizeMediaAnalysis(ctx context.Context, source string, input mediaAnalysisTaskInput) ([]byte, func(), error) {
	ffmpeg, err := exec.LookPath("ffmpeg")
	if err != nil {
		return nil, nil, errors.New("服务端FFmpeg不可用，尚未开始分析")
	}
	directory, err := os.MkdirTemp("", "yingce-analysis-proxy-*")
	if err != nil {
		return nil, nil, err
	}
	name := filepath.Join(directory, "interval.mp4")
	cleanup := func() { _ = os.Remove(name); _ = os.Remove(directory) }
	seconds := func(ms int64) string { return fmt.Sprintf("%.3f", float64(ms)/1000) }
	args := []string{"-hide_banner", "-loglevel", "error", "-nostdin", "-ss", seconds(input.Source.StartMs), "-i", source, "-t", seconds(input.Source.EndMs - input.Source.StartMs)}
	if input.Request.Kind == "audio_structure" {
		name = filepath.Join(directory, "interval.wav")
		args = append(args, "-vn", "-ac", "1", "-ar", "22050", "-c:a", "pcm_s16le", name)
	} else {
		args = append(args, "-an", "-vf", "scale=480:480:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=8,setsar=1,setpts=PTS-STARTPTS", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p", name)
	}
	command := exec.CommandContext(ctx, ffmpeg, args...)
	command.Stdout, command.Stderr = io.Discard, io.Discard
	if err := command.Run(); err != nil {
		cleanup()
		return nil, nil, errors.New("分析区间预处理失败，请检查原始音视频")
	}
	info, err := os.Stat(name)
	if err != nil || info.Size() <= 0 || info.Size() > 24<<20 {
		cleanup()
		return nil, nil, errors.New("分析区间过大或没有有效音视频，请缩短区间")
	}
	data, err := os.ReadFile(name)
	if err != nil {
		cleanup()
		return nil, nil, err
	}
	return data, cleanup, nil
}
