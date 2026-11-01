package service

import (
	"math"
	"testing"

	"github.com/stretchr/testify/require"
)

func studioCutDocument() map[string]any {
	return map[string]any{"id": "film", "title": "Film", "nodes": []any{}, "edges": []any{}, "captionsText": "1\n00:00:00,000 --> 00:00:01,000\nKeep\n\n2\n00:00:02,000 --> 00:00:03,000\nRemove\n\n3\n00:00:04,000 --> 00:00:05,000\nLater\n", "production": map[string]any{"timeline": []any{map[string]any{"id": "clip", "nodeId": "video", "trimStart": 0.0, "trimEnd": 10.0, "speed": 1.0, "caption": "Clip", "captionOffset": 0.0, "captionDuration": 10.0}}, "audioTracks": []any{map[string]any{"id": "music", "mediaId": "music-source", "start": 0.0, "offset": 0.0, "volume": 1.0}}}}
}

func TestStudioSourceCutRemapsCaptionsWithoutChangingOriginal(t *testing.T) {
	original := studioCutDocument()
	request := StudioEditRequest{RequestID: "edit", ClipID: "clip", Ranges: []StudioSourceRange{{2, 3}}}
	next, retained, err := CompileStudioTimelineCut(original, request, nil)
	require.NoError(t, err)
	require.Equal(t, []StudioSourceRange{{0, 2}, {3, 10}}, retained)
	production, clips := studioTimelineDocument(next)
	require.Len(t, clips, 2)
	require.Equal(t, 3.0, clips[1]["trimStart"])
	require.Equal(t, 2, production["documentVersion"])
	require.NotContains(t, next["captionsText"], "Remove")
	require.Contains(t, next["captionsText"], "00:00:03,000 --> 00:00:04,000")
	require.Equal(t, 0.0, studioObjects(production, "audioTracks")[0]["offset"])
	require.Contains(t, original["captionsText"], "Remove")
	_, old := studioTimelineDocument(original)
	require.Len(t, old, 1)
	again, _, err := CompileStudioTimelineCut(original, request, nil)
	require.NoError(t, err)
	_, repeated := studioTimelineDocument(again)
	require.Equal(t, clips[0]["id"], repeated[0]["id"])
}

func TestStudioSourceCutUsesSpeedAndConcreteClipOccurrence(t *testing.T) {
	document := studioCutDocument()
	production, clips := studioTimelineDocument(document)
	clips[0]["speed"], clips[0]["captionOffset"], clips[0]["captionDuration"] = 2.0, 1.0, 3.0
	production["timeline"] = []any{clips[0], map[string]any{"id": "other", "nodeId": "video", "trimStart": 4.0, "trimEnd": 6.0, "speed": 1.0}}
	next, retained, err := CompileStudioTimelineCut(document, StudioEditRequest{RequestID: "edit", ClipID: "clip", Ranges: []StudioSourceRange{{2, 4}, {3, 5}}}, nil)
	require.NoError(t, err)
	require.Equal(t, []StudioSourceRange{{0, 1}, {2.5, 5}, {5, 7}}, retained)
	_, result := studioTimelineDocument(next)
	require.Len(t, result, 3)
	require.Equal(t, "other", result[2]["id"])
	require.Equal(t, "", result[0]["caption"])
	require.Equal(t, 0.0, result[1]["captionOffset"])
	require.Equal(t, 1.5, result[1]["captionDuration"])
}

func TestStudioSourceCutRejectsInvalidRangesAndEmptyOutput(t *testing.T) {
	for _, ranges := range [][]StudioSourceRange{{{math.NaN(), 3}}, {{0, math.Inf(1)}}, {{-1, 2}}, {{2, 1}}, {{0, 11}}, {{0, 10}}} {
		_, _, err := CompileStudioTimelineCut(studioCutDocument(), StudioEditRequest{RequestID: "edit", ClipID: "clip", Ranges: ranges}, nil)
		require.Error(t, err)
	}
}

func TestStudioSourceCutPreservesGraphicAnimationPhaseAcrossBothCuts(t *testing.T) {
	document := studioCutDocument()
	production, _ := studioTimelineDocument(document)
	production["motionGraphics"] = []any{map[string]any{"id": "title", "start": 0., "end": 10., "animation": "slide"}}
	next, _, err := CompileStudioTimelineCut(document, StudioEditRequest{RequestID: "phase-one", ClipID: "clip", Ranges: []StudioSourceRange{{2, 4}}}, nil)
	require.NoError(t, err)
	changed, clips := studioTimelineDocument(next)
	graphics := studioObjects(changed, "motionGraphics")
	require.Len(t, graphics, 2)
	require.Equal(t, 4., graphics[1]["phaseOffset"])
	require.Equal(t, 10., graphics[1]["phaseDuration"])
	second, _, err := CompileStudioTimelineCut(next, StudioEditRequest{RequestID: "phase-two", ClipID: clips[1]["id"].(string), Ranges: []StudioSourceRange{{5, 6}}}, nil)
	require.NoError(t, err)
	changed, _ = studioTimelineDocument(second)
	graphics = studioObjects(changed, "motionGraphics")
	require.Len(t, graphics, 3)
	require.Equal(t, 6., graphics[2]["phaseOffset"])
	require.Equal(t, 10., graphics[2]["phaseDuration"])
}
