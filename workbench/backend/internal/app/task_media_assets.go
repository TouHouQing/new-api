package app

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
)

// A deleted canvas/project must not be resurrected by an old download worker.
func (s *Service) mediaTaskProject(task *model.Task) (string, error) {
	id := task.ProjectID
	if id == "" {
		return "", nil
	}
	canvas, err := s.repo.CanvasProjectForUser(task.UserID, id)
	if err == nil {
		id = canvas.ProjectID
		if id == "" {
			return "", nil
		}
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return "", err
	}
	project, err := s.repo.ProjectForUser(task.UserID, id)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		// 电商任务的 projectId 是电商项目 ID：作品只进素材库，不挂业务项目素材库。
		if _, ecommerceErr := s.repo.EcommerceProject(task.UserID, id); ecommerceErr == nil {
			return "", nil
		} else if !errors.Is(ecommerceErr, gorm.ErrRecordNotFound) {
			return "", ecommerceErr
		}
		return "", NotFound("任务所属画布或项目已不存在")
	}
	if err != nil {
		return "", err
	}
	if project.Status == model.ProjectStatusArchived {
		return "", BadAuthRequest("项目已归档，无法恢复作品")
	}
	return project.ID, nil
}

// AudioOutputDurationMs returns the measured duration of the first persisted
// audio output. A missing or unmeasured duration is returned as an error so
// per-second billing can enter review instead of silently undercharging.
func (s *Service) AudioOutputDurationMs(task model.Task) (int64, error) {
	if capabilityFromTaskType(task.Type) != "audio" {
		return 0, nil
	}
	resourceID, _ := taskOutputResource(task.ResultJSON, task.Type)
	if resourceID == "" {
		return 0, errors.New("音频结果缺少已保存的资源")
	}
	resource, err := s.repo.ResourceForUser(task.UserID, resourceID)
	if err != nil {
		return 0, err
	}
	if resource.DurationMs <= 0 {
		return 0, errors.New("音频结果缺少有效时长")
	}
	return resource.DurationMs, nil
}

func generationMediaAssetID(taskID string, index int) string {
	sum := sha256.Sum256([]byte(fmt.Sprintf("materialize:%s:%d", taskID, index)))
	return "generation_" + hex.EncodeToString(sum[:])
}

