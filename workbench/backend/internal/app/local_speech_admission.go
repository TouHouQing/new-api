// SPDX-License-Identifier: AGPL-3.0-or-later
package app

import (
	"context"
	"encoding/json"
	"yingce/backend/internal/protocol"
)

// Validate real owned bytes and resource-bound permission before reserving a
// task or credits. Inline media is used only in this local working copy.
func (s *Service) validateLocalSpeechAdmission(userID string, input map[string]any) error {
	config, _ := input["config"].(map[string]any)
	adapterID, _ := config["interfaceType"].(string)
	if protocol.LocalAudioCapabilities(adapterID) == nil {
		return nil
	}
	capabilities := protocol.LocalSpeechCapabilities()
	if adapterID == protocol.LocalSeparation {
		capabilities = protocol.LocalSeparationCapabilities()
	}
	if adapterID == protocol.LocalMusic {
		capabilities = protocol.LocalMusicCapabilities()
	}
	raw, err := json.Marshal(input)
	if err != nil {
		return BadAuthRequest("配音输入格式无效")
	}
	var value canvasGenerationInput
	if json.Unmarshal(raw, &value) != nil {
		return BadAuthRequest("配音输入格式无效")
	}
	if value.Mode != "audio" {
		return BadAuthRequest("本地配音必须使用音频任务")
	}
	if adapterID == protocol.LocalMusic && len(value.ReferenceAudios)+len(value.ReferenceImages)+len(value.ReferenceVideos) > 0 {
		return BadAuthRequest("本地音乐暂不支持参考素材，请先断开连接")
	}
	if err = s.hydrateGenerationMedia(userID, &value, providerMediaHydrationPolicy{ownedBytes: true, mediaKind: "audio", maxBytes: capabilities.MaxReferenceBytes}); err != nil {
		return BadAuthRequest(err.Error())
	}
	for _, audio := range value.ReferenceAudios {
		if audio.DurationMs < capabilities.MinReferenceDurationMs || audio.DurationMs > capabilities.MaxReferenceDurationMs {
			if adapterID == protocol.LocalSeparation {
				return BadAuthRequest("分离声音支持0.1秒至10分钟的音频，请先裁剪过长素材")
			}
			return BadAuthRequest("声音参考需为3–20秒，请先裁剪或换一段清晰的讲话音频")
		}
	}
	request := protocolRequestFromInput(value)
	request.Extra["idempotencyKey"] = "admission-validation-only"
	for _, adapter := range protocol.LocalAdapters() {
		if adapter.Metadata().ID == adapterID {
			_, err = adapter.BuildCreate(context.Background(), protocol.RequestContext{Request: request})
			if err != nil {
				return BadAuthRequest(err.Error())
			}
			return nil
		}
	}
	return BadAuthRequest("本地配音协议不可用")
}
