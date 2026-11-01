package production

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
)

type TranscriptCutRange struct {
	SourceStartMs  int64  `json:"sourceStartMs"`
	SourceEndMs    int64  `json:"sourceEndMs"`
	ProgramStartMs int64  `json:"programStartMs"`
	ProgramEndMs   int64  `json:"programEndMs"`
	ClipID         string `json:"clipId"`
}
type TranscriptCutChange struct {
	ClipID        string   `json:"clipId"`
	Title         string   `json:"title"`
	Kind          string   `json:"kind"`
	Action        string   `json:"action"`
	ResultClipIDs []string `json:"resultClipIds"`
}
type TranscriptCutPlan struct {
	Mode             string                `json:"mode"`
	SourceClipID     string                `json:"sourceClipId"`
	RemovedMs        int64                 `json:"removedMs"`
	BeforeDurationMs int64                 `json:"beforeDurationMs"`
	AfterDurationMs  int64                 `json:"afterDurationMs"`
	KeptRanges       []TranscriptCutRange  `json:"keptRanges"`
	Changes          []TranscriptCutChange `json:"changes"`
	Warnings         []string              `json:"warnings"`
	Timeline         json.RawMessage       `json:"timeline"`
}
type cutInterval struct{ start, end int64 }

type TranscriptCutOptions struct {
	Unit           string
	PreservePauses bool
}

