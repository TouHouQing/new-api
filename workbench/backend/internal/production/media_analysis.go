package production

import (
	"encoding/json"
	"errors"
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"
)

const MediaAnalysisEngineVersion = 1

var ErrMediaAnalysis = errors.New("invalid media analysis document")
var analysisSHA = regexp.MustCompile(`^[a-f0-9]{64}$`)

type MediaAnalysisSource struct {
	DisplayGeometryVersion int    `json:"displayGeometryVersion,omitempty"`
	Windowed               bool   `json:"windowed,omitempty"`
	ResourceID             string `json:"resourceId"`
	SHA256                 string `json:"sha256"`
	ETag                   string `json:"etag"`
	Bytes                  int64  `json:"bytes"`
	DurationMs             int64  `json:"durationMs"`
	StartMs                int64  `json:"startMs"`
	EndMs                  int64  `json:"endMs"`
	Width                  int    `json:"width,omitempty"`
	Height                 int    `json:"height,omitempty"`
	SourceClipID           string `json:"sourceClipId,omitempty"`
	ClipBindingSHA256      string `json:"clipBindingSha256,omitempty"`
}

func ValidateMediaAnalysisSource(source MediaAnalysisSource, kind string) error {
	if source.DisplayGeometryVersion < 0 || source.DisplayGeometryVersion > 1 {
		return ErrMediaAnalysis
	}
	maximum := int64(60000)
	if source.Windowed {
		if kind != "reference_video" {
			return ErrMediaAnalysis
		}
		maximum = 1800000
	}
	if kind == "subject_track" {
		maximum = 120000
	} else if kind != "audio_structure" && kind != "reference_video" {
		return ErrMediaAnalysis
	}
	if source.ResourceID == "" || len(source.ResourceID) > 80 || !analysisSHA.MatchString(source.SHA256) || source.Bytes <= 0 || source.Bytes > 1<<30 || source.DurationMs <= 0 || source.StartMs < 0 || source.EndMs-source.StartMs < 50 || source.EndMs > source.DurationMs || source.EndMs-source.StartMs > maximum {
		return ErrMediaAnalysis
	}
	if (source.SourceClipID == "") != (source.ClipBindingSHA256 == "") || len(source.SourceClipID) > 128 || (source.ClipBindingSHA256 != "" && !analysisSHA.MatchString(source.ClipBindingSHA256)) {
		return ErrMediaAnalysis
	}
	if kind != "audio_structure" && (source.Width <= 0 || source.Height <= 0) {
		return ErrMediaAnalysis
	}
	return nil
}

type AnalysisRectangle struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

func (r AnalysisRectangle) Valid() bool {
	values := []float64{r.X, r.Y, r.Width, r.Height}
	for _, value := range values {
		if math.IsNaN(value) || math.IsInf(value, 0) {
			return false
		}
	}
	return r.X >= 0 && r.Y >= 0 && r.Width > 0 && r.Height > 0 && r.X+r.Width <= 1.000001 && r.Y+r.Height <= 1.000001
}

type AnalysisSection struct {
	ID       string `json:"id"`
	StartMs  int64  `json:"startMs"`
	EndMs    int64  `json:"endMs"`
	Title    string `json:"title"`
	Approved bool   `json:"approved"`
}

type AnalysisBeat struct {
	ID       string `json:"id"`
	TimeMs   int64  `json:"timeMs"`
	Approved bool   `json:"approved"`
}

type AnalysisTrackingPoint struct {
	ID       string            `json:"id"`
	TimeMs   int64             `json:"timeMs"`
	ROI      AnalysisRectangle `json:"roi"`
	Crop     AnalysisRectangle `json:"crop"`
	Reviewed bool              `json:"reviewed"`
	Manual   bool              `json:"manual"`
}

