// SPDX-License-Identifier: AGPL-3.0-or-later
// Audio clock contracts: Copyright (C) 2023-2026 QuantumNous.
package production

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strconv"
)

var ErrTimelineAudioLink = errors.New("invalid timeline audio link")

func audioAnchor(value float64) json.Number {
	return json.Number(strconv.FormatFloat(value, 'f', -1, 64))
}

func audioLinkError(message string) error { return fmt.Errorf("%w: %s", ErrTimelineAudioLink, message) }
func audioNumber(value any) (float64, bool) {
	var result float64
	switch value := value.(type) {
	case json.Number:
		var err error
		result, err = value.Float64()
		if err != nil {
			return 0, false
		}
	case int64:
		result = float64(value)
	case int:
		result = float64(value)
	case float64:
		result = value
	default:
		return 0, false
	}
	return result, !math.IsNaN(result) && !math.IsInf(result, 0)
}
func audioValue(clip map[string]any, key string) float64 {
	value, _ := audioNumber(clip[key])
	return value
}
func audioRate(clip map[string]any) float64 {
	if _, exists := clip["playbackRate"]; !exists {
		return 1
	}
	return audioValue(clip, "playbackRate")
}
func audioEnd(clip map[string]any) float64 {
	return audioValue(clip, "startMs") + audioValue(clip, "durationMs")
}
func audioSourceEnd(clip map[string]any) float64 {
	return audioValue(clip, "sourceStartMs") + math.Round(audioValue(clip, "durationMs")*audioRate(clip))
}
func audioInteger(value float64) json.Number {
	return json.Number(strconv.FormatInt(int64(math.Round(value)), 10))
}
func copyTimelineClip(clip map[string]any) map[string]any {
	result := make(map[string]any, len(clip))
	for key, value := range clip {
		result[key] = value
	}
	return result
}
func audioTimingEqual(left, right map[string]any) bool {
	return audioValue(left, "startMs") == audioValue(right, "startMs") && audioValue(left, "durationMs") == audioValue(right, "durationMs") && audioValue(left, "sourceStartMs") == audioValue(right, "sourceStartMs") && audioRate(left) == audioRate(right)
}

// Validation names a video occurrence, never a resource or a current Take.
func validateTimelineAudioLinks(document map[string]any, clips []any) error {
	byID := map[string]map[string]any{}
	for _, value := range clips {
		clip := objectValue(value)
		byID[stringValue(clip, "id")] = clip
	}
	for _, value := range clips {
		audio := objectValue(value)
		raw, exists := audio["audioLink"]
		if !exists {
			continue
		}
		link := objectValue(raw)
		video := byID[stringValue(link, "sourceClipId")]
		mode := stringValue(link, "mode")
		anchor, valid := audioNumber(link["anchorMs"])
		if stringValue(audio, "kind") != "audio" || video == nil || stringValue(video, "kind") != "video" || (mode != "source" && mode != "clip") || !valid || anchor < 0 || anchor > 86400000 {
			return audioLinkError("声音跟随关系无效，请保留剪辑并重新选择镜头")
		}
		start := audioValue(video, "startMs") + anchor
		if mode == "source" {
			start = audioValue(video, "startMs") + (anchor-audioValue(video, "sourceStartMs"))/audioRate(video)
		}
		if math.Abs(audioValue(audio, "startMs")-start) > 1 || audioValue(audio, "startMs") < audioValue(video, "startMs") || audioEnd(audio) > audioEnd(video) || (mode == "source" && (anchor < audioValue(video, "sourceStartMs") || anchor >= audioSourceEnd(video))) {
			return audioLinkError("跟随声音超出镜头范围，请先裁剪声音或解除跟随")
		}
	}
	return nil
}

func linkedAudioFragmentID(audioID, videoID string) string {
	input := []byte(fmt.Sprintf("%d:%s%d:%s", len(audioID), audioID, len(videoID), videoID))
	first, second := uint32(0x811c9dc5), uint32(0x9e3779b9)
	for _, value := range input {
		first = (first ^ uint32(value)) * 0x01000193
		second = (second ^ uint32(value)) * 0x01000193
	}
	return fmt.Sprintf("linked-%08x%08x", first, second)
}

