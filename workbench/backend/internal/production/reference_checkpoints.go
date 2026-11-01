package production

import (
	"fmt"
	"sort"
	"strconv"
)

// Overlap provides actual scene-change context at checkpoint seams. Only the
// core owns cuts; an artificial window start must never become a scene cut.
type ReferenceWindow struct {
	Index       int   `json:"index"`
	StartMs     int64 `json:"startMs"`
	EndMs       int64 `json:"endMs"`
	CoreStartMs int64 `json:"coreStartMs"`
	CoreEndMs   int64 `json:"coreEndMs"`
}

func ReferenceWindows(source MediaAnalysisSource) ([]ReferenceWindow, error) {
	if !source.Windowed || ValidateMediaAnalysisSource(source, "reference_video") != nil {
		return nil, ErrMediaAnalysis
	}
	result := []ReferenceWindow{}
	for start := source.StartMs; start < source.EndMs; start += 55000 {
		end := min(start+55000, source.EndMs)
		result = append(result, ReferenceWindow{Index: len(result), StartMs: max(source.StartMs, start-500), EndMs: min(source.EndMs, end+500), CoreStartMs: start, CoreEndMs: end})
	}
	return result, nil
}

func MergeReferenceWindows(source MediaAnalysisSource, windows []MediaAnalysisEdits) (MediaAnalysisEdits, error) {
	result := MediaAnalysisEdits{Version: 1, Sections: []AnalysisSection{}, Beats: []AnalysisBeat{}, Tracking: []AnalysisTrackingPoint{}}
	plan, err := ReferenceWindows(source)
	if err != nil || len(plan) != len(windows) {
		return result, ErrMediaAnalysis
	}
	cuts := []int64{source.StartMs, source.EndMs}
	for index, raw := range windows {
		window := plan[index]
		part := source
		part.Windowed = false
		part.StartMs = window.StartMs
		part.EndMs = window.EndMs
		checked, err := ValidateMediaAnalysisEdits(part, "reference_video", raw)
		if err != nil || len(checked.Sections) == 0 {
			return result, ErrMediaAnalysis
		}
		for _, section := range checked.Sections {
			if section.StartMs > window.StartMs && section.StartMs >= window.CoreStartMs && section.StartMs < window.CoreEndMs {
				cuts = append(cuts, section.StartMs)
			}
		}
	}
	sort.Slice(cuts, func(i, j int) bool { return cuts[i] < cuts[j] })
	unique := cuts[:0]
	for _, value := range cuts {
		if len(unique) == 0 || unique[len(unique)-1] != value {
			unique = append(unique, value)
		}
	}
	if len(unique) > 1001 {
		return result, fmt.Errorf("参考片切点超过1000个，请缩短区间或提高检测阈值")
	}
	for i := 1; i < len(unique); i++ {
		result.Sections = append(result.Sections, AnalysisSection{ID: analysisItemID("section", i-1), StartMs: unique[i-1], EndMs: unique[i], Title: "参考片段 " + strconv.Itoa(i)})
	}
	return ValidateMediaAnalysisEdits(source, "reference_video", result)
}
