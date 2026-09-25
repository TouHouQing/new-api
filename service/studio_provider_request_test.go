package service

import (
	"bytes"
	"context"
	"encoding/base64"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type studioRoundTripFunc func(*http.Request) (*http.Response, error)

func (fn studioRoundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return fn(request)
}

func studioTestProvider(t *testing.T, kind string) *model.StudioProvider {
	t.Helper()
	t.Setenv("STUDIO_PROVIDER_ENCRYPTION_KEY", base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{0x67}, 32)))
	ciphertext, err := EncryptStudioProviderKey(12, kind, "sk-private-test")
	require.NoError(t, err)
	return &model.StudioProvider{UserID: 12, Kind: kind, BaseURL: "https://api.example.com/v1", EncryptedAPIKey: ciphertext}
}

func studioResponse(status int, body string) *http.Response {
	return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}
}

func TestStudioProviderModelsUseSavedKeyAndReturnIDs(t *testing.T) {
	provider := studioTestProvider(t, "text")
	client := &http.Client{Transport: studioRoundTripFunc(func(request *http.Request) (*http.Response, error) {
		assert.Equal(t, http.MethodGet, request.Method)
		assert.Equal(t, "https://api.example.com/v1/models", request.URL.String())
		assert.Equal(t, "Bearer sk-private-test", request.Header.Get("Authorization"))
		return studioResponse(http.StatusOK, `{"data":[{"id":"gpt-text"},{"id":"gpt-text"},{"id":"image-one"},{"name":"invalid"}]}`), nil
	})}
	models, err := FetchStudioProviderModels(context.Background(), provider, client)
	require.NoError(t, err)
	assert.Equal(t, []string{"gpt-text", "image-one"}, models)
}

func TestStudioProviderGenerationUsesFixedCompatiblePaths(t *testing.T) {
	textProvider := studioTestProvider(t, "text")
	imageProvider := studioTestProvider(t, "image")
	client := &http.Client{Transport: studioRoundTripFunc(func(request *http.Request) (*http.Response, error) {
		assert.Equal(t, "Bearer sk-private-test", request.Header.Get("Authorization"))
		body, err := io.ReadAll(request.Body)
		require.NoError(t, err)
		assert.NotContains(t, string(body), "sk-private-test")
		switch request.URL.Path {
		case "/v1/chat/completions":
			assert.Contains(t, string(body), `"model":"gpt-text"`)
			return studioResponse(http.StatusOK, `{"choices":[{"message":{"content":"A good scene"}}]}`), nil
		case "/v1/images/generations":
			assert.Contains(t, string(body), `"model":"image-one"`)
			return studioResponse(http.StatusOK, `{"data":[{"url":"https://cdn.example.com/frame.png"}]}`), nil
		default:
			t.Fatalf("unexpected upstream path: %s", request.URL.Path)
			return nil, nil
		}
	})}
	text, err := GenerateStudioProviderText(context.Background(), textProvider, "gpt-text", "scene", client)
	require.NoError(t, err)
	assert.Equal(t, "A good scene", text)
	imageURL, err := GenerateStudioProviderImage(context.Background(), imageProvider, "image-one", "frame", client)
	require.NoError(t, err)
	assert.Equal(t, "https://cdn.example.com/frame.png", imageURL)
}

func TestStudioProviderTextAcceptsChatContentParts(t *testing.T) {
	provider := studioTestProvider(t, "text")
	client := &http.Client{Transport: studioRoundTripFunc(func(*http.Request) (*http.Response, error) {
		return studioResponse(http.StatusOK, `{"choices":[{"message":{"role":"assistant","content":[{"type":"text","text":"First scene. "},{"type":"text","text":"Then the reveal."}]},"finish_reason":"stop"}]}`), nil
	})}
	text, err := GenerateStudioProviderText(context.Background(), provider, "text-model", "scene", client)
	require.NoError(t, err)
	assert.Equal(t, "First scene. Then the reveal.", text)
}

func TestStudioProviderTextDoesNotMistakeToolCallsForText(t *testing.T) {
	provider := studioTestProvider(t, "text")
	client := &http.Client{Transport: studioRoundTripFunc(func(*http.Request) (*http.Response, error) {
		return studioResponse(http.StatusOK, `{"choices":[{"message":{"content":null,"tool_calls":[{"function":{"arguments":"sk-private-test"}}]},"finish_reason":"tool_calls"}]}`), nil
	})}
	_, err := GenerateStudioProviderText(context.Background(), provider, "text-model", "scene", client)
	require.Error(t, err)
	assert.ErrorContains(t, err, "tool calls")
	assert.NotContains(t, err.Error(), "sk-private-test")
}

func TestStudioProviderTextReportsSuccessStatusErrorEnvelopeWithoutLeakingIt(t *testing.T) {
	provider := studioTestProvider(t, "text")
	client := &http.Client{Transport: studioRoundTripFunc(func(*http.Request) (*http.Response, error) {
		return studioResponse(http.StatusOK, `{"error":{"code":"quota_exceeded","message":"sk-private-test quota exhausted"}}`), nil
	})}
	_, err := GenerateStudioProviderText(context.Background(), provider, "text-model", "scene", client)
	require.Error(t, err)
	assert.ErrorContains(t, err, "error response")
	assert.NotContains(t, err.Error(), "sk-private-test")
}

func TestStudioProviderTextRejectsReasoningOnlyOutputWithoutLeakingIt(t *testing.T) {
	provider := studioTestProvider(t, "text")
	client := &http.Client{Transport: studioRoundTripFunc(func(*http.Request) (*http.Response, error) {
		return studioResponse(http.StatusOK, `{"choices":[{"message":{"content":null,"reasoning_content":"private chain of thought"},"finish_reason":"stop"}]}`), nil
	})}
	_, err := GenerateStudioProviderText(context.Background(), provider, "text-model", "scene", client)
	require.Error(t, err)
	assert.ErrorContains(t, err, "reasoning without final text")
	assert.NotContains(t, err.Error(), "private chain of thought")
}

func TestStudioProviderTextExplainsHTMLResponseWithoutLeakingIt(t *testing.T) {
	provider := studioTestProvider(t, "text")
	client := &http.Client{Transport: studioRoundTripFunc(func(*http.Request) (*http.Response, error) {
		return studioResponse(http.StatusOK, `<!doctype html><html><body>sk-private-test</body></html>`), nil
	})}
	_, err := GenerateStudioProviderText(context.Background(), provider, "text-model", "scene", client)
	require.Error(t, err)
	assert.ErrorContains(t, err, "HTML")
	assert.ErrorContains(t, err, "/v1")
	assert.NotContains(t, err.Error(), "sk-private-test")
}

func TestStudioProviderErrorsNeverExposeSavedKey(t *testing.T) {
	provider := studioTestProvider(t, "text")
	client := &http.Client{Transport: studioRoundTripFunc(func(*http.Request) (*http.Response, error) {
		return studioResponse(http.StatusUnauthorized, `{"error":{"message":"sk-private-test invalid"}}`), nil
	})}
	_, err := FetchStudioProviderModels(context.Background(), provider, client)
	require.Error(t, err)
	assert.NotContains(t, err.Error(), "sk-private-test")
	assert.ErrorContains(t, err, "401")
}
