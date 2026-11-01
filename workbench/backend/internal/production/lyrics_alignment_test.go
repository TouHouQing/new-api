package production

import (
	"encoding/json"
	"reflect"
	"testing"
)

func lyricsSourceFixture() TranscriptDocument {
	return TranscriptDocument{Version: 1, Language: "zh", Precision: "word", Segments: []TranscriptSpan{{ID: "s1", StartMs: 0, EndMs: 3000, Text: "雨夜重逢同行"}}, Words: []TranscriptSpan{{ID: "w1", StartMs: 300, EndMs: 600, Text: "雨夜"}, {ID: "w2", StartMs: 800, EndMs: 1100, Text: "重逢"}, {ID: "w3", StartMs: 2000, EndMs: 2200, Text: "同行"}}}
}
func TestLyricsAlignmentKeepsMeasuredWordsAndSilentGapsWithoutMutatingOriginal(t *testing.T) {
	source := lyricsSourceFixture()
	before, _ := json.Marshal(source)
	plan, err := PlanLyricsAlignment(source, "[Verse]\n雨夜重逢\n同行", []LyricsAnchor{{Line: 1, StartSpanID: "w1", EndSpanID: "w2", Reviewed: true}, {Line: 2, StartSpanID: "w3", EndSpanID: "w3", Reviewed: true}}, 3000)
	if err != nil || !plan.CanApply || plan.Document == nil || plan.Precision != "word" {
		t.Fatal(plan, err)
	}
	if plan.Lines[0].Kind != "section" || plan.Document.Segments[0].StartMs != 300 || plan.Document.Segments[0].EndMs != 1100 || plan.Document.Segments[1].StartMs != 2000 || !reflect.DeepEqual(source.Words, plan.Document.Words) {
		t.Fatal("lyrics invented a clock or lost measured gaps")
	}
	after, _ := json.Marshal(source)
	if string(before) != string(after) {
		t.Fatal("original recognition was rewritten")
	}
	if plan.Evidence[0].Method != "source_words" || !reflect.DeepEqual(plan.Evidence[0].SourceSpanIDs, []string{"w1", "w2"}) {
		t.Fatal("measured provenance lost")
	}
}
func TestLyricsAlignmentNeverApprovesOrTimesUnmatchedLyricsAutomatically(t *testing.T) {
	for _, lyrics := range []string{"雨夜重逢\n同行", "从未演唱过的句子"} {
		plan, err := PlanLyricsAlignment(lyricsSourceFixture(), lyrics, nil, 3000)
		if err != nil || plan.CanApply || plan.Document != nil || plan.Lines[0].Reviewed || plan.Lines[0].Issue == "" {
			t.Fatal("unreviewed or missing lyrics became adopted", plan, err)
		}
		if lyrics == "从未演唱过的句子" && plan.Lines[0].Selected != nil {
			t.Fatal("missing recognition received an invented timestamp")
		}
	}
}
func TestLyricsAlignmentRepeatedChorusNeedsExplicitSourceSelection(t *testing.T) {
	source := TranscriptDocument{Version: 1, Precision: "word", Segments: []TranscriptSpan{{ID: "s", StartMs: 0, EndMs: 3000, Text: "回家回家"}}, Words: []TranscriptSpan{{ID: "first", StartMs: 200, EndMs: 700, Text: "回家"}, {ID: "second", StartMs: 1800, EndMs: 2400, Text: "回家"}}}
	plan, err := PlanLyricsAlignment(source, "回家", []LyricsAnchor{{Line: 0, Reviewed: true}}, 3000)
	if err != nil || plan.CanApply || len(plan.Lines[0].Candidates) != 2 {
		t.Fatal("chorus ambiguity hidden", err)
	}
	plan, err = PlanLyricsAlignment(source, "回家", []LyricsAnchor{{Line: 0, StartSpanID: "second", EndSpanID: "second", Reviewed: true}}, 3000)
	if err != nil || !plan.CanApply || plan.Document.Segments[0].StartMs != 1800 {
		t.Fatal("explicit chorus choice was ignored", err)
	}
}
func TestLyricsAlignmentManualTimeIsLabeledAndDoesNotFabricateWordTiming(t *testing.T) {
	start, end := int64(900), int64(1400)
	plan, err := PlanLyricsAlignment(lyricsSourceFixture(), "醒来", []LyricsAnchor{{Line: 0, StartMs: &start, EndMs: &end, Reviewed: true}}, 3000)
	if err != nil || !plan.CanApply || plan.Document.Precision != "segment" || len(plan.Document.Words) != 0 || !plan.Document.WordTimingIncomplete || plan.Evidence[0].Method != "manual" {
		t.Fatal("manual timing became measured words", plan, err)
	}
	if plan.Document.Segments[0].StartMs != start || plan.Document.Segments[0].EndMs != end {
		t.Fatal("explicit manual clock was changed")
	}
}
func TestLyricsAlignmentDoesNotAssignPartialWordOrPartialSegmentClocks(t *testing.T) {
	word := TranscriptDocument{Version: 1, Precision: "word", Segments: []TranscriptSpan{{ID: "s", StartMs: 0, EndMs: 1000, Text: "theater"}}, Words: []TranscriptSpan{{ID: "w", StartMs: 100, EndMs: 900, Text: "theater"}}}
	for _, source := range []TranscriptDocument{word, {Version: 1, Precision: "segment", Segments: word.Segments}} {
		plan, err := PlanLyricsAlignment(source, "the", nil, 1000)
		if err != nil || plan.Lines[0].Selected != nil || plan.CanApply {
			t.Fatal("partial text invented a boundary inside measured speech", err)
		}
	}
}
func TestLyricsAlignmentRejectsWrongDurationMixedAnchorsDuplicatesAndOverlap(t *testing.T) {
	start, end := int64(400), int64(900)
	for _, anchors := range [][]LyricsAnchor{
		{{Line: 0, StartSpanID: "w1", EndSpanID: "w1", StartMs: &start, EndMs: &end, Reviewed: true}},
		{{Line: 0, Reviewed: true}, {Line: 0, Reviewed: true}},
		{{Line: 0, StartSpanID: "not-owned-source", EndSpanID: "w1", Reviewed: true}},
	} {
		if _, err := PlanLyricsAlignment(lyricsSourceFixture(), "雨夜", anchors, 3000); err == nil {
			t.Fatal("invalid source assignment accepted")
		}
	}
	if _, err := PlanLyricsAlignment(lyricsSourceFixture(), "雨夜", nil, 2500); err == nil {
		t.Fatal("transcript beyond actual duration accepted")
	}
	plan, err := PlanLyricsAlignment(lyricsSourceFixture(), "同行\n雨夜", []LyricsAnchor{{Line: 0, StartSpanID: "w3", EndSpanID: "w3", Reviewed: true}, {Line: 1, StartSpanID: "w1", EndSpanID: "w1", Reviewed: true}}, 3000)
	if err != nil || plan.CanApply || plan.Lines[1].Issue == "" {
		t.Fatal("backwards manual lyric order accepted", err)
	}
}
func TestLyricsAlignmentWholeMeasuredSegmentHasNoInventedKaraokeWords(t *testing.T) {
	source := TranscriptDocument{Version: 1, Precision: "segment", Segments: []TranscriptSpan{{ID: "s", StartMs: 200, EndMs: 900, Text: "雨夜重逢"}}}
	plan, err := PlanLyricsAlignment(source, "雨夜重逢", []LyricsAnchor{{Line: 0, Reviewed: true}}, 1000)
	if err != nil || !plan.CanApply || plan.Document.Precision != "segment" || len(plan.Document.Words) != 0 || plan.Evidence[0].Method != "source_segment" {
		t.Fatal("segment timing became artificial words", err)
	}
}
