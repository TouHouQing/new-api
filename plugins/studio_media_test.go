package plugins

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestStudioMediaWorkerValidationAndMappedModels(t *testing.T) {
	source, err := Source("studio-media")
	require.NoError(t, err)
	plugin, err := jsplugin.NewRegistry().RegisterFactory(source, jsplugin.Options{Key: "studio-media"})
	require.NoError(t, err)
	cases := []struct {
		name, model, action string
		seconds             any
		refs                []map[string]string
		rights, valid       bool
	}{
		{"music", "studio-music", "music", 2, nil, false, true},
		{"negative duration", "studio-music", "music", -1, nil, false, false},
		{"oversized duration", "studio-music", "music", 1e30, nil, false, false},
		{"model action mismatch", "studio-music", "lip_sync", 2, nil, false, false},
		{"voice without permission", "studio-voice-clone", "voice_clone", 2, []map[string]string{{"type": "audio", "url": "data:audio/mpeg;base64,YQ=="}}, false, false},
		{"permitted clone", "studio-voice-clone", "voice_clone", 2, []map[string]string{{"type": "audio", "url": "data:audio/mpeg;base64,YQ=="}}, true, true},
		{"lip sync missing audio", "studio-lip-sync", "lip_sync", 2, []map[string]string{{"type": "video", "url": "https://media.example/video.mp4"}}, false, false},
		{"image processing", "studio-image-bg-remove", "image_bg_remove", 1, []map[string]string{{"type": "image", "url": "data:image/png;base64,YQ=="}}, false, true},
		{"missing image", "studio-image-upscale", "image_upscale", 1, nil, false, false},
		{"audio separation", "studio-audio-separate", "audio_separate", 2, []map[string]string{{"type": "audio", "url": "data:audio/wav;base64,YQ=="}}, false, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := plugin.Engine.Call(t.Context(), "buildSubmitRequest", map[string]any{"model": "configured-alias", "upstreamModel": tc.model, "baseUrl": "https://worker.example", "apiKey": "fixture", "requestBody": map[string]any{"operation": tc.action, "seconds": tc.seconds, "prompt": "A scene", "references": tc.refs, "confirm_voice_rights": tc.rights}})
			if tc.valid {
				require.NoError(t, err)
			} else {
				require.Error(t, err)
			}
		})
	}
	value, err := plugin.Engine.Call(t.Context(), "extractUsageOnComplete", map[string]any{}, map[string]any{}, map[string]any{"seconds": 1e30})
	require.NoError(t, err)
	encoded, err := common.Marshal(value)
	require.NoError(t, err)
	assert.JSONEq(t, `{}`, string(encoded))
	value, err = plugin.Engine.Call(t.Context(), "extractUsage", map[string]any{"model": "studio-image-upscale", "requestBody": map[string]any{"operation": "image_upscale", "prompt": "", "seconds": 1, "references": []map[string]string{{"type": "image", "url": "data:image/png;base64,YQ=="}}}})
	require.NoError(t, err)
	encoded, err = common.Marshal(value)
	require.NoError(t, err)
	assert.JSONEq(t, `{"operations":1}`, string(encoded), "image processing is billed by operation, independently of the media-duration profile")
	_, err = plugin.Engine.Call(t.Context(), "buildSubmitRequest", map[string]any{"model": "studio-image-upscale", "requestBody": map[string]any{"operation": "image_upscale", "prompt": "", "seconds": 1, "options": map[string]any{"scale": 100000}, "references": []map[string]string{{"type": "image", "url": "data:image/png;base64,YQ=="}}}})
	require.Error(t, err)
	value, err = plugin.Engine.Call(t.Context(), "listArtifacts", map[string]any{"status": "SUCCESS", "data": map[string]any{"artifacts": []map[string]string{{"key": "output", "type": "audio", "mime_type": "audio/wav"}, {"key": "instrumental", "type": "audio", "mime_type": "audio/wav"}}}})
	require.NoError(t, err)
	encoded, err = common.Marshal(value)
	require.NoError(t, err)
	assert.JSONEq(t, `[{"key":"output","type":"audio","mimeType":"audio/wav"},{"key":"instrumental","type":"audio","mimeType":"audio/wav"}]`, string(encoded))
}

func TestLocalVideoProtocolAndDurationValidation(t *testing.T) {
	source, err := Source("local-video")
	require.NoError(t, err)
	plugin, err := jsplugin.NewRegistry().RegisterFactory(source, jsplugin.Options{Key: "local-video"})
	require.NoError(t, err)
	for _, seconds := range []any{-1, 0, 1e30, "NaN"} {
		_, err := plugin.Engine.Call(t.Context(), "extractUsage", map[string]any{"requestBody": map[string]any{"seconds": seconds}})
		require.Error(t, err)
	}
	for _, frames := range []any{4, 42, 245} {
		_, err := plugin.Engine.Call(t.Context(), "buildSubmitRequest", map[string]any{"requestBody": map[string]any{"seconds": 2, "metadata": map[string]any{"frames": frames}}})
		require.Error(t, err)
	}
	for _, fps := range []any{0, true, "12", 25} {
		_, err := plugin.Engine.Call(t.Context(), "buildSubmitRequest", map[string]any{"requestBody": map[string]any{"seconds": 2, "metadata": map[string]any{"fps": fps}}})
		require.Error(t, err)
	}
	value, err := plugin.Engine.Call(t.Context(), "buildSubmitRequest", map[string]any{"model": "local-alias", "upstreamModel": "wan2.2-ti2v-5b", "baseUrl": "http://127.0.0.1:13003", "requestBody": map[string]any{"seconds": 2, "input_reference": "data:image/png;base64,YQ==", "metadata": map[string]any{"frames": 41}}})
	require.NoError(t, err)
	encoded, err := common.Marshal(value)
	require.NoError(t, err)
	var request map[string]any
	require.NoError(t, common.Unmarshal(encoded, &request))
	assert.Equal(t, "http://127.0.0.1:13003/v1/videos", request["url"])
	assert.Equal(t, "wan2.2-ti2v-5b", request["body"].(map[string]any)["model"])
	assert.NotContains(t, request["headers"], "Authorization")
	value, err = plugin.Engine.Call(t.Context(), "extractUsageOnComplete", map[string]any{}, map[string]any{}, map[string]any{"seconds": 1e30})
	require.NoError(t, err)
	encoded, err = common.Marshal(value)
	require.NoError(t, err)
	assert.JSONEq(t, `{}`, string(encoded))
}
