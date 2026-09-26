package service

import (
	"bytes"
	"context"
	"encoding/base64"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
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
			return studioResponse(http.StatusOK, `{"choices":[{"message":{"content":"{\"text\":\"A good scene\",\"image_prompt\":\"A good still frame\",\"video_prompt\":\"The camera pushes in\"}"}}]}`), nil
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
	assert.Equal(t, "A good scene", text.Text)
	assert.Equal(t, "A good still frame", text.ImagePrompt)
	assert.Equal(t, "The camera pushes in", text.VideoPrompt)
	imageURL, err := GenerateStudioProviderImage(context.Background(), imageProvider, "image-one", "frame", client)
	require.NoError(t, err)
	assert.Equal(t, "https://cdn.example.com/frame.png", imageURL)
}

func TestStudioProviderImageOptionsReturnEveryImage(t *testing.T) {
	provider := studioTestProvider(t, "image")
	size, quality, n := "1536x1024", "high", 2
	client := &http.Client{Transport: studioRoundTripFunc(func(request *http.Request) (*http.Response, error) {
		require.Equal(t, "/v1/images/generations", request.URL.Path)
		require.Equal(t, "application/json", request.Header.Get("Content-Type"))
		body, err := io.ReadAll(request.Body)
		require.NoError(t, err)
		var payload map[string]any
		require.NoError(t, common.Unmarshal(body, &payload))
		assert.Equal(t, "image-one", payload["model"])
		assert.Equal(t, "frame", payload["prompt"])
		assert.Equal(t, size, payload["size"])
		assert.Equal(t, quality, payload["quality"])
		assert.Equal(t, float64(n), payload["n"])
		assert.NotContains(t, string(body), "sk-private-test")
		return studioResponse(http.StatusOK, `{"data":[{"url":"https://cdn.example.com/one.png"},{"url":"https://cdn.example.com/two.png"}]}`), nil
	})}
	images, err := GenerateStudioProviderImages(context.Background(), provider, StudioImageRequest{Model: "image-one", Prompt: "frame", Size: &size, Quality: &quality, N: &n}, client)
	require.NoError(t, err)
	assert.Equal(t, []string{"https://cdn.example.com/one.png", "https://cdn.example.com/two.png"}, images)
}

func TestStudioProviderImageEditUsesMultipart(t *testing.T) {
	provider := studioTestProvider(t, "image")
	imageBytes, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==")
	require.NoError(t, err)
	imageURI := "data:image/png;base64," + base64.StdEncoding.EncodeToString(imageBytes)
	size, quality, n := "1024x1024", "high", 1
	client := &http.Client{Transport: studioRoundTripFunc(func(request *http.Request) (*http.Response, error) {
		require.Equal(t, "/v1/images/edits", request.URL.Path)
		assert.Equal(t, "Bearer sk-private-test", request.Header.Get("Authorization"))
		reader, err := request.MultipartReader()
		require.NoError(t, err)
		fields := map[string]string{}
		for {
			part, err := reader.NextPart()
			if err == io.EOF {
				break
			}
			require.NoError(t, err)
			contents, err := io.ReadAll(part)
			require.NoError(t, err)
			if part.FormName() == "image" {
				assert.Equal(t, "image.png", part.FileName())
				assert.Equal(t, "image/png", part.Header.Get("Content-Type"))
				assert.Equal(t, imageBytes, contents)
			} else {
				fields[part.FormName()] = string(contents)
			}
		}
		assert.Equal(t, map[string]string{"model": "image-one", "prompt": "revise frame", "size": size, "quality": quality, "n": "1"}, fields)
		return studioResponse(http.StatusOK, `{"data":[{"b64_json":"aGVsbG8="}]}`), nil
	})}
	images, err := GenerateStudioProviderImages(context.Background(), provider, StudioImageRequest{Model: "image-one", Prompt: "revise frame", Size: &size, Quality: &quality, N: &n, Image: imageURI}, client)
	require.NoError(t, err)
	assert.Equal(t, []string{"data:image/png;base64,aGVsbG8="}, images)
}

