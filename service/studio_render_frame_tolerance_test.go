package service

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func TestStudioNormalSpeedAudioPreservesPCM(t *testing.T) {
	if !StudioRenderAvailable() {
		t.Skip("requires actual FFmpeg")
	}
	// A changing frequency exposes phase changes that a constant sine can hide.
	args := []string{"-v", "error", "-f", "lavfi", "-i", "aevalsrc=sin(2*PI*(220*t+170*t*t)):s=16000:d=2", "-f", "f32le", "-"}
	original, err := exec.Command(studioFFmpegBinary(false), args...).Output()
	require.NoError(t, err)
	args = append(args[:len(args)-3], "-af", studioTempoFilter(1), "-f", "f32le", "-")
	filtered, err := exec.Command(studioFFmpegBinary(false), args...).Output()
	require.NoError(t, err)
	require.True(t, bytes.Equal(original, filtered), "normal-speed rendering must not apply tempo processing")
}

func TestStudioDialogueRoundingUsesOneOutputFrameButRejectsActualOverrun(t *testing.T) {
	if !StudioRenderAvailable() {
		t.Skip("requires actual FFmpeg")
	}
	studioProductionFixture(t)
	previous := StudioWorkflowRelay
	StudioWorkflowRelay = func(context.Context, *model.StudioWorkflowJob, string, []byte) (StudioRelayResponse, error) {
		t.Fatal("render must not call inference")
		return StudioRelayResponse{}, nil
	}
	t.Cleanup(func() { StudioWorkflowRelay = previous })
	work := t.TempDir()
	for _, source := range []struct{ id, mime, filter string }{{"short-picture", "video/mp4", "testsrc2=size=96x64:rate=24:duration=0.708333"}, {"short-voice", "audio/wav", "sine=frequency=440:sample_rate=22050:duration=1"}} {
		path := filepath.Join(work, source.id+".mp4")
		if source.mime == "audio/wav" {
			path = filepath.Join(work, source.id+".wav")
		}
		args := []string{"-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", source.filter}
		if source.mime == "video/mp4" {
			args = append(args, "-frames:v", "17", "-c:v", "libx264", "-pix_fmt", "yuv420p")
		}
		output, err := exec.Command(studioFFmpegBinary(false), append(args, path)...).CombinedOutput()
		require.NoError(t, err, string(output))
		file, err := os.Open(path)
		require.NoError(t, err)
		_, err = SaveStudioMedia(1, source.id, source.mime, file)
		file.Close()
		require.NoError(t, err)
	}
	for i, length := range []float64{.72, .9} {
		id := fmt.Sprintf("rounding-%d", i)
		doc := fmt.Sprintf(`{"id":%q,"title":"Rounding","nodes":[{"id":"video","data":{"kind":"video","mediaId":"short-picture"}}],"shots":[{"id":"shot","videoNodeId":"video"}],"edges":[],"production":{"dialogueCues":[{"id":"cue","shotId":"shot","audioMediaId":"short-voice","offset":0,"duration":%g}]}}`, id, length)
		project, err := model.SaveStudioProject(1, id, "Rounding", 0, doc)
		require.NoError(t, err)
		job, err := QueueStudioWorkflow(1, id, id, "render", project.Revision, 0, nil, &StudioRenderPlan{Width: 96, Height: 64, FPS: 24, Clips: []StudioRenderClip{{NodeID: "video", MediaID: "short-picture", Speed: 1, Volume: 1}}})
		require.NoError(t, err)
		RunStudioWorkflowsOnce(t.Context(), "rounding-renderer")
		require.NoError(t, model.DB.First(job, "id = ?", job.ID).Error)
		if i == 0 {
			require.Equal(t, "succeeded", job.Status, job.Error)
		} else {
			require.Equal(t, "failed", job.Status)
			require.Contains(t, job.Error, "dialogue audio exceeds")
		}
	}
}
