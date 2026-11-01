package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	_ "golang.org/x/image/webp"
)

var errMediaInspectorUnavailable = errors.New("media inspector unavailable")

func inspectProductionImportMedia(ctx context.Context, file *os.File, declaredMIME string) (width, height int, duration int64, err error) {
	actual, err := detectUploadedMimeType(file)
	if err != nil {
		return 0, 0, 0, err
	}
	declaredKind, actualKind := uploadedResourceKind(declaredMIME), uploadedResourceKind(actual)
	if (declaredKind == "image" || declaredKind == "video" || declaredKind == "audio") && actualKind != declaredKind {
		return 0, 0, 0, BadAuthRequest("工程素材的内容与声明类型不符")
	}
	if actualKind == "image" {
		config, _, err := image.DecodeConfig(file)
		if err != nil {
			return 0, 0, 0, BadAuthRequest("工程中包含无法解码的图片")
		}
		if config.Width < 1 || config.Height < 1 || int64(config.Width)*int64(config.Height) > 64_000_000 {
			return 0, 0, 0, BadAuthRequest("工程图片尺寸超出安全范围")
		}
		if _, err := file.Seek(0, io.SeekStart); err != nil {
			return 0, 0, 0, err
		}
		if _, _, err := image.Decode(file); err != nil {
			return 0, 0, 0, BadAuthRequest("工程图片内容不完整")
		}
		return config.Width, config.Height, 0, nil
	}
	if actualKind != "audio" && actualKind != "video" {
		return 0, 0, 0, nil
	}
	probe := strings.TrimSpace(os.Getenv("CANVAS_FFPROBE_PATH"))
	if probe == "" {
		if ffmpeg := strings.TrimSpace(os.Getenv(renderFfmpegEnv)); ffmpeg != "" {
			probe = filepath.Join(filepath.Dir(ffmpeg), "ffprobe"+filepath.Ext(ffmpeg))
		} else {
			probe = "ffprobe"
		}
	}
	bin, err := exec.LookPath(probe)
	if err != nil {
		return 0, 0, 0, fmt.Errorf("%w: 音视频检查需要安装 FFprobe，请在服务端配置后重试", errMediaInspectorUnavailable)
	}
	probeCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	output, err := exec.CommandContext(probeCtx, bin, "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height:stream_tags=rotate:stream_side_data=rotation", "-of", "json", file.Name()).Output()
	if err != nil {
		return 0, 0, 0, BadAuthRequest("工程中包含损坏或无法读取的音视频")
	}
	var media struct {
		Format struct {
			Duration string `json:"duration"`
		} `json:"format"`
		Streams []struct {
			CodecType string `json:"codec_type"`
			Width     int    `json:"width"`
			Height    int    `json:"height"`
			Tags      struct {
				Rotate string `json:"rotate"`
			} `json:"tags"`
			SideData []struct {
				Rotation *float64 `json:"rotation"`
			} `json:"side_data_list"`
		} `json:"streams"`
	}
	if err := json.Unmarshal(output, &media); err != nil {
		return 0, 0, 0, fmt.Errorf("invalid ffprobe response: %w", err)
	}
	seconds, err := strconv.ParseFloat(media.Format.Duration, 64)
	if err != nil || seconds <= 0 || seconds > 86400 {
		return 0, 0, 0, BadAuthRequest("工程音视频没有有效时长")
	}
	found := false
	for _, stream := range media.Streams {
		if stream.CodecType == actualKind {
			found = true
			width, height = stream.Width, stream.Height
			if actualKind == "video" {
				var rotation float64
				if stream.Tags.Rotate != "" {
					var parseErr error
					rotation, parseErr = strconv.ParseFloat(stream.Tags.Rotate, 64)
					if parseErr != nil {
						return 0, 0, 0, BadAuthRequest("视频旋转信息无效，请先转正视频")
					}
				}
				for _, side := range stream.SideData {
					if side.Rotation != nil {
						rotation = *side.Rotation
						break
					}
				}
				var geometryErr error
				width, height, geometryErr = displayedProductionVideoDimensions(width, height, rotation)
				if geometryErr != nil {
					return 0, 0, 0, geometryErr
				}
			}
			break
		}
	}
	if !found {
		return 0, 0, 0, BadAuthRequest("工程素材缺少所需的音视频轨道")
	}
	return width, height, int64(seconds*1000 + 0.5), nil
}

func displayedProductionVideoDimensions(width, height int, rotation float64) (int, int, error) {
	if math.IsNaN(rotation) || math.IsInf(rotation, 0) || math.Abs(rotation) > 36000 || width <= 0 || height <= 0 || width > 16384 || height > 16384 || int64(width)*int64(height) > 64_000_000 {
		return 0, 0, BadAuthRequest("视频画面尺寸或旋转信息无效")
	}
	quarter := math.Round(rotation / 90)
	if math.Abs(rotation-quarter*90) > .01 {
		return 0, 0, BadAuthRequest("视频含非直角旋转，请先导出为转正的视频再分析")
	}
	if math.Mod(math.Abs(quarter), 2) == 1 {
		return height, width, nil
	}
	return width, height, nil
}
