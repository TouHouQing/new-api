package service

import (
	"github.com/stretchr/testify/require"
	"testing"
)

func studioReplacementDocument() map[string]any {
	document := studioCutDocument()
	document["nodes"] = []any{
		map[string]any{"id": "video", "data": map[string]any{"kind": "video", "mediaId": "original", "selectedTakeId": "take", "takes": []any{map[string]any{"id": "take", "mediaId": "original", "status": "completed"}}}},
		map[string]any{"id": "replacement", "data": map[string]any{"kind": "video", "status": "completed", "mediaId": "new-media", "selectedTakeId": "new-take", "takes": []any{map[string]any{"id": "new-take", "mediaId": "new-media", "status": "completed"}}, "derivedFrom": map[string]any{"takeId": "take"}, "reworkRange": map[string]any{"sourceNodeId": "video", "sourceMediaId": "original", "start": 2., "end": 4.}}},
	}
	production, clips := studioTimelineDocument(document)
	clips[0]["takeId"] = "take"
	clips[0]["speed"] = 2.
	production["timeline"] = []any{clips[0], map[string]any{"id": "repeat", "nodeId": "video", "takeId": "take", "trimStart": 0., "trimEnd": 10., "speed": 1.}}
	production["reframes"] = map[string]any{"clip": map[string]any{"analysisId": "track"}}
	production["audioTracks"] = []any{map[string]any{"id": "attached", "mediaId": "voice", "start": 0., "offset": .5, "duration": 2., "volume": 1., "anchorKind": "source", "anchorClipId": "clip", "anchorSourceStart": 1.}, map[string]any{"id": "song", "mediaId": "song", "start": 3., "offset": 0., "volume": .2}}
	return document
}

func TestStudioRangeReplacementPreservesProgramAndOnlyExactOccurrence(t *testing.T) {
	document := studioReplacementDocument()
	next, retained, err := CompileStudioRangeReplacement(document, StudioEditRequest{RequestID: "replace", ClipID: "clip", ReplacementNodeID: "replacement", ReviewConfirmed: true}, nil, 4, true)
	require.NoError(t, err)
	production, clips := studioTimelineDocument(next)
	require.Len(t, clips, 4)
	require.Equal(t, "repeat", clips[3]["id"])
	require.Equal(t, "replacement", clips[1]["nodeId"])
	require.Equal(t, 4., clips[1]["speed"])
	require.Equal(t, []StudioSourceRange{{0, 1}, {1, 2}, {2, 5}, {5, 15}}, retained)
	require.Equal(t, document["captionsText"], next["captionsText"])
	tracks := studioObjects(production, "audioTracks")
	require.Len(t, tracks, 3)
	require.Equal(t, "project", tracks[0]["anchorKind"])
	require.NotContains(t, tracks[0], "anchorClipId")
	require.Equal(t, .5, tracks[0]["offset"])
	require.Equal(t, 2., tracks[2]["speed"])
	require.Equal(t, 10., tracks[2]["duration"])
	refs := production["reframes"].(map[string]any)
	require.Len(t, refs, 2)
	require.NotContains(t, refs, clips[1]["id"])
	oldProduction, oldClips := studioTimelineDocument(document)
	require.Len(t, oldClips, 2)
	require.Equal(t, "source", studioObjects(oldProduction, "audioTracks")[0]["anchorKind"])
	logical, offset, speed := studioRenderDialogueSource(next, StudioRenderClip{NodeID: "replacement", Start: 1, Speed: 4})
	require.Equal(t, "video", logical)
	require.Equal(t, 2.5, offset)
	require.Equal(t, 2., speed)
}

func TestStudioRangeReplacementRejectsChangedTakeAndLockedShot(t *testing.T) {
	request := StudioEditRequest{RequestID: "replace", ClipID: "clip", ReplacementNodeID: "replacement", ReviewConfirmed: true}
	for _, mode := range []string{"different-take", "locked", "outside", "extreme-speed", "unreviewed"} {
		t.Run(mode, func(t *testing.T) {
			document := studioReplacementDocument()
			_, clips := studioTimelineDocument(document)
			duration := 4.
			switch mode {
			case "different-take":
				clips[0]["takeId"] = "another"
			case "locked":
				document["shots"] = []any{map[string]any{"id": "shot", "videoNodeId": "video", "locked": true}}
			case "outside":
				clips[0]["trimStart"] = 3.
			case "extreme-speed":
				duration = 10.
			case "unreviewed":
				request.ReviewConfirmed = false
			}
			_, _, err := CompileStudioRangeReplacement(document, request, nil, duration, true)
			require.Error(t, err)
		})
	}
}
