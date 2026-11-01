package production

import (
	"errors"
	"math"
)

// ReviewClipSource uses program time for comments and exact source time for
// rework. Repeated uses of one resource retain different clip identities.
type ReviewClipSource struct {
	ID               string  `json:"id"`
	Title            string  `json:"title,omitempty"`
	Kind             string  `json:"kind"`
	ResourceID       string  `json:"resourceId,omitempty"`
	AssetVersionID   string  `json:"assetVersionId,omitempty"`
	ShotID           string  `json:"shotId,omitempty"`
	ShotRevisionID   string  `json:"shotRevisionId,omitempty"`
	ArtifactID       string  `json:"artifactId,omitempty"`
	StartMs          int64   `json:"startMs"`
	DurationMs       int64   `json:"durationMs"`
	SourceStartMs    int64   `json:"sourceStartMs"`
	SourceDurationMs int64   `json:"sourceDurationMs"`
	PlaybackRate     float64 `json:"playbackRate"`
}

type ReviewSource struct {
	Version          int                `json:"version"`
	Kind             string             `json:"kind"`
	OriginReviewID   string             `json:"originReviewId,omitempty"`
	UnitID           string             `json:"unitId,omitempty"`
	CutID            string             `json:"cutId,omitempty"`
	CutSHA256        string             `json:"cutSha256,omitempty"`
	RenderTaskID     string             `json:"renderTaskId,omitempty"`
	ShotID           string             `json:"shotId,omitempty"`
	ShotRevisionID   string             `json:"shotRevisionId,omitempty"`
	ArtifactID       string             `json:"artifactId,omitempty"`
	AssetID          string             `json:"assetId,omitempty"`
	AssetVersionID   string             `json:"assetVersionId,omitempty"`
	RepresentationID string             `json:"representationId,omitempty"`
	ResourceID       string             `json:"resourceId"`
	ResourceKind     string             `json:"resourceKind"`
	ResourceSHA256   string             `json:"resourceSha256"`
	ResourceETag     string             `json:"resourceEtag"`
	ResourceBytes    int64              `json:"resourceBytes"`
	StorageIdentity  string             `json:"storageIdentity"`
	DurationMs       int64              `json:"durationMs"`
	Clips            []ReviewClipSource `json:"clips,omitempty"`
}

type ReviewLocation struct {
	TimeMs *int64 `json:"timeMs,omitempty"`
	EndMs  *int64 `json:"endMs,omitempty"`
	ClipID string `json:"clipId,omitempty"`
}
type ReviewReworkLocation struct {
	Clip            *ReviewClipSource `json:"clip,omitempty"`
	ProgramStartMs  int64             `json:"programStartMs"`
	ProgramEndMs    int64             `json:"programEndMs"`
	SourceStartMs   int64             `json:"sourceStartMs"`
	SourceEndMs     int64             `json:"sourceEndMs"`
	WholeTarget     bool              `json:"wholeTarget"`
	SourceTimeKnown bool              `json:"sourceTimeKnown"`
}

func ResolveReviewLocation(source ReviewSource, location ReviewLocation) (ReviewReworkLocation, error) {
	var result ReviewReworkLocation
	invalid := func() (ReviewReworkLocation, error) {
		return result, errors.New("意见时间或片段不属于这个固定审片版本")
	}
	if source.Version != 1 || source.ResourceID == "" || source.DurationMs < 0 || source.DurationMs > 86400000 {
		return invalid()
	}
	if source.ResourceKind != "image" && source.ResourceKind != "audio" && source.ResourceKind != "video" {
		return invalid()
	}
	if source.ResourceKind != "image" && source.DurationMs == 0 {
		return invalid()
	}
	if source.Kind != "cut" && source.Kind != "artifact" && source.Kind != "asset" {
		return invalid()
	}
	if location.EndMs != nil && location.TimeMs == nil {
		return invalid()
	}
	if source.ResourceKind == "image" && (location.TimeMs != nil && *location.TimeMs != 0 || location.EndMs != nil) {
		return invalid()
	}
	start, end := int64(0), source.DurationMs
	if location.TimeMs != nil {
		start = *location.TimeMs
		end = start
		if start < 0 || source.ResourceKind != "image" && start >= source.DurationMs {
			return invalid()
		}
	}
	if location.EndMs != nil {
		end = *location.EndMs
		if end <= start || end > source.DurationMs {
			return invalid()
		}
	}
	result = ReviewReworkLocation{ProgramStartMs: start, ProgramEndMs: end, SourceStartMs: start, SourceEndMs: end, WholeTarget: location.TimeMs == nil, SourceTimeKnown: source.ResourceKind != "image"}
	if location.ClipID == "" {
		return result, nil
	}
	for _, clip := range source.Clips {
		if clip.ID != location.ClipID {
			continue
		}
		if clip.Kind != "video" && clip.Kind != "audio" && clip.Kind != "image" && clip.Kind != "text" && clip.Kind != "subtitle" {
			return invalid()
		}
		if clip.StartMs < 0 || clip.DurationMs <= 0 || clip.StartMs > source.DurationMs-clip.DurationMs || clip.SourceStartMs < 0 || clip.SourceStartMs > 86400000 || clip.SourceDurationMs < 0 || clip.SourceDurationMs > 86400000 || math.IsNaN(clip.PlaybackRate) || math.IsInf(clip.PlaybackRate, 0) || clip.PlaybackRate < .25 || clip.PlaybackRate > 4 {
			return invalid()
		}
		if location.TimeMs == nil {
			start = clip.StartMs
			end = start + clip.DurationMs
		}
		if start < clip.StartMs || start >= clip.StartMs+clip.DurationMs || end > clip.StartMs+clip.DurationMs {
			return invalid()
		}
		from := clip.SourceStartMs + int64(math.Round(float64(start-clip.StartMs)*clip.PlaybackRate))
		to := clip.SourceStartMs + int64(math.Round(float64(end-clip.StartMs)*clip.PlaybackRate))
		if clip.Kind == "image" || clip.ResourceID == "" {
			from, to = 0, 0
		}
		if to > 86400000 || clip.SourceDurationMs > 0 && (from > clip.SourceDurationMs || to > clip.SourceDurationMs) {
			return invalid()
		}
		return ReviewReworkLocation{Clip: &clip, ProgramStartMs: start, ProgramEndMs: end, SourceStartMs: from, SourceEndMs: to, WholeTarget: location.TimeMs == nil, SourceTimeKnown: clip.ResourceID != "" && (clip.Kind == "video" || clip.Kind == "audio")}, nil
	}
	return invalid()
}
