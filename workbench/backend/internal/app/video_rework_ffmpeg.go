package app

import (
	"fmt"
	"math"
	"strings"

	"yingce/backend/internal/production"
)

// Both inputs retain their native pixel grid. Region repair pastes only the
// reviewed pixels into the selected original interval; time and audio choices
// are explicit and do not depend on an editor's current model configuration.
func buildVideoReworkFFmpegArgs(plan production.VideoReworkPlan, source, candidate, target string, fps int, sourceAudio, candidateAudio bool) ([]string, error) {
	if plan.Version == 2 {
		return buildWholeSourceVideoReworkFFmpegArgs(plan, source, candidate, target, sourceAudio, candidateAudio)
	}
	length := plan.Request.SourceEndMs - plan.Request.SourceStartMs
	if plan.Version != 1 || length < 100 || length > 30000 || fps < 1 || fps > 60 || plan.Source.Width < 2 || plan.Source.Height < 2 || plan.Source.Width > 4096 || plan.Source.Height > 4096 || plan.Source.Width%2 != 0 || plan.Source.Height%2 != 0 || plan.Source.Width != plan.Candidate.Width || plan.Source.Height != plan.Candidate.Height || strings.TrimSpace(source) == "" || strings.TrimSpace(candidate) == "" || strings.TrimSpace(target) == "" || source == target || candidate == target {
		return nil, fmt.Errorf("修复素材的尺寸、时间或输出位置无效")
	}
	if plan.Request.Audio != "original" && plan.Request.Audio != "candidate" && plan.Request.Audio != "mute" {
		return nil, fmt.Errorf("请选择保留原声、采用候选声音或静音")
	}
	if plan.Request.Audio == "candidate" && !candidateAudio {
		return nil, fmt.Errorf("候选没有音轨，请选择保留原声或静音")
	}
	duration := renderSeconds(length)
	args := []string{"-nostdin", "-y", "-threads", "2", "-protocol_whitelist", "file,pipe", "-ss", renderSeconds(plan.Request.SourceStartMs), "-t", duration, "-i", source, "-threads", "2", "-protocol_whitelist", "file,pipe", "-ss", renderSeconds(plan.Request.CandidateStartMs), "-t", duration, "-i", candidate, "-f", "lavfi", "-t", duration, "-i", "anullsrc=r=48000:cl=stereo"}
	video := fmt.Sprintf("[1:v]setpts=PTS-STARTPTS,fps=%d,format=yuv420p[outv]", fps)
	if r := plan.Request.Region; r != nil {
		if r.X < 0 || r.Y < 0 || r.Width < 2 || r.Height < 2 || r.X > plan.Source.Width-r.Width || r.Y > plan.Source.Height-r.Height {
			return nil, fmt.Errorf("修复区域超出原画面")
		}
		video = fmt.Sprintf("[0:v]setpts=PTS-STARTPTS,fps=%d,format=rgba[base];[1:v]setpts=PTS-STARTPTS,fps=%d,format=rgba,crop=%d:%d:%d:%d[patch];[base][patch]overlay=%d:%d:shortest=1:format=auto,format=yuv420p[outv]", fps, fps, r.Width, r.Height, r.X, r.Y, r.X, r.Y)
	}
	audioIndex := 2
	if plan.Request.Audio == "original" && sourceAudio {
		audioIndex = 0
	} else if plan.Request.Audio == "candidate" {
		audioIndex = 1
	}
	audio := fmt.Sprintf(";[%d:a]asetpts=PTS-STARTPTS,aresample=48000,apad,atrim=duration=%s[outa]", audioIndex, duration)
	if math.IsNaN(plan.PlaybackRate) || math.IsInf(plan.PlaybackRate, 0) || plan.PlaybackRate < .25 || plan.PlaybackRate > 4 {
		return nil, fmt.Errorf("修复片段的源时间映射无效")
	}
	if fade := plan.OriginalFade; fade != nil {
		if fade.OffsetMs < 0 || fade.DurationMs <= 0 || fade.DurationMs > 86400000 || fade.FadeInMs < 0 || fade.FadeInMs > fade.DurationMs || fade.FadeOutMs < 0 || fade.FadeOutMs > fade.DurationMs || fade.OffsetMs > fade.DurationMs-(plan.ProgramEndMs-plan.ProgramStartMs) {
			return nil, fmt.Errorf("原片段的淡入淡出时间无效")
		}
		clock := func(ms int64) int64 { return int64(math.Round(float64(ms) * plan.PlaybackRate)) }
		envelope := renderClip{DurationMs: length, fadeDurationMs: clock(fade.DurationMs), fadeOffsetMs: clock(fade.OffsetMs), FadeInMs: clock(fade.FadeInMs), FadeOutMs: clock(fade.FadeOutMs)}
		video = strings.TrimSuffix(video, "[outv]") + renderVideoFades(envelope) + "[outv]"
		audio = strings.TrimSuffix(audio, "[outa]") + renderAudioFades(envelope) + "[outa]"
	}
	return append(args, "-filter_complex_threads", "1", "-filter_complex", video+audio, "-map", "[outv]", "-map", "[outa]", "-t", duration, "-c:v", "libx264", "-threads", "2", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", "-f", "mp4", target), nil
}
