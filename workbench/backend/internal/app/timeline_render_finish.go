package app

import (
	"fmt"
	"image"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// The base cut is immutable input to finishing. Independent audio occurrences
// keep their own source trim, delay, gain and fades; text never enters a shell
// or the filter expression; shared, bounded caption rasters preserve literal text.
func buildRenderFinishArgs(plan renderPlan, directory, base, target string) ([]string, error) {
	if len(plan.Audio)+len(plan.TextClips)+len(plan.Graphics) == 0 {
		return nil, nil
	}
	args := []string{"-nostdin", "-y", "-i", base}
	// Keep the base on the program clock. AAC decoding can still report its
	// EOF before the final independent PCM blocks; mixing waits for all inputs
	// and the output -t applies the exact program duration.
	filters := []string{fmt.Sprintf("[0:a]aresample=%d:async=1:first_pts=0,apad=whole_dur=%s,atrim=duration=%s,asetpts=N/SR/TB[baseaudio]", renderSampleRate, renderSeconds(planDurationMs(plan)), renderSeconds(planDurationMs(plan)))}
	for i, segment := range plan.Audio {
		if segment.Source == nil {
			return nil, fmt.Errorf("独立音轨缺少素材，请重新添加后导出")
		}
		clip := segment.Clip
		args = append(args, "-ss", renderSeconds(clip.SourceStartMs), "-t", renderSeconds(clip.sourceOffset(clip.DurationMs)), "-i", segment.Source.Path)
		filter := fmt.Sprintf("[%d:a]asetpts=PTS-STARTPTS%s,apad=whole_dur=%s,atrim=duration=%s,aformat=sample_fmts=fltp:sample_rates=%d:channel_layouts=stereo,asetpts=N/SR/TB,volume=%.5f", i+1, renderAudioRate(clip), renderSeconds(clip.DurationMs), renderSeconds(clip.DurationMs), renderSampleRate, clip.Volume)
		filter += renderAudioFades(clip)
		filter += fmt.Sprintf(",adelay=%d:all=1[mix%d]", clip.StartMs, i)
		filters = append(filters, filter)
	}
	audioMap := "[baseaudio]"
	if len(plan.Audio) > 0 {
		var inputs strings.Builder
		inputs.WriteString("[baseaudio]")
		for i := range plan.Audio {
			fmt.Fprintf(&inputs, "[mix%d]", i)
		}
		filters = append(filters, fmt.Sprintf("%samix=inputs=%d:duration=longest:normalize=0,alimiter=limit=0.95:level=false:latency=true[audio]", inputs.String(), len(plan.Audio)+1))
		audioMap = "[audio]"
	}
	videoMap := "0:v:0"
	var captions []captionRasterLayer
	var graphics []motionRasterLayer
	if len(plan.TextClips) > 0 {
		if err := materializeRenderFont(directory); err != nil {
			return nil, err
		}
		layers, err := materializeCaptionLayers(plan.TextClips, plan.outputFormat(), directory)
		if err != nil {
			return nil, err
		}
		captions = layers
	}
	if len(plan.Graphics) > 0 {
		layers := plan.MotionLayers
		if len(layers) != len(plan.Graphics) {
			var err error
			layers, err = buildMotionLayers(plan.Graphics, readMotionFont, func(string) (image.Image, error) {
				return nil, fmt.Errorf("图片叠层未固定，请重新读取素材后导出")
			}, func(name string, picture *image.NRGBA) error { return writeCaptionPNG(directory, name, picture) })
			if err != nil {
				return nil, err
			}
		}
		graphics = layers
	}
	overlays, overlayMap := renderOverlayFilters(plan, captions, graphics)
	filters = append(filters, overlays...)
	videoMap = overlayMap
	filterText := strings.Join(filters, ";")
	if len(filterText) > 32768 {
		name := "timeline-finish-filter.txt"
		if err := os.WriteFile(filepath.Join(directory, name), []byte(filterText), 0600); err != nil {
			return nil, err
		}
		args = append(args, "-filter_complex_script", name)
	} else {
		args = append(args, "-filter_complex", filterText)
	}
	args = append(args, "-map", videoMap, "-map", audioMap)
	if len(plan.TextClips)+len(plan.Graphics) == 0 {
		args = append(args, "-c:v", "copy")
	} else {
		args = append(args, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p")
	}
	return append(args, "-c:a", "aac", "-b:a", "192k", "-t", renderSeconds(planDurationMs(plan)), "-map_metadata", "-1", "-metadata", "AIGC="+renderAIGCJSON(plan), "-metadata", "comment="+renderAIGCComment, "-movflags", "+faststart+use_metadata_tags", target), nil
}

func renderAudioFades(clip renderClip) string {
	var value strings.Builder
	if clip.FadeInMs <= 0 && clip.FadeOutMs <= 0 {
		return ""
	}
	if clip.fadeOffsetMs > 0 {
		fmt.Fprintf(&value, ",asetpts=PTS+%s/TB", renderSeconds(clip.fadeOffsetMs))
	}
	duration := clip.DurationMs
	if clip.fadeDurationMs > 0 {
		duration = clip.fadeDurationMs
	}
	if clip.FadeInMs > 0 {
		fmt.Fprintf(&value, ",afade=t=in:st=0:d=%s", renderSeconds(clip.FadeInMs))
	}
	if clip.FadeOutMs > 0 {
		fmt.Fprintf(&value, ",afade=t=out:st=%s:d=%s", renderSeconds(duration-clip.FadeOutMs), renderSeconds(clip.FadeOutMs))
	}
	if clip.fadeOffsetMs > 0 {
		value.WriteString(",asetpts=PTS-STARTPTS")
	}
	return value.String()
}

func renderSeconds(ms int64) string { return fmt.Sprintf("%.3f", float64(ms)/1000) }

func materializeRenderFont(directory string) error {
	data, err := readRenderFont()
	if err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(directory, "timeline-font.ttf"), data, 0600); err != nil {
		return fmt.Errorf("字幕字体写入失败: %w", err)
	}
	return nil
}

func readRenderFont() ([]byte, error) {
	paths := []string{strings.TrimSpace(os.Getenv("CANVAS_SUBTITLE_FONT")), "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc", "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", "/usr/share/fonts/noto/NotoSansCJK-Regular.ttc"}
	if runtime.GOOS == "windows" {
		paths = append(paths, filepath.Join(os.Getenv("WINDIR"), "Fonts", "msyh.ttc"))
	}
	for _, name := range paths {
		if name == "" {
			continue
		}
		data, err := os.ReadFile(name)
		if err == nil && len(data) > 0 {
			return data, nil
		}
	}
	return nil, fmt.Errorf("缺少支持中文字幕的字体，请配置 CANVAS_SUBTITLE_FONT")
}
