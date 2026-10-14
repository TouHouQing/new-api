package service

import (
	"bytes"
	"context"
	"encoding/binary"
	"fmt"
	"math"
	"os"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func TestStudioSoundPresetsProduceOwnedNonSilentWaveWithoutInference(t *testing.T) {
	studioProductionFixture(t)
	StudioWorkflowRelay = func(context.Context, *model.StudioWorkflowJob, string, []byte) (StudioRelayResponse, error) {
		t.Fatal("sound presets must not invoke a model")
		return StudioRelayResponse{}, nil
	}
	for index, preset := range []string{"rain", "wind", "footsteps", "whoosh", "impact", "notification"} {
		id := fmt.Sprintf("sound-test-%d", index)
		document := map[string]any{"id": id, "title": "Sound test", "nodes": []any{map[string]any{"id": "target", "data": map[string]any{"kind": "audio", "title": preset, "prompt": ""}}}, "edges": []any{}}
		studioCompleteTestDocument(t, document)
		raw, err := common.Marshal(document)
		require.NoError(t, err)
		project, err := model.SaveStudioProject(1, id, "Sound test", 0, string(raw))
		require.NoError(t, err)
		operation := &StudioMediaOperation{Action: "sound_preset", NodeID: "target", Prompt: preset, Seconds: 1}
		job, err := QueueStudioWorkflow(1, id, id, "transform", project.Revision, 0, nil, nil, operation)
		require.NoError(t, err)
		RunStudioWorkflowsOnce(context.Background(), "sound-test-worker")
		require.NoError(t, model.DB.First(job, "id = ?", job.ID).Error)
		require.Equal(t, "succeeded", job.Status, job.Error)
		require.Zero(t, job.TokenID)
		var progress StudioWorkflowProgress
		require.NoError(t, common.Unmarshal([]byte(job.Result), &progress))
		media, err := GetStudioMedia(1, progress.Take["mediaId"].(string))
		require.NoError(t, err)
		path, err := StudioMediaPath(media)
		require.NoError(t, err)
		wave, err := os.ReadFile(path)
		require.NoError(t, err)
		require.True(t, bytes.HasPrefix(wave, []byte("RIFF")))
		require.Equal(t, uint32(48000), binary.LittleEndian.Uint32(wave[24:28]))
		require.Len(t, wave, 44+48000*4)
		energy := 0.0
		for offset := 44; offset < len(wave); offset += 2 {
			sample := float64(int16(binary.LittleEndian.Uint16(wave[offset:offset+2]))) / 32768
			energy += sample * sample
			require.Less(t, math.Abs(sample), .96)
		}
		require.Greater(t, energy, 1.0, preset)
		recovered, err := QueueStudioWorkflow(1, id, id, "transform", project.Revision, 0, nil, nil, operation)
		require.NoError(t, err)
		require.Equal(t, job.ID, recovered.ID)
	}
}
