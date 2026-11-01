// SPDX-License-Identifier: AGPL-3.0-or-later
package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"os"
	"strings"
	"time"
	"yingce/backend/internal/model"
	"yingce/backend/internal/protocol"
)

func (s *Service) prepareNativeLipSync(userID, canvasID string, input map[string]any) error {
	metadata, _ := input["metadata"].(map[string]any)
	config, _ := input["config"].(map[string]any)
	if config["interfaceType"] != protocol.LocalLipSync && metadata["nativeLipSync"] == nil {
		return nil
	}
	if config["interfaceType"] != protocol.LocalLipSync || input["mode"] != "video" || canvasID == "" {
		return BadAuthRequest("口型须使用原生画布与已配置的本地口型模型")
	}
	plan, err := protocol.DecodeLipSyncPlan(metadata["nativeLipSync"])
	if err != nil {
		return BadAuthRequest(err.Error())
	}
	if plan == nil {
		return BadAuthRequest("请先保存当前画面、对白、时间和人物区域设置")
	}
	canvas, err := s.repo.CanvasProjectForUser(userID, canvasID)
	if err != nil {
		return err
	}
	doc, err := creationDocument(canvas.PayloadJSON)
	if err != nil {
		return err
	}
	nodes, err := creationObjects(doc["nodes"])
	if err != nil {
		return err
	}
	source, audio := nodes[plan.SourceNodeID], nodes[plan.AudioNodeID]
	sourceMeta, _ := source["metadata"].(map[string]any)
	audioMeta, _ := audio["metadata"].(map[string]any)
	if source["type"] != plan.SourceKind || sourceMeta["storageKey"] != plan.SourceStorageKey || audio["type"] != "audio" || audioMeta["storageKey"] != plan.AudioStorageKey {
		return BadAuthRequest("原画面或对白已变化，请重新选择并确认口型设置")
	}
	read := func(storage, kind string, maximum int64) (string, *model.Resource, error) {
		id := strings.TrimPrefix(storage, "resource:")
		resource, body, err := s.OpenResource(userID, id)
		if err != nil {
			return "", nil, err
		}
		defer body.Close()
		if resource.Kind != kind || resource.Status != "ready" || resource.Size > maximum {
			return "", nil, BadAuthRequest("所选口型素材类型、状态或文件大小不受支持")
		}
		content, err := io.ReadAll(io.LimitReader(body, maximum+1))
		if err != nil {
			return "", nil, err
		}
		if len(content) < 32 || int64(len(content)) > maximum {
			return "", nil, BadAuthRequest("所选口型素材为空或超过大小上限")
		}
		// Uploaded duration/size hints cannot authorize a model call. Inspect the
		// same owned bytes even when a browser previously supplied metadata.
		file, err := os.CreateTemp("", "yingce-lip-source-*")
		if err != nil {
			return "", nil, err
		}
		defer func() { file.Close(); os.Remove(file.Name()) }()
		if _, err = file.Write(content); err != nil {
			return "", nil, err
		}
		if _, err = file.Seek(0, io.SeekStart); err != nil {
			return "", nil, err
		}
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		width, height, duration, err := inspectProductionImportMedia(ctx, file, resource.MimeType)
		if err != nil {
			return "", nil, WrapAppError(400, "口型素材的实际尺寸或时长无法读取，请检查原文件", err)
		}
		actual := *resource
		actual.Width, actual.Height, actual.DurationMs = width, height, duration
		sum := sha256.Sum256(content)
		return hex.EncodeToString(sum[:]), &actual, nil
	}
	maximum := int64(8 * 1024 * 1024)
	if plan.SourceKind == "video" {
		maximum = 24 * 1024 * 1024
	}
	sourceHash, sourceResource, err := read(plan.SourceStorageKey, plan.SourceKind, maximum)
	if err != nil {
		return err
	}
	audioHash, audioResource, err := read(plan.AudioStorageKey, "audio", 8*1024*1024)
	if err != nil {
		return err
	}
	if plan.SourceSHA256 != "" && plan.SourceSHA256 != sourceHash || plan.AudioSHA256 != "" && plan.AudioSHA256 != audioHash {
		return BadAuthRequest("口型原文件摘要不同，请核对已保存的设置")
	}
	plan.SourceSHA256, plan.AudioSHA256 = sourceHash, audioHash
	encoded, err := json.Marshal(plan)
	if err != nil {
		return err
	}
	var sealed map[string]any
	if err = json.Unmarshal(encoded, &sealed); err != nil {
		return err
	}
	metadata["nativeLipSync"] = sealed
	raw, err := json.Marshal(input)
	if err != nil {
		return err
	}
	var value canvasGenerationInput
	if err = json.Unmarshal(raw, &value); err != nil {
		return err
	}
	if len(value.ReferenceImages)+len(value.ReferenceVideos) != 1 || len(value.ReferenceAudios) != 1 {
		return BadAuthRequest("口型只需要一份画面与一份对白")
	}
	if err = s.hydrateGenerationMedia(userID, &value, providerMediaHydrationPolicy{ownedBytes: true, maxBytes: 24 * 1024 * 1024}); err != nil {
		return err
	}
	sourceRef := value.ReferenceImages
	if plan.SourceKind == "video" {
		sourceRef = value.ReferenceVideos
	}
	if len(sourceRef) != 1 || sourceRef[0].StorageKey != plan.SourceStorageKey || value.ReferenceAudios[0].StorageKey != plan.AudioStorageKey {
		return BadAuthRequest("口型输入与确认的素材不同")
	}
	if sourceResource.Width < 48 || sourceResource.Height < 48 || sourceResource.Width > 1280 || sourceResource.Height > 1280 || sourceResource.Width%2 != 0 || sourceResource.Height%2 != 0 {
		return BadAuthRequest("请选择48–1280像素且宽高为偶数的画面；可先调整副本尺寸")
	}
	if plan.SourceKind == "video" && plan.Selection.EndMs > sourceResource.DurationMs+1 || plan.Selection.AudioStartMs+plan.Selection.EndMs-plan.Selection.StartMs > audioResource.DurationMs+1 {
		return BadAuthRequest("画面或对白不能覆盖所选时间，请缩短片段或调整起点")
	}
	if r := plan.Selection.Region; r != nil && (r.X+r.Width > sourceResource.Width || r.Y+r.Height > sourceResource.Height) {
		return BadAuthRequest("人物区域超出原画面，请重新框选")
	}
	request := protocolRequestFromInput(value)
	request.Extra["idempotencyKey"] = "admission-validation-only"
	for _, adapter := range protocol.LocalAdapters() {
		if adapter.Metadata().ID == protocol.LocalLipSync {
			_, err = adapter.BuildCreate(context.Background(), protocol.RequestContext{Request: request})
			if err != nil {
				return BadAuthRequest(err.Error())
			}
			return nil
		}
	}
	return BadAuthRequest("本地口型协议不可用")
}
