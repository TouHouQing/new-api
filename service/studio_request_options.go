package service

import (
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
)

func StudioRequestOptions(raw string) (map[string]any, error) {
	result := map[string]any{}
	if strings.TrimSpace(raw) == "" {
		return result, nil
	}
	if len(raw) > 16384 || common.Unmarshal([]byte(raw), &result) != nil || result == nil {
		return nil, errors.New("request options must be a JSON object up to 16 KiB")
	}
	var validate func(any, int) error
	validate = func(value any, depth int) error {
		if depth > 8 {
			return errors.New("request options are too deeply nested")
		}
		switch item := value.(type) {
		case map[string]any:
			for key, value := range item {
				switch strings.ToLower(key) {
				case "__proto__", "constructor", "prototype", "api_key", "apikey", "authorization", "token", "secret":
					return errors.New("credentials and unsafe keys are not allowed in request options")
				}
				if strings.EqualFold(key, "seconds") || strings.EqualFold(key, "duration") {
					seconds, ok := value.(float64)
					if text, isString := value.(string); isString {
						var err error
						seconds, err = strconv.ParseFloat(text, 64)
						ok = err == nil
					}
					if !ok || math.IsNaN(seconds) || math.IsInf(seconds, 0) || seconds <= 0 || seconds > relaycommon.MaxTaskDurationSeconds {
						return errors.New("request duration is outside the supported range")
					}
				}
				if strings.EqualFold(key, "n") || strings.EqualFold(key, "image_count") {
					count, ok := value.(float64)
					if !ok || count != math.Trunc(count) || count < 1 || count > dto.MaxImageN {
						return errors.New("image count is outside the supported range")
					}
				}
				if err := validate(value, depth+1); err != nil {
					return err
				}
			}
		case []any:
			for _, value := range item {
				if err := validate(value, depth+1); err != nil {
					return err
				}
			}
		}
		return nil
	}
	if err := validate(result, 0); err != nil {
		return nil, err
	}
	return result, nil
}

// These are the constraints of our bundled local Wan adapter, not guessed
// limits of remote models. Reject them before any upstream dependency runs.
func validateStudioLocalVideoConfiguration(data map[string]any) error {
	if data["kind"] != "video" || (data["model"] != "wan2.2-ti2v-5b" && data["model"] != "wan2.1-vace-1.3b") {
		return nil
	}
	vace := data["model"] == "wan2.1-vace-1.3b"
	maxSeconds, maxFrames := 10.0, 241.0
	width, height := 640, 384
	if vace {
		maxSeconds, maxFrames = 30, 481
	}
	if data["ratio"] == "9:16" {
		width, height = height, width
	}
	if data["ratio"] == "1:1" {
		width, height = 512, 512
	}
	if resolution, ok := data["resolution"].(string); ok && resolution != "" {
		if vace && resolution != "640x480" && resolution != "480x640" && resolution != "512x512" && resolution != "640x384" && resolution != "384x640" && resolution != "384x224" && resolution != "224x384" {
			return errors.New("local VACE supports 640x480, 480x640 or 512x512")
		}
		w, h, split := strings.Cut(resolution, "x")
		if split {
			width, _ = strconv.Atoi(w)
			height, _ = strconv.Atoi(h)
		}
	}
	seconds := 5.0
	requestedFrames := 0.0
	if value, ok := data["seconds"].(float64); ok {
		seconds = value
	}
	for _, key := range []string{"metadataJson", "payloadPatchJson"} {
		raw, _ := data[key].(string)
		options, err := StudioRequestOptions(raw)
		if err != nil {
			return err
		}
		if key == "payloadPatchJson" {
			if vace && options["mode"] == "extend" {
				return errors.New("local VACE continuation requires an extracted last frame")
			}
			if value, exists := options["size"]; exists {
				size, ok := value.(string)
				widthText, heightText, split := strings.Cut(size, "x")
				w, widthErr := strconv.Atoi(widthText)
				h, heightErr := strconv.Atoi(heightText)
				if !ok || !split || widthErr != nil || heightErr != nil || w < 64 || w > 1024 || h < 64 || h > 1024 || w%16 != 0 || h%16 != 0 {
					return errors.New("local video dimensions must be multiples of 16 between 64 and 1024")
				}
				width, height = w, h
			}
			for _, field := range []string{"seconds", "duration"} {
				if value, exists := options[field]; exists {
					seconds, err = strconv.ParseFloat(fmt.Sprint(value), 64)
					if err != nil {
						return errors.New("invalid local video duration")
					}
				}
			}
		}
		if key == "payloadPatchJson" {
			if metadata, ok := options["metadata"].(map[string]any); ok {
				options = metadata
			}
		}
		if value, exists := options["frames"]; exists {
			frames, ok := value.(float64)
			if !ok || frames != math.Trunc(frames) || frames < 5 || frames > maxFrames || int(frames-1)%4 != 0 {
				return errors.New("local video frames must be 4n+1 between 5 and 241")
			}
			requestedFrames = frames
		}
		if value, exists := options["fps"]; exists {
			fps, ok := value.(float64)
			if !ok || (vace && fps != 16) || (!vace && fps != 12 && fps != 16 && fps != 24) {
				return errors.New("local Wan frame rate must be 12, 16 or 24; local VACE uses 16")
			}
		}
		for _, dimension := range []string{"width", "height"} {
			if value, exists := options[dimension]; exists {
				number, ok := value.(float64)
				if !ok || number != math.Trunc(number) || number < 64 || number > 1024 || int(number)%16 != 0 {
					return errors.New("local video dimensions must be multiples of 16 between 64 and 1024")
				}
				if dimension == "width" {
					width = int(number)
				} else {
					height = int(number)
				}
			}
		}
	}
	if seconds < 1 || seconds > maxSeconds {
		return fmt.Errorf("this local video model supports 1 to %.0f seconds per clip; split longer shots", maxSeconds)
	}
	if vace {
		if (seconds > 10 || requestedFrames > 161) && (width != 384 || height != 224) && (width != 224 || height != 384) {
			return errors.New("long local VACE shots use 384x224 or 224x384 on this workstation")
		}
		if (width != 640 || height != 480) && (width != 480 || height != 640) && (width != 512 || height != 512) && (width != 640 || height != 384) && (width != 384 || height != 640) && (width != 384 || height != 224) && (width != 224 || height != 384) {
			return errors.New("local VACE supports 640x480, 480x640 or 512x512")
		}
		return nil
	}
	if resolution, ok := data["resolution"].(string); ok && resolution != "" && resolution != "640x384" && resolution != "384x640" && resolution != "512x512" && resolution != "384x224" && resolution != "224x384" {
		return errors.New("local Wan supports 640x384, 384x640, 512x512, 384x224 or 224x384; choose a supported frame size")
	}
	if (width != 640 || height != 384) && (width != 384 || height != 640) && (width != 512 || height != 512) && (width != 384 || height != 224) && (width != 224 || height != 384) {
		return errors.New("local Wan supports 640x384, 384x640, 512x512, 384x224 or 224x384")
	}
	return nil
}

