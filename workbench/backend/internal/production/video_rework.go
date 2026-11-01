package production

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"math"
)

var ErrVideoRework = errors.New("invalid video rework")

type VideoReworkRegion struct {
	X      int `json:"x"`
	Y      int `json:"y"`
	Width  int `json:"width"`
	Height int `json:"height"`
}

// Resource facts are measured by the service from owned bytes, never supplied
// by a browser as a substitute for a resource or candidate version.
type VideoReworkMedia struct {
	ResourceID string `json:"resourceId"`
	SHA256     string `json:"sha256"`
	Width      int    `json:"width"`
	Height     int    `json:"height"`
	DurationMs int64  `json:"durationMs"`
}

type VideoReworkRequest struct {
	ClipID              string             `json:"clipId"`
	ClipSHA256          string             `json:"clipSha256"`
	SourceResourceID    string             `json:"sourceResourceId"`
	SourceSHA256        string             `json:"sourceSha256"`
	SourceStartMs       int64              `json:"sourceStartMs"`
	SourceEndMs         int64              `json:"sourceEndMs"`
	CandidateResourceID string             `json:"candidateResourceId"`
	CandidateSHA256     string             `json:"candidateSha256"`
	CandidateStartMs    int64              `json:"candidateStartMs"`
	Audio               string             `json:"audio"`
	Region              *VideoReworkRegion `json:"region,omitempty"`
}

type VideoReworkPlan struct {
	Version        int                `json:"version"`
	Request        VideoReworkRequest `json:"request"`
	Source         VideoReworkMedia   `json:"source"`
	Candidate      VideoReworkMedia   `json:"candidate"`
	ProgramStartMs int64              `json:"programStartMs"`
	ProgramEndMs   int64              `json:"programEndMs"`
	PlaybackRate   float64            `json:"playbackRate"`
	OriginalFade   *VideoReworkFade   `json:"originalFade,omitempty"`
}

// The interval candidate bakes the reviewed occurrence's fade into its pixels
// and chosen audio on the source clock. Later trim/speed edits therefore keep
// that appearance without a second, independently editable timing envelope.
type VideoReworkFade struct {
	OffsetMs   int64 `json:"offsetMs"`
	DurationMs int64 `json:"durationMs"`
	FadeInMs   int64 `json:"fadeInMs"`
	FadeOutMs  int64 `json:"fadeOutMs"`
}

type VideoReworkApplication struct {
	Plan           VideoReworkPlan
	Derived        VideoReworkMedia
	AssetVersionID string
	Reframe        *TimelineReframe
}

func videoReworkHash(value any) string {
	raw, _ := json.Marshal(value)
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])
}

func videoReworkSHA(value string) bool {
	raw, err := hex.DecodeString(value)
	return err == nil && len(raw) == 32 && value == hex.EncodeToString(raw)
}

func videoReworkDocument(raw json.RawMessage) (map[string]any, error) {
	clean, err := ValidateTimelineDocument(raw)
	if err != nil {
		return nil, err
	}
	var document map[string]any
	decoder := json.NewDecoder(bytes.NewReader(clean))
	decoder.UseNumber()
	if err := decoder.Decode(&document); err != nil {
		return nil, err
	}
	return document, nil
}

// ReadVideoReworkClip identifies one use of a source. Two occurrences of the
// same file deliberately have different IDs and different frozen clip hashes.
func ReadVideoReworkClip(raw json.RawMessage, id string) (json.RawMessage, string, error) {
	document, err := videoReworkDocument(raw)
	if err != nil {
		return nil, "", err
	}
	for _, value := range listValue(document["clips"]) {
		clip := objectValue(value)
		if stringValue(clip, "id") != id {
			continue
		}
		if stringValue(clip, "kind") != "video" {
			return nil, "", ErrVideoRework
		}
		encoded, err := json.Marshal(clip)
		return encoded, videoReworkHash(clip), err
	}
	return nil, "", ErrVideoRework
}

func validVideoReworkMedia(media VideoReworkMedia) bool {
	return markerText(media.ResourceID, 80) && videoReworkSHA(media.SHA256) && media.Width >= 2 && media.Width <= 4096 && media.Height >= 2 && media.Height <= 4096 && media.DurationMs > 0 && media.DurationMs <= 86400000
}

