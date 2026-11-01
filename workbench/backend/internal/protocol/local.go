// SPDX-License-Identifier: AGPL-3.0-or-later
package protocol

import (
	"context"
	"crypto/sha256"
	"fmt"
	"net/http"
	"net/url"
	"path"
	"strings"
)

const (
	LocalText       = "yingce-local-text"
	LocalImage      = "yingce-local-image"
	LocalVideo      = "yingce-local-video"
	LocalAudio      = "yingce-local-audio"
	LocalSeparation = "yingce-local-separation"
	LocalMusic      = "yingce-local-music"
	LocalLipSync    = "yingce-local-lip-sync"
)

func IsLocal(id string) bool {
	for _, adapter := range LocalAdapters() {
		if adapter.Metadata().ID == id {
			return true
		}
	}
	return false
}

func LocalMediaCapability(id string) Capability {
	for _, adapter := range LocalAdapters() {
		metadata := adapter.Metadata()
		if metadata.ID == id && len(metadata.Categories) == 1 && metadata.Categories[0] != CapabilityText {
			return metadata.Categories[0]
		}
	}
	return ""
}

// LocalAdapters are core transports, not independently installed job systems.
// Only administrator-owned system channels may execute these keyless adapters.
func LocalAdapters() []Adapter {
	return []Adapter{localAdapter{CapabilityText}, localAdapter{CapabilityImage}, localAdapter{CapabilityVideo}, localSpeechAdapter{localAdapter{CapabilityAudio}}, localSeparationAdapter{localAdapter{CapabilityAudio}}, localMusicAdapter{localAdapter{CapabilityAudio}}, localLipSyncAdapter{localAdapter{CapabilityVideo}}}
}

type localAdapter struct{ capability Capability }

func (a localAdapter) Metadata() Metadata {
	id, name := LocalText, "本地文本 · Ollama"
	if a.capability == CapabilityImage {
		id, name = LocalImage, "本地图片 · ComfyUI"
	}
	if a.capability == CapabilityVideo {
		id, name = LocalVideo, "本地视频 · ComfyUI"
	}
	scopes := []Surface{SurfaceAdminSystemChannel, SurfaceCanvas, SurfaceCreation}
	if a.capability == CapabilityText {
		scopes = append(scopes, SurfaceAgent)
	}
	return Metadata{ID: id, Version: "1.0.0", Name: name, Vendor: "影策", Categories: []Capability{a.capability},
		Scopes: scopes, Enabled: true, Execution: "declarative",
		Description: "使用管理员配置的本地模型，不需要个人 API Key；支持一张参考图，看图、图片修改或视频首帧。"}
}

