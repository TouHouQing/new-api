package service

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	_ "golang.org/x/image/webp"
)

const (
	studioModelsMaxResponse = 2 << 20
	studioTextMaxResponse   = 2 << 20
	studioImageMaxResponse  = 24 << 20
	studioImageMaxInput     = 8 << 20
	studioShotSystemPrompt  = `你是 AI 视频创作画布的镜头提示词编剧。用户输入的是创作想法，不是与你聊天。请将它写成一个可用于生图和生视频的单镜头设定，并保留用户指定的人物、场景、风格和动作。
只输出一个合法 JSON 对象，不要 Markdown、解释、寒暄、问句、选项、工作计划或工具/API 描述。字段必须是：
{"text":"简短的画面设定","image_prompt":"用于生成首帧图片的主体、环境、构图、光线和风格描述","video_prompt":"同一镜头中主体与环境的具体运动、镜头运动及时间变化"}
video_prompt 应聚焦可见的动作和镜头变化；image_prompt 应描述静态画面。使用与用户输入相同的语言。三个字段都必须是非空字符串。`
	studioPlainTextSystemPrompt = `You write a single production-ready creative prompt for an AI video creation canvas. Rewrite the user's idea into concrete visible subjects, setting, composition, style, and action. Preserve their intent and language. Return only the prompt as plain text. Do not return JSON, Markdown fences, greetings, questions, alternatives, implementation plans, or API instructions.`
)

var ErrStudioImageRequestInvalid = errors.New("Studio image request is invalid")

type StudioGeneratedShot struct {
	Text        string `json:"text"`
	ImagePrompt string `json:"image_prompt"`
	VideoPrompt string `json:"video_prompt"`
}

type StudioStoryboardShot struct {
	Title       string `json:"title"`
	Text        string `json:"text"`
	ImagePrompt string `json:"image_prompt"`
	VideoPrompt string `json:"video_prompt"`
}

type StudioImageRequest struct {
	Model   string   `json:"model"`
	Prompt  string   `json:"prompt"`
	Size    *string  `json:"size,omitempty"`
	Quality *string  `json:"quality,omitempty"`
	N       *int     `json:"n,omitempty"`
	Image   string   `json:"image,omitempty"`
	Images  []string `json:"images,omitempty"`
}

type studioImageEdit struct {
	request StudioImageRequest
	images  []studioImageInput
}

type studioImageInput struct {
	data      []byte
	mediaType string
	fileName  string
}

type studioProviderHTTPError struct {
	status int
}

func (err studioProviderHTTPError) Error() string {
	return fmt.Sprintf("Studio provider returned HTTP %d", err.status)
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
	contentType := "application/json"
	if body != nil {
		if edit, ok := body.(studioImageEdit); ok {
			var encoded bytes.Buffer
			writer := multipart.NewWriter(&encoded)
			for key, value := range map[string]string{"model": edit.request.Model, "prompt": edit.request.Prompt} {
				if err := writer.WriteField(key, value); err != nil {
					return nil, err
				}
			}
			if edit.request.Size != nil {
				if err := writer.WriteField("size", *edit.request.Size); err != nil {
					return nil, err
				}
			}
			if edit.request.Quality != nil {
				if err := writer.WriteField("quality", *edit.request.Quality); err != nil {
					return nil, err
				}
			}
			if edit.request.N != nil {
				if err := writer.WriteField("n", strconv.Itoa(*edit.request.N)); err != nil {
					return nil, err
				}
			}
			imageField := "image"
			if len(edit.images) > 1 {
				imageField = "image[]"
			}
			for _, imageInput := range edit.images {
				partHeader := make(textproto.MIMEHeader)
				partHeader.Set("Content-Disposition", fmt.Sprintf(`form-data; name="%s"; filename="%s"`, imageField, imageInput.fileName))
				partHeader.Set("Content-Type", imageInput.mediaType)
				part, err := writer.CreatePart(partHeader)
				if err != nil {
					return nil, err
				}
				if _, err := part.Write(imageInput.data); err != nil {
					return nil, err
				}
			}
			if err := writer.Close(); err != nil {
				return nil, err
			}
			contentType = writer.FormDataContentType()
			requestBody = &encoded
		} else {
			encoded, err := common.Marshal(body)
			if err != nil {
				return nil, err
			}
			requestBody = bytes.NewReader(encoded)
		}
	}
	request, err := http.NewRequestWithContext(ctx, method, baseURL+path, requestBody)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+apiKey)
	request.Header.Set("Accept", "application/json")
	if body != nil {
		request.Header.Set("Content-Type", contentType)
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
		return nil, studioProviderHTTPError{status: response.StatusCode}
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
	content, err := studioTextCompletionContent(data)
	if err != nil {
		return StudioGeneratedShot{}, err
	}
	return parseStudioGeneratedShot(content)
}

