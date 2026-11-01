package app

import (
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strings"
	"yingce/backend/internal/production"
)

// 时间线渲染：把前端 TimelineProject 快照（tracks/clips 平铺，见
// web/src/types/timeline.ts TimelineProject v2）展开为可执行的 ffmpeg 步骤。
// 与前端 timeline-to-ffmpeg.ts 保持同一数据流：trim（按 sourceStartMs 裁切）
// → 空隙补黑场静音 → concat，再混合独立声音并叠加共享字幕像素，另产出 SRT。
//
// 输入布局统一为「每个片段两个输入：视频源 + 音频源」，空隙展开为独立
// 黑场片段，因此第 i 个片段的视频输入为 2i、音频输入为 2i+1。

type renderClip struct {
	FadeInColor         string                      `json:"fadeInColor,omitempty"`
	FadeOutColor        string                      `json:"fadeOutColor,omitempty"`
	Graphic             *production.MotionGraphic   `json:"graphic,omitempty"`
	Reframe             *production.TimelineReframe `json:"reframe,omitempty"`
	ID                  string                      `json:"id"`
	Kind                string                      `json:"kind"`
	TrackID             string                      `json:"trackId"`
	StartMs             int64                       `json:"startMs"`
	DurationMs          int64                       `json:"durationMs"`
	SourceStartMs       int64                       `json:"sourceStartMs"`
	SourceDurationMs    int64                       `json:"sourceDurationMs"`
	PlaybackRate        float64                     `json:"playbackRate,omitempty"`
	Volume              float64                     `json:"volume"`
	FadeInMs            int64                       `json:"fadeInMs"`
	FadeOutMs           int64                       `json:"fadeOutMs"`
	fadeOffsetMs        int64
	fadeDurationMs      int64
	Text                string                          `json:"text"`
	Presentation        production.CaptionPresentation  `json:"-"`
	CaptionPresentation *production.CaptionPresentation `json:"captionPresentation,omitempty"`
	legacyCaptionStyle  bool
	ProductionBinding   *struct {
		ShotID               string `json:"shotId,omitempty"`
		AssetVersionID       string `json:"assetVersionId,omitempty"`
		ArtifactID           string `json:"artifactId,omitempty"`
		TranscriptID         string `json:"transcriptId,omitempty"`
		TranscriptRevisionID string `json:"transcriptRevisionId,omitempty"`
		TranscriptSegmentID  string `json:"transcriptSegmentId,omitempty"`
		SourceClipID         string `json:"sourceClipId,omitempty"`
	} `json:"productionBinding,omitempty"`
	DirectMedia *struct {
		ID         string `json:"id"`
		Kind       string `json:"kind"`
		StorageKey string `json:"storageKey"`
		URL        string `json:"url,omitempty"`
	} `json:"directMedia"`
}

func (clip renderClip) MarshalJSON() ([]byte, error) {
	type plain renderClip
	value := plain(clip)
	if (clip.Kind == "subtitle" || clip.Kind == "text") && clip.Presentation.Version == 1 {
		value.CaptionPresentation = &clip.Presentation
	}
	return json.Marshal(value)
}

func (clip *renderClip) UnmarshalJSON(raw []byte) error {
	type plain renderClip
	decoded := plain{Volume: 1, PlaybackRate: 1}
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return err
	}
	*clip = renderClip(decoded)
	if (clip.Kind == "subtitle" || clip.Kind == "text") && clip.Graphic == nil {
		var source map[string]any
		decoder := json.NewDecoder(strings.NewReader(string(raw)))
		decoder.UseNumber()
		if err := decoder.Decode(&source); err != nil {
			return err
		}
		presentation, err := production.CaptionPresentationForClip(source)
		if err != nil {
			return err
		}
		clip.Presentation = presentation
		origin, _ := source["captionOrigin"].(map[string]any)
		clip.legacyCaptionStyle = source["captionPresentation"] == nil && (source["subtitleStyle"] != nil || origin["subtitleStyle"] != nil)
		if clip.Kind == "text" && source["captionPresentation"] == nil && !clip.legacyCaptionStyle {
			clip.Presentation.Position = "center"
		}
	}
	return nil
}