func (a localAdapter) BuildCreate(_ context.Context, c RequestContext) (RequestSpec, error) {
	r := c.Request
	if len(r.Videos)+len(r.Audios) > 0 {
		return RequestSpec{}, fmt.Errorf("当前本地模型不接受参考视频或音频")
	}
	images := r.Images
	if len(images) == 0 {
		images = r.Inputs
	}
	if len(images) > 1 {
		return RequestSpec{}, fmt.Errorf("本地模型每次最多接受一张参考图")
	}
	for _, item := range r.Inputs {
		if item.Kind != "" && item.Kind != "image" || item.Role == "mask" || item.Role == "last_frame" {
			return RequestSpec{}, fmt.Errorf("本地模型仅接受普通图片或视频首帧，不支持遮罩和尾帧")
		}
	}
	key, _ := r.Extra["idempotencyKey"].(string)
	if key == "" {
		return RequestSpec{}, fmt.Errorf("本地模型缺少任务幂等标识")
	}
	body := map[string]any{"model": string(a.capability), "model_name": r.Model, "prompt": r.Prompt}
	for _, image := range images {
		if image.Role == "mask" || image.Role == "last_frame" || (image.Kind != "" && image.Kind != "image") {
			return RequestSpec{}, fmt.Errorf("本地模型不支持此参考素材的类型或用途")
		}
		address := strings.TrimSpace(image.DataURL)
		if address == "" && strings.HasPrefix(image.URL, "data:") {
			address = image.URL
		}
		if !strings.HasPrefix(address, "data:image/") || len(address) > 12*1024*1024 {
			return RequestSpec{}, fmt.Errorf("本地参考图需要已校验归属的图片像素，请先将图片上传到素材库（不超过 8 MiB）")
		}
		body["reference_images"] = []string{address}
	}
	route := "/api/submit"
	if a.capability == CapabilityText {
		route = "/api/generate"
		messages := []Message{}
		if r.Instructions != "" {
			messages = append(messages, Message{Role: "system", Content: r.Instructions})
		}
		messages = append(messages, r.Messages...)
		messages = append(messages, Message{Role: "user", Content: r.Prompt})
		body["messages"] = messages
		if limit, ok := r.Extra["max_tokens"]; ok {
			body["max_tokens"] = limit
		}
		if window, ok := r.Extra["context_length"]; ok {
			body["context_length"] = window
		}
		if think, ok := r.Extra["think"]; ok {
			body["think"] = think
		}
		if schema, ok := r.Extra["response_format"].(map[string]any); ok {
			body["response_format"] = schema
		}
	} else {
		if r.ImageCount > 1 || r.Output.Count > 1 {
			return RequestSpec{}, fmt.Errorf("本地模型每个任务只生成一个结果")
		}
		width, height := 512, 512
		if a.capability == CapabilityVideo {
			width, height = 512, 288
		}
		switch r.AspectRatio {
		case "", "16:9":
			if a.capability == CapabilityImage && r.AspectRatio == "16:9" {
				width, height = 768, 432
			}
		case "1:1":
			width, height = 512, 512
		case "9:16":
			width, height = 432, 768
			if a.capability == CapabilityVideo {
				width, height = 288, 512
			}
		default:
			return RequestSpec{}, fmt.Errorf("本地模型暂不支持画幅 %s", r.AspectRatio)
		}
		if a.capability == CapabilityVideo {
			switch r.Resolution {
			case "", "288p":
			case "720p":
				width, height = 1280, 704
				if r.AspectRatio == "9:16" {
					width, height = 704, 1280
				}
			default:
				return RequestSpec{}, fmt.Errorf("本地视频只支持 288p 预览或 720p 生成")
			}
		}
		if r.Output.Width != 0 || r.Output.Height != 0 {
			width, height = r.Output.Width, r.Output.Height
		}
		if width < 128 || height < 128 || width > 2048 || height > 2048 || width%16 != 0 || height%16 != 0 {
			return RequestSpec{}, fmt.Errorf("本地生成尺寸必须为 128–2048 范围内的 16 的倍数")
		}
		body["width"], body["height"] = width, height
		if a.capability == CapabilityVideo {
			if r.GenerateAudio || r.Output.GenerateAudio {
				return RequestSpec{}, fmt.Errorf("当前本地视频模型不生成音频")
			}
			duration := r.Duration
			if duration == 0 {
				duration = r.Output.Duration
			}
			if duration == 0 {
				duration = 3
			}
			if duration < 1 || duration > 10 {
				return RequestSpec{}, fmt.Errorf("本地视频时长必须为 1–10 秒")
			}
			body["frames"] = duration*24 + 1
		}
	}
	return RequestSpec{Method: http.MethodPost, Path: route, OriginPath: true, ContentType: "application/json", Auth: ManifestAuth{Type: "none"}, Headers: map[string]string{"Idempotency-Key": key}, Body: body}, nil
}

func (a localAdapter) ParseCreate(_ context.Context, body []byte) (CreateResult, error) {
	payload, err := decodeObject(body)
	if err != nil {
		return CreateResult{}, err
	}
	if a.capability == CapabilityText {
		// Receipt recovery wraps the already persisted text response in result.
		if result, ok := payload["result"].(map[string]any); ok {
			payload = result
		}
		content, _ := payload["content"].(string)
		if strings.TrimSpace(content) == "" {
			return CreateResult{}, fmt.Errorf("本地文本模型没有返回正文")
		}
		usage, _ := payload["usage"].(map[string]any)
		return CreateResult{Status: StatusSucceeded, Result: &Result{Text: content, Usage: usage}}, nil
	}
	id, _ := payload["prompt_id"].(string)
	if id == "" {
		return CreateResult{}, fmt.Errorf("本地模型未返回 ComfyUI 回执")
	}
	return CreateResult{TaskID: id, Status: StatusPending}, nil
}

