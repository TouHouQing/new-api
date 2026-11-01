// SPDX-License-Identifier: AGPL-3.0-or-later
package protocol

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"
)

type localMusicAdapter struct{ localAdapter }

func LocalMusicCapabilities() *AudioCapabilities {
	return &AudioCapabilities{Operation: "music", PromptMaxChars: 3000, Formats: []string{"flac"}, Languages: []string{"zh", "en", "ja", "ko", "yue"}, MusicModes: []string{"instrumental", "song"}, MinSeconds: 10, MaxSeconds: 30, MinBPM: 40, MaxBPM: 240, LyricsMaxChars: 3000}
}

func (a localMusicAdapter) Metadata() Metadata {
	return Metadata{ID: LocalMusic, Version: "1.0.0", Name: "本地音乐 · ACE-Step", Vendor: "影策", Categories: []Capability{CapabilityAudio}, Scopes: []Surface{SurfaceAdminSystemChannel, SurfaceCanvas, SurfaceCreation, SurfaceAgent}, Enabled: true, Execution: "declarative", Description: "制作10–30秒纯音乐或填词歌曲；支持节拍与歌词语言，结果可加入剪辑。无需个人 API Key。"}
}

func (a localMusicAdapter) BuildCreate(_ context.Context, c RequestContext) (RequestSpec, error) {
	r := c.Request
	key, _ := r.Extra["idempotencyKey"].(string)
	if key == "" || r.Model != "acestep-1.5-turbo" {
		return RequestSpec{}, fmt.Errorf("本地音乐缺少任务标识，或未选择已安装的 ACE-Step 模型")
	}
	if strings.TrimSpace(r.Prompt) == "" || utf8.RuneCountInString(r.Prompt) > 3000 {
		return RequestSpec{}, fmt.Errorf("请用不超过3000字描述音乐的风格、乐器和情绪")
	}
	if len(r.Images)+len(r.Videos)+len(r.Audios)+len(r.Inputs) != 0 || r.ImageCount > 1 || r.Output.Count > 1 {
		return RequestSpec{}, fmt.Errorf("本地音乐每次生成一段音乐，暂不支持参考素材")
	}
	value := func(name, fallback string) string {
		v, _ := r.Extra[name].(string)
		if strings.TrimSpace(v) == "" {
			return fallback
		}
		return v
	}
	mode, lyrics := value("audioMusicMode", "instrumental"), value("audioLyrics", "")
	if (mode != "song" && mode != "instrumental") || (mode == "song" && strings.TrimSpace(lyrics) == "") || (mode == "instrumental" && strings.TrimSpace(lyrics) != "") || utf8.RuneCountInString(lyrics) > 3000 {
		return RequestSpec{}, fmt.Errorf("歌曲请填写实际演唱的歌词（不超过3000字）；纯音乐请清空歌词")
	}
	seconds, err := strconv.Atoi(value("audioSeconds", "30"))
	if err != nil || seconds < 10 || seconds > 30 {
		return RequestSpec{}, fmt.Errorf("本地音乐时长须为10–30秒的整数")
	}
	bpm, err := strconv.Atoi(value("audioBpm", "90"))
	if err != nil || bpm < 40 || bpm > 240 {
		return RequestSpec{}, fmt.Errorf("音乐节拍须为40–240 BPM的整数")
	}
	language := value("audioLanguage", "zh")
	found := false
	for _, item := range LocalMusicCapabilities().Languages {
		if item == language {
			found = true
		}
	}
	if !found {
		return RequestSpec{}, fmt.Errorf("请选择音乐模型支持的歌词语言")
	}
	voice := value("audioVoice", "")
	if value("audioInstructions", "") != "" || value("audioSpeed", "1") != "1" || value("audioFormat", "flac") != "flac" || (voice != "" && voice != "default" && voice != "alloy") {
		return RequestSpec{}, fmt.Errorf("本地音乐不使用配音音色、语速或朗读指令，输出格式为 FLAC")
	}
	return RequestSpec{Method: http.MethodPost, Path: "/api/submit", OriginPath: true, ContentType: "application/json", Auth: ManifestAuth{Type: "none"}, Headers: map[string]string{"Idempotency-Key": key}, Body: map[string]any{"model": "audio", "model_name": r.Model, "prompt": r.Prompt, "music": map[string]any{"mode": mode, "lyrics": lyrics, "seconds": seconds, "bpm": bpm, "language": language}}}, nil
}
