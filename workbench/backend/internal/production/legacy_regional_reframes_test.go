package production

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"

	"yingce/backend/internal/model"
)

func legacyRegionalReframeFixture(t *testing.T) (map[string]any, map[string]model.Resource, LegacyVersionReframeContext) {
	t.Helper()
	document, _, analyses, data := legacyReframeFixture(t)
	_, resources, _ := legacyAnalysisFixture(t)
	document["nodes"] = []any{map[string]any{"id": "video", "data": map[string]any{"kind": "video", "mediaId": "resource", "seconds": 10}}}
	state := objectValue(document["production"])
	state["episodes"] = []any{map[string]any{"id": "episode", "title": "第1集"}}
	state["regionalVersions"] = []any{}
	for _, id := range []string{"ja", "zh"} {
		state["regionalVersions"] = append(listValue(state["regionalVersions"]), map[string]any{
			"id": id, "episodeId": "episode", "title": id + "版", "language": id, "width": 160, "height": 96, "fps": 24,
			"timeline": []any{map[string]any{"id": "one", "nodeId": "video", "sourceMediaId": "resource", "trimStart": 1, "trimEnd": 5, "speed": 2}, map[string]any{"id": "repeat", "nodeId": "video", "sourceMediaId": "resource", "trimStart": 1, "trimEnd": 3}},
			"reframes": map[string]any{"one": map[string]any{"analysisId": "track", "sourceMediaId": "resource", "sourceDigest": strings.Repeat("a", 64), "width": 192, "height": 360}},
		})
	}
	return document, resources, LegacyVersionReframeContext{Analyses: analyses, Data: data}
}

func TestLegacyRegionalReframesBindHistoricalRevisionSourceClockAndOneOccurrence(t *testing.T) {
	document, resources, framing := legacyRegionalReframeFixture(t)
	before, _ := json.Marshal(document)
	var previousID string
	for _, sourceID := range []string{"ja", "zh"} {
		result, err := ProjectLegacyVersion(document, sourceID, "import", resources, map[string]map[string]string{}, false, framing)
		if err != nil || len(result.PreservedOnly) != 0 || !result.Source.HasReframes {
			t.Fatal("regional historical framing", err, result)
		}
		var timeline struct {
			Clips []struct {
				ID           string           `json:"id"`
				StartMs      int64            `json:"startMs"`
				DurationMs   int64            `json:"durationMs"`
				PlaybackRate float64          `json:"playbackRate"`
				Reframe      *TimelineReframe `json:"reframe"`
			} `json:"clips"`
		}
		if err := json.Unmarshal(result.Timeline, &timeline); err != nil {
			t.Fatal(err)
		}
		one, repeat := timeline.Clips[0], timeline.Clips[1]
		if one.Reframe == nil || one.Reframe.RevisionID != framing.Analyses.VersionIDs["track"] || one.Reframe.RevisionID == framing.Analyses.VersionIDs["track-human"] || one.Reframe.StartMs != 1000 || one.Reframe.EndMs != 5000 || one.PlaybackRate != 2 || one.DurationMs != 2000 || repeat.StartMs != 2000 || repeat.Reframe != nil || one.ID == previousID {
			t.Fatal("occurrence, source clock or historical revision changed", timeline)
		}
		previousID = one.ID
	}
	after, _ := json.Marshal(document)
	if !bytes.Equal(before, after) {
		t.Fatal("original regional archive mutated")
	}
}

func TestLegacyRegionalReframesPreserveUnknownCoordinatesAndRejectChangedSHA(t *testing.T) {
	for _, change := range []string{"coordinate-space", "digest", "global-only"} {
		t.Run(change, func(t *testing.T) {
			document, resources, framing := legacyRegionalReframeFixture(t)
			version := objectValue(listValue(objectValue(document["production"])["regionalVersions"])[0])
			if change == "coordinate-space" {
				var raw map[string]any
				_ = json.Unmarshal(framing.Data.Artifacts["track.json"], &raw)
				delete(raw, "coordinate_space")
				framing.Data.Artifacts["track.json"], _ = json.Marshal(raw)
			} else if change == "digest" {
				objectValue(objectValue(version["reframes"])["one"])["sourceDigest"] = strings.Repeat("b", 64)
			} else {
				delete(version, "reframes")
			}
			result, err := ProjectLegacyVersion(document, "ja", "import", resources, map[string]map[string]string{}, false, framing)
			if change == "digest" {
				if err == nil {
					t.Fatal("changed source digest accepted")
				}
				return
			}
			if err != nil || bytes.Contains(result.Timeline, []byte(`"reframe"`)) {
				t.Fatal("unexplained or global framing adopted", err)
			}
			if change == "coordinate-space" && (len(result.PreservedOnly) != 1 || result.PreservedOnly[0] != "regionalVersions.reframes" || len(result.Warnings) == 0) {
				t.Fatal("unknown coordinates lost", result)
			}
			if change == "global-only" && len(result.PreservedOnly) != 0 {
				t.Fatal("global framing leaked into this regional version")
			}
		})
	}
}
