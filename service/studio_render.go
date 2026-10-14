package service

import (
	"archive/zip"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"math"
	"mime"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/google/uuid"
)

type StudioRenderClip struct {
	NodeID           string   `json:"node_id"`
	TakeID           string   `json:"take_id"`
	MediaID          string   `json:"media_id"`
	Start            float64  `json:"start"`
	End              *float64 `json:"end,omitempty"`
	Speed            float64  `json:"speed"`
	Volume           float64  `json:"volume"`
	Muted            bool     `json:"muted"`
	Caption          string   `json:"caption"`
	CaptionOffset    float64  `json:"caption_offset"`
	CaptionDuration  float64  `json:"caption_duration"`
	FadeIn           float64  `json:"fade_in"`
	FadeOut          float64  `json:"fade_out"`
	VoiceoverMediaID string   `json:"voiceover_media_id,omitempty"`
	VoiceoverOffset  float64  `json:"voiceover_offset"`
	VoiceoverVolume  *float64 `json:"voiceover_volume,omitempty"`
}
type StudioRenderAudio struct {
	MediaID  string   `json:"media_id"`
	Start    float64  `json:"start"`
	Offset   float64  `json:"offset"`
	Volume   float64  `json:"volume"`
	Duration *float64 `json:"duration,omitempty"`
}

func studioRenderVideoFilter(plan *StudioRenderPlan, speed float64) string {
	fit := fmt.Sprintf("scale=%d:%d:force_original_aspect_ratio=decrease,pad=%d:%d:(ow-iw)/2:(oh-ih)/2", plan.Width, plan.Height, plan.Width, plan.Height)
	if plan.Fit == "crop" {
		fit = fmt.Sprintf("scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d", plan.Width, plan.Height, plan.Width, plan.Height)
	}
	if plan.Fit == "blur" {
		fit = fmt.Sprintf("split[background][foreground];[background]scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d,gblur=sigma=20[blurred];[foreground]scale=%d:%d:force_original_aspect_ratio=decrease[sharp];[blurred][sharp]overlay=(W-w)/2:(H-h)/2", plan.Width, plan.Height, plan.Width, plan.Height, plan.Width, plan.Height)
	}
	return fmt.Sprintf("setpts=(PTS-STARTPTS)/%g,%s,fps=%d,setsar=1,format=yuv420p", speed, fit, plan.FPS)
}

func studioRenderDialogueSource(document map[string]any, clip StudioRenderClip) (string, float64) {
	for _, node := range studioObjects(document, "nodes") {
		if node["id"] != clip.NodeID {
			continue
		}
		data, _ := node["data"].(map[string]any)
		if rework, ok := data["reworkRange"].(map[string]any); ok {
			original, _ := rework["sourceNodeId"].(string)
			start, _ := rework["start"].(float64)
			if original != "" {
				return original, start + clip.Start/clip.Speed
			}
		}
	}
	return clip.NodeID, clip.Start / clip.Speed
}

type StudioRenderPlan struct {
	MotionGraphics  []StudioMotionGraphic `json:"motion_graphics,omitempty"`
	VariantID       string                `json:"variant_id,omitempty"`
	DeliveryLabel   string                `json:"delivery_label,omitempty"`
	SkipDialogue    bool                  `json:"skip_dialogue,omitempty"`
	Fit             string                `json:"fit"`
	Watermark       string                `json:"watermark"`
	NodeID          string                `json:"node_id"`
	Width           int                   `json:"width"`
	Height          int                   `json:"height"`
	FPS             int                   `json:"fps"`
	Clips           []StudioRenderClip    `json:"clips"`
	Audio           []StudioRenderAudio   `json:"audio"`
	Subtitles       string                `json:"subtitles"`
	SubtitleOffset  float64               `json:"subtitle_offset"`
	RequireApproved bool                  `json:"require_approved"`
	Package         bool                  `json:"package"`
}
type StudioMediaProbe struct {
	FrameRate float64 `json:"frame_rate,omitempty"`
	Duration  float64 `json:"duration"`
	Width     int     `json:"width"`
	Height    int     `json:"height"`
	HasAudio  bool    `json:"has_audio"`
	HasVideo  bool    `json:"has_video"`
}

