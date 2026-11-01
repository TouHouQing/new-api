// SPDX-License-Identifier: AGPL-3.0-or-later
package production

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"unicode/utf8"
)

const MaxTranscriptBytes = 2 << 20

type TranscriptSpan struct {
	ID         string   `json:"id"`
	StartMs    int64    `json:"startMs"`
	EndMs      int64    `json:"endMs"`
	Text       string   `json:"text"`
	Speaker    string   `json:"speaker,omitempty"`
	Confidence *float64 `json:"confidence,omitempty"`
	Corrected  bool     `json:"corrected,omitempty"`
}

type TranscriptDocument struct {
	Lyrics               *TranscriptLyrics `json:"lyrics,omitempty"`
	Version              int               `json:"version"`
	Language             string            `json:"language,omitempty"`
	Precision            string            `json:"precision"`
	Segments             []TranscriptSpan  `json:"segments"`
	Words                []TranscriptSpan  `json:"words,omitempty"`
	WordTextNeedsReview  bool              `json:"wordTextNeedsReview,omitempty"`
	WordTimingIncomplete bool              `json:"wordTimingIncomplete,omitempty"`
}

type TranscriptCorrection struct {
	ID      string  `json:"id"`
	Text    *string `json:"text,omitempty"`
	Speaker *string `json:"speaker,omitempty"`
}

// ParseRecognitionTranscript accepts native millisecond recognition output.
// It never invents word timing, speakers or confidence when they are absent.
func ParseRecognitionTranscript(raw []byte) (TranscriptDocument, error) {
	if len(raw) == 0 || len(raw) > MaxTranscriptBytes {
		return TranscriptDocument{}, errors.New("识别结果为空或超过文字稿大小限制")
	}
	var source struct {
		Segments             []TranscriptSpan `json:"segments"`
		Words                []TranscriptSpan `json:"words"`
		Language             string           `json:"language"`
		WordTimingIncomplete bool             `json:"wordTimingIncomplete"`
	}
	if err := json.Unmarshal(raw, &source); err != nil {
		return TranscriptDocument{}, errors.New("识别结果不是有效文字稿")
	}
	document := TranscriptDocument{Version: 1, Language: strings.TrimSpace(source.Language), Precision: "segment", Segments: source.Segments, Words: source.Words, WordTimingIncomplete: source.WordTimingIncomplete}
	if len(document.Words) > 0 {
		document.Precision = "word"
	}
	for index := range document.Segments {
		document.Segments[index].ID = fmt.Sprintf("s-%06d", index+1)
		document.Segments[index].Corrected = false
		document.Segments[index].Speaker = ""
	}
	for index := range document.Words {
		document.Words[index].ID = fmt.Sprintf("w-%06d", index+1)
		document.Words[index].Corrected = false
		document.Words[index].Speaker = ""
	}
	if err := ValidateTranscript(document); err != nil {
		return TranscriptDocument{}, err
	}
	return document, nil
}

func ValidateTranscript(document TranscriptDocument) error {
	if err := validateTranscriptLyrics(document); err != nil {
		return err
	}
	if (document.Version != 1 && document.Version != 2) || (document.Version == 2) != (document.Lyrics != nil) || (document.Precision != "segment" && document.Precision != "word") || len(document.Language) > 32 || len(document.Segments) == 0 || len(document.Segments) > 10000 || len(document.Words) > 100000 || (document.Precision == "word") != (len(document.Words) > 0) {
		return errors.New("文字稿版本、精度或条目数量无效")
	}
	seen := map[string]bool{}
	for _, spans := range [][]TranscriptSpan{document.Segments, document.Words} {
		var previous int64
		for _, span := range spans {
			if span.ID == "" || len(span.ID) > 80 || seen[span.ID] || span.StartMs < previous || span.StartMs < 0 || span.EndMs <= span.StartMs || span.EndMs > 86_400_000 || strings.TrimSpace(span.Text) == "" || utf8.RuneCountInString(span.Text) > 8000 || utf8.RuneCountInString(span.Speaker) > 80 {
				return errors.New("文字稿包含无效的时间、文本或说话人标记")
			}
			if span.Confidence != nil && (math.IsNaN(*span.Confidence) || math.IsInf(*span.Confidence, 0) || *span.Confidence < 0 || *span.Confidence > 1) {
				return errors.New("识别置信度无效")
			}
			seen[span.ID] = true
			previous = span.StartMs
		}
	}
	encoded, err := json.Marshal(document)
	if err != nil || len(encoded) > MaxTranscriptBytes {
		return errors.New("文字稿超过大小限制")
	}
	return nil
}

// Text correction deliberately has no timestamp fields. Cutting media is a
// separate reviewed operation against an exact timeline occurrence.
func CorrectTranscript(document TranscriptDocument, changes []TranscriptCorrection) (TranscriptDocument, error) {
	if err := ValidateTranscript(document); err != nil {
		return TranscriptDocument{}, err
	}
	if len(changes) == 0 || len(changes) > 10000 {
		return TranscriptDocument{}, errors.New("请选择需要校正的文字或说话人")
	}
	result := document
	result.Segments = append([]TranscriptSpan(nil), document.Segments...)
	result.Words = append([]TranscriptSpan(nil), document.Words...)
	indices := map[string]int{}
	for index, span := range result.Segments {
		indices[span.ID] = index
	}
	seen := map[string]bool{}
	for _, change := range changes {
		index, ok := indices[change.ID]
		if !ok || seen[change.ID] || (change.Text == nil && change.Speaker == nil) {
			return TranscriptDocument{}, errors.New("校正项重复、不存在或没有修改内容")
		}
		seen[change.ID] = true
		if change.Text != nil {
			text := strings.TrimSpace(*change.Text)
			if text != result.Segments[index].Text {
				result.Segments[index].Text = text
				result.Segments[index].Corrected = true
				if len(result.Words) > 0 {
					result.WordTextNeedsReview = true
				}
			}
		}
		if change.Speaker != nil {
			result.Segments[index].Speaker = strings.TrimSpace(*change.Speaker)
		}
	}
	if err := ValidateTranscript(result); err != nil {
		return TranscriptDocument{}, err
	}
	return result, nil
}
