/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
package service

import (
	"errors"
	"math"
)

// The reviewed plan may choose another interval of the same song. Changes live
// only in its proposed document until the user previews and applies the plan.
func studioBeatMusicInterval(document, production map[string]any, mediaID string, request StudioBeatPlanRequest) (string, float64, error) {
	previousStart := 0.0
	if previous, ok := production["musicVideoPlan"].(map[string]any); ok && previous["musicMediaId"] == mediaID {
		previousStart = studioDocumentNumber(previous["start"], 0)
	}
	masterID, _ := document["soundtrackMediaId"].(string)
	if masterID != "" && (masterID != mediaID || math.Abs(studioDocumentNumber(document["soundtrackOffsetSeconds"], 0)) > .001) {
		return "", 0, errors.New("keep the existing master music and offset; create a separate version before choosing another song")
	}
	var selected map[string]any
	for _, track := range studioObjects(production, "audioTracks") {
		if track["mediaId"] != mediaID {
			continue
		}
		if selected != nil || masterID != "" {
			return "", 0, errors.New("choose one song track before preparing a music edit")
		}
		if track["anchorKind"] == "source" || track["anchorKind"] == "clip" || math.Abs(studioDocumentNumber(track["speed"], 1)-1) > .000001 {
			return "", 0, errors.New("use a project music track at its original speed before choosing a song interval")
		}
		selected = track
	}
	if masterID != "" && request.Start == 0 {
		return "", previousStart, nil
	}
	if selected == nil && masterID == "" && request.Start == 0 {
		document["soundtrackMediaId"], document["soundtrackOffsetSeconds"], document["soundtrackVolume"] = mediaID, 0.0, 1.0
		return "", previousStart, nil
	}
	if selected == nil {
		tracks, _ := production["audioTracks"].([]any)
		if len(tracks) >= 100 {
			return "", 0, errors.New("the project has no room for a fixed music track")
		}
		volume := 1.0
		if masterID != "" {
			volume = studioDocumentNumber(document["soundtrackVolume"], 1)
		}
		selected = map[string]any{"id": "music-" + studioAnalysisID(request.RequestID)[:40], "mediaId": mediaID, "volume": volume}
		production["audioTracks"] = append(tracks, selected)
		if masterID != "" {
			delete(document, "soundtrackMediaId")
		}
	}
	selected["start"], selected["offset"], selected["duration"], selected["speed"], selected["anchorKind"] = request.Start, 0.0, request.End-request.Start, 1.0, "project"
	id, _ := selected["id"].(string)
	return id, previousStart, nil
}