func PlanVideoRework(raw json.RawMessage, request VideoReworkRequest, source, candidate VideoReworkMedia) (VideoReworkPlan, error) {
	var result VideoReworkPlan
	clipRaw, digest, err := ReadVideoReworkClip(raw, request.ClipID)
	if err != nil || !videoReworkSHA(request.ClipSHA256) || digest != request.ClipSHA256 || !validVideoReworkMedia(source) || !validVideoReworkMedia(candidate) || request.SourceResourceID != source.ResourceID || request.SourceSHA256 != source.SHA256 || request.CandidateResourceID != candidate.ResourceID || request.CandidateSHA256 != candidate.SHA256 || source.ResourceID == candidate.ResourceID {
		return result, ErrVideoRework
	}
	if request.Audio != "original" && request.Audio != "candidate" && request.Audio != "mute" {
		return result, ErrVideoRework
	}
	var clip map[string]any
	decoder := json.NewDecoder(bytes.NewReader(clipRaw))
	decoder.UseNumber()
	if err := decoder.Decode(&clip); err != nil {
		return result, err
	}
	if stringValue(objectValue(clip["directMedia"]), "storageKey") != "resource:"+source.ResourceID || candidate.Width != source.Width || candidate.Height != source.Height {
		return result, ErrVideoRework
	}
	document, err := videoReworkDocument(raw)
	if err != nil {
		return result, err
	}
	for _, value := range listValue(document["tracks"]) {
		track := objectValue(value)
		if stringValue(track, "id") == stringValue(clip, "trackId") {
			if locked, _ := track["locked"].(bool); locked {
				return result, ErrVideoRework
			}
			if visible, ok := track["visible"].(bool); ok && !visible {
				return result, ErrVideoRework
			}
		}
	}
	length := request.SourceEndMs - request.SourceStartMs
	if request.SourceStartMs < 0 || length < 100 || length > 30000 || request.SourceStartMs < int64(audioValue(clip, "sourceStartMs")) || request.SourceEndMs > source.DurationMs || float64(request.SourceEndMs) > audioSourceEnd(clip) || request.CandidateStartMs < 0 || request.CandidateStartMs > candidate.DurationMs-length {
		return result, ErrVideoRework
	}
	if region := request.Region; region != nil {
		if region.X < 0 || region.Y < 0 || region.Width < 2 || region.Height < 2 || region.X > source.Width-region.Width || region.Y > source.Height-region.Height {
			return result, ErrVideoRework
		}
	}
	start := int64(audioValue(clip, "startMs")) + int64(math.Round(float64(request.SourceStartMs-int64(audioValue(clip, "sourceStartMs")))/audioRate(clip)))
	end := int64(audioValue(clip, "startMs")) + int64(math.Round(float64(request.SourceEndMs-int64(audioValue(clip, "sourceStartMs")))/audioRate(clip)))
	if end <= start || start < int64(audioValue(clip, "startMs")) || end > int64(audioEnd(clip)) {
		return result, ErrVideoRework
	}
	rate := float64(length) / float64(end-start)
	if rate < .25 || rate > 4 {
		return result, ErrVideoRework
	}
	result = VideoReworkPlan{Version: 1, Request: request, Source: source, Candidate: candidate, ProgramStartMs: start, ProgramEndMs: end, PlaybackRate: rate}
	if audioValue(clip, "fadeInMs") > 0 || audioValue(clip, "fadeOutMs") > 0 {
		result.OriginalFade = &VideoReworkFade{OffsetMs: start - int64(audioValue(clip, "startMs")), DurationMs: int64(audioValue(clip, "durationMs")), FadeInMs: int64(audioValue(clip, "fadeInMs")), FadeOutMs: int64(audioValue(clip, "fadeOutMs"))}
	}
	return result, nil
}

