package router

import (
	"context"
	"errors"
	"fmt"
	"math"
	"net/url"
	"os"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"yingce/backend/pkg/integration"
)

type workbenchLocalProfile struct {
	ModelID     string         `json:"modelId"`
	Action      string         `json:"action"`
	Support     string         `json:"support"`
	Readiness   string         `json:"readiness"`
	Constraints map[string]any `json:"constraints"`
}

// OpenAI-compatible channels default to the chat endpoint in the pricing
// catalog, including legacy video SKUs. Match known video families only;
// explicit image/video endpoints and verified local capabilities take priority.
var workbenchVideoModelName = regexp.MustCompile(`(?i)(?:^|[^a-z0-9])(?:wanx?[-_.]?[0-9]|seedance[-_.]?[0-9]|ttseadanco[-_.]?[0-9]|nsfw[-_]2\.0(?:[-_]|$)|grok[-_]imagine[-_]video(?:[-_]|$)|sora[-_.]?[0-9]|veo[-_.]?[0-9]|kling[-_.]?[0-9]|hunyuan[-_]?video|minimax[-_]?h[0-9]|hailuo[-_.]?[0-9])`)
var workbenchVideoResolutionSuffix = regexp.MustCompile(`(?i)[-_](480p|720p|768p|1080p|2k|4k)$`)
var workbenchImageModelName = regexp.MustCompile(`(?i)(?:^|[^a-z0-9])(?:seedream[-_.]?[0-9]|gpt[-_]?image|dall[-_]?e(?:[-_]|$)|flux(?:[-_.]|$)|imagen[-_.]?[0-9])`)

func workbenchResponsesOnly(price model.Pricing) bool {
	return !slices.Contains(price.SupportedEndpointTypes, constant.EndpointTypeOpenAI) && (slices.Contains(price.SupportedEndpointTypes, constant.EndpointTypeOpenAIResponse) || slices.Contains(price.SupportedEndpointTypes, constant.EndpointTypeOpenAIResponseCompact))
}

var workbenchCapabilitiesCache struct {
	sync.Mutex
	base     string
	at       time.Time
	profiles []workbenchLocalProfile
	err      error
}

func workbenchLocalProfiles(ctx context.Context) ([]workbenchLocalProfile, error) {
	base := os.Getenv("STUDIO_LOCAL_MODEL_URL")
	if base == "" {
		return nil, nil
	}
	cache := &workbenchCapabilitiesCache
	cache.Lock()
	defer cache.Unlock()
	if cache.base == base && time.Since(cache.at) < 5*time.Second {
		return cache.profiles, cache.err
	}
	snapshot, err := service.StudioCapabilityProfiles(ctx)
	var profiles []workbenchLocalProfile
	if err == nil {
		data, e := common.Marshal(snapshot)
		if e != nil {
			err = e
		} else {
			var document struct {
				Profiles []workbenchLocalProfile `json:"profiles"`
			}
			err = common.Unmarshal(data, &document)
			profiles = document.Profiles
		}
	}
	cache.base, cache.at, cache.profiles, cache.err = base, time.Now(), profiles, err
	return profiles, err
}

func workbenchGenerationCapabilities(price model.Pricing, profiles []workbenchLocalProfile, local bool) []string {
	if local {
		var result []string
		for _, profile := range profiles {
			if profile.ModelID != price.ModelName || profile.Support != "supported" || profile.Readiness != "ready" {
				continue
			}
			if slices.Contains([]string{"text", "image", "video", "audio"}, profile.Action) && !slices.Contains(result, profile.Action) {
				result = append(result, profile.Action)
			}
		}
		return result
	}
	var result []string
	if slices.Contains(price.SupportedEndpointTypes, constant.EndpointTypeImageGeneration) {
		result = append(result, "image")
	}
	if slices.Contains(price.SupportedEndpointTypes, constant.EndpointTypeOpenAIVideo) {
		result = append(result, "video")
	}
	if len(result) > 0 {
		return result
	}
	if slices.Contains(price.SupportedEndpointTypes, constant.EndpointTypeOpenAI) {
		if workbenchVideoModelName.MatchString(price.ModelName) {
			return []string{"video"}
		}
		if workbenchImageModelName.MatchString(price.ModelName) {
			return []string{"image"}
		}
	}
	if workbenchResponsesOnly(price) {
		return []string{"text"}
	}
	if strings.Contains(strings.ToLower(price.ModelName), "tts") || strings.HasPrefix(price.ModelName, "chatterbox-") {
		return []string{"audio"}
	}
	for _, endpoint := range []constant.EndpointType{constant.EndpointTypeOpenAI, constant.EndpointTypeOpenAIResponse, constant.EndpointTypeOpenAIResponseCompact, constant.EndpointTypeAnthropic, constant.EndpointTypeGemini} {
		if slices.Contains(price.SupportedEndpointTypes, endpoint) {
			return []string{"text"}
		}
	}
	return nil
}

