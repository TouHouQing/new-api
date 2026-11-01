package production

import "math"

// Manual caption links keep their precise source interval through retiming.
// Transcript productionBinding remains a distinct, versioned source contract.
func captionSourceID(clip map[string]any) string {
	if link := objectValue(clip["captionLink"]); link != nil {
		return stringValue(link, "sourceClipId")
	}
	return stringValue(objectValue(clip["productionBinding"]), "sourceClipId")
}

func validateTimelineCaptionLinks(clips []any) error {
	byID := map[string]map[string]any{}
	for _, row := range clips {
		clip := objectValue(row)
		byID[stringValue(clip, "id")] = clip
	}
	for _, row := range clips {
		clip := objectValue(row)
		value, exists := clip["captionLink"]
		if !exists {
			continue
		}
		link := objectValue(value)
		if link == nil || len(link) != 3 || stringValue(clip, "kind") != "subtitle" || stringValue(objectValue(clip["productionBinding"]), "sourceClipId") != "" {
			return audioLinkError("字幕跟随来源无效，请保留文字稿来源并重新选择")
		}
		for key := range link {
			if key != "sourceClipId" && key != "sourceStartMs" && key != "sourceEndMs" {
				return audioLinkError("字幕跟随包含不支持的参数")
			}
		}
		parent := byID[stringValue(link, "sourceClipId")]
		from, validFrom := audioNumber(link["sourceStartMs"])
		to, validTo := audioNumber(link["sourceEndMs"])
		if parent == nil || (stringValue(parent, "kind") != "video" && stringValue(parent, "kind") != "audio") || !validFrom || !validTo || from < 0 || to <= from || to > 86400000 {
			return audioLinkError("请选择具体视频或声音片段，并保留有效字幕范围")
		}
		rate := audioRate(parent)
		expectedStart := audioValue(parent, "startMs") + (from-audioValue(parent, "sourceStartMs"))/rate
		expectedEnd := audioValue(parent, "startMs") + (to-audioValue(parent, "sourceStartMs"))/rate
		if from < audioValue(parent, "sourceStartMs") || to > audioSourceEnd(parent) || audioValue(clip, "startMs") < audioValue(parent, "startMs") || audioEnd(clip) > audioEnd(parent) || math.Abs(audioValue(clip, "startMs")-expectedStart) > 1 || math.Abs(audioEnd(clip)-expectedEnd) > 1 {
			return audioLinkError("字幕跟随超出片段范围，请先调整字幕或解除跟随")
		}
	}
	return nil
}

func setManualCaptionLink(clip, parent map[string]any) (map[string]any, error) {
	if stringValue(clip, "kind") != "subtitle" || stringValue(objectValue(clip["productionBinding"]), "sourceClipId") != "" {
		return nil, audioLinkError("文字稿字幕保留其具体版本来源；请选择普通字幕设置跟随")
	}
	changed := copyTimelineClip(clip)
	if parent == nil {
		delete(changed, "captionLink")
		return changed, nil
	}
	if stringValue(parent, "kind") != "video" && stringValue(parent, "kind") != "audio" || audioValue(clip, "startMs") < audioValue(parent, "startMs") || audioEnd(clip) > audioEnd(parent) {
		return nil, audioLinkError("字幕必须位于选中的视频或声音片段内")
	}
	if link := objectValue(clip["captionLink"]); link != nil && stringValue(link, "sourceClipId") == stringValue(parent, "id") {
		return changed, nil
	}
	from := audioValue(parent, "sourceStartMs") + (audioValue(clip, "startMs")-audioValue(parent, "startMs"))*audioRate(parent)
	to := from + audioValue(clip, "durationMs")*audioRate(parent)
	changed["captionLink"] = map[string]any{"sourceClipId": stringValue(parent, "id"), "sourceStartMs": audioAnchor(from), "sourceEndMs": audioAnchor(to)}
	return changed, nil
}
