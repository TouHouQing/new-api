package production

import (
	"bytes"
	"encoding/json"
	"fmt"
)

func graphicMap(value *MotionGraphic) (map[string]any, error) {
	raw, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	var result map[string]any
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	err = decoder.Decode(&result)
	return result, err
}

func addTimelineGraphic(before map[string]any, command TimelineEditCommand) (map[string]any, error) {
	if command.Graphic == nil || command.Text == nil || command.StartMs == nil || command.DurationMs == nil || !markerText(command.ID, 128) || *command.StartMs < 0 || *command.DurationMs <= 0 || *command.StartMs > 86_400_000 || *command.DurationMs > 86_400_000 || *command.StartMs+*command.DurationMs > 86_400_000 {
		return nil, audioLinkError("请提供完整叠层和有效时间范围")
	}
	raw, _ := json.Marshal(command)
	var fields map[string]json.RawMessage
	_ = json.Unmarshal(raw, &fields)
	for key := range fields {
		switch key {
		case "op", "id", "startMs", "durationMs", "text", "graphic", "trackId":
		default:
			return nil, audioLinkError("新增叠层包含不适用的参数")
		}
	}
	if err := ValidateMotionGraphic(*command.Graphic); err != nil {
		return nil, err
	}
	clips := listValue(before["clips"])
	for _, value := range clips {
		if stringValue(objectValue(value), "id") == command.ID {
			return nil, audioLinkError("叠层编号已存在，请使用新的唯一编号")
		}
	}
	tracks := listValue(before["tracks"])
	var selected map[string]any
	seen := map[string]bool{}
	lowest := float64(0)
	for _, value := range tracks {
		track := objectValue(value)
		id := stringValue(track, "id")
		seen[id] = true
		lowest = min(lowest, numberValue(track["order"]))
		if command.TrackID != "" && id == command.TrackID {
			selected = track
		}
		if command.TrackID == "" && selected == nil && stringValue(track, "kind") == "text" && track["locked"] != true {
			selected = track
		}
	}
	if command.TrackID != "" && (selected == nil || stringValue(selected, "kind") != "text" || selected["locked"] == true) {
		return nil, audioLinkError("请选择未锁定的标题轨道")
	}
	if selected == nil {
		if len(tracks) >= 64 {
			return nil, audioLinkError("轨道数量已达上限")
		}
		id := "graphic-track"
		for n := 2; seen[id]; n++ {
			id = fmt.Sprintf("graphic-track-%d", n)
		}
		selected = map[string]any{"id": id, "kind": "text", "label": "标题与叠层", "order": audioInteger(lowest - 1)}
		tracks = append(tracks, selected)
		before["tracks"] = tracks
	}
	graphic, err := graphicMap(command.Graphic)
	if err != nil {
		return nil, err
	}
	title := []rune(*command.Text)
	if len(title) > 40 {
		title = title[:40]
	}
	clip := map[string]any{"id": command.ID, "nodeId": "graphic:" + command.ID, "kind": "text", "trackId": stringValue(selected, "id"), "startMs": audioInteger(float64(*command.StartMs)), "durationMs": audioInteger(float64(*command.DurationMs)), "text": *command.Text, "title": string(title), "graphic": graphic}
	before["clips"] = append(clips, clip)
	return before, nil
}
