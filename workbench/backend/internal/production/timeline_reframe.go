package production

import (
	"encoding/json"
	"fmt"
	"math"
	"strings"
)

type ReframeKey struct {
	TimeMs int64   `json:"timeMs"`
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
}

const ManualFramingMethod = "user-defined-framing-v1"

// Source-time keys survive moving, splitting and retiming an occurrence.
// A fixed crop size avoids silently changing subject scale between frames.
type TimelineReframe struct {
	AnalysisID   string       `json:"analysisId"`
	RevisionID   string       `json:"revisionId"`
	ResourceID   string       `json:"resourceId"`
	SourceSHA256 string       `json:"sourceSha256"`
	SourceWidth  int          `json:"sourceWidth"`
	SourceHeight int          `json:"sourceHeight"`
	Width        float64      `json:"width"`
	Height       float64      `json:"height"`
	StartMs      int64        `json:"startMs"`
	EndMs        int64        `json:"endMs"`
	Keys         []ReframeKey `json:"keys"`
}

func (r TimelineReframe) Valid() bool {
	if !markerText(r.AnalysisID, 80) || !markerText(r.RevisionID, 80) || !markerText(r.ResourceID, 80) || !analysisSHA.MatchString(r.SourceSHA256) || r.SourceWidth <= 0 || r.SourceHeight <= 0 || r.Width*float64(r.SourceWidth) < 2 || r.Height*float64(r.SourceHeight) < 2 || r.StartMs < 0 || r.EndMs <= r.StartMs || r.EndMs > 86400000 || len(r.Keys) < 2 || len(r.Keys) > 128 {
		return false
	}
	previous := int64(-1)
	for _, k := range r.Keys {
		if k.TimeMs <= previous || k.TimeMs < r.StartMs || k.TimeMs >= r.EndMs || !(AnalysisRectangle{k.X, k.Y, r.Width, r.Height}).Valid() {
			return false
		}
		previous = k.TimeMs
	}
	return r.Keys[0].TimeMs-r.StartMs <= 150 && r.EndMs-r.Keys[len(r.Keys)-1].TimeMs <= 150
}

func validateClipReframe(clip map[string]any) error {
	raw, exists := clip["reframe"]
	if !exists {
		return nil
	}
	encoded, err := json.Marshal(raw)
	if err != nil {
		return ErrTimelineDocument
	}
	var r TimelineReframe
	if json.Unmarshal(encoded, &r) != nil || !r.Valid() || stringValue(clip, "kind") != "video" || stringValue(objectValue(clip["directMedia"]), "storageKey") != "resource:"+r.ResourceID {
		return ErrTimelineDocument
	}
	rate, ok := TimelinePlaybackRate(clip)
	if !ok {
		return ErrTimelineDocument
	}
	start := cutTime(clip, "sourceStartMs")
	end := start + sourceOffset(cutTime(clip, "durationMs"), rate)
	if start < r.StartMs || end > r.EndMs {
		return fmt.Errorf("%w: 构图范围未覆盖当前源区间，请重新分析或缩短片段", ErrTimelineDocument)
	}
	return nil
}

// Reduce only collinear detail within half a source pixel. Preserve every
// reviewed source point in the immutable analysis revision for later editing.
func compactReframeKeys(keys []ReframeKey, width, height int) []ReframeKey {
	var simplify func(int, int) []ReframeKey
	simplify = func(first, last int) []ReframeKey {
		if last-first <= 1 {
			return append([]ReframeKey{}, keys[first:last+1]...)
		}
		a, b := keys[first], keys[last]
		maximum := 0.5
		split := -1
		for i := first + 1; i < last; i++ {
			f := float64(keys[i].TimeMs-a.TimeMs) / float64(b.TimeMs-a.TimeMs)
			distance := math.Max(math.Abs(keys[i].X-(a.X+(b.X-a.X)*f))*float64(width), math.Abs(keys[i].Y-(a.Y+(b.Y-a.Y)*f))*float64(height))
			if distance > maximum {
				maximum = distance
				split = i
			}
		}
		if split < 0 {
			return []ReframeKey{a, b}
		}
		left, right := simplify(first, split), simplify(split, last)
		return append(left[:len(left)-1], right...)
	}
	return simplify(0, len(keys)-1)
}

