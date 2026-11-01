package production

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"unicode"
	"unicode/utf8"

	"golang.org/x/text/unicode/norm"
)

// Original recognition remains in its original transcript revision. Lyrics
// create a separate, reviewed version; manual timing never becomes ASR data.
type TranscriptLyrics struct {
	Text                 string                 `json:"text"`
	Version              int                    `json:"version"`
	SourceRevisionID     string                 `json:"sourceRevisionId"`
	SourceDocumentSHA256 string                 `json:"sourceDocumentSha256"`
	LyricsSHA256         string                 `json:"lyricsSha256"`
	RequestID            string                 `json:"requestId"`
	RequestSHA256        string                 `json:"requestSha256"`
	Lines                []LyricsTimingEvidence `json:"lines"`
}
type LyricsTimingEvidence struct {
	Line          int      `json:"line"`
	SegmentID     string   `json:"segmentId"`
	Method        string   `json:"method"`
	SourceSpanIDs []string `json:"sourceSpanIds,omitempty"`
}
type LyricsAnchor struct {
	Line        int    `json:"line"`
	StartSpanID string `json:"startSpanId,omitempty"`
	EndSpanID   string `json:"endSpanId,omitempty"`
	StartMs     *int64 `json:"startMs,omitempty"`
	EndMs       *int64 `json:"endMs,omitempty"`
	Reviewed    bool   `json:"reviewed"`
}
type LyricsTimingCandidate struct {
	StartMs       int64    `json:"startMs"`
	EndMs         int64    `json:"endMs"`
	Method        string   `json:"method"`
	SourceSpanIDs []string `json:"sourceSpanIds,omitempty"`
	SourceText    string   `json:"sourceText,omitempty"`
}
type LyricsAlignmentLine struct {
	Index      int                     `json:"index"`
	Text       string                  `json:"text"`
	Kind       string                  `json:"kind"`
	Candidates []LyricsTimingCandidate `json:"candidates"`
	Selected   *LyricsTimingCandidate  `json:"selected,omitempty"`
	Reviewed   bool                    `json:"reviewed"`
	Issue      string                  `json:"issue,omitempty"`
}
type LyricsAlignmentPlan struct {
	Lines                []LyricsAlignmentLine  `json:"lines"`
	CanApply             bool                   `json:"canApply"`
	Precision            string                 `json:"precision"`
	Warnings             []string               `json:"warnings"`
	Document             *TranscriptDocument    `json:"document,omitempty"`
	Evidence             []LyricsTimingEvidence `json:"evidence"`
	SourceDocumentSHA256 string                 `json:"sourceDocumentSha256"`
	LyricsSHA256         string                 `json:"lyricsSha256"`
}

func lyricsDigest(raw []byte) string { sum := sha256.Sum256(raw); return hex.EncodeToString(sum[:]) }
func lyricsText(value string) string {
	var out strings.Builder
	for _, r := range norm.NFKC.String(value) {
		if unicode.IsLetter(r) || unicode.IsNumber(r) || unicode.IsMark(r) {
			out.WriteRune(unicode.ToLower(r))
		}
	}
	return out.String()
}
func lyricsSection(value string) bool {
	if len(value) < 3 || !strings.HasPrefix(value, "[") || !strings.HasSuffix(value, "]") {
		return false
	}
	label := strings.ToLower(strings.TrimSpace(value[1 : len(value)-1]))
	for _, name := range []string{"verse", "chorus", "pre-chorus", "post-chorus", "bridge", "intro", "outro", "instrumental", "solo", "主歌", "副歌", "间奏", "前奏", "尾奏", "桥段"} {
		if label == name || strings.HasPrefix(label, name+" ") {
			return true
		}
	}
	return false
}
func lyricCandidate(spans []TranscriptSpan, start, end int, method string) LyricsTimingCandidate {
	result := LyricsTimingCandidate{StartMs: spans[start].StartMs, EndMs: spans[end].EndMs, Method: method, SourceSpanIDs: []string{}}
	var text []string
	for _, span := range spans[start : end+1] {
		result.SourceSpanIDs = append(result.SourceSpanIDs, span.ID)
		text = append(text, span.Text)
		if span.EndMs > result.EndMs {
			result.EndMs = span.EndMs
		}
	}
	result.SourceText = strings.Join(text, " ")
	return result
}

