package production

import (
	"encoding/json"
	"math"
)

func captionFollowCutChanges(before, after []any) []TranscriptCutChange {
	old, current := map[string]map[string]any{}, map[string]map[string]any{}
	for _, row := range before {
		clip := objectValue(row)
		if stringValue(clip, "kind") == "subtitle" && captionSourceID(clip) != "" {
			old[stringValue(clip, "id")] = clip
		}
	}
	for _, row := range after {
		clip := objectValue(row)
		current[stringValue(clip, "id")] = clip
	}
	changes := []TranscriptCutChange{}
	for _, row := range before {
		clip := objectValue(row)
		id := stringValue(clip, "id")
		if old[id] == nil {
			continue
		}
		left, _ := json.Marshal(clip)
		right, _ := json.Marshal(current[id])
		if string(left) == string(right) {
			continue
		}
		pieces := []map[string]any{}
		for _, next := range after {
			candidate := objectValue(next)
			candidateID := stringValue(candidate, "id")
			parent := captionSourceID(candidate)
			if stringValue(candidate, "kind") == "subtitle" && (candidateID == id || candidateID == linkedAudioFragmentID("caption:"+id, parent)) {
				pieces = append(pieces, candidate)
			}
		}
		change := TranscriptCutChange{ClipID: id, Title: stringValue(clip, "title"), Kind: "subtitle", Action: "trim", ResultClipIDs: []string{}}
		for _, piece := range pieces {
			change.ResultClipIDs = append(change.ResultClipIDs, stringValue(piece, "id"))
		}
		if len(pieces) == 0 {
			change.Action = "remove"
		} else if len(pieces) > 1 {
			change.Action = "split"
		} else if audioValue(pieces[0], "durationMs") == audioValue(clip, "durationMs") {
			change.Action = "move"
		}
		changes = append(changes, change)
	}
	return changes
}

