package production

import (
	"bytes"
	"encoding/json"
	"testing"
)

func TestTimelineEditsResourceUsesResolvedIdentityAndHonorsTracks(t *testing.T) {
	raw := json.RawMessage(`{"version":2,"tracks":[{"id":"custom-picture","kind":"video","label":"主画面","order":4}],"clips":[{"id":"original","nodeId":"original","kind":"image","trackId":"custom-picture","startMs":1000,"durationMs":2000}],"durationMs":3000}`)
	media := &TimelineEditMedia{ClipID: "added", ResourceID: "owned", Kind: "video", MIME: "video/mp4", DurationMs: 5200, Width: 640, Height: 384, ETag: "original-digest"}
	command := TimelineEditCommand{Op: "addResource", ResourceID: "owned", Media: media}
	after, err := ApplyTimelineEdits(raw, []TimelineEditCommand{command})
	if err != nil {
		t.Fatal(err)
	}
	var result map[string]any
	decoder := json.NewDecoder(bytes.NewReader(after))
	decoder.UseNumber()
	decoder.Decode(&result)
	clips := listValue(result["clips"])
	added := objectValue(clips[1])
	direct := objectValue(added["directMedia"])
	if len(listValue(result["tracks"])) != 1 || stringValue(added, "trackId") != "custom-picture" || audioValue(added, "startMs") != 3000 || audioValue(added, "durationMs") != 5200 || direct["storageKey"] != "resource:owned" || direct["etag"] != "original-digest" {
		t.Fatalf("append changed identity or layout: %s", after)
	}
	for name, edit := range map[string]TimelineEditCommand{
		"unresolved":       {Op: "addResource", ResourceID: "owned"},
		"foreign-identity": {Op: "addResource", ResourceID: "foreign", Media: media},
		"extra-remove-id":  {Op: "addResource", ResourceID: "owned", ID: "original", Media: media},
		"unknown-track":    {Op: "addResource", ResourceID: "owned", TrackID: "missing", Media: media},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := ApplyTimelineEdits(raw, []TimelineEditCommand{edit}); err == nil {
				t.Fatal("invalid append accepted")
			}
		})
	}
	overlap := int64(2000)
	command.StartMs = &overlap
	if _, err := ApplyTimelineEdits(raw, []TimelineEditCommand{command}); err == nil {
		t.Fatal("overlap accepted")
	}
	command.StartMs = nil
	locked := bytes.Replace(raw, []byte(`"order":4`), []byte(`"order":4,"locked":true`), 1)
	if _, err := ApplyTimelineEdits(locked, []TimelineEditCommand{command}); err == nil {
		t.Fatal("locked track silently bypassed")
	}
	missing := *media
	missing.DurationMs = 0
	command.Media = &missing
	if _, err := ApplyTimelineEdits(raw, []TimelineEditCommand{command}); err == nil {
		t.Fatal("unknown AV duration fabricated")
	}
}

func TestTimelineEditsResourceCreatesOnlyMissingTrackAndKeepsRepeatedOccurrences(t *testing.T) {
	raw := json.RawMessage(`{"version":2,"tracks":[{"id":"ingest-audio","kind":"video","order":8}],"clips":[],"durationMs":0}`)
	commands := []TimelineEditCommand{}
	for _, id := range []string{"first", "second"} {
		commands = append(commands, TimelineEditCommand{Op: "addResource", ResourceID: "same", Media: &TimelineEditMedia{ClipID: id, ResourceID: "same", Kind: "audio", MIME: "audio/wav", DurationMs: 2100}})
	}
	after, err := ApplyTimelineEdits(raw, commands)
	if err != nil {
		t.Fatal(err)
	}
	var doc map[string]any
	decoder := json.NewDecoder(bytes.NewReader(after))
	decoder.UseNumber()
	decoder.Decode(&doc)
	tracks := listValue(doc["tracks"])
	clips := listValue(doc["clips"])
	if len(tracks) != 2 || stringValue(objectValue(tracks[1]), "id") != "ingest-audio-2" || audioValue(objectValue(tracks[1]), "order") != 9 || len(clips) != 2 || audioValue(objectValue(clips[1]), "startMs") != 2100 {
		t.Fatalf("bad track or repeated occurrence: %s", after)
	}
}