// Uses the same effect key and ID as browser materialization, so reconnecting
// the canvas cannot create a second asset for a server-delivered output.
func (s *Service) registerRecoveredMediaAssets(task model.Task) error {
	if task.Type == model.TaskTypeImageOperation {
		return s.registerImageOperationAssets(task)
	}
	projectID, err := s.mediaTaskProject(&task)
	if err != nil {
		return err
	}
	checkpoint, err := s.decodeMediaCheckpoint(&task)
	if err != nil {
		return err
	}
	policy, err := s.RuntimePolicy()
	if err != nil {
		return err
	}
	for index, item := range checkpoint.Items {
		resource, err := s.repo.ResourceForUser(task.UserID, item.ResourceID)
		if err != nil {
			return err
		}
		if resource.Status != model.ResourceStatusReady {
			return errors.New("作品文件尚未保存完成")
		}
		effectKey := fmt.Sprintf("materialize:%s:%d", task.ID, index)
		assetID := generationMediaAssetID(task.ID, index)
		existing, err := s.repo.AssetForUser(task.UserID, assetID)
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		versionID := imageOperationID("generation-output-version", task.ID, fmt.Sprint(index))
		// Existing immutable versions are not re-created from mutable account
		// context, titles or current model settings during a later recovery.
		if version, err := s.repo.AssetVersion(versionID); err == nil {
			if version.AssetID != assetID {
				return errors.New("生成素材版本归属与原任务不匹配")
			}
			representations, err := s.repo.AssetRepresentations(versionID)
			if err != nil {
				return err
			}
			matched := false
			for _, representation := range representations {
				matched = matched || representation.TaskID == task.ID && representation.ResourceID == resource.ID
			}
			if !matched {
				return errors.New("生成素材版本缺少原任务的准确资源")
			}
			continue
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		now := time.Now()
		url := resourceFileURL(resource.ID)
		data := map[string]any{"storageKey": "resource:" + resource.ID, "mimeType": resource.MimeType, "bytes": resource.Size, "width": resource.Width, "height": resource.Height, "durationMs": resource.DurationMs}
		if checkpoint.Mode == "image" {
			data["dataUrl"] = url
		} else {
			data["url"] = url
		}
		title := map[string]string{"image": "生成图片", "video": "生成视频", "audio": "生成音频"}[checkpoint.Mode]
		sourceLabel, outputTag := "生成任务", "生成"
		metadata := map[string]any{"source": "generation-task", "generationEffectKey": effectKey, "taskId": task.ID, "outputIndex": index}
		var reworkSourceIDs []string
		if task.Type == model.TaskTypeVideoRework {
			input, err := decodeVideoReworkInput(&task)
			if err != nil {
				return err
			}
			title, sourceLabel, outputTag = "视频修复候选", "局部视频修复", "处理"
			metadata["source"], metadata["sourceResourceId"] = "video-rework", input.Plan.Source.ResourceID
			metadata["videoRework"] = map[string]any{"version": 1, "plan": input.Plan, "planSha256": cutSignature(input.Plan)}
			reworkSourceIDs = []string{input.Plan.Candidate.ResourceID}
		}
		if edit, signature, err := nativeImageEditForTask(&task); err != nil {
			return err
		} else if edit != nil {
			metadata["sourceResourceId"] = edit.ResourceID
			metadata["nativeImageEdit"] = map[string]any{"version": 1, "sourceNodeId": edit.SourceNodeID, "sourceSha256": edit.Source.SHA256, "recipeSha256": signature, "mask": edit.Mask}
			if edit.Emotion != nil {
				metadata["nativeImageEdit"].(map[string]any)["emotion"] = edit.Emotion
			}
		}
		if annotation, err := nativeImageAnnotationForTask(&task); err != nil {
			return err
		} else if annotation != nil {
			metadata["sourceResourceId"] = annotation.ResourceID
			metadata["annotationSource"] = annotation
		}
		if checkpoint.Mode == "audio" {
			labels := map[string]interface{}{}
			addProtocolMediaOutputLabels(labels, item.Reference)
			if name, ok := labels["name"].(string); ok {
				title = name
			}
			if role, ok := labels["role"].(string); ok {
				metadata["outputRole"] = role
			}
		}
		if projectID != "" {
			metadata["projectIds"] = []string{projectID}
		}
		definition := map[string]any{"version": 1, "taskId": task.ID, "outputIndex": index, "model": task.Model, "operation": task.Operation, "data": data, "metadata": metadata}
		if input := publicTaskInputJSON(task.InputJSON); input != "" {
			definition["input"] = json.RawMessage(input)
		}
		encodedDefinition, err := json.Marshal(definition)
		if err != nil {
			return err
		}
		payload, err := json.Marshal(map[string]any{"id": assetID, "kind": checkpoint.Mode, "category": model.AssetCategoryMaterial, "status": model.AssetVersionStatusConfirmed, "primaryVersionId": versionID, "source": sourceLabel, "title": title, "coverUrl": url, "tags": []string{outputTag}, "createdAt": now.UTC().Format(time.RFC3339Nano), "updatedAt": now.UTC().Format(time.RFC3339Nano), "data": data, "metadata": metadata})
		if err != nil {
			return err
		}
		usage, err := s.repo.UserStorageUsage(task.UserID)
		if err != nil {
			return err
		}
		if existing == nil {
			if err := validateStructuredStorageQuotaWithPolicy(usage, "asset", true, int64(len(payload)+len(encodedDefinition)*2+len(task.Prompt)), policy.Resource); err != nil {
				return err
			}
		} else if err := validateTaskDataGrowthQuotaWithPolicy(usage, int64(len(encodedDefinition)*2+len(task.Prompt)), policy.Resource); err != nil {
			return err
		}
		asset := &model.Asset{ID: assetID, UserID: task.UserID, Kind: checkpoint.Mode, Category: model.AssetCategoryMaterial, Status: model.AssetVersionStatusConfirmed, PrimaryVersionID: versionID, Title: title, PayloadJSON: string(payload), CreatedAt: now, UpdatedAt: now}
		version := &model.AssetVersion{ID: versionID, AssetID: assetID, Status: model.AssetVersionStatusConfirmed, DefinitionJSON: string(encodedDefinition), Prompt: task.Prompt, CreatedAt: now, UpdatedAt: now}
		representation := &model.AssetRepresentation{ID: imageOperationID("generation-output-representation", task.ID, fmt.Sprint(index)), TaskID: task.ID, AssetVersionID: versionID, ResourceID: resource.ID, MediaType: checkpoint.Mode, Role: fmt.Sprintf("output:%d", index), MetadataJSON: string(encodedDefinition), CreatedAt: now}
		sourceIDs := append([]string{}, reworkSourceIDs...)
		if sourceID := stringValue(metadata["sourceResourceId"]); sourceID != "" {
			sourceIDs = append(sourceIDs, sourceID)
		}
		if err := s.repo.CreateGenerationMediaAsset(asset, version, representation, sourceIDs); err != nil {
			return err
		}
		if task.Type == model.TaskTypeVideoRework {
			if err := s.registerVideoReworkFraming(task, *resource, item.NativeVideoReworkOutputSHA256); err != nil {
				return err
			}
		}
		if projectID != "" {
			if err := s.linkAssetToProject(asset, projectID, now); err != nil {
				return err
			}
		}
	}
	return nil
}

// linkAssetToProject 把素材挂到项目素材库根目录末尾；链接已存在时 LinkProjectAsset 不做修改（幂等）。
func (s *Service) linkAssetToProject(asset *model.Asset, projectID string, now time.Time) error {
	position, err := s.repo.NextProjectAssetPosition(projectID, "")
	if err != nil {
		return err
	}
	_, err = s.repo.LinkProjectAsset(asset, nil, &model.ProjectAssetLink{ID: newID(), ProjectID: projectID, AssetID: asset.ID, Position: position, CreatedAt: now})
	return err
}
