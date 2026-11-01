package app

import (
	"fmt"
	"strings"
	"yingce/backend/internal/production"
)

// Keep the original PTS/frame clock. The full-source candidate can replace
// one occurrence without adding a track or baking its editable fade envelope.
func buildWholeSourceVideoReworkFFmpegArgs(plan production.VideoReworkPlan, source, candidate, target string, sourceAudio, candidateAudio bool) ([]string, error) {
	length := plan.Request.SourceEndMs - plan.Request.SourceStartMs
	if plan.Version != 2 || length < 100 || length > 30000 || plan.Source.DurationMs < plan.Request.SourceEndMs || plan.Request.SourceStartMs < 0 || plan.Source.DurationMs > 86400000 || plan.Source.Width < 2 || plan.Source.Height < 2 || plan.Source.Width > 4096 || plan.Source.Height > 4096 || plan.Source.Width%2 != 0 || plan.Source.Height%2 != 0 || plan.Source.Width != plan.Candidate.Width || plan.Source.Height != plan.Candidate.Height || strings.TrimSpace(source) == "" || strings.TrimSpace(candidate) == "" || strings.TrimSpace(target) == "" || source == target || candidate == target {
		return nil, fmt.Errorf("完整源时间修复的尺寸、时间或输出位置无效")
	}
	if plan.Request.Audio != "original" && plan.Request.Audio != "candidate" && plan.Request.Audio != "mute" {
		return nil, fmt.Errorf("请选择修复声音策略")
	}
	if plan.Request.Audio == "candidate" && !candidateAudio {
		return nil, fmt.Errorf("候选没有音轨，请选择保留原声或静音")
	}
	duration, start, end := renderSeconds(plan.Source.DurationMs), renderSeconds(plan.Request.SourceStartMs), renderSeconds(plan.Request.SourceEndMs)
	args := []string{"-nostdin", "-y", "-threads", "2", "-protocol_whitelist", "file,pipe", "-t", duration, "-i", source, "-threads", "2", "-protocol_whitelist", "file,pipe", "-ss", renderSeconds(plan.Request.CandidateStartMs), "-t", renderSeconds(length), "-i", candidate}
	crop, position := "", "0:0"
	if r := plan.Request.Region; r != nil {
		if r.X < 0 || r.Y < 0 || r.Width < 2 || r.Height < 2 || r.X > plan.Source.Width-r.Width || r.Y > plan.Source.Height-r.Height {
			return nil, fmt.Errorf("修复区域超出原画面")
		}
		crop = fmt.Sprintf(",crop=%d:%d:%d:%d", r.Width, r.Height, r.X, r.Y)
		position = fmt.Sprintf("%d:%d", r.X, r.Y)
	}
	filters := []string{fmt.Sprintf("[0:v]setpts=PTS-STARTPTS,format=rgba[base];[1:v]setpts=PTS-STARTPTS+%s/TB,format=rgba%s[patch];[base][patch]overlay=%s:eof_action=repeat:repeatlast=1:shortest=0:format=auto:enable='gte(t,%s)*lt(t,%s)',format=yuv420p[outv]", start, crop, position, start, end)}
	audioPart := func(label string, index int, from, to int64) string {
		if index < 0 {
			return fmt.Sprintf("anullsrc=r=48000:cl=stereo,atrim=duration=%s[%s]", renderSeconds(to-from), label)
		}
		return fmt.Sprintf("[%d:a]atrim=start=%s:end=%s,asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,apad,atrim=duration=%s[%s]", index, renderSeconds(from), renderSeconds(to), renderSeconds(to-from), label)
	}
	originalIndex := -1
	if sourceAudio {
		originalIndex = 0
	}
	if plan.Request.Audio == "original" {
		filters = append(filters, audioPart("outa", originalIndex, 0, plan.Source.DurationMs))
	} else {
		// Each trim starts from the same original audio clock; concat changes only
		// the reviewed interval. Missing original sound is actual silence.
		labels := []string{}
		if plan.Request.SourceStartMs > 0 {
			filters = append(filters, audioPart("before", originalIndex, 0, plan.Request.SourceStartMs))
			labels = append(labels, "[before]")
		}
		selectedIndex := -1
		if plan.Request.Audio == "candidate" {
			selectedIndex = 1
		}
		filters = append(filters, audioPart("selected", selectedIndex, 0, length))
		labels = append(labels, "[selected]")
		if plan.Request.SourceEndMs < plan.Source.DurationMs {
			filters = append(filters, audioPart("after", originalIndex, plan.Request.SourceEndMs, plan.Source.DurationMs))
			labels = append(labels, "[after]")
		}
		filters = append(filters, fmt.Sprintf("%sconcat=n=%d:v=0:a=1[outa]", strings.Join(labels, ""), len(labels)))
	}
	return append(args, "-filter_complex_threads", "1", "-filter_complex", strings.Join(filters, ";"), "-map", "[outv]", "-map", "[outa]", "-t", duration, "-fps_mode", "passthrough", "-c:v", "libx264", "-threads", "2", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-fs", fmt.Sprint(videoReworkMaximumBytes), "-movflags", "+faststart", "-f", "mp4", target), nil
}
