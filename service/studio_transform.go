package service

import (
	"context"
	"errors"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
)

// Native edits use the workflow's durable queue without calling a model.
type StudioMediaEdit struct {
	Start    float64 `json:"start"`
	End      float64 `json:"end"`
	X        int     `json:"x"`
	Y        int     `json:"y"`
	Width    int     `json:"width"`
	Height   int     `json:"height"`
	Rotation int     `json:"rotation"`
	Speed    float64 `json:"speed"`
}

func ValidateStudioTransform(ownerID int, document map[string]any, operation *StudioMediaOperation) error {
	if operation != nil && operation.Action == "sound_preset" {
		return validateStudioSoundPreset(document, operation)
	}
	if operation == nil || operation.Edit == nil || !StudioIDPattern.MatchString(operation.NodeID) || !StudioIDPattern.MatchString(operation.MediaID) || !StudioMediaReferences(document)[operation.MediaID] {
		return errors.New("select source media in this project and an edit target")
	}
	edit := operation.Edit
	if math.IsNaN(edit.Start) || math.IsInf(edit.Start, 0) || math.IsNaN(edit.End) || math.IsInf(edit.End, 0) || math.IsNaN(edit.Speed) || math.IsInf(edit.Speed, 0) || edit.Start < 0 || edit.End < 0 || edit.Start > relaycommon.MaxTaskDurationSeconds || edit.End > relaycommon.MaxTaskDurationSeconds || edit.X < 0 || edit.Y < 0 || edit.Width < 0 || edit.Height < 0 || edit.X > 8192 || edit.Y > 8192 || edit.Width > 4096 || edit.Height > 4096 || (edit.Speed != 0 && (edit.Speed < .25 || edit.Speed > 4)) {
		return errors.New("edit settings exceed the supported range")
	}
	source, err := GetStudioMedia(ownerID, operation.MediaID)
	if err != nil {
		return err
	}
	kind := strings.SplitN(source.MimeType, "/", 2)[0]
	switch operation.Action {
	case "trim", "speed", "reverse":
		if kind != "audio" && kind != "video" {
			return errors.New("this edit needs audio or video")
		}
	case "crop", "resize", "rotate":
		if kind != "image" && kind != "video" {
			return errors.New("this edit needs an image or video")
		}
		if operation.Action != "rotate" && (edit.Width < 2 || edit.Height < 2) {
			return errors.New("select positive output dimensions")
		}
		if operation.Action == "rotate" && edit.Rotation != 90 && edit.Rotation != 180 && edit.Rotation != 270 {
			return errors.New("rotation must be 90, 180 or 270 degrees")
		}
	case "frame":
		if kind != "video" {
			return errors.New("frame capture needs a video")
		}
		kind = "image"
	case "extract_audio":
		if kind != "video" {
			return errors.New("audio extraction needs a video")
		}
		kind = "audio"
	default:
		return errors.New("unsupported native media edit")
	}
	for _, node := range studioObjects(document, "nodes") {
		if node["id"] != operation.NodeID {
			continue
		}
		data, _ := node["data"].(map[string]any)
		takes, _ := data["takes"].([]any)
		if data["kind"] != kind || data["purpose"] == "assembly" || data["locked"] == true || len(takes) >= 100 {
			return errors.New("select an editable target with the matching media type")
		}
		return nil
	}
	return errors.New("edit target is unavailable")
}

