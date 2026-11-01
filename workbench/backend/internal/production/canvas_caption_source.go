package production

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"unicode/utf8"
)

type CanvasCaptionCue struct {
	Index   int    `json:"index"`
	StartMs int64  `json:"startMs"`
	EndMs   int64  `json:"endMs"`
	Text    string `json:"text"`
}
type CanvasCaptionOrigin struct {
	CanvasID       string `json:"canvasId"`
	NodeID         string `json:"nodeId"`
	CanvasRevision int64  `json:"canvasRevision"`
	NodeSHA256     string `json:"nodeSha256"`
	ResourceID     string `json:"resourceId"`
}
type CanvasNodeCaptionSnapshot struct {
	ID             string             `json:"id"`
	Kind           string             `json:"kind"`
	Title          string             `json:"title"`
	ResourceID     string             `json:"resourceId"`
	AssetVersionID string             `json:"assetVersionId,omitempty"`
	Captions       []CanvasCaptionCue `json:"captions"`
	Style          any                `json:"subtitleStyle,omitempty"`
	Highlights     any                `json:"subtitleHighlights,omitempty"`
}

// Hash only the material and subtitle snapshot. Dragging a different node or
// changing an unrelated prompt does not change the already confirmed input.
func ParseCanvasCaptionSource(raw json.RawMessage, nodeID, resourceID, kind string, durationMs int64) (CanvasNodeCaptionSnapshot, string, error) {
	var source CanvasNodeCaptionSnapshot
	fail := func(message string) (CanvasNodeCaptionSnapshot, string, error) {
		return source, "", fmt.Errorf("%s", message)
	}
	if len(raw) == 0 || len(raw) > 8<<20 {
		return fail("节点数据超过限制，请分段整理画布")
	}
	var node struct {
		ID, Type, Title string
		Metadata        struct {
			StorageKey     string             `json:"storageKey"`
			AssetVersionID string             `json:"assetVersionId"`
			Entries        []CanvasCaptionCue `json:"subtitleEntries"`
			Style          any                `json:"subtitleStyle"`
			Highlights     any                `json:"subtitleHighlights"`
		}
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if err := decoder.Decode(&node); err != nil {
		return fail("节点字幕格式无效，请先在画布中检查")
	}
	if node.ID != nodeID || node.Type != kind || node.Metadata.StorageKey != "resource:"+resourceID {
		return fail("节点原片与所选文件不一致，请返回画布重新确认")
	}
	title := strings.TrimSpace(node.Title)
	if utf8.RuneCountInString(title) > 240 {
		return fail("素材名称过长，请先缩短名称")
	}
	if len(node.Metadata.Entries) > 4000 {
		return fail("节点字幕过多，请分段加入剪辑")
	}
	if kind != "video" && kind != "audio" && len(node.Metadata.Entries) > 0 {
		return fail("请把视频或声音的字幕加入剪辑；图片文字可在剪辑器中另行添加")
	}
	indexes := map[int]bool{}
	for _, entry := range node.Metadata.Entries {
		if entry.Index < 0 || entry.Index > 1000000 || entry.StartMs < 0 || entry.EndMs <= entry.StartMs || entry.EndMs > durationMs || strings.TrimSpace(entry.Text) == "" || utf8.RuneCountInString(entry.Text) > 2000 {
			return fail("字幕内容或时间超出原片，请在画布中整理后重试")
		}
		if indexes[entry.Index] {
			return fail("字幕序号重复，请先整理字幕")
		}
		indexes[entry.Index] = true
	}
	source = CanvasNodeCaptionSnapshot{ID: node.ID, Kind: kind, Title: title, ResourceID: resourceID, AssetVersionID: node.Metadata.AssetVersionID, Captions: node.Metadata.Entries, Style: node.Metadata.Style, Highlights: node.Metadata.Highlights}
	if source.Captions == nil {
		source.Captions = []CanvasCaptionCue{}
	}
	encoded, err := json.Marshal(source)
	if err != nil {
		return fail("字幕快照无法保存")
	}
	var safety map[string]any
	if json.Unmarshal(encoded, &safety) != nil {
		return fail("字幕快照无法读取")
	}
	if err := validateLegacyDocumentSafety(safety); err != nil {
		return fail("字幕快照含不适合保存的外部连接配置")
	}
	if err := validateCanvasCaptionPresentation(source); err != nil {
		return fail(err.Error())
	}
	sum := sha256.Sum256(encoded)
	return source, hex.EncodeToString(sum[:]), nil
}