// This operation only edits a timeline snapshot. Source files and recognition
// revisions never change. clip_only preserves every unrelated clip verbatim.
func PlanTranscriptCut(raw json.RawMessage, document TranscriptDocument, transcriptID, revisionID, resourceID, sourceClipID, mode string, keepIDs []string, options ...TranscriptCutOptions) (TranscriptCutPlan, error) {
	fail := func(message string) (TranscriptCutPlan, error) { return TranscriptCutPlan{}, errors.New(message) }
	clean, err := ValidateTimelineDocument(raw)
	if err != nil {
		return fail("剪辑快照无效")
	}
	if err := ValidateTranscript(document); err != nil {
		return fail("文字稿版本无效")
	}
	if mode != "ripple" && mode != "clip_only" {
		return fail("请选择跟随剪切或仅剪当前片段")
	}
	option := TranscriptCutOptions{}
	if len(options) > 1 {
		return fail("文字剪辑选项无效")
	}
	if len(options) == 1 {
		option = options[0]
	}
	spans := document.Segments
	if option.Unit == "word" {
		if len(document.Words) == 0 || document.WordTimingIncomplete || document.WordTextNeedsReview {
			return fail("逐词时间不完整或文字已校正，请使用按句剪辑并预听核对")
		}
		spans = document.Words
	} else if option.Unit != "" && option.Unit != "segment" {
		return fail("文字剪辑精度无效")
	}
	if len(keepIDs) == 0 || len(keepIDs) > len(spans) {
		return fail("请至少保留一项当前片段中的文字")
	}
	var timeline map[string]any
	decoder := json.NewDecoder(bytes.NewReader(clean))
	decoder.UseNumber()
	if err := decoder.Decode(&timeline); err != nil {
		return fail("剪辑快照无法读取")
	}
	clips := timeline["clips"].([]any)
	linkedBefore := copyTimelineClip(timeline)
	videoReplacements := map[string][]string{}
	editedAudioIDs := map[string]bool{}
	var source map[string]any
	trackNames := map[string]string{}
	locked := map[string]bool{}
	for _, value := range timeline["tracks"].([]any) {
		track := objectValue(value)
		id := stringValue(track, "id")
		trackNames[id] = stringValue(track, "label")
		locked[id], _ = track["locked"].(bool)
	}
	for _, value := range clips {
		clip := objectValue(value)
		if stringValue(clip, "id") == sourceClipID {
			source = clip
			break
		}
	}
	if source == nil || (stringValue(source, "kind") != "audio" && stringValue(source, "kind") != "video") {
		return fail("请选择一个具体的音视频片段实例")
	}
	if stringValue(objectValue(source["directMedia"]), "storageKey") != "resource:"+resourceID {
		return fail("当前片段已更换素材，请重新选择文字稿")
	}
	sourceStart := cutTime(source, "sourceStartMs")
	programStart := cutTime(source, "startMs")
	length := cutTime(source, "durationMs")
	rate, _ := TimelinePlaybackRate(source)
	sourceEnd := sourceStart + sourceOffset(length, rate)
	if value, ok := source["sourceDurationMs"]; ok {
		if duration, valid := timelineTime(value); !valid || (duration > 0 && sourceEnd > int64(duration)) {
			return fail("片段裁剪超出源素材时长")
		}
	}
	wanted := map[string]bool{}
	for _, id := range keepIDs {
		if id == "" || wanted[id] {
			return fail("保留的文字条目重复或为空")
		}
		wanted[id] = true
	}
	kept := []cutInterval{}
	previousSelected := false
	for _, segment := range spans {
		if !wanted[segment.ID] {
			previousSelected = false
			continue
		}
		delete(wanted, segment.ID)
		start, end := max(sourceStart, segment.StartMs), min(sourceEnd, segment.EndMs)
		if end <= start {
			return fail("所选文字不在当前片段裁剪范围内")
		}
		interval := cutInterval{programStart + programOffset(start-sourceStart, rate), min(programStart+length, programStart+programOffset(end-sourceStart, rate))}
		if interval.end <= interval.start {
			return fail("所选文字在当前速度下不足一毫秒，请保留相邻文字后重试")
		}
		// Preserve only gaps between adjacent retained entries. A removed line
		// must never be reintroduced by merging its surrounding neighbours.
		if option.PreservePauses && previousSelected && len(kept) > 0 {
			kept[len(kept)-1].end = max(kept[len(kept)-1].end, interval.end)
		} else {
			kept = append(kept, interval)
		}
		previousSelected = true
	}
	if len(wanted) > 0 {
		return fail("所选文字条目不存在于这个版本")
	}
	sort.Slice(kept, func(i, j int) bool { return kept[i].start < kept[j].start })
	merged := []cutInterval{}
	for _, item := range kept {
		if len(merged) > 0 && item.start <= merged[len(merged)-1].end {
			merged[len(merged)-1].end = max(merged[len(merged)-1].end, item.end)
		} else {
			merged = append(merged, item)
		}
	}
	kept = merged
	removed := []cutInterval{}
	cursor := programStart
	for _, item := range kept {
		if item.start > cursor {
			removed = append(removed, cutInterval{cursor, item.start})
		}
		cursor = item.end
	}
	if cursor < programStart+length {
		removed = append(removed, cutInterval{cursor, programStart + length})
	}
	var removedMs int64
	for _, item := range removed {
		removedMs += item.end - item.start
	}
	if removedMs == 0 {
		return fail("当前选择没有需要剪掉的时间，请调整保留的句子")
	}
	rangeIdentity := make([][2]int64, 0, len(kept))
	for _, item := range kept {
		rangeIdentity = append(rangeIdentity, [2]int64{item.start, item.end})
	}
	identity, _ := json.Marshal([]any{json.RawMessage(clean), transcriptID, revisionID, resourceID, sourceClipID, mode, rangeIdentity})
	identityDigest := sha256.Sum256(identity)
	makeID := func(old string, index int) string {
		if index == 0 {
			return old
		}
		digest := sha256.Sum256(append(append([]byte{}, identityDigest[:]...), []byte(fmt.Sprintf(":%s:%d", old, index))...))
		return "cut_" + hex.EncodeToString(digest[:20])
	}
	mapTime := func(value int64) int64 {
		result := value
		for _, item := range removed {
			result -= max(int64(0), min(value, item.end)-item.start)
		}
		return result
	}
	plan := TranscriptCutPlan{Mode: mode, SourceClipID: sourceClipID, RemovedMs: removedMs, BeforeDurationMs: cutTime(timeline, "durationMs"), Warnings: []string{}, Changes: []TranscriptCutChange{}, KeptRanges: []TranscriptCutRange{}}
	for index, item := range kept {
		plan.KeptRanges = append(plan.KeptRanges, TranscriptCutRange{SourceStartMs: sourceStart + sourceOffset(item.start-programStart, rate), SourceEndMs: min(sourceEnd, sourceStart+sourceOffset(item.end-programStart, rate)), ProgramStartMs: mapTime(item.start), ProgramEndMs: mapTime(item.end), ClipID: makeID(sourceClipID, index)})
	}
	resultClips := []any{}
	resultIDs := map[string]bool{}
	fadeWarning := false
	captionWarning := false
	for _, value := range clips {
		clip := objectValue(value)
		oldID := stringValue(clip, "id")
		kind := stringValue(clip, "kind")
		if kind == "subtitle" && captionSourceID(clip) != "" {
			// Reconcile once from the original cue and the final concrete source
			// fragments, including voices that themselves follow a video.
			resultIDs[oldID] = true
			resultClips = append(resultClips, clip)
			continue
		}
		if kind == "audio" && clip["audioLink"] != nil && oldID != sourceClipID {
			if resultIDs[oldID] {
				return fail("剪辑片段编号冲突")
			}
			resultIDs[oldID] = true
			resultClips = append(resultClips, clip)
			continue
		}
		start := cutTime(clip, "startMs")
		end := start + cutTime(clip, "durationMs")
		binding := objectValue(clip["productionBinding"])
		follows := mode == "ripple" || oldID == sourceClipID || (kind == "subtitle" && stringValue(binding, "sourceClipId") == sourceClipID)
		intervals := []cutInterval{{start, end}}
		if follows {
			intervals = cutRetainedIntervals(start, end, removed)
		}
		if len(resultClips)+len(intervals) > 5000 {
			return fail("剪切后的片段超过5000个，请分段处理")
		}
		moved := len(intervals) != 1 || intervals[0].start != start || intervals[0].end != end || (follows && mapTime(start) != start)
		if !moved {
			if resultIDs[oldID] {
				return fail("剪辑片段编号冲突")
			}
			resultIDs[oldID] = true
			resultClips = append(resultClips, clip)
			continue
		}
		if locked[stringValue(clip, "trackId")] {
			return fail("受影响的轨道已锁定，请先解锁：" + trackNames[stringValue(clip, "trackId")])
		}
		clipRate, _ := TimelinePlaybackRate(clip)
		if kind == "video" || kind == "audio" {
			videoReplacements[oldID] = []string{}
		}
		change := TranscriptCutChange{ClipID: oldID, Title: stringValue(clip, "title"), Kind: kind, Action: "trim", ResultClipIDs: []string{}}
		if len(intervals) == 0 {
			change.Action = "remove"
		} else if len(intervals) > 1 {
			change.Action = "split"
		} else if intervals[0].start == start && intervals[0].end == end {
			change.Action = "move"
		}
		if (kind == "subtitle" || kind == "text") && len(intervals) > 0 && change.Action != "move" {
			captionWarning = true
		}
		for index, item := range intervals {
			next := make(map[string]any, len(clip)+1)
			for key, value := range clip {
				next[key] = value
			}
			id := makeID(oldID, index)
			if resultIDs[id] {
				return fail("剪切后的片段编号冲突，请重新预览")
			}
			resultIDs[id] = true
			if kind == "video" || kind == "audio" {
				videoReplacements[oldID] = append(videoReplacements[oldID], id)
			}
			if kind == "audio" && oldID == sourceClipID && clip["audioLink"] != nil {
				editedAudioIDs[id] = true
			}
			next["id"] = id
			if kind == "video" || kind == "audio" {
				if _, hasMarkers := timeline["productionMarkers"]; hasMarkers && stringValue(next, "analysisOccurrenceId") == "" {
					next["analysisOccurrenceId"] = oldID
				}
			}
			next["startMs"] = mapTime(item.start)
			next["durationMs"] = item.end - item.start
			if kind == "video" || kind == "audio" {
				next["sourceStartMs"] = cutTime(clip, "sourceStartMs") + sourceOffset(item.start-start, clipRate)
			}
			for _, key := range []string{"fadeInMs", "fadeOutMs"} {
				if _, exists := clip[key]; exists {
					fade := cutTime(clip, key)
					lost := item.start - start
					if key == "fadeOutMs" {
						lost = end - item.end
					}
					if fade > 0 && (item.start != start || item.end != end) {
						fadeWarning = true
					}
					next[key] = min(item.end-item.start, max(int64(0), fade-lost))
				}
			}
			if kind == "subtitle" && stringValue(binding, "sourceClipId") == sourceClipID {
				copied := map[string]any{}
				for key, value := range binding {
					copied[key] = value
				}
				for rangeIndex, sourceRange := range kept {
					if item.start < sourceRange.end && item.end > sourceRange.start {
						copied["sourceClipId"] = makeID(sourceClipID, rangeIndex)
						break
					}
				}
				next["productionBinding"] = copied
			}
			if oldID == sourceClipID {
				next["transcriptEdit"] = map[string]any{"transcriptId": transcriptID, "revisionId": revisionID, "sourceClipId": sourceClipID, "mode": mode}
			}
			resultClips = append(resultClips, next)
			change.ResultClipIDs = append(change.ResultClipIDs, id)
		}
		plan.Changes = append(plan.Changes, change)
	}
	if len(resultClips) > 5000 {
		return fail("剪切后的片段超过5000个，请分段处理")
	}
	timeline["clips"] = resultClips
	if len(editedAudioIDs) > 0 {
		if err := remapEditedAudioLinks(timeline, editedAudioIDs, videoReplacements); err != nil {
			return fail(err.Error())
		}
		// These audio fragments were explicitly cut using transcript timing.
		// Reconcile the other dependent voices without cutting this one twice.
		rows := make([]any, 0, len(clips))
		for _, row := range clips {
			clip := objectValue(row)
			if stringValue(clip, "id") == sourceClipID {
				copied := copyTimelineClip(clip)
				delete(copied, "audioLink")
				rows = append(rows, copied)
			} else {
				rows = append(rows, row)
			}
		}
		linkedBefore["clips"] = rows
	}
	if err := reconcileTimelineAudioLinks(linkedBefore, timeline, videoReplacements); err != nil {
		return fail(err.Error())
	}
	if err := reconcileTimelineCaptionFollow(linkedBefore, timeline, videoReplacements); err != nil {
		return fail(err.Error())
	}
	captionChanges := captionFollowCutChanges(clips, listValue(timeline["clips"]))
	for _, change := range captionChanges {
		if change.Action == "trim" || change.Action == "split" {
			captionWarning = true
		}
	}
	plan.Changes = append(plan.Changes, captionChanges...)
	plan.Changes = append(plan.Changes, linkedAudioCutChanges(clips, listValue(timeline["clips"]), videoReplacements, sourceClipID)...)
	encoded, _ := json.Marshal(timeline)
	after, err := ValidateTimelineDocument(encoded)
	if err != nil {
		return fail("剪切结果超出时间线限制，未应用修改")
	}
	var afterDocument map[string]json.RawMessage
	_ = json.Unmarshal(after, &afterDocument)
	_ = json.Unmarshal(afterDocument["durationMs"], &plan.AfterDurationMs)
	plan.Timeline = after
	if mode == "clip_only" {
		plan.Warnings = append(plan.Warnings, "仅当前片段和关联字幕跟随剪切；其他轨道保持原位置，作品总时长可能不变。")
	} else {
		plan.Warnings = append(plan.Warnings, "受影响的画面、字幕和声音轨道一起剪切并前移，请核对背景音乐和其他素材。")
	}
	if fadeWarning {
		plan.Warnings = append(plan.Warnings, "受影响片段的淡入淡出按剩余时长调整，请检查接点声音。")
	}
	if captionWarning {
		plan.Warnings = append(plan.Warnings, "跨剪切点的字幕与文字保留原文字，请复核接点处的内容。")
	}
	return plan, nil
}

func cutTime(value map[string]any, key string) int64 {
	number, _ := timelineTime(value[key])
	return int64(number)
}
func cutRetainedIntervals(start, end int64, removed []cutInterval) []cutInterval {
	result := []cutInterval{}
	cursor := start
	first := sort.Search(len(removed), func(index int) bool { return removed[index].end > start })
	for _, item := range removed[first:] {
		if item.start >= end {
			break
		}
		if item.end <= cursor || item.start >= end {
			continue
		}
		if item.start > cursor {
			result = append(result, cutInterval{cursor, min(end, item.start)})
		}
		cursor = max(cursor, item.end)
		if cursor >= end {
			break
		}
	}
	if cursor < end {
		result = append(result, cutInterval{cursor, end})
	}
	return result
}
