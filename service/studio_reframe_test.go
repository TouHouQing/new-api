package service

import (
	"bytes"
	"context"
	"image/png"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func TestStudioTrackingPlanRendersTheReviewedSourceTrajectory(t *testing.T) {
	if !StudioRenderAvailable() {
		t.Skip("requires actual FFmpeg")
	}
	studioProductionFixture(t)
	StudioWorkflowRelay = func(context.Context, *model.StudioWorkflowJob, string, []byte) (StudioRelayResponse, error) {
		t.Fatal("tracking render must not call a model")
		return StudioRelayResponse{}, nil
	}
	work := t.TempDir()
	sourcePath := filepath.Join(work, "bars.mp4")
	raw, err := exec.Command(studioFFmpegBinary(false), "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=320x180:r=24:d=2,drawbox=x=100:y=0:w=120:h=180:color=green:t=fill,drawbox=x=220:y=0:w=100:h=180:color=blue:t=fill", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", sourcePath).CombinedOutput()
	require.NoError(t, err, string(raw))
	file, err := os.Open(sourcePath)
	require.NoError(t, err)
	media, err := SaveStudioMedia(1, "tracking-source", "video/mp4", file)
	file.Close()
	require.NoError(t, err)
	document := map[string]any{"id": "tracking-film", "title": "Tracking", "nodes": []any{map[string]any{"id": "video", "data": map[string]any{"kind": "video", "prompt": "Fixture with explicit color bars", "mediaId": media.MediaID, "seconds": 2, "status": "completed"}}}, "edges": []any{}, "production": map[string]any{"documentVersion": 2, "timelineEdited": true, "timeline": []any{map[string]any{"id": "clip", "nodeId": "video", "trimStart": 0, "trimEnd": 2, "speed": 1, "volume": 1, "muted": false, "caption": "", "captionOffset": 0, "captionDuration": 0, "fadeIn": 0, "fadeOut": 0}}}}
	studioCompleteTestDocument(t, document)
	encoded, err := common.Marshal(document)
	require.NoError(t, err)
	project, err := model.SaveStudioProject(1, "tracking-film", "Tracking", 0, string(encoded))
	require.NoError(t, err)
	track := StudioTracking{Kind: "subject_track", TargetAspect: 100.0 / 180, Points: []StudioTrackingPoint{{Time: 0, Crop: StudioInspectROI{X: 0, Y: 0, Width: 100.0 / 320, Height: 1}, Confidence: .9}, {Time: 2, Crop: StudioInspectROI{X: 220.0 / 320, Y: 0, Width: 100.0 / 320, Height: 1}, Confidence: .9}}}
	analysis, err := SaveStudioAnalysisResult(1, project, "tracking-analysis", media.MediaID, track, []string{"Explicit synthetic test trajectory; not semantic model evidence."})
	require.NoError(t, err)
	plan, err := PrepareStudioEditPlan(context.Background(), 1, project.ID, StudioEditRequest{RequestID: "tracking-edit", Revision: project.Revision, Action: "apply_reframe", ClipID: "clip", AnalysisID: analysis.ID, Width: 100, Height: 180, ReviewConfirmed: true})
	require.NoError(t, err)
	project, _, err = model.ApplyStudioEditRecord(1, plan.ID, plan.Revision)
	require.NoError(t, err)
	end := 2.0
	render := &StudioRenderPlan{Width: 100, Height: 180, FPS: 24, Fit: "crop", Clips: []StudioRenderClip{{ClipID: "clip", TrackingID: analysis.ID, NodeID: "video", MediaID: media.MediaID, Start: 0, End: &end, Speed: 1, Volume: 1}}}
	job, err := QueueStudioWorkflow(1, project.ID, "tracking-render", "render", project.Revision, 0, nil, render)
	require.NoError(t, err)
	RunStudioWorkflowsOnce(context.Background(), "tracking-worker")
	require.NoError(t, model.DB.First(job, "id = ?", job.ID).Error)
	require.Equal(t, "succeeded", job.Status, job.Error)
	var result struct {
		MediaID string `json:"media_id"`
	}
	require.NoError(t, common.Unmarshal([]byte(job.Result), &result))
	output, err := GetStudioMedia(1, result.MediaID)
	require.NoError(t, err)
	path, err := StudioMediaPath(output)
	require.NoError(t, err)
	probe, err := ProbeStudioMedia(context.Background(), path)
	require.NoError(t, err)
	require.Equal(t, 100, probe.Width)
	require.Equal(t, 180, probe.Height)
	require.InDelta(t, 2, probe.Duration, .05)
	for _, sample := range []struct {
		Time    string
		Channel int
	}{{"0.05", 0}, {"1.9", 2}} {
		frame, err := exec.Command(studioFFmpegBinary(false), "-v", "error", "-ss", sample.Time, "-i", path, "-frames:v", "1", "-f", "image2pipe", "-c:v", "png", "-").Output()
		require.NoError(t, err)
		image, err := png.Decode(bytes.NewReader(frame))
		require.NoError(t, err)
		r, g, b, _ := image.At(50, 90).RGBA()
		channels := []uint32{r, g, b}
		require.Greater(t, channels[sample.Channel], uint32(50000), "the crop must follow the exact reviewed source positions")
	}
	// A low-confidence interval remains blocked until explicit manual source keys.
	track.Points[1].ReviewRequired = true
	track.Points[1].Confidence = 0
	bad, err := SaveStudioAnalysisResult(1, project, "tracking-lost", media.MediaID, track, []string{"Fixture occlusion"})
	require.NoError(t, err)
	_, err = studioReadTracking(1, project.ID, bad.ID, media.MediaID, media.Digest)
	require.Error(t, err)
	correction := StudioTrackingCorrection{RequestID: "tracking-corrected", Confirmed: true}
	require.NoError(t, common.Unmarshal([]byte(`[{"time":0,"x":0,"y":0},{"time":2,"x":0.6875,"y":0}]`), &correction.Keys))
	corrected, err := CorrectStudioTracking(1, project.ID, bad.ID, correction)
	require.NoError(t, err)
	resolved, err := studioReadTracking(1, project.ID, corrected.ID, media.MediaID, media.Digest)
	require.NoError(t, err)
	require.Zero(t, resolved.Points[1].Confidence)
	require.True(t, resolved.Points[1].Manual)
	_, err = CorrectStudioTracking(2, project.ID, bad.ID, correction)
	require.ErrorIs(t, err, model.ErrStudioAccess)
}
