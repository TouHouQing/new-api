package service

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/png"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func TestStudioProbeCanonicalStreamClockAndFallbacks(t *testing.T) {
	for _, item := range []struct {
		name     string
		input    string
		duration float64
		width    int
		rate     float64
		audio    bool
	}{
		{"fractional-ticks-before-rounded-stream-and-container", `{"format":{"duration":"2.084"},"streams":[{"codec_type":"video","width":640,"height":384,"duration_ts":25600,"time_base":"1/12288","duration":"2.083333","avg_frame_rate":"12/1"}]}`, 25. / 12, 640, 12, false},
		{"stream-duration-vfr-without-inventing-frame-clock", `{"format":{"duration":"2"},"streams":[{"codec_type":"video","width":320,"height":180,"duration":"1.75","nb_frames":"999","avg_frame_rate":"30/1"}]}`, 1.75, 320, 30, false},
		{"first-valid-video-not-cover-or-later-video-or-audio-tail", `{"format":{"duration":"99"},"streams":[{"codec_type":"video","width":32,"height":32,"duration":"99","disposition":{"attached_pic":1}},{"codec_type":"video","width":0,"height":0,"duration":"50"},{"codec_type":"video","width":320,"height":180,"duration":"1.5","avg_frame_rate":"30000/1001"},{"codec_type":"video","width":4096,"height":2160,"duration":"90"},{"codec_type":"audio","duration":"4"}]}`, 1.5, 320, 30000. / 1001, true},
		{"unavailable-stream-clock-container-fallback", `{"format":{"duration":"3.02"},"streams":[{"codec_type":"video","width":320,"height":180,"duration":"N/A","time_base":"1/0","avg_frame_rate":"0/0"}]}`, 3.02, 320, 0, false},
		{"audio-only-clock-with-cover", `{"format":{"duration":"2.1"},"streams":[{"codec_type":"video","width":32,"height":32,"duration":"99","disposition":{"attached_pic":1}},{"codec_type":"audio","duration_ts":96000,"time_base":"1/48000","duration":"2"}]}`, 2, 0, 0, true},
		{"audio-only-container-fallback", `{"format":{"duration":"2.1"},"streams":[{"codec_type":"audio","duration":"N/A"}]}`, 2.1, 0, 0, true},
	} {
		t.Run(item.name, func(t *testing.T) {
			probe, err := studioParseMediaProbe([]byte(item.input))
			require.NoError(t, err)
			require.InDelta(t, item.duration, probe.Duration, 1e-10)
			require.Equal(t, item.width, probe.Width)
			require.Equal(t, item.width > 0, probe.HasVideo)
			require.Equal(t, item.audio, probe.HasAudio)
			require.InDelta(t, item.rate, probe.FrameRate, 1e-10)
		})
	}
	for _, duration := range []string{"N/A", "NaN", "+Inf", "-1", "0", "3600.0001", "1e1000"} {
		t.Run("reject-container-"+duration, func(t *testing.T) {
			body, err := common.Marshal(map[string]any{"format": map[string]any{"duration": duration}})
			require.NoError(t, err)
			_, err = studioParseMediaProbe(body)
			require.ErrorContains(t, err, "media duration is invalid")
		})
	}
	_, err := studioParseMediaProbe([]byte(`{"format":{"duration":"1"},"streams":[{"codec_type":"video","width":64,"height":64,"duration_ts":9223372036854775807,"time_base":"1/1"}]}`))
	require.ErrorContains(t, err, "media duration is invalid")
}

