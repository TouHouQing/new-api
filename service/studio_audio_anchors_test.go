package service

import (
	"context"
	"encoding/binary"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func studioAudioAnchorFixture(t *testing.T) map[string]any {
	t.Helper()
	return map[string]any{"id": "anchor-film", "title": "Anchors", "nodes": []any{map[string]any{"id": "same-source", "data": map[string]any{"kind": "video", "mediaId": "video"}}}, "production": map[string]any{"timelineEdited": true, "timeline": []any{map[string]any{"id": "first", "nodeId": "same-source", "trimStart": 0.0, "trimEnd": 10.0, "speed": 2.0}, map[string]any{"id": "second", "nodeId": "same-source", "trimStart": 0.0, "trimEnd": 10.0, "speed": 1.0}}, "audioTracks": []any{map[string]any{"id": "effect", "mediaId": "sound", "start": 1.0, "offset": 7.0, "duration": 4.0, "volume": .8, "anchorKind": "source", "anchorClipId": "second", "anchorSourceStart": 2.0}, map[string]any{"id": "music", "mediaId": "song", "start": 3.0, "offset": 0.0, "volume": .5}}}}
}

func TestStudioAudioAnchorsFollowExactClipAndSplitAudioSourceWithoutMovingMusic(t *testing.T) {
	original := studioAudioAnchorFixture(t)
	durations := map[string]float64{"first": 10, "second": 10, "sound": 10, "song": 30}
	next, retained, err := CompileStudioTimelineCut(original, StudioEditRequest{RequestID: "cut-first", ClipID: "first", Ranges: []StudioSourceRange{{2, 4}}}, durations)
	require.NoError(t, err)
	require.NoError(t, CompileStudioAnchoredAudio(original, next, retained, durations))
	tracks := studioObjects(next["production"].(map[string]any), "audioTracks")
	require.Len(t, tracks, 2)
	assert.Equal(t, 6.0, tracks[0]["offset"])
	assert.Equal(t, "second", tracks[0]["anchorClipId"])
	assert.Equal(t, 1.0, tracks[0]["start"])
	assert.Equal(t, 4.0, tracks[0]["duration"])
	assert.Equal(t, 3.0, tracks[1]["start"])
	assert.Equal(t, 0.0, tracks[1]["offset"])
	assert.Equal(t, 7.0, studioObjects(original["production"].(map[string]any), "audioTracks")[0]["offset"], "input remains immutable")
	next, retained, err = CompileStudioTimelineCut(original, StudioEditRequest{RequestID: "cut-second", ClipID: "second", Ranges: []StudioSourceRange{{3, 4}}}, durations)
	require.NoError(t, err)
	require.NoError(t, CompileStudioAnchoredAudio(original, next, retained, durations))
	tracks = studioObjects(next["production"].(map[string]any), "audioTracks")
	require.Len(t, tracks, 3)
	assert.Equal(t, 7.0, tracks[0]["offset"])
	assert.Equal(t, 1.0, tracks[0]["start"])
	assert.Equal(t, 1.0, tracks[0]["duration"])
	assert.Equal(t, 8.0, tracks[1]["offset"])
	assert.Equal(t, 3.0, tracks[1]["start"])
	assert.Equal(t, 2.0, tracks[1]["duration"])
	assert.NotEqual(t, tracks[0]["anchorClipId"], tracks[1]["anchorClipId"])
	assert.NotEqual(t, tracks[0]["id"], tracks[1]["id"])
	assert.Equal(t, "music", tracks[2]["id"])
}

func TestStudioAudioAnchorsRejectMissingLockedAndOverflowWithoutPartialMutation(t *testing.T) {
	for _, kind := range []string{"missing", "locked", "overflow"} {
		t.Run(kind, func(t *testing.T) {
			original := studioAudioAnchorFixture(t)
			durations := map[string]float64{"first": 10, "second": 10, "sound": 10}
			next, retained, err := CompileStudioTimelineCut(original, StudioEditRequest{RequestID: "validation-cut", ClipID: "second", Ranges: []StudioSourceRange{{3, 4}}}, durations)
			require.NoError(t, err)
			production := original["production"].(map[string]any)
			if kind == "missing" {
				studioObjects(production, "audioTracks")[0]["anchorClipId"] = "other-instance"
			}
			if kind == "locked" {
				studioObjects(original, "nodes")[0]["data"].(map[string]any)["locked"] = true
			}
			if kind == "overflow" {
				for i := 1; i < 99; i++ {
					production["audioTracks"] = append(production["audioTracks"].([]any), map[string]any{"id": fmt.Sprintf("music-%d", i), "mediaId": "song", "start": 0.0, "offset": 0.0})
				}
			}
			before, err := common.Marshal(next)
			require.NoError(t, err)
			require.Error(t, CompileStudioAnchoredAudio(original, next, retained, durations))
			after, err := common.Marshal(next)
			require.NoError(t, err)
			assert.Equal(t, string(before), string(after))
		})
	}
}

func TestStudioDialogueTempoAndSourceAnchorMatchActualExport(t *testing.T) {
	if !StudioRenderAvailable() {
		t.Skip("requires actual FFmpeg")
	}
	studioProductionFixture(t)
	StudioWorkflowRelay = func(context.Context, *model.StudioWorkflowJob, string, []byte) (StudioRelayResponse, error) {
		t.Fatal("audio timing must not call a model")
		return StudioRelayResponse{}, nil
	}
	work := t.TempDir()
	for _, source := range []struct{ id, mime, file, filter string }{{"anchor-video", "video/mp4", "video.mp4", "testsrc2=size=96x64:rate=24:duration=5"}, {"anchor-voice", "audio/wav", "voice.wav", `aevalsrc=if(lt(t\,1)\,0.12*sin(2*PI*220*t)\,0.12*sin(2*PI*660*t)):s=22050:d=2`}} {
		path := filepath.Join(work, source.file)
		args := []string{"-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", source.filter}
		if source.mime == "video/mp4" {
			args = append(args, "-c:v", "libx264", "-pix_fmt", "yuv420p")
		}
		output, err := exec.Command(studioFFmpegBinary(false), append(args, path)...).CombinedOutput()
		require.NoError(t, err, string(output))
		file, err := os.Open(path)
		require.NoError(t, err)
		_, err = SaveStudioMedia(1, source.id, source.mime, file)
		file.Close()
		require.NoError(t, err)
	}
	document := `{"id":"anchor-export","title":"Dialogue tempo","nodes":[{"id":"video","data":{"kind":"video","mediaId":"anchor-video"}}],"shots":[{"id":"shot","videoNodeId":"video"}],"edges":[],"production":{"dialogueCues":[{"id":"cue","shotId":"shot","text":"Own timed dialogue","audioMediaId":"anchor-voice","offset":2,"duration":2}]}}`
	project, err := model.SaveStudioProject(1, "anchor-export", "Dialogue tempo", 0, document)
	require.NoError(t, err)
	end := 5.0
	job, err := QueueStudioWorkflow(1, project.ID, "anchor-tempo-render", "render", project.Revision, 0, nil, &StudioRenderPlan{Width: 96, Height: 64, FPS: 24, Fit: "letterbox", Clips: []StudioRenderClip{{ClipID: "instance", NodeID: "video", MediaID: "anchor-video", Start: 1, End: &end, Speed: 2, Volume: 1}}})
	require.NoError(t, err)
	RunStudioWorkflowsOnce(t.Context(), "anchor-renderer")
	require.NoError(t, model.DB.First(job, "id = ?", job.ID).Error)
	require.Equal(t, "succeeded", job.Status, job.Error)
	var result struct {
		MediaID   string              `json:"media_id"`
		Audio     []StudioRenderAudio `json:"audio"`
		Subtitles string              `json:"subtitles"`
	}
	require.NoError(t, common.Unmarshal([]byte(job.Result), &result))
	require.Len(t, result.Audio, 1)
	assert.InDelta(t, .5, result.Audio[0].Offset, 1e-6)
	assert.Equal(t, 2.0, result.Audio[0].Speed)
	assert.Equal(t, 2.0, *result.Audio[0].Duration)
	assert.Contains(t, result.Subtitles, "00:00:00,500 --> 00:00:01,500")
	media, err := GetStudioMedia(1, result.MediaID)
	require.NoError(t, err)
	path, err := StudioMediaPath(media)
	require.NoError(t, err)
	pcm, err := exec.Command(studioFFmpegBinary(false), "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", "8000", "-f", "s16le", "pipe:1").Output()
	require.NoError(t, err)
	measure := func(start, end, hz float64) float64 {
		real, imaginary := 0.0, 0.0
		for sample := int(start * 8000); sample < int(end*8000) && sample < len(pcm)/2; sample++ {
			value := float64(int16(binary.LittleEndian.Uint16(pcm[sample*2:])))
			phase := 2 * math.Pi * hz * float64(sample) / 8000
			real += value * math.Cos(phase)
			imaginary += value * math.Sin(phase)
		}
		return real*real + imaginary*imaginary
	}
	assert.Greater(t, measure(.65, .85, 220), measure(.65, .85, 660)*20)
	assert.Greater(t, measure(1.1, 1.3, 660), measure(1.1, 1.3, 220)*20)
	assert.Less(t, measure(.1, .3, 220), measure(.65, .85, 220)/1000)
	assert.Less(t, measure(1.65, 1.85, 660), measure(1.1, 1.3, 660)/1000)
	invalid := &StudioRenderPlan{Width: 96, Height: 64, FPS: 24, Clips: []StudioRenderClip{{MediaID: "anchor-video", Speed: 1, Volume: 1}}, Audio: []StudioRenderAudio{{MediaID: "anchor-voice", Speed: math.Inf(1)}}}
	require.ErrorContains(t, ValidateStudioRenderPlan(invalid), "playback speed")
}
