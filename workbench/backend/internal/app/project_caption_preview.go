package app

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/png"
	"net/http"
	"strings"
	"unicode/utf8"

	"yingce/backend/internal/kernel"
)

type CaptionPreviewRequest struct {
	AspectRatio string                `json:"aspectRatio"`
	Output      *timelineRenderFormat `json:"output,omitempty"`
	Clips       []json.RawMessage     `json:"clips"`
}
type CaptionPreviewLayer struct {
	ClipID    string `json:"clipId"`
	Image     string `json:"image"`
	X         int    `json:"x"`
	Y         int    `json:"y"`
	Width     int    `json:"width"`
	Height    int    `json:"height"`
	StartMs   int64  `json:"startMs"`
	EndMs     int64  `json:"endMs"`
	Animation string `json:"animation"`
}
type CaptionPreviewResult struct {
	Width  int                   `json:"width"`
	Height int                   `json:"height"`
	Layers []CaptionPreviewLayer `json:"layers"`
}

var captionPreviewSlots = make(chan struct{}, 2)

// The preview uses the exact export font, pixels and layout. Images remain in
// the response/browser memory: no model, resource row or disk file is created.
func (s *Service) PreviewProjectCaptions(ctx context.Context, userID, projectID string, req CaptionPreviewRequest) (CaptionPreviewResult, error) {
	if _, err := s.activeProjectForUser(userID, projectID); err != nil {
		return CaptionPreviewResult{}, err
	}
	output, err := timelineOutputFormat(req.AspectRatio)
	if req.Output != nil {
		output = *req.Output
		err = validateTimelineOutput(output)
	}
	if err != nil {
		return CaptionPreviewResult{}, kernel.BadAuthRequest(err.Error())
	}
	if len(req.Clips) > 128 {
		return CaptionPreviewResult{}, kernel.BadAuthRequest("单次字幕预览最多128个片段，请分段编辑")
	}
	select {
	case captionPreviewSlots <- struct{}{}:
		defer func() { <-captionPreviewSlots }()
	default:
		return CaptionPreviewResult{}, kernel.NewAppError(http.StatusTooManyRequests, "字幕预览正在处理，请稍后重试")
	}
	var clips []renderClip
	seen := map[string]bool{}
	for _, raw := range req.Clips {
		if err := ctx.Err(); err != nil {
			return CaptionPreviewResult{}, err
		}
		var clip renderClip
		if err := json.Unmarshal(raw, &clip); err != nil {
			return CaptionPreviewResult{}, kernel.BadAuthRequest("字幕预览字段无效")
		}
		if clip.Graphic != nil {
			return CaptionPreviewResult{}, kernel.BadAuthRequest("标题图形请使用叠层预览")
		}
		if clip.ID == "" || len(clip.ID) > 128 || seen[clip.ID] || (clip.Kind != "subtitle" && clip.Kind != "text") || clip.StartMs < 0 || clip.StartMs > 86_400_000 || clip.DurationMs <= 0 || clip.StartMs+clip.DurationMs > 86_400_000 || clip.DurationMs > 86_400_000 || utf8.RuneCountInString(clip.Text) > 2000 || strings.ContainsRune(clip.Text, 0) {
			return CaptionPreviewResult{}, kernel.BadAuthRequest("字幕预览范围或文字无效")
		}
		seen[clip.ID] = true
		if strings.TrimSpace(clip.Text) != "" {
			clips = append(clips, clip)
		}
	}
	result := CaptionPreviewResult{Width: output.Width, Height: output.Height, Layers: []CaptionPreviewLayer{}}
	if len(clips) == 0 {
		return result, nil
	}
	data, err := readRenderFont()
	if err != nil {
		return result, kernel.BadAuthRequest(err.Error())
	}
	images := map[string]string{}
	total := 0
	layers, err := buildCaptionLayers(clips, output, data, func(name string, canvas *image.NRGBA) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		var encoded bytes.Buffer
		if err := png.Encode(&encoded, canvas); err != nil {
			return err
		}
		total += encoded.Len()
		if total > 6<<20 {
			return kernel.BadAuthRequest("字幕预览超过大小限制，请分段编辑")
		}
		images[name] = "data:image/png;base64," + base64.StdEncoding.EncodeToString(encoded.Bytes())
		return nil
	})
	if err != nil {
		return result, kernel.BadAuthRequest(err.Error())
	}
	for _, layer := range layers {
		result.Layers = append(result.Layers, CaptionPreviewLayer{ClipID: layer.clipID, Image: images[layer.file], X: layer.x, Y: layer.y, Width: layer.width, Height: layer.height, StartMs: layer.start, EndMs: layer.end, Animation: layer.animation})
	}
	return result, nil
}
