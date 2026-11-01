/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
package service

import (
	"errors"
	"fmt"
	"math"

	"github.com/QuantumNous/new-api/common"
)

type studioAudioAnchorClip struct {
	ID, NodeID, TakeID string
	Start, End, Speed  float64
	Program            float64
	Locked             bool
}

func studioAudioAnchorClips(document map[string]any, durations map[string]float64) ([]studioAudioAnchorClip, error) {
	_, clips := studioTimelineDocument(document)
	result, program := []studioAudioAnchorClip{}, 0.0
	ids := map[string]bool{}
	for _, clip := range clips {
		id, _ := clip["id"].(string)
		nodeID, _ := clip["nodeId"].(string)
		takeID, _ := clip["takeId"].(string)
		start, end, speed := studioDocumentNumber(clip["trimStart"], 0), studioDocumentNumber(clip["trimEnd"], durations[id]), studioDocumentNumber(clip["speed"], 1)
		if !StudioIDPattern.MatchString(id) || ids[id] || !studioSceneFinite(start) || !studioSceneFinite(end) || !studioSceneFinite(speed) || start < 0 || end <= start || end > 3600 || speed < .25 || speed > 4 {
			return nil, errors.New("audio anchors require unique clips with probed source ranges")
		}
		ids[id] = true
		locked := clip["locked"] == true
		for _, node := range studioObjects(document, "nodes") {
			if node["id"] == nodeID {
				data, _ := node["data"].(map[string]any)
				locked = locked || data["locked"] == true
			}
		}
		for _, shot := range studioObjects(document, "shots") {
			if shot["id"] == id || shot["videoNodeId"] == nodeID {
				locked = locked || shot["locked"] == true
			}
		}
		result = append(result, studioAudioAnchorClip{id, nodeID, takeID, start, end, speed, program, locked})
		program += (end - start) / speed
	}
	return result, nil
}

