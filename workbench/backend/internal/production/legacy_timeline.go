// SPDX-License-Identifier: AGPL-3.0-or-later
// Timeline/audio contracts: Copyright (C) 2023-2026 QuantumNous.
package production

import (
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"

	"yingce/backend/internal/model"
)

type LegacyTimelineProjection struct {
	Timeline      json.RawMessage   `json:"timeline"`
	ClipIDs       map[string]string `json:"clipIds"`
	PreservedOnly []string          `json:"preservedOnly"`
	Warnings      []string          `json:"warnings"`
}
type legacyProjectedClip struct {
	source      map[string]any
	data        map[string]any
	shot        map[string]any
	id          string
	start, end  int64
	sourceStart int64
	rate        float64
}

// Uses exact pinned Takes and source/program clocks. It never substitutes a
// newer selected Take for a pinned one or downloads a historical output URL.
func ProjectLegacyTimeline(document map[string]any, resources map[string]model.Resource, identities map[string]map[string]string, importID string, preflight bool) (LegacyTimelineProjection, error) {
	result := LegacyTimelineProjection{ClipIDs: map[string]string{}, PreservedOnly: []string{}, Warnings: []string{}}
	nodes := map[string]map[string]any{}
	shots := map[string]map[string]any{}
	for _, value := range listValue(document["nodes"]) {
		node := objectValue(value)
		nodes[stringValue(node, "id")] = objectValue(node["data"])
	}
	for _, value := range listValue(document["shots"]) {
		shot := objectValue(value)
		shots[stringValue(shot, "videoNodeId")] = shot
	}
	production := objectValue(document["production"])
	input := listValue(production["timeline"])
	if production["timelineEdited"] != true && len(input) == 0 {
		for _, value := range listValue(document["shots"]) {
			shot := objectValue(value)
			if nodes[stringValue(shot, "videoNodeId")] == nil {
				continue
			}
			fade := float64(0)
			if stringValue(shot, "transition") == "fade" {
				fade = positiveNumber(shot["transitionSeconds"], .5)
			}
			input = append(input, map[string]any{"id": shot["id"], "nodeId": shot["videoNodeId"], "trimStart": shot["trimStart"], "trimEnd": shot["trimEnd"], "volume": scalarOr(shot, "volume", 1), "muted": shot["muted"], "caption": shot["shotCaptionText"], "captionOffset": shot["shotCaptionOffsetSeconds"], "captionDuration": shot["shotCaptionDurationSeconds"], "fadeOut": fade})
		}
		if len(input) == 0 {
			for _, value := range listValue(document["nodes"]) {
				node := objectValue(value)
				data := objectValue(node["data"])
				if stringValue(data, "kind") == "video" && stringValue(data, "purpose") != "assembly" {
					input = append(input, map[string]any{"id": node["id"], "nodeId": node["id"]})
				}
			}
		}
	}
	clips := []any{}
	tracks := []any{map[string]any{"id": "import-video", "kind": "video", "label": "导入的镜头", "order": 0}}
	projected := []legacyProjectedClip{}
	var program int64
	for index, value := range input {
		clip := objectValue(value)
		oldID := stringValue(clip, "id")
		nodeID := stringValue(clip, "nodeId")
		data := nodes[nodeID]
		if oldID == "" || data == nil {
			return result, fmt.Errorf("%w: dangling legacy timeline occurrence", ErrLegacyBundle)
		}
		if _, exists := result.ClipIDs[oldID]; exists {
			return result, fmt.Errorf("%w: duplicate legacy timeline occurrence", ErrLegacyBundle)
		}
		takeID := stringValue(clip, "takeId")
		if takeID == "" {
			takeID = stringValue(data, "selectedTakeId")
		}
		mediaID := stringValue(data, "mediaId")
		if takeID != "" {
			found := false
			for _, value := range listValue(data["takes"]) {
				take := objectValue(value)
				if stringValue(take, "id") == takeID {
					mediaID = stringValue(take, "mediaId")
					found = true
					break
				}
			}
			if !found {
				return result, fmt.Errorf("%w: pinned Take not included", ErrLegacyBundle)
			}
		} else if len(listValue(data["takes"])) == 0 {
			takeID = "current"
		}
		resource, exists := resources[mediaID]
		if !exists {
			result.PreservedOnly = appendUnique(result.PreservedOnly, "production.timeline.unfinished")
			result.Warnings = append(result.Warnings, fmt.Sprintf("第%d个片段尚无已保存素材，未伪造或重新生成；其余时间线采用前请核对", index+1))
			continue
		}
		start := secondsToMS(clip["trimStart"])
		end := secondsToMS(clip["trimEnd"])
		if clip["trimEnd"] == nil {
			end = resource.DurationMs
		}
		if preflight && end <= start {
			end = secondsToMS(data["seconds"])
		}
		rate := scalarOr(clip, "speed", 1)
		if rate < .25 || rate > 4 || end <= start || (!preflight && resource.DurationMs > 0 && end > resource.DurationMs) {
			return result, fmt.Errorf("%w: legacy source time or playback rate invalid", ErrLegacyBundle)
		}
		length := int64(math.Round(float64(end-start) / rate))
		if length <= 0 {
			return result, ErrLegacyBundle
		}
		id := legacyNativeID("legacy-clip-v1", importID, oldID)
		result.ClipIDs[oldID] = id
		title := stringValue(data, "title")
		shot := shots[nodeID]
		volume := scalarOr(clip, "volume", 1)
		if volume < 0 || volume > 1 {
			return result, ErrLegacyBundle
		}
		if clip["muted"] == true {
			volume = 0
		}
		binding := map[string]any{"shotId": identities["shots"][stringValue(shot, "id")], "assetVersionId": identities["takes"][nodeID+"/"+takeID]}
		out := map[string]any{"id": id, "kind": "video", "nodeId": identities["nodes"][nodeID], "trackId": "import-video", "title": title, "startMs": program, "durationMs": length, "sourceStartMs": start, "sourceDurationMs": resource.DurationMs, "playbackRate": rate, "volume": volume, "directMedia": legacyDirectMedia(resource, "video", title), "productionBinding": binding}
		for _, part := range []struct{ old, new string }{{"fadeIn", "fadeInMs"}, {"fadeOut", "fadeOutMs"}} {
			fade := secondsToMS(clip[part.old])
			if fade > length {
				return result, fmt.Errorf("%w: fade exceeds occurrence", ErrLegacyBundle)
			}
			if fade > 0 {
				out[part.new] = fade
			}
		}
		clips = append(clips, out)
		projected = append(projected, legacyProjectedClip{source: clip, data: data, shot: shot, id: id, start: program, end: program + length, sourceStart: start, rate: rate})
		program += length
	}
	videoEnd := program
	type audioLane struct {
		id    string
		spans [][2]int64
	}
	audioLanes := []audioLane{}
	addSubtitle := func(key, text string, start, end int64, parents ...string) error {
		if strings.TrimSpace(text) == "" || end <= start {
			return nil
		}
		if videoEnd > 0 {
			if start >= videoEnd {
				return nil
			}
			if end > videoEnd {
				end = videoEnd
			}
		}
		subtitle := map[string]any{"id": legacyNativeID("legacy-subtitle-v1", importID, key), "kind": "subtitle", "nodeId": "legacy-subtitle", "trackId": "import-subtitles", "startMs": start, "durationMs": end - start, "text": text, "title": text}
		if len(parents) > 0 {
			var parent map[string]any
			for _, value := range clips {
				if row := objectValue(value); stringValue(row, "id") == parents[0] {
					parent = row
					break
				}
			}
			if parent == nil {
				return fmt.Errorf("%w: subtitle has no exact parent occurrence", ErrLegacyBundle)
			}
			var err error
			subtitle, err = setManualCaptionLink(subtitle, parent)
			if err != nil {
				return err
			}
		}
		clips = append(clips, subtitle)
		return nil
	}
	addAudio := func(key, mediaID, title string, start, sourceStart, sourceLength int64, rate, volume float64, limit int64, binding string, modes ...string) error {
		if mediaID == "" {
			return nil
		}
		resource, ok := resources[mediaID]
		if !ok {
			return fmt.Errorf("%w: missing auxiliary audio", ErrLegacyBundle)
		}
		if resource.DurationMs <= 0 && preflight {
			result.PreservedOnly = appendUnique(result.PreservedOnly, "audio.duration-pending")
			return nil
		}
		if limit > 0 && start >= limit {
			return nil
		}
		if start < 0 || sourceStart < 0 || rate < .25 || rate > 4 || volume < 0 || volume > 1 || sourceStart >= resource.DurationMs {
			return fmt.Errorf("%w: auxiliary audio time invalid", ErrLegacyBundle)
		}
		available := resource.DurationMs - sourceStart
		if sourceLength > 0 && sourceLength < available {
			available = sourceLength
		}
		length := int64(math.Round(float64(available) / rate))
		if limit > 0 {
			if start >= limit {
				return nil
			}
			if start+length > limit {
				length = limit - start
			}
		}
		if length <= 0 {
			return nil
		}
		lane := -1
		for index, candidate := range audioLanes {
			free := true
			for _, span := range candidate.spans {
				if start < span[1] && start+length > span[0] {
					free = false
					break
				}
			}
			if free {
				lane = index
				break
			}
		}
		if lane < 0 {
			lane = len(audioLanes)
			id := legacyNativeID("legacy-audio-lane-v1", importID, strconv.Itoa(lane))
			audioLanes = append(audioLanes, audioLane{id: id})
			tracks = append(tracks, map[string]any{"id": id, "kind": "audio", "label": fmt.Sprintf("导入声音 %d", lane+1), "order": len(tracks)})
		}
		audioLanes[lane].spans = append(audioLanes[lane].spans, [2]int64{start, start + length})
		trackID := audioLanes[lane].id
		clip := map[string]any{"id": legacyNativeID("legacy-audio-v1", importID, key), "kind": "audio", "nodeId": "legacy-audio", "trackId": trackID, "title": title, "startMs": start, "durationMs": length, "sourceStartMs": sourceStart, "sourceDurationMs": resource.DurationMs, "playbackRate": rate, "volume": volume, "directMedia": legacyDirectMedia(resource, "audio", title)}
		if binding != "" {
			clip["legacyAudioAnchor"] = map[string]any{"sourceClipId": binding}
			var video *legacyProjectedClip
			for index := range projected {
				if projected[index].id == binding {
					video = &projected[index]
					break
				}
			}
			if video == nil || start < video.start || start+length > video.end {
				return fmt.Errorf("%w: attached audio has no exact containing occurrence", ErrLegacyBundle)
			}
			mode, anchor := "source", float64(video.sourceStart)+float64(start-video.start)*video.rate
			if len(modes) > 0 && modes[0] == "clip" {
				mode, anchor = "clip", float64(start-video.start)
			}
			clip["audioLink"] = map[string]any{"sourceClipId": binding, "mode": mode, "anchorMs": anchor}
		}
		clips = append(clips, clip)
		if start+length > program {
			program = start + length
		}
		return nil
	}
	for index, value := range listValue(production["audioTracks"]) {
		track := objectValue(value)
		key := stringValue(track, "id")
		if key == "" {
			key = fmt.Sprintf("track-%d", index)
		}
		binding, limit, mode := "", videoEnd, stringValue(track, "anchorKind")
		if mode == "source" || mode == "clip" {
			binding = result.ClipIDs[stringValue(track, "anchorClipId")]
			anchor, valid := audioNumber(track["anchorSourceStart"])
			var video *legacyProjectedClip
			for index := range projected {
				if projected[index].id == binding {
					video = &projected[index]
					break
				}
			}
			if video == nil || !valid || anchor < 0 || anchor > 3600 {
				return result, fmt.Errorf("%w: attached audio anchor missing", ErrLegacyBundle)
			}
			at := float64(video.start) + anchor*1000
			if mode == "source" {
				at = float64(video.start) + (anchor*1000-float64(video.sourceStart))/video.rate
			}
			if math.Abs(at-float64(secondsToMS(track["offset"]))) > 1 || at < float64(video.start)-.001 || at >= float64(video.end) {
				return result, fmt.Errorf("%w: attached audio clock disagrees with occurrence", ErrLegacyBundle)
			}
			limit = video.end
		} else if mode != "" && mode != "project" {
			return result, fmt.Errorf("%w: unknown audio anchor kind", ErrLegacyBundle)
		}
		if err := addAudio("track:"+key, stringValue(track, "mediaId"), "导入音轨", secondsToMS(track["offset"]), secondsToMS(track["start"]), secondsToMS(track["duration"]), scalarOr(track, "speed", 1), scalarOr(track, "volume", 1), limit, binding, mode); err != nil {
			return result, err
		}
	}
	for _, part := range []struct{ prefix, title string }{{"soundtrack", "配乐"}, {"voiceover", "旁白"}} {
		if err := addAudio(part.prefix, stringValue(document, part.prefix+"MediaId"), part.title, secondsToMS(document[part.prefix+"OffsetSeconds"]), 0, 0, 1, scalarOr(document, part.prefix+"Volume", 1), videoEnd, ""); err != nil {
			return result, err
		}
	}
	for _, clip := range projected {
		captionStart := clip.start + secondsToMS(clip.source["captionOffset"])
		captionEnd := clip.end
		if duration := secondsToMS(clip.source["captionDuration"]); duration > 0 && captionStart+duration < captionEnd {
			captionEnd = captionStart + duration
		}
		if err := addSubtitle("clip:"+clip.id, stringValue(clip.source, "caption"), captionStart, captionEnd, clip.id); err != nil {
			return result, err
		}
		logicalNode := stringValue(clip.source, "nodeId")
		trim := float64(clip.sourceStart)
		voiceRate := clip.rate
		if rework := objectValue(clip.data["reworkRange"]); stringValue(rework, "sourceNodeId") != "" {
			logicalNode = stringValue(rework, "sourceNodeId")
			ratio := float64(1)
			if replacement := secondsToMS(rework["replacementDuration"]); replacement > 0 {
				ratio = float64(secondsToMS(rework["end"])-secondsToMS(rework["start"])) / float64(replacement)
			}
			trim = float64(secondsToMS(rework["start"])) + trim*ratio
			voiceRate *= ratio
		}
		shot := shots[logicalNode]
		voiceOffset := float64(secondsToMS(shot["shotVoiceoverOffsetSeconds"]))
		sourceStart := int64(math.Round(math.Max(0, trim-voiceOffset)))
		start := clip.start + int64(math.Round(math.Max(0, voiceOffset-trim)/voiceRate))
		voiceID := stringValue(shot, "shotVoiceoverMediaId")
		voice, hasVoice := resources[voiceID]
		if voiceID == "" || !hasVoice || sourceStart < voice.DurationMs || (preflight && voice.DurationMs == 0) {
			if err := addAudio("shot:"+clip.id, voiceID, "镜头旁白", start, sourceStart, 0, voiceRate, scalarOr(shot, "shotVoiceoverVolume", 1), clip.end, clip.id); err != nil {
				return result, err
			}
		}
		for index, value := range listValue(production["dialogueCues"]) {
			cue := objectValue(value)
			if stringValue(cue, "shotId") != stringValue(shot, "id") || stringValue(cue, "audioMediaId") == "" {
				continue
			}
			relative := float64(secondsToMS(cue["offset"])) - trim
			audioStart := int64(math.Round(math.Max(0, -relative)))
			at := clip.start + int64(math.Round(math.Max(0, relative)/voiceRate))
			duration := secondsToMS(cue["duration"])
			cueResource, exists := resources[stringValue(cue, "audioMediaId")]
			if !exists {
				return result, fmt.Errorf("%w: missing dialogue audio", ErrLegacyBundle)
			}
			if duration <= 0 || duration > cueResource.DurationMs {
				duration = cueResource.DurationMs
			}
			duration -= audioStart
			if duration <= 0 || at >= clip.end {
				continue
			}
			if err := addAudio(fmt.Sprintf("dialogue:%s:%d", clip.id, index), stringValue(cue, "audioMediaId"), "角色对白", at, audioStart, duration, voiceRate, 1, clip.end, clip.id); err != nil {
				return result, err
			}
			if strings.TrimSpace(stringValue(document, "captionsText")) == "" {
				resource := resources[stringValue(cue, "audioMediaId")]
				if duration <= 0 {
					duration = resource.DurationMs - audioStart
				}
				end := at + int64(math.Round(float64(duration)/voiceRate))
				if end > clip.end {
					end = clip.end
				}
				key := fmt.Sprintf("dialogue:%s:%d", clip.id, index)
				if err := addSubtitle(key, stringValue(cue, "text"), at, end, legacyNativeID("legacy-audio-v1", importID, key)); err != nil {
					return result, err
				}
			}
		}
	}
	if subtitles := strings.TrimSpace(stringValue(document, "captionsText")); subtitles != "" {
		entries, err := ParseLegacySRT(subtitles)
		if err != nil {
			result.PreservedOnly = appendUnique(result.PreservedOnly, "captionsText.invalid-timing")
			result.Warnings = append(result.Warnings, "项目字幕时间格式无法安全转换，原文已保留，请在字幕编辑器核对")
		} else {
			offset := secondsToMS(document["captionOffsetSeconds"])
			for index, entry := range entries {
				if err := addSubtitle(fmt.Sprintf("global:%d", index), entry.Text, entry.StartMs+offset, entry.EndMs+offset); err != nil {
					return result, err
				}
			}
		}
	}
	tracks = append(tracks, map[string]any{"id": "import-subtitles", "kind": "subtitle", "label": "导入字幕", "order": len(tracks)})
	graphics, converted, err := projectLegacyMotion(production["motionGraphics"], resources, importID, preflight)
	if err != nil {
		return result, err
	}
	if !converted {
		result.PreservedOnly = appendUnique(result.PreservedOnly, "production.motionGraphics")
		result.Warnings = append(result.Warnings, "原动效包含无法安全转换的设置，完整原文已保留，请核对后再交付")
	}
	if len(graphics) > 0 {
		tracks = append(tracks, map[string]any{"id": "import-graphics", "kind": "text", "label": "导入标题与图形", "order": -1})
		clips = append(clips, graphics...)
	}
	for _, key := range []string{"reframes", "translationNodes"} {
		if legacyVersionFieldHasContent(production[key]) {
			result.PreservedOnly = appendUnique(result.PreservedOnly, "production."+key)
		}
	}
	if len(tracks) > 64 {
		return result, fmt.Errorf("%w: more than64 native audio/visual tracks", ErrLegacyBundle)
	}
	raw, err := json.Marshal(map[string]any{"version": 2, "tracks": tracks, "clips": clips, "durationMs": program})
	if err != nil {
		return result, err
	}
	result.Timeline, err = ValidateTimelineDocument(raw)
	return result, err
}
func scalarOr(object map[string]any, key string, fallback float64) float64 {
	if object[key] == nil {
		return fallback
	}
	return numberValue(object[key])
}
func legacyDirectMedia(resource model.Resource, kind, title string) map[string]any {
	return map[string]any{"id": resource.ID, "kind": kind, "title": title, "storageKey": "resource:" + resource.ID, "url": "/api/resources/" + resource.ID + "/file", "durationMs": resource.DurationMs, "width": resource.Width, "height": resource.Height, "bytes": resource.Size, "mimeType": resource.MimeType}
}

