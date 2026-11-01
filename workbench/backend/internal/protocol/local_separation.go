// SPDX-License-Identifier: AGPL-3.0-or-later
package protocol

import (
	"context"
	"fmt"
	"net/http"
	"strings"
)

type localSeparationAdapter struct{ localAdapter }

func LocalSeparationCapabilities() *AudioCapabilities {
	return &AudioCapabilities{Operation: "separate", PromptMaxChars: 3000, MinReferenceAudios: 1, MaxReferenceAudios: 1, MaxReferenceBytes: 32 * 1024 * 1024, MinReferenceDurationMs: 100, MaxReferenceDurationMs: 600000, Formats: []string{"wav"}, Stems: []string{"pair", "all"}}
}

func (a localSeparationAdapter) Metadata() Metadata {
	return Metadata{ID: LocalSeparation, Version: "1.0.0", Name: "本地分离声音 · Demucs", Vendor: "影策", Categories: []Capability{CapabilityAudio}, Scopes: []Surface{SurfaceAdminSystemChannel, SurfaceCanvas, SurfaceCreation, SurfaceAgent}, Enabled: true, Execution: "declarative", Description: "将一段已上传音频分离成人声与伴奏，可展开鼓点、贝斯及其他乐器；使用本地离线模型，无需个人 API Key。"}
}

func (a localSeparationAdapter) BuildCreate(_ context.Context, c RequestContext) (RequestSpec, error) {
	r := c.Request
	key, _ := r.Extra["idempotencyKey"].(string)
	if key == "" || r.Model != "htdemucs" {
		return RequestSpec{}, fmt.Errorf("本地声音分离缺少原任务标识或已安装的 Demucs 模型")
	}
	if len(r.Images)+len(r.Videos) != 0 || len(r.Audios) != 1 {
		return RequestSpec{}, fmt.Errorf("请仅连接一段需要分离的音频；视频请先提取声音")
	}
	for _, ref := range r.Inputs {
		if ref.Kind != "audio" {
			return RequestSpec{}, fmt.Errorf("声音分离仅接受音频输入")
		}
	}
	ref := r.Audios[0]
	storage, _ := ref.Metadata["storageKey"].(string)
	if !strings.HasPrefix(storage, "resource:") || storage == "resource:" || !strings.HasPrefix(ref.DataURL, "data:audio/") || len(ref.DataURL) > 44*1024*1024 {
		return RequestSpec{}, fmt.Errorf("请使用已上传且经过归属校验的原始音频，最大32 MiB")
	}
	stems, _ := r.Extra["audioStems"].(string)
	if stems == "" {
		stems = "pair"
	}
	if stems != "pair" && stems != "all" {
		return RequestSpec{}, fmt.Errorf("请选择人声与伴奏，或全部五条分轨")
	}
	return RequestSpec{Method: http.MethodPost, Path: "/api/media/separate", OriginPath: true, ContentType: "application/json", Auth: ManifestAuth{Type: "none"}, Headers: map[string]string{"Idempotency-Key": key}, Body: map[string]any{"model_name": r.Model, "reference_audio": ref.DataURL, "stems": stems}}, nil
}

func (a localSeparationAdapter) ParsePoll(ctx context.Context, c PollContext, body []byte) (PollResult, error) {
	out, err := a.localAdapter.ParsePoll(ctx, c, body)
	if err != nil || out.Status != StatusSucceeded {
		return out, err
	}
	payload, err := decodeObject(body)
	if err != nil {
		return PollResult{}, err
	}
	items, _ := payload["outputs"].([]any)
	expected := 2
	if c.Request.Extra["audioStems"] == "all" {
		expected = 5
	}
	if out.Result == nil || len(items) != len(out.Result.Audios) || len(items) != expected {
		return PollResult{}, fmt.Errorf("声音分离结果不完整，请保留原任务回执核对；未重复执行")
	}
	roles := []string{"vocals", "instrumental", "drums", "bass", "other"}
	for i, raw := range items {
		item, ok := raw.(map[string]any)
		if !ok || item["role"] != roles[i] || item["filename"] != roles[i]+".wav" || item["url"] != "/api/jobs/"+c.TaskID+"/outputs/"+fmt.Sprint(i) {
			return PollResult{}, fmt.Errorf("声音分离结果的分轨顺序或身份不一致")
		}
		name, _ := item["name"].(string)
		out.Result.Audios[i].Name = name
		out.Result.Audios[i].Role = roles[i]
		out.Result.Audios[i].MIMEType = "audio/wav"
	}
	return out, nil
}
