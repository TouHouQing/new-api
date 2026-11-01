/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
package service

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

func studioRegionalClone(value map[string]any) (map[string]any, error) {
	raw, err := common.Marshal(value)
	if err != nil {
		return nil, err
	}
	var next map[string]any
	if err = common.Unmarshal(raw, &next); err != nil {
		return nil, err
	}
	return next, nil
}

// Project only the native saved entry. Shared nodes remain immutable references;
// mother captions, soundtracks and dialogue never leak into a regional edit.
func studioRegionalEditDocument(original map[string]any, versionID string) (map[string]any, error) {
	next, err := studioRegionalClone(original)
	if err != nil {
		return nil, err
	}
	production, _ := next["production"].(map[string]any)
	var selected map[string]any
	for _, version := range studioObjects(production, "regionalVersions") {
		if version["id"] == versionID {
			if selected != nil {
				return nil, errors.New("duplicate regional version identity")
			}
			selected = version
		}
	}
	if selected == nil {
		return nil, errors.New("the exact regional version is unavailable")
	}
	if len(studioObjects(selected, "timeline")) == 0 {
		return nil, errors.New("the regional version has no editable timeline")
	}
	projected, err := studioRegionalClone(selected)
	if err != nil {
		return nil, err
	}
	projected["timelineEdited"], projected["documentVersion"] = true, StudioDocumentVersion
	next["production"], next["captionsText"], next["captionOffsetSeconds"] = projected, selected["subtitles"], 0.
	for _, key := range []string{"soundtrackMediaId", "soundtrackOffsetSeconds", "soundtrackVolume", "voiceoverMediaId", "voiceoverOffsetSeconds", "voiceoverVolume"} {
		delete(next, key)
	}
	return next, nil
}

func studioRestoreRegionalEditDocument(original, edited map[string]any, versionID string) (map[string]any, error) {
	next, err := studioRegionalClone(original)
	if err != nil {
		return nil, err
	}
	production, _ := next["production"].(map[string]any)
	projected, _ := edited["production"].(map[string]any)
	found := false
	for _, version := range studioObjects(production, "regionalVersions") {
		if version["id"] != versionID {
			continue
		}
		found = true
		for _, key := range []string{"timeline", "audioTracks", "motionGraphics", "reframes", "width", "height", "fps", "fit"} {
			if value, ok := projected[key]; ok {
				version[key] = value
			} else {
				delete(version, key)
			}
		}
		version["subtitles"] = edited["captionsText"]
	}
	if !found {
		return nil, errors.New("the exact regional version is unavailable")
	}
	return next, nil
}

func studioEditClipSource(ownerID int, document, clip map[string]any, versionID string) (*model.StudioMedia, map[string]any, error) {
	if versionID == "" {
		return studioClipSource(ownerID, document, clip)
	}
	// Regional snapshots intentionally retain archived Takes after canvas deletion.
	id, _ := clip["sourceMediaId"].(string)
	if !StudioIDPattern.MatchString(id) {
		return nil, nil, errors.New("the regional clip has no pinned immutable source")
	}
	media, err := GetStudioMedia(ownerID, id)
	data := map[string]any{}
	for _, node := range studioObjects(document, "nodes") {
		if node["id"] == clip["nodeId"] {
			data, _ = node["data"].(map[string]any)
			for _, take := range studioObjects(data, "takes") {
				if take["id"] == clip["takeId"] && (take["mediaId"] != id || take["status"] != "completed") {
					return nil, nil, errors.New("the pinned regional media differs from its exact stored Take")
				}
			}
		}
	}
	return media, data, err
}

type studioRegionalClock struct {
	OldStart, OldEnd, NewStart, NewEnd float64
	ClipID                             string
}

func (s studioRegionalClock) scale() float64 {
	return (s.NewEnd - s.NewStart) / (s.OldEnd - s.OldStart)
}
func (s studioRegionalClock) at(t float64) float64 { return s.NewStart + (t-s.OldStart)*s.scale() }

