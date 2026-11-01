package production

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"

	"yingce/backend/internal/model"
)

func legacyVersionsFixture(t *testing.T) (map[string]any, map[string]model.Resource, map[string]map[string]string) {
	t.Helper()
	var document map[string]any
	decoder := json.NewDecoder(strings.NewReader(`{
		"nodes":[{"id":"logical","data":{"kind":"video","title":"current title","mediaId":"new","selectedTakeId":"new-take","takes":[{"id":"old-take","mediaId":"old"},{"id":"new-take","mediaId":"new"}]}}],
		"soundtrackMediaId":"wrong-music", "voiceoverMediaId":"wrong-voice", "captionsText":"wrong global captions",
		"shots":[{"id":"shot","videoNodeId":"logical","shotVoiceoverMediaId":"wrong-voice"}],
		"production":{"episodes":[{"id":"episode","title":"第2集"}],"dialogueCues":[{"shotId":"shot","audioMediaId":"wrong-voice"}],
		"regionalVersions":[{"id":"regional","episodeId":"episode","title":"日本語版","language":"ja","region":"JP","width":1080,"height":1920,"fps":24,"fit":"letterbox",
		"timeline":[{"id":"use-one","nodeId":"logical","takeId":"old-take","sourceMediaId":"old","sourceTitle":"旧版原片","trimStart":1,"trimEnd":3,"speed":2,"muted":true},
		{"id":"use-two","nodeId":"logical","takeId":"old-take","sourceMediaId":"second","trimStart":0,"trimEnd":2,"speed":1,"volume":0.4}],
		"subtitles":"1\n00:00:00,100 --> 00:00:00,900\nこんにちは\n",
		"audioTracks":[{"id":"music","mediaId":"music","start":0.5,"offset":0.25,"duration":2.5,"volume":0.2}] }]}}`))
	decoder.UseNumber()
	if err := decoder.Decode(&document); err != nil {
		t.Fatal(err)
	}
	resources := map[string]model.Resource{}
	for _, id := range []string{"old", "second", "new"} {
		resources[id] = model.Resource{ID: id, MimeType: "video/mp4", DurationMs: 6000}
	}
	resources["music"] = model.Resource{ID: "music", MimeType: "audio/wav", DurationMs: 5000}
	return document, resources, map[string]map[string]string{"nodes": {"logical": "native-node"}, "takes": {"logical/old-take": "native-old-version", "logical/new-take": "native-new-version"}}
}

