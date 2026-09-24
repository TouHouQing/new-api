package controller

import (
	"bytes"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

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