func TestStudioProviderImageEditSendsEveryReference(t *testing.T) {
	provider := studioTestProvider(t, "image")
	imageBytes, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==")
	require.NoError(t, err)
	imageURI := "data:image/png;base64," + base64.StdEncoding.EncodeToString(imageBytes)
	client := &http.Client{Transport: studioRoundTripFunc(func(request *http.Request) (*http.Response, error) {
		require.Equal(t, "/v1/images/edits", request.URL.Path)
		reader, err := request.MultipartReader()
		require.NoError(t, err)
		images := 0
		for {
			part, err := reader.NextPart()
			if err == io.EOF {
				break
			}
			require.NoError(t, err)
			if part.FormName() != "image[]" {
				continue
			}
			contents, err := io.ReadAll(part)
			require.NoError(t, err)
			assert.Equal(t, imageBytes, contents)
			images++
		}
		assert.Equal(t, 2, images)
		return studioResponse(http.StatusOK, `{"data":[{"url":"https://cdn.example.com/result.png"}]}`), nil
	})}
	result, err := GenerateStudioProviderImages(context.Background(), provider, StudioImageRequest{Model: "image-one", Prompt: "combine both", Images: []string{imageURI, imageURI}}, client)
	require.NoError(t, err)
	assert.Equal(t, []string{"https://cdn.example.com/result.png"}, result)
}

func TestStudioProviderMultiImageRejectionIsExplicit(t *testing.T) {
	provider := studioTestProvider(t, "image")
	imageBytes, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==")
	require.NoError(t, err)
	imageURI := "data:image/png;base64," + base64.StdEncoding.EncodeToString(imageBytes)
	client := &http.Client{Transport: studioRoundTripFunc(func(*http.Request) (*http.Response, error) {
		return studioResponse(http.StatusBadRequest, `{"error":{"message":"sk-private-test"}}`), nil
	})}
	_, err = GenerateStudioProviderImages(context.Background(), provider, StudioImageRequest{Model: "image-one", Prompt: "combine both", Images: []string{imageURI, imageURI}}, client)
	require.Error(t, err)
	assert.ErrorContains(t, err, "multiple reference images")
	assert.NotContains(t, err.Error(), "sk-private-test")
}

func TestStudioProviderImageEditRejectsInvalidDataBeforeUpstream(t *testing.T) {
	provider := studioTestProvider(t, "image")
	called := false
	client := &http.Client{Transport: studioRoundTripFunc(func(*http.Request) (*http.Response, error) {
		called = true
		return studioResponse(http.StatusOK, `{}`), nil
	})}
	for _, imageURI := range []string{"https://example.com/image.png", "data:image/svg+xml;base64,PHN2Zz4=", "data:image/png;base64,aGVsbG8=", "data:image/png;base64,iVBORw0KGgo="} {
		_, err := GenerateStudioProviderImages(context.Background(), provider, StudioImageRequest{Model: "image-one", Prompt: "frame", Image: imageURI}, client)
		require.Error(t, err)
		assert.ErrorContains(t, err, "image")
	}
	assert.False(t, called)
}

func TestStudioProviderTextAcceptsChatContentParts(t *testing.T) {
	provider := studioTestProvider(t, "text")
	client := &http.Client{Transport: studioRoundTripFunc(func(*http.Request) (*http.Response, error) {
		return studioResponse(http.StatusOK, `{"choices":[{"message":{"role":"assistant","content":[{"type":"text","text":"{\"text\":\"First scene\","},{"type":"text","text":"\"image_prompt\":\"A still frame\",\"video_prompt\":\"Then the reveal\"}"}]},"finish_reason":"stop"}]}`), nil
	})}
	text, err := GenerateStudioProviderText(context.Background(), provider, "text-model", "scene", client)
	require.NoError(t, err)
	assert.Equal(t, "First scene", text.Text)
	assert.Equal(t, "A still frame", text.ImagePrompt)
	assert.Equal(t, "Then the reveal", text.VideoPrompt)
}

