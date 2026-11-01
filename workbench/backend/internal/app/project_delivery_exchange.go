package app

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

type deliveryClip struct {
	ID               string  `json:"id"`
	Kind             string  `json:"kind"`
	Title            string  `json:"title"`
	TrackID          string  `json:"trackId"`
	StartMs          float64 `json:"startMs"`
	DurationMs       float64 `json:"durationMs"`
	SourceStartMs    float64 `json:"sourceStartMs"`
	SourceDurationMs float64 `json:"sourceDurationMs"`
	PlaybackRate     float64 `json:"playbackRate"`
	Text             string  `json:"text"`
	DirectMedia      struct {
		ID         string `json:"id"`
		StorageKey string `json:"storageKey"`
	} `json:"directMedia"`
}
type deliveryTimeline struct {
	Tracks []struct {
		ID      string `json:"id"`
		Label   string `json:"label"`
		Muted   bool   `json:"muted"`
		Visible *bool  `json:"visible"`
	} `json:"tracks"`
	Clips []deliveryClip `json:"clips"`
}

func projectDeliveryExchanges(snapshot repository.ProjectDeliverySnapshot, paths map[string]string) (map[string][]byte, []string, error) {
	files := map[string][]byte{}
	warnings := []string{}
	type edit struct {
		Name string
		Raw  json.RawMessage
	}
	edits := []edit{}
	var working struct {
		Timeline json.RawMessage `json:"timeline"`
	}
	if len(snapshot.Documents["timeline"]) > 0 {
		if err := json.Unmarshal(snapshot.Documents["timeline"], &working); err != nil {
			return nil, nil, err
		}
		edits = append(edits, edit{"working", working.Timeline})
	}
	var cuts []struct {
		Cut      model.ProjectCut `json:"cut"`
		Timeline json.RawMessage  `json:"timeline"`
	}
	if err := json.Unmarshal(snapshot.Documents["cuts"], &cuts); err != nil {
		return nil, nil, err
	}
	for _, cut := range cuts {
		if !deliveryID.MatchString(cut.Cut.ID) {
			return nil, nil, BadAuthRequest("剪辑版本编号无效")
		}
		edits = append(edits, edit{"cut-" + cut.Cut.ID, cut.Timeline})
	}
	for _, edit := range edits {
		var timeline deliveryTimeline
		if err := json.Unmarshal(edit.Raw, &timeline); err != nil {
			return nil, nil, err
		}
		sort.SliceStable(timeline.Clips, func(i, j int) bool {
			a, b := timeline.Clips[i], timeline.Clips[j]
			if a.StartMs != b.StartMs {
				return a.StartMs < b.StartMs
			}
			return a.ID < b.ID
		})
		tracks := []any{}
		subtitles := []string{}
		subtitleCount := 0
		for _, clip := range timeline.Clips {
			if clip.DurationMs <= 0 || clip.StartMs < 0 {
				return nil, nil, BadAuthRequest("时间线包含无效的片段时间")
			}
			if clip.Kind == "subtitle" {
				subtitleCount++
				subtitles = append(subtitles, fmt.Sprintf("%d\n%s --> %s\n%s\n", subtitleCount, deliverySRTTime(clip.StartMs), deliverySRTTime(clip.StartMs+clip.DurationMs), clip.Text))
				continue
			}
			if clip.Kind != "video" && clip.Kind != "image" && clip.Kind != "audio" {
				continue
			}
			id := clip.DirectMedia.ID
			if strings.HasPrefix(clip.DirectMedia.StorageKey, "resource:") {
				id = strings.TrimPrefix(clip.DirectMedia.StorageKey, "resource:")
			}
			if id == "" {
				warnings = append(warnings, edit.Name+": "+clip.ID+" 的画布来源保留在原生JSON，OTIO未猜测媒体")
				continue
			}
			target, exists := paths[id]
			if !exists {
				return nil, nil, BadAuthRequest("剪辑引用未打包的素材 " + id)
			}
			rate := clip.PlaybackRate
			if rate == 0 {
				rate = 1
			}
			if rate < 0 {
				return nil, nil, BadAuthRequest("剪辑包含不支持的反向时钟")
			}
			enabled := true
			trackName := clip.TrackID
			for _, track := range timeline.Tracks {
				if track.ID == clip.TrackID {
					trackName = track.Label
					enabled = !track.Muted && (track.Visible == nil || *track.Visible)
				}
			}
			children := []any{}
			if clip.StartMs > 0 {
				children = append(children, map[string]any{"OTIO_SCHEMA": "Gap.1", "name": "", "source_range": deliveryOTIORange(0, clip.StartMs)})
			}
			effects := []any{}
			if rate != 1 {
				effects = append(effects, map[string]any{"OTIO_SCHEMA": "LinearTimeWarp.1", "name": "Playback rate", "effect_name": "LinearTimeWarp", "time_scalar": rate, "metadata": map[string]any{}})
			}
			available := clip.SourceDurationMs
			if available == 0 && clip.Kind == "image" {
				available = clip.SourceStartMs + clip.DurationMs*rate
			}
			// OTIO duration remains program time. LinearTimeWarp controls source
			// consumption; multiplying this range would lengthen the edit twice.
			children = append(children, map[string]any{"OTIO_SCHEMA": "Clip.1", "name": clip.Title, "enabled": enabled, "source_range": deliveryOTIORange(clip.SourceStartMs, clip.DurationMs), "media_reference": map[string]any{"OTIO_SCHEMA": "ExternalReference.1", "target_url": target, "available_range": deliveryOTIORange(0, available), "metadata": map[string]any{"yingceResourceId": id}}, "effects": effects, "markers": []any{}, "metadata": map[string]any{"yingceClipId": clip.ID, "programStartMs": clip.StartMs, "programDurationMs": clip.DurationMs, "sourceConsumedMs": clip.DurationMs * rate}})
			kind := "Video"
			if clip.Kind == "audio" {
				kind = "Audio"
			}
			tracks = append(tracks, map[string]any{"OTIO_SCHEMA": "Track.1", "name": trackName + " / " + clip.ID, "kind": kind, "children": children, "metadata": map[string]any{"yingceTrackId": clip.TrackID}})
		}
		bytes, err := json.MarshalIndent(map[string]any{"OTIO_SCHEMA": "Timeline.1", "name": snapshot.Project.Name + " / " + edit.Name, "global_start_time": deliveryOTIOTime(0), "tracks": map[string]any{"OTIO_SCHEMA": "Stack.1", "children": tracks, "metadata": map[string]any{}}, "metadata": map[string]any{"yingceProjectId": snapshot.Project.ID, "nativeTimeline": json.RawMessage(edit.Raw), "interchange": "Source placement, source ranges and positive playback speed. Native effects, crop, subtitle presentation and mixing require review in the receiving editor."}}, "", "  ")
		if err != nil {
			return nil, nil, err
		}
		files["exchange/"+edit.Name+".otio"] = bytes
		files["exchange/"+edit.Name+".srt"] = []byte(strings.Join(subtitles, "\n"))
	}
	if len(edits) > 0 {
		warnings = append(warnings, "OTIO的字幕样式、构图、动效和混音以原生时间线为准；逐片段轨道保留绝对位置与重叠。SRT保留文字与时间，不包含样式。")
	}
	return files, warnings, nil
}
func deliveryOTIOTime(ms float64) any {
	return map[string]any{"OTIO_SCHEMA": "RationalTime.1", "rate": 1000, "value": ms}
}
func deliveryOTIORange(start, duration float64) any {
	return map[string]any{"OTIO_SCHEMA": "TimeRange.1", "start_time": deliveryOTIOTime(start), "duration": deliveryOTIOTime(duration)}
}
func deliverySRTTime(value float64) string {
	ms := int64(value + .5)
	return fmt.Sprintf("%02d:%02d:%02d,%03d", ms/3600000, (ms/60000)%60, (ms/1000)%60, ms%1000)
}