func (clip renderClip) rate() float64 {
	if clip.PlaybackRate == 0 {
		return 1
	}
	return clip.PlaybackRate
}

func (clip renderClip) sourceOffset(ms int64) int64 {
	return int64(math.Round(float64(ms) * clip.rate()))
}

// atempo preserves pitch. Chaining avoids the sample skipping that one
// atempo above 2 can introduce, and supports quarter-speed audio as well.
func renderAudioRate(clip renderClip) string {
	rate := clip.rate()
	value := ""
	for rate > 2 {
		value += ",atempo=2"
		rate /= 2
	}
	for rate < .5 {
		value += ",atempo=0.5"
		rate *= 2
	}
	if rate != 1 {
		value += fmt.Sprintf(",atempo=%.8f", rate)
	}
	return value
}

type renderTrack struct {
	ID      string `json:"id"`
	Kind    string `json:"kind"`
	Order   int    `json:"order"`
	Visible *bool  `json:"visible"`
	Muted   bool   `json:"muted"`
}

type renderProject struct {
	Width      int                   `json:"width,omitempty"`
	Height     int                   `json:"height,omitempty"`
	Fit        string                `json:"fit,omitempty"`
	Output     *timelineRenderFormat `json:"output,omitempty"`
	Version    int                   `json:"version"`
	Tracks     []renderTrack         `json:"tracks"`
	Clips      []renderClip          `json:"clips"`
	DurationMs int64                 `json:"durationMs"`
}

type renderSource struct {
	Width, Height int
	AIGC          string
	ResourceID    string
	Clip          renderClip
	Path          string
	Ext           string
	// HasAudio 由 ffprobe 探测得到；无音轨的媒体改为静音源，避免 map 失败。
	HasAudio bool
}

// renderSegment 是渲染序列中的一段；Kind 为 video/image 表示媒体片段，
// gap 表示补黑场静音的空隙段（无 Source）。
type renderSegment struct {
	Kind       string
	DurationMs int64
	GapMs      int64
	Clip       renderClip
	Source     *renderSource
}

type renderPlan struct {
	Width, Height    int
	Fit, PropagateID string
	AudioOverlays    []renderSegment
	OverlayRanks     map[string]int
	Graphics         []renderClip
	MotionLayers     []motionRasterLayer
	Output           timelineRenderFormat
	Segments         []renderSegment
	Audio            []renderSegment
	TextClips        []renderClip
	SubtitleSRT      string
	HasMedia         bool
}