type LegacySubtitleCue struct {
	StartMs, EndMs int64
	Text           string
}

var legacySRTTime = regexp.MustCompile(`^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})\s*$`)

func ParseLegacySRT(text string) ([]LegacySubtitleCue, error) {
	text = strings.TrimPrefix(strings.ReplaceAll(text, "\r\n", "\n"), "\ufeff")
	entries := []LegacySubtitleCue{}
	lines := strings.Split(text, "\n")
	for index := 0; index < len(lines); {
		if strings.TrimSpace(lines[index]) == "" {
			index++
			continue
		}
		if _, err := strconv.Atoi(strings.TrimSpace(lines[index])); err == nil {
			index++
		}
		if index >= len(lines) {
			return nil, ErrLegacyBundle
		}
		parts := legacySRTTime.FindStringSubmatch(strings.TrimSpace(lines[index]))
		if parts == nil {
			return nil, ErrLegacyBundle
		}
		stamp := func(offset int) (int64, error) {
			values := []int{}
			for i := offset; i < offset+4; i++ {
				n, err := strconv.Atoi(parts[i])
				if err != nil {
					return 0, err
				}
				values = append(values, n)
			}
			if values[1] > 59 || values[2] > 59 {
				return 0, ErrLegacyBundle
			}
			return int64(((values[0]*60+values[1])*60+values[2])*1000 + values[3]), nil
		}
		start, e1 := stamp(1)
		end, e2 := stamp(5)
		if e1 != nil || e2 != nil || end <= start || end > 86_400_000 {
			return nil, ErrLegacyBundle
		}
		index++
		body := []string{}
		for index < len(lines) && strings.TrimSpace(lines[index]) != "" {
			body = append(body, lines[index])
			index++
		}
		if len(body) == 0 {
			return nil, ErrLegacyBundle
		}
		entries = append(entries, LegacySubtitleCue{StartMs: start, EndMs: end, Text: strings.Join(body, "\n")})
		if len(entries) > 5000 {
			return nil, ErrLegacyBundle
		}
	}
	return entries, nil
}