func studioFFmpegBinary(probe bool) string {
	key, fallback := "STUDIO_FFMPEG_PATH", "ffmpeg"
	if probe {
		key, fallback = "STUDIO_FFPROBE_PATH", "ffprobe"
	}
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

var studioRenderCapabilities sync.Map

func StudioRenderAvailable() bool {
	ffmpeg, err := exec.LookPath(studioFFmpegBinary(false))
	if err != nil {
		return false
	}
	probe, err := exec.LookPath(studioFFmpegBinary(true))
	if err != nil {
		return false
	}
	info, err := os.Stat(ffmpeg)
	if err != nil {
		return false
	}
	key := ffmpeg + probe + info.ModTime().String()
	if value, ok := studioRenderCapabilities.Load(key); ok {
		return value.(bool)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	encoders, encoderErr := exec.CommandContext(ctx, ffmpeg, "-hide_banner", "-encoders").Output()
	filters, filterErr := exec.CommandContext(ctx, ffmpeg, "-hide_banner", "-filters").Output()
	available := encoderErr == nil && filterErr == nil
	for _, name := range []string{"libx264", "aac", "png"} {
		available = available && strings.Contains(string(encoders), name)
	}
	for _, name := range []string{"drawtext", "subtitles", "concat", "amix", "alimiter"} {
		available = available && strings.Contains(string(filters), name)
	}
	studioRenderCapabilities.Store(key, available)
	return available
}

func ValidateStudioPendingCaptionDraft(document map[string]any, variantID string) error {
	production, _ := document["production"].(map[string]any)
	if variantID == "" && len(studioObjects(production, "captionDraft")) > 0 {
		return errors.New("finish pending caption edits before exporting")
	}
	return nil
}

func ValidateStudioRenderPlan(plan *StudioRenderPlan) error {
	if plan != nil && (len([]rune(plan.DeliveryLabel)) > 200 || plan.VariantID != "" && !StudioIDPattern.MatchString(plan.VariantID)) {
		return errors.New("invalid regional delivery label or variant")
	}
	if plan != nil && ((plan.Fit != "" && plan.Fit != "letterbox" && plan.Fit != "crop" && plan.Fit != "blur") || len([]rune(plan.Watermark)) > 120) {
		return errors.New("invalid frame fitting or watermark")
	}
	if plan == nil || len(plan.Clips) == 0 || len(plan.Clips) > 100 || len(plan.Audio) > 100 || plan.Width < 64 || plan.Width > 4096 || plan.Height < 64 || plan.Height > 4096 || plan.Width%2 != 0 || plan.Height%2 != 0 || plan.FPS < 12 || plan.FPS > 60 || len(plan.Subtitles) > 100000 {
		return errors.New("invalid render dimensions, frame rate or clip count")
	}
	finite := func(value float64) bool { return !math.IsNaN(value) && !math.IsInf(value, 0) }
	if err := validateStudioMotionGraphics(plan.MotionGraphics); err != nil {
		return err
	}
	if !finite(plan.SubtitleOffset) || plan.SubtitleOffset < 0 || plan.SubtitleOffset > 3600 {
		return errors.New("invalid subtitle offset")
	}
	for _, clip := range plan.Clips {
		if clip.VoiceoverMediaID != "" && (!StudioIDPattern.MatchString(clip.VoiceoverMediaID) || !finite(clip.VoiceoverOffset) || clip.VoiceoverOffset < 0 || clip.VoiceoverOffset > 3600 || (clip.VoiceoverVolume != nil && (!finite(*clip.VoiceoverVolume) || *clip.VoiceoverVolume < 0 || *clip.VoiceoverVolume > 1))) {
			return errors.New("invalid per-shot voiceover")
		}
		if !StudioIDPattern.MatchString(clip.MediaID) || !finite(clip.Start) || clip.Start < 0 || clip.Start > 3600 || (clip.End != nil && (!finite(*clip.End) || *clip.End <= clip.Start || *clip.End > 3600)) || !finite(clip.Speed) || clip.Speed < 0.25 || clip.Speed > 4 || !finite(clip.Volume) || clip.Volume < 0 || clip.Volume > 1 || !finite(clip.FadeIn) || clip.FadeIn < 0 || clip.FadeIn > 3 || !finite(clip.FadeOut) || clip.FadeOut < 0 || clip.FadeOut > 3 || len(clip.Caption) > 30000 || !finite(clip.CaptionOffset) || clip.CaptionOffset < 0 || !finite(clip.CaptionDuration) || clip.CaptionDuration < 0 {
			return errors.New("invalid clip trim, speed, volume or caption")
		}
	}
	for _, track := range plan.Audio {
		if !StudioIDPattern.MatchString(track.MediaID) || !finite(track.Start) || track.Start < 0 || track.Start > 3600 || !finite(track.Offset) || track.Offset < 0 || track.Offset > 3600 || !finite(track.Volume) || track.Volume < 0 || track.Volume > 1 || (track.Duration != nil && (!finite(*track.Duration) || *track.Duration <= 0 || *track.Duration > 3600)) {
			return errors.New("invalid audio track")
		}
	}
	return nil
}

func ProbeStudioMedia(ctx context.Context, path string) (StudioMediaProbe, error) {
	command := exec.CommandContext(ctx, studioFFmpegBinary(true), "-v", "error", "-show_format", "-show_streams", "-of", "json", path)
	output, err := command.Output()
	if err != nil {
		return StudioMediaProbe{}, errors.New("media could not be decoded")
	}
	var result struct {
		Format struct {
			Duration string `json:"duration"`
		} `json:"format"`
		Streams []struct {
			FrameRate string `json:"avg_frame_rate"`
			Kind      string `json:"codec_type"`
			Width     int    `json:"width"`
			Height    int    `json:"height"`
		} `json:"streams"`
	}
	if err := common.Unmarshal(output, &result); err != nil {
		return StudioMediaProbe{}, err
	}
	duration, err := strconv.ParseFloat(result.Format.Duration, 64)
	if err != nil || math.IsNaN(duration) || math.IsInf(duration, 0) || duration <= 0 || duration > 3600 {
		return StudioMediaProbe{}, errors.New("media duration is invalid or exceeds one hour")
	}
	probe := StudioMediaProbe{Duration: duration}
	for _, stream := range result.Streams {
		if stream.Kind == "audio" {
			probe.HasAudio = true
		}
		if stream.Kind == "video" {
			probe.HasVideo = true
			probe.Width, probe.Height = stream.Width, stream.Height
			numerator, denominator, ok := strings.Cut(stream.FrameRate, "/")
			if ok {
				first, _ := strconv.ParseFloat(numerator, 64)
				second, _ := strconv.ParseFloat(denominator, 64)
				if second > 0 && first > 0 && first/second <= 240 {
					probe.FrameRate = first / second
				}
			}
		}
	}
	return probe, nil
}

func RunStudioRender(ctx context.Context, job *model.StudioWorkflowJob, project *model.StudioProject, plan *StudioRenderPlan) error {
	inputJSON, err := common.Marshal(plan)
	if err != nil {
		return err
	}
	var inputPlan map[string]any
	if err := common.Unmarshal(inputJSON, &inputPlan); err != nil {
		return err
	}
	if err := ValidateStudioRenderPlan(plan); err != nil {
		return err
	}
	if !StudioRenderAvailable() {
		return errors.New("configure FFmpeg and FFprobe on this worker")
	}
	root, err := StudioStorageRoot()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Join(root, "renders"), 0700); err != nil {
		return err
	}
	workdir, err := os.MkdirTemp(filepath.Join(root, "renders"), "render-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(workdir)
	fontReady := false
	for _, font := range []string{os.Getenv("STUDIO_FONT_PATH"), "C:\\Windows\\Fonts\\msyh.ttc", "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"} {
		if font == "" {
			continue
		}
		data, e := os.ReadFile(font)
		if e == nil {
			if os.WriteFile(filepath.Join(workdir, "font.ttf"), data, 0600) == nil {
				fontReady = true
				break
			}
		}
	}
	var document map[string]any
	if err := common.Unmarshal([]byte(project.Document), &document); err != nil {
		return err
	}
	if err := ValidateStudioRegionalRender(document, plan); err != nil {
		return err
	}
	if err := ValidateStudioPendingCaptionDraft(document, plan.VariantID); err != nil {
		return err
	}
	production, _ := document["production"].(map[string]any)
	if plan.Package {
		for _, change := range studioObjects(production, "changes") {
			if change["status"] == "pending" {
				return errors.New("resolve script and review changes before final delivery")
			}
		}
	}
	if err := ValidateStudioDeliveryAudioReviews(document, plan); err != nil {
		return err
	}
	if plan.RequireApproved {
		for _, clip := range plan.Clips {
			accepted := false
			if production, ok := document["production"].(map[string]any); ok {
				for _, review := range studioObjects(production, "reviews") {
					if review["nodeId"] == clip.NodeID && review["takeId"] == clip.TakeID && review["mediaId"] == clip.MediaID {
						accepted = review["status"] == "approved"
					}
				}
			}
			if !accepted {
				return errors.New("all delivery clips must be approved before rendering")
			}
		}
	}
	var list strings.Builder
	browserGraphics := []StudioMotionGraphic{}
	for _, item := range plan.MotionGraphics {
		if item.Kind != "" && item.Kind != "text" || item.Animation == "rotate" || item.Animation == "morph" {
			browserGraphics = append(browserGraphics, item)
		}
	}
	var graphicBrowser *StudioPrevisBrowser
	if len(browserGraphics) > 0 {
		var err error
		graphicBrowser, _, err = openStudioGraphicsBrowser(ctx, project.OwnerID, document, browserGraphics, plan.Width, plan.Height)
		if err != nil {
			return err
		}
		defer graphicBrowser.close()
	}
	durations := make([]float64, 0, len(plan.Clips))
	total := 0.0
	sourceDurationTotal := 0.0
	for index, clip := range plan.Clips {
		if err := ctx.Err(); err != nil {
			return err
		}
		logicalNodeID, _ := studioRenderDialogueSource(document, clip)
		// Separate dialogue replaces speech embedded by a lip-sync model.
		for _, shot := range studioObjects(document, "shots") {
			if plan.SkipDialogue {
				break
			}
			if shot["videoNodeId"] != logicalNodeID {
				continue
			}
			for _, cue := range studioObjects(production, "dialogueCues") {
				if cue["shotId"] == shot["id"] && cue["audioMediaId"] != nil && cue["audioMediaId"] != "" {
					clip.Muted = true
					plan.Clips[index].Muted = true
				}
			}
		}
		media, err := GetStudioMedia(project.OwnerID, clip.MediaID)
		if err != nil {
			return errors.New("render media is unavailable")
		}
		path, err := StudioMediaPath(media)
		if err != nil {
			return err
		}
		probe, err := ProbeStudioMedia(ctx, path)
		if err != nil {
			return err
		}
		if !probe.HasVideo {
			return errors.New("a clip has no video stream")
		}
		end := probe.Duration
		if clip.End != nil {
			end = *clip.End
		}
		if clip.Start >= end || end > probe.Duration+0.05 {
			return errors.New("clip trim is outside its media duration")
		}
		duration := (end - clip.Start) / clip.Speed
		if clip.VoiceoverMediaID != "" && clip.Start == 0 && clip.End == nil && clip.VoiceoverOffset >= duration {
			return errors.New("per-shot voiceover starts after the clip ends")
		}
		if duration < 0.05 || clip.FadeIn > duration || clip.FadeOut > duration {
			return errors.New("clip is too short for its trim or fades")
		}
		// Allocate integer frames from the cumulative source time. Independent
		// rounding drifts at every cut, while container audio duration can add
		// encoder padding. Film, dialogue, captions and NLE exports share these
		// exact frame boundaries.
		frames := int64(math.Round((sourceDurationTotal+duration)*float64(plan.FPS))) - int64(math.Round(sourceDurationTotal*float64(plan.FPS)))
		sourceDurationTotal += duration
		if frames < 1 {
			return errors.New("clip is shorter than one output frame")
		}
		duration = float64(frames) / float64(plan.FPS)
		total += duration
		if total > 3600 {
			return errors.New("delivery exceeds one hour")
		}
		durations = append(durations, duration)
		output := fmt.Sprintf("clip-%03d.mp4", index)
		args := []string{"-nostdin", "-y", "-v", "error", "-ss", fmt.Sprint(clip.Start), "-t", fmt.Sprint(end - clip.Start), "-i", path}
		if !probe.HasAudio {
			args = append(args, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo")
		}
		video := studioRenderVideoFilter(plan, clip.Speed) + ",tpad=stop_mode=clone:stop_duration=1"
		if plan.Watermark != "" {
			if !fontReady {
				return errors.New("configure a subtitle font on the worker")
			}
			if err := os.WriteFile(filepath.Join(workdir, "watermark.txt"), []byte(plan.Watermark), 0600); err != nil {
				return err
			}
			video += fmt.Sprintf(",drawtext=fontfile=font.ttf:textfile=watermark.txt:expansion=none:fontsize=%d:fontcolor=white@0.75:x=w-text_w-16:y=16", max(12, plan.Height/36))
		}
		if clip.FadeIn > 0 {
			video += fmt.Sprintf(",fade=t=in:st=0:d=%g", clip.FadeIn)
		}
		if clip.FadeOut > 0 {
			video += fmt.Sprintf(",fade=t=out:st=%g:d=%g", duration-clip.FadeOut, clip.FadeOut)
		}
		if clip.Caption != "" {
			if !fontReady {
				return errors.New("configure a subtitle font on the worker")
			}
			captionFile := fmt.Sprintf("caption-%03d.txt", index)
			if err := os.WriteFile(filepath.Join(workdir, captionFile), []byte(clip.Caption), 0600); err != nil {
				return err
			}
			captionEnd := duration
			if clip.CaptionDuration > 0 {
				captionEnd = math.Min(duration, clip.CaptionOffset+clip.CaptionDuration)
			}
			video += fmt.Sprintf(",drawtext=fontfile=font.ttf:textfile=%s:expansion=none:fontsize=%d:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=12:x=(w-text_w)/2:y=h-text_h-40:enable='between(t,%g,%g)'", captionFile, max(18, plan.Height/24), clip.CaptionOffset, captionEnd)
		}
		if len(plan.MotionGraphics) > 0 {
			if !fontReady {
				return errors.New("configure a subtitle font on the worker")
			}
			graphics, err := studioMotionGraphicFilters(plan.MotionGraphics, total-duration, duration, workdir)
			if err != nil {
				return err
			}
			video += graphics
		}
		volume := clip.Volume
		if clip.Muted {
			volume = 0
		}
		audio := fmt.Sprintf("asetpts=PTS-STARTPTS,%s,volume=%g,apad,atrim=duration=%g", studioTempoFilter(clip.Speed), volume, duration)
		if clip.FadeIn > 0 {
			audio += fmt.Sprintf(",afade=t=in:st=0:d=%g", clip.FadeIn)
		}
		if clip.FadeOut > 0 {
			audio += fmt.Sprintf(",afade=t=out:st=%g:d=%g", duration-clip.FadeOut, clip.FadeOut)
		}
		args = append(args, "-map", "0:v:0")
		if graphicBrowser != nil {
			graphicDirectory := fmt.Sprintf("graphic-frames-%03d", index)
			if err := os.MkdirAll(filepath.Join(workdir, graphicDirectory), 0700); err != nil {
				return err
			}
			for frame := range frames {
				data, err := graphicBrowser.Frame(total-duration+float64(frame)/float64(plan.FPS), "color")
				if err != nil {
					return err
				}
				if err := os.WriteFile(filepath.Join(workdir, graphicDirectory, fmt.Sprintf("%06d.png", frame)), data, 0600); err != nil {
					return err
				}
			}
			// Replace the just-added video map with the composed video stream.
			args = args[:len(args)-2]
			inputIndex := 1
			if !probe.HasAudio {
				inputIndex = 2
			}
			args = append(args, "-framerate", fmt.Sprint(plan.FPS), "-i", filepath.Join(graphicDirectory, "%06d.png"), "-filter_complex", fmt.Sprintf("[0:v]%s[clipframe];[clipframe][%d:v]overlay=x=0:y=0:shortest=1[graphicvideo]", video, inputIndex), "-map", "[graphicvideo]")
		} else {
			args = append(args, "-vf", video)
		}
		if probe.HasAudio {
			args = append(args, "-map", "0:a:0")
		} else {
			args = append(args, "-map", "1:a:0")
		}
		args = append(args, "-af", audio, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-ar", "48000", "-ac", "2", "-frames:v", fmt.Sprint(frames), "-t", fmt.Sprint(duration), output)
		if err := runStudioFFmpeg(ctx, workdir, args); err != nil {
			return err
		}
		fmt.Fprintf(&list, "file '%s'\nduration %.12f\n", output, duration)
		if err := studioSaveProgress(job, StudioWorkflowProgress{Phase: "rendering", NodeID: clip.NodeID}, (index+1)*70/len(plan.Clips)); err != nil {
			return err
		}
	}
	if err := os.WriteFile(filepath.Join(workdir, "clips.txt"), []byte(list.String()), 0600); err != nil {
		return err
	}
	if err := runStudioFFmpeg(ctx, workdir, []string{"-nostdin", "-y", "-v", "error", "-f", "concat", "-safe", "1", "-i", "clips.txt", "-c", "copy", "joined.mp4"}); err != nil {
		return err
	}
	args := []string{"-nostdin", "-y", "-v", "error", "-i", "joined.mp4"}
	filters := []string{"[0:a]anull[base]"}
	mix := "[base]"
	tracks := append([]StudioRenderAudio{}, plan.Audio...)
	autoDialogueSubtitles := strings.TrimSpace(plan.Subtitles) == ""
	if plan.SubtitleOffset != 0 {
		shifted, err := ShiftStudioSubtitles(plan.Subtitles, plan.SubtitleOffset)
		if err != nil {
			return err
		}
		plan.Subtitles, plan.SubtitleOffset = shifted, 0
	}
	offset := 0.0
	cueIndex := 10000
	for index, clip := range plan.Clips {
		logicalNodeID, trimOffset := studioRenderDialogueSource(document, clip)
		if clip.VoiceoverMediaID != "" {
			volume := 1.0
			if clip.VoiceoverVolume != nil {
				volume = *clip.VoiceoverVolume
			}
			start := math.Max(0, clip.VoiceoverOffset-trimOffset)
			sourceStart := math.Max(0, trimOffset-clip.VoiceoverOffset)
			media, err := GetStudioMedia(project.OwnerID, clip.VoiceoverMediaID)
			if err != nil {
				return err
			}
			path, err := StudioMediaPath(media)
			if err != nil {
				return err
			}
			probe, err := ProbeStudioMedia(ctx, path)
			if err != nil {
				return err
			}
			duration := math.Min(probe.Duration-sourceStart, durations[index]-start)
			if duration > 0 {
				tracks = append(tracks, StudioRenderAudio{MediaID: clip.VoiceoverMediaID, Start: sourceStart, Offset: offset + start, Volume: volume, Duration: &duration})
			}
		}
		for _, shot := range studioObjects(document, "shots") {
			if plan.SkipDialogue {
				break
			}
			if shot["videoNodeId"] != logicalNodeID {
				continue
			}
			for _, cue := range studioObjects(production, "dialogueCues") {
				if cue["shotId"] != shot["id"] {
					continue
				}
				mediaID, _ := cue["audioMediaId"].(string)
				start, _ := cue["offset"].(float64)
				end, _ := cue["duration"].(float64)
				if mediaID == "" {
					continue
				}
				start -= trimOffset
				sourceStart := math.Max(0, -start)
				start = math.Max(0, start)
				if end <= 0 {
					end = durations[index] - start
				}
				if clip.Start == 0 && clip.End == nil && start+end > durations[index]+.01 {
					return errors.New("dialogue audio exceeds the shot duration; align dialogue before delivery")
				}
				end = math.Min(end-sourceStart, durations[index]-start)
				if end <= 0 {
					continue
				}
				tracks = append(tracks, StudioRenderAudio{MediaID: mediaID, Start: sourceStart, Offset: offset + start, Duration: &end, Volume: 1})
				text, _ := cue["text"].(string)
				if text != "" && autoDialogueSubtitles {
					cueIndex++
					plan.Subtitles += fmt.Sprintf("\n\n%d\n%s --> %s\n%s\n", cueIndex, studioSubtitleTime(offset+start), studioSubtitleTime(offset+start+end), text)
				}
			}
		}
		offset += durations[index]
	}
	for index, track := range tracks {
		media, err := GetStudioMedia(project.OwnerID, track.MediaID)
		if err != nil {
			return errors.New("audio track is unavailable")
		}
		path, err := StudioMediaPath(media)
		if err != nil {
			return err
		}
		probe, err := ProbeStudioMedia(ctx, path)
		if err != nil || !probe.HasAudio {
			return errors.New("audio track could not be decoded")
		}
		if track.Start >= probe.Duration {
			return errors.New("audio trim is outside the media duration")
		}
		args = append(args, "-i", path)
		trim := fmt.Sprintf("atrim=start=%g", track.Start)
		if track.Duration != nil {
			trim += fmt.Sprintf(":duration=%g", *track.Duration)
		}
		filters = append(filters, fmt.Sprintf("[%d:a]%s,asetpts=PTS-STARTPTS,volume=%g,adelay=%d|%d[a%d]", index+1, trim, track.Volume, int(math.Round(track.Offset*1000)), int(math.Round(track.Offset*1000)), index))
		mix += fmt.Sprintf("[a%d]", index)
	}
	filters = append(filters, fmt.Sprintf("%samix=inputs=%d:duration=first:normalize=0,alimiter=limit=0.95[outa]", mix, len(tracks)+1))
	args = append(args, "-filter_complex", strings.Join(filters, ";"), "-map", "0:v", "-map", "[outa]")
	if plan.Subtitles != "" {
		subtitles, err := ShiftStudioSubtitles(plan.Subtitles, plan.SubtitleOffset)
		if err != nil {
			return err
		}
		plan.Subtitles = subtitles
		if err := os.WriteFile(filepath.Join(workdir, "subtitles.srt"), []byte(plan.Subtitles), 0600); err != nil {
			return err
		}
		args = append(args, "-vf", "subtitles=subtitles.srt:fontsdir=.", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20")
	} else {
		args = append(args, "-c:v", "copy")
	}
	args = append(args, "-c:a", "aac", "-ar", "48000", "-ac", "2", "-t", fmt.Sprint(total), "-movflags", "+faststart", "delivery.mp4")
	if err := runStudioFFmpeg(ctx, workdir, args); err != nil {
		return err
	}
	file, err := os.Open(filepath.Join(workdir, "delivery.mp4"))
	if err != nil {
		return err
	}
	mediaID := uuid.NewString()
	_, err = SaveStudioMedia(project.OwnerID, mediaID, "video/mp4", file)
	file.Close()
	if err != nil {
		return err
	}
	if err := LinkStudioProjectMedia(project.ID, mediaID); err != nil {
		return err
	}
	deliverySubtitles, err := BuildStudioDeliverySubtitles(plan, durations)
	if err != nil {
		return err
	}
	result := map[string]any{"media_id": mediaID, "revision": job.Revision, "width": plan.Width, "height": plan.Height, "fps": plan.FPS, "duration": total, "clips": plan.Clips, "clip_durations": durations, "subtitles": deliverySubtitles, "audio": tracks, "request_plan": inputPlan, "dialogue_cues": production["dialogueCues"]}
	if plan.VariantID != "" {
		result["variant_id"] = plan.VariantID
	}
	if plan.DeliveryLabel != "" {
		result["delivery_label"] = plan.DeliveryLabel
	}
	if plan.Package {
		deliveryPlan := *plan
		deliveryPlan.Subtitles = deliverySubtitles
		packageID, err := studioDeliveryPackage(project, &deliveryPlan, result, workdir)
		if err != nil {
			return err
		}
		result["package_media_id"] = packageID
		if err := LinkStudioProjectMedia(project.ID, packageID); err != nil {
			return err
		}
	}
	encoded, err := common.Marshal(result)
	if err != nil {
		return err
	}
	if err := model.DB.Model(&model.StudioWorkflowJob{}).Where("id = ? AND lease_owner = ?", job.ID, job.LeaseOwner).Update("result", model.StudioDocument(encoded)).Error; err != nil {
		return err
	}
	if plan.NodeID != "" {
		var prompt, modelName any
		for _, node := range studioObjects(document, "nodes") {
			if node["id"] == plan.NodeID {
				data, _ := node["data"].(map[string]any)
				prompt, modelName = data["prompt"], data["model"]
			}
		}
		take := map[string]any{"id": uuid.NewString(), "createdAt": time.Now().UTC().Format(time.RFC3339Nano), "status": "completed", "mediaId": mediaID, "prompt": prompt, "model": modelName}
		if modelName == nil {
			delete(take, "model")
		}
		if prompt == nil {
			take["prompt"] = ""
		}
		return publishStudioWorkflowTake(job, plan.NodeID, take)
	}
	return nil
}

func studioTempoFilter(speed float64) string {
	filters := []string{}
	for speed > 2 {
		filters = append(filters, "atempo=2")
		speed /= 2
	}
	for speed < 0.5 {
		filters = append(filters, "atempo=0.5")
		speed /= 0.5
	}
	return strings.Join(append(filters, fmt.Sprintf("atempo=%g", speed)), ",")
}

// FFmpeg receives argv directly. User text is in files; no shell is involved.
func runStudioFFmpeg(ctx context.Context, workdir string, args []string) error {
	args = append([]string{"-threads", "2", "-filter_threads", "2", "-filter_complex_threads", "2"}, args...)
	// Codec options are scoped by FFmpeg to inputs/outputs. Bound the final
	// encoder as well as decoding and filtering so one export stays responsive.
	if len(args) > 0 {
		output := args[len(args)-1]
		args = append(args[:len(args)-1], "-threads", "2", output)
	}
	command := exec.CommandContext(ctx, studioFFmpegBinary(false), args...)
	command.Dir = workdir
	var stderr bytes.Buffer
	command.Stderr = &stderr
	if err := command.Run(); err != nil {
		return errors.New("FFmpeg render failed; verify the input media and worker codecs")
	}
	return nil
}

func studioDeliveryPackage(project *model.StudioProject, plan *StudioRenderPlan, result map[string]any, workdir string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	editorialEntries, err := studioEditorialPackage(ctx, project, plan, result, workdir)
	if err != nil {
		return "", err
	}
	file, err := os.Create(filepath.Join(workdir, "delivery.zip"))
	if err != nil {
		return "", err
	}
	writer := zip.NewWriter(file)
	manifest, err := common.Marshal(result)
	if err != nil {
		file.Close()
		return "", err
	}
	for name, data := range map[string][]byte{"manifest.json": manifest, "project.json": []byte(project.Document), "subtitles.srt": []byte(plan.Subtitles)} {
		entry, err := writer.Create(name)
		if err != nil {
			file.Close()
			return "", err
		}
		if _, err := entry.Write(data); err != nil {
			file.Close()
			return "", err
		}
	}
	for _, name := range editorialEntries {
		entry, err := writer.Create(name)
		if err != nil {
			file.Close()
			return "", err
		}
		source, err := os.Open(filepath.Join(workdir, filepath.FromSlash(name)))
		if err != nil {
			file.Close()
			return "", err
		}
		_, copyErr := io.Copy(entry, source)
		source.Close()
		if copyErr != nil {
			file.Close()
			return "", copyErr
		}
	}
	var edl strings.Builder
	fmt.Fprint(&edl, "TITLE: New API Studio\nFCM: NON-DROP FRAME\n\n")
	timecode := func(seconds float64) string {
		frames := int(math.Round(seconds * float64(plan.FPS)))
		return fmt.Sprintf("%02d:%02d:%02d:%02d", frames/(plan.FPS*3600), frames/(plan.FPS*60)%60, frames/plan.FPS%60, frames%plan.FPS)
	}
	offset := 0.0
	for index, clip := range plan.Clips {
		media, err := GetStudioMedia(project.OwnerID, clip.MediaID)
		if err != nil {
			file.Close()
			return "", err
		}
		localPath, err := StudioMediaPath(media)
		if err != nil {
			file.Close()
			return "", err
		}
		probe, err := ProbeStudioMedia(context.Background(), localPath)
		if err != nil {
			file.Close()
			return "", err
		}
		end := probe.Duration
		if clip.End != nil {
			end = *clip.End
		}
		duration := (end - clip.Start) / clip.Speed
		if durations, ok := result["clip_durations"].([]float64); ok && index < len(durations) {
			duration = durations[index]
		}
		fmt.Fprintf(&edl, "%03d  AX       V     C        %s %s %s %s\n* FROM CLIP NAME: %s\n* TAKE: %s\n* SPEED: %g\n\n", index+1, timecode(clip.Start), timecode(end), timecode(offset), timecode(offset+duration), clip.MediaID, clip.TakeID, clip.Speed)
		offset += duration
	}
	entry, err := writer.Create("timeline.edl")
	if err != nil {
		file.Close()
		return "", err
	}
	if _, err := entry.Write([]byte(edl.String())); err != nil {
		file.Close()
		return "", err
	}
	var document map[string]any
	if err := common.Unmarshal([]byte(project.Document), &document); err != nil {
		file.Close()
		return "", err
	}
	sourceBytes := int64(0)
	for id := range StudioMediaReferences(document) {
		media, err := GetStudioMedia(project.OwnerID, id)
		if err != nil {
			file.Close()
			return "", errors.New("delivery package source media is unavailable")
		}
		if media.MimeType == "application/zip" {
			continue
		}
		sourceBytes += media.Size
		if sourceBytes > 2<<30 {
			file.Close()
			return "", errors.New("delivery source package exceeds 2 GiB; archive a smaller project")
		}
		localPath, err := StudioMediaPath(media)
		if err != nil {
			file.Close()
			return "", err
		}
		extensions, _ := mime.ExtensionsByType(media.MimeType)
		extension := map[string]string{"video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov", "audio/mpeg": ".mp3", "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/mp4": ".m4a", "audio/ogg": ".ogg", "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "model/gltf-binary": ".glb"}[media.MimeType]
		if extension == "" && len(extensions) > 0 {
			extension = extensions[0]
		}
		if extension == "" {
			extension = ".bin"
		}
		entry, err := writer.Create("media/" + id + extension)
		if err != nil {
			file.Close()
			return "", err
		}
		source, err := os.Open(localPath)
		if err != nil {
			file.Close()
			return "", err
		}
		_, copyErr := io.Copy(entry, source)
		source.Close()
		if copyErr != nil {
			file.Close()
			return "", copyErr
		}
	}
	entry, err = writer.Create("video.mp4")
	if err != nil {
		file.Close()
		return "", err
	}
	video, err := os.Open(filepath.Join(workdir, "delivery.mp4"))
	if err != nil {
		file.Close()
		return "", err
	}
	_, copyErr := io.Copy(entry, video)
	video.Close()
	if copyErr != nil {
		file.Close()
		return "", copyErr
	}
	if err := writer.Close(); err != nil {
		file.Close()
		return "", err
	}
	if err := file.Close(); err != nil {
		return "", err
	}
	archive, err := os.Open(filepath.Join(workdir, "delivery.zip"))
	if err != nil {
		return "", err
	}
	defer archive.Close()
	mediaID := uuid.NewString()
	_, err = SaveStudioMedia(project.OwnerID, mediaID, "application/zip", archive)
	return mediaID, err
}

func RunStudioQuality(ctx context.Context, job *model.StudioWorkflowJob, project *model.StudioProject) error {
	var document map[string]any
	if err := common.Unmarshal([]byte(project.Document), &document); err != nil {
		return err
	}
	findings := []map[string]any{}
	production, _ := document["production"].(map[string]any)
	filmDuration := 0.0
	for _, node := range studioObjects(document, "nodes") {
		data, _ := node["data"].(map[string]any)
		if data["kind"] == "video" {
			if duration, ok := data["seconds"].(float64); ok {
				filmDuration += duration
			}
		}
	}
	width, height := 1920, 1080
	if value, ok := production["width"].(float64); ok {
		width = int(value)
	}
	if value, ok := production["height"].(float64); ok {
		height = int(value)
	}
	subtitles, _ := document["captionsText"].(string)
	var delivery model.StudioWorkflowJob
	if model.DB.Where("project_id = ? AND kind = ? AND status = ?", project.ID, "render", "succeeded").Order("updated_at DESC").First(&delivery).Error == nil {
		var result struct {
			Duration  float64 `json:"duration"`
			Width     int     `json:"width"`
			Height    int     `json:"height"`
			Subtitles string  `json:"subtitles"`
		}
		if common.Unmarshal([]byte(delivery.Result), &result) == nil {
			filmDuration, width, height = result.Duration, result.Width, result.Height
			if result.Subtitles != "" {
				subtitles = result.Subtitles
			}
		}
	}
	findings = append(findings, StudioSubtitleFindings(subtitles, filmDuration, width, height)...)
	for _, clip := range studioObjects(production, "timeline") {
		caption, _ := clip["caption"].(string)
		if caption == "" {
			continue
		}
		fakeCue := "1\n00:00:00,000 --> 00:00:01,000\n" + caption + "\n"
		for _, finding := range StudioSubtitleFindings(fakeCue, 1, width, height) {
			finding["node_id"] = clip["nodeId"]
			findings = append(findings, finding)
		}
	}
	for _, node := range studioObjects(document, "nodes") {
		data, _ := node["data"].(map[string]any)
		if data["kind"] != "video" && data["kind"] != "audio" {
			continue
		}
		mediaID, _ := data["mediaId"].(string)
		if mediaID == "" {
			findings = append(findings, map[string]any{"node_id": node["id"], "code": "missing_media", "severity": "error"})
			continue
		}
		media, err := GetStudioMedia(project.OwnerID, mediaID)
		if err != nil {
			findings = append(findings, map[string]any{"node_id": node["id"], "code": "unavailable_media", "severity": "error"})
			continue
		}
		path, err := StudioMediaPath(media)
		if err != nil {
			return err
		}
		probe, err := ProbeStudioMedia(ctx, path)
		if err != nil {
			findings = append(findings, map[string]any{"node_id": node["id"], "code": "decode_failed", "severity": "error"})
			continue
		}
		if data["kind"] == "video" && !probe.HasAudio {
			findings = append(findings, map[string]any{"node_id": node["id"], "code": "no_audio_stream", "severity": "warning"})
		}
		filters := []string{"-nostdin", "-v", "info", "-threads", "2", "-filter_threads", "2", "-i", path}
		if probe.HasVideo {
			filters = append(filters, "-vf", "blackdetect=d=0.5:pix_th=0.10")
		}
		if probe.HasAudio {
			filters = append(filters, "-af", "silencedetect=noise=-50dB:d=1")
		}
		filters = append(filters, "-f", "null", "-")
		command := exec.CommandContext(ctx, studioFFmpegBinary(false), filters...)
		output, err := command.CombinedOutput()
		if err != nil {
			return errors.New("quality analysis failed")
		}
		for line := range strings.SplitSeq(string(output), "\n") {
			if strings.Contains(line, "black_start:") || strings.Contains(line, "silence_start:") || strings.Contains(line, "silence_end:") {
				findings = append(findings, map[string]any{"node_id": node["id"], "code": "media_warning", "severity": "warning", "detail": strings.TrimSpace(line)})
			}
		}
	}
	encoded, err := common.Marshal(map[string]any{"revision": project.Revision, "findings": findings})
	if err != nil {
		return err
	}
	return model.DB.Model(&model.StudioWorkflowJob{}).Where("id = ? AND lease_owner = ?", job.ID, job.LeaseOwner).Update("result", model.StudioDocument(encoded)).Error
}
