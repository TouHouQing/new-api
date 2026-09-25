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
	studioShotSystemPrompt  = `你是 AI 视频创作画布的镜头提示词编剧。用户输入的是创作想法，不是与你聊天。请将它写成一个可用于生图和生视频的单镜头设定，并保留用户指定的人物、场景、风格和动作。
只输出一个合法 JSON 对象，不要 Markdown、解释、寒暄、问句、选项、工作计划或工具/API 描述。字段必须是：
{"text":"简短的画面设定","image_prompt":"用于生成首帧图片的主体、环境、构图、光线和风格描述","video_prompt":"同一镜头中主体与环境的具体运动、镜头运动及时间变化"}
video_prompt 应聚焦可见的动作和镜头变化；image_prompt 应描述静态画面。使用与用户输入相同的语言。三个字段都必须是非空字符串。`
)

type StudioGeneratedShot struct {
	Text        string `json:"text"`
	ImagePrompt string `json:"image_prompt"`
	VideoPrompt string `json:"video_prompt"`
}

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

func GenerateStudioProviderText(ctx context.Context, provider *model.StudioProvider, modelName, prompt string, client *http.Client) (StudioGeneratedShot, error) {
	if provider == nil || provider.Kind != "text" {
		return StudioGeneratedShot{}, errors.New("text provider is not configured")
	}
	if err := validStudioModelAndPrompt(modelName, prompt); err != nil {
		return StudioGeneratedShot{}, err
	}
	request := map[string]any{
		"model": modelName,
		"messages": []map[string]string{
			{"role": "system", "content": studioShotSystemPrompt},
			{"role": "user", "content": "请仅返回包含 text、image_prompt、video_prompt 的 JSON 镜头设定。创作想法：\n" + prompt},
		},
		"stream": false,
	}
	data, err := callStudioProvider(ctx, provider, http.MethodPost, "/chat/completions", request, studioTextMaxResponse, client)
	if err != nil {
		return StudioGeneratedShot{}, err
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
		trimmed := bytes.ToLower(bytes.TrimSpace(data))
		if bytes.HasPrefix(trimmed, []byte("<!doctype html")) || bytes.HasPrefix(trimmed, []byte("<html")) {
			return StudioGeneratedShot{}, errors.New("text provider returned HTML instead of API JSON; check the service Base URL (usually ends in /v1)")
		}
		return StudioGeneratedShot{}, errors.New("text provider returned invalid JSON")
	}
	if (len(parsed.Error) > 0 && string(parsed.Error) != "null") || (parsed.Success != nil && !*parsed.Success) {
		return StudioGeneratedShot{}, errors.New("text provider returned an error response")
	}
	if len(parsed.Choices) == 0 {
		return StudioGeneratedShot{}, errors.New("text provider returned no text (response has no choices)")
	}
	choice := parsed.Choices[0]
	content := studioChatContentText(choice.Message.Content)
	if strings.TrimSpace(content) != "" {
		return parseStudioGeneratedShot(content)
	}
	if choice.FinishReason == "tool_calls" || studioHasToolCalls(choice.Message.ToolCalls) {
		return StudioGeneratedShot{}, errors.New("text provider returned tool calls instead of text")
	}
	if choice.FinishReason == "content_filter" || choice.Message.Refusal != "" {
		return StudioGeneratedShot{}, errors.New("text provider did not return text because the output was filtered or refused")
	}
	if choice.Message.ReasoningContent != "" {
		return StudioGeneratedShot{}, errors.New("text provider returned reasoning without final text")
	}
	return StudioGeneratedShot{}, errors.New("text provider returned no text")
}

func parseStudioGeneratedShot(content string) (StudioGeneratedShot, error) {
	content = strings.TrimSpace(content)
	if strings.HasPrefix(content, "```") && strings.HasSuffix(content, "```") {
		_, body, found := strings.Cut(content, "\n")
		if found {
			content = strings.TrimSpace(strings.TrimSuffix(body, "```"))
		}
	}
	var shot StudioGeneratedShot
	if err := common.Unmarshal([]byte(content), &shot); err != nil ||
		strings.TrimSpace(shot.Text) == "" ||
		strings.TrimSpace(shot.ImagePrompt) == "" ||
		strings.TrimSpace(shot.VideoPrompt) == "" ||
		len(shot.Text) > 30000 || len(shot.ImagePrompt) > 30000 || len(shot.VideoPrompt) > 30000 {
		return StudioGeneratedShot{}, errors.New("text model did not return a usable shot; try another model or use manual text")
	}
	shot.Text = strings.TrimSpace(shot.Text)
	shot.ImagePrompt = strings.TrimSpace(shot.ImagePrompt)
	shot.VideoPrompt = strings.TrimSpace(shot.VideoPrompt)
	return shot, nil
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
