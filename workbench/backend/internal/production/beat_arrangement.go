package production

import (
	"bytes"
	"encoding/json"
	"math"
	"sort"
)

// The app resolves this only from an owned, persisted analysis revision.
type BeatArrangementSource struct {
	Source   MediaAnalysisSource
	Document MediaAnalysisEdits
}
type BeatArrangementClip struct {
	ClipID  string `json:"clipId"`
	StartMs int64  `json:"startMs"`
	EndMs   int64  `json:"endMs"`
}
type BeatArrangementPlan struct {
	Timeline   json.RawMessage            `json:"timeline"`
	Clips      []BeatArrangementClip      `json:"clips"`
	Boundaries []TimelineProductionMarker `json:"boundaries"`
}

// Dynamic programming selects only actual approved beats. The monotonic queue
// keeps each stage linear in the number of measured beats (at most 2000).
func beatBoundaries(points []int64, capacities []int64) ([]int64, bool) {
	count, width := len(capacities), len(points)
	previous := make([]float64, width)
	for i := range previous {
		previous[i] = math.Inf(1)
	}
	previous[0] = 0
	parents := make([][]int, count+1)
	for stage := 1; stage <= count; stage++ {
		next := make([]float64, width)
		parents[stage] = make([]int, width)
		for i := range next {
			next[i] = math.Inf(1)
			parents[stage][i] = -1
		}
		queue := []int{}
		head, candidate := 0, 0
		for end := 1; end < width; end++ {
			for candidate < end && points[candidate] <= points[end]-250 {
				if !math.IsInf(previous[candidate], 1) {
					for len(queue) > head && previous[queue[len(queue)-1]] > previous[candidate] {
						queue = queue[:len(queue)-1]
					}
					queue = append(queue, candidate)
				}
				candidate++
			}
			for head < len(queue) && points[queue[head]] < points[end]-capacities[stage-1] {
				head++
			}
			if head == len(queue) || stage < count && end == width-1 || stage == count && end != width-1 {
				continue
			}
			best := queue[head]
			target := float64(points[0]) + float64(points[width-1]-points[0])*float64(stage)/float64(count)
			next[end] = previous[best] + math.Abs(float64(points[end])-target)
			parents[stage][end] = best
		}
		previous = next
	}
	if math.IsInf(previous[width-1], 1) {
		return nil, false
	}
	result := make([]int64, count+1)
	end := width - 1
	for stage := count; stage > 0; stage-- {
		result[stage] = points[end]
		end = parents[stage][end]
		if end < 0 {
			return nil, false
		}
	}
	result[0] = points[end]
	return result, true
}

func PlanBeatArrangement(raw json.RawMessage, analysisID, revisionID, musicClipID string, clipIDs []string, measured BeatArrangementSource) (BeatArrangementPlan, error) {
	var plan BeatArrangementPlan
	fail := func(message string) (BeatArrangementPlan, error) { return plan, audioLinkError(message) }
	if len(clipIDs) < 2 || len(clipIDs) > 128 {
		return fail("请选择2至128个画面片段，并明确镜头顺序")
	}
	markers, err := BuildMediaAnalysisMarkerPlan(raw, analysisID, revisionID, musicClipID, "audio_structure", measured.Source, measured.Document)
	if err != nil {
		return plan, err
	}
	var document map[string]any
	decoder := json.NewDecoder(bytes.NewReader(markers.Timeline))
	decoder.UseNumber()
	if err = decoder.Decode(&document); err != nil {
		return plan, err
	}
	clips := map[string]map[string]any{}
	tracks := map[string]map[string]any{}
	for _, row := range listValue(document["clips"]) {
		clip := objectValue(row)
		clips[stringValue(clip, "id")] = clip
	}
	for _, row := range listValue(document["tracks"]) {
		track := objectValue(row)
		tracks[stringValue(track, "id")] = track
	}
	music := clips[musicClipID]
	if music == nil || stringValue(music, "kind") != "audio" || objectValue(music["audioLink"])["sourceClipId"] != nil {
		return fail("请选择独立音乐片段作为节拍来源")
	}
	start, end := cutTime(music, "startMs"), cutTime(music, "startMs")+cutTime(music, "durationMs")
	selected := map[string]bool{}
	capacities := []int64{}
	visualTrack := ""
	for _, id := range clipIDs {
		clip := clips[id]
		kind := stringValue(clip, "kind")
		if selected[id] || clip == nil || kind != "video" && kind != "image" {
			return fail("镜头必须是不同的现有视频或图片片段")
		}
		selected[id] = true
		track := stringValue(clip, "trackId")
		if visualTrack == "" {
			visualTrack = track
		}
		if track != visualTrack || tracks[track]["locked"] == true || clip["muted"] == true {
			return fail("请选择同一条未锁定画面轨道上的可见镜头")
		}
		if clip["transition"] != nil {
			return fail("所选镜头已有转场，请先处理转场，再按节拍排镜头")
		}
		length := cutTime(clip, "durationMs")
		if length < 250 {
			return fail("镜头短于250毫秒，请先调整素材范围")
		}
		capacities = append(capacities, length)
	}
	for id, clip := range clips {
		if !selected[id] && stringValue(clip, "trackId") == visualTrack && cutTime(clip, "startMs") < end && cutTime(clip, "startMs")+cutTime(clip, "durationMs") > start {
			return fail("音乐范围与未选镜头重叠，请先缩短音乐范围或把该镜头加入顺序")
		}
	}
	points := []int64{start}
	provenance := map[int64]TimelineProductionMarker{}
	for _, marker := range markers.Added {
		if marker.Kind == "beat" && marker.TimeMs > start && marker.TimeMs < end {
			if _, exists := provenance[marker.TimeMs]; !exists {
				points = append(points, marker.TimeMs)
				provenance[marker.TimeMs] = marker
			}
		}
	}
	sort.Slice(points, func(i, j int) bool { return points[i] < points[j] })
	points = append(points, end)
	if len(points) < len(clipIDs)+1 {
		return fail("音乐范围内已核对的节拍不足，请核对更多节拍或减少镜头")
	}
	boundaries, ok := beatBoundaries(points, capacities)
	if !ok {
		return fail("真实节拍与可用镜头时长无法覆盖音乐，请调整音乐范围、镜头顺序或素材时长；没有均分或拉伸素材")
	}
	for i, id := range clipIDs {
		position, length := boundaries[i], boundaries[i+1]-boundaries[i]
		document, err = applyTimelineEdit(document, TimelineEditCommand{Op: "trimClip", ID: id, StartMs: &position, DurationMs: &length})
		if err != nil {
			return plan, err
		}
		plan.Clips = append(plan.Clips, BeatArrangementClip{ClipID: id, StartMs: position, EndMs: position + length})
		if i > 0 {
			plan.Boundaries = append(plan.Boundaries, provenance[position])
		}
	}
	encoded, _ := json.Marshal(document)
	plan.Timeline, err = ValidateTimelineDocument(encoded)
	return plan, err
}
