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

func TestStudioBeatTimelineAlignsDistinctPacesWithoutRepeatingSourceRanges(t *testing.T) {
	evidence := StudioBeatEvidence{Kind: "audio_structure", Start: 0, End: 30, Sections: []StudioSongSection{{Start: 0, End: 15, Label: "Opening"}, {Start: 15, End: 30, Label: "Chorus"}}}
	for beat := 0.0; beat <= 30; beat += .5 {
		evidence.Beats = append(evidence.Beats, beat)
	}
	counts := []int{}
	for _, pace := range []string{"slow", "normal", "tight"} {
		sources := []studioEditorialSource{}
		for i := range 6 {
			sources = append(sources, studioEditorialSource{Clip: map[string]any{"id": fmt.Sprint(i), "nodeId": fmt.Sprint(i), "takeId": "exact-take", "caption": "Original label", "captionOffset": 1.0, "captionDuration": 1.0}, OriginalStart: float64(i) * 5, Start: 0, End: 5, Speed: 1, Cursor: 0})
		}
		request := StudioBeatPlanRequest{RequestID: "pace-" + pace, Pace: pace, Direction: "concept", Start: 0, End: 30}
		clips, retained, cuts, _, err := CompileStudioBeatTimeline(request, evidence, sources, 30)
		require.NoError(t, err, pace)
		counts = append(counts, len(clips))
		total := 0.0
		lastSourceEnds := map[string]float64{}
		for i, value := range clips {
			clip := value.(map[string]any)
			start, end := clip["trimStart"].(float64), clip["trimEnd"].(float64)
			id := fmt.Sprint(clip["nodeId"])
			assert.GreaterOrEqual(t, start, lastSourceEnds[id], "the same source frames must not be reused")
			assert.LessOrEqual(t, end, 5.000001)
			lastSourceEnds[id] = end
			total += end - start
			assert.InDelta(t, end-start, retained[i].End-retained[i].Start, .000001)
		}
		assert.InDelta(t, 30, total, .000001)
		for _, cut := range cuts {
			assert.LessOrEqual(t, cut["nearest_beat_distance"].(float64), 1.0/30+.000001)
		}
	}
	assert.Less(t, counts[0], counts[1])
	assert.Less(t, counts[1], counts[2])
}

func TestStudioBeatTimelineKeepsLockedDialogueAtItsProgramTimeAndRejectsShortFootage(t *testing.T) {
	evidence := StudioBeatEvidence{Kind: "audio_structure", Start: 0, End: 15}
	for beat := 0.0; beat <= 15; beat += .5 {
		evidence.Beats = append(evidence.Beats, beat)
	}
	sources := []studioEditorialSource{}
	for i := range 3 {
		sources = append(sources, studioEditorialSource{Clip: map[string]any{"id": fmt.Sprint(i), "nodeId": fmt.Sprint(i), "caption": "Keep dialogue"}, OriginalStart: float64(i) * 5, Start: 0, End: 5, Speed: 1, Cursor: 0, Protected: i == 1})
	}
	request := StudioBeatPlanRequest{RequestID: "protected", Pace: "tight", Direction: "concept", Start: 0, End: 15}
	clips, _, _, _, err := CompileStudioBeatTimeline(request, evidence, sources, 30)
	require.NoError(t, err)
	program := 0.0
	found := false
	for _, value := range clips {
		clip := value.(map[string]any)
		if clip["id"] == "1" {
			found = true
			assert.InDelta(t, 5, program, .000001)
			assert.Equal(t, 0.0, clip["trimStart"])
			assert.Equal(t, 5.0, clip["trimEnd"])
			assert.Equal(t, "Keep dialogue", clip["caption"])
		}
		program += clip["trimEnd"].(float64) - clip["trimStart"].(float64)
	}
	assert.True(t, found)
	request.End = 20
	_, _, _, _, err = CompileStudioBeatTimeline(request, evidence, sources, 30)
	require.ErrorContains(t, err, "not enough source footage")
	request.End = 8
	_, _, _, _, err = CompileStudioBeatTimeline(request, evidence, sources, 30)
	require.ErrorContains(t, err, "protected dialogue")
}

