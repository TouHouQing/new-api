// SPDX-License-Identifier: AGPL-3.0-or-later
package production

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

func TestTranscriptCorrectionKeepsSourceTimesAndDoesNotInventWordPrecision(t *testing.T) {
	document, err := ParseRecognitionTranscript([]byte(`{"language":"zh","segments":[{"startMs":200,"endMs":1300,"text":"窗边直物"},{"startMs":1600,"endMs":2200,"text":"微微晃动"}]}`))
	if err != nil {
		t.Fatal(err)
	}
	if document.Precision != "segment" || len(document.Words) != 0 || document.Segments[0].Confidence != nil || document.Segments[0].Speaker != "" {
		t.Fatal("missing analysis details were invented")
	}
	text, speaker := "窗边植物", "旁白"
	corrected, err := CorrectTranscript(document, []TranscriptCorrection{{ID: document.Segments[0].ID, Text: &text, Speaker: &speaker}})
	if err != nil {
		t.Fatal(err)
	}
	if corrected.Segments[0].StartMs != 200 || corrected.Segments[0].EndMs != 1300 || corrected.Segments[0].Text != text || corrected.Segments[0].Speaker != speaker || !corrected.Segments[0].Corrected {
		t.Fatal("text correction changed source timing or lost user edits")
	}
	if document.Segments[0].Text != "窗边直物" || document.Segments[0].Speaker != "" || document.Segments[0].Corrected {
		t.Fatal("correction mutated the source document")
	}
	if corrected.Segments[1] != document.Segments[1] {
		t.Fatal("unrelated utterance changed")
	}
	for _, changes := range [][]TranscriptCorrection{{}, {{ID: "unknown", Text: &text}}, {{ID: document.Segments[0].ID}}, {{ID: document.Segments[0].ID, Text: &text}, {ID: document.Segments[0].ID, Speaker: &speaker}}} {
		if _, err := CorrectTranscript(document, changes); err == nil {
			t.Fatal("invalid correction accepted")
		}
	}
}

func TestTranscriptRetainsActualWordConfidenceAndMarksChangedTextForReview(t *testing.T) {
	document, err := ParseRecognitionTranscript([]byte(`{"segments":[{"startMs":0,"endMs":1000,"text":"A cat"}],"words":[{"startMs":0,"endMs":200,"text":"A","confidence":0},{"startMs":300,"endMs":1000,"text":"cat","confidence":0.8}]}`))
	if err != nil {
		t.Fatal(err)
	}
	if document.Precision != "word" || document.Words[0].Confidence == nil || *document.Words[0].Confidence != 0 {
		t.Fatal("word precision or zero confidence lost")
	}
	text := "A cap"
	corrected, err := CorrectTranscript(document, []TranscriptCorrection{{ID: document.Segments[0].ID, Text: &text}})
	if err != nil {
		t.Fatal(err)
	}
	if !corrected.WordTextNeedsReview || corrected.Words[1].Text != "cat" || corrected.Words[1].StartMs != 300 || document.WordTextNeedsReview {
		t.Fatal("corrected text silently rewrote model words or source")
	}
}

func TestTranscriptRejectsInvalidTimesTextConfidenceAndOversize(t *testing.T) {
	for _, raw := range []string{
		`{}`, `{"segments":[]}`,
		`{"segments":[{"startMs":-1,"endMs":10,"text":"bad"}]}`,
		`{"segments":[{"startMs":10,"endMs":10,"text":"bad"}]}`,
		`{"segments":[{"startMs":0,"endMs":86400001,"text":"bad"}]}`,
		`{"segments":[{"startMs":1000,"endMs":2000,"text":"later"},{"startMs":0,"endMs":500,"text":"earlier"}]}`,
		`{"segments":[{"startMs":0,"endMs":500,"text":"bad","confidence":2}]}`,
		`{"segments":[{"startMs":0,"endMs":500,"text":"  "}]}`,
	} {
		if _, err := ParseRecognitionTranscript([]byte(raw)); err == nil {
			t.Fatal("invalid transcript accepted")
		}
	}
	document := TranscriptDocument{Version: 1, Precision: "segment"}
	for index := 0; index < 300; index++ {
		document.Segments = append(document.Segments, TranscriptSpan{ID: fmt.Sprint(index), StartMs: int64(index), EndMs: int64(index + 1), Text: strings.Repeat("x", 7900)})
	}
	if err := ValidateTranscript(document); err == nil {
		t.Fatal("oversize revision accepted")
	}
	encoded, _ := json.Marshal(document)
	if _, err := ParseRecognitionTranscript(encoded); err == nil {
		t.Fatal("oversize recognition accepted")
	}
}
