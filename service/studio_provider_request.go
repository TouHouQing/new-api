package service

import (
	"bytes"
	"context"
	"encoding/json"
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
		Error   json.RawMessage `json:"error"`
		Success *bool           `json:"success"`
		Choices []struct {
			Message struct {
				Content          json.RawMessage `json:"content"`
				ToolCalls        json.RawMessage `json:"tool_calls"`
				ReasoningContent string          `json:"reasoning_content"`
				Refusal          string          `json:"refusal"`
			} `json:"message"`
			FinishReason string `json:"finish_reason"`
		} `json:"choices"`
	}
	if err := common.Unmarshal(data, &parsed); err != nil {
		return "", errors.New("text provider returned invalid JSON")
	}
	if (len(parsed.Error) > 0 && string(parsed.Error) != "null") || (parsed.Success != nil && !*parsed.Success) {
		return "", errors.New("text provider returned an error response")
	}
	if len(parsed.Choices) == 0 {
		return "", errors.New("text provider returned no text (response has no choices)")
	}
	choice := parsed.Choices[0]
	content := studioChatContentText(choice.Message.Content)
	if strings.TrimSpace(content) != "" {
		return content, nil
	}
	if choice.FinishReason == "tool_calls" || studioHasToolCalls(choice.Message.ToolCalls) {
		return "", errors.New("text provider returned tool calls instead of text")
	}
	if choice.FinishReason == "content_filter" || choice.Message.Refusal != "" {
		return "", errors.New("text provider did not return text because the output was filtered or refused")
	}
	if choice.Message.ReasoningContent != "" {
		return "", errors.New("text provider returned reasoning without final text")
	}
	return "", errors.New("text provider returned no text")
}

func studioChatContentText(raw json.RawMessage) string {
	if len(raw) == 0 || string(raw) == "null" {
		return ""
	}
	var plain string
	if err := common.Unmarshal(raw, &plain); err == nil {
		return plain
	}
	var parts []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	if err := common.Unmarshal(raw, &parts); err != nil {
		return ""
	}
	var combined strings.Builder
	for _, part := range parts {
		if part.Type == "text" || part.Type == "output_text" {
			combined.WriteString(part.Text)
		}
	}
	return combined.String()
}

func studioHasToolCalls(raw json.RawMessage) bool {
	var calls []json.RawMessage
	return common.Unmarshal(raw, &calls) == nil && len(calls) > 0
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
