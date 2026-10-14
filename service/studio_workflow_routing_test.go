package service

import (
	"context"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestStudioNativeJobsDoNotClaimQueuedModelWork(t *testing.T) {
	studioProductionFixture(t)
	document := map[string]any{"id": "native-routing", "title": "Film", "nodes": []any{map[string]any{"id": "script", "data": map[string]any{"kind": "text", "prompt": "A film", "model": "mock-text"}}}, "edges": []any{}}
	studioCompleteTestDocument(t, document)
	raw, err := common.Marshal(document)
	require.NoError(t, err)
	project, err := model.SaveStudioProject(1, "native-routing", "Film", 0, string(raw))
	require.NoError(t, err)
	generation, err := QueueStudioWorkflow(1, project.ID, "first-model", "generate", project.Revision, 25000, []string{"script"}, nil)
	require.NoError(t, err)
	quality, err := QueueStudioWorkflow(1, project.ID, "later-quality", "quality", project.Revision, 0, nil, nil)
	require.NoError(t, err)
	calls := 0
	StudioWorkflowRelay = func(context.Context, *model.StudioWorkflowJob, string, []byte) (StudioRelayResponse, error) {
		calls++
		return StudioRelayResponse{}, nil
	}
	native := false
	runStudioWorkflowsOnce(t.Context(), "native-worker", &native)
	require.NoError(t, model.DB.First(generation, "id = ?", generation.ID).Error)
	require.NoError(t, model.DB.First(quality, "id = ?", quality.ID).Error)
	assert.Zero(t, calls)
	assert.Equal(t, "queued", generation.Status)
	assert.Contains(t, []string{"succeeded", "failed"}, quality.Status)
}