func GenerateStudioProviderPlainText(ctx context.Context, provider *model.StudioProvider, modelName, prompt string, client *http.Client) (string, error) {
	if provider == nil || provider.Kind != "text" {
		return "", errors.New("text provider is not configured")
	}
	if err := validStudioModelAndPrompt(modelName, prompt); err != nil {
		return "", err
	}
	request := map[string]any{
		"model": modelName,
		"messages": []map[string]string{
			{"role": "system", "content": studioPlainTextSystemPrompt},
			{"role": "user", "content": prompt},
		},
		"stream": false,
	}
	data, err := callStudioProvider(ctx, provider, http.MethodPost, "/chat/completions", request, studioTextMaxResponse, client)
	if err != nil {
		return "", err
	}
	content, err := studioTextCompletionContent(data)
	if err != nil {
		return "", err
	}
	content = strings.TrimSpace(content)
	if content == "" || len(content) > 30000 {
		return "", errors.New("text model did not return a usable prompt; try another model or write the prompt manually")
	}
	return content, nil
}

func GenerateStudioProviderStoryboard(ctx context.Context, provider *model.StudioProvider, modelName, prompt string, count int, client *http.Client) ([]StudioStoryboardShot, error) {
	if provider == nil || provider.Kind != "text" {
		return nil, errors.New("text provider is not configured")
	}
	if err := validStudioModelAndPrompt(modelName, prompt); err != nil {
		return nil, err
	}
	if count < 1 || count > 12 {
		return nil, errors.New("storyboard count must be between 1 and 12")
	}
	request := map[string]any{
		"model": modelName,
		"messages": []map[string]string{
			{"role": "system", "content": fmt.Sprintf(`You write storyboard drafts for AI video creation. The user's input is a creative brief, not a chat message. Return exactly one valid JSON object with this shape: {"shots":[{"title":"short shot title","text":"visible scene description","image_prompt":"static first-frame composition, subjects, setting, lighting and style","video_prompt":"visible subject and camera motion over time"}]}. Create %d coherent shots in narrative order, preserving requested people, setting, style and action. Use the same language as the user's input for every field. Every field must be a nonempty string. Output JSON only: no Markdown, prose, questions, alternatives, tools, or API descriptions.`, count)},
			{"role": "user", "content": prompt},
		},
		"stream": false,
	}
	data, err := callStudioProvider(ctx, provider, http.MethodPost, "/chat/completions", request, studioTextMaxResponse, client)
	if err != nil {
		return nil, err
	}
	content, err := studioTextCompletionContent(data)
	if err != nil {
		return nil, err
	}
	content = strings.TrimSpace(content)
	if strings.HasPrefix(content, "```") && strings.HasSuffix(content, "```") {
		_, body, found := strings.Cut(content, "\n")
		if found {
			content = strings.TrimSpace(strings.TrimSuffix(body, "```"))
		}
	}
	var draft struct {
		Shots []StudioStoryboardShot `json:"shots"`
	}
	if err := common.Unmarshal([]byte(content), &draft); err != nil || len(draft.Shots) < 1 || len(draft.Shots) > count {
		return nil, errors.New("text model did not return a usable storyboard; try another model or write shots manually")
	}
	for i := range draft.Shots {
		shot := &draft.Shots[i]
		shot.Title = strings.TrimSpace(shot.Title)
		shot.Text = strings.TrimSpace(shot.Text)
		shot.ImagePrompt = strings.TrimSpace(shot.ImagePrompt)
		shot.VideoPrompt = strings.TrimSpace(shot.VideoPrompt)
		if shot.Title == "" || shot.Text == "" || shot.ImagePrompt == "" || shot.VideoPrompt == "" ||
			len(shot.Title) > 200 || len(shot.Text) > 30000 || len(shot.ImagePrompt) > 30000 || len(shot.VideoPrompt) > 30000 {
			return nil, errors.New("text model did not return a usable storyboard; try another model or write shots manually")
		}
	}
	return draft.Shots, nil
}

func studioTextCompletionContent(data []byte) (string, error) {
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
			return "", errors.New("text provider returned HTML instead of API JSON; check the service Base URL (usually ends in /v1)")
		}
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
	images, err := GenerateStudioProviderImages(ctx, provider, StudioImageRequest{Model: modelName, Prompt: prompt}, client)
	if err != nil {
		return "", err
	}
	return images[0], nil
}

