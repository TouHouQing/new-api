package controller

import (
	"bytes"
	"encoding/base64"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type studioControllerRoundTrip func(*http.Request) (*http.Response, error)

func (fn studioControllerRoundTrip) RoundTrip(request *http.Request) (*http.Response, error) {
	return fn(request)
}

func TestStudioProviderConfigIsEncryptedAndPrivate(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("STUDIO_PROVIDER_ENCRYPTION_KEY", base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{0x62}, 32)))
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.StudioProvider{}))
	previous := model.DB
	model.DB = db
	t.Cleanup(func() { model.DB = previous })

	router := gin.New()
	router.PUT("/providers/:kind", func(c *gin.Context) { c.Set("id", 12); PutStudioProvider(c) })
	router.GET("/providers", func(c *gin.Context) { c.Set("id", 12); ListStudioProviderConfigs(c) })
	router.GET("/other/providers", func(c *gin.Context) { c.Set("id", 13); ListStudioProviderConfigs(c) })

	request := httptest.NewRequest(http.MethodPut, "/providers/text", strings.NewReader(`{"base_url":"https://api.example.com/v1","api_key":"sk-private-test"}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	assert.NotContains(t, response.Body.String(), "sk-private-test")
	provider, err := model.GetStudioProvider(12, "text")
	require.NoError(t, err)
	require.NotNil(t, provider)
	assert.NotContains(t, provider.EncryptedAPIKey, "sk-private-test")

	list := httptest.NewRecorder()
	router.ServeHTTP(list, httptest.NewRequest(http.MethodGet, "/providers", nil))
	assert.Contains(t, list.Body.String(), `"has_key":true`)
	assert.NotContains(t, list.Body.String(), "sk-private-test")
	assert.NotContains(t, list.Body.String(), provider.EncryptedAPIKey)

	other := httptest.NewRecorder()
	router.ServeHTTP(other, httptest.NewRequest(http.MethodGet, "/other/providers", nil))
	assert.NotContains(t, other.Body.String(), "api.example.com")

	update := httptest.NewRequest(http.MethodPut, "/providers/text", strings.NewReader(`{"base_url":"https://another.example.com/v1","api_key":""}`))
	update.Header.Set("Content-Type", "application/json")
	updated := httptest.NewRecorder()
	router.ServeHTTP(updated, update)
	require.Equal(t, http.StatusOK, updated.Code, updated.Body.String())
	providerAfter, err := model.GetStudioProvider(12, "text")
	require.NoError(t, err)
	assert.Equal(t, provider.EncryptedAPIKey, providerAfter.EncryptedAPIKey)
	assert.Equal(t, "https://another.example.com/v1", providerAfter.BaseURL)
}

func TestStudioProviderImageGenerationPassesOptionsAndReturnsAllImages(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("STUDIO_PROVIDER_ENCRYPTION_KEY", base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{0x62}, 32)))
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.StudioProvider{}))
	previousDB := model.DB
	model.DB = db
	t.Cleanup(func() { model.DB = previousDB })
	key, err := service.EncryptStudioProviderKey(12, "image", "sk-private-test")
	require.NoError(t, err)
	require.NoError(t, model.UpsertStudioProvider(12, "image", "https://api.example.com/v1", key))

	previousClient := studioProviderClient
	calls := 0
	studioProviderClient = &http.Client{Transport: studioControllerRoundTrip(func(request *http.Request) (*http.Response, error) {
		calls++
		require.Equal(t, "/v1/images/generations", request.URL.Path)
		body, err := io.ReadAll(request.Body)
		require.NoError(t, err)
		var payload map[string]any
		require.NoError(t, common.Unmarshal(body, &payload))
		assert.Equal(t, "1536x1024", payload["size"])
		assert.Equal(t, "high", payload["quality"])
		assert.Equal(t, float64(2), payload["n"])
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`{"data":[{"url":"https://cdn.example.com/one.png"},{"url":"https://cdn.example.com/two.png"}]}`)), Header: make(http.Header)}, nil
	})}
	t.Cleanup(func() { studioProviderClient = previousClient })

	router := gin.New()
	router.POST("/providers/:kind/generate", func(c *gin.Context) { c.Set("id", 12); StudioProviderGenerate(c) })
	request := httptest.NewRequest(http.MethodPost, "/providers/image/generate", strings.NewReader(`{"model":"image-one","prompt":"frame","size":"1536x1024","quality":"high","n":2}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	var result struct {
		Success bool `json:"success"`
		Data    struct {
			URL  string   `json:"url"`
			URLs []string `json:"urls"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
	assert.True(t, result.Success)
	assert.Equal(t, "https://cdn.example.com/one.png", result.Data.URL)
	assert.Equal(t, []string{"https://cdn.example.com/one.png", "https://cdn.example.com/two.png"}, result.Data.URLs)
	assert.NotContains(t, response.Body.String(), "sk-private-test")

	invalid := httptest.NewRequest(http.MethodPost, "/providers/image/generate", strings.NewReader(`{"model":"image-one","prompt":"frame","image":"data:image/png;base64,aGVsbG8="}`))
	invalid.Header.Set("Content-Type", "application/json")
	invalidResponse := httptest.NewRecorder()
	router.ServeHTTP(invalidResponse, invalid)
	assert.Equal(t, http.StatusBadRequest, invalidResponse.Code)
	assert.Equal(t, 1, calls)
	assert.NotContains(t, invalidResponse.Body.String(), "sk-private-test")
}

func TestStudioProviderPlainTextModeReturnsTextWithoutShotFields(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("STUDIO_PROVIDER_ENCRYPTION_KEY", base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{0x62}, 32)))
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.StudioProvider{}))
	previousDB := model.DB
	model.DB = db
	t.Cleanup(func() { model.DB = previousDB })
	key, err := service.EncryptStudioProviderKey(12, "text", "sk-private-test")
	require.NoError(t, err)
	require.NoError(t, model.UpsertStudioProvider(12, "text", "https://api.example.com/v1", key))

	previousClient := studioProviderClient
	calls := 0
	studioProviderClient = &http.Client{Transport: studioControllerRoundTrip(func(*http.Request) (*http.Response, error) {
		calls++
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`{"choices":[{"message":{"content":"A cinematic close-up of a woman at dusk."}}]}`)), Header: make(http.Header)}, nil
	})}
	t.Cleanup(func() { studioProviderClient = previousClient })

	router := gin.New()
	router.POST("/providers/:kind/generate", func(c *gin.Context) { c.Set("id", 12); StudioProviderGenerate(c) })
	for _, body := range []string{
		`{"model":"text-model","prompt":"woman","mode":"unknown"}`,
		`{"model":"text-model","prompt":"woman","mode":"plain","images":["data:image/png;base64,aGVsbG8="]}`,
	} {
		request := httptest.NewRequest(http.MethodPost, "/providers/text/generate", strings.NewReader(body))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		assert.Equal(t, http.StatusBadRequest, response.Code, response.Body.String())
	}
	assert.Equal(t, 0, calls)

	request := httptest.NewRequest(http.MethodPost, "/providers/text/generate", strings.NewReader(`{"model":"text-model","prompt":"woman","mode":"plain"}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	var result struct {
		Success bool           `json:"success"`
		Data    map[string]any `json:"data"`
	}
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
	assert.True(t, result.Success)
	assert.Equal(t, "A cinematic close-up of a woman at dusk.", result.Data["text"])
	assert.NotContains(t, result.Data, "image_prompt")
	assert.Equal(t, 1, calls)
}

func TestStudioProviderStoryboardUsesOwnersTextServiceAndValidatesCount(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("STUDIO_PROVIDER_ENCRYPTION_KEY", base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{0x62}, 32)))
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.StudioProvider{}))
	previousDB := model.DB
	model.DB = db
	t.Cleanup(func() { model.DB = previousDB })
	key, err := service.EncryptStudioProviderKey(12, "text", "sk-owner")
	require.NoError(t, err)
	require.NoError(t, model.UpsertStudioProvider(12, "text", "https://api.example.com/v1", key))

	previousClient := studioProviderClient
	calls := 0
	studioProviderClient = &http.Client{Transport: studioControllerRoundTrip(func(request *http.Request) (*http.Response, error) {
		calls++
		assert.Equal(t, "Bearer sk-owner", request.Header.Get("Authorization"))
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`{"choices":[{"message":{"content":"{\"shots\":[{\"title\":\"Opening\",\"text\":\"A beach\",\"image_prompt\":\"Sunset beach\",\"video_prompt\":\"Camera pans\"}]}"}}]}`)), Header: make(http.Header)}, nil
	})}
	t.Cleanup(func() { studioProviderClient = previousClient })

	router := gin.New()
	router.POST("/providers/text/storyboard", func(c *gin.Context) { c.Set("id", 12); StudioProviderStoryboard(c) })
	router.POST("/other/providers/text/storyboard", func(c *gin.Context) { c.Set("id", 13); StudioProviderStoryboard(c) })
	for _, body := range []string{
		`{"model":"gpt-text","prompt":"scene","count":0}`,
		`{"model":"gpt-text","prompt":"scene","count":13}`,
		`{"model":"gpt-text","prompt":"","count":1}`,
	} {
		request := httptest.NewRequest(http.MethodPost, "/providers/text/storyboard", strings.NewReader(body))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		assert.Equal(t, http.StatusBadRequest, response.Code, response.Body.String())
	}
	assert.Equal(t, 0, calls)

	otherRequest := httptest.NewRequest(http.MethodPost, "/other/providers/text/storyboard", strings.NewReader(`{"model":"gpt-text","prompt":"scene","count":1}`))
	otherRequest.Header.Set("Content-Type", "application/json")
	otherResponse := httptest.NewRecorder()
	router.ServeHTTP(otherResponse, otherRequest)
	assert.Equal(t, http.StatusNotFound, otherResponse.Code)
	assert.Equal(t, 0, calls)

	request := httptest.NewRequest(http.MethodPost, "/providers/text/storyboard", strings.NewReader(`{"model":"gpt-text","prompt":"scene","count":1}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	var result struct {
		Success bool `json:"success"`
		Data    struct {
			Shots []struct {
				Title       string `json:"title"`
				Text        string `json:"text"`
				ImagePrompt string `json:"image_prompt"`
				VideoPrompt string `json:"video_prompt"`
			} `json:"shots"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
	assert.True(t, result.Success)
	require.Len(t, result.Data.Shots, 1)
	assert.Equal(t, "Opening", result.Data.Shots[0].Title)
	assert.Equal(t, "A beach", result.Data.Shots[0].Text)
	assert.Equal(t, 1, calls)
	assert.Equal(t, "private, no-store", response.Header().Get("Cache-Control"))
	assert.NotContains(t, response.Body.String(), "sk-owner")

	boundaryBody, err := common.Marshal(studioStoryboardInput{
		Model: "gpt-text", Prompt: strings.Repeat("\\", 15000) + strings.Repeat("a", 15000), Count: 1,
	})
	require.NoError(t, err)
	boundaryRequest := httptest.NewRequest(http.MethodPost, "/providers/text/storyboard", bytes.NewReader(boundaryBody))
	boundaryRequest.Header.Set("Content-Type", "application/json")
	boundaryResponse := httptest.NewRecorder()
	router.ServeHTTP(boundaryResponse, boundaryRequest)
	assert.Equal(t, http.StatusOK, boundaryResponse.Code, boundaryResponse.Body.String())
	assert.Equal(t, 2, calls)
}
