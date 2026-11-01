package production

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestTimelineOutputEditRetainsClipsAndRejectsInvalidProfiles(t *testing.T) {
	raw := json.RawMessage(`{"version":2,"tracks":[{"id":"v","kind":"video"}],"clips":[{"id":"c","nodeId":"n","trackId":"v","kind":"video","startMs":0,"durationMs":2000}],"durationMs":2000}`)
	format := TimelineOutput{384, 640, 24, "blur"}
	result, err := ApplyTimelineEdits(raw, []TimelineEditCommand{{Op: "setOutput", Output: &format}})
	if err != nil {
		t.Fatal(err)
	}
	stored, err := TimelineDocumentOutput(result)
	if err != nil || stored == nil || *stored != format {
		t.Fatalf("profile lost: %+v %v", stored, err)
	}
	var before, after map[string]any
	_ = json.Unmarshal(raw, &before)
	_ = json.Unmarshal(result, &after)
	if !reflect.DeepEqual(before["clips"], after["clips"]) {
		t.Fatal("output edit changed clips")
	}
	for _, bad := range []TimelineOutput{{63, 640, 24, "blur"}, {385, 640, 24, "blur"}, {384, 640, 61, "blur"}, {384, 640, 24, "unknown"}} {
		if _, err := SetTimelineDocumentOutput(raw, bad); err == nil {
			t.Fatalf("accepted invalid profile %+v", bad)
		}
	}
	for _, field := range []string{`null`, `{"width":384,"height":640,"fps":24,"fitt":"crop"}`, `{"width":384,"height":640,"fps":24.5}`} {
		var doc map[string]json.RawMessage
		_ = json.Unmarshal(raw, &doc)
		doc["output"] = json.RawMessage(field)
		encoded, _ := json.Marshal(doc)
		if _, err := ValidateTimelineDocument(encoded); err == nil {
			t.Fatalf("accepted malformed profile %s", field)
		}
	}
	if _, err := ApplyTimelineEdits(raw, []TimelineEditCommand{{Op: "setOutput", ID: "c", Output: &format}}); err == nil {
		t.Fatal("output action accepted clip parameters")
	}
}