func (a localAdapter) BuildPoll(_ context.Context, c PollContext) (RequestSpec, error) {
	if c.TaskID == "" {
		return RequestSpec{}, fmt.Errorf("缺少本地任务回执")
	}
	return RequestSpec{Method: http.MethodGet, Path: "/api/jobs/" + url.PathEscape(c.TaskID), OriginPath: true, Auth: ManifestAuth{Type: "none"}}, nil
}

func (a localAdapter) ParsePoll(_ context.Context, c PollContext, body []byte) (PollResult, error) {
	payload, err := decodeObject(body)
	if err != nil {
		return PollResult{}, err
	}
	status, _ := payload["status"].(string)
	out := PollResult{TaskID: c.TaskID, Status: Status(status)}
	if status == "failed" || status == "cancelled" {
		if payload["reason"] == "receipt_missing" {
			return PollResult{}, fmt.Errorf("本地执行回执已丢失，请核对保存的结果；未确认取消或费用")
		}
		out.Message, _ = payload["message"].(string)
		return out, nil
	}
	if status == "pending" || status == "processing" {
		return out, nil
	}
	if status != "succeeded" {
		return PollResult{}, fmt.Errorf("本地任务返回未知状态 %q", status)
	}
	items, _ := payload["outputs"].([]any)
	result := &Result{}
	for _, raw := range items {
		item, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		filename, _ := item["filename"].(string)
		address, _ := item["url"].(string)
		if strings.HasPrefix(address, "/api/jobs/") {
			base, parseErr := url.Parse(c.BaseURL)
			ref, refErr := url.Parse(address)
			if parseErr != nil || refErr != nil || base.Host == "" || ref.Host != "" {
				return PollResult{}, fmt.Errorf("本地模型产物地址无效")
			}
			address = base.ResolveReference(ref).String()
		}
		ext := strings.ToLower(path.Ext(filename))
		ref := MediaReference{URL: address, Name: filename, Kind: string(a.capability)}
		if address == "" {
			continue
		}
		if a.capability == CapabilityImage && (ext == ".png" || ext == ".jpg" || ext == ".jpeg" || ext == ".webp") {
			result.Images = append(result.Images, ref)
		}
		if a.capability == CapabilityVideo && (ext == ".mp4" || ext == ".webm" || ext == ".mov") {
			result.Videos = append(result.Videos, ref)
		}
		if a.capability == CapabilityAudio && (ext == ".wav" || ext == ".mp3" || ext == ".flac" || ext == ".opus") {
			result.Audios = append(result.Audios, ref)
		}
	}
	if len(result.Images)+len(result.Videos)+len(result.Audios) == 0 {
		return PollResult{}, fmt.Errorf("本地任务已完成，但未找到对应类型的可读输出")
	}
	out.Result = result
	return out, nil
}

func (a localAdapter) BuildCancel(_ context.Context, c PollContext) (RequestSpec, error) {
	if a.capability == CapabilityText || c.TaskID == "" {
		return RequestSpec{}, fmt.Errorf("当前本地任务没有可取消的媒体回执")
	}
	return RequestSpec{Method: http.MethodPost, Path: "/api/jobs/" + url.PathEscape(c.TaskID) + "/cancel", OriginPath: true, ContentType: "application/json", Auth: ManifestAuth{Type: "none"}, Body: map[string]any{}}, nil
}

func (a localAdapter) BuildCreateRecovery(_ context.Context, c RequestContext) (RequestSpec, error) {
	key, _ := c.Request.Extra["idempotencyKey"].(string)
	if key == "" {
		return RequestSpec{}, fmt.Errorf("缺少原提交标识，不能恢复")
	}
	return RequestSpec{Method: http.MethodGet, Path: fmt.Sprintf("/api/receipts/%x", sha256.Sum256([]byte(key))), OriginPath: true, Auth: ManifestAuth{Type: "none"}}, nil
}