func reconcileTimelineCaptionFollow(before, after map[string]any, replacements map[string][]string) error {
	old, current := map[string]map[string]any{}, map[string]map[string]any{}
	for _, row := range listValue(before["clips"]) {
		clip := objectValue(row)
		old[stringValue(clip, "id")] = clip
	}
	for _, row := range listValue(after["clips"]) {
		clip := objectValue(row)
		current[stringValue(clip, "id")] = clip
	}
	locked := map[string]bool{}
	for _, row := range listValue(before["tracks"]) {
		track := objectValue(row)
		locked[stringValue(track, "id")], _ = track["locked"].(bool)
	}
	result := []any{}
	ids := map[string]bool{}
	add := func(clip map[string]any) error {
		id := stringValue(clip, "id")
		if ids[id] {
			return audioLinkError("关联字幕编号冲突，请保留原剪辑并重新预览")
		}
		ids[id] = true
		result = append(result, clip)
		return nil
	}
	for _, row := range listValue(after["clips"]) {
		clip := objectValue(row)
		original := old[stringValue(clip, "id")]
		binding := objectValue(original["productionBinding"])
		manual := objectValue(original["captionLink"])
		sourceID := captionSourceID(original)
		if stringValue(clip, "kind") != "subtitle" || sourceID == "" {
			if err := add(clip); err != nil {
				return err
			}
			continue
		}
		if manual != nil && captionSourceID(clip) != sourceID {
			if err := add(clip); err != nil {
				return err
			}
			continue
		}
		parent := old[sourceID]
		if parent == nil || stringValue(parent, "kind") != "video" && stringValue(parent, "kind") != "audio" {
			return audioLinkError("关联字幕的原片段不存在，请保留字幕并修复来源")
		}
		targetIDs, explicit := replacements[sourceID]
		if !explicit {
			targetIDs = []string{sourceID}
		}
		if link := objectValue(parent["audioLink"]); !explicit && link != nil {
			videoIDs, changed := replacements[stringValue(link, "sourceClipId")]
			if !changed {
				videoIDs = []string{stringValue(link, "sourceClipId")}
			}
			seen := map[string]bool{sourceID: true}
			targetIDs = []string{sourceID}
			for _, id := range videoIDs {
				candidate := linkedAudioFragmentID(sourceID, id)
				if !seen[candidate] {
					seen[candidate] = true
					targetIDs = append(targetIDs, candidate)
				}
			}
		}
		targets := []map[string]any{}
		for _, id := range targetIDs {
			if target := current[id]; target != nil && stringValue(target, "kind") == stringValue(parent, "kind") {
				targets = append(targets, target)
			}
		}
		if len(targets) == 1 && stringValue(targets[0], "id") == sourceID && audioTimingEqual(targets[0], parent) {
			if manual != nil && !audioTimingEqual(clip, original) {
				changed := copyTimelineClip(clip)
				link := copyTimelineClip(manual)
				from := audioValue(parent, "sourceStartMs") + (audioValue(clip, "startMs")-audioValue(parent, "startMs"))*audioRate(parent)
				link["sourceStartMs"] = audioAnchor(from)
				link["sourceEndMs"] = audioAnchor(from + audioValue(clip, "durationMs")*audioRate(parent))
				changed["captionLink"] = link
				clip = changed
			}
			if err := add(clip); err != nil {
				return err
			}
			continue
		}
		cueStart := audioValue(parent, "sourceStartMs") + (audioValue(original, "startMs")-audioValue(parent, "startMs"))*audioRate(parent)
		cueEnd := cueStart + audioValue(original, "durationMs")*audioRate(parent)
		if manual != nil {
			cueStart = audioValue(manual, "sourceStartMs")
			cueEnd = audioValue(manual, "sourceEndMs")
		}
		pieces := []map[string]any{}
		for _, target := range targets {
			from, to := max(cueStart, audioValue(target, "sourceStartMs")), min(cueEnd, audioSourceEnd(target))
			if to <= from {
				continue
			}
			start := math.Round(audioValue(target, "startMs") + (from-audioValue(target, "sourceStartMs"))/audioRate(target))
			length := min(math.Round((to-from)/audioRate(target)), audioEnd(target)-start)
			if length < 1 {
				return audioLinkError("关联字幕过短，请调整剪切范围")
			}
			piece := copyTimelineClip(original)
			piece["startMs"] = audioInteger(start)
			piece["durationMs"] = audioInteger(length)
			if manual != nil {
				link := copyTimelineClip(manual)
				link["sourceClipId"] = stringValue(target, "id")
				link["sourceStartMs"] = audioAnchor(from)
				link["sourceEndMs"] = audioAnchor(to)
				piece["captionLink"] = link
			} else {
				nextBinding := copyTimelineClip(binding)
				nextBinding["sourceClipId"] = stringValue(target, "id")
				piece["productionBinding"] = nextBinding
			}
			for _, key := range []string{"fadeInMs", "fadeOutMs"} {
				if _, exists := original[key]; exists {
					piece[key] = audioInteger(min(length, audioValue(original, key)))
				}
			}
			pieces = append(pieces, piece)
		}
		if len(pieces) == 1 {
			next, _ := json.Marshal(pieces[0])
			previous, _ := json.Marshal(original)
			if string(next) == string(previous) {
				if err := add(clip); err != nil {
					return err
				}
				continue
			}
		}
		if locked[stringValue(original, "trackId")] {
			return audioLinkError("关联字幕轨已锁定，请先解锁再编辑来源片段")
		}
		for index, piece := range pieces {
			if index > 0 {
				id := linkedAudioFragmentID("caption:"+stringValue(original, "id"), captionSourceID(piece))
				if current[id] != nil {
					return audioLinkError("关联字幕编号冲突，请重新预览")
				}
				piece["id"] = id
			}
			if err := add(piece); err != nil {
				return err
			}
		}
	}
	if len(result) > 5000 {
		return audioLinkError("拆分后的关联字幕超过上限，请分段编辑")
	}
	after["clips"] = result
	return nil
}
