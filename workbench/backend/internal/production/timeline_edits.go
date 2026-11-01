package production

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
)

type TimelineEditCommand struct {
	AnalysisID          string                  `json:"analysisId,omitempty"`
	AnalysisRevisionID  string                  `json:"analysisRevisionId,omitempty"`
	ClipIDs             []string                `json:"clipIds,omitempty"`
	Beats               *BeatArrangementSource  `json:"-"`
	RepairTaskID        string                  `json:"repairTaskId,omitempty"`
	ExpectedClipSHA256  string                  `json:"expectedClipSha256,omitempty"`
	Repair              *VideoReworkApplication `json:"-"`
	RepairRestoration   *VideoReworkRestoration `json:"-"`
	Graphic             *MotionGraphic          `json:"graphic,omitempty"`
	Restart             *bool                   `json:"restart,omitempty"`
	Output              *TimelineOutput         `json:"output,omitempty"`
	Op                  string                  `json:"op"`
	ID                  string                  `json:"id,omitempty"`
	ResourceID          string                  `json:"resourceId,omitempty"`
	CanvasID            string                  `json:"canvasId,omitempty"`
	NodeID              string                  `json:"nodeId,omitempty"`
	CanvasRevision      *int64                  `json:"canvasRevision,omitempty"`
	NodeSHA256          string                  `json:"nodeSha256,omitempty"`
	TrackID             string                  `json:"trackId,omitempty"`
	StartMs             *int64                  `json:"startMs,omitempty"`
	DurationMs          *int64                  `json:"durationMs,omitempty"`
	SourceStartMs       *int64                  `json:"sourceStartMs,omitempty"`
	SplitAtMs           *int64                  `json:"splitAtMs,omitempty"`
	PlaybackRate        *float64                `json:"playbackRate,omitempty"`
	SourceClipID        string                  `json:"sourceClipId,omitempty"`
	Mode                string                  `json:"mode,omitempty"`
	CaptionPresentation *CaptionPresentation    `json:"captionPresentation,omitempty"`
	Text                *string                 `json:"text,omitempty"`
	Media               *TimelineEditMedia      `json:"-"`
}

// ApplyTimelineEdits is a deterministic, side-effect-free preview. Ownership,
// current revision, persisted receipt and storage admission belong to app/repo.
func ApplyTimelineEdits(raw json.RawMessage, commands []TimelineEditCommand) (json.RawMessage, error) {
	if len(commands) < 1 || len(commands) > 8 {
		return nil, audioLinkError("每次编辑需要1到8个明确动作")
	}
	clean, err := ValidateTimelineDocument(raw)
	if err != nil {
		return nil, err
	}
	for index, command := range commands {
		var before map[string]any
		decoder := json.NewDecoder(bytes.NewReader(clean))
		decoder.UseNumber()
		if err := decoder.Decode(&before); err != nil {
			return nil, err
		}
		after, err := applyTimelineEdit(before, command)
		if err != nil {
			return nil, fmt.Errorf("第%d个动作：%w", index+1, err)
		}
		encoded, err := json.Marshal(after)
		if err != nil {
			return nil, err
		}
		clean, err = ValidateTimelineDocument(encoded)
		if err != nil {
			return nil, fmt.Errorf("第%d个动作的时间或关联关系无效：%w", index+1, err)
		}
	}
	return clean, nil
}

