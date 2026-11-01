package service

import (
	"context"
	"errors"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

// A detached source voice must keep its original program-time fade envelope.
// Bake only those effects into lossless audio; the existing track contract can
// then preserve offset and gain without adding fields or changing source bytes.
func prepareStudioReplacementAudioEnvelope(ctx context.Context, project *model.StudioProject, original, next map[string]any, request StudioEditRequest, durations map[string]float64) (map[string]any, error) {
	_, clips := studioTimelineDocument(original)
	var clip map[string]any
	for _, candidate := range clips {
		if candidate["id"] == request.ClipID {
			clip = candidate
			break
		}
	}
	if clip == nil {
		return nil, errors.New("the original audio occurrence is unavailable")
	}
	fadeIn, fadeOut := studioDocumentNumber(clip["fadeIn"], 0), studioDocumentNumber(clip["fadeOut"], 0)
	if fadeIn == 0 && fadeOut == 0 {
		return nil, nil
	}
	production, _ := studioTimelineDocument(next)
	var track map[string]any
	for _, candidate := range studioObjects(production, "audioTracks") {
		if candidate["id"] == "voice-"+studioAnalysisID(request.RequestID + ":original-audio")[:32] {
			track = candidate
			break
		}
	}
	if track == nil || studioDocumentNumber(track["volume"], 1) == 0 {
		return nil, nil // Muted sources or independently supplied dialogue need no bake.
	}
	start, end, speed := studioDocumentNumber(clip["trimStart"], 0), studioDocumentNumber(clip["trimEnd"], durations[request.ClipID]), studioDocumentNumber(clip["speed"], 1)
	length := (end - start) / speed
	if !studioSceneFinite(start) || !studioSceneFinite(end) || !studioSceneFinite(speed) || !studioSceneFinite(fadeIn) || !studioSceneFinite(fadeOut) || start < 0 || end <= start || end > 3600 || speed < .25 || speed > 4 || length > 3600 || fadeIn < 0 || fadeOut < 0 || fadeIn > min(3, length) || fadeOut > min(3, length) {
		return nil, errors.New("the original audio fades exceed this exact clip duration")
	}
	source, _, err := studioClipSource(project.OwnerID, original, clip)
	if err != nil {
		return nil, err
	}
	if track["mediaId"] != source.MediaID || studioDocumentNumber(track["start"], -1) != start || studioDocumentNumber(track["duration"], -1) != end-start || studioDocumentNumber(track["speed"], 1) != speed {
		return nil, errors.New("the preserved audio no longer matches its exact source")
	}
	parameters := map[string]any{"version": 1, "source_digest": source.Digest, "start": start, "end": end, "speed": speed, "fade_in": fadeIn, "fade_out": fadeOut, "codec": "flac"}
	raw, err := common.Marshal(parameters)
	if err != nil {
		return nil, err
	}
	id := "audio-envelope-" + studioAnalysisID(string(raw))
	// Recompute before accepting an existing ID: only matching actual bytes may
	// reuse immutable storage. A caller-uploaded lookalike is never trusted.
	path, err := StudioMediaPath(source)
	if err != nil {
		return nil, err
	}
	work, err := CreateStudioCacheWorkdir("", project.OwnerID, "", "range-audio-envelope", true, nil)
	if err != nil {
		return nil, err
	}
	output, succeeded := filepath.Join(work, "original.flac"), false
	defer func() {
		_ = os.Remove(output) // Only this owned intermediate; durable media is separate.
		state := "failed"
		if succeeded {
			state = "succeeded"
		}
		_ = UpdateStudioCacheWorkdir("", work, state, time.Now().Unix(), StudioCacheRetentionPolicy())
	}()
	filters := fmt.Sprintf("asetpts=PTS-STARTPTS,%s,apad,atrim=duration=%g", studioTempoFilter(speed), length)
	if fadeIn > 0 {
		filters += fmt.Sprintf(",afade=t=in:st=0:d=%g", fadeIn)
	}
	if fadeOut > 0 {
		filters += fmt.Sprintf(",afade=t=out:st=%g:d=%g", length-fadeOut, fadeOut)
	}
	bounded, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	args := []string{"-nostdin", "-v", "error", "-y", "-ss", fmt.Sprint(start), "-t", fmt.Sprint(end - start), "-i", path, "-vn", "-map", "0:a:0", "-af", filters, "-c:a", "flac", "-fs", fmt.Sprint(StudioMaxMediaBytes), output}
	if err := exec.CommandContext(bounded, studioFFmpegBinary(false), args...).Run(); err != nil {
		return nil, errors.New("could not preserve the original audio fades; the edit was not applied")
	}
	info, err := os.Stat(output)
	if err != nil || info.Size() < 1 || info.Size() > StudioMaxMediaBytes {
		return nil, errors.New("preserved audio exceeds the 512 MiB media limit")
	}
	probe, err := ProbeStudioMedia(bounded, output)
	if err != nil || !probe.HasAudio || math.Abs(probe.Duration-length) > .002 {
		return nil, errors.New("preserved audio is incomplete or exceeds the media limit; the edit was not applied")
	}
	file, err := os.Open(output)
	if err != nil {
		return nil, err
	}
	derived, err := SaveStudioMedia(project.OwnerID, id, "audio/flac", file)
	closeErr := file.Close()
	if err != nil {
		return nil, err
	}
	if closeErr != nil {
		return nil, closeErr
	}
	succeeded = true

	if err := LinkStudioProjectMedia(project.ID, derived.MediaID); err != nil {
		return nil, err
	}
	track["mediaId"], track["start"], track["duration"], track["speed"] = derived.MediaID, 0., length, 1.
	parameters["media_id"], parameters["digest"], parameters["purpose"] = derived.MediaID, derived.Digest, "original_audio_envelope"
	parameters["source_media_id"], parameters["original_clip_id"] = source.MediaID, request.ClipID
	return parameters, nil
}
