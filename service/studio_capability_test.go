package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestStudioRuntimeCapabilityChecksRejectMissingWeightsAndFreezeConfiguration(t *testing.T) {
	ready, digest := true, "workflow-v1"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodGet, r.Method)
		require.Equal(t, "/studio-local/v1/capabilities", r.URL.Path)
		state := "ready"
		if !ready {
			state = "unavailable"
		}
		body, err := common.Marshal(map[string]any{"inferenceStarted": false, "profiles": []any{map[string]any{"modelId": "registered-model", "action": "video", "support": "supported", "readiness": state, "configurationDigest": digest}}})
		require.NoError(t, err)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	}))
	defer server.Close()
	t.Setenv("STUDIO_LOCAL_MODEL_URL", server.URL)
	t.Setenv("STUDIO_LOCAL_CAPABILITY_MODELS", "registered-model")
	doc := map[string]any{"nodes": []any{map[string]any{"id": "video", "data": map[string]any{"model": "registered-model", "kind": "video"}}}}
	first, err := StudioRuntimeCapabilitySnapshot(context.Background(), doc, []string{"video"})
	require.NoError(t, err)
	require.Equal(t, "workflow-v1", first["registered-model"])
	digest = "workflow-v2"
	second, err := StudioRuntimeCapabilitySnapshot(context.Background(), doc, []string{"video"})
	require.NoError(t, err)
	require.NotEqual(t, first, second)
	ready = false
	_, err = StudioRuntimeCapabilitySnapshot(context.Background(), doc, []string{"video"})
	require.ErrorContains(t, err, "missing")
	for _, endpoint := range []string{"https://public.example", "http://8.8.8.8", "http://user:pass@127.0.0.1", "http://127.0.0.1/?upstream=elsewhere"} {
		t.Setenv("STUDIO_LOCAL_MODEL_URL", endpoint)
		_, err := StudioCapabilityProfiles(context.Background())
		require.Error(t, err)
	}
}
