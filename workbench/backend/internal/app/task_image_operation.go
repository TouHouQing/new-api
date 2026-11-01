package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"io"
	"os"
	"reflect"
	"strings"
	"time"

	"golang.org/x/sync/semaphore"
	"gorm.io/gorm"
	"yingce/backend/internal/imageops"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

const imageOperationMemoryBudget = 1536 << 20

var imageOperationMemory = semaphore.NewWeighted(imageOperationMemoryBudget)

type ImageOperationCreateRequest struct {
	RequestID                string          `json:"requestId"`
	ProjectID                string          `json:"projectId,omitempty"`
	SourceNodeID             string          `json:"sourceNodeId,omitempty"`
	ResourceID               string          `json:"resourceId"`
	Recipe                   imageops.Recipe `json:"recipe"`
	SourceGroupSHA256        string          `json:"sourceGroupSha256,omitempty"`
	ClientCompositeSignature string          `json:"clientCompositeSignature,omitempty"`
	ExpectedSourceSHA256     string          `json:"expectedSourceSha256,omitempty"`
}

type imageOperationInput struct {
	Version          int                         `json:"version"`
	Request          ImageOperationCreateRequest `json:"request"`
	RequestSHA256    string                      `json:"requestSha256"`
	Source           imageops.Source             `json:"source"`
	SourceStorageKey string                      `json:"sourceStorageKey"`
	Pieces           []imageops.Piece            `json:"pieces"`
	LayerSources     []imageOperationLayerSource `json:"layerSources,omitempty"`
	TrimGroup        *ImageLayerGroupSource      `json:"trimGroup,omitempty"`
	Materials        []imageLayerMaterialSource  `json:"materials,omitempty"`
	PatchSource      *imageOperationLayerSource  `json:"patchSource,omitempty"`
}

func imageOperationID(parts ...string) string {
	sum := sha256.Sum256([]byte(strings.Join(parts, "\x00")))
	return hex.EncodeToString(sum[:16])
}

func imageOperationRequestHash(req ImageOperationCreateRequest) string {
	encoded, _ := json.Marshal(req)
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:])
}

