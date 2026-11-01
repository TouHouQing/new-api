package production

import (
	"bytes"
	"encoding/json"
	"reflect"
)

// V2 retains the entire original media clock. Adopting the candidate updates
// one existing occurrence, so regular track visibility, split, trim and speed
// operations keep working without a second foreground occurrence.
func PlanWholeSourceVideoRework(raw json.RawMessage, request VideoReworkRequest, source, candidate VideoReworkMedia) (VideoReworkPlan, error) {
	plan, err := PlanVideoRework(raw, request, source, candidate)
	if err != nil {
		return plan, err
	}
	if source.Width%2 != 0 || source.Height%2 != 0 {
		return VideoReworkPlan{}, ErrVideoRework
	}
	plan.Version = 2
	return plan, nil
}

type VideoReworkOrigin struct {
	Version           int             `json:"version"`
	TaskID            string          `json:"taskId"`
	Plan              VideoReworkPlan `json:"plan"`
	SourceResourceIDs []string        `json:"sourceResourceIds,omitempty"`
}
type VideoReworkRestoration struct {
	OriginalClip json.RawMessage
	Source       VideoReworkMedia
	Derived      VideoReworkMedia
	Reframe      *TimelineReframe
}

// Aliases only describe V2's identity source clock, not V1's interval clock.
// The app verifies the task, frozen lineage and fixed resource before saving.
func VideoReworkClockAliases(clip map[string]any) []string {
	origin := objectValue(clip["videoReworkOrigin"])
	if audioValue(origin, "version") != 2 {
		return nil
	}
	values := listValue(origin["sourceResourceIds"])
	if len(values) > 32 {
		return nil
	}
	result := []string{}
	for _, value := range values {
		id, ok := value.(string)
		if !ok || !markerText(id, 80) {
			return nil
		}
		result = append(result, id)
	}
	return result
}
func wholeReworkAliases(original map[string]any, sourceID string) ([]string, error) {
	result := []string{sourceID}
	for _, id := range VideoReworkClockAliases(original) {
		found := false
		for _, prior := range result {
			found = found || prior == id
		}
		if !found {
			result = append(result, id)
		}
	}
	if len(result) > 32 {
		return nil, ErrVideoRework
	}
	return result, nil
}

func applyWholeSourceVideoRework(raw json.RawMessage, plan VideoReworkPlan, derived VideoReworkMedia, assetVersionID, taskID string, reframe *TimelineReframe) (json.RawMessage, error) {
	verified, err := PlanWholeSourceVideoRework(raw, plan.Request, plan.Source, plan.Candidate)
	if err != nil || videoReworkHash(verified) != videoReworkHash(plan) || !validVideoReworkMedia(derived) || derived.ResourceID == plan.Source.ResourceID || derived.ResourceID == plan.Candidate.ResourceID || derived.Width != plan.Source.Width || derived.Height != plan.Source.Height || derived.DurationMs < plan.Source.DurationMs || derived.DurationMs > plan.Source.DurationMs+44 || !markerText(assetVersionID, 80) || !markerText(taskID, 80) {
		return nil, ErrVideoRework
	}
	document, err := videoReworkDocument(raw)
	if err != nil {
		return nil, err
	}
	for _, value := range listValue(document["clips"]) {
		clip := objectValue(value)
		if stringValue(clip, "id") != plan.Request.ClipID {
			continue
		}
		if (clip["reframe"] != nil) != (reframe != nil) {
			return nil, ErrVideoRework
		}
		if reframe != nil && (reframe.ResourceID != derived.ResourceID || reframe.SourceSHA256 != derived.SHA256) {
			return nil, ErrVideoRework
		}
		aliases, err := wholeReworkAliases(clip, plan.Source.ResourceID)
		if err != nil {
			return nil, err
		}
		binding := map[string]any{}
		for key, value := range objectValue(clip["productionBinding"]) {
			binding[key] = value
		}
		binding["assetVersionId"] = assetVersionID
		delete(binding, "artifactId")
		clip["productionBinding"] = binding
		clip["directMedia"] = map[string]any{"id": derived.ResourceID, "kind": "video", "title": "视频修复候选", "storageKey": "resource:" + derived.ResourceID, "url": "/api/resources/" + derived.ResourceID + "/file", "width": derived.Width, "height": derived.Height, "durationMs": derived.DurationMs, "mimeType": "video/mp4"}
		clip["sourceDurationMs"] = audioInteger(float64(plan.Source.DurationMs))
		delete(clip, "canvasOrigin")
		clip["videoReworkOrigin"] = VideoReworkOrigin{Version: 2, TaskID: taskID, Plan: plan, SourceResourceIDs: aliases}
		if reframe != nil {
			clip["reframe"] = reframe
		}
	}
	encoded, err := json.Marshal(document)
	if err != nil {
		return nil, err
	}
	return ValidateTimelineDocument(encoded)
}