func BuildTimelineReframe(analysisID, revisionID string, source MediaAnalysisSource, edits MediaAnalysisEdits, evidence json.RawMessage) (TimelineReframe, error) {
	result := TimelineReframe{AnalysisID: analysisID, RevisionID: revisionID, ResourceID: source.ResourceID, SourceSHA256: source.SHA256, SourceWidth: source.Width, SourceHeight: source.Height, StartMs: source.StartMs, EndMs: source.EndMs}
	edits, err := ValidateMediaAnalysisEdits(source, "subject_track", edits)
	if err != nil || len(edits.Tracking) < 2 {
		return result, fmt.Errorf("请先核对并保存主体跟踪")
	}
	var measured MediaAnalysisMeasurement
	if json.Unmarshal(evidence, &measured) != nil {
		return result, ErrMediaAnalysis
	}
	manual := measured.Method == ManualFramingMethod
	first := edits.Tracking[0].Crop
	result.Width, result.Height = first.Width, first.Height
	for _, point := range edits.Tracking {
		if !point.Reviewed || math.Abs(point.Crop.Width-first.Width) > 0.0000001 || math.Abs(point.Crop.Height-first.Height) > 0.0000001 {
			return result, fmt.Errorf("请核对全部跟踪点，并保持构图框宽高一致；仅位置可随时间变化")
		}
		if manual {
			if !point.Manual {
				return result, fmt.Errorf("请先核对手工构图位置")
			}
			result.Keys = append(result.Keys, ReframeKey{point.TimeMs, point.Crop.X, point.Crop.Y})
			continue
		}
		var index int
		if _, err := fmt.Sscanf(point.ID, "point:%d", &index); err != nil || index < 0 || index >= len(measured.Points) {
			return result, fmt.Errorf("跟踪点没有对应的原始测量")
		}
		original := measured.Points[index]
		if (original.ReviewRequired || original.Confidence < 0.65) && !point.Manual {
			return result, fmt.Errorf("丢失或遮挡区间需要人工修正构图，不能只勾选通过")
		}
		result.Keys = append(result.Keys, ReframeKey{point.TimeMs, point.Crop.X, point.Crop.Y})
	}
	result.Keys = compactReframeKeys(result.Keys, source.Width, source.Height)
	if !result.Valid() {
		return result, fmt.Errorf("构图轨迹须覆盖完整源区间，简化后不能超过128个关键点；可拆分分析区间")
	}
	return result, nil
}

type MediaAnalysisReframePlan struct {
	Timeline     json.RawMessage `json:"timeline"`
	SourceClipID string          `json:"sourceClipId"`
	Reframe      TimelineReframe `json:"reframe"`
	Replaced     bool            `json:"replaced"`
	Warnings     []string        `json:"warnings"`
}

func BuildMediaAnalysisReframePlan(raw json.RawMessage, analysisID, revisionID, clipID string, source MediaAnalysisSource, edits MediaAnalysisEdits, evidence json.RawMessage) (MediaAnalysisReframePlan, error) {
	result := MediaAnalysisReframePlan{SourceClipID: clipID, Warnings: []string{"仅采用到这个片段。构图框之外的画面将被裁去；其他片段、声音和字幕保留。", "请检查主体是否被裁切。构图画幅与项目画幅不同时，导出按项目画幅补黑边。"}}
	reframe, err := BuildTimelineReframe(analysisID, revisionID, source, edits, evidence)
	if err != nil {
		return result, err
	}
	clean, err := ValidateTimelineDocument(raw)
	if err != nil {
		return result, err
	}
	var document map[string]any
	decoder := json.NewDecoder(strings.NewReader(string(clean)))
	decoder.UseNumber()
	_ = decoder.Decode(&document)
	for _, raw := range document["clips"].([]any) {
		clip := objectValue(raw)
		if stringValue(clip, "id") != clipID {
			continue
		}
		for _, rawTrack := range document["tracks"].([]any) {
			track := objectValue(rawTrack)
			if stringValue(track, "id") == stringValue(clip, "trackId") && track["locked"] == true {
				return result, fmt.Errorf("目标轨道已锁定")
			}
		}
		result.Replaced = clip["reframe"] != nil
		clip["reframe"] = reframe
		encoded, _ := json.Marshal(document)
		result.Timeline, err = ValidateTimelineDocument(encoded)
		result.Reframe = reframe
		return result, err
	}
	return result, fmt.Errorf("目标片段已删除，请重新选择")
}
