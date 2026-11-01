package service

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"math"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestStudioInspectWorkerRejectsPublicEndpointsAndRedirects(t *testing.T) {
	for _, endpoint := range []string{"", "https://127.0.0.1:13004", "http://example.com", "http://8.8.8.8", "http://169.254.169.254", "http://127.0.0.1:13004/path", "http://user:password@127.0.0.1:13004", "http://127.0.0.1:13004?target=other"} {
		t.Setenv("STUDIO_LOCAL_WORKER_URL", endpoint)
		_, err := studioInspectWorkerEndpoint()
		require.Error(t, err, endpoint)
	}
	for _, endpoint := range []string{"http://127.0.0.1:13004", "http://172.17.112.1:13004", "http://[::1]:13004", "http://localhost:13004"} {
		t.Setenv("STUDIO_LOCAL_WORKER_URL", endpoint)
		value, err := studioInspectWorkerEndpoint()
		require.NoError(t, err)
		assert.True(t, strings.HasSuffix(value, "/production-analysis"))
	}
	targetCalls := 0
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		targetCalls++
		w.Write([]byte(`{"kind":"audio_structure"}`))
	}))
	defer target.Close()
	redirect := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, target.URL, http.StatusTemporaryRedirect)
	}))
	defer redirect.Close()
	t.Setenv("STUDIO_LOCAL_WORKER_URL", redirect.URL)
	_, err := studioInspectWorker(t.Context(), "audio_structure", []byte("audio"), nil)
	require.ErrorContains(t, err, "redirects are forbidden")
	assert.Zero(t, targetCalls)

	worker := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/production-analysis", r.URL.Path)
		var body map[string]any
		require.NoError(t, common.DecodeJson(r.Body, &body))
		assert.Equal(t, "audio_structure", body["action"])
		assert.Equal(t, "YXVkaW8=", body["media"])
		w.Write([]byte(`{"kind":"audio_structure","beat_times":[0.5,1.0],"review_required":true}`))
	}))
	defer worker.Close()
	t.Setenv("STUDIO_LOCAL_WORKER_URL", worker.URL)
	value, err := studioInspectWorker(t.Context(), "audio_structure", []byte("audio"), nil)
	require.NoError(t, err)
	assert.Equal(t, []any{.5, 1.0}, value["beat_times"])
}

func studioInspectVideoFixture(t *testing.T) (*model.StudioProject, *model.StudioMedia, map[string]any) {
	t.Helper()
	if !StudioRenderAvailable() {
		t.Skip("configure FFmpeg and FFprobe for the real scene-analysis test")
	}
	studioProductionFixture(t)
	require.NoError(t, model.DB.AutoMigrate(&model.StudioProductionRecord{}))
	path := filepath.Join(t.TempDir(), "hard-cuts.mp4")
	output, err := exec.Command(studioFFmpegBinary(false), "-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", "color=black:s=96x64:r=24:d=1", "-f", "lavfi", "-i", "color=white:s=96x64:r=24:d=59", "-f", "lavfi", "-i", "color=black:s=96x64:r=24:d=1", "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0", "-c:v", "libx264", "-pix_fmt", "yuv420p", path).CombinedOutput()
	require.NoError(t, err, string(output))
	file, err := os.Open(path)
	require.NoError(t, err)
	media, err := SaveStudioMedia(1, "inspect-source", "video/mp4", file)
	file.Close()
	require.NoError(t, err)
	document := map[string]any{"id": "inspect-project", "title": "Analysis", "nodes": []any{map[string]any{"id": "video", "data": map[string]any{"kind": "video", "mediaId": media.MediaID, "takes": []any{map[string]any{"id": "take-1", "mediaId": media.MediaID, "status": "completed"}}}}}, "edges": []any{}}
	raw, err := common.Marshal(document)
	require.NoError(t, err)
	project, err := model.SaveStudioProject(1, "inspect-project", "Analysis", 0, string(raw))
	require.NoError(t, err)
	return project, media, document
}

