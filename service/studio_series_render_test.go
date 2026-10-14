package service

import (
	"context"
	"encoding/binary"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestStudioActualRegionalDeliveriesKeepArchivedApprovedTakeAndReplaceSourceSpeech(t *testing.T) {
	if !StudioRenderAvailable() || os.Getenv("STUDIO_EDITORIAL_PYTHON") == "" {
		t.Skip("requires actual FFmpeg and editorial runtime")
	}
	studioProductionFixture(t)
	work := t.TempDir()
	video := filepath.Join(work, "source.mp4")
	output, err := exec.Command(studioFFmpegBinary(false), "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:size=320x180:rate=24", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "1", "-c:v", "libx264", "-c:a", "aac", video).CombinedOutput()
	require.NoError(t, err, string(output))
	file, err := os.Open(video)
	require.NoError(t, err)
	_, err = SaveStudioMedia(1, "regional-source", "video/mp4", file)
	file.Close()
	require.NoError(t, err)
	document := map[string]any{"id": "regional-film", "title": "Regional episodes", "nodes": []any{}, "edges": []any{}, "production": map[string]any{"requireApproved": true, "episodes": []any{map[string]any{"id": "episode", "title": "Episode", "synopsis": "", "shotIds": []any{}}}, "reviews": []any{map[string]any{"nodeId": "archived-video", "takeId": "approved-take", "mediaId": "regional-source", "status": "approved", "reviewerId": 1, "revision": 1, "reviewedAt": "2026-10-06T00:00:00Z", "note": "Approved frozen source"}}}}
	variants := []any{}
	plans := []*StudioRenderPlan{}
	end := 1.0
	for index, language := range []string{"en", "es"} {
		mediaID := "voice-" + language
		audioFile := filepath.Join(work, mediaID+".wav")
		frequency := 900 + index*300
		output, err = exec.Command(studioFFmpegBinary(false), "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency="+strconv.Itoa(frequency)+":sample_rate=48000", "-t", "1", audioFile).CombinedOutput()
		require.NoError(t, err, string(output))
		file, err = os.Open(audioFile)
		require.NoError(t, err)
		_, err = SaveStudioMedia(1, mediaID, "audio/wav", file)
		file.Close()
		require.NoError(t, err)
		variants = append(variants, map[string]any{"id": language, "episodeId": "episode", "title": "Episode " + language, "language": language, "region": language, "width": 320, "height": 180, "fps": 16, "fit": "letterbox", "subtitles": "", "timeline": []any{map[string]any{"id": "archived-clip", "nodeId": "archived-video", "takeId": "approved-take", "sourceMediaId": "regional-source", "sourceTitle": "Archived original", "trimStart": 0, "trimEnd": 1, "speed": 1, "volume": 1, "muted": true, "caption": "", "captionOffset": 0, "captionDuration": 0, "fadeIn": 0, "fadeOut": 0}}, "audioTracks": []any{map[string]any{"id": mediaID, "mediaId": mediaID, "start": 0, "offset": 0, "volume": 1}}})
		plans = append(plans, &StudioRenderPlan{VariantID: language, DeliveryLabel: "Episode " + language, Width: 320, Height: 180, FPS: 16, Fit: "letterbox", Package: true, SkipDialogue: true, RequireApproved: true, Clips: []StudioRenderClip{{NodeID: "archived-video", TakeID: "approved-take", MediaID: "regional-source", End: &end, Speed: 1, Volume: 1, Muted: true}}, Audio: []StudioRenderAudio{{MediaID: mediaID, Volume: 1}}})
	}
	document["production"].(map[string]any)["regionalVersions"] = variants
	studioCompleteTestDocument(t, document)
	raw, err := common.Marshal(document)
	require.NoError(t, err)
	project, err := model.SaveStudioProject(1, "regional-film", "Regional episodes", 0, string(raw))
	require.NoError(t, err)
	StudioWorkflowRelay = func(context.Context, *model.StudioWorkflowJob, string, []byte) (StudioRelayResponse, error) {
		t.Fatal("editorial language mix must not call a model")
		return StudioRelayResponse{}, nil
	}
	for index, plan := range plans {
		wrong := *plan
		wrong.DeliveryLabel = "A different version"
		assert.Error(t, ValidateStudioRegionalRender(document, &wrong))
		wrong = *plan
		wrong.SkipDialogue = false
		assert.Error(t, ValidateStudioRegionalRender(document, &wrong))
		wrong = *plan
		wrong.RequireApproved = false
		assert.Error(t, ValidateStudioRegionalRender(document, &wrong))
		job, err := QueueStudioWorkflow(1, project.ID, "regional-"+plan.VariantID, "render", project.Revision, 0, nil, plan)
		require.NoError(t, err)
		RunStudioWorkflowsOnce(t.Context(), "regional-renderer")
		require.NoError(t, model.DB.First(job, "id = ?", job.ID).Error)
		require.Equal(t, "succeeded", job.Status, job.Error)
		var result struct {
			MediaID   string `json:"media_id"`
			PackageID string `json:"package_media_id"`
			VariantID string `json:"variant_id"`
			Label     string `json:"delivery_label"`
		}
		require.NoError(t, common.Unmarshal([]byte(job.Result), &result))
		assert.Equal(t, plan.VariantID, result.VariantID)
		assert.Equal(t, plan.DeliveryLabel, result.Label)
		require.NotEmpty(t, result.PackageID)
		media, err := GetStudioMedia(1, result.MediaID)
		require.NoError(t, err)
		path, err := StudioMediaPath(media)
		require.NoError(t, err)
		pcm, err := exec.Command(studioFFmpegBinary(false), "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", "48000", "-f", "s16le", "pipe:1").Output()
		require.NoError(t, err)
		power := func(frequency float64) float64 {
			var real, imaginary float64
			for sample := range len(pcm) / 2 {
				value := float64(int16(binary.LittleEndian.Uint16(pcm[sample*2:])))
				phase := 2 * math.Pi * frequency * float64(sample) / 48000
				real += value * math.Cos(phase)
				imaginary += value * math.Sin(phase)
			}
			return math.Hypot(real, imaginary)
		}
		assert.Greater(t, power(float64(900+index*300)), power(440)*100, "the original embedded voice must be replaced by this version's audio")
		if proof := os.Getenv("STUDIO_TEST_SERIES_PROOF"); proof != "" {
			data, err := os.ReadFile(path)
			require.NoError(t, err)
			require.NoError(t, os.WriteFile(filepath.Join(proof, plan.VariantID+".mp4"), data, 0600))
		}
	}
}