func GenerateStudioProviderImages(ctx context.Context, provider *model.StudioProvider, request StudioImageRequest, client *http.Client) ([]string, error) {
	if provider == nil || provider.Kind != "image" {
		return nil, errors.New("image provider is not configured")
	}
	if err := validStudioModelAndPrompt(request.Model, request.Prompt); err != nil {
		return nil, err
	}
	if request.Size != nil {
		width, height, found := strings.Cut(*request.Size, "x")
		w, werr := strconv.Atoi(width)
		h, herr := strconv.Atoi(height)
		if *request.Size != "auto" && (!found || werr != nil || herr != nil || w < 1 || w > 4096 || h < 1 || h > 4096) {
			return nil, fmt.Errorf("%w: image size is invalid", ErrStudioImageRequestInvalid)
		}
	}
	if request.Quality != nil {
		switch *request.Quality {
		case "auto", "low", "medium", "high", "standard", "hd":
		default:
			return nil, fmt.Errorf("%w: image quality is invalid", ErrStudioImageRequestInvalid)
		}
	}
	if request.N != nil && (*request.N < 1 || *request.N > 10) {
		return nil, fmt.Errorf("%w: image count must be between 1 and 10", ErrStudioImageRequestInvalid)
	}
	path := "/images/generations"
	jsonBody := map[string]any{"model": request.Model, "prompt": request.Prompt}
	if request.Size != nil {
		jsonBody["size"] = *request.Size
	}
	if request.Quality != nil {
		jsonBody["quality"] = *request.Quality
	}
	if request.N != nil {
		jsonBody["n"] = *request.N
	}
	var body any = jsonBody
	if request.Image != "" && request.Images != nil {
		return nil, fmt.Errorf("%w: use either image or images", ErrStudioImageRequestInvalid)
	}
	if request.Images != nil && (len(request.Images) < 1 || len(request.Images) > 8) {
		return nil, fmt.Errorf("%w: image references must contain 1 to 8 images", ErrStudioImageRequestInvalid)
	}
	imageURIs := request.Images
	if request.Image != "" {
		imageURIs = []string{request.Image}
	}
	if len(imageURIs) > 0 {
		imageInputs := make([]studioImageInput, 0, len(imageURIs))
		totalBytes := 0
		for _, imageURI := range imageURIs {
			if len(imageURI) > (studioImageMaxInput*4/3)+128 {
				return nil, fmt.Errorf("%w: image input is too large", ErrStudioImageRequestInvalid)
			}
			header, encoded, found := strings.Cut(imageURI, ",")
			mediaType := strings.TrimSuffix(strings.TrimPrefix(header, "data:"), ";base64")
			fileName := ""
			formatName := ""
			switch mediaType {
			case "image/png":
				fileName = "image.png"
				formatName = "png"
			case "image/jpeg":
				fileName = "image.jpg"
				formatName = "jpeg"
			case "image/webp":
				fileName = "image.webp"
				formatName = "webp"
			}
			if !found || header != "data:"+mediaType+";base64" || fileName == "" {
				return nil, fmt.Errorf("%w: image input must be a PNG, JPEG or WebP base64 data URI", ErrStudioImageRequestInvalid)
			}
			imageData, err := base64.StdEncoding.Strict().DecodeString(encoded)
			if err != nil || len(imageData) == 0 || len(imageData) > studioImageMaxInput {
				return nil, fmt.Errorf("%w: image input is invalid", ErrStudioImageRequestInvalid)
			}
			totalBytes += len(imageData)
			if totalBytes > studioImageMaxInput {
				return nil, fmt.Errorf("%w: image references are too large", ErrStudioImageRequestInvalid)
			}
			config, decodedFormat, err := image.DecodeConfig(bytes.NewReader(imageData))
			if err != nil || decodedFormat != formatName || config.Width < 1 || config.Height < 1 || config.Width > 8192 || config.Height > 8192 || config.Width*config.Height > 20_000_000 {
				return nil, fmt.Errorf("%w: image input is invalid", ErrStudioImageRequestInvalid)
			}
			imageInputs = append(imageInputs, studioImageInput{data: imageData, mediaType: mediaType, fileName: fileName})
		}
		path = "/images/edits"
		body = studioImageEdit{request: request, images: imageInputs}
	}
	data, err := callStudioProvider(ctx, provider, http.MethodPost, path, body, studioImageMaxResponse, client)
	if err != nil {
		var upstreamError studioProviderHTTPError
		if len(imageURIs) > 1 && errors.As(err, &upstreamError) && (upstreamError.status == http.StatusBadRequest || upstreamError.status == http.StatusUnsupportedMediaType || upstreamError.status == http.StatusUnprocessableEntity) {
			return nil, errors.New("image provider rejected multiple reference images; choose one image or use a service that supports multiple image edits")
		}
		return nil, err
	}
	var parsed struct {
		Data []struct {
			URL     string `json:"url"`
			B64JSON string `json:"b64_json"`
		} `json:"data"`
	}
	if err := common.Unmarshal(data, &parsed); err != nil || len(parsed.Data) == 0 {
		return nil, errors.New("image provider returned no image")
	}
	images := make([]string, 0, len(parsed.Data))
	for _, item := range parsed.Data {
		if strings.HasPrefix(item.URL, "https://") || strings.HasPrefix(item.URL, "http://") {
			images = append(images, item.URL)
			continue
		}
		if item.B64JSON != "" {
			images = append(images, "data:image/png;base64,"+item.B64JSON)
		}
	}
	if len(images) == 0 {
		return nil, errors.New("image provider returned no image")
	}
	return images, nil
}