func studioCompileRegionalClipEdit(ctx context.Context, project *model.StudioProject, original map[string]any, request StudioEditRequest, durations map[string]float64) (map[string]any, []StudioSourceRange, []map[string]any, error) {
	next, err := studioRegionalClone(original)
	if err != nil {
		return nil, nil, nil, err
	}
	production, clips := studioTimelineDocument(next)
	if request.TrimStart == nil && request.TrimEnd == nil && request.Speed == nil && request.TakeID == "" {
		return nil, nil, nil, errors.New("choose a trim, speed or stored Take change")
	}
	var target map[string]any
	for _, clip := range clips {
		if clip["id"] == request.ClipID {
			target = clip
		}
	}
	if target == nil {
		return nil, nil, nil, errors.New("choose the exact regional clip occurrence")
	}
	oldStart, oldEnd, oldSpeed := studioDocumentNumber(target["trimStart"], 0), studioDocumentNumber(target["trimEnd"], durations[request.ClipID]), studioDocumentNumber(target["speed"], 1)
	start, end, speed := oldStart, oldEnd, oldSpeed
	if request.TrimStart != nil {
		start = *request.TrimStart
	}
	if request.TrimEnd != nil {
		end = *request.TrimEnd
	}
	if request.Speed != nil {
		speed = *request.Speed
	}
	actualDuration := durations[request.ClipID]
	refs := []map[string]any{}
	changedTake := request.TakeID != "" && request.TakeID != target["takeId"]
	if changedTake {
		if !StudioIDPattern.MatchString(request.TakeID) {
			return nil, nil, nil, errors.New("choose a stored completed Take")
		}
		candidate := map[string]any{"nodeId": target["nodeId"], "takeId": request.TakeID}
		media, data, e := studioClipSource(project.OwnerID, next, candidate)
		if e != nil {
			return nil, nil, nil, e
		}
		path, e := StudioMediaPath(media)
		if e != nil {
			return nil, nil, nil, e
		}
		probe, e := ProbeStudioMedia(ctx, path)
		if e != nil || !probe.HasVideo {
			return nil, nil, nil, errors.New("the selected Take has no decodable video")
		}
		actualDuration = probe.Duration
		target["takeId"], target["sourceMediaId"], target["sourceTitle"] = request.TakeID, media.MediaID, data["title"]
		refs = append(refs, map[string]any{"clip_id": request.ClipID, "take_id": request.TakeID, "media_id": media.MediaID, "digest": media.Digest})
		if reframes, ok := production["reframes"].(map[string]any); ok {
			delete(reframes, request.ClipID)
		}
	}
	if !studioFiniteNumber(start) || !studioFiniteNumber(end) || !studioFiniteNumber(speed) || start < 0 || end <= start || end > actualDuration || end > 3600 || speed < .25 || speed > 4 {
		return nil, nil, nil, errors.New("trim and speed must fit the actual stored Take; source bounds are never clamped")
	}
	target["trimStart"], target["trimEnd"], target["speed"] = start, end, speed
	oldProduction, oldClips := studioTimelineDocument(original)
	clocks := []studioRegionalClock{}
	oldClock, newClock := 0., 0.
	for i, oldClip := range oldClips {
		id := fmt.Sprint(oldClip["id"])
		a, b, s := studioDocumentNumber(oldClip["trimStart"], 0), studioDocumentNumber(oldClip["trimEnd"], durations[id]), studioDocumentNumber(oldClip["speed"], 1)
		if !studioFiniteNumber(a) || !studioFiniteNumber(b) || !studioFiniteNumber(s) || b <= a || s < .25 || s > 4 {
			return nil, nil, nil, errors.New("probe every regional source before editing")
		}
		oldLength := (b - a) / s
		out := clips[i]
		outLength := oldLength
		if id == request.ClipID {
			outLength = (end - start) / speed
			lo, hi := max(a, start), min(b, end)
			oldA, oldB, newA, newB := oldClock, oldClock+oldLength, newClock, newClock+outLength
			if !changedTake {
				if hi > lo {
					oldA, oldB = oldClock+(lo-a)/s, oldClock+(hi-a)/s
					newA, newB = newClock+(lo-start)/speed, newClock+(hi-start)/speed
				} else {
					oldB = oldA
				}
			}
			if oldB > oldA {
				clocks = append(clocks, studioRegionalClock{oldA, oldB, newA, newB, id})
			}
			captionStart := studioDocumentNumber(oldClip["captionOffset"], 0)
			captionEnd := min(oldLength, captionStart+studioDocumentNumber(oldClip["captionDuration"], oldLength))
			if studioDocumentNumber(oldClip["captionDuration"], 0) == 0 {
				captionEnd = oldLength
			}
			if oldB <= oldA || min(oldClock+captionEnd, oldB) <= max(oldClock+captionStart, oldA) {
				out["caption"], out["captionOffset"], out["captionDuration"] = "", 0., 0.
			} else {
				span := clocks[len(clocks)-1]
				out["captionOffset"] = span.at(max(oldClock+captionStart, oldA)) - newClock
				out["captionDuration"] = (min(oldClock+captionEnd, oldB) - max(oldClock+captionStart, oldA)) * span.scale()
			}
			if studioDocumentNumber(out["fadeIn"], 0) > min(3., outLength) || studioDocumentNumber(out["fadeOut"], 0) > min(3., outLength) {
				return nil, nil, nil, errors.New("shorten the clip fades before this trim or speed change")
			}
		} else {
			clocks = append(clocks, studioRegionalClock{oldClock, oldClock + oldLength, newClock, newClock + oldLength, id})
		}
		oldClock += oldLength
		newClock += outLength
	}
	if newClock > 3600 {
		return nil, nil, nil, errors.New("the edited regional duration exceeds one hour")
	}
	if subtitles, _ := original["captionsText"].(string); subtitles != "" {
		next["captionsText"], err = studioRegionalSubtitles(subtitles, clocks)
		if err != nil {
			return nil, nil, nil, err
		}
	}
	graphics := []any{}
	for _, item := range studioObjects(oldProduction, "motionGraphics") {
		a, b := studioDocumentNumber(item["start"], 0), studioDocumentNumber(item["end"], 0)
		fragment := 0
		for _, span := range clocks {
			lo, hi := max(a, span.OldStart), min(b, span.OldEnd)
			if hi <= lo {
				continue
			}
			part, _ := studioRegionalClone(item)
			part["start"], part["end"] = span.at(lo), span.at(hi)
			part["phaseOffset"] = (studioDocumentNumber(item["phaseOffset"], 0) + lo - a) * span.scale()
			part["phaseDuration"] = studioDocumentNumber(item["phaseDuration"], b-a) * span.scale()
			if fragment > 0 {
				part["id"] = "graphic-" + studioAnalysisID(fmt.Sprint(request.RequestID, ":", item["id"], ":", len(graphics)))[:40]
			}
			graphics = append(graphics, part)
			fragment++
		}
	}
	if len(graphics) > 50 {
		return nil, nil, nil, errors.New("the edit would exceed fifty motion graphics")
	}
	if oldProduction["motionGraphics"] != nil {
		production["motionGraphics"] = graphics
	}
	if err = studioRegionalAudio(original, next, clocks, durations, request, changedTake); err != nil {
		return nil, nil, nil, err
	}
	return next, []StudioSourceRange{{0, newClock}}, refs, nil
}