func workbenchCapabilityContract(name, capability, protocol string, profiles []workbenchLocalProfile, local bool) (map[string]any, error) {
	if !local && capability != "video" {
		return nil, nil
	}
	profile, err := integration.DefaultCapability(protocol, name)
	if err != nil {
		return nil, err
	}
	if !local {
		video, _ := profile["video"].(map[string]any)
		video["duration"] = map[string]any{"selection": "range", "min": 1, "max": relaycommon.MaxTaskDurationSeconds, "step": 1, "default": 5}
		// Resolution-specific SKUs must not inherit a different generic default.
		if suffix := workbenchVideoResolutionSuffix.FindStringSubmatch(name); len(suffix) == 2 {
			resolution := strings.ToLower(suffix[1])
			video["resolutions"] = []string{resolution}
			video["defaultResolution"] = resolution
		} else if strings.HasPrefix(strings.ToLower(name), "ttseadanco") && (strings.HasSuffix(name, "-480") || strings.HasSuffix(name, "-720")) {
			_, resolution, _ := strings.Cut(name, "-")
			video["resolutions"] = []string{resolution + "p"}
			video["defaultResolution"] = resolution + "p"
		}
		if name == "特价seedance-2.5-720p" {
			video["duration"] = map[string]any{"selection": "enum", "values": []int{30}, "default": 30}
		}
		if strings.EqualFold(name, "MiniMax-H3") {
			video["resolutions"] = []string{"768p", "2k"}
			video["defaultResolution"] = "768p"
			video["duration"] = map[string]any{"selection": "range", "min": 4, "max": 15, "step": 1, "default": 5}
			video["references"].(map[string]any)["maxImages"] = 2
		}
		return profile, nil
	}
	var limits map[string]any
	vision := false
	for _, item := range profiles {
		if item.ModelID != name || item.Readiness != "ready" || item.Support != "supported" {
			continue
		}
		if item.Action == capability {
			limits = item.Constraints
		}
		if item.Action == "vision_analysis" {
			vision = true
		}
	}
	if limits == nil {
		return nil, errors.New("local model capability is unavailable")
	}
	switch capability {
	case "text":
		text, _ := profile["text"].(map[string]any)
		text["streaming"] = false
		text["contextWindowTokens"] = 32768
		text["maxOutputTokens"] = 8192
		if window := numberFromCapability(limits["contextWindowTokens"]); window >= 4096 && window <= 1_000_000 {
			text["contextWindowTokens"] = int(window)
			text["maxOutputTokens"] = min(8192, int(window)/4)
			if output := numberFromCapability(limits["maxOutputTokens"]); output >= 256 && output < window {
				text["maxOutputTokens"] = int(output)
			}
		}
		refs, _ := text["references"].(map[string]any)
		refs["maxImages"] = 0
		if vision {
			refs["maxImages"] = limits["maxReferences"]
		}
		refs["maxImageBytes"] = 8 << 20
	case "image":
		image, _ := profile["image"].(map[string]any)
		refs, _ := image["references"].(map[string]any)
		refs["maxImages"] = limits["maxReferences"]
		refs["maskSupported"] = false
		image["maxOutputs"] = 10
		image["size"] = map[string]any{"parameter": "size", "values": []string{"512x512", "1024x576", "576x1024", "1024x1024"}, "default": "512x512", "allowCustom": false, "presets": []any{}, "defaultTier": ""}
		image["quality"] = map[string]any{"supported": false, "values": []string{}, "default": ""}
		image["resolution"] = map[string]any{"supported": false, "values": []string{}, "default": ""}
		image["transparentBackground"] = map[string]any{"supported": false, "default": false}
		image["outputFormat"] = map[string]any{"supported": false}
	case "video":
		video, _ := profile["video"].(map[string]any)
		maxSeconds := numberFromCapability(limits["maxSeconds"])
		// VACE's longer mode requires a different low-resolution workflow;
		// keep this basic profile within the verified short-shot combination.
		if name == "wan2.1-vace-1.3b" {
			maxSeconds = min(maxSeconds, 10)
		}
		refs, _ := video["references"].(map[string]any)
		refs["maxImages"] = min(1, int(numberFromCapability(limits["maxReferences"])))
		refs["maxVideos"] = 0
		refs["maxAudios"] = 0
		video["duration"] = map[string]any{"selection": "range", "min": 1, "max": maxSeconds, "step": 1, "default": min(5, int(maxSeconds))}
		video["ratios"] = []string{"16:9", "9:16", "1:1"}
		video["defaultRatio"] = "16:9"
		video["resolutions"] = []string{"384p"}
		video["defaultResolution"] = "384p"
		video["operations"] = []string{"text_to_video", "image_to_video"}
		video["defaultOperation"] = "text_to_video"
		video["generateAudio"] = map[string]any{"supported": false, "default": false}
		video["watermark"] = map[string]any{"supported": false, "default": false}
	}
	return profile, nil
}