// A repaired interval is a new foreground occurrence. Its original occurrence,
// independent audio/captions, other uses, and old versions remain byte-for-byte
// equivalent JSON values. The native edit receipt owns apply/undo and CAS.
func ApplyVideoReworkCandidate(raw json.RawMessage, plan VideoReworkPlan, derived VideoReworkMedia, assetVersionID, operationID string, reframe *TimelineReframe) (json.RawMessage, error) {
	if plan.Version == 2 {
		return applyWholeSourceVideoRework(raw, plan, derived, assetVersionID, operationID, reframe)
	}
	verified, err := PlanVideoRework(raw, plan.Request, plan.Source, plan.Candidate)
	if err != nil || videoReworkHash(verified) != videoReworkHash(plan) || !validVideoReworkMedia(derived) || derived.ResourceID == plan.Source.ResourceID || derived.ResourceID == plan.Candidate.ResourceID || derived.Width != plan.Source.Width || derived.Height != plan.Source.Height || derived.DurationMs < plan.Request.SourceEndMs-plan.Request.SourceStartMs || !markerText(assetVersionID, 80) || !markerText(operationID, 80) {
		return nil, ErrVideoRework
	}
	document, err := videoReworkDocument(raw)
	if err != nil {
		return nil, err
	}
	tracks, clips := listValue(document["tracks"]), listValue(document["clips"])
	if len(tracks) >= 64 || len(clips) >= 5000 {
		return nil, ErrVideoRework
	}
	trackID, clipID := "repair-track:"+operationID, "repair-clip:"+operationID
	minOrder := float64(0)
	for _, value := range tracks {
		track := objectValue(value)
		if stringValue(track, "id") == trackID {
			return nil, ErrVideoRework
		}
		order, valid := audioNumber(track["order"])
		if !valid || order < -1000000 || order > 1000000 {
			return nil, ErrVideoRework
		}
		minOrder = math.Min(minOrder, order)
	}
	for _, value := range clips {
		if stringValue(objectValue(value), "id") == clipID {
			return nil, ErrVideoRework
		}
	}
	tracks = append(tracks, map[string]any{"id": trackID, "kind": "video", "label": "局部修复", "order": audioInteger(minOrder - 1)})
	clip := map[string]any{"id": clipID, "nodeId": clipID, "kind": "video", "trackId": trackID, "startMs": audioInteger(float64(plan.ProgramStartMs)), "durationMs": audioInteger(float64(plan.ProgramEndMs - plan.ProgramStartMs)), "sourceStartMs": audioInteger(0), "sourceDurationMs": audioInteger(float64(derived.DurationMs)), "playbackRate": audioAnchor(plan.PlaybackRate), "volume": audioInteger(1), "title": "已采用的局部修复", "productionBinding": map[string]any{"assetVersionId": assetVersionID}, "directMedia": map[string]any{"id": derived.ResourceID, "kind": "video", "title": "局部修复候选", "storageKey": "resource:" + derived.ResourceID, "url": "/api/resources/" + derived.ResourceID + "/file", "durationMs": audioInteger(float64(derived.DurationMs)), "width": audioInteger(float64(derived.Width)), "height": audioInteger(float64(derived.Height)), "mimeType": "video/mp4"}, "videoReworkOrigin": map[string]any{"version": 1, "taskId": operationID, "plan": plan}}
	for _, value := range clips {
		original := objectValue(value)
		if stringValue(original, "id") == plan.Request.ClipID {
			if volume, exists := original["volume"]; exists {
				clip["volume"] = volume
			}
			for _, trackValue := range listValue(document["tracks"]) {
				track := objectValue(trackValue)
				if stringValue(track, "id") == stringValue(original, "trackId") {
					if muted, _ := track["muted"].(bool); muted {
						clip["volume"] = audioInteger(0)
					}
				}
			}
			if (original["reframe"] != nil) != (reframe != nil) {
				return nil, ErrVideoRework
			}
			if reframe != nil {
				if reframe.ResourceID != derived.ResourceID || reframe.SourceSHA256 != derived.SHA256 {
					return nil, ErrVideoRework
				}
				clip["reframe"] = reframe
			}
		}
	}
	document["tracks"], document["clips"] = tracks, append(clips, clip)
	encoded, err := json.Marshal(document)
	if err != nil {
		return nil, err
	}
	return ValidateTimelineDocument(encoded)
}

func RemoveVideoReworkCandidate(raw json.RawMessage, clipID, taskID, expectedClipSHA string) (json.RawMessage, error) {
	clipRaw, digest, err := ReadVideoReworkClip(raw, clipID)
	if err != nil || !videoReworkSHA(expectedClipSHA) || digest != expectedClipSHA || !markerText(taskID, 80) || clipID != "repair-clip:"+taskID {
		return nil, ErrVideoRework
	}
	var selected struct {
		TrackID string `json:"trackId"`
		Origin  struct {
			Version int    `json:"version"`
			TaskID  string `json:"taskId"`
		} `json:"videoReworkOrigin"`
	}
	if json.Unmarshal(clipRaw, &selected) != nil || selected.TrackID != "repair-track:"+taskID || selected.Origin.Version != 1 || selected.Origin.TaskID != taskID {
		return nil, ErrVideoRework
	}
	document, err := videoReworkDocument(raw)
	if err != nil {
		return nil, err
	}
	clips := []any{}
	usedTrack := false
	var duration float64
	for _, value := range listValue(document["clips"]) {
		clip := objectValue(value)
		if stringValue(clip, "id") == clipID {
			continue
		}
		clips = append(clips, value)
		usedTrack = usedTrack || stringValue(clip, "trackId") == selected.TrackID
		duration = math.Max(duration, audioEnd(clip))
	}
	tracks := []any{}
	for _, value := range listValue(document["tracks"]) {
		track := objectValue(value)
		if stringValue(track, "id") == selected.TrackID {
			if locked, _ := track["locked"].(bool); locked {
				return nil, ErrVideoRework
			}
		}
		if !usedTrack && stringValue(objectValue(value), "id") == selected.TrackID {
			continue
		}
		tracks = append(tracks, value)
	}
	document["tracks"], document["clips"], document["durationMs"] = tracks, clips, audioInteger(duration)
	encoded, err := json.Marshal(document)
	if err != nil {
		return nil, err
	}
	// Newly linked voices or captions cannot be deleted implicitly by undo.
	return ValidateTimelineDocument(encoded)
}
