package production

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
)

var ErrTimelineDocument = errors.New("invalid project timeline document")

// ValidateTimelineDocument preserves editing metadata while validating every
// track/clip identity and time range. No silent deduplication or clipping.
func ValidateTimelineDocument(raw json.RawMessage) (json.RawMessage, error) {
	if len(raw) == 0 || len(raw) > 8<<20 {
		return nil, ErrTimelineDocument
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var document map[string]any
	if err := decoder.Decode(&document); err != nil || document == nil {
		return nil, ErrTimelineDocument
	}
	var extra any
	if decoder.Decode(&extra) != io.EOF {
		return nil, ErrTimelineDocument
	}
	if numberValue(document["version"]) != 2 {
		return nil, ErrTimelineDocument
	}
	if _, err := TimelineDocumentOutput(raw); err != nil {
		return nil, err
	}
	tracks, ok := document["tracks"].([]any)
	if !ok || len(tracks) > 64 {
		return nil, ErrTimelineDocument
	}
	clips, ok := document["clips"].([]any)
	if !ok || len(clips) > 5000 {
		return nil, ErrTimelineDocument
	}
	trackIDs := map[string]string{}
	for _, value := range tracks {
		track := objectValue(value)
		id, kind := stringValue(track, "id"), stringValue(track, "kind")
		if id == "" || len(id) > 128 || trackIDs[id] != "" || !timelineKind(kind) {
			return nil, ErrTimelineDocument
		}
		trackIDs[id] = kind
	}
	clipIDs := map[string]bool{}
	var duration float64
	for _, value := range clips {
		clip := objectValue(value)
		id, kind, track := stringValue(clip, "id"), stringValue(clip, "kind"), stringValue(clip, "trackId")
		if id == "" || len(id) > 128 || clipIDs[id] || !timelineKind(kind) || trackIDs[track] == "" {
			return nil, ErrTimelineDocument
		}
		clipIDs[id] = true
		if _, err := MotionGraphicForClip(clip); err != nil {
			return nil, err
		}
		if _, exists := clip["captionPresentation"]; exists {
			if kind != "subtitle" && kind != "text" {
				return nil, ErrTimelineDocument
			}
			if _, ok := clip["text"].(string); !ok {
				return nil, ErrTimelineDocument
			}
			if _, err := CaptionPresentationForClip(clip); err != nil {
				return nil, err
			}
		}
		if value, exists := clip["analysisOccurrenceId"]; exists {
			occurrence, ok := value.(string)
			if !ok || !markerText(occurrence, 128) || (kind != "video" && kind != "audio") {
				return nil, ErrTimelineDocument
			}
		}
		rate, validRate := TimelinePlaybackRate(clip)
		if !validRate {
			return nil, ErrTimelineDocument
		}
		if err := validateClipReframe(clip); err != nil {
			return nil, err
		}
		start, ok1 := timelineTime(clip["startMs"])
		length, ok2 := timelineTime(clip["durationMs"])
		if !ok1 || !ok2 || length <= 0 || start+length > 86_400_000 {
			return nil, ErrTimelineDocument
		}
		if start+length > duration {
			duration = start + length
		}
		if value, exists := clip["sourceStartMs"]; exists {
			if _, ok := timelineTime(value); !ok {
				return nil, ErrTimelineDocument
			}
		}
		if value, exists := clip["sourceDurationMs"]; exists {
			sourceDuration, valid := timelineTime(value)
			if !valid || (sourceDuration > 0 && (kind == "audio" || kind == "video") && cutTime(clip, "sourceStartMs")+sourceOffset(int64(length), rate) > int64(sourceDuration)) {
				return nil, ErrTimelineDocument
			}
		}
		for _, key := range []string{"fadeInMs", "fadeOutMs"} {
			if value, exists := clip[key]; exists {
				fade, ok := timelineTime(value)
				if !ok || fade > length {
					return nil, ErrTimelineDocument
				}
			}
		}
		if value, exists := clip["volume"]; exists {
			n, ok := value.(json.Number)
			if !ok {
				return nil, ErrTimelineDocument
			}
			volume, err := n.Float64()
			if err != nil || volume < 0 || volume > 8 {
				return nil, ErrTimelineDocument
			}
		}
	}
	if err := validateTimelineAudioLinks(document, clips); err != nil {
		return nil, err
	}
	if err := validateTimelineCaptionLinks(clips); err != nil {
		return nil, err
	}
	document["durationMs"] = duration
	if err := reconcileTimelineMarkers(document, clips); err != nil {
		return nil, err
	}
	if err := validateLegacyDocumentSafety(document); err != nil {
		return nil, ErrTimelineDocument
	}
	return json.Marshal(document)
}

func timelineKind(kind string) bool {
	switch kind {
	case "video", "audio", "image", "text", "subtitle":
		return true
	}
	return false
}
func timelineTime(value any) (float64, bool) {
	n, ok := value.(json.Number)
	if !ok {
		return 0, false
	}
	v, err := n.Int64()
	return float64(v), err == nil && v >= 0 && v <= 86_400_000
}