func numberFromCapability(value any) float64 { number, _ := value.(float64); return number }

// Some native task plugins publish only status on /v1/videos while retaining
// the completed CDN URL in the owned receipt. Project that URL for workbench
// downloads without exposing provider credentials or requiring /content.
func workbenchVideoReceiptResponse(body []byte, receipt *model.Task) []byte {
	if receipt.Status != model.TaskStatusSuccess {
		return body
	}
	link := receipt.GetResultURL()
	u, err := url.Parse(link)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil {
		return body
	}
	var response map[string]any
	if common.Unmarshal(body, &response) != nil || response == nil {
		return body
	}
	if existing, _ := response["url"].(string); existing != "" {
		return body
	}
	response["url"] = link
	encoded, err := common.Marshal(response)
	if err != nil {
		return body
	}
	return encoded
}

// Local workflows have verified frame sizes rather than arbitrary aspect ratio
// dimensions. Preserve orientation and return the engine's actual frame size.
func workbenchVideoSize(ctx context.Context, modelName, size string) (string, error) {
	profiles, err := workbenchLocalProfiles(ctx)
	if err != nil {
		// A failed local worker must not block an external New API channel.
		// Explicitly configured local models still require verified frame sizes.
		for local := range strings.SplitSeq(os.Getenv("STUDIO_LOCAL_CAPABILITY_MODELS"), ",") {
			if strings.TrimSpace(local) == modelName {
				return "", err
			}
		}
		return size, nil
	}
	for _, profile := range profiles {
		if profile.ModelID != modelName || profile.Action != "video" || profile.Readiness != "ready" || profile.Support != "supported" {
			continue
		}
		resolutions, ok := profile.Constraints["resolutions"].([]any)
		if !ok {
			return size, nil
		}
		widthText, heightText, ok := strings.Cut(size, "x")
		if !ok {
			widthText, heightText, ok = strings.Cut(size, ":")
		}
		if !ok {
			return "", errors.New("invalid local video size")
		}
		width, e1 := strconv.ParseFloat(widthText, 64)
		height, e2 := strconv.ParseFloat(heightText, 64)
		if e1 != nil || e2 != nil || math.IsNaN(width) || math.IsNaN(height) || math.IsInf(width, 0) || math.IsInf(height, 0) || width <= 0 || height <= 0 || width > 8192 || height > 8192 {
			return "", errors.New("invalid local video size")
		}
		best := ""
		distance := math.Inf(1)
		for _, value := range resolutions {
			resolution, _ := value.(map[string]any)
			w, h := numberFromCapability(resolution["width"]), numberFromCapability(resolution["height"])
			if w <= 0 || h <= 0 {
				continue
			}
			difference := math.Abs(math.Log((width / height) / (w / h)))
			if difference < distance {
				distance = difference
				best = fmt.Sprintf("%dx%d", int(w), int(h))
			}
		}
		if best == "" {
			return "", errors.New("local video has no verified frame size")
		}
		return best, nil
	}
	return size, nil
}