// Find complete source words only. Matching a substring within a word cannot
// manufacture a new timestamp inside that word.
func lyricsCandidates(spans []TranscriptSpan, line string, after int64, method string) []LyricsTimingCandidate {
	result := []LyricsTimingCandidate{}
	needle := lyricsText(line)
	if needle == "" {
		return result
	}
	var text strings.Builder
	starts, ends := map[int]int{}, map[int]int{}
	for index, span := range spans {
		if span.StartMs < after {
			continue
		}
		value := lyricsText(span.Text)
		if value == "" {
			continue
		}
		starts[text.Len()] = index
		text.WriteString(value)
		ends[text.Len()] = index
	}
	joined := text.String()
	for offset := 0; offset < len(joined) && len(result) < 8; {
		at := strings.Index(joined[offset:], needle)
		if at < 0 {
			break
		}
		at += offset
		start, left := starts[at]
		end, right := ends[at+len(needle)]
		if left && right && start <= end {
			result = append(result, lyricCandidate(spans, start, end, method))
		}
		offset = at + 1
	}
	return result
}

// Every adopted line needs explicit review. Missing/repeated lyrics remain
// visible and block adoption until matched to source spans or manually timed.
func PlanLyricsAlignment(source TranscriptDocument, lyrics string, anchors []LyricsAnchor, durationMs int64) (LyricsAlignmentPlan, error) {
	plan := LyricsAlignmentPlan{Lines: []LyricsAlignmentLine{}, Warnings: []string{}, Evidence: []LyricsTimingEvidence{}, CanApply: true, Precision: "segment"}
	fail := func(message string) (LyricsAlignmentPlan, error) { return plan, errors.New(message) }
	if ValidateTranscript(source) != nil || source.Lyrics != nil {
		return fail("请选择原识别或已校正的文字稿版本；歌词版本不能冒充原始测量")
	}
	if !utf8.ValidString(lyrics) || len(lyrics) > 64<<10 || strings.TrimSpace(lyrics) == "" || durationMs < 1 || durationMs > 86_400_000 {
		return fail("歌词或原音频时长无效；请先读取实际素材")
	}
	encoded, _ := json.Marshal(source)
	plan.SourceDocumentSHA256 = lyricsDigest(encoded)
	plan.LyricsSHA256 = lyricsDigest([]byte(lyrics))
	spans, method := source.Words, "source_words"
	if len(spans) == 0 {
		spans, method = source.Segments, "source_segment"
	}
	for _, items := range [][]TranscriptSpan{source.Words, source.Segments} {
		for _, span := range items {
			if span.EndMs > durationMs {
				return fail("文字稿时间超出实际源音频")
			}
		}
	}
	byID := map[string]int{}
	for i, span := range spans {
		if span.EndMs > durationMs {
			return fail("文字稿时间超出实际源音频")
		}
		byID[span.ID] = i
	}
	anchorByLine := map[int]LyricsAnchor{}
	for _, anchor := range anchors {
		if anchor.Line < 0 || anchor.Line > 399 {
			return fail("歌词行号无效")
		}
		if _, exists := anchorByLine[anchor.Line]; exists {
			return fail("同一句歌词不能提交两个时间方案")
		}
		anchorByLine[anchor.Line] = anchor
	}
	lyricCount := 0
	for _, raw := range strings.Split(strings.ReplaceAll(lyrics, "\r\n", "\n"), "\n") {
		line := strings.TrimSpace(raw)
		if line == "" {
			continue
		}
		if len(plan.Lines) >= 400 || utf8.RuneCountInString(line) > 8000 {
			return fail("歌词最多400行，每行最多8000字")
		}
		kind := "lyric"
		if lyricsSection(line) {
			kind = "section"
		} else {
			lyricCount++
		}
		plan.Lines = append(plan.Lines, LyricsAlignmentLine{Index: len(plan.Lines), Text: line, Kind: kind, Candidates: []LyricsTimingCandidate{}})
	}
	if lyricCount == 0 || lyricCount > 200 {
		return fail("请提供1至200句实际演唱的歌词；结构标记不作为演唱内容")
	}
	for index := range anchorByLine {
		if index >= len(plan.Lines) || plan.Lines[index].Kind != "lyric" {
			return fail("时间方案必须对应一行实际歌词")
		}
	}
	allWords := len(source.Words) > 0
	var previousEnd int64
	usedWords := map[string]bool{}
	words := []TranscriptSpan{}
	segments := []TranscriptSpan{}
	for index := range plan.Lines {
		row := &plan.Lines[index]
		if row.Kind == "section" {
			continue
		}
		row.Candidates = lyricsCandidates(spans, row.Text, previousEnd, method)
		anchor, explicit := anchorByLine[index]
		if len(row.Candidates) > 0 {
			chosen := row.Candidates[0]
			row.Selected = &chosen
		}
		if explicit {
			row.Reviewed = anchor.Reviewed
			if anchor.StartSpanID != "" || anchor.EndSpanID != "" {
				if anchor.StartMs != nil || anchor.EndMs != nil {
					return fail("请选择原词范围或人工时间，不能混合两种来源")
				}
				start, left := byID[anchor.StartSpanID]
				end, right := byID[anchor.EndSpanID]
				if !left || !right || end < start {
					return fail("歌词对应的原始词或分段不存在")
				}
				chosen := lyricCandidate(spans, start, end, method)
				if lyricsText(chosen.SourceText) != lyricsText(row.Text) {
					chosen.Method = "manual"
				}
				row.Selected = &chosen
			} else if anchor.StartMs != nil || anchor.EndMs != nil {
				if anchor.StartMs == nil || anchor.EndMs == nil {
					return fail("人工时间需要同时提供起点和终点")
				}
				row.Selected = &LyricsTimingCandidate{StartMs: *anchor.StartMs, EndMs: *anchor.EndMs, Method: "manual"}
			} else if len(row.Candidates) > 1 {
				row.Issue = "检测到多处相同歌词，请明确选择对应的原词范围"
			}
		} else if len(row.Candidates) > 1 {
			row.Issue = "检测到多处相同歌词，请明确选择对应的原词范围"
		}
		if row.Selected == nil {
			row.Issue = "尚未找到对应时间，请试听后选择原词范围或标记人工时间"
		}
		if row.Selected != nil {
			chosen := row.Selected
			if chosen.StartMs < previousEnd || chosen.EndMs <= chosen.StartMs || chosen.EndMs > durationMs {
				row.Issue = "歌词时间重叠、倒退或超出音频，请保留草稿并校正"
			} else {
				previousEnd = chosen.EndMs
			}
			id := fmt.Sprintf("lyric-%s-%06d", plan.SourceDocumentSHA256[:12], index+1)
			segments = append(segments, TranscriptSpan{ID: id, StartMs: chosen.StartMs, EndMs: chosen.EndMs, Text: row.Text, Corrected: true})
			plan.Evidence = append(plan.Evidence, LyricsTimingEvidence{Line: index, SegmentID: id, Method: chosen.Method, SourceSpanIDs: append([]string{}, chosen.SourceSpanIDs...)})
			if chosen.Method != "source_words" {
				allWords = false
			} else {
				for _, id := range chosen.SourceSpanIDs {
					if usedWords[id] {
						allWords = false
						continue
					}
					usedWords[id] = true
					words = append(words, spans[byID[id]])
				}
			}
		}
		if !row.Reviewed {
			if row.Issue == "" {
				row.Issue = "请试听并核对这一句歌词的时间"
			}
		}
		if row.Issue != "" {
			plan.CanApply = false
		}
	}
	if plan.CanApply {
		document := TranscriptDocument{Version: 1, Language: source.Language, Precision: "segment", Segments: segments, WordTimingIncomplete: !allWords}
		if allWords && len(words) > 0 {
			document.Precision = "word"
			document.Words = words
			document.WordTextNeedsReview = source.WordTextNeedsReview
		}
		if err := ValidateTranscript(document); err != nil {
			return fail("歌词时间或逐词来源无法保存，请核对原词时间")
		}
		plan.Document = &document
		plan.Precision = document.Precision
	}
	if !allWords {
		plan.Warnings = append(plan.Warnings, "部分歌词只有逐句或人工时间，未生成逐字时间；逐字字幕需要真实逐词测量。")
	}
	return plan, nil
}

