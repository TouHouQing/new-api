package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

const (
	studioModelsMaxResponse = 2 << 20
	studioTextMaxResponse   = 2 << 20
	studioImageMaxResponse  = 24 << 20
)

func callStudioProvider(ctx context.Context, provider *model.StudioProvider, method, path string, body any, maxResponse int64, client *http.Client) ([]byte, error) {
	if provider == nil || (provider.Kind != "text" && provider.Kind != "image") {
		return nil, errors.New("Studio provider is not configured")
	}
	baseURL, err := NormalizeStudioProviderBaseURL(provider.BaseURL)
	if err != nil {
		return nil, err
	}
	apiKey, err := DecryptStudioProviderKey(provider.UserID, provider.Kind, provider.EncryptedAPIKey)
	if err != nil {
		return nil, errors.New("Studio provider key is unavailable; reconfigure this service")
	}
	var requestBody io.Reader
	if body != nil {
		encoded, err := common.Marshal(body)
		if err != nil {
			return nil, err
		}
		requestBody = bytes.NewReader(encoded)
	}
	request, err := http.NewRequestWithContext(ctx, method, baseURL+path, requestBody)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+apiKey)
	request.Header.Set("Accept", "application/json")
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	if client == nil {
		client = NewStudioProviderHTTPClient()
	}
	response, err := client.Do(request)
	if err != nil {
		return nil, errors.New("Studio provider request failed")
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, fmt.Errorf("Studio provider returned HTTP %d", response.StatusCode)
	}
	limited, err := io.ReadAll(io.LimitReader(response.Body, maxResponse+1))
	if err != nil {
		return nil, errors.New("Studio provider response could not be read")
	}
	if int64(len(limited)) > maxResponse {
		return nil, errors.New("Studio provider response is too large")
	}
	return limited, nil
}

func validStudioModelAndPrompt(modelName, prompt string) error {
	if modelName == "" || len(modelName) > 200 || strings.ContainsAny(modelName, "\r\n\x00") {
		return errors.New("Studio model ID is invalid")
	}
	if strings.TrimSpace(prompt) == "" || len(prompt) > 30000 {
		return errors.New("Studio prompt is invalid")
	}
	return nil
}

func FetchStudioProviderModels(ctx context.Context, provider *model.StudioProvider, client *http.Client) ([]string, error) {
	data, err := callStudioProvider(ctx, provider, http.MethodGet, "/models", nil, studioModelsMaxResponse, client)
	if err != nil {
		return nil, err
	}
	var parsed struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := common.Unmarshal(data, &parsed); err != nil || parsed.Data == nil {
		return nil, errors.New("Studio provider returned an invalid model list")
	}
	models := make([]string, 0, min(len(parsed.Data), 500))
	seen := make(map[string]struct{})
	for _, item := range parsed.Data {
		if item.ID == "" || len(item.ID) > 200 || strings.ContainsAny(item.ID, "\r\n\x00") {
			continue
		}
		if _, exists := seen[item.ID]; exists {
			continue
		}
		seen[item.ID] = struct{}{}
		models = append(models, item.ID)
		if len(models) == 500 {
			break
		}
	}
	return models, nil
}

func GenerateStudioProviderText(ctx context.Context, provider *model.StudioProvider, modelName, prompt string, client *http.Client) (string, error) {
	if provider == nil || provider.Kind != "text" {
		return "", errors.New("text provider is not configured")
	}
	if err := validStudioModelAndPrompt(modelName, prompt); err != nil {
		return "", err
	}
	request := map[string]any{
		"model":    modelName,
		"messages": []map[string]string{{"role": "user", "content": prompt}},
		"stream":   false,
	}
	data, err := callStudioProvider(ctx, provider, http.MethodPost, "/chat/completions", request, studioTextMaxResponse, client)
	if err != nil {
		return "", err
	}
	var parsed struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := common.Unmarshal(data, &parsed); err != nil || len(parsed.Choices) == 0 || strings.TrimSpace(parsed.Choices[0].Message.Content) == "" {
		return "", errors.New("text provider returned no text")
	}
	return parsed.Choices[0].Message.Content, nil
}

func GenerateStudioProviderImage(ctx context.Context, provider *model.StudioProvider, modelName, prompt string, client *http.Client) (string, error) {
	if provider == nil || provider.Kind != "image" {
		return "", errors.New("image provider is not configured")
	}
	if err := validStudioModelAndPrompt(modelName, prompt); err != nil {
		return "", err
	}
	request := map[string]string{"model": modelName, "prompt": prompt}
	data, err := callStudioProvider(ctx, provider, http.MethodPost, "/images/generations", request, studioImageMaxResponse, client)
	if err != nil {
		return "", err
	}
	var parsed struct {
		Data []struct {
			URL     string `json:"url"`
			B64JSON string `json:"b64_json"`
		} `json:"data"`
	}
	if err := common.Unmarshal(data, &parsed); err != nil || len(parsed.Data) == 0 {
		return "", errors.New("image provider returned no image")
	}
	for _, item := range parsed.Data {
		if strings.HasPrefix(item.URL, "https://") || strings.HasPrefix(item.URL, "http://") {
			return item.URL, nil
		}
		if item.B64JSON != "" {
			return "data:image/png;base64," + item.B64JSON, nil
		}
	}
	return "", errors.New("image provider returned no image")
}
