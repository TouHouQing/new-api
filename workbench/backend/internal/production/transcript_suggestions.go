// SPDX-License-Identifier: AGPL-3.0-or-later
// Preserves Studio's reviewed pause/repetition hints with native transcript IDs.
package production

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"unicode"
)

type TranscriptSuggestion struct {
	ID                string `json:"id"`
	Kind              string `json:"kind"`
	SegmentID         string `json:"segmentId"`
	PreviousSegmentID string `json:"previousSegmentId"`
	StartMs           int64  `json:"startMs"`
	EndMs             int64  `json:"endMs"`
}

// Hints are reviewable observations, never automatic deletions or speaker
// identification. Overlapping speech cannot create a false silent interval.
func SuggestTranscript(document TranscriptDocument) ([]TranscriptSuggestion, error) {
	if err := ValidateTranscript(document); err != nil {
		return nil, err
	}
	result := []TranscriptSuggestion{}
	appendHint := func(kind string, previous, current TranscriptSpan, start, end int64) {
		digest := sha256.Sum256([]byte(fmt.Sprintf("%s:%s:%s:%d:%d", kind, previous.ID, current.ID, start, end)))
		result = append(result, TranscriptSuggestion{ID: hex.EncodeToString(digest[:12]), Kind: kind, SegmentID: current.ID, PreviousSegmentID: previous.ID, StartMs: start, EndMs: end})
	}
	normalize := func(text string) string {
		return strings.ToLower(strings.Map(func(r rune) rune {
			if unicode.IsSpace(r) {
				return -1
			}
			return r
		}, text))
	}
	var coverageEnd int64
	var coverageSpan TranscriptSpan
	for index, current := range document.Segments {
		if index > 0 {
			previous := document.Segments[index-1]
			if current.StartMs-coverageEnd > 800 {
				appendHint("pause", coverageSpan, current, coverageEnd, current.StartMs)
			}
			// Different known human labels may deliberately repeat a line.
			sameSpeaker := previous.Speaker == "" || current.Speaker == "" || previous.Speaker == current.Speaker
			text := normalize(current.Text)
			if sameSpeaker && text != "" && text == normalize(previous.Text) {
				appendHint("repeat", previous, current, current.StartMs, current.EndMs)
			}
		}
		if current.EndMs > coverageEnd {
			coverageEnd = current.EndMs
			coverageSpan = current
		}
	}
	return result, nil
}