func TestStudioProviderPlainTextReturnsUsablePrompt(t *testing.T) {
	provider := studioTestProvider(t, "text")
	client := &http.Client{Transport: studioRoundTripFunc(func(request *http.Request) (*http.Response, error) {
		body, err := io.ReadAll(request.Body)
		require.NoError(t, err)
		var payload struct {
			Messages []struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			} `json:"messages"`
		}
		require.NoError(t, common.Unmarshal(body, &payload))
		require.Len(t, payload.Messages, 2)
		assert.Equal(t, "system", payload.Messages[0].Role)
		assert.NotContains(t, payload.Messages[0].Content, "image_prompt")
		assert.Contains(t, payload.Messages[0].Content, "prompt")
		assert.Equal(t, "A woman walks through a city", payload.Messages[1].Content)
		return studioResponse(http.StatusOK, `{"choices":[{"message":{"content":"A woman in a red coat walks through a rain-soaked city street at dusk."}}]}`), nil
	})}
	plain, err := GenerateStudioProviderPlainText(context.Background(), provider, "text-model", "A woman walks through a city", client)
	require.NoError(t, err)
	assert.Equal(t, "A woman in a red coat walks through a rain-soaked city street at dusk.", plain)
}

func TestStudioProviderTextRequestsAProductionReadyShot(t *testing.T) {
	provider := studioTestProvider(t, "text")
	client := &http.Client{Transport: studioRoundTripFunc(func(request *http.Request) (*http.Response, error) {
		body, err := io.ReadAll(request.Body)
		require.NoError(t, err)
		var payload struct {
			Messages []struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			} `json:"messages"`
		}
		require.NoError(t, common.Unmarshal(body, &payload))
		require.Len(t, payload.Messages, 2)
		assert.Equal(t, "system", payload.Messages[0].Role)
		assert.Contains(t, payload.Messages[0].Content, "image_prompt")
		assert.Contains(t, payload.Messages[0].Content, "video_prompt")
		assert.Contains(t, payload.Messages[1].Content, "生成一个美女")
		assert.Contains(t, payload.Messages[1].Content, "image_prompt")
		return studioResponse(http.StatusOK, `{"choices":[{"message":{"content":"{\"text\":\"一位女性站在街角\",\"image_prompt\":\"电影感人像，女性站在街角\",\"video_prompt\":\"她转头看向镜头，镜头缓缓推近\"}"}}]}`), nil
	})}
	_, err := GenerateStudioProviderText(context.Background(), provider, "gpt-6-sol", "生成一个美女", client)
	require.NoError(t, err)
}

func TestStudioProviderStoryboardRequestsOneStructuredDraft(t *testing.T) {
	provider := studioTestProvider(t, "text")
	calls := 0
	client := &http.Client{Transport: studioRoundTripFunc(func(request *http.Request) (*http.Response, error) {
		calls++
		require.Equal(t, http.MethodPost, request.Method)
		require.Equal(t, "/v1/chat/completions", request.URL.Path)
		assert.Equal(t, "Bearer sk-private-test", request.Header.Get("Authorization"))
		body, err := io.ReadAll(request.Body)
		require.NoError(t, err)
		var payload struct {
			Model    string `json:"model"`
			Stream   bool   `json:"stream"`
			Messages []struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			} `json:"messages"`
		}
		require.NoError(t, common.Unmarshal(body, &payload))
		assert.Equal(t, "gpt-text", payload.Model)
		assert.False(t, payload.Stream)
		require.Len(t, payload.Messages, 2)
		assert.Equal(t, "system", payload.Messages[0].Role)
		assert.Contains(t, payload.Messages[0].Content, "shots")
		assert.Contains(t, payload.Messages[0].Content, "title")
		assert.Contains(t, payload.Messages[0].Content, "2")
		assert.Contains(t, payload.Messages[0].Content, "same language")
		assert.Contains(t, payload.Messages[1].Content, "黄昏的海边")
		assert.NotContains(t, string(body), "sk-private-test")
		return studioResponse(http.StatusOK, `{"choices":[{"message":{"content":[{"type":"text","text":"{\"shots\":[{\"title\":\"开场\",\"text\":\"海边\",\"image_prompt\":\"黄昏海景\",\"video_prompt\":\"镜头推进\"},"},{"type":"text","text":"{\"title\":\"特写\",\"text\":\"人物回头\",\"image_prompt\":\"人物侧脸\",\"video_prompt\":\"人物回头，镜头跟随\"}]}"}]},"finish_reason":"stop"}]}`), nil
	})}
	shots, err := GenerateStudioProviderStoryboard(context.Background(), provider, "gpt-text", "黄昏的海边", 2, client)
	require.NoError(t, err)
	require.Len(t, shots, 2)
	assert.Equal(t, "开场", shots[0].Title)
	assert.Equal(t, "镜头推进", shots[0].VideoPrompt)
	assert.Equal(t, 1, calls)
}