func validateStudioLocalVideoConnections(document map[string]any, nodeID string, data map[string]any) error {
	modelName, _ := data["model"].(string)
	if data["kind"] != "video" || (modelName != "wan2.2-ti2v-5b" && modelName != "wan2.1-vace-1.3b") {
		return nil
	}
	counts := map[string]int{}
	seen := map[string]bool{}
	for _, edge := range studioObjects(document, "edges") {
		if edge["target"] != nodeID {
			continue
		}
		parentKind := ""
		for _, parent := range studioObjects(document, "nodes") {
			if parent["id"] == edge["source"] {
				parentData, _ := parent["data"].(map[string]any)
				parentKind, _ = parentData["kind"].(string)
			}
		}
		if parentKind != "image" && parentKind != "video" {
			continue
		}
		role, _ := edge["targetHandle"].(string)
		if role == "" {
			if parentKind == "video" {
				role = "reference_video"
			} else {
				role = "first_frame"
			}
		}
		if role == "extend_video" {
			role = "first_frame"
		}
		if role == "native_extend" {
			return errors.New("local video continuation uses an extracted last frame; native extend is unsupported")
		}
		if strings.HasPrefix(role, "reference_video") {
			role = "reference_video"
		}
		if strings.HasPrefix(role, "reference_image") {
			role = "reference_image"
		}
		if role != "first_frame" && role != "last_frame" && role != "reference_image" && role != "reference_video" {
			return errors.New("unsupported local video reference slot")
		}
		originalRole, _ := edge["targetHandle"].(string)
		if parentKind == "image" && role == "reference_video" || parentKind == "video" && role != "reference_video" && originalRole != "extend_video" {
			return errors.New("frame and character slots require images; movement slots require video")
		}
		identity := fmt.Sprint(edge["source"]) + ":" + role
		if seen[identity] {
			continue
		}
		seen[identity] = true
		counts[role]++
		if modelName == "wan2.2-ti2v-5b" && role != "first_frame" {
			return errors.New("local Wan uses one first-frame image; choose VACE for endpoints or movement references")
		}
		if counts[role] > 1 {
			return errors.New("this local video model accepts one source per reference slot")
		}
	}
	return nil
}