func linkedAudioFragment(audio, oldVideo, video map[string]any) (map[string]any, error) {
	link := objectValue(audio["audioLink"])
	mode := stringValue(link, "mode")
	anchor := audioValue(link, "anchorMs")
	oldVideoRate, newVideoRate, oldRate := audioRate(oldVideo), audioRate(video), audioRate(audio)
	var start, length, sourceDelta, nextAnchor, rate float64
	if mode == "source" {
		a := max(anchor, audioValue(video, "sourceStartMs"))
		b := min(anchor+audioValue(audio, "durationMs")*oldVideoRate, audioSourceEnd(video))
		if b <= a {
			return nil, nil
		}
		sourceDelta = (a - anchor) / oldVideoRate * oldRate
		start = audioValue(video, "startMs") + (a-audioValue(video, "sourceStartMs"))/newVideoRate
		length = (b - a) / newVideoRate
		rate = oldRate * newVideoRate / oldVideoRate
		nextAnchor = a
	} else {
		local := anchor - (audioValue(video, "sourceStartMs")-audioValue(oldVideo, "sourceStartMs"))/oldVideoRate
		from, to := max(0, local), min(audioValue(video, "durationMs"), local+audioValue(audio, "durationMs"))
		if to <= from {
			return nil, nil
		}
		sourceDelta = max(0, -local) * oldRate
		start = audioValue(video, "startMs") + from
		length = to - from
		nextAnchor = from
		rate = oldRate
	}
	start = math.Round(start)
	length = min(math.Round(length), audioEnd(video)-start)
	if rate < .25 || rate > 4 || length < 1 {
		return nil, audioLinkError("此编辑需要超出支持范围的声音速度或过短片段，请调整剪切或先解除声音跟随")
	}
	oldCropStart := sourceDelta / oldRate
	oldCropEnd := oldCropStart + length*rate/oldRate
	result := copyTimelineClip(audio)
	result["startMs"] = audioInteger(start)
	result["durationMs"] = audioInteger(length)
	result["sourceStartMs"] = audioInteger(audioValue(audio, "sourceStartMs") + sourceDelta)
	result["playbackRate"] = json.Number(strconv.FormatFloat(rate, 'f', -1, 64))
	result["audioLink"] = map[string]any{"sourceClipId": stringValue(video, "id"), "mode": mode, "anchorMs": audioAnchor(nextAnchor)}
	if fade, exists := audio["fadeInMs"]; exists {
		value, _ := audioNumber(fade)
		result["fadeInMs"] = audioInteger(min(length, max(0, math.Round((value-oldCropStart)*oldRate/rate))))
	}
	if fade, exists := audio["fadeOutMs"]; exists {
		value, _ := audioNumber(fade)
		result["fadeOutMs"] = audioInteger(min(length, max(0, math.Round((value-(audioValue(audio, "durationMs")-oldCropEnd))*oldRate/rate))))
	}
	oldLink, nextLink := objectValue(audio["audioLink"]), objectValue(result["audioLink"])
	if audioTimingEqual(audio, result) && stringValue(oldLink, "sourceClipId") == stringValue(nextLink, "sourceClipId") && stringValue(oldLink, "mode") == stringValue(nextLink, "mode") && audioValue(oldLink, "anchorMs") == audioValue(nextLink, "anchorMs") && audioValue(audio, "fadeInMs") == audioValue(result, "fadeInMs") && audioValue(audio, "fadeOutMs") == audioValue(result, "fadeOutMs") {
		return audio, nil
	}
	return result, nil
}