func (s *Service) existingImageOperation(userID, taskID, signature string) (*model.Task, error) {
	task, err := s.repo.TaskForUser(userID, taskID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var input imageOperationInput
	if task.Type != model.TaskTypeImageOperation || json.Unmarshal([]byte(task.InputJSON), &input) != nil || input.RequestSHA256 != signature {
		return nil, &AppError{Status: 409, Code: 409, Message: "操作编号已用于其他参数，请重新确认后再处理", Reason: "image_operation_conflict"}
	}
	return taskForOutput(*task), nil
}

// CreateImageOperationTask uses the native queue and original resource identity.
// Replaying an acknowledged request returns its task, including after completion.
func (s *Service) CreateImageOperationTask(userID string, req ImageOperationCreateRequest) (*model.Task, error) {
	if req.Recipe.Operation == "trim-layers" || len(req.Recipe.TrimLayers) > 0 {
		return nil, BadAuthRequest("请从图层组的独立素材入口确认实际来源后裁剪")
	}
	if strings.TrimSpace(userID) == "" {
		return nil, BadAuthRequest("请先登录")
	}
	req.RequestID = strings.TrimSpace(req.RequestID)
	req.ProjectID = strings.TrimSpace(req.ProjectID)
	req.ResourceID = strings.TrimSpace(req.ResourceID)
	req.SourceNodeID = strings.TrimSpace(req.SourceNodeID)
	if len(req.RequestID) < 16 || len(req.RequestID) > 128 || req.ResourceID == "" || len(req.ResourceID) > 80 || len(req.ProjectID) > 80 || len(req.SourceNodeID) > 128 {
		return nil, BadAuthRequest("图片资源或操作编号无效")
	}
	taskID := imageOperationID("image-operation-v1", userID, req.RequestID)
	signature := imageOperationRequestHash(req)
	if existing, err := s.existingImageOperation(userID, taskID, signature); err != nil || existing != nil {
		return existing, err
	}
	if s.IsDraining() {
		return nil, &AppError{Status: 503, Code: 503, Message: "服务正在维护，请稍后处理图片", Retryable: true}
	}
	input, err := s.prepareImageOperationInput(userID, req)
	if err != nil {
		return nil, err
	}
	task := imageOperationTask(userID, input)
	policy, err := s.RuntimePolicy()
	if err != nil {
		return nil, err
	}
	if err = s.requireStoredFileCapacityForTask(userID, task.Type, policy); err != nil {
		return nil, err
	}
	if err = s.createTaskWithinStorageQuota(&task, nil, policy); err != nil {
		if existing, readErr := s.existingImageOperation(userID, taskID, signature); readErr == nil && existing != nil {
			return existing, nil
		}
		if errors.Is(err, repository.ErrActiveTaskLimit) {
			return nil, BadAuthRequest(fmt.Sprintf("同时排队或运行的任务最多%d个，请稍后重试", policy.Task.ActiveTaskLimit))
		}
		return nil, err
	}
	s.recordActivity(userID, "task", 1)
	_ = s.log(userID, task.ID, "info", "本地图片处理已进入队列，不调用模型", "")
	return taskForOutput(task), nil
}

// Preparation reads the owned immutable source without creating a task. Agent
// approvals and direct submissions therefore freeze the same CPU recipe.
func (s *Service) prepareImageOperationInput(userID string, req ImageOperationCreateRequest) (imageOperationInput, error) {
	var input imageOperationInput
	if !validExpectedImageSourceHash(req.ExpectedSourceSHA256) {
		return input, BadAuthRequest("原文件摘要须为64位小写SHA256")
	}
	task := model.Task{UserID: userID, ProjectID: req.ProjectID}
	if _, err := s.mediaTaskProject(&task); err != nil {
		return input, err
	}
	data, err := s.readImageOperationSource(userID, req.ResourceID)
	if err != nil {
		return input, err
	}
	source, err := imageops.Inspect(data)
	if err != nil {
		return input, BadAuthRequest(err.Error())
	}
	if req.ExpectedSourceSHA256 != "" && req.ExpectedSourceSHA256 != source.SHA256 {
		return input, &AppError{Status: 409, Code: 409, Reason: "image_operation_source_changed", Message: "原文件已变化，请重新核对像素区域"}
	}
	pieces, err := imageops.Plan(source.Width, source.Height, req.Recipe)
	if err != nil {
		return input, BadAuthRequest(err.Error())
	}
	if normal := req.Recipe.Normalize; normal != nil && normal.Width == source.Width && normal.Height == source.Height {
		return input, BadAuthRequest("尺寸已与原图一致，请直接选用原文件，无需重复处理")
	}
	input = imageOperationInput{Version: 1, Request: req, RequestSHA256: imageOperationRequestHash(req), Source: source, SourceStorageKey: "resource:" + req.ResourceID, Pieces: pieces}
	if err := s.prepareImagePatchSource(userID, &input); err != nil {
		return imageOperationInput{}, err
	}
	if req.Recipe.Compose != nil {
		input.LayerSources, err = s.inspectImageLayerSources(userID, *req.Recipe.Compose)
		if err != nil {
			return imageOperationInput{}, err
		}
		if req.SourceGroupSHA256 != "" {
			group, err := s.ReadImageLayerGroupSource(userID, req.ProjectID, req.SourceNodeID)
			if err != nil {
				return imageOperationInput{}, err
			}
			if group.SnapshotSHA256 != req.SourceGroupSHA256 || group.ResourceID != req.ResourceID || group.Source != source || !reflect.DeepEqual(group.Composition, *req.Recipe.Compose) || !reflect.DeepEqual(group.LayerSources, input.LayerSources) {
				return imageOperationInput{}, &AppError{Status: 409, Code: 409, Reason: "image_operation_source_changed", Message: "图层组或原文件已经变化，请重新核对来源后合成"}
			}
		}
	}
	if err := validateImageLayerSnapshots(input); err != nil {
		return imageOperationInput{}, BadAuthRequest(err.Error())
	}
	return input, nil
}

func imageOperationTask(userID string, input imageOperationInput) model.Task {
	encoded, _ := json.Marshal(input)
	task := model.Task{ID: imageOperationID("image-operation-v1", userID, input.Request.RequestID), UserID: userID, ProjectID: input.Request.ProjectID, Type: model.TaskTypeImageOperation, Operation: input.Request.Recipe.Operation, Provider: "local", Model: "image-raster-v1", Status: model.TaskStatusQueued, Stage: "等待队列调度", Prompt: imageOperationTitle(input.Request.Recipe.Operation), InputJSON: string(encoded)}
	if input.Request.SourceGroupSHA256 != "" || input.TrimGroup != nil {
		task.ImageLayerDeliveryStatus = "pending"
	}
	return task
}

func imageOperationTitle(operation string) string {
	switch operation {
	case "split":
		return "图片切分"
	case "crop":
		return "图片裁剪"
	case "resize":
		return "图片插值缩放"
	case "mask":
		return "图片遮罩提取或擦除"
	case "compose":
		return "图片图层合成"
	case "trim-layers":
		return "图层独立素材裁剪"
	case "region":
		return "原图区域提取"
	case "normalize":
		return "图层规格整理"
	default:
		return "图片处理"
	}
}

func (s *Service) readImageOperationSource(userID, resourceID string) ([]byte, error) {
	resource, err := s.Resource(userID, resourceID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, NotFound("无法读取源图片")
		}
		return nil, err
	}
	if resource == nil || resource.Status != model.ResourceStatusReady || resource.Kind != "image" || !strings.HasPrefix(resource.MimeType, "image/") || resource.Size <= 0 || resource.Size > imageops.MaxSourceBytes {
		return nil, BadAuthRequest("请选择已保存的静态图片，文件须不超过32MB")
	}
	_, reader, err := s.OpenResource(userID, resourceID)
	if err != nil {
		return nil, BadAuthRequest("源图片暂时无法读取，请稍后重试")
	}
	defer reader.Close()
	data, err := io.ReadAll(io.LimitReader(reader, imageops.MaxSourceBytes+1))
	if err != nil {
		return nil, BadAuthRequest("读取源图片失败")
	}
	if int64(len(data)) != resource.Size || len(data) > imageops.MaxSourceBytes {
		return nil, BadAuthRequest("源图片文件不完整或超过处理上限")
	}
	return data, nil
}

