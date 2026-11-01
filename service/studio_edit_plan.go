package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"slices"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

type StudioSourceRange struct {
	Start float64 `json:"start"`
	End   float64 `json:"end"`
}

type StudioEditRequest struct {
	VersionID         string              `json:"version_id,omitempty"`
	TrimStart         *float64            `json:"trim_start,omitempty"`
	TrimEnd           *float64            `json:"trim_end,omitempty"`
	Speed             *float64            `json:"speed,omitempty"`
	TakeID            string              `json:"take_id,omitempty"`
	ReplacementNodeID string              `json:"replacement_node_id,omitempty"`
	AnalysisID        string              `json:"analysis_id,omitempty"`
	Width             int                 `json:"width,omitempty"`
	Height            int                 `json:"height,omitempty"`
	RequestID         string              `json:"request_id"`
	Revision          int64               `json:"revision"`
	Action            string              `json:"action"`
	ClipID            string              `json:"clip_id,omitempty"`
	Ranges            []StudioSourceRange `json:"ranges,omitempty"`
	Order             []string            `json:"order,omitempty"`
	TranscriptID      string              `json:"transcript_id,omitempty"`
	UtteranceIDs      []string            `json:"utterance_ids,omitempty"`
	ReviewConfirmed   bool                `json:"review_confirmed,omitempty"`
}

type StudioEditPlanDocument struct {
	Request      StudioEditRequest `json:"request"`
	NextDocument map[string]any    `json:"next_document"`
	Impact       map[string]any    `json:"impact"`
	SourceRefs   []map[string]any  `json:"source_refs"`
}

func studioDocumentNumber(value any, fallback float64) float64 {
	switch number := value.(type) {
	case float64:
		return number
	case int:
		return float64(number)
	case int64:
		return float64(number)
	}
	return fallback
}

func studioTimelineDocument(document map[string]any) (map[string]any, []map[string]any) {
	production, _ := document["production"].(map[string]any)
	if production == nil {
		production = map[string]any{}
		document["production"] = production
	}
	clips := studioObjects(production, "timeline")
	if len(clips) > 0 || production["timelineEdited"] == true {
		return production, clips
	}
	nodes := studioObjects(document, "nodes")
	appendNode := func(nodeID, clipID string, shot map[string]any) {
		for _, node := range nodes {
			data, _ := node["data"].(map[string]any)
			if node["id"] != nodeID || data["kind"] != "video" || data["purpose"] == "assembly" {
				continue
			}
			clip := map[string]any{"id": clipID, "nodeId": nodeID, "trimStart": 0.0, "speed": 1.0, "volume": 1.0, "muted": false, "caption": "", "captionOffset": 0.0, "captionDuration": 0.0, "fadeIn": 0.0, "fadeOut": 0.0}
			if take, ok := data["selectedTakeId"].(string); ok && take != "" {
				clip["takeId"] = take
			}
			for _, key := range []string{"trimStart", "trimEnd", "volume", "muted"} {
				if value, ok := shot[key]; ok {
					clip[key] = value
				}
			}
			for from, to := range map[string]string{"shotCaptionText": "caption", "shotCaptionOffsetSeconds": "captionOffset", "shotCaptionDurationSeconds": "captionDuration"} {
				if value, ok := shot[from]; ok {
					clip[to] = value
				}
			}
			clips = append(clips, clip)
		}
	}
	shots := studioObjects(document, "shots")
	if len(shots) > 0 {
		for _, shot := range shots {
			appendNode(fmt.Sprint(shot["videoNodeId"]), fmt.Sprint(shot["id"]), shot)
		}
	} else {
		for _, node := range nodes {
			appendNode(fmt.Sprint(node["id"]), fmt.Sprint(node["id"]), nil)
		}
	}
	return production, clips
}

