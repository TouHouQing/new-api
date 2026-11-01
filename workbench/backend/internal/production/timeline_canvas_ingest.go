package production

import (
	"fmt"
	"math"
	"strconv"
)

func appendCanvasCaptionSnapshot(document, parent map[string]any, media *TimelineEditMedia) (map[string]any, error) {
	if media == nil || media.CanvasOrigin == nil {
		return nil, audioLinkError("缺少已核对的画布来源，请重新预览")
	}
	if len(media.CaptionCues) == 0 {
		return document, nil
	}
	tracks := append([]any{}, listValue(document["tracks"])...)
	clips := append([]any{}, listValue(document["clips"])...)
	var target map[string]any
	hasCaptionTrack := false
	usedTracks := map[string]bool{}
	usedClips := map[string]bool{}
	order := float64(-1)
	for index, row := range tracks {
		track := objectValue(row)
		usedTracks[stringValue(track, "id")] = true
		if n, ok := audioNumber(track["order"]); ok {
			order = max(order, n)
		} else {
			order = max(order, float64(index))
		}
		if stringValue(track, "kind") == "subtitle" {
			hasCaptionTrack = true
			if target == nil && track["locked"] != true {
				target = track
			}
		}
	}
	if target == nil && hasCaptionTrack {
		return nil, audioLinkError("字幕轨已锁定，请先解锁再加入字幕")
	}
	if target == nil {
		id := "canvas-captions"
		for index := 2; usedTracks[id]; index++ {
			id = fmt.Sprintf("canvas-captions-%d", index)
		}
		target = map[string]any{"id": id, "kind": "subtitle", "label": "字幕", "order": audioInteger(order + 1)}
		tracks = append(tracks, target)
	}
	for _, row := range clips {
		usedClips[stringValue(objectValue(row), "id")] = true
	}
	for position, cue := range media.CaptionCues {
		from, to := max(float64(cue.StartMs), audioValue(parent, "sourceStartMs")), min(float64(cue.EndMs), audioSourceEnd(parent))
		if to <= from {
			continue
		}
		start := math.Round(audioValue(parent, "startMs") + (from-audioValue(parent, "sourceStartMs"))/audioRate(parent))
		length := min(math.Round((to-from)/audioRate(parent)), audioEnd(parent)-start)
		if length < 1 {
			return nil, audioLinkError("变速后的字幕过短，请合并相邻字幕或降低速度")
		}
		id := linkedAudioFragmentID("canvas-caption:"+media.ClipID, strconv.Itoa(position))
		if usedClips[id] {
			return nil, audioLinkError("字幕片段编号冲突，请保留原操作编号并核对结果")
		}
		usedClips[id] = true
		origin := map[string]any{"source": media.CanvasOrigin, "entryPosition": position, "entryIndex": cue.Index, "sourceStartMs": cue.StartMs, "sourceEndMs": cue.EndMs, "originalText": cue.Text, "partial": from != float64(cue.StartMs) || to != float64(cue.EndMs)}
		if media.SubtitleStyle != nil {
			origin["subtitleStyle"] = media.SubtitleStyle
		}
		if media.Highlights != nil {
			origin["subtitleHighlights"] = media.Highlights
		}
		clips = append(clips, map[string]any{"id": id, "nodeId": media.CanvasOrigin.NodeID, "kind": "subtitle", "trackId": stringValue(target, "id"), "title": "画布字幕", "startMs": audioInteger(start), "durationMs": audioInteger(length), "text": cue.Text, "captionLink": map[string]any{"sourceClipId": stringValue(parent, "id"), "sourceStartMs": audioAnchor(from), "sourceEndMs": audioAnchor(to)}, "captionOrigin": origin})
		if len(clips) > 5000 {
			return nil, audioLinkError("加入后片段超过5000个，请分段制作")
		}
	}
	after := copyTimelineClip(document)
	after["clips"] = clips
	after["tracks"] = tracks
	return after, nil
}

func addCanvasNodeTimelineResource(before map[string]any, command TimelineEditCommand) (map[string]any, error) {
	if command.CanvasID == "" || command.NodeID == "" || command.CanvasRevision == nil || *command.CanvasRevision < 1 || len(command.NodeSHA256) != 64 || command.Media == nil || command.Media.CanvasOrigin == nil {
		return nil, audioLinkError("请先核对画布节点、原片和字幕快照")
	}
	origin := command.Media.CanvasOrigin
	if origin.CanvasID != command.CanvasID || origin.NodeID != command.NodeID || origin.CanvasRevision != *command.CanvasRevision || origin.NodeSHA256 != command.NodeSHA256 || origin.ResourceID != command.ResourceID {
		return nil, audioLinkError("画布字幕来源已改变，请重新预览")
	}
	copyCommand := command
	copyCommand.Op = "addResource"
	copyCommand.CanvasID = ""
	copyCommand.NodeID = ""
	copyCommand.CanvasRevision = nil
	copyCommand.NodeSHA256 = ""
	after, err := addTimelineEditResource(before, copyCommand)
	if err != nil {
		return nil, err
	}
	var parent map[string]any
	for _, row := range listValue(after["clips"]) {
		clip := objectValue(row)
		if stringValue(clip, "id") == command.Media.ClipID {
			parent = clip
			break
		}
	}
	return appendCanvasCaptionSnapshot(after, parent, command.Media)
}
