package production

import (
	"fmt"
	"math"
)

// These fields are resolved from an owned native Resource by app. HTTP/Agent
// clients submit a resource identity, never a fabricated media description.
type TimelineEditMedia struct {
	ClipID        string
	ResourceID    string
	Kind          string
	MIME          string
	ETag          string
	Bytes         int64
	Width, Height int
	DurationMs    int64
	Title         string
	CanvasOrigin  *CanvasCaptionOrigin
	CaptionCues   []CanvasCaptionCue
	SubtitleStyle any
	Highlights    any
}

func addTimelineEditResource(before map[string]any, command TimelineEditCommand) (map[string]any, error) {
	fail := func(message string) (map[string]any, error) { return nil, audioLinkError(message) }
	media := command.Media
	if media == nil || media.ResourceID != command.ResourceID || !markerText(media.ClipID, 128) || command.ID != "" || command.SourceStartMs != nil || command.SplitAtMs != nil || command.PlaybackRate != nil || command.SourceClipID != "" || command.Mode != "" {
		return fail("请使用已读取的原生素材，不接受自造的媒体信息")
	}
	if media.Kind != "video" && media.Kind != "audio" && media.Kind != "image" {
		return fail("只能把图片、视频或声音加入剪辑")
	}
	length := media.DurationMs
	if media.Kind == "image" {
		length = 4000
	}
	if command.DurationMs != nil {
		length = *command.DurationMs
	}
	if length <= 0 || length > 86400000 || media.Kind != "image" && (media.DurationMs <= 0 || length > media.DurationMs) {
		return fail("素材时长尚未就绪或裁剪超出原片，请先读取完整素材")
	}
	rows := listValue(before["clips"])
	tracks := append([]any{}, listValue(before["tracks"])...)
	for _, row := range rows {
		if stringValue(objectValue(row), "id") == media.ClipID {
			return fail("此素材已加入，请先核对原操作回执")
		}
	}
	compatible := func(track map[string]any) bool {
		kind := stringValue(track, "kind")
		return kind == media.Kind || media.Kind == "image" && kind == "video"
	}
	var target map[string]any
	hasCompatible := false
	for _, row := range tracks {
		track := objectValue(row)
		if command.TrackID != "" {
			if stringValue(track, "id") == command.TrackID {
				target = track
				break
			}
			continue
		}
		if compatible(track) {
			hasCompatible = true
			if target == nil {
				target = track
			}
			if track["locked"] != true {
				target = track
				break
			}
		}
	}
	if command.TrackID != "" && (target == nil || !compatible(target)) {
		return fail("目标轨道不存在或类型不匹配")
	}
	if target == nil && !hasCompatible && command.TrackID == "" {
		kind, label := media.Kind, map[string]string{"video": "画面", "audio": "声音", "image": "画面"}[media.Kind]
		if kind == "image" {
			kind = "video"
		}
		used := map[string]bool{}
		order := float64(-1)
		for index, row := range tracks {
			track := objectValue(row)
			used[stringValue(track, "id")] = true
			if value, valid := audioNumber(track["order"]); valid {
				order = max(order, value)
			} else {
				order = max(order, float64(index))
			}
		}
		id := "ingest-" + kind
		for suffix := 2; used[id]; suffix++ {
			id = fmt.Sprintf("ingest-%s-%d", kind, suffix)
		}
		target = map[string]any{"id": id, "kind": kind, "label": label, "order": audioInteger(order + 1)}
		tracks = append(tracks, target)
	}
	if target == nil || target["locked"] == true {
		return fail("目标轨道已锁定，请先解锁或新增轨道")
	}
	start := float64(0)
	trackID := stringValue(target, "id")
	for _, row := range rows {
		clip := objectValue(row)
		if stringValue(clip, "trackId") == trackID {
			start = max(start, audioEnd(clip))
		}
	}
	if command.StartMs != nil {
		start = float64(*command.StartMs)
	}
	if start < 0 || start+float64(length) > 86400000 || math.Trunc(start) != start {
		return fail("素材放置位置超出时间线范围")
	}
	for _, row := range rows {
		clip := objectValue(row)
		if stringValue(clip, "trackId") == trackID && start < audioEnd(clip) && start+float64(length) > audioValue(clip, "startMs") {
			return fail("目标位置已有片段，请选择空隙或新轨道")
		}
	}
	title := map[string]string{"video": "视频素材", "audio": "声音素材", "image": "图片素材"}[media.Kind]
	if media.Title != "" {
		title = media.Title
	}
	direct := map[string]any{"id": media.ResourceID, "kind": media.Kind, "title": title, "storageKey": "resource:" + media.ResourceID, "url": "/api/resources/" + media.ResourceID + "/file", "mimeType": media.MIME, "bytes": media.Bytes, "width": media.Width, "height": media.Height, "durationMs": media.DurationMs, "etag": media.ETag}
	clip := map[string]any{"id": media.ClipID, "kind": media.Kind, "nodeId": "resource:" + media.ResourceID, "trackId": trackID, "title": title, "startMs": audioInteger(start), "durationMs": audioInteger(float64(length)), "sourceStartMs": audioInteger(0), "volume": 1, "directMedia": direct}
	if media.CanvasOrigin != nil {
		clip["canvasOrigin"] = media.CanvasOrigin
	}
	if media.Kind != "image" {
		clip["sourceDurationMs"] = audioInteger(float64(media.DurationMs))
		clip["playbackRate"] = 1
	}
	after := copyTimelineClip(before)
	after["tracks"] = tracks
	after["clips"] = append(append([]any{}, rows...), clip)
	return after, nil
}