// CompileStudioAnchoredAudio maps only explicitly attached tracks. start and
// duration always describe audio-source seconds; offset is a program position.
// retained[i] is the old program span used by the ith next clip, preserving the
// identity of repeated instances of the same Take. Project music keeps its clock.
func CompileStudioAnchoredAudio(original, next map[string]any, retained []StudioSourceRange, durations map[string]float64) error {
	oldProduction, _ := original["production"].(map[string]any)
	tracks := studioObjects(oldProduction, "audioTracks")
	if len(tracks) > 100 {
		return errors.New("audio tracks exceed the one hundred track limit")
	}
	if len(tracks) == 0 {
		return nil
	}
	oldClips, err := studioAudioAnchorClips(original, durations)
	if err != nil {
		return err
	}
	newClips, err := studioAudioAnchorClips(next, durations)
	if err != nil {
		return err
	}
	if len(retained) != len(newClips) {
		return errors.New("audio anchors need one exact retained program span per output clip")
	}
	for i, span := range retained {
		if !studioSceneFinite(span.Start) || !studioSceneFinite(span.End) || span.Start < 0 || span.End <= span.Start || math.Abs((newClips[i].End-newClips[i].Start)/newClips[i].Speed-(span.End-span.Start)) > .00001 {
			return errors.New("retained audio mapping must match the output clip duration")
		}
	}
	output := []any{}
	for _, track := range tracks {
		id, _ := track["id"].(string)
		mediaID, _ := track["mediaId"].(string)
		start, offset, speed := studioDocumentNumber(track["start"], 0), studioDocumentNumber(track["offset"], 0), studioDocumentNumber(track["speed"], 1)
		duration := studioDocumentNumber(track["duration"], durations[mediaID]-start)
		if !StudioIDPattern.MatchString(id) || !StudioIDPattern.MatchString(mediaID) || !studioSceneFinite(start) || !studioSceneFinite(offset) || !studioSceneFinite(speed) || start < 0 || start > 3600 || offset < 0 || offset > 3600 || speed < .25 || speed > 4 {
			return errors.New("audio source time, program offset and playback speed must be bounded")
		}
		kind, _ := track["anchorKind"].(string)
		if kind == "" || kind == "project" {
			output = append(output, track)
			continue
		}
		if kind != "clip" && kind != "source" {
			return errors.New("choose a project, clip or source audio anchor")
		}
		if !studioSceneFinite(duration) || duration <= 0 || duration > 3600 {
			return errors.New("probe attached audio duration or set a bounded source duration before editing")
		}
		clipID, _ := track["anchorClipId"].(string)
		anchor := studioDocumentNumber(track["anchorSourceStart"], math.NaN())
		var bound *studioAudioAnchorClip
		for i := range oldClips {
			if oldClips[i].ID == clipID {
				bound = &oldClips[i]
				break
			}
		}
		if bound == nil || !studioSceneFinite(anchor) {
			return errors.New("attached audio needs an existing exact clip and finite anchor time")
		}
		programStart := bound.Program + anchor
		if kind == "source" {
			if anchor < bound.Start || anchor >= bound.End {
				return errors.New("audio source anchor lies outside the exact clip source interval")
			}
			programStart = bound.Program + (anchor-bound.Start)/bound.Speed
		} else if anchor < 0 || anchor >= (bound.End-bound.Start)/bound.Speed {
			return errors.New("clip audio anchor lies outside its local program interval")
		}
		fragments := []any{}
		for index, span := range retained {
			if span.Start < bound.Program-.000001 || span.End > bound.Program+(bound.End-bound.Start)/bound.Speed+.000001 {
				continue
			}
			out := newClips[index]
			if out.NodeID != bound.NodeID || out.TakeID != bound.TakeID || math.Abs(out.Speed-bound.Speed) > .000001 {
				return errors.New("audio anchor mapping changed its exact clip source or speed without a supported mapping")
			}
			a, b := max(programStart, span.Start), min(programStart+duration/speed, span.End)
			if b <= a {
				continue
			}
			part := map[string]any{}
			for key, value := range track {
				part[key] = value
			}
			if len(fragments) > 0 {
				part["id"] = "audio-" + studioAnalysisID(fmt.Sprintf("%s:%s:%.6f:%.6f", id, out.ID, a, b))[:40]
			}
			part["start"], part["duration"], part["offset"], part["speed"] = start+(a-programStart)*speed, (b-a)*speed, out.Program+a-span.Start, speed
			part["anchorClipId"] = out.ID
			if kind == "source" {
				part["anchorSourceStart"] = out.Start + (a-span.Start)*out.Speed
			} else {
				part["anchorSourceStart"] = a - span.Start
			}
			fragments = append(fragments, part)
		}
		if bound.Locked {
			if len(fragments) != 1 {
				return errors.New("attached audio belongs to a locked clip or shot")
			}
			part := fragments[0].(map[string]any)
			if part["anchorClipId"] != clipID || math.Abs(studioDocumentNumber(part["offset"], 0)-offset) > .000001 || math.Abs(studioDocumentNumber(part["start"], 0)-start) > .000001 || math.Abs(studioDocumentNumber(part["duration"], 0)-duration) > .000001 {
				return errors.New("attached audio belongs to a locked clip or shot")
			}
		}
		output = append(output, fragments...)
		if len(output) > 100 {
			return errors.New("this edit would exceed one hundred audio tracks; reduce attached fragments first")
		}
	}
	if len(output) > 100 {
		return errors.New("this edit would exceed one hundred audio tracks")
	}
	// Do not mutate the input or partially change a plan on validation failure.
	raw, err := common.Marshal(output)
	if err != nil {
		return err
	}
	var copied []any
	if err := common.Unmarshal(raw, &copied); err != nil {
		return err
	}
	production, _ := next["production"].(map[string]any)
	if production == nil {
		return errors.New("output production timeline is unavailable")
	}
	production["audioTracks"] = copied
	return nil
}