func studioClipSource(ownerID int, document, clip map[string]any) (*model.StudioMedia, map[string]any, error) {
	for _, node := range studioObjects(document, "nodes") {
		if node["id"] != clip["nodeId"] {
			continue
		}
		data, _ := node["data"].(map[string]any)
		mediaID, _ := data["mediaId"].(string)
		if takeID, _ := clip["takeId"].(string); takeID != "" {
			mediaID = ""
			for _, take := range studioObjects(data, "takes") {
				if take["id"] == takeID && take["status"] == "completed" {
					mediaID, _ = take["mediaId"].(string)
				}
			}
		}
		if mediaID == "" {
			return nil, nil, errors.New("the exact clip source is unavailable")
		}
		media, err := GetStudioMedia(ownerID, mediaID)
		return media, data, err
	}
	return nil, nil, errors.New("clip source node is unavailable")
}

// CompileStudioTimelineCut uses source seconds. Output ranges retain a mapping
// from the original program time so captions and graphics follow the same edit.
func CompileStudioTimelineCut(document map[string]any, request StudioEditRequest, durations map[string]float64) (map[string]any, []StudioSourceRange, error) {
	raw, err := common.Marshal(document)
	if err != nil {
		return nil, nil, err
	}
	var next map[string]any
	if err := common.Unmarshal(raw, &next); err != nil {
		return nil, nil, err
	}
	production, clips := studioTimelineDocument(next)
	if len(clips) == 0 || len(clips) > 100 || len(request.Ranges) == 0 || len(request.Ranges) > 100 {
		return nil, nil, errors.New("choose a clip and between one and one hundred source ranges")
	}
	ranges := slices.Clone(request.Ranges)
	slices.SortFunc(ranges, func(a, b StudioSourceRange) int {
		if a.Start < b.Start {
			return -1
		}
		if a.Start > b.Start {
			return 1
		}
		return 0
	})
	merged := []StudioSourceRange{}
	for _, cut := range ranges {
		if math.IsNaN(cut.Start) || math.IsNaN(cut.End) || math.IsInf(cut.Start, 0) || math.IsInf(cut.End, 0) || cut.Start < 0 || cut.End <= cut.Start || cut.End > 3600 {
			return nil, nil, errors.New("cut ranges must be finite source times within the media")
		}
		if len(merged) > 0 && cut.Start <= merged[len(merged)-1].End {
			merged[len(merged)-1].End = max(merged[len(merged)-1].End, cut.End)
		} else {
			merged = append(merged, cut)
		}
	}
	output, retained := []any{}, []StudioSourceRange{}
	oldReframes, _ := production["reframes"].(map[string]any)
	nextReframes := map[string]any{}
	program, found := 0.0, false
	for _, clip := range clips {
		start := studioDocumentNumber(clip["trimStart"], 0)
		end := studioDocumentNumber(clip["trimEnd"], durations[fmt.Sprint(clip["id"])])
		speed := studioDocumentNumber(clip["speed"], 1)
		if end <= start || speed < .25 || speed > 4 || math.IsInf(end, 0) || math.IsNaN(end) {
			return nil, nil, errors.New("probe the source duration before editing the timeline")
		}
		segments := []StudioSourceRange{{Start: start, End: end}}
		if clip["id"] == request.ClipID {
			found = true
			segments = nil
			cursor := start
			for _, cut := range merged {
				if cut.Start < start || cut.End > end {
					return nil, nil, errors.New("cut range is outside the selected clip")
				}
				if cut.Start > cursor {
					segments = append(segments, StudioSourceRange{cursor, cut.Start})
				}
				cursor = max(cursor, cut.End)
			}
			if cursor < end {
				segments = append(segments, StudioSourceRange{cursor, end})
			}
		}
		for index, segment := range segments {
			part := map[string]any{}
			for key, value := range clip {
				part[key] = value
			}
			if clip["id"] == request.ClipID {
				hash := sha256.Sum256([]byte(fmt.Sprintf("%s:%s:%d", request.RequestID, request.ClipID, index)))
				part["id"] = hex.EncodeToString(hash[:16])
			}
			part["trimStart"], part["trimEnd"] = segment.Start, segment.End
			if ref, ok := oldReframes[fmt.Sprint(clip["id"])]; ok {
				nextReframes[fmt.Sprint(part["id"])] = ref
			}
			if segment.Start > start {
				part["fadeIn"] = 0.0
			}
			if segment.End < end {
				part["fadeOut"] = 0.0
			}
			captionStart := studioDocumentNumber(clip["captionOffset"], 0)
			captionEnd := (end - start) / speed
			if length := studioDocumentNumber(clip["captionDuration"], 0); length > 0 {
				captionEnd = min(captionEnd, captionStart+length)
			}
			partStart, partEnd := (segment.Start-start)/speed, (segment.End-start)/speed
			if captionEnd <= partStart || captionStart >= partEnd {
				part["caption"] = ""
				part["captionDuration"] = 0.0
			} else {
				part["captionOffset"] = max(0, captionStart-partStart)
				part["captionDuration"] = min(partEnd, captionEnd) - max(partStart, captionStart)
			}
			retained = append(retained, StudioSourceRange{program + partStart, program + partEnd})
			output = append(output, part)
		}
		program += (end - start) / speed
	}
	if !found || len(output) == 0 || len(output) > 100 {
		return nil, nil, errors.New("the edit needs a selected clip and a nonempty supported timeline")
	}
	production["timeline"], production["timelineEdited"], production["documentVersion"] = output, true, StudioDocumentVersion
	if oldReframes != nil {
		production["reframes"] = nextReframes
	}
	if subtitles, _ := next["captionsText"].(string); subtitles != "" {
		next["captionsText"], err = studioEditSubtitles(subtitles, studioDocumentNumber(next["captionOffsetSeconds"], 0), retained)
		if err != nil {
			return nil, nil, err
		}
		next["captionOffsetSeconds"] = 0.0
	}
	graphics := []any{}
	for _, item := range studioObjects(production, "motionGraphics") {
		start, end := studioDocumentNumber(item["start"], 0), studioDocumentNumber(item["end"], 0)
		offset, index := 0.0, 0
		for _, kept := range retained {
			a, b := max(start, kept.Start), min(end, kept.End)
			span := StudioSourceRange{offset + a - kept.Start, offset + b - kept.Start}
			offset += kept.End - kept.Start
			if b <= a {
				continue
			}
			part := map[string]any{}
			for key, value := range item {
				part[key] = value
			}
			part["start"], part["end"] = span.Start, span.End
			part["phaseOffset"] = studioDocumentNumber(item["phaseOffset"], 0) + a - start
			part["phaseDuration"] = studioDocumentNumber(item["phaseDuration"], end-start)
			if index > 0 {
				sum := sha256.Sum256([]byte(fmt.Sprintf("%s:%s:%d", request.RequestID, item["id"], index)))
				part["id"] = hex.EncodeToString(sum[:16])
			}
			graphics = append(graphics, part)
			index++
		}
	}
	if len(graphics) > 50 {
		return nil, nil, errors.New("editing would exceed the motion graphic limit")
	}
	if production["motionGraphics"] != nil {
		production["motionGraphics"] = graphics
	}
	if err := CompileStudioAnchoredAudio(document, next, retained, durations); err != nil {
		return nil, nil, err
	}
	return next, retained, nil
}