func TestLegacyRegionalVersionPinsEachOccurrenceAndItsOwnSoundAndCaptions(t *testing.T) {
	document, resources, identities := legacyVersionsFixture(t)
	before, _ := json.Marshal(document)
	beforeIDs, _ := json.Marshal(identities)
	converted, err := ProjectLegacyVersion(document, "regional", "import", resources, identities, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(converted.PreservedOnly) != 0 || converted.Source.Episode != "第2集" || converted.Source.Width != 1080 || converted.Source.FPS != 24 {
		t.Fatal("source or editable fields changed", converted)
	}
	var timeline map[string]any
	decoder := json.NewDecoder(bytes.NewReader(converted.Timeline))
	decoder.UseNumber()
	if err := decoder.Decode(&timeline); err != nil {
		t.Fatal(err)
	}
	clips := listValue(timeline["clips"])
	if len(clips) != 4 || numberValue(timeline["durationMs"]) != 3000 {
		t.Fatal("regional clocks", string(converted.Timeline))
	}
	first, second := objectValue(clips[0]), objectValue(clips[1])
	if stringValue(objectValue(first["directMedia"]), "id") != "old" || stringValue(objectValue(second["directMedia"]), "id") != "second" || numberValue(first["durationMs"]) != 1000 || numberValue(second["startMs"]) != 1000 || numberValue(first["sourceStartMs"]) != 1000 || numberValue(first["volume"]) != 0 {
		t.Fatal("fixed source or speed changed", string(converted.Timeline))
	}
	if stringValue(objectValue(first["productionBinding"]), "assetVersionId") != "native-old-version" || stringValue(objectValue(second["productionBinding"]), "assetVersionId") != "" {
		t.Fatal("fabricated candidate binding", string(converted.Timeline))
	}
	encoded := string(converted.Timeline)
	for _, wrong := range []string{"wrong-music", "wrong-voice", "wrong global", "native-new-version"} {
		if strings.Contains(encoded, wrong) {
			t.Fatal("unrelated project data leaked into version", wrong)
		}
	}
	if !strings.Contains(encoded, "こんにちは") || !strings.Contains(encoded, `"sourceStartMs":500`) || !strings.Contains(encoded, `"startMs":250`) {
		t.Fatal("regional sound or subtitle lost", encoded)
	}
	after, _ := json.Marshal(document)
	afterIDs, _ := json.Marshal(identities)
	if !bytes.Equal(before, after) || !bytes.Equal(beforeIDs, afterIDs) {
		t.Fatal("immutable source or identity map mutated")
	}
	if _, err := ValidateTimelineDocument(converted.Timeline); err != nil {
		t.Fatal("not a valid editable native timeline", err)
	}
}

func TestLegacyRegionalVersionDeletedLogicalNodeUsesExplicitOriginal(t *testing.T) {
	document, resources, identities := legacyVersionsFixture(t)
	document["nodes"] = []any{}
	converted, err := ProjectLegacyVersion(document, "regional", "import", resources, identities, false)
	if err != nil || !strings.Contains(string(converted.Timeline), `"storageKey":"resource:old"`) {
		t.Fatal("saved media depends on live node", err)
	}
	delete(resources, "old")
	if _, err := ProjectLegacyVersion(document, "regional", "import", resources, identities, false); err == nil {
		t.Fatal("missing pinned original silently replaced")
	}
}

func TestLegacyRegionalVersionRejectsAmbiguityAndReportsAdvancedFields(t *testing.T) {
	document, resources, identities := legacyVersionsFixture(t)
	production := objectValue(document["production"])
	version := objectValue(listValue(production["regionalVersions"])[0])
	version["fit"] = "crop"
	version["motionGraphics"] = []any{map[string]any{"id": "graphic"}}
	converted, err := ProjectLegacyVersion(document, "regional", "import", resources, identities, false)
	if err != nil || len(converted.PreservedOnly) != 1 {
		t.Fatal("advanced fields silently counted as converted", converted.PreservedOnly, err)
	}
	production["regionalVersions"] = append(listValue(production["regionalVersions"]), version)
	if _, err := LegacyVersionSources(document); err == nil {
		t.Fatal("duplicate source accepted")
	}
}

func TestLegacyRegionalVersionOriginalSchemaDefaultsAndInvalidFormat(t *testing.T) {
	document, _, _ := legacyVersionsFixture(t)
	version := objectValue(listValue(objectValue(document["production"])["regionalVersions"])[0])
	for _, key := range []string{"width", "height", "fps", "fit"} {
		delete(version, key)
	}
	sources, err := LegacyVersionSources(document)
	if err != nil || sources[0].Width != 1920 || sources[0].Height != 1080 || sources[0].FPS != 30 || sources[0].Fit != "letterbox" {
		t.Fatal("original schema defaults changed", sources, err)
	}
	version["width"] = json.Number("720.5")
	if _, err := LegacyVersionSources(document); err == nil {
		t.Fatal("fractional output silently truncated")
	}
}

func TestLegacyRegionalVersionRecordReframesAndUnexpectedAdvancedShapesStayVisible(t *testing.T) {
	document, resources, identities := legacyVersionsFixture(t)
	version := objectValue(listValue(objectValue(document["production"])["regionalVersions"])[0])
	version["reframes"] = map[string]any{"use-one": map[string]any{"analysisId": "old-track", "sourceMediaId": "old", "sourceDigest": strings.Repeat("a", 64), "width": json.Number("1080"), "height": json.Number("1920")}}
	converted, err := ProjectLegacyVersion(document, "regional", "import", resources, identities, false)
	if err != nil || len(converted.PreservedOnly) != 1 || converted.PreservedOnly[0] != "regionalVersions.reframes" {
		t.Fatal("record reframe was silently omitted", converted.PreservedOnly, err)
	}
	version["motionGraphics"] = map[string]any{"unexpected": "retain this unsupported shape"}
	converted, err = ProjectLegacyVersion(document, "regional", "import", resources, identities, false)
	if err != nil || len(converted.PreservedOnly) != 2 {
		t.Fatal("unknown nonempty advanced field was silently omitted", converted.PreservedOnly, err)
	}
}
