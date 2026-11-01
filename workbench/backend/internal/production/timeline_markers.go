package production

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"unicode/utf8"
)

type TimelineMarkerSource struct {
	AnalysisID   string `json:"analysisId"`
	RevisionID   string `json:"revisionId"`
	ItemID       string `json:"itemId"`
	ClipID       string `json:"clipId"`
	OccurrenceID string `json:"occurrenceId"`
	ResourceID   string `json:"resourceId"`
	SourceTimeMs int64  `json:"sourceTimeMs"`
}

type TimelineProductionMarker struct {
	ID     string                `json:"id"`
	TimeMs int64                 `json:"timeMs"`
	Label  string                `json:"label"`
	Kind   string                `json:"kind"`
	Source *TimelineMarkerSource `json:"source,omitempty"`
}

// Anchors use source time, so moving, trimming and retiming an occurrence do
// not leave analysis labels at an unrelated frame. Removed source ranges lose
// their markers; the editor history retains them for undo.
func reconcileTimelineMarkers(document map[string]any, clips []any) error {
	value, exists := document["productionMarkers"]
	if !exists {
		return nil
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		return ErrTimelineDocument
	}
	var markers []TimelineProductionMarker
	if json.Unmarshal(encoded, &markers) != nil || markers == nil || len(markers) > 4000 {
		return ErrTimelineDocument
	}
	seen := map[string]bool{}
	kept := make([]TimelineProductionMarker, 0, len(markers))
	for _, marker := range markers {
		if !markerText(marker.ID, 128) || seen[marker.ID] || !utf8.ValidString(marker.Label) || utf8.RuneCountInString(marker.Label) > 160 || (marker.Kind != "cut" && marker.Kind != "beat" && marker.Kind != "note") || marker.TimeMs < 0 || marker.TimeMs > 86400000 {
			return ErrTimelineDocument
		}
		seen[marker.ID] = true
		if marker.Source == nil {
			if marker.Kind != "note" {
				return ErrTimelineDocument
			}
			kept = append(kept, marker)
			continue
		}
		source := marker.Source
		if !markerText(source.AnalysisID, 80) || !markerText(source.RevisionID, 80) || !markerText(source.ItemID, 128) || !markerText(source.ClipID, 128) || !markerText(source.OccurrenceID, 128) || !markerText(source.ResourceID, 80) || source.SourceTimeMs < 0 || source.SourceTimeMs > 86400000 {
			return ErrTimelineDocument
		}
		var matched map[string]any
		for _, raw := range clips {
			clip := objectValue(raw)
			occurrence := stringValue(clip, "analysisOccurrenceId")
			if occurrence == "" {
				occurrence = stringValue(clip, "id")
			}
			sourceMatches := stringValue(objectValue(clip["directMedia"]), "storageKey") == "resource:"+source.ResourceID
			for _, alias := range VideoReworkClockAliases(clip) {
				sourceMatches = sourceMatches || alias == source.ResourceID
			}
			if occurrence != source.OccurrenceID || !sourceMatches {
				continue
			}
			rate, valid := TimelinePlaybackRate(clip)
			if !valid {
				return ErrTimelineDocument
			}
			start := cutTime(clip, "sourceStartMs")
			if source.SourceTimeMs < start || source.SourceTimeMs >= start+sourceOffset(cutTime(clip, "durationMs"), rate) {
				continue
			}
			if matched != nil {
				return ErrTimelineDocument
			}
			matched = clip
		}
		if matched == nil {
			continue
		}
		rate, _ := TimelinePlaybackRate(matched)
		source.ClipID = stringValue(matched, "id")
		marker.TimeMs = cutTime(matched, "startMs") + min(cutTime(matched, "durationMs")-1, programOffset(source.SourceTimeMs-cutTime(matched, "sourceStartMs"), rate))
		kept = append(kept, marker)
	}
	document["productionMarkers"] = kept
	return nil
}

func markerText(value string, max int) bool {
	return value != "" && len(value) <= max && utf8.ValidString(value) && !strings.ContainsAny(value, "\x00\r\n")
}

type MediaAnalysisMarkerPlan struct {
	Timeline     json.RawMessage            `json:"timeline"`
	Added        []TimelineProductionMarker `json:"added"`
	RemovedIDs   []string                   `json:"removedIds"`
	SourceClipID string                     `json:"sourceClipId"`
	Warnings     []string                   `json:"warnings"`
}

