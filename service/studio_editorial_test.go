package service

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/binary"
	"fmt"
	"io"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestStudioVoicePriorityAndClosingCardUseActualMedia(t *testing.T) {
	if !StudioRenderAvailable() {
		t.Skip("requires actual FFmpeg")
	}
	studioProductionFixture(t)
	work := t.TempDir()
	for _, item := range []struct{ id, mime, suffix, source string }{
		{"mix-video", "video/mp4", ".mp4", "color=c=blue:size=320x180:rate=24:duration=4"},
		{"mix-music", "audio/wav", ".wav", "sine=frequency=180:sample_rate=48000:duration=4"},
		{"mix-voice", "audio/wav", ".wav", "sine=frequency=1800:sample_rate=48000:duration=2"},
	} {
		path := filepath.Join(work, item.id+item.suffix)
		args := []string{"-nostdin", "-y", "-v", "error", "-f", "lavfi", "-i", item.source}
		if item.suffix == ".mp4" {
			args = append(args, "-c:v", "libx264", "-pix_fmt", "yuv420p")
		}
		out, err := exec.Command(studioFFmpegBinary(false), append(args, path)...).CombinedOutput()
		require.NoError(t, err, string(out))
		file, err := os.Open(path)
		require.NoError(t, err)
		_, err = SaveStudioMedia(1, item.id, item.mime, file)
		file.Close()
		require.NoError(t, err)
	}
	project, err := model.SaveStudioProject(1, "mix-film", "Mix film", 0, `{"id":"mix-film","title":"Mix film","nodes":[{"id":"video","data":{"kind":"video","mediaId":"mix-video"}},{"id":"music","data":{"kind":"audio","mediaId":"mix-music"}},{"id":"voice","data":{"kind":"audio","mediaId":"mix-voice"}}],"edges":[],"shots":[{"id":"shot","title":"Shot","textNodeId":"text","imageNodeId":"image","videoNodeId":"video"}],"production":{"dialogueCues":[{"id":"cue","shotId":"shot","text":"Hello","offset":1,"audioMediaId":"mix-voice"}]}}`)
	require.NoError(t, err)
	plan := &StudioRenderPlan{Width: 180, Height: 320, FPS: 24, Fit: "crop", SafeArea: true,
		Clips:          []StudioRenderClip{{NodeID: "video", MediaID: "mix-video", Speed: 1, Volume: 1}},
		Audio:          []StudioRenderAudio{{MediaID: "mix-music", Volume: 0.6, Role: "music"}},
		AudioMix:       &StudioAudioMix{VoicePriority: true, MusicGain: .2, FadeOut: 1},
		MotionGraphics: []StudioMotionGraphic{{ID: "studio-brand-title", Kind: "text", Text: "CAFE 18", Start: 8, End: 10, X: .5, Y: .55, FontSize: 18, Color: "#ffffff", Animation: "fade", BPM: 90}},
	}
	job, err := QueueStudioWorkflow(1, project.ID, "mix-render", "render", project.Revision, 0, nil, plan)
	require.NoError(t, err)
	StudioWorkflowRelay = func(context.Context, *model.StudioWorkflowJob, string, []byte) (StudioRelayResponse, error) {
		t.Fatal("editing must not invoke a model")
		return StudioRelayResponse{}, nil
	}
	RunStudioWorkflowsOnce(t.Context(), "mix-renderer")
	require.NoError(t, model.DB.First(job, "id = ?", job.ID).Error)
	require.Equal(t, "succeeded", job.Status, job.Error)
	var result struct {
		MediaID   string `json:"media_id"`
		Subtitles string `json:"subtitles"`
	}
	require.NoError(t, common.Unmarshal([]byte(job.Result), &result))
	assert.Contains(t, result.Subtitles, "00:00:01,000 --> 00:00:03,000", "caption timing follows the real recorded voice even when cue.duration is absent")
	media, err := GetStudioMedia(1, result.MediaID)
	require.NoError(t, err)
	path, err := StudioMediaPath(media)
	require.NoError(t, err)
	probe, err := ProbeStudioMedia(t.Context(), path)
	require.NoError(t, err)
	assert.Equal(t, 180, probe.Width)
	assert.Equal(t, 320, probe.Height)
	assert.True(t, probe.HasAudio)
	assert.InDelta(t, 4, probe.Duration, .1)
	audioDuration, err := exec.Command(studioFFmpegBinary(true), "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=duration", "-of", "default=nw=1:nk=1", path).Output()
	require.NoError(t, err)
	audioSeconds, err := strconv.ParseFloat(strings.TrimSpace(string(audioDuration)), 64)
	require.NoError(t, err)
	assert.InDelta(t, 4, audioSeconds, .04, "encoded audio must reach the final frame")
	rms := func(start string) float64 {
		out, err := exec.Command(studioFFmpegBinary(false), "-v", "error", "-ss", start, "-i", path, "-t", "0.3", "-vn", "-af", "lowpass=f=300", "-ac", "1", "-f", "f32le", "pipe:1").Output()
		require.NoError(t, err)
		var sum float64
		for i := 0; i+4 <= len(out); i += 4 {
			sample := float64(math.Float32frombits(binary.LittleEndian.Uint32(out[i : i+4])))
			sum += sample * sample
		}
		return math.Sqrt(sum / float64(len(out)/4))
	}
	before, during, tail := rms("0.4"), rms("1.4"), rms("3.6")
	assert.Less(t, during, before*.35, "dialogue must duck the music in decoded audio")
	assert.Less(t, tail, before*.5, "the actual ending must fade out")
	whitePixels := func(at string) int {
		out, err := exec.Command(studioFFmpegBinary(false), "-v", "error", "-ss", at, "-i", path, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1").Output()
		require.NoError(t, err)
		count := 0
		for i := 0; i+3 <= len(out); i += 3 {
			if out[i] > 180 && out[i+1] > 180 && out[i+2] > 180 {
				count++
			}
		}
		return count
	}
	assert.Equal(t, 0, whitePixels("0.5"), "closing information must not appear at the beginning")
	assert.Greater(t, whitePixels("3"), 50, "closing card must follow the actual four-second film, not the ten-second plan")
}

func TestStudioFractionalEditorialCutsMatchActualFilmFrames(t *testing.T) {
	if !StudioRenderAvailable() || os.Getenv("STUDIO_EDITORIAL_PYTHON") == "" {
		t.Skip("requires actual FFmpeg and OpenTimelineIO runtime")
	}
	studioProductionFixture(t)
	work := t.TempDir()
	fixture := filepath.Join(work, "source.mp4")
	output, err := exec.Command(studioFFmpegBinary(false), "-nostdin", "-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24", "-t", "1", "-c:v", "libx264", fixture).CombinedOutput()
	require.NoError(t, err, string(output))
	file, err := os.Open(fixture)
	require.NoError(t, err)
	_, err = SaveStudioMedia(1, "fractional-source", "video/mp4", file)
	file.Close()
	require.NoError(t, err)
	project, err := model.SaveStudioProject(1, "fractional-film", "Fractional cuts", 0, `{"id":"fractional-film","title":"Fractional cuts","nodes":[{"id":"clip","data":{"kind":"video","mediaId":"fractional-source"}}],"edges":[]}`)
	require.NoError(t, err)
	end := .06
	plan := &StudioRenderPlan{Width: 320, Height: 180, FPS: 24, Package: true}
	for range 3 {
		plan.Clips = append(plan.Clips, StudioRenderClip{NodeID: "clip", MediaID: "fractional-source", End: &end, Speed: 1, Volume: 1})
	}
	job, err := QueueStudioWorkflow(1, project.ID, "fractional-render", "render", project.Revision, 0, nil, plan)
	require.NoError(t, err)
	StudioWorkflowRelay = func(context.Context, *model.StudioWorkflowJob, string, []byte) (StudioRelayResponse, error) {
		t.Fatal("editorial rendering must not call a model")
		return StudioRelayResponse{}, nil
	}
	RunStudioWorkflowsOnce(t.Context(), "fractional-renderer")
	require.NoError(t, model.DB.First(job, "id = ?", job.ID).Error)
	require.Equal(t, "succeeded", job.Status, job.Error)
	var result struct {
		MediaID       string    `json:"media_id"`
		PackageID     string    `json:"package_media_id"`
		ClipDurations []float64 `json:"clip_durations"`
	}
	require.NoError(t, common.Unmarshal([]byte(job.Result), &result))
	archive, err := GetStudioMedia(1, result.PackageID)
	require.NoError(t, err)
	archivePath, err := StudioMediaPath(archive)
	require.NoError(t, err)
	raw, err := os.ReadFile(archivePath)
	require.NoError(t, err)
	reader, err := zip.NewReader(bytes.NewReader(raw), int64(len(raw)))
	require.NoError(t, err)
	var editorial struct {
		Clips []struct {
			Frames int `json:"frames"`
		} `json:"clips"`
	}
	for _, entry := range reader.File {
		if entry.Name != "editorial-plan.json" && !strings.HasPrefix(entry.Name, "editorial/clip-") {
			continue
		}
		stream, err := entry.Open()
		require.NoError(t, err)
		data, err := io.ReadAll(stream)
		stream.Close()
		require.NoError(t, err)
		if entry.Name == "editorial-plan.json" {
			require.NoError(t, common.Unmarshal(data, &editorial))
		} else {
			require.NoError(t, os.WriteFile(filepath.Join(work, filepath.Base(entry.Name)), data, 0600))
		}
	}
	require.Len(t, editorial.Clips, 3)
	total := 0
	for index, clip := range editorial.Clips {
		path := filepath.Join(work, fmt.Sprintf("clip-%03d.mp4", index))
		output, err := exec.Command(studioFFmpegBinary(true), "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "default=nw=1:nk=1", path).Output()
		require.NoError(t, err)
		frames, err := strconv.Atoi(strings.TrimSpace(string(output)))
		require.NoError(t, err)
		assert.Equal(t, clip.Frames, frames, "the NLE must use the actual conformed clip frame count")
		assert.InDelta(t, float64(frames)/24, result.ClipDurations[index], .0001, "subtitles and audio must use the actual frame duration")
		total += frames
	}
	assert.Equal(t, 4, total, "fractional cuts must share cumulative frame rounding")
	film, err := GetStudioMedia(1, result.MediaID)
	require.NoError(t, err)
	filmPath, err := StudioMediaPath(film)
	require.NoError(t, err)
	output, err = exec.Command(studioFFmpegBinary(true), "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "default=nw=1:nk=1", filmPath).Output()
	require.NoError(t, err)
	frames, err := strconv.Atoi(strings.TrimSpace(string(output)))
	require.NoError(t, err)
	assert.Equal(t, total, frames, "film and editorial timeline must have the same cuts")
}

func TestStudioFinishingMediaReferencesSurviveLinking(t *testing.T) {
	refs := StudioMediaReferences(map[string]any{"production": map[string]any{"brandKit": map[string]any{"logoMediaId": "logo"}, "audioMix": map[string]any{"musicMediaIds": []any{"music"}}, "approvedKeyImages": map[string]any{"shot": "picture"}}})
	assert.Equal(t, map[string]bool{"logo": true, "music": true, "picture": true}, refs)
}

func TestStudioGenerationSnapshotRecordsActualSizeWithoutCredentials(t *testing.T) {
	snapshot := studioGenerationParameterSnapshot([]byte(`{"model":"wan2.2-ti2v-5b","size":"384x224","seconds":"4","metadata":{"resolution":"384x224","seed":0,"authorization":"private","content":[{"image_url":{"url":"https://private.example/?key=secret"}}]}}`))
	var values map[string]any
	require.NoError(t, common.Unmarshal([]byte(snapshot), &values))
	assert.Equal(t, "384x224", values["size"])
	assert.Equal(t, float64(0), values["seed"])
	assert.NotContains(t, snapshot, "private")
	assert.NotContains(t, snapshot, "secret")
}