func TestStudioProviderStoryboardRejectsInvalidRequestsBeforeUpstream(t *testing.T) {
	provider := studioTestProvider(t, "text")
	calls := 0
	client := &http.Client{Transport: studioRoundTripFunc(func(*http.Request) (*http.Response, error) {
		calls++
		return studioResponse(http.StatusOK, `{}`), nil
	})}
	for _, input := range []struct {
		name   string
		model  string
		prompt string
		count  int
	}{
		{"zero count", "gpt-text", "scene", 0},
		{"too many shots", "gpt-text", "scene", 13},
		{"empty prompt", "gpt-text", "  ", 1},
		{"oversize prompt", "gpt-text", strings.Repeat("a", 30001), 1},
		{"invalid model", "bad\nmodel", "scene", 1},
	} {
		t.Run(input.name, func(t *testing.T) {
			_, err := GenerateStudioProviderStoryboard(context.Background(), provider, input.model, input.prompt, input.count, client)
			require.Error(t, err)
		})
	}
	assert.Equal(t, 0, calls)
}

func TestStudioProviderStoryboardRejectsUnusableOutput(t *testing.T) {
	provider := studioTestProvider(t, "text")
	for _, tc := range []struct {
		name     string
		content  string
		response string
		want     string
	}{
		{"chat prose", "Here is your storyboard", "", "usable storyboard"},
		{"empty shots", `{"shots":[]}`, "", "usable storyboard"},
		{"too many shots", `{"shots":[{"title":"a","text":"b","image_prompt":"c","video_prompt":"d"},{"title":"e","text":"f","image_prompt":"g","video_prompt":"h"}]}`, "", "usable storyboard"},
		{"missing field", `{"shots":[{"title":"a","text":"b","image_prompt":"c"}]}`, "", "usable storyboard"},
		{"oversize title", `{"shots":[{"title":"` + strings.Repeat("a", 201) + `","text":"b","image_prompt":"c","video_prompt":"d"}]}`, "", "usable storyboard"},
		{"provider error", "", `{"error":{"message":"sk-private-test"}}`, "error response"},
		{"tool calls", "", `{"choices":[{"message":{"content":null,"tool_calls":[{}]},"finish_reason":"tool_calls"}]}`, "tool calls"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			response := tc.response
			if response == "" {
				encoded, err := common.Marshal(tc.content)
				require.NoError(t, err)
				response = `{"choices":[{"message":{"content":` + string(encoded) + `}}]}`
			}
			client := &http.Client{Transport: studioRoundTripFunc(func(*http.Request) (*http.Response, error) {
				return studioResponse(http.StatusOK, response), nil
			})}
			_, err := GenerateStudioProviderStoryboard(context.Background(), provider, "gpt-text", "scene", 1, client)
			require.Error(t, err)
			assert.ErrorContains(t, err, tc.want)
			assert.NotContains(t, err.Error(), "sk-private-test")
		})
	}
}

func TestStudioProviderTextRejectsAConversationalAnswer(t *testing.T) {
	provider := studioTestProvider(t, "text")
	client := &http.Client{Transport: studioRoundTripFunc(func(*http.Request) (*http.Response, error) {
		return studioResponse(http.StatusOK, `{"choices":[{"message":{"content":"我先查看当前工作区。请告诉我你希望的风格，也可以直接使用这个提示词生成。"}}]}`), nil
	})}
	_, err := GenerateStudioProviderText(context.Background(), provider, "gpt-6-sol", "生成一个美女", client)
	require.Error(t, err)
	assert.ErrorContains(t, err, "usable shot")
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
