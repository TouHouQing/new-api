// SPDX-License-Identifier: AGPL-3.0-or-later
package protocol

import (
	"context"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"
)

type localSpeechAdapter struct{ localAdapter }

type AudioCapabilities struct {
	Operation              string   `json:"operation,omitempty"`
	MusicModes             []string `json:"musicModes,omitempty"`
	MinSeconds             int      `json:"minSeconds,omitempty"`
	MaxSeconds             int      `json:"maxSeconds,omitempty"`
	MinBPM                 int      `json:"minBpm,omitempty"`
	MaxBPM                 int      `json:"maxBpm,omitempty"`
	LyricsMaxChars         int      `json:"lyricsMaxChars,omitempty"`
	MinReferenceAudios     int      `json:"minReferenceAudios,omitempty"`
	Stems                  []string `json:"stems,omitempty"`
	PromptMaxChars         int      `json:"promptMaxChars"`
	MaxReferenceAudios     int      `json:"maxReferenceAudios"`
	MaxReferenceBytes      int64    `json:"maxReferenceBytes"`
	MinReferenceDurationMs int64    `json:"minReferenceDurationMs"`
	MaxReferenceDurationMs int64    `json:"maxReferenceDurationMs"`
	Formats                []string `json:"formats"`
	Languages              []string `json:"languages"`
	MinSpeed               float64  `json:"minSpeed"`
	MaxSpeed               float64  `json:"maxSpeed"`
	VoiceRightsRequired    bool     `json:"voiceRightsRequired"`
}

func LocalSpeechCapabilities() *AudioCapabilities {
	return &AudioCapabilities{PromptMaxChars: 3000, MaxReferenceAudios: 1, MaxReferenceBytes: 16 * 1024 * 1024, MinReferenceDurationMs: 3000, MaxReferenceDurationMs: 20000, Formats: []string{"wav", "mp3", "flac", "opus"}, Languages: strings.Fields("ar da de el en es fi fr he hi it ja ko ms nl no pl pt ru sv sw tr zh"), MinSpeed: .5, MaxSpeed: 2, VoiceRightsRequired: true}
}

func LocalAudioCapabilities(id string) *AudioCapabilities {
	switch id {
	case LocalAudio:
		return LocalSpeechCapabilities()
	case LocalSeparation:
		return LocalSeparationCapabilities()
	case LocalMusic:
		return LocalMusicCapabilities()
	default:
		return nil
	}
}

func (a localSpeechAdapter) Metadata() Metadata {
	return Metadata{ID: LocalAudio, Version: "1.0.0", Name: "本地配音 · Chatterbox", Vendor: "影策", Categories: []Capability{CapabilityAudio}, Scopes: []Surface{SurfaceAdminSystemChannel, SurfaceCanvas, SurfaceCreation}, Enabled: true, Execution: "declarative", Description: "使用已安装的离线配音模型；支持语言、0.5–2倍语速及一段已确认使用权的声音参考，无需个人 API Key。"}
}

func (a localSpeechAdapter) BuildCreate(_ context.Context, c RequestContext) (RequestSpec, error) {
	r := c.Request
	key, _ := r.Extra["idempotencyKey"].(string)
	if key == "" {
		return RequestSpec{}, fmt.Errorf("本地配音缺少任务幂等标识")
	}
	if r.Model != "chatterbox-multilingual" {
		return RequestSpec{}, fmt.Errorf("本地配音模型未安装或名称不匹配")
	}
	if strings.TrimSpace(r.Prompt) == "" || utf8.RuneCountInString(r.Prompt) > 3000 {
		return RequestSpec{}, fmt.Errorf("请将配音台词拆为每段不超过3000字")
	}
	if len(r.Images) > 0 || len(r.Videos) > 0 || len(r.Audios) > 1 {
		return RequestSpec{}, fmt.Errorf("本地配音仅支持一段音频参考")
	}
	for _, ref := range r.Inputs {
		if ref.Kind != "audio" {
			return RequestSpec{}, fmt.Errorf("本地配音不能使用图片或视频参考")
		}
	}
	value := func(name, fallback string) string {
		v, _ := r.Extra[name].(string)
		if strings.TrimSpace(v) == "" {
			return fallback
		}
		return strings.TrimSpace(v)
	}
	format := value("audioFormat", "mp3")
	switch format {
	case "wav", "mp3", "flac", "opus":
	default:
		return RequestSpec{}, fmt.Errorf("本地配音支持 WAV、MP3、FLAC 和 Opus 格式")
	}
	speed, err := strconv.ParseFloat(value("audioSpeed", "1"), 64)
	if err != nil || math.IsNaN(speed) || math.IsInf(speed, 0) || speed < .5 || speed > 2 {
		return RequestSpec{}, fmt.Errorf("本地配音语速须在0.5–2倍之间")
	}
	if value("audioInstructions", "") != "" {
		return RequestSpec{}, fmt.Errorf("本地配音暂不支持自由声音指令，请使用语言、语速或声音参考")
	}
	voice := value("audioVoice", "default")
	language := value("audioLanguage", "zh")
	validLanguage := false
	for _, candidate := range LocalSpeechCapabilities().Languages {
		if language == candidate {
			validLanguage = true
			break
		}
	}
	if !validLanguage {
		return RequestSpec{}, fmt.Errorf("本地配音不支持此语言代码")
	}
	body := map[string]any{"model_name": r.Model, "prompt": r.Prompt, "language": language, "voice": "default", "format": format, "speed": speed}
	if len(r.Audios) == 1 {
		ref := r.Audios[0]
		storage, _ := ref.Metadata["storageKey"].(string)
		approved, _ := r.Extra["voiceRightsConfirmedFor"].(string)
		if !strings.HasPrefix(storage, "resource:") || storage == "resource:" || approved != storage {
			return RequestSpec{}, fmt.Errorf("请明确确认这段声音的使用权后再生成；更换参考音频后需重新确认")
		}
		if strings.HasPrefix(voice, "sample:") && strings.TrimPrefix(voice, "sample:") != strings.TrimPrefix(storage, "resource:") {
			return RequestSpec{}, fmt.Errorf("角色声音绑定与当前音频参考不一致")
		}
		if voice != "sample" && !strings.HasPrefix(voice, "sample:") {
			return RequestSpec{}, fmt.Errorf("已连接参考音频，请选择参考音频音色；使用默认声音时请先断开声音参考")
		}
		if !strings.HasPrefix(ref.DataURL, "data:audio/") || len(ref.DataURL) > 24*1024*1024 {
			return RequestSpec{}, fmt.Errorf("请使用已上传且经过归属校验的声音文件")
		}
		body["voice"], body["reference_audio"], body["confirm_voice_rights"] = "sample", ref.DataURL, true
	} else if voice != "default" && voice != "alloy" {
		return RequestSpec{}, fmt.Errorf("当前角色声音需要原始音频参考；未回退为其他音色")
	}
	return RequestSpec{Method: http.MethodPost, Path: "/api/audio/submit", OriginPath: true, ContentType: "application/json", Auth: ManifestAuth{Type: "none"}, Headers: map[string]string{"Idempotency-Key": key}, Body: body}, nil
}