// buildRenderPlan 挑选可见视频/图片轨片段按 startMs 排序，并把片段之间的
// 空隙展开为黑场段，使渲染序列在时间轴上连续。
func buildRenderPlan(project renderProject) renderPlan {
	visible := map[string]bool{}
	muted := map[string]bool{}
	for _, track := range project.Tracks {
		visible[track.ID] = track.Visible == nil || *track.Visible
		muted[track.ID] = track.Muted
	}
	plan := renderPlan{Width: project.Width, Height: project.Height, Fit: normalizeRenderFit(project.Fit), SubtitleSRT: buildRenderSubtitleSRT(project), OverlayRanks: renderOverlayRanks(project)}
	var duration int64
	clips := make([]renderClip, 0, len(project.Clips))
	for _, clip := range project.Clips {
		if !visible[clip.TrackID] {
			continue
		}
		duration = max(duration, clip.StartMs+clip.DurationMs)
		if clip.Kind == "audio" && !muted[clip.TrackID] && clip.Volume > 0 {
			plan.Audio = append(plan.Audio, renderSegment{Kind: "audio", DurationMs: clip.DurationMs, Clip: clip})
		}
		if clip.Graphic != nil {
			plan.Graphics = append(plan.Graphics, clip)
		}
		if clip.Graphic == nil && (clip.Kind == "subtitle" || clip.Kind == "text") && strings.TrimSpace(clip.Text) != "" {
			plan.TextClips = append(plan.TextClips, clip)
		}
		if clip.Kind != "video" && clip.Kind != "image" {
			continue
		}
		if clip.DurationMs <= 0 {
			continue
		}
		if muted[clip.TrackID] {
			clip.Volume = 0
		}
		clips = append(clips, clip)
	}
	sort.SliceStable(clips, func(i, j int) bool {
		if clips[i].StartMs == clips[j].StartMs {
			return clips[i].ID < clips[j].ID
		}
		return clips[i].StartMs < clips[j].StartMs
	})
	clips = visibleRenderIntervals(clips, project.Tracks)

	cursor := int64(0)
	for _, clip := range clips {
		if gap := clip.StartMs - cursor; gap > 0 {
			plan.Segments = append(plan.Segments, renderSegment{Kind: "gap", DurationMs: gap, GapMs: gap})
		}
		plan.Segments = append(plan.Segments, renderSegment{Kind: clip.Kind, DurationMs: clip.DurationMs, Clip: clip})
		cursor = clip.StartMs + clip.DurationMs
	}
	if duration > cursor && (len(clips) > 0 || len(plan.Graphics) > 0 || len(plan.TextClips) > 0) {
		plan.Segments = append(plan.Segments, renderSegment{Kind: "gap", DurationMs: duration - cursor})
	}
	for _, seg := range plan.Segments {
		if _, ok := mediaResourceID(seg.Clip); ok {
			plan.HasMedia = true
			break
		}
	}
	if len(plan.Graphics)+len(plan.TextClips) > 0 {
		plan.HasMedia = true
	}
	plan.AudioOverlays = plan.Audio
	return plan
}

// mediaResourceID 从片段的 directMedia.storageKey（resource:<id>）还原资源 ID。
func mediaResourceID(clip renderClip) (string, bool) {
	if clip.DirectMedia == nil {
		return "", false
	}
	key := strings.TrimSpace(clip.DirectMedia.StorageKey)
	if !strings.HasPrefix(key, "resource:") {
		return "", false
	}
	id := strings.TrimSpace(strings.TrimPrefix(key, "resource:"))
	return id, id != ""
}

func buildRenderSubtitleSRT(project renderProject) string {
	hidden := map[string]bool{}
	for _, track := range project.Tracks {
		hidden[track.ID] = track.Visible != nil && !*track.Visible
	}
	subtitle := make([]renderClip, 0, len(project.Clips))
	for _, clip := range project.Clips {
		if hidden[clip.TrackID] || clip.Kind != "subtitle" || strings.TrimSpace(clip.Text) == "" || clip.DurationMs <= 0 {
			continue
		}
		subtitle = append(subtitle, clip)
	}
	sort.SliceStable(subtitle, func(i, j int) bool {
		if subtitle[i].StartMs == subtitle[j].StartMs {
			return subtitle[i].ID < subtitle[j].ID
		}
		return subtitle[i].StartMs < subtitle[j].StartMs
	})
	if len(subtitle) == 0 {
		return ""
	}
	var out strings.Builder
	for i, clip := range subtitle {
		fmt.Fprintf(&out, "%d\n%s --> %s\n%s\n\n",
			i+1,
			formatSRTTimestamp(clip.StartMs),
			formatSRTTimestamp(clip.StartMs+clip.DurationMs),
			strings.TrimSpace(clip.Text))
	}
	return out.String()
}

const (
	renderWidth      = 1920
	renderHeight     = 1080
	renderFPS        = 30
	renderSampleRate = 44100
)