func TestStudioInspectRealPTSCutsResumeAndImmutableSource(t *testing.T) {
	project, media, document := studioInspectVideoFixture(t)
	operation := &StudioMediaOperation{Action: "scene_detect", MediaID: media.MediaID, TakeID: "take-1", Inspect: &StudioInspectOptions{Start: 0, End: 61}}
	require.NoError(t, ValidateStudioInspect(1, document, operation))
	job := &model.StudioWorkflowJob{ID: strings.Repeat("j", 128), RequestID: "inspect-request", Kind: "inspect", Status: "running", UserID: 1, ProjectID: project.ID, Revision: project.Revision, LeaseOwner: "worker", Result: "{}"}
	require.NoError(t, model.DB.Create(job).Error)
	ctx, cancel := context.WithCancel(t.Context())
	require.NoError(t, model.DB.Callback().Update().After("gorm:update").Register("inspect_cancel_after_first", func(db *gorm.DB) {
		if db.Statement.Table == "studio_workflow_jobs" {
			cancel()
		}
	}))
	plan := &StudioWorkflowPlan{Document: document, Operation: operation}
	require.ErrorIs(t, RunStudioInspect(ctx, job, project, plan), context.Canceled)
	require.NoError(t, model.DB.Callback().Update().Remove("inspect_cancel_after_first"))
	firstID := studioInspectRecordID(job.ID, "chunk-0")
	first, err := model.ReadStudioProductionRecord(1, firstID, false)
	require.NoError(t, err)
	assert.LessOrEqual(t, len(firstID), 128)
	require.NoError(t, RunStudioInspect(t.Context(), job, project, plan))
	var result map[string]any
	require.NoError(t, common.Unmarshal([]byte(job.Result), &result))
	assert.Equal(t, "completed", result["phase"])
	assert.Equal(t, media.Digest, result["source_digest"])
	_, expanded, err := ReadStudioAnalysisResult(1, result["record_id"].(string))
	require.NoError(t, err)
	analysis := expanded["analysis"].(map[string]any)
	cuts := analysis["cuts"].([]any)
	require.Len(t, cuts, 2)
	assert.InDelta(t, 1, cuts[0].(map[string]any)["time"], 1.0/24)
	assert.InDelta(t, 60, cuts[1].(map[string]any)["time"], 1.0/24)
	var recordCount int64
	require.NoError(t, model.DB.Model(&model.StudioProductionRecord{}).Count(&recordCount).Error)
	assert.EqualValues(t, 3, recordCount)
	unchanged, err := model.ReadStudioProductionRecord(1, firstID, false)
	require.NoError(t, err)
	assert.Equal(t, first.UpdatedAt, unchanged.UpdatedAt)
	assert.Equal(t, first.Fingerprint, unchanged.Fingerprint)
	var current model.StudioProject
	require.NoError(t, model.DB.First(&current, "id = ?", project.ID).Error)
	assert.Equal(t, project.Document, current.Document)
	assert.Equal(t, project.Revision, current.Revision)
	previous := job.Result
	require.NoError(t, RunStudioInspect(t.Context(), job, project, plan))
	assert.Equal(t, previous, job.Result)

	path, err := StudioMediaPath(media)
	require.NoError(t, err)
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_APPEND, 0600)
	require.NoError(t, err)
	_, err = io.Copy(file, bytes.NewBufferString("changed source"))
	file.Close()
	require.NoError(t, err)
	require.ErrorContains(t, RunStudioInspect(t.Context(), job, project, plan), "immutable media digest")
}

