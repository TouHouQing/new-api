package production

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"strings"

	"yingce/backend/internal/assets"
)

type CanvasCutClip struct {
	ID               string  `json:"id"`
	NodeID           string  `json:"nodeId,omitempty"`
	Title            string  `json:"title"`
	Kind             string  `json:"kind"`
	StartMs          int64   `json:"startMs"`
	DurationMs       int64   `json:"durationMs"`
	SourceStartMs    int64   `json:"sourceStartMs"`
	PlaybackRate     float64 `json:"playbackRate"`
	PinnedResourceID string  `json:"pinnedResourceId,omitempty"`
	Text             string  `json:"text,omitempty"`
	NeedsText        bool    `json:"needsText,omitempty"`
	SourceWarning    string  `json:"sourceWarning,omitempty"`
}

type CanvasCutDefinition struct {
	SourceSHA256     string          `json:"sourceSha256"`
	OriginalTimeline json.RawMessage `json:"originalTimeline"`
	Timeline         json.RawMessage `json:"-"`
	Clips            []CanvasCutClip `json:"clips"`
}

type CanvasCutMapping struct {
	ClipID     string `json:"clipId"`
	ResourceID string `json:"resourceId"`
}

type CanvasCutText struct {
	ClipID string `json:"clipId"`
	Text   string `json:"text"`
}

type CanvasCutMediaOrigin struct {
	ClipID             string `json:"clipId"`
	ResourceID         string `json:"resourceId"`
	OriginalResourceID string `json:"originalResourceId,omitempty"`
	Resolution         string `json:"resolution"`
	ETag               string `json:"etag,omitempty"`
	Bytes              int64  `json:"bytes"`
}

// A node ID identifies a mutable canvas object, not a historic media take.
// Only a durable locator inside the saved clip is a pinned original; every
// other media occurrence requires its own explicit replacement selection.
func InspectCanvasTimelineCut(raw json.RawMessage) (CanvasCutDefinition, error) {
	var result CanvasCutDefinition
	clean, err := ValidateTimelineDocument(raw)
	if err != nil {
		return result, fmt.Errorf("原画布剪辑的版本、片段或时间无效，请保留原工程并先校正")
	}
	var original map[string]any
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if err := decoder.Decode(&original); err != nil {
		return result, err
	}
	originalJSON, err := json.Marshal(original)
	if err != nil {
		return result, err
	}
	var document map[string]any
	decoder = json.NewDecoder(bytes.NewReader(clean))
	decoder.UseNumber()
	if err := decoder.Decode(&document); err != nil {
		return result, err
	}
	result = CanvasCutDefinition{SourceSHA256: fmt.Sprintf("%x", sha256.Sum256(originalJSON)), OriginalTimeline: originalJSON, Timeline: clean, Clips: []CanvasCutClip{}}
	for _, value := range listValue(document["clips"]) {
		clip := objectValue(value)
		kind := stringValue(clip, "kind")
		row := CanvasCutClip{ID: stringValue(clip, "id"), NodeID: stringValue(clip, "nodeId"), Title: stringValue(clip, "title"), Kind: kind, StartMs: int64(audioValue(clip, "startMs")), DurationMs: int64(audioValue(clip, "durationMs")), SourceStartMs: int64(audioValue(clip, "sourceStartMs")), PlaybackRate: audioRate(clip)}
		if kind == "video" || kind == "audio" || kind == "image" {
			media := objectValue(clip["directMedia"])
			row.PinnedResourceID = assets.ResourceID(stringValue(media, "storageKey"))
			if row.PinnedResourceID == "" {
				row.PinnedResourceID = assets.ResourceID(stringValue(media, "url"))
			}
			if urlID := assets.ResourceID(stringValue(media, "url")); urlID != "" && row.PinnedResourceID != "" && urlID != row.PinnedResourceID {
				row.PinnedResourceID = ""
				row.SourceWarning = "原剪辑的两个素材地址不一致，请明确选择正确原片"
			}
		} else {
			if text, exists := clip["text"]; exists {
				if _, ok := text.(string); !ok {
					return CanvasCutDefinition{}, fmt.Errorf("文字片段 %s 的文本格式无效", row.ID)
				}
			}
			row.Text = stringValue(clip, "text")
			row.NeedsText = strings.TrimSpace(row.Text) == ""
		}
		result.Clips = append(result.Clips, row)
	}
	return result, nil
}