// Replacement IDs are supplied by the actual split/cut operation. Equality of
// resource IDs is deliberately insufficient to discover a replacement.
func reconcileTimelineAudioLinks(before, after map[string]any, replacements map[string][]string) error {
	oldRows, newRows := listValue(before["clips"]), listValue(after["clips"])
	if err := validateTimelineAudioLinks(before, oldRows); err != nil {
		return err
	}
	oldClips, current := map[string]map[string]any{}, map[string]map[string]any{}
	locked := map[string]bool{}
	for _, row := range listValue(before["tracks"]) {
		track := objectValue(row)
		locked[stringValue(track, "id")], _ = track["locked"].(bool)
	}
	for _, row := range oldRows {
		clip := objectValue(row)
		oldClips[stringValue(clip, "id")] = clip
	}
	for _, row := range newRows {
		clip := objectValue(row)
		current[stringValue(clip, "id")] = clip
	}
	result := []any{}
	seen := map[string]bool{}
	add := func(clip map[string]any) error {
		id := stringValue(clip, "id")
		if seen[id] {
			return audioLinkError("声音片段编号冲突，请保留原剪辑并调整拆分位置")
		}
		seen[id] = true
		result = append(result, clip)
		return nil
	}
	for _, row := range newRows {
		clip := objectValue(row)
		old := oldClips[stringValue(clip, "id")]
		link := objectValue(old["audioLink"])
		if old == nil || link == nil {
			changed := clip
			if raw, exists := clip["audioLink"]; old == nil && exists {
				nextLink := copyTimelineClip(objectValue(raw))
				video := current[stringValue(nextLink, "sourceClipId")]
				if video == nil || stringValue(video, "kind") != "video" {
					return audioLinkError("声音跟随的具体镜头不存在")
				}
				anchor := audioValue(clip, "startMs") - audioValue(video, "startMs")
				if stringValue(nextLink, "mode") == "source" {
					anchor = audioValue(video, "sourceStartMs") + anchor*audioRate(video)
				}
				nextLink["anchorMs"] = audioAnchor(anchor)
				changed = copyTimelineClip(clip)
				changed["audioLink"] = nextLink
			}
			if err := add(changed); err != nil {
				return err
			}
			continue
		}
		oldVideo := oldClips[stringValue(link, "sourceClipId")]
		ids, explicit := replacements[stringValue(oldVideo, "id")]
		if !explicit {
			ids = []string{stringValue(oldVideo, "id")}
		}
		targets := []map[string]any{}
		for _, id := range ids {
			if video := current[id]; video != nil && stringValue(video, "kind") == "video" {
				targets = append(targets, video)
			}
		}
		if len(targets) == 1 && stringValue(targets[0], "id") == stringValue(oldVideo, "id") && audioTimingEqual(targets[0], oldVideo) {
			changed := clip
			if nextLink := objectValue(clip["audioLink"]); nextLink != nil && !audioTimingEqual(clip, old) {
				copied := copyTimelineClip(nextLink)
				anchor := audioValue(clip, "startMs") - audioValue(oldVideo, "startMs")
				if stringValue(link, "mode") == "source" {
					anchor = audioValue(oldVideo, "sourceStartMs") + anchor*audioRate(oldVideo)
				}
				copied["anchorMs"] = audioAnchor(anchor)
				changed = copyTimelineClip(clip)
				changed["audioLink"] = copied
			}
			if err := add(changed); err != nil {
				return err
			}
			continue
		}
		pieces := []map[string]any{}
		for _, video := range targets {
			piece, err := linkedAudioFragment(old, oldVideo, video)
			if err != nil {
				return err
			}
			if piece != nil {
				pieces = append(pieces, piece)
			}
		}
		if locked[stringValue(old, "trackId")] {
			next, _ := json.Marshal(pieces)
			single, _ := json.Marshal([]map[string]any{old})
			if len(pieces) != 1 || string(next) != string(single) {
				return audioLinkError("关联声音轨已锁定，请先解锁或解除跟随后再编辑镜头")
			}
		}
		for index, piece := range pieces {
			if len(pieces) > 1 && stringValue(piece, "analysisOccurrenceId") == "" {
				for _, marker := range listValue(before["productionMarkers"]) {
					if stringValue(objectValue(objectValue(marker)["source"]), "clipId") == stringValue(old, "id") {
						piece["analysisOccurrenceId"] = stringValue(old, "id")
						break
					}
				}
			}
			if index > 0 {
				id := linkedAudioFragmentID(stringValue(old, "id"), stringValue(objectValue(piece["audioLink"]), "sourceClipId"))
				if current[id] != nil {
					return audioLinkError("声音片段编号冲突，请保留原剪辑并调整拆分位置")
				}
				piece["id"] = id
			}
			if err := add(piece); err != nil {
				return err
			}
		}
	}
	if len(result) > 5000 {
		return audioLinkError("剪切后的声音片段超过上限，请分段编辑")
	}
	after["clips"] = result
	return validateTimelineAudioLinks(after, result)
}