func TestStudioInspectRejectsCrossProjectInvalidBoundsAndWrongTake(t *testing.T) {
	_, media, document := studioInspectVideoFixture(t)
	anchor := 1.0
	for index, op := range []*StudioMediaOperation{
		{Action: "scene_detect", MediaID: media.MediaID, Inspect: &StudioInspectOptions{End: 62}},
		{Action: "scene_detect", MediaID: media.MediaID, TakeID: "wrong-take", Inspect: &StudioInspectOptions{End: 1}},
		{Action: "scene_detect", MediaID: media.MediaID, Inspect: &StudioInspectOptions{Start: math.NaN(), End: 1}},
		{Action: "audio_structure", MediaID: media.MediaID, Inspect: &StudioInspectOptions{End: 1}},
		{Action: "subject_track", MediaID: media.MediaID, Inspect: &StudioInspectOptions{End: 1, ROI: &StudioInspectROI{X: .9, Width: .2, Height: .1}}},
		{Action: "subject_track", MediaID: media.MediaID, Inspect: &StudioInspectOptions{End: 1, ROI: &StudioInspectROI{Width: .2, Height: .1}, AnchorTime: &anchor}},
	} {
		t.Run(fmt.Sprint(index), func(t *testing.T) { require.Error(t, ValidateStudioInspect(1, document, op)) })
	}
	op := &StudioMediaOperation{Action: "scene_detect", MediaID: media.MediaID, Inspect: &StudioInspectOptions{End: 1}}
	require.ErrorContains(t, ValidateStudioInspect(1, map[string]any{"nodes": []any{}}, op), "in this project")
}

func TestStudioInspectUsesVFRPresentationTimeAfterSeeking(t *testing.T) {
	if !StudioRenderAvailable() {
		t.Skip("configure FFmpeg and FFprobe for VFR source timestamps")
	}
	path := filepath.Join(t.TempDir(), "vfr-cuts.mp4")
	output, err := exec.Command(studioFFmpegBinary(false), "-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", "color=black:s=96x64:r=24:d=1", "-f", "lavfi", "-i", "color=white:s=96x64:r=24:d=0.5", "-f", "lavfi", "-i", "color=black:s=96x64:r=24:d=0.5", "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0,setpts='if(lt(N,24),N/(24*TB),(1+(N-24)/12)/TB)'", "-fps_mode", "vfr", "-c:v", "libx264", "-pix_fmt", "yuv420p", path).CombinedOutput()
	require.NoError(t, err, string(output))
	result, err := studioInspectSceneChunk(t.Context(), path, 1.2, 2.8, .3)
	require.NoError(t, err)
	cuts := result["cuts"].([]any)
	require.Len(t, cuts, 1)
	assert.InDelta(t, 2, cuts[0].(map[string]any)["time"], 1.0/24, "the 36th source frame is at 2 seconds, not 36/24=1.5")
}

