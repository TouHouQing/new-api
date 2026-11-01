package service

import (
	"context"
	"errors"
	"math"
	"strings"
	"time"
)

// The result is a candidate for this source interval. It never replaces the
// source video and never stretches audio or freezes missing source frames.
func validateStudioLipSyncBounds(operation *StudioMediaOperation, video, audio *StudioMediaProbe) error {
	edit := operation.Edit
	if edit == nil || video == nil || audio == nil || !video.HasVideo || !audio.HasAudio {
		return errors.New("choose one video, one dialogue audio and an explicit source interval")
	}
	audioStart := 0.0
	if operation.Options != nil && operation.Options.LipAudioStart != nil {
		audioStart = *operation.Options.LipAudioStart
	}
	for _, value := range []float64{edit.Start, edit.End, audioStart, operation.Seconds, video.Duration, audio.Duration} {
		if math.IsNaN(value) || math.IsInf(value, 0) {
			return errors.New("lip sync source times must be finite")
		}
	}
	duration := edit.End - edit.Start
	if edit.Start < 0 || edit.End > video.Duration+.001 || duration < .1 || duration > 30 || audioStart < 0 || audioStart+duration > audio.Duration+.001 || math.Abs(operation.Seconds-duration) > .001 || edit.Speed != 0 || edit.Rotation != 0 {
		return errors.New("choose a video interval of 0.1 to 30 seconds fully covered by the selected audio interval")
	}
	automatic := edit.Width == 0 && edit.Height == 0 && edit.X == 0 && edit.Y == 0
	if !automatic && (edit.X < 0 || edit.Y < 0 || edit.Width < 48 || edit.Height < 48 || edit.X+edit.Width > video.Width || edit.Y+edit.Height > video.Height) {
		return errors.New("select a speaker region inside the source frame, at least 48 pixels in each dimension")
	}
	return nil
}

func validateStudioLipSync(ownerID int, operation *StudioMediaOperation) error {
	if len(operation.ReferenceMediaIDs) != 2 {
		return errors.New("lip sync needs exactly one video and one audio reference")
	}
	var video, audio *StudioMediaProbe
	for _, id := range operation.ReferenceMediaIDs {
		media, err := GetStudioMedia(ownerID, id)
		if err != nil {
			return err
		}
		path, err := StudioMediaPath(media)
		if err != nil {
			return err
		}
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		probe, err := ProbeStudioMedia(ctx, path)
		cancel()
		if err != nil {
			return errors.New("the selected lip sync source cannot be decoded")
		}
		switch {
		case strings.HasPrefix(media.MimeType, "video/") && video == nil:
			video = &probe
		case strings.HasPrefix(media.MimeType, "audio/") && audio == nil:
			audio = &probe
		default:
			return errors.New("lip sync needs exactly one video and one audio reference")
		}
	}
	return validateStudioLipSyncBounds(operation, video, audio)
}
