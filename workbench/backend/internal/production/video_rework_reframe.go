package production

import "sort"

// Rebase the existing reviewed crop curve onto a derived interval. Interior
// cuts interpolate exact boundary values; outer constant tails retain their
// original coverage rather than inventing a new tracking measurement.
func ProjectVideoReworkReframe(original TimelineReframe, plan VideoReworkPlan, derived VideoReworkMedia, analysisID, revisionID string) (TimelineReframe, error) {
	if plan.Version == 2 {
		return RelinkVideoReworkReframe(original, plan.Source, derived, analysisID, revisionID)
	}
	var result TimelineReframe
	start, end := plan.Request.SourceStartMs, plan.Request.SourceEndMs
	if !original.Valid() || plan.Version != 1 || original.ResourceID != plan.Source.ResourceID || original.SourceSHA256 != plan.Source.SHA256 || original.SourceWidth != derived.Width || original.SourceHeight != derived.Height || derived.DurationMs < end-start || start < original.StartMs || end > original.EndMs || end-start < 100 || !markerText(analysisID, 80) || !markerText(revisionID, 80) || !validVideoReworkMedia(derived) {
		return result, ErrVideoRework
	}
	position := func(time int64) ReframeKey {
		index := sort.Search(len(original.Keys), func(i int) bool { return original.Keys[i].TimeMs >= time })
		if index == 0 {
			return ReframeKey{TimeMs: time - start, X: original.Keys[0].X, Y: original.Keys[0].Y}
		}
		if index == len(original.Keys) {
			last := original.Keys[len(original.Keys)-1]
			return ReframeKey{TimeMs: time - start, X: last.X, Y: last.Y}
		}
		left, right := original.Keys[index-1], original.Keys[index]
		fraction := float64(time-left.TimeMs) / float64(right.TimeMs-left.TimeMs)
		return ReframeKey{TimeMs: time - start, X: left.X + (right.X-left.X)*fraction, Y: left.Y + (right.Y-left.Y)*fraction}
	}
	keys := []ReframeKey{}
	first, last := original.Keys[0].TimeMs, original.Keys[len(original.Keys)-1].TimeMs
	if start > first && start < last {
		keys = append(keys, position(start))
	}
	for _, key := range original.Keys {
		if key.TimeMs >= start && key.TimeMs < end && (len(keys) == 0 || keys[len(keys)-1].TimeMs != key.TimeMs-start) {
			keys = append(keys, ReframeKey{TimeMs: key.TimeMs - start, X: key.X, Y: key.Y})
		}
	}
	if end-1 > first && end-1 < last && (len(keys) == 0 || keys[len(keys)-1].TimeMs != end-start-1) {
		keys = append(keys, position(end-1))
	}
	if len(keys) == 0 {
		keys = []ReframeKey{position(start), position(end - 1)}
	} else if len(keys) == 1 {
		if keys[0].TimeMs > 0 {
			keys = append([]ReframeKey{position(start)}, keys...)
		} else {
			keys = append(keys, position(end-1))
		}
	}
	result = original
	result.AnalysisID, result.RevisionID = analysisID, revisionID
	result.ResourceID, result.SourceSHA256 = derived.ResourceID, derived.SHA256
	result.StartMs, result.EndMs, result.Keys = 0, end-start, compactReframeKeys(keys, derived.Width, derived.Height)
	if !result.Valid() {
		return TimelineReframe{}, ErrVideoRework
	}
	return result, nil
}

// Full-source repair preserves the source clock and every reviewed crop key.
func RelinkVideoReworkReframe(original TimelineReframe, source, derived VideoReworkMedia, analysisID, revisionID string) (TimelineReframe, error) {
	if !original.Valid() || !validVideoReworkMedia(source) || !validVideoReworkMedia(derived) || original.ResourceID != source.ResourceID || original.SourceSHA256 != source.SHA256 || original.SourceWidth != derived.Width || original.SourceHeight != derived.Height || original.EndMs > derived.DurationMs || !markerText(analysisID, 80) || !markerText(revisionID, 80) {
		return TimelineReframe{}, ErrVideoRework
	}
	result := original
	result.Keys = append([]ReframeKey{}, original.Keys...)
	result.ResourceID, result.SourceSHA256 = derived.ResourceID, derived.SHA256
	result.AnalysisID, result.RevisionID = analysisID, revisionID
	return result, nil
}