func TestStudioInspectRealCPUWorkerIntegration(t *testing.T) {
	python := os.Getenv("STUDIO_ANALYSIS_PYTHON")
	if python == "" || !StudioRenderAvailable() {
		t.Skip("set STUDIO_ANALYSIS_PYTHON and FFmpeg paths for the local CPU worker integration")
	}
	studioProductionFixture(t)
	require.NoError(t, model.DB.AutoMigrate(&model.StudioProductionRecord{}))
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	port := listener.Addr().(*net.TCPAddr).Port
	require.NoError(t, listener.Close())
	directory := t.TempDir()
	worker := exec.Command(python, filepath.Join("..", "scripts", "studio-local", "real_audio_worker.py"), "--directory", filepath.Join(directory, "worker"), "--ffmpeg", studioFFmpegBinary(false), "--port", fmt.Sprint(port))
	var logs bytes.Buffer
	worker.Stdout, worker.Stderr = &logs, &logs
	require.NoError(t, worker.Start())
	t.Cleanup(func() { _ = worker.Process.Kill(); _ = worker.Wait() })
	endpoint := fmt.Sprintf("http://127.0.0.1:%d", port)
	t.Setenv("STUDIO_LOCAL_WORKER_URL", endpoint)
	client := &http.Client{Timeout: 300 * time.Millisecond}
	ready := false
	deadline := time.NewTimer(10 * time.Second)
	defer deadline.Stop()
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()
	for !ready {
		select {
		case <-deadline.C:
			t.Fatal("local CPU worker did not become ready")
		case <-ticker.C:
			response, requestErr := client.Get(endpoint + "/health")
			if requestErr == nil {
				ready = response.StatusCode == 200
				response.Body.Close()
			}
		}
	}
	video := filepath.Join(directory, "video.mp4")
	output, err := exec.Command(studioFFmpegBinary(false), "-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=240x144:rate=24:duration=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", video).CombinedOutput()
	require.NoError(t, err, string(output))
	audio := filepath.Join(directory, "audio.wav")
	output, err = exec.Command(studioFFmpegBinary(false), "-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", `aevalsrc=if(lt(mod(t\,0.5)\,0.04)\,sin(2*PI*440*t)\,0):s=22050:d=12`, "-ac", "1", "-c:a", "pcm_s16le", audio).CombinedOutput()
	require.NoError(t, err, string(output))
	for _, item := range []struct{ id, path, mime string }{{"cpu-video", video, "video/mp4"}, {"cpu-audio", audio, "audio/wav"}} {
		file, err := os.Open(item.path)
		require.NoError(t, err)
		_, err = SaveStudioMedia(1, item.id, item.mime, file)
		file.Close()
		require.NoError(t, err)
	}
	document := map[string]any{"id": "cpu-project", "title": "CPU evidence", "nodes": []any{map[string]any{"id": "video", "data": map[string]any{"kind": "video", "mediaId": "cpu-video"}}, map[string]any{"id": "audio", "data": map[string]any{"kind": "audio", "mediaId": "cpu-audio"}}}, "edges": []any{}}
	raw, err := common.Marshal(document)
	require.NoError(t, err)
	project, err := model.SaveStudioProject(1, "cpu-project", "CPU evidence", 0, string(raw))
	require.NoError(t, err)
	anchor := 1.5
	for _, operation := range []*StudioMediaOperation{
		{Action: "audio_structure", MediaID: "cpu-audio", Inspect: &StudioInspectOptions{End: 12}},
		{Action: "subject_track", MediaID: "cpu-video", Inspect: &StudioInspectOptions{Start: .5, End: 2.5, ROI: &StudioInspectROI{X: .2, Y: .2, Width: .4, Height: .4}, AnchorTime: &anchor, TargetAspect: 9.0 / 16}},
	} {
		t.Run(operation.Action, func(t *testing.T) {
			job := &model.StudioWorkflowJob{ID: "cpu-" + operation.Action, RequestID: "request-" + operation.Action, ProjectID: project.ID, UserID: 1, Kind: "inspect", Status: "running", Revision: project.Revision, LeaseOwner: "cpu-worker", Result: "{}"}
			require.NoError(t, model.DB.Create(job).Error)
			require.NoError(t, RunStudioInspect(t.Context(), job, project, &StudioWorkflowPlan{Document: document, Operation: operation}))
			var compact map[string]any
			require.NoError(t, common.Unmarshal([]byte(job.Result), &compact))
			_, expanded, err := ReadStudioAnalysisResult(1, compact["record_id"].(string))
			require.NoError(t, err)
			analysis := expanded["analysis"].(map[string]any)
			if operation.Action == "audio_structure" {
				beats := analysis["beat_times"].([]any)
				assert.GreaterOrEqual(t, len(beats), 18)
				for _, value := range beats {
					seconds := value.(float64)
					assert.Less(t, math.Abs(seconds*2-math.Round(seconds*2))/2, .08)
				}
			} else {
				points := studioObjects(analysis, "points")
				require.Greater(t, len(points), 8)
				assert.GreaterOrEqual(t, points[0]["time"].(float64), .5)
				assert.Less(t, points[len(points)-1]["time"].(float64), 2.5)
				assert.Equal(t, "normalized_display", analysis["coordinate_space"])
				for _, point := range points {
					require.NotNil(t, point["roi"])
					require.NotNil(t, point["crop"])
					require.NotNil(t, point["review_required"])
				}
			}
			assert.Less(t, len(job.Result), 4096, "durable job keeps artifact pointers, not frame arrays")
		})
	}
	entries, err := os.ReadDir(filepath.Join(directory, "worker"))
	require.NoError(t, err)
	for _, entry := range entries {
		assert.False(t, strings.HasPrefix(entry.Name(), "production-analysis-") && entry.Name() != "production-analysis-cache", entry.Name())
	}
}