// buildRenderFFmpegArgs 依据渲染计划生成 ffmpeg 参数（工作目录内相对路径）。
// 每段固定两个输入：视频源与音频源，末尾 concat 为单路输出。
func buildRenderFFmpegArgs(plan renderPlan, target string) []string {
	if len(plan.Segments) == 0 {
		return nil
	}
	format := plan.outputFormat()
	renderWidth, renderHeight, renderFPS := format.Width, format.Height, format.FPS
	args := []string{"-nostdin", "-y"}
	for _, seg := range plan.Segments {
		seconds := fmt.Sprintf("%.3f", float64(seg.DurationMs)/1000)
		switch seg.Kind {
		case "gap":
			args = append(args,
				"-f", "lavfi", "-t", seconds,
				"-i", fmt.Sprintf("color=c=black:s=%dx%d:r=%d", renderWidth, renderHeight, renderFPS),
				"-f", "lavfi", "-t", seconds,
				"-i", fmt.Sprintf("anullsrc=r=%d:cl=stereo", renderSampleRate),
			)
		case "image":
			if seg.Source == nil {
				args = append(args,
					"-f", "lavfi", "-t", seconds,
					"-i", fmt.Sprintf("color=c=black:s=%dx%d:r=%d", renderWidth, renderHeight, renderFPS),
					"-f", "lavfi", "-t", seconds,
					"-i", fmt.Sprintf("anullsrc=r=%d:cl=stereo", renderSampleRate),
				)
				continue
			}
			args = append(args,
				"-loop", "1", "-t", seconds, "-i", seg.Source.Path,
				"-f", "lavfi", "-t", seconds,
				"-i", fmt.Sprintf("anullsrc=r=%d:cl=stereo", renderSampleRate),
			)
		default:
			if seg.Source == nil {
				args = append(args,
					"-f", "lavfi", "-t", seconds,
					"-i", fmt.Sprintf("color=c=black:s=%dx%d:r=%d", renderWidth, renderHeight, renderFPS),
					"-f", "lavfi", "-t", seconds,
					"-i", fmt.Sprintf("anullsrc=r=%d:cl=stereo", renderSampleRate),
				)
				continue
			}
			if seg.Clip.SourceStartMs > 0 {
				args = append(args, "-ss", fmt.Sprintf("%.3f", float64(seg.Clip.SourceStartMs)/1000))
			}
			sourceSeconds := renderSeconds(seg.Clip.sourceOffset(seg.DurationMs))
			args = append(args, "-t", sourceSeconds, "-i", seg.Source.Path)
			// 音频输入复用同一媒体文件；无音轨时 ffmpeg 会因 map 失败，
			// 由调用方探测后回退为静音源（见 renderAudioFallback）。
			if seg.Clip.SourceStartMs > 0 {
				args = append(args, "-ss", fmt.Sprintf("%.3f", float64(seg.Clip.SourceStartMs)/1000))
			}
			args = append(args, "-t", sourceSeconds, "-i", seg.Source.Path)
		}
	}

	filters := make([]string, 0, len(plan.Segments)*2+1)
	labels := make([]string, 0, len(plan.Segments)*2)
	for i, seg := range plan.Segments {
		segmentFormat := format
		if segmentFormat.Fit == "" || segmentFormat.Fit == renderFitAuto {
			segmentFormat.Fit = renderSegmentFit(plan.Fit, seg.Source, format.Width, format.Height)
		}
		scale := renderScaleFilter(segmentFormat, i)
		videoIn := 2 * i
		audioIn := 2*i + 1
		videoLabel := fmt.Sprintf("v%d", i)
		audioLabel := fmt.Sprintf("a%d", i)
		videoRate := ""
		if seg.Kind == "video" && seg.Clip.rate() != 1 {
			videoRate = fmt.Sprintf("setpts=(PTS-STARTPTS)/%.8f,", seg.Clip.rate())
		}
		videoRate = renderReframeFilter(seg.Clip) + videoRate
		if seg.Source != nil && seg.Kind != "image" && !seg.Source.HasAudio {
			// 无音轨媒体：改用静音源，避免 map 失败。
			audioIn = videoIn
			filters = append(filters,
				fmt.Sprintf("[%d:v]%sfps=%d,%s,setsar=1,tpad=stop_mode=clone:stop_duration=%.3f,trim=duration=%.3f,setpts=PTS-STARTPTS%s[%s]", videoIn, videoRate, renderFPS, scale, float64(seg.DurationMs)/1000, float64(seg.DurationMs)/1000, renderVideoFades(seg.Clip), videoLabel))
			silentLabel := fmt.Sprintf("silent%d", i)
			filters = append(filters,
				fmt.Sprintf("anullsrc=r=%d:cl=stereo[%s]", renderSampleRate, silentLabel))
			filters = append(filters,
				fmt.Sprintf("[%s]atrim=0:%.3f,asetpts=N/SR/TB[%s]", silentLabel, float64(seg.DurationMs)/1000, audioLabel))
		} else {
			volume := seg.Clip.Volume
			filters = append(filters,
				fmt.Sprintf("[%d:v]%sfps=%d,%s,setsar=1,tpad=stop_mode=clone:stop_duration=%.3f,trim=duration=%.3f,setpts=PTS-STARTPTS%s[%s]", videoIn, videoRate, renderFPS, scale, float64(seg.DurationMs)/1000, float64(seg.DurationMs)/1000, renderVideoFades(seg.Clip), videoLabel))
			filters = append(filters,
				fmt.Sprintf("[%d:a]aformat=sample_fmts=fltp:sample_rates=%d:channel_layouts=stereo%s,volume=%.3f%s,apad=whole_dur=%.3f,atrim=duration=%.3f,asetpts=PTS-STARTPTS[%s]",
					audioIn, renderSampleRate, renderAudioRate(seg.Clip), volume, renderAudioFades(seg.Clip), float64(seg.DurationMs)/1000, float64(seg.DurationMs)/1000, audioLabel))
		}
		labels = append(labels, videoLabel, audioLabel)
	}
	var concatInputs strings.Builder
	for _, label := range labels {
		fmt.Fprintf(&concatInputs, "[%s]", label)
	}
	filters = append(filters, fmt.Sprintf("%sconcat=n=%d:v=1:a=1[vout][aout]", concatInputs.String(), len(plan.Segments)))

	args = append(args,
		"-filter_complex", strings.Join(filters, ";"),
		"-map", "[vout]", "-map", "[aout]",
		"-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
		"-c:a", "aac", "-b:a", "128k", "-map_metadata", "-1", "-metadata", "AIGC="+renderAIGCJSON(plan), "-metadata", "comment="+renderAIGCComment, "-movflags", "+faststart+use_metadata_tags",
		"-t", fmt.Sprintf("%.3f", planTotalSeconds(plan)),
		target,
	)
	return args
}

func renderScaleFilter(format timelineRenderFormat, index int) string {
	w, h := format.Width, format.Height
	if format.Fit == "crop" {
		return fmt.Sprintf("scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d", w, h, w, h)
	}
	if format.Fit == "blur" {
		return fmt.Sprintf("split=2[fit%dbg][fit%dfg];[fit%dbg]scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d,boxblur=luma_radius='min(h,w)/20':luma_power=1[fit%dblur];[fit%dfg]scale=%d:%d:force_original_aspect_ratio=decrease[fit%dfront];[fit%dblur][fit%dfront]overlay=(W-w)/2:(H-h)/2", index, index, index, w, h, w, h, index, index, w, h, index, index, index)
	}
	return fmt.Sprintf("scale=%d:%d:force_original_aspect_ratio=decrease,pad=%d:%d:(ow-iw)/2:(oh-ih)/2", w, h, w, h)
}

func planTotalSeconds(plan renderPlan) float64 {
	var total int64
	for _, seg := range plan.Segments {
		total += seg.DurationMs
	}
	return float64(total) / 1000
}