func studioRegionalSubtitles(raw string, clocks []studioRegionalClock) (string, error) {
	var out strings.Builder
	count := 0
	for block := range strings.SplitSeq(strings.TrimSpace(strings.ReplaceAll(raw, "\r\n", "\n")), "\n\n") {
		lines := strings.Split(strings.TrimSpace(block), "\n")
		if len(lines) < 2 {
			continue
		}
		index := 0
		if _, e := strconv.Atoi(lines[0]); e == nil {
			index = 1
		}
		if index >= len(lines) {
			return "", errors.New("subtitle block has no timing")
		}
		match := studioSubtitleTiming.FindStringSubmatch(lines[index])
		a, b, err := studioSubtitleSeconds(match)
		if err != nil {
			return "", err
		}
		for _, span := range clocks {
			lo, hi := max(a, span.OldStart), min(b, span.OldEnd)
			if hi <= lo {
				continue
			}
			count++
			fmt.Fprintf(&out, "%d\n%s --> %s%s\n%s\n\n", count, studioSubtitleTime(span.at(lo)), studioSubtitleTime(span.at(hi)), match[9], strings.Join(lines[index+1:], "\n"))
		}
	}
	return out.String(), nil
}

func studioRegionalAudio(original, next map[string]any, clocks []studioRegionalClock, durations map[string]float64, request StudioEditRequest, changedTake bool) error {
	oldProduction, _ := original["production"].(map[string]any)
	production, _ := next["production"].(map[string]any)
	oldClips, err := studioAudioAnchorClips(original, durations)
	if err != nil {
		return err
	}
	newClips, err := studioAudioAnchorClips(next, durations)
	if err != nil {
		return err
	}
	output := []any{}
	for _, track := range studioObjects(oldProduction, "audioTracks") {
		kind, _ := track["anchorKind"].(string)
		if kind == "project" {
			output = append(output, track)
			continue
		}
		if kind != "" && kind != "source" && kind != "clip" {
			return errors.New("the regional audio anchor is unsupported")
		}
		start, offset, speed := studioDocumentNumber(track["start"], 0), studioDocumentNumber(track["offset"], 0), studioDocumentNumber(track["speed"], 1)
		mediaID, _ := track["mediaId"].(string)
		duration := studioDocumentNumber(track["duration"], durations[mediaID]-start)
		if !studioFiniteNumber(start) || !studioFiniteNumber(offset) || !studioFiniteNumber(speed) || !studioFiniteNumber(duration) || start < 0 || offset < 0 || duration <= 0 || speed < .25 || speed > 4 || start+duration > durations[mediaID]+.001 {
			return errors.New("probe bounded regional audio before editing")
		}
		boundID, _ := track["anchorClipId"].(string)
		var bound, changed *studioAudioAnchorClip
		for i := range oldClips {
			if oldClips[i].ID == boundID {
				bound = &oldClips[i]
				if i >= len(newClips) {
					return errors.New("the exact regional audio occurrence is unavailable")
				}
				changed = &newClips[i]
			}
		}
		if kind != "" {
			if bound == nil || changed == nil {
				return errors.New("regional audio needs an existing exact clip anchor")
			}
			anchor := studioDocumentNumber(track["anchorSourceStart"], math.NaN())
			if !studioFiniteNumber(anchor) {
				return errors.New("regional audio anchor time is unavailable")
			}
			if kind == "source" {
				if changedTake && boundID == request.ClipID {
					return errors.New("unbind or review source-anchored audio before changing this Take")
				}
				if anchor < bound.Start || anchor >= bound.End {
					return errors.New("audio source anchor is outside its exact clip")
				}
				offset = bound.Program + (anchor-bound.Start)/bound.Speed
				if math.Abs(offset-studioDocumentNumber(track["offset"], 0)) > .00001 {
					return errors.New("regional source audio and its saved anchor disagree; review it before editing")
				}
			} else {
				if anchor < 0 || anchor >= (bound.End-bound.Start)/bound.Speed {
					return errors.New("audio clip anchor is outside its local interval")
				}
				local := anchor
				if math.Abs(offset-bound.Program-anchor) > .00001 {
					return errors.New("regional clip audio and its saved anchor disagree; review it before editing")
				}
				if boundID == request.ClipID && !changedTake {
					local -= (changed.Start - bound.Start) / bound.Speed
				}
				a := max(0., local)
				b := min(local+duration/speed, (changed.End-changed.Start)/changed.Speed)
				if b <= a {
					continue
				}
				part, _ := studioRegionalClone(track)
				part["start"], part["duration"], part["offset"], part["anchorSourceStart"] = start+(a-local)*speed, (b-a)*speed, changed.Program+a, a
				if bound.Locked && (math.Abs(changed.Program-bound.Program) > .000001 || math.Abs(a-anchor) > .000001) {
					return errors.New("attached audio belongs to a locked clip")
				}
				output = append(output, part)
				continue
			}
		}
		fragment := 0
		for _, span := range clocks {
			if bound != nil && span.ClipID != boundID {
				continue
			}
			a, b := max(offset, span.OldStart), min(offset+duration/speed, span.OldEnd)
			if b <= a {
				continue
			}
			part, _ := studioRegionalClone(track)
			rate := speed / span.scale()
			if rate < .25 || rate > 4 {
				return errors.New("regional audio retiming exceeds the supported playback speeds")
			}
			part["start"], part["duration"], part["offset"], part["speed"] = start+(a-offset)*speed, (b-a)*speed, span.at(a), rate
			if fragment > 0 {
				part["id"] = "audio-" + studioAnalysisID(fmt.Sprint(request.RequestID, ":", track["id"], ":", fragment))[:40]
			}
			if kind == "source" {
				part["anchorSourceStart"] = bound.Start + (a-bound.Program)*bound.Speed
			}
			if bound != nil && bound.Locked && (math.Abs(span.at(a)-offset) > .000001 || math.Abs((b-a)*speed-duration) > .000001) {
				return errors.New("attached audio belongs to a locked clip")
			}
			output = append(output, part)
			fragment++
		}
		if len(output) > 100 {
			return errors.New("the edit would exceed one hundred audio tracks")
		}
	}
	if len(output) > 100 {
		return errors.New("the edit would exceed one hundred audio tracks")
	}
	if oldProduction["audioTracks"] != nil {
		production["audioTracks"] = output
	}
	return nil
}

