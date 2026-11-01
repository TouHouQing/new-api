/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
package service

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestStudioBeatMusicIntervalPreservesSongAndChangesReviewedExcerpt(t *testing.T) {
	track := map[string]any{"id": "song-track", "mediaId": "song", "start": 0.0, "offset": 0.0, "volume": .6}
	other := map[string]any{"id": "voice", "mediaId": "voice", "start": 1.0, "offset": 2.0, "volume": .8}
	production := map[string]any{"audioTracks": []any{track, other}, "musicVideoPlan": map[string]any{"musicMediaId": "song", "start": 0.0}}
	document := map[string]any{"production": production}
	id, old, err := studioBeatMusicInterval(document, production, "song", StudioBeatPlanRequest{RequestID: "new-excerpt", Start: 15, End: 30})
	require.NoError(t, err)
	require.Equal(t, "song-track", id)
	require.Zero(t, old)
	require.Equal(t, map[string]any{"id": "song-track", "mediaId": "song", "start": 15.0, "offset": 0.0, "duration": 15.0, "speed": 1.0, "volume": .6, "anchorKind": "project"}, track)
	require.Equal(t, map[string]any{"id": "voice", "mediaId": "voice", "start": 1.0, "offset": 2.0, "volume": .8}, other)
	require.Len(t, studioObjects(production, "audioTracks"), 2)
	production["musicVideoPlan"] = map[string]any{"musicMediaId": "song", "start": 15.0}
	_, old, err = studioBeatMusicInterval(document, production, "song", StudioBeatPlanRequest{RequestID: "next-excerpt", Start: 16, End: 30})
	require.NoError(t, err)
	require.Equal(t, 15.0, old)
	lyrics, err := studioEditSubtitles("1\n00:00:01,130 --> 00:00:04,280\nLight\n", old, []StudioSourceRange{{Start: 16, End: 30}})
	require.NoError(t, err)
	require.Contains(t, lyrics, "00:00:00,130 --> 00:00:03,280")
}

func TestStudioBeatMusicIntervalConvertsGlobalSongWithoutDuplicatingIt(t *testing.T) {
	document := map[string]any{"soundtrackMediaId": "song", "soundtrackVolume": .7}
	production := map[string]any{}
	id, _, err := studioBeatMusicInterval(document, production, "song", StudioBeatPlanRequest{RequestID: "excerpt", Start: 15, End: 30})
	require.NoError(t, err)
	require.NotEmpty(t, id)
	require.NotContains(t, document, "soundtrackMediaId")
	tracks := studioObjects(production, "audioTracks")
	require.Len(t, tracks, 1)
	require.Equal(t, .7, tracks[0]["volume"])
	require.Equal(t, 15.0, tracks[0]["start"])
	_, _, err = studioBeatMusicInterval(document, production, "song", StudioBeatPlanRequest{RequestID: "same-excerpt", Start: 15, End: 30})
	require.NoError(t, err)
	require.Len(t, studioObjects(production, "audioTracks"), 1)
}

func TestStudioBeatMusicIntervalRejectsOtherSongAndAmbiguousOrAttachedTracks(t *testing.T) {
	_, _, err := studioBeatMusicInterval(map[string]any{"soundtrackMediaId": "other"}, map[string]any{}, "song", StudioBeatPlanRequest{Start: 15, End: 30})
	require.Error(t, err)
	for _, fields := range []map[string]any{{"anchorKind": "source"}, {"anchorKind": "clip"}, {"speed": 2.0}} {
		track := map[string]any{"id": "song-track", "mediaId": "song"}
		for key, value := range fields {
			track[key] = value
		}
		_, _, err = studioBeatMusicInterval(map[string]any{}, map[string]any{"audioTracks": []any{track}}, "song", StudioBeatPlanRequest{Start: 15, End: 30})
		require.Error(t, err)
	}
	_, _, err = studioBeatMusicInterval(map[string]any{}, map[string]any{"audioTracks": []any{map[string]any{"mediaId": "song"}, map[string]any{"mediaId": "song"}}}, "song", StudioBeatPlanRequest{Start: 15, End: 30})
	require.Error(t, err)
}