// Editable annotations are separate from immutable measurements and sources.
// A user can correct a measured candidate without rewriting its evidence.
type MediaAnalysisEdits struct {
	Version  int                     `json:"version"`
	Sections []AnalysisSection       `json:"sections"`
	Beats    []AnalysisBeat          `json:"beats"`
	Tracking []AnalysisTrackingPoint `json:"tracking"`
}

func ValidateMediaAnalysisEdits(source MediaAnalysisSource, kind string, edits MediaAnalysisEdits) (MediaAnalysisEdits, error) {
	if ValidateMediaAnalysisSource(source, kind) != nil || edits.Version != 1 || len(edits.Sections) > 1000 || len(edits.Beats) > 2000 || len(edits.Tracking) > 2000 {
		return edits, ErrMediaAnalysis
	}
	if (kind != "subject_track" && len(edits.Tracking) > 0) || (kind != "audio_structure" && len(edits.Beats) > 0) || (kind == "subject_track" && len(edits.Sections) > 0) {
		return edits, ErrMediaAnalysis
	}
	ids := map[string]bool{}
	validID := func(id string) bool {
		if strings.TrimSpace(id) == "" || len(id) > 128 || strings.ContainsAny(id, "\x00\r\n") || ids[id] {
			return false
		}
		ids[id] = true
		return true
	}
	validTime := func(value int64) bool { return value >= source.StartMs && value < source.EndMs }
	edits.Sections = append([]AnalysisSection{}, edits.Sections...)
	edits.Beats = append([]AnalysisBeat{}, edits.Beats...)
	edits.Tracking = append([]AnalysisTrackingPoint{}, edits.Tracking...)
	for _, section := range edits.Sections {
		if !validID(section.ID) || !validTime(section.StartMs) || section.EndMs <= section.StartMs || section.EndMs > source.EndMs || !utf8.ValidString(section.Title) || utf8.RuneCountInString(section.Title) > 160 {
			return edits, ErrMediaAnalysis
		}
	}
	sort.Slice(edits.Sections, func(i, j int) bool { return edits.Sections[i].StartMs < edits.Sections[j].StartMs })
	for i := 1; i < len(edits.Sections); i++ {
		if edits.Sections[i].StartMs < edits.Sections[i-1].EndMs {
			return edits, ErrMediaAnalysis
		}
	}
	for _, beat := range edits.Beats {
		if !validID(beat.ID) || !validTime(beat.TimeMs) {
			return edits, ErrMediaAnalysis
		}
	}
	sort.Slice(edits.Beats, func(i, j int) bool { return edits.Beats[i].TimeMs < edits.Beats[j].TimeMs })
	for i := 1; i < len(edits.Beats); i++ {
		if edits.Beats[i].TimeMs <= edits.Beats[i-1].TimeMs {
			return edits, ErrMediaAnalysis
		}
	}
	for _, point := range edits.Tracking {
		if !validID(point.ID) || !validTime(point.TimeMs) || !point.ROI.Valid() || !point.Crop.Valid() || (point.Manual && !point.Reviewed) {
			return edits, ErrMediaAnalysis
		}
	}
	sort.Slice(edits.Tracking, func(i, j int) bool { return edits.Tracking[i].TimeMs < edits.Tracking[j].TimeMs })
	for i := 1; i < len(edits.Tracking); i++ {
		if edits.Tracking[i].TimeMs <= edits.Tracking[i-1].TimeMs {
			return edits, ErrMediaAnalysis
		}
	}
	return edits, nil
}

type MediaAnalysisMeasurement struct {
	Kind          string  `json:"kind"`
	EngineVersion int     `json:"engine_version"`
	InputDigest   string  `json:"input_digest"`
	CacheKey      string  `json:"cache_key"`
	Duration      float64 `json:"duration"`
	Method        string  `json:"method"`
	Sections      []struct {
		Start float64 `json:"start"`
		End   float64 `json:"end"`
		Label string  `json:"label"`
	} `json:"sections"`
	Beats  []float64 `json:"beat_times"`
	Points []struct {
		Time           float64           `json:"time"`
		ROI            AnalysisRectangle `json:"roi"`
		Crop           AnalysisRectangle `json:"crop"`
		Confidence     float64           `json:"confidence"`
		ReviewRequired bool              `json:"review_required"`
		Reason         string            `json:"reason"`
	} `json:"points"`
}

