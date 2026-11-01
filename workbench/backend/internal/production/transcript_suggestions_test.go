package production

import "testing"

func TestTranscriptSuggestionsRequireListeningAndPreserveManualSpeakerDistinction(t *testing.T) {
	document := TranscriptDocument{Version: 1, Precision: "segment", Segments: []TranscriptSpan{{ID: "one", StartMs: 0, EndMs: 1000, Text: "Hello world", Speaker: "Alice"}, {ID: "two", StartMs: 2000, EndMs: 3000, Text: "Hello  world", Speaker: "Alice"}, {ID: "three", StartMs: 4000, EndMs: 5000, Text: "Hello world", Speaker: "Bob"}}}
	hints, err := SuggestTranscript(document)
	if err != nil {
		t.Fatal(err)
	}
	if len(hints) != 3 || hints[0].Kind != "pause" || hints[0].StartMs != 1000 || hints[0].EndMs != 2000 || hints[1].Kind != "repeat" || hints[2].Kind != "pause" {
		t.Fatalf("wrong hints: %+v", hints)
	}
	if document.Segments[1].Text != "Hello  world" || document.Segments[2].Speaker != "Bob" {
		t.Fatal("suggestion mutated original text or speaker")
	}
	repeated, _ := SuggestTranscript(document)
	if repeated[1].ID != hints[1].ID {
		t.Fatal("unstable review identity")
	}
}

func TestTranscriptSuggestionsDoNotInventPausesInsideOverlappingSpeech(t *testing.T) {
	document := TranscriptDocument{Version: 1, Precision: "segment", Segments: []TranscriptSpan{{ID: "long", StartMs: 0, EndMs: 5000, Text: "长句"}, {ID: "short", StartMs: 1000, EndMs: 1500, Text: "插话"}, {ID: "next", StartMs: 3000, EndMs: 4000, Text: "下一句"}}}
	hints, err := SuggestTranscript(document)
	if err != nil || len(hints) != 0 {
		t.Fatal("overlap was mislabeled as silence")
	}
	document.Segments[2].StartMs = 5000
	document.Segments[2].EndMs = 6000
	hints, err = SuggestTranscript(document)
	if err != nil || len(hints) != 0 {
		t.Fatal("zero gap was mislabeled")
	}
}
