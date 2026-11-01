package production

import "testing"

func TestReviewLocationsKeepRepeatedResourcesAndPlaybackRatesDistinct(t *testing.T) {
	source := ReviewSource{Version: 1, Kind: "cut", ResourceID: "film", ResourceKind: "video", DurationMs: 8000, Clips: []ReviewClipSource{
		{ID: "first", Kind: "video", ResourceID: "same", StartMs: 0, DurationMs: 3000, SourceStartMs: 2000, SourceDurationMs: 8000, PlaybackRate: 2},
		{ID: "repeat", Kind: "video", ResourceID: "same", StartMs: 4000, DurationMs: 4000, SourceStartMs: 1000, SourceDurationMs: 5000, PlaybackRate: 1},
	}}
	at, end := int64(1000), int64(1500)
	first, err := ResolveReviewLocation(source, ReviewLocation{TimeMs: &at, EndMs: &end, ClipID: "first"})
	if err != nil {
		t.Fatal(err)
	}
	if first.SourceStartMs != 4000 || first.SourceEndMs != 5000 || first.Clip.ID != "first" || !first.SourceTimeKnown {
		t.Fatal("wrong source interval", first)
	}
	at = 5000
	repeat, err := ResolveReviewLocation(source, ReviewLocation{TimeMs: &at, ClipID: "repeat"})
	if err != nil || repeat.SourceStartMs != 2000 || repeat.SourceEndMs != 2000 || repeat.Clip.ID != "repeat" {
		t.Fatal("repeat selected the earlier occurrence", repeat, err)
	}
	whole, err := ResolveReviewLocation(source, ReviewLocation{ClipID: "first"})
	if err != nil || !whole.WholeTarget || whole.SourceStartMs != 2000 || whole.SourceEndMs != 8000 {
		t.Fatal("whole clip became an invented point", whole, err)
	}
	for _, location := range []ReviewLocation{{TimeMs: &at, ClipID: "first"}, {ClipID: "absent"}, {EndMs: &end}, {TimeMs: &end, EndMs: &end}} {
		if _, err := ResolveReviewLocation(source, location); err == nil {
			t.Fatal("invalid review location accepted", location)
		}
	}
	source.Clips[0].SourceDurationMs = 6000
	if _, err := ResolveReviewLocation(source, ReviewLocation{ClipID: "first"}); err == nil {
		t.Fatal("source total duration was incorrectly treated as remaining duration")
	}
}

func TestReviewLocationsRejectDamagedClocksAndKeepStaticMediaUntimed(t *testing.T) {
	source := ReviewSource{Version: 1, Kind: "cut", ResourceID: "film", ResourceKind: "video", DurationMs: 4000, Clips: []ReviewClipSource{{ID: "still", Kind: "image", ResourceID: "image", StartMs: 0, DurationMs: 4000, PlaybackRate: 1}}}
	at := int64(1000)
	result, err := ResolveReviewLocation(source, ReviewLocation{ClipID: "still", TimeMs: &at})
	if err != nil || result.SourceStartMs != 0 || result.SourceEndMs != 0 || result.ProgramStartMs != at || result.SourceTimeKnown {
		t.Fatal("image acquired an invented media timestamp", result, err)
	}
	source.Clips[0].Kind = "subtitle"
	source.Clips[0].ResourceID = ""
	caption, err := ResolveReviewLocation(source, ReviewLocation{ClipID: "still", TimeMs: &at})
	if err != nil || caption.SourceTimeKnown || caption.ProgramStartMs != at {
		t.Fatal("native subtitle cannot be located on the fixed film", caption, err)
	}
	source.Clips[0].SourceStartMs = 1 << 62
	if _, err = ResolveReviewLocation(source, ReviewLocation{ClipID: "still", TimeMs: &at}); err == nil {
		t.Fatal("unbounded source clock accepted")
	}
}

func TestReviewLocationsDoNotGuessAClipOrInventImageTimestamps(t *testing.T) {
	source := ReviewSource{Version: 1, Kind: "asset", ResourceID: "image", ResourceKind: "image"}
	whole, err := ResolveReviewLocation(source, ReviewLocation{})
	if err != nil || whole.Clip != nil || !whole.WholeTarget {
		t.Fatal(whole, err)
	}
	at := int64(1)
	if _, err := ResolveReviewLocation(source, ReviewLocation{TimeMs: &at}); err == nil {
		t.Fatal("image time was invented")
	}
	source.ResourceKind = "video"
	source.DurationMs = 4000
	at = 4000
	if _, err := ResolveReviewLocation(source, ReviewLocation{TimeMs: &at}); err == nil {
		t.Fatal("point beyond the final frame was accepted")
	}
	at = 1000
	plain, err := ResolveReviewLocation(source, ReviewLocation{TimeMs: &at})
	if err != nil || plain.Clip != nil {
		t.Fatal("overlapping picture guessed a source clip", plain, err)
	}
}