func decodeImageOperationInput(task *model.Task) (imageOperationInput, error) {
	var input imageOperationInput
	if json.Unmarshal([]byte(task.InputJSON), &input) != nil || input.Version != 1 || input.Request.ResourceID == "" || input.SourceStorageKey != "resource:"+input.Request.ResourceID || input.RequestSHA256 != imageOperationRequestHash(input.Request) {
		return input, errors.New("图片处理输入快照无效")
	}
	if !validExpectedImageSourceHash(input.Request.ExpectedSourceSHA256) || input.Request.ExpectedSourceSHA256 != "" && input.Request.ExpectedSourceSHA256 != input.Source.SHA256 {
		return input, errors.New("原文件摘要与固定输入不一致")
	}
	pieces, err := imageops.Plan(input.Source.Width, input.Source.Height, input.Request.Recipe)
	if err != nil {
		return input, err
	}
	if len(pieces) != len(input.Pieces) {
		return input, errors.New("图片处理区域数量不一致")
	}
	for i := range pieces {
		if pieces[i] != input.Pieces[i] {
			return input, errors.New("图片处理区域与配方不一致")
		}
	}
	if err := validateImagePatchSnapshot(input); err != nil {
		return input, err
	}
	if err := validateImageLayerSnapshots(input); err != nil {
		return input, err
	}
	return input, nil
}