func TestStudioBeatCorrectionAndThirtySecondPlanPreserveMasterAndExport(t *testing.T) {
	if !StudioRenderAvailable() {
		t.Skip("requires real FFmpeg for the thirty-second MV flow")
	}
	studioProductionFixture(t)
	require.NoError(t, model.DB.AutoMigrate(&model.StudioProductionRecord{}))
	work := t.TempDir()
	for _, source := range []struct{ id, mime, name, filter string }{{"beat-video", "video/mp4", "source.mp4", "testsrc2=size=96x64:rate=24:duration=30"}, {"beat-song", "audio/wav", "song.wav", "sine=frequency=440:sample_rate=22050:duration=30"}} {
		path := filepath.Join(work, source.name)
		args := []string{"-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", source.filter}
		if source.mime == "video/mp4" {
			args = append(args, "-c:v", "libx264", "-pix_fmt", "yuv420p")
		}
		out, err := exec.Command(studioFFmpegBinary(false), append(args, path)...).CombinedOutput()
		require.NoError(t, err, string(out))
		file, err := os.Open(path)
		require.NoError(t, err)
		_, err = SaveStudioMedia(1, source.id, source.mime, file)
		file.Close()
		require.NoError(t, err)
	}
	document := map[string]any{"id": "beat-film", "title": "MV", "createdAt": "2026-10-18T00:00:00Z", "updatedAt": "2026-10-18T00:00:00Z", "edges": []any{}, "soundtrackMediaId": "beat-song", "soundtrackOffsetSeconds": 0.0, "soundtrackVolume": .6, "captionsText": "1\n00:00:01,000 --> 00:00:03,000\nActual song lyric\n", "nodes": []any{}, "production": map[string]any{"fps": 24, "timelineEdited": true, "timeline": []any{}}}
	production := document["production"].(map[string]any)
	for i := range 3 {
		id := fmt.Sprintf("source-%d", i)
		document["nodes"] = append(document["nodes"].([]any), map[string]any{"id": id, "type": "studio", "position": map[string]any{"x": i * 340, "y": 0}, "data": map[string]any{"kind": "video", "title": id, "prompt": "", "mediaId": "beat-video", "seconds": 30}})
		production["timeline"] = append(production["timeline"].([]any), map[string]any{"id": id, "nodeId": id, "trimStart": float64(i) * 10, "trimEnd": float64(i+1) * 10, "speed": 1.0, "muted": true})
	}
	raw, err := common.Marshal(document)
	require.NoError(t, err)
	project, err := model.SaveStudioProject(1, "beat-film", "MV", 0, string(raw))
	require.NoError(t, err)
	evidence := StudioBeatEvidence{Kind: "audio_structure", Start: 0, End: 30, Sections: []StudioSongSection{{Start: 0, End: 15, Label: "Opening"}, {Start: 15, End: 30, Label: "Chorus"}}}
	for beat := 0.0; beat <= 30; beat += .5 {
		evidence.Beats = append(evidence.Beats, beat)
	}
	_, err = SaveStudioAnalysisResult(1, project, "song-analysis", "beat-song", evidence, nil)
	require.NoError(t, err)
	correction, err := SaveStudioBeatCorrection(1, project.ID, StudioBeatCorrectionRequest{RequestID: "song-correction", AnalysisID: "song-analysis", Beats: evidence.Beats, Sections: evidence.Sections, ReviewConfirmed: true})
	require.NoError(t, err)
	_, saved, _, err := ReadStudioBeatEvidence(1, project.ID, correction.ID)
	require.NoError(t, err)
	assert.Equal(t, "song-analysis", saved.ParentID)
	_, err = SaveStudioBeatCorrection(1, project.ID, StudioBeatCorrectionRequest{RequestID: "bad-correction", AnalysisID: "song-analysis", Beats: []float64{1, .5}, ReviewConfirmed: true})
	require.Error(t, err)
	request := StudioBeatPlanRequest{RequestID: "beat-plan", Revision: project.Revision, AnalysisID: "song-analysis", CorrectionID: correction.ID, Pace: "normal", Direction: "concept", Start: 0, End: 30, ReviewConfirmed: true, LyricsFollowMusic: true}
	originalGrid := request
	originalGrid.RequestID, originalGrid.CorrectionID = "original-grid-plan", ""
	_, err = PrepareStudioBeatPlan(t.Context(), 1, project.ID, originalGrid)
	require.NoError(t, err, "a directly reviewed measured grid does not require a fabricated correction id")
	plan, err := PrepareStudioBeatPlan(t.Context(), 1, project.ID, request)
	require.NoError(t, err)
	var before model.StudioProject
	require.NoError(t, model.DB.First(&before, "id = ?", project.ID).Error)
	assert.Equal(t, project.Document, before.Document)
	applied, _, err := model.ApplyStudioEditRecord(1, plan.ID, project.Revision)
	require.NoError(t, err)
	var next map[string]any
	require.NoError(t, common.Unmarshal([]byte(applied.Document), &next))
	assert.Equal(t, "beat-song", next["soundtrackMediaId"])
	assert.Equal(t, .6, next["soundtrackVolume"])
	assert.Contains(t, next["captionsText"], "00:00:01,000 --> 00:00:03,000")
	_, clips := studioTimelineDocument(next)
	render := &StudioRenderPlan{Width: 96, Height: 64, FPS: 24, Fit: "letterbox", Audio: []StudioRenderAudio{{MediaID: "beat-song", Volume: .6}}, Subtitles: next["captionsText"].(string)}
	for _, clip := range clips {
		media, _, err := studioClipSource(1, next, clip)
		require.NoError(t, err)
		end := studioDocumentNumber(clip["trimEnd"], 0)
		render.Clips = append(render.Clips, StudioRenderClip{ClipID: clip["id"].(string), NodeID: clip["nodeId"].(string), TakeID: clip["takeId"].(string), MediaID: media.MediaID, Start: studioDocumentNumber(clip["trimStart"], 0), End: &end, Speed: 1, Muted: true, Volume: 1})
	}
	job, err := QueueStudioWorkflow(1, project.ID, "beat-render", "render", applied.Revision, 0, nil, render)
	require.NoError(t, err)
	StudioWorkflowRelay = func(context.Context, *model.StudioWorkflowJob, string, []byte) (StudioRelayResponse, error) {
		t.Fatal("beat editing/rendering must not call a model")
		return StudioRelayResponse{}, nil
	}
	RunStudioWorkflowsOnce(t.Context(), "beat-renderer")
	require.NoError(t, model.DB.First(job, "id = ?", job.ID).Error)
	require.Equal(t, "succeeded", job.Status, job.Error)
	var result struct {
		MediaID       string    `json:"media_id"`
		ClipDurations []float64 `json:"clip_durations"`
	}
	require.NoError(t, common.Unmarshal([]byte(job.Result), &result))
	output, err := GetStudioMedia(1, result.MediaID)
	require.NoError(t, err)
	outputPath, err := StudioMediaPath(output)
	require.NoError(t, err)
	probe, err := ProbeStudioMedia(t.Context(), outputPath)
	require.NoError(t, err)
	assert.InDelta(t, 30, probe.Duration, .05)
	assert.True(t, probe.HasAudio)
	assert.Equal(t, 96, probe.Width)
	program := 0.0
	for i, duration := range result.ClipDurations {
		program += duration
		if i == len(result.ClipDurations)-1 {
			break
		}
		nearest := math.Inf(1)
		for _, beat := range evidence.Beats {
			nearest = min(nearest, math.Abs(program-beat))
		}
		assert.LessOrEqual(t, nearest, 1.0/24+.000001)
	}
}

