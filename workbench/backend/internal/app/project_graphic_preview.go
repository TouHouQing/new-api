package app

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/png"
	"net/http"
	"unicode/utf8"
	"yingce/backend/internal/production"
)

type GraphicPreviewRequest struct {
	AspectRatio string                `json:"aspectRatio"`
	Output      *timelineRenderFormat `json:"output,omitempty"`
	Clips       []json.RawMessage     `json:"clips"`
}
type GraphicPreviewLayer struct {
	ClipID        string                   `json:"clipId"`
	Image         string                   `json:"image"`
	Width         int                      `json:"width"`
	Height        int                      `json:"height"`
	StartMs       int64                    `json:"startMs"`
	DurationMs    int64                    `json:"durationMs"`
	SourceStartMs int64                    `json:"sourceStartMs"`
	Graphic       production.MotionGraphic `json:"graphic"`
}
type GraphicPreviewResult struct {
	Width  int                   `json:"width"`
	Height int                   `json:"height"`
	Layers []GraphicPreviewLayer `json:"layers"`
}

// Raster bytes are shared with native finishing; clients animate their exact
// geometry on the program/source clocks. No resource or model task is created.
func (s *Service) PreviewProjectGraphics(ctx context.Context, userID, projectID string, request GraphicPreviewRequest) (GraphicPreviewResult, error) {
	if _, err := s.activeProjectForUser(userID, projectID); err != nil {
		return GraphicPreviewResult{}, err
	}
	output, err := timelineOutputFormat(request.AspectRatio)
	if request.Output != nil {
		output = *request.Output
		err = validateTimelineOutput(output)
	}
	if err != nil {
		return GraphicPreviewResult{}, BadAuthRequest(err.Error())
	}
	if len(request.Clips) > 128 {
		return GraphicPreviewResult{}, BadAuthRequest("一次最多预览128个叠层")
	}
	select {
	case captionPreviewSlots <- struct{}{}:
		defer func() { <-captionPreviewSlots }()
	default:
		return GraphicPreviewResult{}, NewAppError(http.StatusTooManyRequests, "画面预览正在处理，请稍后重试")
	}
	clips := make([]renderClip, 0, len(request.Clips))
	seen := map[string]bool{}
	for _, raw := range request.Clips {
		var fields map[string]any
		if json.Unmarshal(raw, &fields) != nil {
			return GraphicPreviewResult{}, BadAuthRequest("叠层内容无效")
		}
		if graphic, err := production.MotionGraphicForClip(fields); err != nil || graphic == nil {
			return GraphicPreviewResult{}, BadAuthRequest("叠层与字幕设置不能混用，文字及图片须完整")
		}
		var clip renderClip
		if json.Unmarshal(raw, &clip) != nil || clip.ID == "" || len(clip.ID) > 128 || seen[clip.ID] || clip.Kind != "text" || clip.Graphic == nil || clip.StartMs < 0 || clip.StartMs > 86_400_000 || clip.DurationMs <= 0 || clip.DurationMs > 86_400_000 || clip.StartMs+clip.DurationMs > 86_400_000 || clip.SourceStartMs < 0 || clip.SourceStartMs > 86_400_000 || clip.rate() != 1 || utf8.RuneCountInString(clip.Text) > 2000 {
			return GraphicPreviewResult{}, BadAuthRequest("叠层的范围、文字或设置无效")
		}
		seen[clip.ID] = true
		clips = append(clips, clip)
	}
	result := GraphicPreviewResult{Width: output.Width, Height: output.Height, Layers: []GraphicPreviewLayer{}}
	images := map[string]string{}
	bytesTotal := 0
	layers, err := s.prepareMotionLayers(ctx, userID, clips, func(name string, picture *image.NRGBA) error {
		var buffer bytes.Buffer
		if err := png.Encode(&buffer, picture); err != nil {
			return err
		}
		bytesTotal += buffer.Len()
		if bytesTotal > 6<<20 {
			return BadAuthRequest("叠层预览超过大小限制，请分段编辑")
		}
		images[name] = "data:image/png;base64," + base64.StdEncoding.EncodeToString(buffer.Bytes())
		return nil
	})
	if err != nil {
		return result, BadAuthRequest(err.Error())
	}
	for _, layer := range layers {
		result.Layers = append(result.Layers, GraphicPreviewLayer{ClipID: layer.clip.ID, Image: images[layer.file], Width: layer.width, Height: layer.height, StartMs: layer.clip.StartMs, DurationMs: layer.clip.DurationMs, SourceStartMs: layer.clip.SourceStartMs, Graphic: *layer.clip.Graphic})
	}
	return result, nil
}