func RestoreWholeSourceVideoRework(raw json.RawMessage, clipID, taskID, expectedSHA string, restore VideoReworkRestoration) (json.RawMessage, error) {
	selected, digest, err := ReadVideoReworkClip(raw, clipID)
	if err != nil || !videoReworkSHA(expectedSHA) || digest != expectedSHA || !validVideoReworkMedia(restore.Source) || !validVideoReworkMedia(restore.Derived) {
		return nil, ErrVideoRework
	}
	var origin struct {
		Origin VideoReworkOrigin `json:"videoReworkOrigin"`
	}
	if json.Unmarshal(selected, &origin) != nil || origin.Origin.Version != 2 || origin.Origin.TaskID != taskID || origin.Origin.Plan.Source != restore.Source {
		return nil, ErrVideoRework
	}
	original, err := videoReworkDocumentClip(restore.OriginalClip)
	if err != nil || stringValue(objectValue(original["directMedia"]), "storageKey") != "resource:"+restore.Source.ResourceID {
		return nil, ErrVideoRework
	}
	document, err := videoReworkDocument(raw)
	if err != nil {
		return nil, err
	}
	for _, value := range listValue(document["clips"]) {
		clip := objectValue(value)
		if stringValue(clip, "id") != clipID {
			continue
		}
		if stringValue(objectValue(clip["directMedia"]), "storageKey") != "resource:"+restore.Derived.ResourceID {
			return nil, ErrVideoRework
		}
		for _, rawTrack := range listValue(document["tracks"]) {
			track := objectValue(rawTrack)
			if stringValue(track, "id") == stringValue(clip, "trackId") {
				if locked, _ := track["locked"].(bool); locked {
					return nil, ErrVideoRework
				}
			}
		}
		for _, key := range []string{"directMedia", "productionBinding", "canvasOrigin", "videoReworkOrigin", "sourceDurationMs"} {
			if old, ok := original[key]; ok {
				clip[key] = old
			} else {
				delete(clip, key)
			}
		}
		if capacity := audioValue(clip, "sourceDurationMs"); capacity > 0 && audioSourceEnd(clip) > capacity {
			clip["sourceDurationMs"] = audioInteger(float64(restore.Source.DurationMs))
		}
		if restore.Reframe != nil {
			if restore.Reframe.ResourceID != restore.Source.ResourceID || restore.Reframe.SourceSHA256 != restore.Source.SHA256 {
				return nil, ErrVideoRework
			}
			clip["reframe"] = restore.Reframe
		} else {
			delete(clip, "reframe")
		}
	}
	encoded, err := json.Marshal(document)
	if err != nil {
		return nil, err
	}
	return ValidateTimelineDocument(encoded)
}

func videoReworkDocumentClip(raw json.RawMessage) (map[string]any, error) {
	var clip map[string]any
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	if decoder.Decode(&clip) != nil || clip == nil || stringValue(clip, "kind") != "video" {
		return nil, ErrVideoRework
	}
	return clip, nil
}

func WholeSourceVideoReworkAliases(rawClip json.RawMessage, sourceID string) ([]string, error) {
	clip, err := videoReworkDocumentClip(rawClip)
	if err != nil {
		return nil, err
	}
	return wholeReworkAliases(clip, sourceID)
}
func SameVideoReworkAliases(left, right []string) bool { return reflect.DeepEqual(left, right) }