// Legacy regional voice tracks are program-content-bound. Explicit project
// anchors stay fixed; the existing cut compiler already maps exact clip/source
// anchors. Only legacy voices need this additional clock projection.
func studioRegionalCutAudio(original, next map[string]any, retained []StudioSourceRange, durations map[string]float64, request StudioEditRequest) error {
	projected, err := studioRegionalClone(original)
	if err != nil {
		return err
	}
	oldProduction, _ := projected["production"].(map[string]any)
	legacy := []any{}
	for _, track := range studioObjects(oldProduction, "audioTracks") {
		if track["anchorKind"] == nil || track["anchorKind"] == "" {
			legacy = append(legacy, track)
		}
	}
	if len(legacy) == 0 {
		return nil
	}
	oldProduction["audioTracks"] = legacy
	mapped, err := studioRegionalClone(next)
	if err != nil {
		return err
	}
	clocks := []studioRegionalClock{}
	offset := 0.
	for _, kept := range retained {
		length := kept.End - kept.Start
		clocks = append(clocks, studioRegionalClock{OldStart: kept.Start, OldEnd: kept.End, NewStart: offset, NewEnd: offset + length})
		offset += length
	}
	if err = studioRegionalAudio(projected, mapped, clocks, durations, request, false); err != nil {
		return err
	}
	production, _ := next["production"].(map[string]any)
	mappedProduction, _ := mapped["production"].(map[string]any)
	combined := []any{}
	for _, track := range studioObjects(production, "audioTracks") {
		if track["anchorKind"] != nil && track["anchorKind"] != "" {
			combined = append(combined, track)
		}
	}
	for _, track := range studioObjects(mappedProduction, "audioTracks") {
		combined = append(combined, track)
	}
	if len(combined) > 100 {
		return errors.New("the edit would exceed one hundred audio tracks")
	}
	production["audioTracks"] = combined
	return nil
}
