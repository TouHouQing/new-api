package service

import (
	"errors"
	"fmt"
	"math"

	"github.com/QuantumNous/new-api/common"
)

// CompileStudioRangeReplacement keeps the original program clock. The caller
// probes both immutable sources; only the selected occurrence is replaced.
func CompileStudioRangeReplacement(document map[string]any, request StudioEditRequest, durations map[string]float64, outputDuration float64, sourceHasAudio bool) (map[string]any, []StudioSourceRange, error) {
	if !request.ReviewConfirmed || !StudioIDPattern.MatchString(request.ReplacementNodeID) || len(request.Ranges) != 0 || !studioSceneFinite(outputDuration) || outputDuration <= 0 {
		return nil, nil, errors.New("review a completed replacement before preparing this edit")
	}
	raw, err := common.Marshal(document)
	if err != nil {
		return nil, nil, err
	}
	var next map[string]any
	if err := common.Unmarshal(raw, &next); err != nil {
		return nil, nil, err
	}
	production, clips := studioTimelineDocument(next)
	var target map[string]any
	for _, node := range studioObjects(next, "nodes") {
		if node["id"] == request.ReplacementNodeID {
			target, _ = node["data"].(map[string]any)
		}
	}
	if target == nil || target["kind"] != "video" || target["status"] != "completed" || target["mediaId"] == nil || target["mediaId"] == "" {
		return nil, nil, errors.New("finish and review the replacement clip first")
	}
	rangeData, _ := target["reworkRange"].(map[string]any)
	start, end := studioDocumentNumber(rangeData["start"], math.NaN()), studioDocumentNumber(rangeData["end"], math.NaN())
	if !studioSceneFinite(start) || !studioSceneFinite(end) || start < 0 || end <= start {
		return nil, nil, errors.New("replacement source interval is unavailable")
	}
	output, retained := []any{}, []StudioSourceRange{}
	oldReframes, _ := production["reframes"].(map[string]any)
	reframes := map[string]any{}
	program, found := 0., false
	for _, clip := range clips {
		id, _ := clip["id"].(string)
		a, b, speed := studioDocumentNumber(clip["trimStart"], 0), studioDocumentNumber(clip["trimEnd"], durations[id]), studioDocumentNumber(clip["speed"], 1)
		if !studioSceneFinite(a) || !studioSceneFinite(b) || !studioSceneFinite(speed) || b <= a || speed < .25 || speed > 4 {
			return nil, nil, errors.New("probe the source duration before replacing this interval")
		}
		if id != request.ClipID {
			output = append(output, clip)
			retained = append(retained, StudioSourceRange{program, program + (b-a)/speed})
			if ref, ok := oldReframes[id]; ok {
				reframes[id] = ref
			}
			program += (b - a) / speed
			continue
		}
		found = true
		if clip["nodeId"] != rangeData["sourceNodeId"] || start < a || end > b || clip["locked"] == true {
			return nil, nil, errors.New("choose the exact unlocked occurrence containing this source interval")
		}
		var source map[string]any
		for _, node := range studioObjects(next, "nodes") {
			if node["id"] == clip["nodeId"] {
				source, _ = node["data"].(map[string]any)
			}
		}
		mediaID := source["mediaId"]
		if takeID, ok := clip["takeId"].(string); ok && takeID != "" {
			mediaID = nil
			for _, take := range studioObjects(source, "takes") {
				if take["id"] == takeID && take["status"] == "completed" {
					mediaID = take["mediaId"]
				}
			}
		}
		if mediaID != rangeData["sourceMediaId"] || source["locked"] == true {
			return nil, nil, errors.New("the original Take changed after this replacement was prepared")
		}
		origin, _ := target["derivedFrom"].(map[string]any)
		if originalTake, ok := origin["takeId"].(string); ok && originalTake != "" && originalTake != clip["takeId"] {
			return nil, nil, errors.New("the replacement was prepared for a different Take")
		}
		for _, shot := range studioObjects(next, "shots") {
			if (shot["id"] == id || shot["videoNodeId"] == clip["nodeId"]) && shot["locked"] == true {
				return nil, nil, errors.New("the selected shot is locked")
			}
		}
		outputSpeed := outputDuration / ((end - start) / speed)
		if outputSpeed < .25 || outputSpeed > 4 {
			return nil, nil, errors.New("replacement duration requires unsupported playback speed")
		}
		// Explicitly preserving sound across different pictures detaches it to the
		// unchanged project clock, so it cannot retain a false source anchor.
		tracks := studioObjects(production, "audioTracks")
		for _, track := range tracks {
			if track["anchorClipId"] == id {
				track["anchorKind"] = "project"
				delete(track, "anchorClipId")
				delete(track, "anchorSourceStart")
			}
		}
		hasDialogue := false
		for _, shot := range studioObjects(next, "shots") {
			if shot["videoNodeId"] == clip["nodeId"] {
				for _, cue := range studioObjects(production, "dialogueCues") {
					if cue["shotId"] == shot["id"] && cue["audioMediaId"] != nil && cue["audioMediaId"] != "" {
						hasDialogue = true
					}
				}
			}
		}
		if sourceHasAudio && clip["muted"] != true && !hasDialogue {
			tracks = append(tracks, map[string]any{"id": "voice-" + studioAnalysisID(request.RequestID + ":original-audio")[:32], "mediaId": mediaID, "start": a, "offset": program, "duration": b - a, "speed": speed, "volume": studioDocumentNumber(clip["volume"], 1), "anchorKind": "project"})
		}
		if len(tracks) > 100 {
			return nil, nil, errors.New("this replacement would exceed one hundred audio tracks")
		}
		trackValues := []any{}
		for _, track := range tracks {
			trackValues = append(trackValues, track)
		}
		production["audioTracks"] = trackValues
		segments := []StudioSourceRange{}
		if start > a {
			segments = append(segments, StudioSourceRange{a, start})
		}
		segments = append(segments, StudioSourceRange{start, end})
		if end < b {
			segments = append(segments, StudioSourceRange{end, b})
		}
		for index, span := range segments {
			part := map[string]any{}
			for key, value := range clip {
				part[key] = value
			}
			partID := "clip-" + studioAnalysisID(fmt.Sprintf("%s:%s:%d", request.RequestID, id, index))[:32]
			part["id"] = partID
			part["trimStart"], part["trimEnd"] = span.Start, span.End
			localStart, localEnd := (span.Start-a)/speed, (span.End-a)/speed
			captionStart := studioDocumentNumber(clip["captionOffset"], 0)
			captionEnd := (b - a) / speed
			if length := studioDocumentNumber(clip["captionDuration"], 0); length > 0 {
				captionEnd = min(captionEnd, captionStart+length)
			}
			if captionEnd <= localStart || captionStart >= localEnd {
				part["caption"] = ""
				part["captionDuration"] = 0.
			} else {
				part["captionOffset"] = max(0, captionStart-localStart)
				part["captionDuration"] = min(localEnd, captionEnd) - max(localStart, captionStart)
			}
			if span.Start > a {
				part["fadeIn"] = 0.
			}
			if span.End < b {
				part["fadeOut"] = 0.
			}
			if sourceHasAudio {
				part["muted"] = true
			}
			if span.Start == start && span.End == end {
				part["nodeId"], part["takeId"] = request.ReplacementNodeID, target["selectedTakeId"]
				if part["takeId"] == nil {
					delete(part, "takeId")
				}
				part["trimStart"], part["trimEnd"], part["speed"], part["muted"] = 0., outputDuration, outputSpeed, true

			} else if ref, ok := oldReframes[id]; ok {
				reframes[partID] = ref
			}
			output = append(output, part)
			retained = append(retained, StudioSourceRange{program + localStart, program + localEnd})
		}
		rangeData["replacementDuration"] = outputDuration
		program += (b - a) / speed
	}
	if !found || len(output) > 100 {
		return nil, nil, errors.New("select an existing occurrence within the one hundred clip limit")
	}
	production["timeline"], production["timelineEdited"], production["documentVersion"] = output, true, StudioDocumentVersion
	if oldReframes != nil {
		production["reframes"] = reframes
	}
	// Captions, graphics, independent narration and music keep program time.
	return next, retained, nil
}