func TestStudioBeatNonzeroSongSourceUsesAudioStartNotProgramDelay(t *testing.T) {
	if !StudioRenderAvailable() {
		t.Skip("requires real FFmpeg")
	}
	studioProductionFixture(t)
	StudioWorkflowRelay = func(context.Context, *model.StudioWorkflowJob, string, []byte) (StudioRelayResponse, error) {
		t.Fatal("song segment render must not call a model")
		return StudioRelayResponse{}, nil
	}
	require.NoError(t, model.DB.AutoMigrate(&model.StudioProductionRecord{}))
	work := t.TempDir()
	for _, source := range []struct{ id, mime, name, filter string }{
		{"interval-video", "video/mp4", "video.mp4", "testsrc2=size=96x64:rate=24:duration=3"},
		{"interval-song", "audio/wav", "song.wav", `aevalsrc=if(lt(t\,2)\,0.12*sin(2*PI*220*t)\,0.12*sin(2*PI*880*t)):s=22050:d=4`},
	} {
		path := filepath.Join(work, source.name)
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
	document := map[string]any{"id": "interval-film", "title": "Own MV", "createdAt": "2026-10-18T00:00:00Z", "updatedAt": "2026-10-18T00:00:00Z", "edges": []any{}, "nodes": []any{}, "captionsText": "1\n00:00:02,500 --> 00:00:03,000\nOwn lyric in song time\n", "production": map[string]any{"fps": 24, "timelineEdited": true, "timeline": []any{}}}
	production := document["production"].(map[string]any)
	production["audioMix"] = map[string]any{"voicePriority": true, "musicGain": .2, "fadeOut": 0.0, "normalize": false, "musicMediaIds": []any{}}
	for i := range 3 {
		id := fmt.Sprintf("interval-clip-%d", i)
		document["nodes"] = append(document["nodes"].([]any), map[string]any{"id": id, "type": "studio", "position": map[string]any{"x": i * 340, "y": 0}, "data": map[string]any{"kind": "video", "title": id, "prompt": "", "mediaId": "interval-video", "seconds": 3}})
		production["timeline"] = append(production["timeline"].([]any), map[string]any{"id": id, "nodeId": id, "trimStart": float64(i), "trimEnd": float64(i + 1), "speed": 1.0, "muted": true})
	}
	document["nodes"] = append(document["nodes"].([]any), map[string]any{"id": "interval-music-node", "type": "studio", "position": map[string]any{"x": 0, "y": 300}, "data": map[string]any{"kind": "audio", "title": "Own song", "prompt": "", "mediaId": "interval-song"}})
	raw, err := common.Marshal(document)
	require.NoError(t, err)
	project, err := model.SaveStudioProject(1, "interval-film", "Own MV", 0, string(raw))
	require.NoError(t, err)
	evidence := StudioBeatEvidence{Kind: "audio_structure", Start: 0, End: 4, Beats: []float64{0, .5, 1, 1.5, 2, 2.5, 3, 3.5, 4}}
	_, err = SaveStudioAnalysisResult(1, project, "interval-analysis", "interval-song", evidence, nil)
	require.NoError(t, err)
	plan, err := PrepareStudioBeatPlan(t.Context(), 1, project.ID, StudioBeatPlanRequest{RequestID: "interval-plan", Revision: project.Revision, AnalysisID: "interval-analysis", Start: 2, End: 4, Pace: "normal", Direction: "narrative", ReviewConfirmed: true, LyricsFollowMusic: true})
	require.NoError(t, err)
	var payload struct {
		Next map[string]any `json:"next_document"`
	}
	require.NoError(t, common.Unmarshal([]byte(plan.Document), &payload))
	nextProduction, clips := studioTimelineDocument(payload.Next)
	tracks := studioObjects(nextProduction, "audioTracks")
	require.Len(t, tracks, 1)
	assert.Equal(t, 2.0, tracks[0]["start"])
	assert.Equal(t, 0.0, tracks[0]["offset"])
	assert.Empty(t, payload.Next["soundtrackMediaId"])
	assert.Contains(t, nextProduction["audioMix"].(map[string]any)["musicMediaIds"], "interval-song")
	assert.Contains(t, payload.Next["captionsText"], "00:00:00,500 --> 00:00:01,000")
	applied, _, err := model.ApplyStudioEditRecord(1, plan.ID, project.Revision)
	require.NoError(t, err)
	length := 2.0
	render := &StudioRenderPlan{Width: 96, Height: 64, FPS: 24, Fit: "letterbox", Audio: []StudioRenderAudio{{MediaID: tracks[0]["mediaId"].(string), Start: tracks[0]["start"].(float64), Offset: tracks[0]["offset"].(float64), Duration: &length, Volume: 1}}}
	for _, clip := range clips {
		media, _, err := studioClipSource(1, payload.Next, clip)
		require.NoError(t, err)
		end := clip["trimEnd"].(float64)
		render.Clips = append(render.Clips, StudioRenderClip{ClipID: clip["id"].(string), NodeID: clip["nodeId"].(string), TakeID: clip["takeId"].(string), MediaID: media.MediaID, Start: clip["trimStart"].(float64), End: &end, Speed: 1, Muted: true})
	}
	job, err := QueueStudioWorkflow(1, project.ID, "interval-render", "render", applied.Revision, 0, nil, render)
	require.NoError(t, err)
	RunStudioWorkflowsOnce(t.Context(), "interval-renderer")
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
	pcm, err := exec.Command(studioFFmpegBinary(false), "-v", "error", "-ss", "0.2", "-t", "0.5", "-i", path, "-vn", "-ac", "1", "-ar", "8000", "-f", "s16le", "pipe:1").Output()
	require.NoError(t, err)
	require.NotEmpty(t, pcm)
	power := func(hz float64) float64 {
		real, imaginary := 0.0, 0.0
		for sample := range len(pcm) / 2 {
			value := float64(int16(binary.LittleEndian.Uint16(pcm[sample*2:])))
			phase := 2 * math.Pi * hz * float64(sample) / 8000
			real += value * math.Cos(phase)
			imaginary += value * math.Sin(phase)
		}
		return real*real + imaginary*imaginary
	}
	assert.Greater(t, power(880), power(220)*100, "the film must start with the selected later song interval, not silence or its opening")
}

func TestStudioBeatSongReplacementRecutsPriorBeatFragments(t *testing.T) {
	// Reproduce the real UI flow: the first 120BPM draft already split two
	// continuous exact Takes; the replacement 90BPM song has a different grid.
	sources := []studioEditorialSource{}
	appendSource := func(id, node, take string, start, end, program float64, protected bool) {
		clip := map[string]any{"id": id, "nodeId": node, "takeId": take, "trimStart": start, "trimEnd": end, "speed": 1., "volume": 0., "muted": true, "caption": "", "captionOffset": 0., "captionDuration": end - start, "fadeIn": 0., "fadeOut": 0.}
		if node == "dialogue" {
			clip["muted"], clip["volume"], clip["caption"] = false, 1., "Keep the entire spoken sentence"
		}
		sources = append(sources, studioEditorialSource{Clip: clip, Media: &model.StudioMedia{MediaID: node + "-media", Digest: node + "-digest"}, Data: map[string]any{}, OriginalStart: program, Start: start, End: end, Speed: 1, Cursor: start, Protected: protected})
	}
	appendSource("a0", "a", "take-a", 0, 1.5, 0, false)
	appendSource("a1", "a", "take-a", 1.5, 3, 1.5, false)
	appendSource("a2", "a", "take-a", 3, 5, 3, false)
	appendSource("dialogue", "dialogue", "take-dialogue", 0, 3, 5, true)
	appendSource("b0", "b", "take-b", 10, 11.5, 8, false)
	appendSource("b1", "b", "take-b", 11.5, 13, 9.5, false)
	appendSource("b2", "b", "take-b", 13, 15, 11, false)
	appendSource("locked", "locked", "take-locked", 20, 22, 13, true)
	evidence := StudioBeatEvidence{Kind: "beat_correction", Start: 0, End: 15, Beats: []float64{0}}
	for i := 0; .5+float64(i)*2/3 < 15; i++ {
		evidence.Beats = append(evidence.Beats, .5+float64(i)*2/3)
	}
	for _, pace := range []string{"slow", "normal", "tight"} {
		clips, retained, cuts, _, err := CompileStudioBeatTimeline(StudioBeatPlanRequest{RequestID: "new-song-" + pace, Start: 0, End: 15, Pace: pace, Direction: "narrative"}, evidence, sources, 30)
		require.NoError(t, err, pace)
		program, last := 0., map[string]float64{"a": 0, "b": 10}
		for i, value := range clips {
			clip := value.(map[string]any)
			start, end := clip["trimStart"].(float64), clip["trimEnd"].(float64)
			switch clip["nodeId"] {
			case "a", "b":
				node := clip["nodeId"].(string)
				assert.InDelta(t, last[node], start, .000001, "never repeat or drop source frames")
				last[node] = end
			case "dialogue":
				assert.InDelta(t, 5, program, .000001)
				assert.Equal(t, sources[3].Clip, clip)
			case "locked":
				assert.InDelta(t, 13, program, .000001)
				assert.Equal(t, sources[7].Clip, clip)
			}
			assert.InDelta(t, end-start, retained[i].End-retained[i].Start, .000001)
			program += end - start
		}
		assert.InDelta(t, 15, program, .000001)
		assert.InDelta(t, 5, last["a"], .000001)
		assert.InDelta(t, 15, last["b"], .000001)
		for _, cut := range cuts {
			if cut["protected"] != true {
				assert.LessOrEqual(t, cut["nearest_beat_distance"].(float64), 1./30+.000001)
			}
		}
	}
}

func TestStudioBeatRecutRetainsEverySemanticSourceBoundary(t *testing.T) {
	base := func() []studioEditorialSource {
		result := []studioEditorialSource{}
		for i := range 2 {
			start, end := float64(i)*2, float64(i+1)*2
			result = append(result, studioEditorialSource{Clip: map[string]any{"id": fmt.Sprint(i), "nodeId": "exact-node", "takeId": "exact-take", "trimStart": start, "trimEnd": end, "speed": 2., "volume": .3, "muted": true, "caption": "", "fadeIn": 0., "fadeOut": 0.}, Media: &model.StudioMedia{MediaID: "exact-media", Digest: "exact-digest"}, Data: map[string]any{}, Start: start, End: end, Cursor: start, Speed: 2, OriginalStart: float64(i)})
		}
		return result
	}
	plain := base()
	joined := studioEditorialRecutSources(plain)
	require.Len(t, joined, 1)
	assert.Equal(t, 4., joined[0].End)
	assert.Equal(t, 2., plain[0].End, "compilation never mutates input source bookkeeping")
	assert.Equal(t, 2., plain[0].Clip["trimEnd"], "compilation never mutates the original clip")
	cases := map[string]func([]studioEditorialSource){
		"different occurrence node": func(s []studioEditorialSource) { s[1].Clip["nodeId"] = "other-node" },
		"different exact Take":      func(s []studioEditorialSource) { s[1].Clip["takeId"] = "other-take" },
		"no exact Take":             func(s []studioEditorialSource) { delete(s[1].Clip, "takeId") },
		"different media":           func(s []studioEditorialSource) { s[1].Media.MediaID = "other-media" },
		"changed digest":            func(s []studioEditorialSource) { s[1].Media.Digest = "other-digest" },
		"gap in source":             func(s []studioEditorialSource) { s[1].Start, s[1].Cursor = 2.1, 2.1 },
		"overlap repeated source":   func(s []studioEditorialSource) { s[1].Start, s[1].Cursor = 1.9, 1.9 },
		"gap in program":            func(s []studioEditorialSource) { s[1].OriginalStart = 1.1 },
		"different speed":           func(s []studioEditorialSource) { s[1].Speed = 1 },
		"different volume":          func(s []studioEditorialSource) { s[1].Clip["volume"] = .4 },
		"different mute":            func(s []studioEditorialSource) { s[1].Clip["muted"] = false },
		"caption":                   func(s []studioEditorialSource) { s[1].Clip["caption"] = "Preserve words" },
		"fade in":                   func(s []studioEditorialSource) { s[1].Clip["fadeIn"] = .25 },
		"fade out":                  func(s []studioEditorialSource) { s[0].Clip["fadeOut"] = .25 },
		"locked node":               func(s []studioEditorialSource) { s[1].Data["locked"] = true },
		"locked clip":               func(s []studioEditorialSource) { s[1].Clip["locked"] = true },
		"protected program window":  func(s []studioEditorialSource) { s[1].Protected = true },
		"reframe or graphic anchor": func(s []studioEditorialSource) { s[1].KeepBoundary = true },
		"future unknown clip field": func(s []studioEditorialSource) { s[1].Clip["futureEffect"] = true },
	}
	for name, change := range cases {
		t.Run(name, func(t *testing.T) {
			sources := base()
			change(sources)
			require.Len(t, studioEditorialRecutSources(sources), 2)
		})
	}
}

func TestStudioBeatReplacementPreparePreservesAttachedAudioAndNodeLocks(t *testing.T) {
	if !StudioRenderAvailable() {
		t.Skip("requires actual CPU FFmpeg source probes")
	}
	studioProductionFixture(t)
	require.NoError(t, model.DB.AutoMigrate(&model.StudioProductionRecord{}))
	for _, source := range []struct{ id, mime, filter, suffix string }{
		{"recut-video", "video/mp4", "testsrc2=s=96x64:r=12:d=6", ".mp4"},
		{"recut-song", "audio/wav", "sine=f=220:r=16000:d=6", ".wav"},
		{"recut-voice", "audio/wav", "sine=f=880:r=16000:d=2", ".wav"},
	} {
		path := filepath.Join(t.TempDir(), source.id+source.suffix)
		args := []string{"-v", "error", "-f", "lavfi", "-i", source.filter}
		if source.suffix == ".mp4" {
			args = append(args, "-c:v", "libx264", "-pix_fmt", "yuv420p")
		}
		output, err := exec.Command(studioFFmpegBinary(false), append(args, path)...).CombinedOutput()
		require.NoError(t, err, string(output))
		file, err := os.Open(path)
		require.NoError(t, err)
		_, err = SaveStudioMedia(1, source.id, source.mime, file)
		require.NoError(t, file.Close())
		require.NoError(t, err)
	}
	for _, protection := range []string{"plain", "attached", "node-lock"} {
		t.Run(protection, func(t *testing.T) {
			id := "recut-" + protection
			document := map[string]any{"id": id, "title": id, "createdAt": "2026-10-18T00:00:00Z", "updatedAt": "2026-10-18T00:00:00Z", "edges": []any{}, "nodes": []any{}, "soundtrackMediaId": "recut-song", "soundtrackOffsetSeconds": 0., "soundtrackVolume": .2}
			for _, node := range []string{"a", "b", "locked"} {
				document["nodes"] = append(document["nodes"].([]any), map[string]any{"id": node, "type": "studio", "position": map[string]any{"x": 0, "y": 0}, "data": map[string]any{"kind": "video", "title": node, "prompt": "Owned CPU source", "mediaId": "recut-video", "locked": node == "locked" || protection == "node-lock" && node == "a", "takes": []any{map[string]any{"id": node + "-take", "createdAt": "2026-10-18T00:00:00Z", "status": "completed", "sourceMode": "upload", "prompt": "Owned CPU source", "mediaId": "recut-video"}}}})
			}
			clips := []any{}
			for i := range 6 {
				node := "b"
				if i < 2 {
					node = "a"
				} else if i == 2 {
					node = "locked"
				}
				clips = append(clips, map[string]any{"id": fmt.Sprintf("clip-%d", i), "nodeId": node, "takeId": node + "-take", "trimStart": float64(i), "trimEnd": float64(i + 1), "speed": 1., "volume": 0., "muted": true, "caption": "", "fadeIn": 0., "fadeOut": 0.})
			}
			production := map[string]any{"documentVersion": 2, "fps": 30, "timelineEdited": true, "timeline": clips, "audioTracks": []any{}}
			document["production"] = production
			if protection == "attached" {
				production["audioTracks"] = []any{map[string]any{"id": "attached-speech", "mediaId": "recut-voice", "start": 0., "offset": 1.25, "duration": .5, "volume": .3, "speed": 2., "anchorKind": "clip", "anchorClipId": "clip-1", "anchorSourceStart": .25}}
			}
			raw, err := common.Marshal(document)
			require.NoError(t, err)
			project, err := model.SaveStudioProject(1, id, id, 0, string(raw))
			require.NoError(t, err)
			evidence := StudioBeatEvidence{Kind: "audio_structure", Start: 0, End: 6, Beats: []float64{0}}
			for i := 0; .5+float64(i)*2/3 < 6; i++ {
				evidence.Beats = append(evidence.Beats, .5+float64(i)*2/3)
			}
			_, err = SaveStudioAnalysisResult(1, project, id+"-analysis", "recut-song", evidence, nil)
			require.NoError(t, err)
			plan, err := PrepareStudioBeatPlan(t.Context(), 1, id, StudioBeatPlanRequest{RequestID: id + "-plan", Revision: project.Revision, AnalysisID: id + "-analysis", Start: 0, End: 6, Pace: "normal", Direction: "narrative", ReviewConfirmed: true})
			require.NoError(t, err)
			var payload map[string]any
			require.NoError(t, common.Unmarshal([]byte(plan.Document), &payload))
			next := payload["next_document"].(map[string]any)
			nextProduction, nextClips := studioTimelineDocument(next)
			if protection == "attached" {
				assert.Equal(t, production["audioTracks"], nextProduction["audioTracks"])
			}
			program := 0.
			for _, clip := range nextClips {
				if clip["id"] == "clip-2" {
					assert.InDelta(t, 2, program, .000001)
				}
				if protection == "attached" && clip["id"] == "clip-1" {
					assert.InDelta(t, 1, program, .000001)
					assert.Equal(t, 1., clip["trimStart"])
					assert.Equal(t, 2., clip["trimEnd"])
				}
				program += (clip["trimEnd"].(float64) - clip["trimStart"].(float64)) / clip["speed"].(float64)
			}
			assert.InDelta(t, 6, program, .000001)
			unchanged, _, err := model.StudioProjectAccess(model.DB, 1, id, false)
			require.NoError(t, err)
			assert.Equal(t, project.Revision, unchanged.Revision, "preparing never applies the proposed cut")
		})
	}
}
