package production

import "testing"

func TestTranscriptCutPreservesOnlyAdjacentRetainedPauses(t *testing.T) {
	raw, document := cutFixture(t)
	document.Segments[0].EndMs = 4000
	document.Segments[1].StartMs = 6000
	document.Segments[1].EndMs = 8000
	document.Segments[2].StartMs = 10000
	all := []string{"s1", "s2", "s3"}
	joined, err := PlanTranscriptCut(raw, document, "text", "v1", "speech", "voice", "ripple", all, TranscriptCutOptions{PreservePauses: true})
	if err != nil || joined.RemovedMs != 1020 || len(joined.KeptRanges) != 1 || joined.KeptRanges[0].SourceEndMs != 15000 {
		t.Fatalf("natural pauses not retained: %+v %v", joined, err)
	}
	tight, err := PlanTranscriptCut(raw, document, "text", "v1", "speech", "voice", "ripple", all)
	if err != nil || tight.RemovedMs != 5020 {
		t.Fatalf("tight cut incorrect: %d %v", tight.RemovedMs, err)
	}
	removedLine, err := PlanTranscriptCut(raw, document, "text", "v1", "speech", "voice", "ripple", []string{"s1", "s3"}, TranscriptCutOptions{PreservePauses: true})
	if err != nil || removedLine.RemovedMs != 7020 || len(removedLine.KeptRanges) != 2 {
		t.Fatal("pause preservation restored an unselected line", err)
	}
}

func TestTranscriptWordCutRequiresRealCompleteUncorrectedWordTiming(t *testing.T) {
	raw, document := cutFixture(t)
	document.Precision = "word"
	document.Words = []TranscriptSpan{{ID: "w1", StartMs: 0, EndMs: 2000, Text: "第一"}, {ID: "w2", StartMs: 2000, EndMs: 5000, Text: "句"}, {ID: "w3", StartMs: 5000, EndMs: 9000, Text: "第二句"}}
	options := TranscriptCutOptions{Unit: "word", PreservePauses: true}
	plan, err := PlanTranscriptCut(raw, document, "text", "v1", "speech", "voice", "clip_only", []string{"w1", "w3"}, options)
	if err != nil || plan.RemovedMs != 10020 || len(plan.KeptRanges) != 2 || plan.KeptRanges[1].SourceStartMs != 5000 || plan.KeptRanges[1].ProgramStartMs != 2000 {
		t.Fatalf("wrong actual word cut: %+v %v", plan.KeptRanges, err)
	}
	for _, variant := range []string{"incomplete", "corrected", "unknown", "wrong_id"} {
		t.Run(variant, func(t *testing.T) {
			copy := document
			choice := options
			ids := []string{"w1"}
			switch variant {
			case "incomplete":
				copy.WordTimingIncomplete = true
			case "corrected":
				copy.WordTextNeedsReview = true
			case "unknown":
				choice.Unit = "syllable"
			case "wrong_id":
				ids = []string{"s1"}
			}
			if _, err := PlanTranscriptCut(raw, copy, "text", "v1", "speech", "voice", "ripple", ids, choice); err == nil {
				t.Fatal("unreliable selection accepted")
			}
		})
	}
}