func remapEditedAudioLinks(document map[string]any, edited map[string]bool, replacements map[string][]string) error {
	clips := listValue(document["clips"])
	byID := map[string]map[string]any{}
	for _, row := range clips {
		clip := objectValue(row)
		byID[stringValue(clip, "id")] = clip
	}
	for index, row := range clips {
		audio := objectValue(row)
		if !edited[stringValue(audio, "id")] {
			continue
		}
		link := objectValue(audio["audioLink"])
		parent := stringValue(link, "sourceClipId")
		ids, explicit := replacements[parent]
		if !explicit {
			ids = []string{parent}
		}
		var target map[string]any
		for _, id := range ids {
			video := byID[id]
			if video != nil && stringValue(video, "kind") == "video" && audioValue(audio, "startMs") >= audioValue(video, "startMs") && audioEnd(audio) <= audioEnd(video) {
				if target != nil {
					return audioLinkError("文字剪切后的声音镜头关系不明确，请保留原剪辑")
				}
				target = video
			}
		}
		if target == nil {
			return audioLinkError("文字剪切后的声音超出关联镜头，请调整范围")
		}
		anchor := audioValue(audio, "startMs") - audioValue(target, "startMs")
		if stringValue(link, "mode") == "source" {
			anchor = audioValue(target, "sourceStartMs") + anchor*audioRate(target)
		}
		changed := copyTimelineClip(audio)
		copied := copyTimelineClip(link)
		copied["sourceClipId"] = stringValue(target, "id")
		copied["anchorMs"] = audioAnchor(anchor)
		changed["audioLink"] = copied
		clips[index] = changed
	}
	document["clips"] = clips
	return nil
}

func linkedAudioCutChanges(before, after []any, replacements map[string][]string, editedSource string) []TranscriptCutChange {
	byID := map[string]map[string]any{}
	for _, row := range after {
		clip := objectValue(row)
		byID[stringValue(clip, "id")] = clip
	}
	changes := []TranscriptCutChange{}
	for _, row := range before {
		old := objectValue(row)
		id := stringValue(old, "id")
		link := objectValue(old["audioLink"])
		if link == nil || id == editedSource {
			continue
		}
		parent := stringValue(link, "sourceClipId")
		targets, explicit := replacements[parent]
		if !explicit {
			targets = []string{parent}
		}
		ids := []string{}
		if byID[id] != nil {
			ids = append(ids, id)
		}
		for _, target := range targets {
			candidate := linkedAudioFragmentID(id, target)
			if byID[candidate] != nil {
				ids = append(ids, candidate)
			}
		}
		if len(ids) == 1 {
			first, _ := json.Marshal(byID[ids[0]])
			original, _ := json.Marshal(old)
			if string(first) == string(original) {
				continue
			}
		}
		action := "trim"
		if len(ids) == 0 {
			action = "remove"
		} else if len(ids) > 1 {
			action = "split"
		} else if audioValue(byID[ids[0]], "durationMs") == audioValue(old, "durationMs") && audioValue(byID[ids[0]], "sourceStartMs") == audioValue(old, "sourceStartMs") {
			action = "move"
		}
		changes = append(changes, TranscriptCutChange{ClipID: id, Title: stringValue(old, "title"), Kind: "audio", Action: action, ResultClipIDs: ids})
	}
	return changes
}