func InitialMediaAnalysisEdits(source MediaAnalysisSource, kind string, raw json.RawMessage, normalizedSHA string) (MediaAnalysisEdits, error) {
	edits := MediaAnalysisEdits{Version: 1}
	if len(raw) == 0 || len(raw) > 2<<20 {
		return edits, ErrMediaAnalysis
	}
	var result MediaAnalysisMeasurement
	if json.Unmarshal(raw, &result) != nil || result.Kind != kind || result.EngineVersion != MediaAnalysisEngineVersion || result.InputDigest != normalizedSHA || !analysisSHA.MatchString(normalizedSHA) || !analysisSHA.MatchString(result.CacheKey) || strings.TrimSpace(result.Method) == "" || math.IsNaN(result.Duration) || math.IsInf(result.Duration, 0) || result.Duration <= 0 || math.Abs(result.Duration*1000-float64(source.EndMs-source.StartMs)) > 250 {
		return edits, ErrMediaAnalysis
	}
	timeMs := func(seconds float64) (int64, bool) {
		if math.IsNaN(seconds) || math.IsInf(seconds, 0) || seconds < 0 || seconds > result.Duration {
			return 0, false
		}
		// Normalized video can contain a final partial sampling interval. The
		// requested, probed source boundary remains the authoritative endpoint.
		if seconds == result.Duration {
			return source.EndMs, true
		}
		value := source.StartMs + int64(math.Round(seconds*1000))
		if value >= source.EndMs && value-source.EndMs <= 250 {
			value = source.EndMs - 1
		}
		return value, value >= source.StartMs && value <= source.EndMs
	}
	for i, section := range result.Sections {
		start, ok := timeMs(section.Start)
		end, ok2 := timeMs(section.End)
		if !ok || !ok2 {
			return edits, ErrMediaAnalysis
		}
		title := "参考片段 " + strconv.Itoa(i+1)
		if kind == "audio_structure" {
			title = "音乐分段 " + strconv.Itoa(i+1)
			if section.Label == "silence" {
				title = "静音片段 " + strconv.Itoa(i+1)
			}
		}
		edits.Sections = append(edits.Sections, AnalysisSection{ID: analysisItemID("section", i), StartMs: start, EndMs: end, Title: title})
	}
	for i, beat := range result.Beats {
		value, ok := timeMs(beat)
		if !ok {
			return edits, ErrMediaAnalysis
		}
		edits.Beats = append(edits.Beats, AnalysisBeat{ID: analysisItemID("beat", i), TimeMs: value})
	}
	for i, point := range result.Points {
		value, ok := timeMs(point.Time)
		if !ok || math.IsNaN(point.Confidence) || math.IsInf(point.Confidence, 0) || point.Confidence < 0 || point.Confidence > 1 {
			return edits, ErrMediaAnalysis
		}
		edits.Tracking = append(edits.Tracking, AnalysisTrackingPoint{ID: analysisItemID("point", i), TimeMs: value, ROI: point.ROI, Crop: point.Crop})
	}
	if kind == "subject_track" && len(edits.Tracking) == 0 {
		return edits, ErrMediaAnalysis
	}
	if kind != "subject_track" && len(edits.Sections) == 0 {
		return edits, ErrMediaAnalysis
	}
	return ValidateMediaAnalysisEdits(source, kind, edits)
}

func analysisItemID(prefix string, index int) string {
	// IDs are stable within an immutable measurement, independent of labels.
	return prefix + ":" + strconv.Itoa(index)
}