// Only explicitly approved edits become program markers. Evidence is never
// rewritten and other occurrences of the same media remain independent.
func BuildMediaAnalysisMarkerPlan(raw json.RawMessage, analysisID, revisionID, clipID, kind string, source MediaAnalysisSource, edits MediaAnalysisEdits) (MediaAnalysisMarkerPlan, error) {
	plan := MediaAnalysisMarkerPlan{Added: []TimelineProductionMarker{}, RemovedIDs: []string{}, SourceClipID: clipID, Warnings: []string{}}
	fail := func(message string) (MediaAnalysisMarkerPlan, error) {
		return plan, fmt.Errorf("%w: %s", ErrMediaAnalysis, message)
	}
	if !markerText(analysisID, 80) || !markerText(revisionID, 80) || !markerText(clipID, 128) {
		return fail("分析或片段编号无效")
	}
	edits, err := ValidateMediaAnalysisEdits(source, kind, edits)
	if err != nil || kind == "subject_track" {
		return fail("请先核对并保存分段或节拍；主体跟踪须采用构图方案")
	}
	clean, err := ValidateTimelineDocument(raw)
	if err != nil {
		return fail("时间线无效")
	}
	var document map[string]any
	decoder := json.NewDecoder(strings.NewReader(string(clean)))
	decoder.UseNumber()
	_ = decoder.Decode(&document)
	clips := document["clips"].([]any)
	var target map[string]any
	for _, raw := range clips {
		clip := objectValue(raw)
		if stringValue(clip, "id") == clipID {
			target = clip
			break
		}
	}
	if target == nil || stringValue(objectValue(target["directMedia"]), "storageKey") != "resource:"+source.ResourceID {
		return fail("目标片段已删除或更换素材，请重新选择")
	}
	for _, raw := range document["tracks"].([]any) {
		track := objectValue(raw)
		if stringValue(track, "id") == stringValue(target, "trackId") && track["locked"] == true {
			return fail("目标轨道已锁定，请先解锁")
		}
	}
	occurrence := stringValue(target, "analysisOccurrenceId")
	if occurrence == "" {
		occurrence = clipID
		target["analysisOccurrenceId"] = occurrence
	}
	rate, _ := TimelinePlaybackRate(target)
	start := cutTime(target, "sourceStartMs")
	end := start + sourceOffset(cutTime(target, "durationMs"), rate)
	add := func(id, label, markerKind string, timeMs int64) {
		if timeMs < start || timeMs >= end {
			return
		}
		digest := sha256.Sum256([]byte(analysisID + "\x00" + revisionID + "\x00" + occurrence + "\x00" + id))
		plan.Added = append(plan.Added, TimelineProductionMarker{ID: "analysis_" + hex.EncodeToString(digest[:20]), Label: label, Kind: markerKind, Source: &TimelineMarkerSource{AnalysisID: analysisID, RevisionID: revisionID, ItemID: id, ClipID: clipID, OccurrenceID: occurrence, ResourceID: source.ResourceID, SourceTimeMs: timeMs}})
	}
	for _, section := range edits.Sections {
		if section.Approved {
			add(section.ID, section.Title, "cut", section.StartMs)
		}
	}
	for index, beat := range edits.Beats {
		if beat.Approved {
			add(beat.ID, fmt.Sprintf("节拍 %d", index+1), "beat", beat.TimeMs)
		}
	}
	if len(plan.Added) == 0 {
		return fail("当前片段范围内没有已核对的标记，请先勾选并保存")
	}
	var existing []TimelineProductionMarker
	encoded, _ := json.Marshal(document["productionMarkers"])
	_ = json.Unmarshal(encoded, &existing)
	markers := []TimelineProductionMarker{}
	for _, marker := range existing {
		if marker.Source != nil && marker.Source.AnalysisID == analysisID && marker.Source.OccurrenceID == occurrence {
			plan.RemovedIDs = append(plan.RemovedIDs, marker.ID)
		} else {
			markers = append(markers, marker)
		}
	}
	document["productionMarkers"] = append(markers, plan.Added...)
	if reconcileTimelineMarkers(document, clips) != nil {
		return fail("标记位置或片段实例冲突，请先检查时间线")
	}
	encoded, _ = json.Marshal(document)
	plan.Timeline, err = ValidateTimelineDocument(encoded)
	if err != nil {
		return fail("标记超过时间线容量，未修改剪辑")
	}
	var after struct {
		Markers []TimelineProductionMarker `json:"productionMarkers"`
	}
	_ = json.Unmarshal(plan.Timeline, &after)
	byID := map[string]TimelineProductionMarker{}
	for _, marker := range after.Markers {
		byID[marker.ID] = marker
	}
	for i := range plan.Added {
		plan.Added[i] = byID[plan.Added[i].ID]
	}
	plan.Warnings = append(plan.Warnings, "仅添加参考标记，不自动删除画面或改写声音；片段移动、裁剪和变速时标记跟随来源。")
	return plan, nil
}
