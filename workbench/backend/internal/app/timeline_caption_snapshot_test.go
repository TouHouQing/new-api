package app

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestRenderCaptionAppearanceSurvivesTaskSnapshotRoundTrip(t *testing.T) {
	var original renderClip
	raw := []byte(`{"id":"cue","kind":"subtitle","startMs":200,"durationMs":1000,"text":"强调🌟文字","subtitleEntryIndex":2,"subtitleStyle":{"fontSize":22,"color":"#ff0000","position":"bottom","highlightEnabled":true,"highlightAnimation":"wipe"},"subtitleHighlights":[{"entryIndex":2,"start":2,"end":4,"sourceText":"强调🌟文字","highlightText":"🌟"}]}`)
	if err := json.Unmarshal(raw, &original); err != nil {
		t.Fatal(err)
	}
	snapshot, err := json.Marshal(original)
	if err != nil {
		t.Fatal(err)
	}
	var restarted renderClip
	if err := json.Unmarshal(snapshot, &restarted); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(original.Presentation, restarted.Presentation) || restarted.Presentation.FontSize != 66 || len(restarted.Presentation.Highlights) != 1 || restarted.Presentation.MarginPercent == nil || *restarted.Presentation.MarginPercent != 8 {
		t.Fatalf("immutable task input lost render appearance: %s", snapshot)
	}
	if restarted.Text != original.Text || restarted.StartMs != original.StartMs || restarted.DurationMs != original.DurationMs {
		t.Fatal("caption clock or text changed during task snapshot")
	}
}