// Resolved media facts come only from owned originals inspected by app.
// Timing, track flags, repeated occurrences and source ranges are retained;
// a short replacement fails validation instead of silently trimming the edit.
func ConvertCanvasTimelineCut(source CanvasCutDefinition, mappings []CanvasCutMapping, textOverrides []CanvasCutText, media map[string]TimelineEditMedia) (json.RawMessage, []CanvasCutMediaOrigin, error) {
	selected := map[string]string{}
	texts := map[string]string{}
	known := map[string]CanvasCutClip{}
	for _, clip := range source.Clips {
		known[clip.ID] = clip
	}
	for _, row := range mappings {
		clip, exists := known[row.ClipID]
		if !exists || clip.Kind != "video" && clip.Kind != "audio" && clip.Kind != "image" || selected[row.ClipID] != "" || assets.ValidID(row.ResourceID) != row.ResourceID || row.ResourceID == "" {
			return nil, nil, fmt.Errorf("替换素材必须逐一对应具体的图片、视频或声音片段，不能重复选择")
		}
		selected[row.ClipID] = row.ResourceID
	}
	for _, row := range textOverrides {
		clip, exists := known[row.ClipID]
		if !exists || !clip.NeedsText || texts[row.ClipID] != "" || strings.TrimSpace(row.Text) == "" || len([]rune(row.Text)) > 2000 {
			return nil, nil, fmt.Errorf("只需为缺少文字的具体字幕或文字片段补充内容，不能重复或改写已有文字")
		}
		texts[row.ClipID] = row.Text
	}
	var document map[string]any
	decoder := json.NewDecoder(bytes.NewReader(source.Timeline))
	decoder.UseNumber()
	if err := decoder.Decode(&document); err != nil {
		return nil, nil, err
	}
	origins := []CanvasCutMediaOrigin{}
	for _, value := range listValue(document["clips"]) {
		clip := objectValue(value)
		original := known[stringValue(clip, "id")]
		if original.Kind == "text" || original.Kind == "subtitle" {
			if original.NeedsText {
				text := texts[original.ID]
				if text == "" {
					return nil, nil, fmt.Errorf("请为“%s”补充确切的文字；不能从已变化的节点猜测旧台词", original.ID)
				}
				clip["text"] = text
			}
			continue
		}
		resourceID, resolution := selected[original.ID], "explicit"
		if resourceID == "" {
			resourceID, resolution = original.PinnedResourceID, "pinned"
		}
		resource, exists := media[resourceID]
		if resourceID == "" || !exists || resource.ResourceID != resourceID || resource.Kind != original.Kind {
			return nil, nil, fmt.Errorf("请为“%s”选择已就绪的%s原片；节点的当前素材不能证明原剪辑的候选版本", original.ID, map[string]string{"video": "视频", "audio": "声音", "image": "图片"}[original.Kind])
		}
		title := original.Title
		oldDirect := objectValue(clip["directMedia"])
		if title == "" && original.PinnedResourceID == resourceID {
			title = stringValue(oldDirect, "title")
		}
		if title == "" {
			title = resource.Title
		}
		direct := map[string]any{"id": resourceID, "kind": resource.Kind, "title": title, "storageKey": "resource:" + resourceID, "bytes": resource.Bytes, "mimeType": resource.MIME}
		if original.PinnedResourceID == resourceID && stringValue(oldDirect, "assetId") != "" {
			direct["assetId"] = oldDirect["assetId"]
		}
		if resource.Kind != "audio" {
			if resource.Width <= 0 || resource.Height <= 0 {
				return nil, nil, fmt.Errorf("素材尺寸尚未就绪，请重新检查原片")
			}
			direct["width"], direct["height"] = resource.Width, resource.Height
		}
		if resource.Kind != "image" {
			if resource.DurationMs <= 0 {
				return nil, nil, fmt.Errorf("素材时长尚未就绪，请重新检查原片")
			}
			clip["sourceDurationMs"] = audioInteger(float64(resource.DurationMs))
			direct["durationMs"] = audioInteger(float64(resource.DurationMs))
		}
		clip["directMedia"] = direct
		if original.Title == "" {
			clip["title"] = title
		}
		origins = append(origins, CanvasCutMediaOrigin{ClipID: original.ID, ResourceID: resourceID, OriginalResourceID: original.PinnedResourceID, Resolution: resolution, ETag: resource.ETag, Bytes: resource.Bytes})
	}
	raw, err := json.Marshal(document)
	if err != nil {
		return nil, nil, err
	}
	converted, err := ValidateTimelineDocument(raw)
	if err != nil {
		return nil, nil, fmt.Errorf("替换素材不足以覆盖原剪辑区间，或原关联关系无效；请核对片段时长与速度，不会自动裁去内容")
	}
	return converted, origins, nil
}