func TestStudioProbeAndRenderIgnoreAttachedCover(t *testing.T) {
	if !StudioRenderAvailable() {
		t.Skip("FFmpeg and FFprobe are unavailable")
	}
	studioProductionFixture(t)
	work := t.TempDir()
	cover := image.NewRGBA(image.Rect(0, 0, 32, 32))
	for y := range 32 {
		for x := range 32 {
			cover.Set(x, y, color.RGBA{R: 255, A: 255})
		}
	}
	var coverBytes bytes.Buffer
	require.NoError(t, png.Encode(&coverBytes, cover))
	coverPath := filepath.Join(work, "cover.png")
	require.NoError(t, os.WriteFile(coverPath, coverBytes.Bytes(), 0600))
	source := filepath.Join(work, "with-cover.mp4")
	output, err := exec.CommandContext(t.Context(), studioFFmpegBinary(false), "-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=64x64:r=12:d=1", "-i", coverPath, "-map", "0:v:0", "-map", "1:v:0", "-c:v:0", "libx264", "-c:v:1", "png", "-disposition:v:1", "attached_pic", source).CombinedOutput()
	require.NoError(t, err, "%s", output)
	probeJSON, err := exec.CommandContext(t.Context(), studioFFmpegBinary(true), "-v", "error", "-show_streams", "-of", "json", source).Output()
	require.NoError(t, err)
	var metadata struct {
		Streams []struct {
			Disposition struct {
				AttachedPic int `json:"attached_pic"`
			} `json:"disposition"`
		} `json:"streams"`
	}
	require.NoError(t, common.Unmarshal(probeJSON, &metadata))
	require.Len(t, metadata.Streams, 2)
	require.Equal(t, 1, metadata.Streams[1].Disposition.AttachedPic)
	probe, err := ProbeStudioMedia(t.Context(), source)
	require.NoError(t, err)
	require.Equal(t, 64, probe.Width)
	require.Equal(t, 64, probe.Height)
	require.InDelta(t, 1, probe.Duration, .001)
	file, err := os.Open(source)
	require.NoError(t, err)
	_, err = SaveStudioMedia(1, "cover-source", "video/mp4", file)
	require.NoError(t, file.Close())
	require.NoError(t, err)
	document := `{"id":"cover-film","title":"Cover film","nodes":[{"id":"clip","data":{"kind":"video","mediaId":"cover-source"}}],"edges":[]}`
	project, err := model.SaveStudioProject(1, "cover-film", "Cover film", 0, document)
	require.NoError(t, err)
	end := .5
	plan := &StudioRenderPlan{Width: 64, Height: 64, FPS: 12, Clips: []StudioRenderClip{{NodeID: "clip", MediaID: "cover-source", End: &end, Speed: 1, Volume: 1}}}
	job, err := QueueStudioWorkflow(1, project.ID, "render-cover", "render", project.Revision, 0, nil, plan)
	require.NoError(t, err)
	StudioWorkflowRelay = func(context.Context, *model.StudioWorkflowJob, string, []byte) (StudioRelayResponse, error) {
		t.Fatal("cover selection rendering must not call a model")
		return StudioRelayResponse{}, nil
	}
	RunStudioWorkflowsOnce(t.Context(), "cover-renderer")
	require.NoError(t, model.DB.First(job, "id = ?", job.ID).Error)
	require.Equal(t, "succeeded", job.Status, job.Error)
	var result struct {
		MediaID string `json:"media_id"`
	}
	require.NoError(t, common.Unmarshal([]byte(job.Result), &result))
	media, err := GetStudioMedia(1, result.MediaID)
	require.NoError(t, err)
	path, err := StudioMediaPath(media)
	require.NoError(t, err)
	command := exec.CommandContext(t.Context(), studioFFmpegBinary(false), "-v", "error", "-ss", "0.25", "-i", path, "-map", "0:V:0", "-vf", "scale=1:1", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1")
	var stderr bytes.Buffer
	command.Stderr = &stderr
	pixel, err := command.Output()
	require.NoError(t, err, "%s", stderr.String())
	require.Len(t, pixel, 3)
	require.Greater(t, int(pixel[2]), int(pixel[0])+100, "actual delivery must contain the blue video, not its red cover")
}

func TestStudioProbeFractionalVideoReplacementAndLongerAudioTail(t *testing.T) {
	if _, err := exec.LookPath(studioFFmpegBinary(false)); err != nil {
		t.Skip("FFmpeg is unavailable")
	}
	if _, err := exec.LookPath(studioFFmpegBinary(true)); err != nil {
		t.Skip("FFprobe is unavailable")
	}
	work := t.TempDir()
	silentVideo := filepath.Join(work, "fractional-video.mp4")
	video := filepath.Join(work, "fractional.mp4")
	output, err := exec.CommandContext(t.Context(), studioFFmpegBinary(false), "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=64x64:rate=12", "-frames:v", "25", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-bf", "0", "-use_editlist", "0", "-video_track_timescale", "12288", silentVideo).CombinedOutput()
	require.NoError(t, err, "%s", output)
	// A 2.084-second audio stream makes the container end at 2.084 on both
	// FFprobe versions that round container durations and those that do not.
	output, err = exec.CommandContext(t.Context(), studioFFmpegBinary(false), "-v", "error", "-i", silentVideo, "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=2.084", "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", video).CombinedOutput()
	require.NoError(t, err, "%s", output)
	probe, err := ProbeStudioMedia(t.Context(), video)
	require.NoError(t, err)
	require.InDelta(t, 25./12, probe.Duration, 1e-10)
	containerJSON, err := exec.CommandContext(t.Context(), studioFFmpegBinary(true), "-v", "error", "-show_format", "-of", "json", video).Output()
	require.NoError(t, err)
	var container struct {
		Format struct {
			Duration string `json:"duration"`
		} `json:"format"`
	}
	require.NoError(t, common.Unmarshal(containerJSON, &container))
	containerDuration, err := strconv.ParseFloat(container.Format.Duration, 64)
	require.NoError(t, err)
	require.InDelta(t, 2.084, containerDuration, 1e-10)
	require.Greater(t, containerDuration, probe.Duration)

	document := studioReplacementDocument()
	production, clips := studioTimelineDocument(document)
	clips[0]["trimEnd"] = 20.
	clips[1]["trimStart"], clips[1]["trimEnd"], clips[1]["speed"] = 20., 30., 2.
	replacement := studioObjects(document, "nodes")[1]["data"].(map[string]any)
	rangeData := replacement["reworkRange"].(map[string]any)
	rangeData["start"], rangeData["end"] = 12., 16.
	production["audioTracks"] = []any{}
	next, _, err := CompileStudioRangeReplacement(document, StudioEditRequest{RequestID: "fractional-video", ClipID: "clip", ReplacementNodeID: "replacement", ReviewConfirmed: true}, nil, probe.Duration, true)
	require.NoError(t, err)
	_, nextClips := studioTimelineDocument(next)
	require.Len(t, nextClips, 4)
	require.Equal(t, "replacement", nextClips[1]["nodeId"])
	require.InDelta(t, 25./12, nextClips[1]["trimEnd"], 1e-10)
	require.InDelta(t, 25./24, nextClips[1]["speed"], 1e-10)
	require.LessOrEqual(t, nextClips[1]["trimEnd"].(float64), probe.Duration)
	total := 0.
	for _, clip := range nextClips {
		total += (clip["trimEnd"].(float64) - clip["trimStart"].(float64)) / clip["speed"].(float64)
	}
	require.InDelta(t, 15., total, 1e-10)

	withTail := filepath.Join(work, "long-audio-tail.mp4")
	output, err = exec.CommandContext(t.Context(), studioFFmpegBinary(false), "-v", "error", "-i", silentVideo, "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=4", "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", withTail).CombinedOutput()
	require.NoError(t, err, "%s", output)
	tailProbe, err := ProbeStudioMedia(t.Context(), withTail)
	require.NoError(t, err)
	require.True(t, tailProbe.HasAudio)
	require.InDelta(t, probe.Duration, tailProbe.Duration, 1e-10)

	audio := filepath.Join(work, "source.wav")
	output, err = exec.CommandContext(t.Context(), studioFFmpegBinary(false), "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1.25", "-c:a", "pcm_s16le", audio).CombinedOutput()
	require.NoError(t, err, "%s", output)
	audioProbe, err := ProbeStudioMedia(t.Context(), audio)
	require.NoError(t, err)
	require.False(t, audioProbe.HasVideo)
	require.True(t, audioProbe.HasAudio)
	require.InDelta(t, 1.25, audioProbe.Duration, 1e-10)
}
