package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func TestStudioWorkflowViewKeepsNativeRecoveryTarget(t *testing.T) {
	job := &model.StudioWorkflowJob{ID: "failed-native", Kind: "transform", Status: "failed", Plan: `{"document":{},"node_ids":[],"operation":{"node_id":"edited-copy","action":"extract_audio"}}`, Result: `{}`}
	view := studioJobPayload(job)
	require.Equal(t, []string{"edited-copy"}, view["node_ids"])
	job.Plan = `{"document":{},"node_ids":["selected-shot"],"operation":{"node_id":"edited-copy"}}`
	require.Equal(t, []string{"selected-shot"}, studioJobPayload(job)["node_ids"])
}