func studioMapRetainedRange(start, end float64, retained []StudioSourceRange) []StudioSourceRange {
	result, offset := []StudioSourceRange{}, 0.0
	for _, kept := range retained {
		a, b := max(start, kept.Start), min(end, kept.End)
		if b > a {
			result = append(result, StudioSourceRange{offset + a - kept.Start, offset + b - kept.Start})
		}
		offset += kept.End - kept.Start
	}
	return result
}

func studioEditSubtitles(raw string, captionOffset float64, retained []StudioSourceRange) (string, error) {
	var output strings.Builder
	count := 0
	for block := range strings.SplitSeq(strings.TrimSpace(strings.ReplaceAll(raw, "\r\n", "\n")), "\n\n") {
		lines := strings.Split(strings.TrimSpace(block), "\n")
		if len(lines) < 2 {
			continue
		}
		index := 0
		if _, err := strconv.Atoi(lines[0]); err == nil {
			index = 1
		}
		if index >= len(lines) {
			return "", errors.New("subtitle block has no timing")
		}
		match := studioSubtitleTiming.FindStringSubmatch(lines[index])
		start, end, err := studioSubtitleSeconds(match)
		if err != nil {
			return "", err
		}
		for _, span := range studioMapRetainedRange(start+captionOffset, end+captionOffset, retained) {
			count++
			fmt.Fprintf(&output, "%d\n%s --> %s%s\n%s\n\n", count, studioSubtitleTime(span.Start), studioSubtitleTime(span.End), match[9], strings.Join(lines[index+1:], "\n"))
		}
	}
	return output.String(), nil
}

