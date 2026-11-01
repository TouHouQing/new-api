package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/binary"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func TestStudioRangeReplacementPreservesActualOriginalAudioFadeEnvelope(t *testing.T) {
	if !StudioRenderAvailable() {
		t.Skip("requires actual CPU FFmpeg render")
	}
	studioProductionFixture(t)
	StudioWorkflowRelay = func(context.Context, *model.StudioWorkflowJob, string, []byte) (StudioRelayResponse, error) {
		t.Fatal("audio envelope preservation must never invoke a model")
		return StudioRelayResponse{}, nil
	}
	work := t.TempDir()
	originalPath, replacementPath := filepath.Join(work, "original.mp4"), filepath.Join(work, "replacement.mp4")
	output, err := exec.Command(studioFFmpegBinary(false), "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=96x64:r=12:d=4", "-f", "lavfi", "-i", "sine=f=880:r=48000:d=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "alac", originalPath).CombinedOutput()
	require.NoError(t, err, string(output))
	output, err = exec.Command(studioFFmpegBinary(false), "-v", "error", "-f", "lavfi", "-i", "color=blue:s=96x64:r=12:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", replacementPath).CombinedOutput()
	require.NoError(t, err, string(output))
	for id, path := range map[string]string{"fade-original": originalPath, "fade-replacement": replacementPath} {
		file, err := os.Open(path)
		require.NoError(t, err)
		_, err = SaveStudioMedia(1, id, "video/mp4", file)
		require.NoError(t, file.Close())
		require.NoError(t, err)
	}
	document := map[string]any{"id": "fade-replace-film", "title": "Own fade fixture", "createdAt": "2026-10-19T00:00:00Z", "updatedAt": "2026-10-19T00:00:00Z", "edges": []any{}, "nodes": []any{}}
	for _, id := range []string{"original", "replacement"} {
		data := map[string]any{"kind": "video", "title": id, "prompt": "Owned sustained CPU tone", "status": "completed", "sourceMode": "upload", "mediaId": "fade-" + id, "selectedTakeId": id + "-take", "takes": []any{map[string]any{"id": id + "-take", "createdAt": "2026-10-19T00:00:00Z", "sourceMode": "upload", "status": "completed", "prompt": "Owned CPU source", "mediaId": "fade-" + id}}}
		if id == "replacement" {
			data["derivedFrom"] = map[string]any{"action": "range", "nodeId": "original", "mediaId": "fade-original", "takeId": "original-take"}
			data["reworkRange"] = map[string]any{"sourceNodeId": "original", "sourceMediaId": "fade-original", "start": 1., "end": 2.}
		}
		document["nodes"] = append(document["nodes"].([]any), map[string]any{"id": id, "type": "studio", "position": map[string]any{"x": 0, "y": 0}, "data": data})
	}
	document["production"] = map[string]any{"fps": 12, "timelineEdited": true, "timeline": []any{map[string]any{"id": "clip", "nodeId": "original", "takeId": "original-take", "trimStart": 0., "trimEnd": 4., "speed": 1., "volume": .8, "muted": false, "fadeIn": 1., "fadeOut": 1.}}}
	raw, err := common.Marshal(document)
	require.NoError(t, err)
	project, err := model.SaveStudioProject(1, "fade-replace-film", "Own fade fixture", 0, string(raw))
	require.NoError(t, err)
	originalBytes, err := os.ReadFile(originalPath)
	require.NoError(t, err)
	originalDigest := sha256.Sum256(originalBytes)
	render := func(id string, clips []StudioRenderClip, audio []StudioRenderAudio) string {
		job, err := QueueStudioWorkflow(1, project.ID, id, "render", project.Revision, 0, nil, &StudioRenderPlan{Width: 96, Height: 64, FPS: 12, Fit: "letterbox", Clips: clips, Audio: audio})
		require.NoError(t, err)
		RunStudioWorkflowsOnce(t.Context(), "fade-cpu-renderer")
		require.NoError(t, model.DB.First(job, "id = ?", job.ID).Error)
		require.Equal(t, "succeeded", job.Status, job.Error)
		var result map[string]any
		require.NoError(t, common.Unmarshal([]byte(job.Result), &result))
		media, err := GetStudioMedia(1, result["media_id"].(string))
		require.NoError(t, err)
		path, err := StudioMediaPath(media)
		require.NoError(t, err)
		return path
	}
	end := 4.
	baseline := render("fade-baseline", []StudioRenderClip{{ClipID: "clip", NodeID: "original", TakeID: "original-take", MediaID: "fade-original", End: &end, Speed: 1, Volume: .8, FadeIn: 1, FadeOut: 1}}, nil)
	request := StudioEditRequest{RequestID: "fade-range-plan", Revision: project.Revision, Action: "replace_source_range", ClipID: "clip", ReplacementNodeID: "replacement", ReviewConfirmed: true}
	plan, err := PrepareStudioEditPlan(t.Context(), 1, project.ID, request)
	require.NoError(t, err)
	var payload map[string]any
	require.NoError(t, common.Unmarshal([]byte(plan.Document), &payload))
	next := payload["next_document"].(map[string]any)
	production, parts := studioTimelineDocument(next)
	clips := []StudioRenderClip{}
	for _, part := range parts {
		media, _, err := studioClipSource(1, next, part)
		require.NoError(t, err)
		end := part["trimEnd"].(float64)
		clips = append(clips, StudioRenderClip{ClipID: part["id"].(string), NodeID: part["nodeId"].(string), TakeID: part["takeId"].(string), MediaID: media.MediaID, Start: part["trimStart"].(float64), End: &end, Speed: part["speed"].(float64), Volume: part["volume"].(float64), Muted: part["muted"].(bool), FadeIn: studioDocumentNumber(part["fadeIn"], 0), FadeOut: studioDocumentNumber(part["fadeOut"], 0)})
	}
	tracks := studioObjects(production, "audioTracks")
	require.Len(t, tracks, 1)
	track := tracks[0]
	derived, err := GetStudioMedia(1, track["mediaId"].(string))
	require.NoError(t, err)
	require.Equal(t, "audio/flac", derived.MimeType)
	require.Greater(t, derived.Size, int64(0))
	require.LessOrEqual(t, derived.Size, int64(StudioMaxMediaBytes))
	require.NotEqual(t, "fade-original", derived.MediaID)
	again, err := PrepareStudioEditPlan(t.Context(), 1, project.ID, request)
	require.NoError(t, err)
	require.Equal(t, plan.Fingerprint, again.Fingerprint)
	unchanged, _, err := model.StudioProjectAccess(model.DB, 1, project.ID, false)
	require.NoError(t, err)
	require.Equal(t, project.Revision, unchanged.Revision, "prepare persists a receipt, not an applied edit")
	require.Equal(t, project.Document, unchanged.Document)
	project, _, err = model.ApplyStudioEditRecord(1, plan.ID, project.Revision)
	require.NoError(t, err)
	duration := track["duration"].(float64)
	after := render("fade-after", clips, []StudioRenderAudio{{MediaID: track["mediaId"].(string), Start: track["start"].(float64), Offset: track["offset"].(float64), Speed: track["speed"].(float64), Duration: &duration, Volume: track["volume"].(float64)}})
	rms := func(path string, at float64) float64 {
		pcm, err := exec.Command(studioFFmpegBinary(false), "-v", "error", "-i", path, "-vn", "-af", fmt.Sprintf("atrim=start=%g:duration=0.1,asetpts=PTS-STARTPTS", at), "-ac", "1", "-ar", "16000", "-f", "f32le", "pipe:1").Output()
		require.NoError(t, err)
		require.NotEmpty(t, pcm)
		sum := 0.
		for i := 0; i+4 <= len(pcm); i += 4 {
			v := float64(math.Float32frombits(binary.LittleEndian.Uint32(pcm[i:])))
			sum += v * v
		}
		return math.Sqrt(sum / float64(len(pcm)/4))
	}
	baseMiddle, afterMiddle := rms(baseline, 2.5), rms(after, 2.5)
	derivedPath, err := StudioMediaPath(derived)
	require.NoError(t, err)
	derivedMiddle := rms(derivedPath, 2.5)
	for _, at := range []float64{.1, .45, 3.45, 3.8} {
		t.Logf("program=%.2fs baseline=%.6f replacement=%.6f lossless=%.6f", at, rms(baseline, at)/baseMiddle, rms(after, at)/afterMiddle, rms(derivedPath, at)/derivedMiddle)
	}
	for _, at := range []float64{.1, .45, 3.45, 3.8} {
		require.InDelta(t, rms(baseline, at)/baseMiddle, rms(after, at)/afterMiddle, .06, "original source fade envelope must survive at program %.2fs", at)
	}
	actualOriginal, err := GetStudioMedia(1, "fade-original")
	require.NoError(t, err)
	actualOriginalPath, err := StudioMediaPath(actualOriginal)
	require.NoError(t, err)
	actualBytes, err := os.ReadFile(actualOriginalPath)
	require.NoError(t, err)
	require.Equal(t, originalDigest, sha256.Sum256(actualBytes), "the immutable source bytes must never be modified")
	t.Run("two-times-source-keeps-program-fades", func(t *testing.T) {
		var alternate map[string]any
		require.NoError(t, common.Unmarshal(raw, &alternate))
		_, sourceClips := studioTimelineDocument(alternate)
		sourceClips[0]["speed"], sourceClips[0]["fadeIn"], sourceClips[0]["fadeOut"] = 2., .5, .5
		retimed := request
		retimed.RequestID = "fade-retimed"
		preview, _, err := CompileStudioRangeReplacement(alternate, retimed, map[string]float64{"clip": 4}, 1, true)
		require.NoError(t, err)
		ref, err := prepareStudioReplacementAudioEnvelope(t.Context(), project, alternate, preview, retimed, map[string]float64{"clip": 4})
		require.NoError(t, err)
		media, err := GetStudioMedia(1, ref["media_id"].(string))
		require.NoError(t, err)
		path, err := StudioMediaPath(media)
		require.NoError(t, err)
		probe, err := ProbeStudioMedia(t.Context(), path)
		require.NoError(t, err)
		require.InDelta(t, 2, probe.Duration, .002)
		middle := rms(path, 1)
		require.InDelta(t, .208, rms(path, .05)/middle, .01)
		require.InDelta(t, .208, rms(path, 1.85)/middle, .01)
		tracks := studioObjects(preview["production"].(map[string]any), "audioTracks")
		require.Equal(t, 1., tracks[0]["speed"])
		require.Equal(t, 2., tracks[0]["duration"])
		require.Equal(t, .8, tracks[0]["volume"])
	})
	t.Run("failed-derivation-does-not-apply", func(t *testing.T) {
		var alternate map[string]any
		require.NoError(t, common.Unmarshal(raw, &alternate))
		alternate["id"] = "fade-failure-film"
		_, sourceClips := studioTimelineDocument(alternate)
		sourceClips[0]["fadeIn"] = .6
		encoded, err := common.Marshal(alternate)
		require.NoError(t, err)
		failedProject, err := model.SaveStudioProject(1, "fade-failure-film", "Own failed CPU test", 0, string(encoded))
		require.NoError(t, err)
		failedRequest := request
		failedRequest.RequestID, failedRequest.Revision = "fade-failure-plan", failedProject.Revision
		t.Setenv("STUDIO_FFMPEG_PATH", filepath.Join(work, "missing-ffmpeg.exe"))
		_, err = PrepareStudioEditPlan(t.Context(), 1, failedProject.ID, failedRequest)
		require.ErrorContains(t, err, "could not preserve the original audio fades")
		unchanged, _, err := model.StudioProjectAccess(model.DB, 1, failedProject.ID, false)
		require.NoError(t, err)
		require.Equal(t, failedProject.Revision, unchanged.Revision)
		require.Equal(t, failedProject.Document, unchanged.Document)
		var records int64
		require.NoError(t, model.DB.Model(&model.StudioProductionRecord{}).Where("id = ?", failedRequest.RequestID).Count(&records).Error)
		require.Zero(t, records, "failed output must not become a ready edit receipt")
	})
	t.Run("caller-lookalike-media-is-not-trusted", func(t *testing.T) {
		var alternate map[string]any
		require.NoError(t, common.Unmarshal(raw, &alternate))
		_, sourceClips := studioTimelineDocument(alternate)
		sourceClips[0]["fadeIn"] = .7
		parameters, err := common.Marshal(map[string]any{"version": 1, "source_digest": actualOriginal.Digest, "start": 0., "end": 4., "speed": 1., "fade_in": .7, "fade_out": 1., "codec": "flac"})
		require.NoError(t, err)
		id := "audio-envelope-" + studioAnalysisID(string(parameters))
		_, err = SaveStudioMedia(1, id, "audio/flac", bytes.NewBufferString("Not an actual generated FLAC"))
		require.NoError(t, err)
		fakeRequest := request
		fakeRequest.RequestID = "fade-lookalike-plan"
		preview, _, err := CompileStudioRangeReplacement(alternate, fakeRequest, map[string]float64{"clip": 4}, 1, true)
		require.NoError(t, err)
		_, err = prepareStudioReplacementAudioEnvelope(t.Context(), project, alternate, preview, fakeRequest, map[string]float64{"clip": 4})
		require.ErrorContains(t, err, "different bytes")
	})
}
