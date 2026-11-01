package app

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// Container duration can be correct while the audio stream ends early. A
// render is complete only when both streams cover the planned program.
func validateRenderedAudio(ctx context.Context, path string, durationMs int64) error {
	probe, err := renderFFprobeBinary()
	if err != nil {
		return fmt.Errorf("音轨检查需要安装 FFprobe，请保留剪辑并重试")
	}
	probeCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	output, err := exec.CommandContext(probeCtx, probe, "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=start_time,duration", "-of", "json", path).Output()
	if err != nil {
		return fmt.Errorf("无法检查成片音轨，请保留剪辑并重新导出")
	}
	var media struct {
		Streams []struct {
			Start    string `json:"start_time"`
			Duration string `json:"duration"`
		} `json:"streams"`
	}
	if json.Unmarshal(output, &media) != nil || len(media.Streams) != 1 {
		return fmt.Errorf("成片缺少完整音轨，请保留剪辑并重新导出")
	}
	start, startErr := strconv.ParseFloat(media.Streams[0].Start, 64)
	duration, durationErr := strconv.ParseFloat(media.Streams[0].Duration, 64)
	wanted := float64(durationMs) / 1000
	if startErr != nil || durationErr != nil || math.IsNaN(start) || math.IsInf(start, 0) || math.IsNaN(duration) || math.IsInf(duration, 0) || math.Abs(start) > .05 || start+duration < wanted-.08 || start+duration > wanted+.15 {
		return fmt.Errorf("成片音轨时长与剪辑不一致，已停止交付；请保留剪辑并重新导出")
	}
	return nil
}

func renderFFprobeBinary() (string, error) {
	probe := strings.TrimSpace(os.Getenv("CANVAS_FFPROBE_PATH"))
	if probe == "" {
		if ffmpeg := strings.TrimSpace(os.Getenv(renderFfmpegEnv)); ffmpeg != "" {
			probe = filepath.Join(filepath.Dir(ffmpeg), "ffprobe"+filepath.Ext(ffmpeg))
		} else {
			probe = "ffprobe"
		}
	}
	return exec.LookPath(probe)
}