func applyTimelineEdit(before map[string]any, command TimelineEditCommand) (map[string]any, error) {
	if command.Op == "arrangeToBeats" {
		wanted := TimelineEditCommand{Op: command.Op, AnalysisID: command.AnalysisID, AnalysisRevisionID: command.AnalysisRevisionID, SourceClipID: command.SourceClipID, ClipIDs: command.ClipIDs}
		left, _ := json.Marshal(command)
		right, _ := json.Marshal(wanted)
		if !bytes.Equal(left, right) || command.Beats == nil {
			return nil, audioLinkError("节拍排镜头需要已核对的原生分析与明确片段顺序")
		}
		raw, err := json.Marshal(before)
		if err != nil {
			return nil, err
		}
		plan, err := PlanBeatArrangement(raw, command.AnalysisID, command.AnalysisRevisionID, command.SourceClipID, command.ClipIDs, *command.Beats)
		if err != nil {
			return nil, err
		}
		decoder := json.NewDecoder(bytes.NewReader(plan.Timeline))
		decoder.UseNumber()
		var after map[string]any
		err = decoder.Decode(&after)
		return after, err
	}
	if command.Beats != nil || command.AnalysisID != "" || command.AnalysisRevisionID != "" || len(command.ClipIDs) > 0 {
		return nil, audioLinkError("这个动作不接受节拍分析参数")
	}
	if command.Op == "applyVideoRepair" || command.Op == "removeVideoRepair" {
		check := command
		check.Repair = nil
		wanted := TimelineEditCommand{Op: command.Op, ID: command.ID, RepairTaskID: command.RepairTaskID}
		if command.Op == "removeVideoRepair" {
			wanted.ExpectedClipSHA256 = command.ExpectedClipSHA256
		}
		left, _ := json.Marshal(check)
		right, _ := json.Marshal(wanted)
		if !bytes.Equal(left, right) {
			return nil, ErrVideoRework
		}
		raw, err := json.Marshal(before)
		if err != nil {
			return nil, err
		}
		var after json.RawMessage
		if command.Op == "applyVideoRepair" {
			if command.RepairRestoration != nil || command.Repair == nil || command.Repair.Plan.Request.ClipID != command.ID {
				return nil, ErrVideoRework
			}
			r := command.Repair
			after, err = ApplyVideoReworkCandidate(raw, r.Plan, r.Derived, r.AssetVersionID, command.RepairTaskID, r.Reframe)
		} else {
			if command.Repair != nil {
				return nil, ErrVideoRework
			}
			if command.RepairRestoration != nil {
				after, err = RestoreWholeSourceVideoRework(raw, command.ID, command.RepairTaskID, command.ExpectedClipSHA256, *command.RepairRestoration)
			} else {
				after, err = RemoveVideoReworkCandidate(raw, command.ID, command.RepairTaskID, command.ExpectedClipSHA256)
			}
		}
		if err != nil {
			return nil, err
		}
		return videoReworkDocument(after)
	}
	if command.RepairRestoration != nil || command.Repair != nil || command.RepairTaskID != "" || command.ExpectedClipSHA256 != "" {
		return nil, ErrVideoRework
	}
	if command.Graphic != nil && command.Op != "addGraphic" && command.Op != "setGraphic" || command.Restart != nil && command.Op != "setGraphic" {
		return nil, audioLinkError("这个动作不接受叠层设置")
	}
	if command.Op == "addGraphic" {
		return addTimelineGraphic(before, command)
	}
	if command.Op == "setOutput" {
		if command.Output == nil {
			return nil, audioLinkError("请提供完整的画面设置")
		}
		check := command
		check.Output = nil
		raw, _ := json.Marshal(check)
		if string(raw) != `{"op":"setOutput"}` {
			return nil, audioLinkError("画面设置动作不接受片段参数")
		}
		if err := ValidateTimelineOutput(*command.Output); err != nil {
			return nil, err
		}
		raw, _ = json.Marshal(command.Output)
		var value map[string]any
		decoder := json.NewDecoder(bytes.NewReader(raw))
		decoder.UseNumber()
		if err := decoder.Decode(&value); err != nil {
			return nil, err
		}
		before["output"] = value
		return before, nil
	}
	if command.Output != nil {
		return nil, audioLinkError("这个动作不接受画面设置")
	}
	if command.Op != "setCaptionPresentation" && command.CaptionPresentation != nil || command.Op != "setCaptionText" && command.Text != nil {
		return nil, audioLinkError("这个动作不接受字幕文字或外观参数")
	}
	if command.Op == "addCanvasNode" {
		return addCanvasNodeTimelineResource(before, command)
	}
	if command.CanvasID != "" || command.NodeID != "" || command.CanvasRevision != nil || command.NodeSHA256 != "" {
		return nil, audioLinkError("这个动作不接受画布快照参数")
	}
	if command.Op == "addResource" {
		return addTimelineEditResource(before, command)
	}
	fail := func(message string) (map[string]any, error) { return nil, audioLinkError(message) }
	if !markerText(command.ID, 128) || command.ResourceID != "" {
		return fail("请选择具体片段实例")
	}
	rows := listValue(before["clips"])
	tracks := map[string]map[string]any{}
	var selected map[string]any
	for _, row := range listValue(before["tracks"]) {
		track := objectValue(row)
		tracks[stringValue(track, "id")] = track
	}
	for _, row := range rows {
		clip := objectValue(row)
		if stringValue(clip, "id") == command.ID {
			selected = clip
			break
		}
	}
	if selected == nil {
		return fail("所选片段不存在，请重新载入剪辑")
	}
	if tracks[stringValue(selected, "trackId")]["locked"] == true {
		return fail("轨道已锁定，请先解锁再编辑")
	}
	changed := copyTimelineClip(selected)
	replacement := []any{changed}
	mapping := map[string][]string{}
	start, length, source, rate := audioValue(selected, "startMs"), audioValue(selected, "durationMs"), audioValue(selected, "sourceStartMs"), audioRate(selected)
	if command.Op != "moveClip" && command.TrackID != "" || command.Op != "moveClip" && command.Op != "trimClip" && command.StartMs != nil || command.Op != "trimClip" && (command.DurationMs != nil || command.SourceStartMs != nil) || command.Op != "splitClip" && command.SplitAtMs != nil || command.Op != "setClipPlaybackRate" && command.PlaybackRate != nil || command.Op != "setAudioLink" && command.Op != "setCaptionLink" && command.SourceClipID != "" || command.Op != "setAudioLink" && command.Mode != "" || command.Op != "setCaptionPresentation" && command.CaptionPresentation != nil || command.Op != "setCaptionText" && command.Text != nil {
		return fail("编辑动作包含不适用的参数，请重新预览")
	}
	switch command.Op {
	case "setGraphic":
		if stringValue(selected, "kind") != "text" || selected["graphic"] == nil || command.Graphic == nil {
			return fail("请选择现有的标题或图形叠层")
		}
		graphic := *command.Graphic
		if command.Restart != nil && *command.Restart {
			graphic.PhaseOffsetMs = 0
			graphic.PhaseDurationMs = int64(length)
			changed["sourceStartMs"] = audioInteger(0)
		}
		if err := ValidateMotionGraphic(graphic); err != nil {
			return nil, err
		}
		value, err := graphicMap(&graphic)
		if err != nil {
			return nil, err
		}
		changed["graphic"] = value
	case "setCaptionPresentation":
		if stringValue(selected, "kind") != "subtitle" && stringValue(selected, "kind") != "text" || command.CaptionPresentation == nil {
			return fail("请选择字幕或文字片段及完整外观")
		}
		if err := ValidateCaptionPresentation(*command.CaptionPresentation, stringValue(selected, "text")); err != nil {
			return nil, err
		}
		encoded, _ := json.Marshal(command.CaptionPresentation)
		var value map[string]any
		decoder := json.NewDecoder(bytes.NewReader(encoded))
		decoder.UseNumber()
		if err := decoder.Decode(&value); err != nil {
			return nil, err
		}
		changed["captionPresentation"] = value
	case "setCaptionText":
		if stringValue(selected, "kind") != "subtitle" && stringValue(selected, "kind") != "text" || command.Text == nil || len([]rune(*command.Text)) > 2000 {
			return fail("请选择字幕或文字片段，并提供最多2000字的台词")
		}
		changed["text"] = *command.Text
		if *command.Text != stringValue(selected, "text") {
			if appearance, ok := changed["captionPresentation"].(map[string]any); ok {
				appearance = copyTimelineClip(appearance)
				delete(appearance, "highlights")
				changed["captionPresentation"] = appearance
			}
		}
	case "setCaptionLink":
		var parent map[string]any
		if command.SourceClipID != "" {
			for _, row := range rows {
				candidate := objectValue(row)
				if stringValue(candidate, "id") == command.SourceClipID {
					parent = candidate
					break
				}
			}
			if parent == nil {
				return fail("字幕来源不存在，请重新选择")
			}
		}
		var err error
		changed, err = setManualCaptionLink(selected, parent)
		if err != nil {
			return nil, err
		}
		replacement = []any{changed}
	case "moveClip":
		if command.StartMs == nil || *command.StartMs < 0 {
			return fail("片段位置必须是非负整数毫秒")
		}
		changed["startMs"] = audioInteger(float64(*command.StartMs))
		if command.TrackID != "" {
			target := tracks[command.TrackID]
			if target == nil {
				return fail("目标轨道不存在")
			}
			if target["locked"] == true {
				return fail("目标轨道已锁定，请先解锁")
			}
			changed["trackId"] = command.TrackID
		}
	case "trimClip":
		if command.StartMs == nil && command.DurationMs == nil && command.SourceStartMs == nil {
			return fail("请指定要裁剪的范围")
		}
		if command.StartMs != nil {
			if *command.StartMs < 0 {
				return fail("片段位置无效")
			}
			changed["startMs"] = audioInteger(float64(*command.StartMs))
		}
		if command.DurationMs != nil {
			if *command.DurationMs <= 0 {
				return fail("片段时长必须大于零")
			}
			changed["durationMs"] = audioInteger(float64(*command.DurationMs))
		}
		if command.SourceStartMs != nil {
			if *command.SourceStartMs < 0 {
				return fail("源素材起点无效")
			}
			changed["sourceStartMs"] = audioInteger(float64(*command.SourceStartMs))
		}
		for _, key := range []string{"fadeInMs", "fadeOutMs"} {
			if _, exists := changed[key]; exists {
				changed[key] = audioInteger(min(audioValue(changed, key), audioValue(changed, "durationMs")))
			}
		}
	case "splitClip":
		if command.SplitAtMs == nil || float64(*command.SplitAtMs) <= start || float64(*command.SplitAtMs) >= start+length {
			return fail("拆分位置必须位于片段内部")
		}
		leftLength := float64(*command.SplitAtMs) - start
		rightLength := length - leftLength
		rightID := fmt.Sprintf("%s:split:%d", command.ID, *command.SplitAtMs)
		if len(rightID) > 128 {
			return fail("拆分编号超出范围，请先保存为独立镜头")
		}
		for _, row := range rows {
			if stringValue(objectValue(row), "id") == rightID {
				return fail("拆分编号冲突，请保留原剪辑并调整位置")
			}
		}
		changed["durationMs"] = audioInteger(leftLength)
		for _, marker := range listValue(before["productionMarkers"]) {
			if stringValue(objectValue(objectValue(marker)["source"]), "clipId") == command.ID && stringValue(changed, "analysisOccurrenceId") == "" {
				changed["analysisOccurrenceId"] = command.ID
				break
			}
		}
		right := copyTimelineClip(changed)
		right["id"] = rightID
		right["startMs"] = audioInteger(float64(*command.SplitAtMs))
		right["durationMs"] = audioInteger(rightLength)
		right["sourceStartMs"] = audioInteger(source + math.Round(leftLength*rate))
		if _, exists := selected["fadeInMs"]; exists {
			changed["fadeInMs"] = audioInteger(min(leftLength, audioValue(selected, "fadeInMs")))
			right["fadeInMs"] = audioInteger(min(rightLength, max(0, audioValue(selected, "fadeInMs")-leftLength)))
		}
		if _, exists := selected["fadeOutMs"]; exists {
			changed["fadeOutMs"] = audioInteger(min(leftLength, max(0, audioValue(selected, "fadeOutMs")-rightLength)))
			right["fadeOutMs"] = audioInteger(min(rightLength, audioValue(selected, "fadeOutMs")))
		}
		replacement = []any{changed, right}
		mapping[command.ID] = []string{command.ID, rightID}
	case "setClipPlaybackRate":
		kind := stringValue(selected, "kind")
		if kind != "video" && kind != "audio" || command.PlaybackRate == nil || math.IsNaN(*command.PlaybackRate) || math.IsInf(*command.PlaybackRate, 0) || *command.PlaybackRate < .25 || *command.PlaybackRate > 4 {
			return fail("请选择音视频片段及0.25到4倍的速度")
		}
		changed["playbackRate"] = json.Number(strconv.FormatFloat(*command.PlaybackRate, 'f', -1, 64))
		changed["durationMs"] = audioInteger(max(1, math.Round(length*rate / *command.PlaybackRate)))
		for _, key := range []string{"fadeInMs", "fadeOutMs"} {
			if _, exists := changed[key]; exists {
				changed[key] = audioInteger(min(audioValue(changed, key), audioValue(changed, "durationMs")))
			}
		}
	case "removeClip":
		replacement = nil
		mapping[command.ID] = []string{}
	case "setAudioLink":
		if stringValue(selected, "kind") != "audio" {
			return fail("请选择声音片段")
		}
		if command.SourceClipID == "" {
			if command.Mode != "" {
				return fail("解除跟随时不需要跟随方式")
			}
			delete(changed, "audioLink")
			break
		}
		var video map[string]any
		for _, row := range rows {
			candidate := objectValue(row)
			if stringValue(candidate, "id") == command.SourceClipID && stringValue(candidate, "kind") == "video" {
				video = candidate
				break
			}
		}
		if video == nil || command.Mode != "source" && command.Mode != "clip" {
			return fail("请选择具体镜头与跟随方式")
		}
		if start < audioValue(video, "startMs") || start+length > audioEnd(video) {
			return fail("跟随声音超出镜头范围，请先裁剪声音或解除跟随")
		}
		anchor := start - audioValue(video, "startMs")
		if command.Mode == "source" {
			anchor = audioValue(video, "sourceStartMs") + anchor*audioRate(video)
		}
		changed["audioLink"] = map[string]any{"sourceClipId": command.SourceClipID, "mode": command.Mode, "anchorMs": audioAnchor(anchor)}
	default:
		return fail("不支持的剪辑动作，请使用明确的移动、裁剪、拆分、变速或声音跟随操作")
	}
	if sourceDuration := audioValue(changed, "sourceDurationMs"); sourceDuration > 0 && (stringValue(changed, "kind") == "video" || stringValue(changed, "kind") == "audio") && audioSourceEnd(changed) > sourceDuration {
		return fail("编辑范围超出源素材，请先缩短片段")
	}
	result := []any{}
	for _, row := range rows {
		if stringValue(objectValue(row), "id") == command.ID {
			result = append(result, replacement...)
		} else {
			result = append(result, row)
		}
	}
	// Keep native transcript-linked subtitle timing aligned with video speed.
	if command.Op == "setClipPlaybackRate" {
		for index, row := range result {
			subtitle := objectValue(row)
			binding := objectValue(subtitle["productionBinding"])
			if stringValue(subtitle, "kind") != "subtitle" || stringValue(binding, "sourceClipId") != command.ID {
				continue
			}
			if tracks[stringValue(subtitle, "trackId")]["locked"] == true {
				return fail("关联字幕轨已锁定，请先解锁")
			}
			offset := max(0, audioValue(subtitle, "startMs")-start)
			finish := max(offset, min(length, audioEnd(subtitle)-start))
			if finish <= offset {
				return fail("关联字幕已移出片段，请先重新对齐字幕")
			}
			nextStart := math.Round(math.Round(offset*rate) / audioRate(changed))
			nextEnd := min(audioValue(changed, "durationMs"), math.Round(math.Round(finish*rate)/audioRate(changed)))
			if nextEnd <= nextStart {
				return fail("变速后字幕过短，请先合并相邻字幕")
			}
			next := copyTimelineClip(subtitle)
			next["startMs"] = audioInteger(start + nextStart)
			next["durationMs"] = audioInteger(nextEnd - nextStart)
			result[index] = next
		}
	}
	after := copyTimelineClip(before)
	after["clips"] = result
	if err := reconcileTimelineAudioLinks(before, after, mapping); err != nil {
		return nil, err
	}
	if err := reconcileTimelineCaptionFollow(before, after, mapping); err != nil {
		return nil, err
	}
	return after, nil
}
