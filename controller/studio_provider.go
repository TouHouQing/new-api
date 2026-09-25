package controller

import (
	"errors"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

type studioProviderInput struct {
	BaseURL string `json:"base_url"`
	APIKey  string `json:"api_key"`
}

type studioGenerationInput struct {
	Model   string  `json:"model"`
	Prompt  string  `json:"prompt"`
	Size    *string `json:"size"`
	Quality *string `json:"quality"`
	N       *int    `json:"n"`
	Image   string  `json:"image"`
}

type studioProviderPublic struct {
	Kind    string `json:"kind"`
	BaseURL string `json:"base_url"`
	HasKey  bool   `json:"has_key"`
}

var studioProviderClient = service.NewStudioProviderHTTPClient()

func validStudioProviderKind(kind string) bool {
	return kind == "text" || kind == "image"
}

func studioProviderError(c *gin.Context, status int, code, message string) {
	c.Header("Cache-Control", "private, no-store")
	c.JSON(status, gin.H{"success": false, "code": code, "message": message})
}

func ListStudioProviderConfigs(c *gin.Context) {
	c.Header("Cache-Control", "private, no-store")
	providers, err := model.ListStudioProviders(c.GetInt("id"))
	if err != nil {
		studioProviderError(c, http.StatusInternalServerError, "studio_provider_query_failed", "Could not load Studio services")
		return
	}
	data := make([]studioProviderPublic, 0, len(providers))
	for _, provider := range providers {
		data = append(data, studioProviderPublic{Kind: provider.Kind, BaseURL: provider.BaseURL, HasKey: provider.EncryptedAPIKey != ""})
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": data})
}

func PutStudioProvider(c *gin.Context) {
	kind := c.Param("kind")
	if !validStudioProviderKind(kind) {
		studioProviderError(c, http.StatusBadRequest, "studio_provider_kind_invalid", "Only text and image services can be configured")
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 8192)
	var input studioProviderInput
	if err := c.ShouldBindJSON(&input); err != nil {
		studioProviderError(c, http.StatusBadRequest, "studio_provider_request_invalid", "Invalid Studio service settings")
		return
	}
	baseURL, err := service.NormalizeStudioProviderBaseURL(input.BaseURL)
	if err != nil {
		studioProviderError(c, http.StatusBadRequest, "studio_provider_url_invalid", err.Error())
		return
	}
	userID := c.GetInt("id")
	existing, err := model.GetStudioProvider(userID, kind)
	if err != nil {
		studioProviderError(c, http.StatusInternalServerError, "studio_provider_query_failed", "Could not load Studio service")
		return
	}
	encryptedKey := ""
	if existing != nil {
		encryptedKey = existing.EncryptedAPIKey
	}
	if strings.TrimSpace(input.APIKey) != "" {
		if len(input.APIKey) > 4096 {
			studioProviderError(c, http.StatusBadRequest, "studio_provider_key_invalid", "API key is too long")
			return
		}
		encryptedKey, err = service.EncryptStudioProviderKey(userID, kind, strings.TrimSpace(input.APIKey))
		if err != nil {
			studioProviderError(c, http.StatusServiceUnavailable, "studio_provider_encryption_unavailable", err.Error())
			return
		}
	}
	if encryptedKey == "" {
		studioProviderError(c, http.StatusBadRequest, "studio_provider_key_required", "An API key is required")
		return
	}
	if err := model.UpsertStudioProvider(userID, kind, baseURL, encryptedKey); err != nil {
		studioProviderError(c, http.StatusInternalServerError, "studio_provider_save_failed", "Could not save Studio service")
		return
	}
	c.Header("Cache-Control", "private, no-store")
	c.JSON(http.StatusOK, gin.H{"success": true, "data": studioProviderPublic{Kind: kind, BaseURL: baseURL, HasKey: true}})
}

func DeleteStudioProvider(c *gin.Context) {
	kind := c.Param("kind")
	if !validStudioProviderKind(kind) {
		studioProviderError(c, http.StatusBadRequest, "studio_provider_kind_invalid", "Only text and image services can be configured")
		return
	}
	if err := model.DeleteStudioProvider(c.GetInt("id"), kind); err != nil {
		studioProviderError(c, http.StatusInternalServerError, "studio_provider_delete_failed", "Could not delete Studio service")
		return
	}
	c.Header("Cache-Control", "private, no-store")
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func StudioProviderModels(c *gin.Context) {
	kind := c.Param("kind")
	if !validStudioProviderKind(kind) {
		studioProviderError(c, http.StatusBadRequest, "studio_provider_kind_invalid", "Only text and image services can be configured")
		return
	}
	provider, err := model.GetStudioProvider(c.GetInt("id"), kind)
	if err != nil {
		studioProviderError(c, http.StatusInternalServerError, "studio_provider_query_failed", "Could not load Studio service")
		return
	}
	if provider == nil {
		studioProviderError(c, http.StatusNotFound, "studio_provider_missing", "Configure this Studio service first")
		return
	}
	models, err := service.FetchStudioProviderModels(c.Request.Context(), provider, studioProviderClient)
	if err != nil {
		studioProviderError(c, http.StatusBadGateway, "studio_provider_models_failed", err.Error())
		return
	}
	c.Header("Cache-Control", "private, no-store")
	c.JSON(http.StatusOK, gin.H{"success": true, "data": models})
}

func StudioProviderGenerate(c *gin.Context) {
	kind := c.Param("kind")
	if !validStudioProviderKind(kind) {
		studioProviderError(c, http.StatusBadRequest, "studio_provider_kind_invalid", "Only text and image services can be configured")
		return
	}
	maxRequestBytes := int64(32768)
	if kind == "image" {
		maxRequestBytes = 12 << 20
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxRequestBytes)
	var input studioGenerationInput
	if err := c.ShouldBindJSON(&input); err != nil || input.Model == "" || len(input.Model) > 200 || strings.TrimSpace(input.Prompt) == "" || len(input.Prompt) > 30000 {
		studioProviderError(c, http.StatusBadRequest, "studio_provider_request_invalid", "Model and prompt are required")
		return
	}
	provider, err := model.GetStudioProvider(c.GetInt("id"), kind)
	if err != nil {
		studioProviderError(c, http.StatusInternalServerError, "studio_provider_query_failed", "Could not load Studio service")
		return
	}
	if provider == nil {
		studioProviderError(c, http.StatusNotFound, "studio_provider_missing", "Configure this Studio service first")
		return
	}
	if kind == "text" {
		shot, err := service.GenerateStudioProviderText(c.Request.Context(), provider, input.Model, input.Prompt, studioProviderClient)
		if err != nil {
			studioProviderError(c, http.StatusBadGateway, "studio_provider_generation_failed", err.Error())
			return
		}
		c.Header("Cache-Control", "private, no-store")
		c.JSON(http.StatusOK, gin.H{"success": true, "data": shot})
		return
	}
	images, err := service.GenerateStudioProviderImages(c.Request.Context(), provider, service.StudioImageRequest{
		Model: input.Model, Prompt: input.Prompt, Size: input.Size, Quality: input.Quality, N: input.N, Image: input.Image,
	}, studioProviderClient)
	if err != nil {
		if errors.Is(err, service.ErrStudioImageRequestInvalid) {
			studioProviderError(c, http.StatusBadRequest, "studio_provider_request_invalid", err.Error())
			return
		}
		studioProviderError(c, http.StatusBadGateway, "studio_provider_generation_failed", err.Error())
		return
	}
	c.Header("Cache-Control", "private, no-store")
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"url": images[0], "urls": images}})
}
