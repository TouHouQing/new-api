package service

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"io"
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