func validExpectedImageSourceHash(value string) bool {
	if value == "" {
		return true
	}
	decoded, err := hex.DecodeString(value)
	return len(value) == 64 && err == nil && hex.EncodeToString(decoded) == value
}

func (w *taskWorkerCoordinator) processImageOperation(task *model.Task, ctx context.Context) (failure error) {
	if task.Operation == imageLayerWorkflowOperation {
		return w.processImageLayerWorkflow(task, ctx)
	}
	s := w.service
	defer func() {
		if latest, err := s.repo.Task(task.ID); err == nil && latest.Status == model.TaskStatusCancelled {
			s.cleanupMediaCheckpointFiles(latest)
			if errors.Is(failure, repository.ErrTaskStateConflict) || errors.Is(failure, context.Canceled) {
				failure = nil
			}
		}
	}()
	input, err := decodeImageOperationInput(task)
	if err != nil {
		return w.failTimelineTask(task, "图片处理失败", err.Error())
	}
	if _, err := s.mediaTaskProject(task); err != nil {
		return w.failTimelineTask(task, "图片处理失败", err.Error())
	}
	algorithm := "nearest"
	if input.Request.Recipe.Resize != nil {
		algorithm = input.Request.Recipe.Resize.Algorithm
	}
	if input.Request.Recipe.Normalize != nil {
		algorithm = input.Request.Recipe.Normalize.Algorithm
	}
	memory := imageops.WorkingSetBytes(input.Source, input.Pieces, algorithm)
	if input.Request.Recipe.Mask != nil {
		memory += int64(input.Source.Width) * int64(input.Source.Height) * 16
	}
	if input.Request.Recipe.Region != nil || input.Request.Recipe.Patch != nil {
		memory += int64(input.Source.Width) * int64(input.Source.Height) * 24
	}
	if input.Request.Recipe.Compose != nil {
		var layerPixels int64
		for _, layer := range input.LayerSources {
			layerPixels = max(layerPixels, int64(layer.Source.Width)*int64(layer.Source.Height))
		}
		memory += layerPixels*24 + int64(input.Source.Width)*int64(input.Source.Height)*8
	}
	if input.TrimGroup != nil {
		memory = 0
		for i, piece := range input.Pieces {
			_, source := imageOperationOutputSource(input, i)
			memory = max(memory, imageops.WorkingSetBytes(source, []imageops.Piece{piece}, algorithm))
		}
	}
	if memory <= 0 || memory > imageOperationMemoryBudget {
		return w.failTimelineTask(task, "图片处理失败", "图片处理所需内存超过上限，请先缩小图片或使用裁切")
	}
	if err := imageOperationMemory.Acquire(ctx, memory); err != nil {
		return w.imageOperationInterrupted(task, err)
	}
	defer imageOperationMemory.Release(memory)
	var checkpoint *mediaCheckpoint
	if task.MediaRecoveryJSON != "" {
		checkpoint, err = s.decodeMediaCheckpoint(task)
	} else {
		checkpoint = &mediaCheckpoint{Mode: "image", StartedAt: time.Now(), Items: make([]mediaCheckpointItem, len(input.Pieces))}
		for i := range checkpoint.Items {
			checkpoint.Items[i].MIMEType = "image/png"
		}
		err = s.saveMediaCheckpoint(task, checkpoint, "checkpoint")
	}
	if err != nil {
		return err
	}
	if checkpoint.Mode != "image" || len(checkpoint.Items) != len(input.Pieces) {
		return w.failTimelineTask(task, "图片处理失败", "图片处理检查点不一致")
	}
	var picture image.Image
	for i, piece := range input.Pieces {
		if err := ctx.Err(); err != nil {
			return w.imageOperationInterrupted(task, err)
		}
		if err := w.progress(task, fmt.Sprintf("处理图片 %d/%d", i+1, len(input.Pieces)), 5+70*i/len(input.Pieces)); err != nil {
			return err
		}
		resource, err := s.resourceForUploadKey(task.UserID, mediaUploadKey(task.ID, i))
		if err != nil {
			return s.handleMediaRecoveryFailure(task, err)
		}
		if resource != nil && resource.Status == model.ResourceStatusReady {
			continue
		}
		item := &checkpoint.Items[i]
		if path := s.mediaTempPath(item.TempName); path != "" {
			if info, err := os.Lstat(path); err == nil && info.Mode().IsRegular() {
				continue
			}
		}
		if picture == nil || input.TrimGroup != nil {
			resourceID, source := imageOperationOutputSource(input, i)
			data, err := s.readImageOperationSource(task.UserID, resourceID)
			if err != nil {
				return s.handleMediaRecoveryFailure(task, &mediaRecoveryError{stage: "checkpoint", cause: err})
			}
			picture, err = imageops.Decode(ctx, data, source)
			if err != nil {
				return w.imageOperationInterrupted(task, err)
			}
		}
		var data []byte
		if input.Request.Recipe.Compose != nil {
			data, err = s.renderImageComposition(ctx, task.UserID, input)
		} else if input.Request.Recipe.Mask != nil {
			data, err = imageops.RenderMaskPNG(ctx, picture, *input.Request.Recipe.Mask)
		} else if input.Request.Recipe.Region != nil {
			data, err = imageops.RenderRegionPNG(ctx, picture, *input.Request.Recipe.Region)
		} else if input.Request.Recipe.Patch != nil {
			data, err = s.renderImageBackgroundPatch(ctx, task.UserID, picture, input)
		} else {
			data, err = imageops.RenderPNG(ctx, picture, piece, algorithm)
		}
		if err != nil {
			return w.imageOperationInterrupted(task, err)
		}
		item.TempName, err = s.stageInlineMedia(data)
		if input.TrimGroup != nil {
			picture = nil
		}
		if err != nil {
			return s.handleMediaRecoveryFailure(task, &mediaRecoveryError{stage: "local_save", cause: err})
		}
		if err := s.saveMediaCheckpoint(task, checkpoint, "checkpoint"); err != nil {
			return err
		}
	}
	if err := ctx.Err(); err != nil {
		return w.imageOperationInterrupted(task, err)
	}
	result, err := s.materializeTaskMedia(ctx, task, providerConfig{}, checkpoint)
	if err != nil {
		return s.handleMediaRecoveryFailure(task, err)
	}
	result["imageOperation"] = input
	if images, ok := result["images"].([]interface{}); ok {
		for i, item := range images {
			if output, ok := item.(map[string]interface{}); ok {
				output["assetId"], output["assetVersionId"] = generationMediaAssetID(task.ID, i), imageOperationVersionID(task.ID, i)
				output["piece"] = input.Pieces[i]
			}
		}
	}
	if err := s.finishTaskMediaRecovery(task, result, nil); err != nil {
		return err
	}
	if input.Request.SourceGroupSHA256 != "" || input.TrimGroup != nil {
		s.deliverNativeImageLayerGroup(task)
	}
	return nil
}

func (w *taskWorkerCoordinator) imageOperationInterrupted(task *model.Task, cause error) error {
	latest, err := w.service.repo.Task(task.ID)
	if err != nil {
		return err
	}
	if latest.Status == model.TaskStatusCancelled {
		w.service.cleanupMediaCheckpointFiles(latest)
		return nil
	}
	return w.service.handleMediaRecoveryFailure(task, &mediaRecoveryError{stage: "checkpoint", retryable: errors.Is(cause, context.Canceled) || errors.Is(cause, context.DeadlineExceeded), cause: cause})
}