func PrepareStudioEditPlan(ctx context.Context, actorID int, projectID string, request StudioEditRequest) (*model.StudioProductionRecord, error) {
	if !StudioIDPattern.MatchString(request.RequestID) || request.Revision < 1 || (request.Action != "cut_source_ranges" && request.Action != "delete_transcript" && request.Action != "apply_reframe" && request.Action != "transcript_captions" && request.Action != "replace_source_range" && request.Action != "edit_clip") || !StudioIDPattern.MatchString(request.ClipID) {
		return nil, errors.New("choose a supported edit action and source clip")
	}
	if request.Action == "edit_clip" && request.VersionID == "" || request.VersionID != "" && (!StudioIDPattern.MatchString(request.VersionID) || !request.ReviewConfirmed || (request.Action != "edit_clip" && request.Action != "cut_source_ranges" && request.Action != "apply_reframe")) {
		return nil, errors.New("review a supported edit for an exact regional version")
	}
	if old, err := model.ReadStudioProductionRecord(actorID, request.RequestID, true); err == nil {
		var saved StudioEditPlanDocument
		if old.Kind != "edit_plan" || old.ProjectID != projectID || common.Unmarshal([]byte(old.Document), &saved) != nil {
			return nil, model.ErrStudioRevision
		}
		a, _ := common.Marshal(request)
		b, _ := common.Marshal(saved.Request)
		if string(a) != string(b) {
			return nil, model.ErrStudioRevision
		}
		return old, nil
	}
	project, _, err := model.StudioProjectAccess(model.DB, actorID, projectID, true)
	if err != nil {
		return nil, err
	}
	if project.Revision != request.Revision {
		return nil, model.ErrStudioRevision
	}
	var document map[string]any
	if err := common.Unmarshal([]byte(project.Document), &document); err != nil {
		return nil, err
	}
	originalDocument := document
	if request.VersionID != "" {
		document, err = studioRegionalEditDocument(document, request.VersionID)
		if err != nil {
			return nil, err
		}
	}
	_, clips := studioTimelineDocument(document)
	compiledRequest := request
	if request.Action == "delete_transcript" {
		ranges, err := studioTranscriptCutRanges(actorID, project, document, clips, request)
		if err != nil {
			return nil, err
		}
		compiledRequest.Ranges = ranges
	}
	durations, refs := map[string]float64{}, []map[string]any{}
	sourceHasAudio := false
	if request.Action == "cut_source_ranges" || request.Action == "delete_transcript" || request.Action == "edit_clip" {
		production, _ := document["production"].(map[string]any)
		for _, track := range studioObjects(production, "audioTracks") {
			if track["anchorKind"] != "source" && track["anchorKind"] != "clip" && (request.VersionID == "" || track["anchorKind"] == "project") {
				continue
			}
			id, _ := track["mediaId"].(string)
			media, err := GetStudioMedia(project.OwnerID, id)
			if err != nil {
				return nil, err
			}
			path, err := StudioMediaPath(media)
			if err != nil {
				return nil, err
			}
			probe, err := ProbeStudioMedia(ctx, path)
			if err != nil || !probe.HasAudio {
				return nil, errors.New("attached audio is unavailable or undecodable")
			}
			durations[id] = probe.Duration
			refs = append(refs, map[string]any{"media_id": id, "digest": media.Digest, "audio_track_id": track["id"]})
		}
	}
	for _, clip := range clips {
		media, data, err := studioEditClipSource(project.OwnerID, document, clip, request.VersionID)
		if err != nil {
			return nil, err
		}
		if clip["id"] == request.ClipID && (data["locked"] == true || clip["locked"] == true) {
			return nil, errors.New("the selected clip is locked")
		}
		for _, shot := range studioObjects(document, "shots") {
			if clip["id"] == request.ClipID && (shot["id"] == clip["id"] || shot["videoNodeId"] == clip["nodeId"]) && shot["locked"] == true {
				return nil, errors.New("the selected shot is locked")
			}
		}
		path, err := StudioMediaPath(media)
		if err != nil {
			return nil, err
		}
		probe, err := ProbeStudioMedia(ctx, path)
		if err != nil {
			return nil, err
		}
		if request.VersionID != "" && !probe.HasVideo {
			return nil, errors.New("the pinned regional source has no decodable video")
		}
		durations[fmt.Sprint(clip["id"])] = probe.Duration
		if clip["id"] == request.ClipID {
			sourceHasAudio = probe.HasAudio
		}
		if end := studioDocumentNumber(clip["trimEnd"], probe.Duration); end > probe.Duration+.001 {
			return nil, errors.New("clip trim exceeds its actual media duration")
		}
		refs = append(refs, map[string]any{"media_id": media.MediaID, "digest": media.Digest, "take_id": clip["takeId"], "clip_id": clip["id"]})
	}
	var next map[string]any
	var retained []StudioSourceRange
	if request.Action == "apply_reframe" {
		if request.VersionID != "" {
			for _, clip := range clips {
				if clip["id"] == request.ClipID {
					actual, _, sourceErr := studioClipSource(project.OwnerID, document, clip)
					if sourceErr != nil || actual.MediaID != clip["sourceMediaId"] {
						return nil, errors.New("the pinned regional source needs its exact stored node and Take before reframing")
					}
				}
			}
		}
		next, retained, err = studioCompileReframe(actorID, project, document, clips, durations, request)
	} else if request.Action == "edit_clip" {
		var extra []map[string]any
		next, retained, extra, err = studioCompileRegionalClipEdit(ctx, project, document, request, durations)
		refs = append(refs, extra...)
	} else if request.Action == "transcript_captions" {
		next, retained, err = studioCompileTranscriptCaptions(actorID, project, document, clips, durations, request)
	} else if request.Action == "replace_source_range" {
		var target map[string]any
		for _, node := range studioObjects(document, "nodes") {
			if node["id"] == request.ReplacementNodeID {
				target = node
			}
		}
		if target == nil {
			return nil, errors.New("choose a completed replacement video")
		}
		data, _ := target["data"].(map[string]any)
		media, _, sourceErr := studioClipSource(project.OwnerID, document, map[string]any{"nodeId": request.ReplacementNodeID, "takeId": data["selectedTakeId"]})
		if sourceErr != nil {
			return nil, sourceErr
		}
		path, sourceErr := StudioMediaPath(media)
		if sourceErr != nil {
			return nil, sourceErr
		}
		probe, sourceErr := ProbeStudioMedia(ctx, path)
		if sourceErr != nil || !probe.HasVideo {
			return nil, errors.New("replacement video could not be decoded")
		}
		next, retained, err = CompileStudioRangeReplacement(document, request, durations, probe.Duration, sourceHasAudio)
		refs = append(refs, map[string]any{"media_id": media.MediaID, "digest": media.Digest, "take_id": data["selectedTakeId"], "replacement_node_id": request.ReplacementNodeID})
	} else {
		next, retained, err = CompileStudioTimelineCut(document, compiledRequest, durations)
	}
	if err != nil {
		return nil, err
	}
	if request.VersionID != "" && request.Action == "cut_source_ranges" {
		if err := studioRegionalCutAudio(document, next, retained, durations, request); err != nil {
			return nil, err
		}
	}
	if request.Action == "replace_source_range" {
		audioRef, err := prepareStudioReplacementAudioEnvelope(ctx, project, document, next, request, durations)
		if err != nil {
			return nil, err
		}
		if audioRef != nil {
			refs = append(refs, audioRef)
		}
	}
	production, _ := next["production"].(map[string]any)
	if request.VersionID == "" {
		plans, _ := production["appliedEditPlans"].([]any)
		plans = append(plans, request.RequestID)
		if len(plans) > 100 {
			plans = plans[len(plans)-100:]
		}
		production["appliedEditPlans"] = plans
	} else {
		next, err = studioRestoreRegionalEditDocument(originalDocument, next, request.VersionID)
		if err != nil {
			return nil, err
		}
	}
	raw, err := common.Marshal(next)
	if err != nil {
		return nil, err
	}
	if _, err := ValidateStudioDocument(projectID, raw); err != nil {
		return nil, err
	}
	total := 0.0
	for _, span := range retained {
		total += span.End - span.Start
	}
	return SaveStudioProductionRecord(actorID, projectID, request.RequestID, "edit_plan", request.Revision, StudioEditPlanDocument{Request: request, NextDocument: next, Impact: map[string]any{"output_seconds": total, "clip_id": request.ClipID, "version_id": request.VersionID, "ranges": compiledRequest.Ranges, "preserve_original_media": true, "music_policy": "keep_project_time"}, SourceRefs: refs})
}