func validateTranscriptLyrics(document TranscriptDocument) error {
	value := document.Lyrics
	if value == nil {
		return nil
	}
	validDigest := func(raw string) bool {
		decoded, err := hex.DecodeString(raw)
		return err == nil && len(decoded) == 32 && strings.ToLower(raw) == raw
	}
	if value.Version != 1 || value.SourceRevisionID == "" || len(value.SourceRevisionID) > 80 || len(value.RequestID) < 16 || len(value.RequestID) > 128 || !validDigest(value.SourceDocumentSHA256) || !validDigest(value.LyricsSHA256) || !validDigest(value.RequestSHA256) || len(value.Lines) != len(document.Segments) || !utf8.ValidString(value.Text) || len(value.Text) > 64<<10 || lyricsDigest([]byte(value.Text)) != value.LyricsSHA256 {
		return errors.New("歌词来源与固定请求记录无效")
	}
	for index, evidence := range value.Lines {
		if evidence.Line < 0 || evidence.Line > 399 || index > 0 && evidence.Line <= value.Lines[index-1].Line || evidence.SegmentID != document.Segments[index].ID || (evidence.Method != "manual" && evidence.Method != "source_words" && evidence.Method != "source_segment") || len(evidence.SourceSpanIDs) > 100000 {
			return errors.New("歌词时间来源记录不完整")
		}
		if evidence.Method != "manual" && len(evidence.SourceSpanIDs) == 0 {
			return errors.New("歌词时间缺少原词来源")
		}
	}
	return nil
}