func RunStudioTransform(ctx context.Context, job *model.StudioWorkflowJob, project *model.StudioProject, plan *StudioWorkflowPlan) error {
	operation := plan.Operation
	if operation != nil && operation.Action == "sound_preset" {
		return runStudioSoundPreset(ctx, job, project, plan)
	}
	if err := ValidateStudioTransform(project.OwnerID, plan.Document, operation); err != nil {
		return err
	}
	var progress StudioWorkflowProgress
	if err := common.Unmarshal([]byte(job.Result), &progress); err != nil {
		return err
	}
	if progress.Take == nil {
		source, err := GetStudioMedia(project.OwnerID, operation.MediaID)
		if err != nil {
			return err
		}
		path, err := StudioMediaPath(source)
		if err != nil {
			return err
		}
		probe, err := probeStudioTransformSource(ctx, path, source.MimeType)
		if err != nil {
			return err
		}
		edit := operation.Edit
		if operation.Action == "crop" && (edit.X+edit.Width > probe.Width || edit.Y+edit.Height > probe.Height) {
			return errors.New("crop lies outside the source frame")
		}
		if operation.Action == "frame" && edit.Start >= probe.Duration {
			return errors.New("frame time lies outside the video")
		}
		if operation.Action == "trim" && (edit.End <= edit.Start || edit.End > probe.Duration+.05) {
			return errors.New("trim range lies outside the source duration")
		}
		if operation.Action == "extract_audio" && !probe.HasAudio {
			return errors.New("the source has no audio stream")
		}
		if operation.Action == "reverse" && probe.Duration > 60 {
			return errors.New("split the source into clips of at most 60 seconds before reversing")
		}
		temporary, err := os.MkdirTemp("", "studio-transform-")
		if err != nil {
			return err
		}
		defer os.RemoveAll(temporary)
		args := []string{"-nostdin", "-y", "-v", "error", "-i", path}
		switch operation.Action {
		case "trim":
			args = append(args, "-ss", fmt.Sprint(edit.Start), "-t", fmt.Sprint(edit.End-edit.Start))
		case "frame":
			args = append(args, "-ss", fmt.Sprint(edit.Start))
		}
		filters := []string{}
		audioFilter := ""
		switch operation.Action {
		case "crop":
			filters = append(filters, fmt.Sprintf("crop=%d:%d:%d:%d", edit.Width, edit.Height, edit.X, edit.Y))
		case "resize":
			filters = append(filters, fmt.Sprintf("scale=%d:%d", edit.Width, edit.Height))
		case "rotate":
			rotation := "transpose=1"
			if edit.Rotation == 180 {
				rotation = "hflip,vflip"
			}
			if edit.Rotation == 270 {
				rotation = "transpose=2"
			}
			filters = append(filters, rotation)
		case "speed":
			speed := edit.Speed
			if speed == 0 {
				speed = 1
			}
			filters = append(filters, fmt.Sprintf("setpts=PTS/%g", speed))
			if speed < .5 {
				audioFilter = fmt.Sprintf("atempo=0.5,atempo=%g", speed/.5)
			} else if speed > 2 {
				audioFilter = fmt.Sprintf("atempo=2,atempo=%g", speed/2)
			} else {
				audioFilter = fmt.Sprintf("atempo=%g", speed)
			}
		case "reverse":
			filters = append(filters, "reverse")
			audioFilter = "areverse"
		}
		extension, mimeType := ".mp4", "video/mp4"
		if strings.HasPrefix(source.MimeType, "image/") || operation.Action == "frame" {
			extension, mimeType = ".png", "image/png"
			args = append(args, "-frames:v", "1")
		} else if strings.HasPrefix(source.MimeType, "audio/") || operation.Action == "extract_audio" {
			extension, mimeType = ".wav", "audio/wav"
			args = append(args, "-vn", "-c:a", "pcm_s16le")
		} else {
			filters = append(filters, "scale=trunc(iw/2)*2:trunc(ih/2)*2")
			args = append(args, "-c:v", "libx264", "-threads", "2", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart")
		}
		if len(filters) > 0 && mimeType != "audio/wav" {
			args = append(args, "-vf", strings.Join(filters, ","))
		}
		if audioFilter != "" && probe.HasAudio {
			args = append(args, "-af", audioFilter)
		}
		output := filepath.Join(temporary, "edited"+extension)
		args = append(args, output)
		if err := runStudioFFmpeg(ctx, temporary, args); err != nil {
			return err
		}
		file, err := os.Open(output)
		if err != nil {
			return err
		}
		defer file.Close()
		id := "edit-" + job.ID
		media, err := SaveStudioMedia(project.OwnerID, id, mimeType, file)
		if err != nil {
			return err
		}
		if err := LinkStudioProjectMedia(project.ID, media.MediaID); err != nil {
			return err
		}
		progress.Take = map[string]any{"id": id, "createdAt": time.Now().UTC().Format(time.RFC3339Nano), "prompt": operation.Action, "status": "completed", "sourceMode": "upload", "mediaId": media.MediaID}
		progress.Phase = "collected"
		if err := studioSaveProgress(job, progress, 90); err != nil {
			return err
		}
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := publishStudioWorkflowTake(job, operation.NodeID, progress.Take); err != nil {
		return err
	}
	progress.Phase = "completed"
	return studioSaveProgress(job, progress, 100)
}

func probeStudioTransformSource(ctx context.Context, path, mimeType string) (StudioMediaProbe, error) {
	if !strings.HasPrefix(mimeType, "image/") {
		return ProbeStudioMedia(ctx, path)
	}
	probeCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	raw, err := exec.CommandContext(probeCtx, studioFFmpegBinary(true), "-v", "error", "-show_entries", "stream=width,height", "-of", "json", path).Output()
	if err != nil {
		return StudioMediaProbe{}, errors.New("source image cannot be decoded")
	}
	var result struct {
		Streams []struct {
			Width  int `json:"width"`
			Height int `json:"height"`
		} `json:"streams"`
	}
	if err := common.Unmarshal(raw, &result); err != nil || len(result.Streams) == 0 {
		return StudioMediaProbe{}, errors.New("source image has no readable frame")
	}
	stream := result.Streams[0]
	if stream.Width < 1 || stream.Height < 1 || stream.Width > 8192 || stream.Height > 8192 {
		return StudioMediaProbe{}, errors.New("source image dimensions exceed the editing limit")
	}
	return StudioMediaProbe{Width: stream.Width, Height: stream.Height, HasVideo: true}, nil
}