func studioTranscriptCutRanges(actorID int, project *model.StudioProject, document map[string]any, clips []map[string]any, request StudioEditRequest) ([]StudioSourceRange, error) {
	if !StudioIDPattern.MatchString(request.TranscriptID) || len(request.UtteranceIDs) == 0 || len(request.UtteranceIDs) > 100 || !request.ReviewConfirmed || len(request.Ranges) != 0 {
		return nil, errors.New("review the transcript and select up to one hundred sentences; source times are computed by the server")
	}
	record, result, err := ReadStudioAnalysisResult(actorID, request.TranscriptID)
	if err != nil {
		return nil, err
	}
	if record.ProjectID != project.ID {
		return nil, model.ErrStudioAccess
	}
	var selected map[string]any
	for _, clip := range clips {
		if clip["id"] == request.ClipID {
			selected = clip
		}
	}
	if selected == nil {
		return nil, errors.New("select the exact timeline occurrence")
	}
	media, _, err := studioClipSource(project.OwnerID, document, selected)
	if err != nil {
		return nil, err
	}
	if media.MediaID != result["source_media_id"] || media.Digest != result["source_digest"] {
		return nil, errors.New("the transcript source differs from the selected clip")
	}
	raw, _ := common.Marshal(result["analysis"])
	var transcript StudioTranscript
	if common.Unmarshal(raw, &transcript) != nil || transcript.Kind != "transcript" {
		return nil, errors.New("choose a transcript analysis")
	}
	chosen := map[string]bool{}
	for _, id := range request.UtteranceIDs {
		if chosen[id] {
			return nil, errors.New("duplicate transcript sentence")
		}
		chosen[id] = true
	}
	ranges := []StudioSourceRange{}
	for _, span := range transcript.Segments {
		if chosen[span.ID] {
			ranges = append(ranges, StudioSourceRange{span.Start, span.End})
			delete(chosen, span.ID)
		}
	}
	if len(chosen) != 0 {
		return nil, errors.New("a selected sentence is no longer available")
	}
	return ranges, nil
}
