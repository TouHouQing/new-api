package app

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
)

func (plan renderPlan) size() (int, int) { f := plan.outputFormat(); return f.Width, f.Height }

const (
	renderFitAuto = "auto"
	renderFitPad  = "pad"
	renderFitCrop = "crop"
	// renderCropAspectTolerance：来源与输出宽高比的相对差 |srcW/srcH ÷ dstW/dstH − 1| 不超过 3% 时裁切铺满，
	// 只裁掉极窄的边（768×1344 → 1080×1920 约裁 1.6%）；超过时留边，避免裁掉主体。前端预览按同一规则。
	renderCropAspectTolerance = 0.03
)

func normalizeRenderFit(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case renderFitPad:
		return renderFitPad
	case renderFitCrop:
		return renderFitCrop
	default:
		return renderFitAuto
	}
}

// renderSegmentFit 决定片段画面如何适配输出画幅：pad/crop 为调用方强制；auto 按宽高比相对差选择，
// 来源尺寸未知（含黑场段）一律留边。
func renderSegmentFit(mode string, source *renderSource, width int, height int) string {
	switch mode {
	case renderFitPad, renderFitCrop:
		return mode
	}
	if source == nil || source.Width <= 0 || source.Height <= 0 || width <= 0 || height <= 0 {
		return renderFitPad
	}
	ratio := (float64(source.Width) / float64(source.Height)) / (float64(width) / float64(height))
	if math.Abs(ratio-1) <= renderCropAspectTolerance {
		return renderFitCrop
	}
	return renderFitPad
}

// renderFitFilter 返回缩放到输出画幅的滤镜：crop 先等比放大到覆盖画幅再居中裁切，pad 等比缩小后居中补黑边。
func renderFitFilter(fit string, width int, height int) string {
	if fit == renderFitCrop {
		return fmt.Sprintf("scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d", width, height, width, height)
	}
	return fmt.Sprintf("scale=%d:%d:force_original_aspect_ratio=decrease,pad=%d:%d:(ow-iw)/2:(oh-ih)/2", width, height, width, height)
}

// renderSourceRecord 是成片结果里逐片段的来源记录：画面适配方式与来源文件原有的 AIGC 标识（如有）。
type renderSourceRecord struct {
	ClipID     string `json:"clipId"`
	ResourceID string `json:"resourceId"`
	Kind       string `json:"kind"`
	Width      int    `json:"width,omitempty"`
	Height     int    `json:"height,omitempty"`
	// Fit 是该画面片段实际采用的适配方式；音频片段为空。
	Fit  string `json:"fit,omitempty"`
	AIGC string `json:"aigc,omitempty"`
}

// renderSourceRecords 按成片顺序列出画面片段与音频轨片段的来源。
func renderSourceRecords(plan renderPlan) []renderSourceRecord {
	width, height := plan.size()
	records := make([]renderSourceRecord, 0, len(plan.Segments)+len(plan.Audio))
	for _, seg := range plan.Segments {
		if seg.Source == nil {
			continue
		}
		records = append(records, renderSourceRecord{
			ClipID: seg.Clip.ID, ResourceID: seg.Source.ResourceID, Kind: seg.Kind,
			Width: seg.Source.Width, Height: seg.Source.Height,
			Fit: renderSegmentFit(plan.Fit, seg.Source, width, height), AIGC: seg.Source.AIGC,
		})
	}
	for _, overlay := range plan.Audio {
		if overlay.Source == nil {
			continue
		}
		records = append(records, renderSourceRecord{ClipID: overlay.Clip.ID, ResourceID: overlay.Source.ResourceID, Kind: overlay.Kind, AIGC: overlay.Source.AIGC})
	}
	return records
}

// aigcImplicitLabel 是 GB 45438-2025 文件元数据隐式标识：扩展字段 AIGC 的值为 JSON，字段名按标准取用。
type aigcImplicitLabel struct {
	Label             string `json:"Label"`
	ContentProducer   string `json:"ContentProducer"`
	ProduceID         string `json:"ProduceID"`
	ReservedCode1     string `json:"ReservedCode1"`
	ContentPropagator string `json:"ContentPropagator"`
	PropagateID       string `json:"PropagateID"`
	ReservedCode2     string `json:"ReservedCode2"`
}

// AIGCPlatformPropagator 是写入成片 AIGC 标识的传播服务提供者（ContentPropagator）。
// "yingce" 只是默认占位：部署方必须替换为自己登记的服务提供者名称或编码。
const AIGCPlatformPropagator = "yingce"

const (
	// aigcLabelGenerated 是 Label 取值“1：属于人工智能生成合成内容”。
	aigcLabelGenerated = "1"
	// renderAIGCComment 写入容器 comment，供不解析 AIGC 字段的播放器与平台识别。
	renderAIGCComment = "AI生成合成内容"
	// aigcFieldMaxRunes 限制从来源文件转写的字段长度，来源元数据不可信。
	aigcFieldMaxRunes = 256
)

// renderAIGCLabel 汇总成片的 AIGC 隐式标识：Label 取第一个带标识来源的 Label；平台合成的成片本身就是
// AI 生成合成内容，没有来源标识（或来源未写 Label）时取 "1"。ContentProducer/ProduceID 取第一个写了它们的来源；
// 传播方为本平台，传播编号为渲染任务 ID。ReservedCode 属于各自写入方的校验位，重新编码后不再适用，留空。
func renderAIGCLabel(plan renderPlan) aigcImplicitLabel {
	label := aigcImplicitLabel{ContentPropagator: AIGCPlatformPropagator, PropagateID: plan.PropagateID}
	sources := make([]*renderSource, 0, len(plan.Segments)+len(plan.Audio))
	for _, seg := range plan.Segments {
		sources = append(sources, seg.Source)
	}
	for _, overlay := range plan.Audio {
		sources = append(sources, overlay.Source)
	}
	for _, source := range sources {
		if source == nil {
			continue
		}
		fields, ok := parseAIGCTag(source.AIGC)
		if !ok {
			continue
		}
		if label.Label == "" {
			label.Label = aigcField(fields, "Label")
		}
		if label.ContentProducer == "" && label.ProduceID == "" {
			label.ContentProducer, label.ProduceID = aigcField(fields, "ContentProducer"), aigcField(fields, "ProduceID")
		}
	}
	if label.Label == "" {
		label.Label = aigcLabelGenerated
	}
	return label
}

func renderAIGCJSON(plan renderPlan) string {
	encoded, err := json.Marshal(renderAIGCLabel(plan))
	if err != nil {
		return ""
	}
	return string(encoded)
}

// parseAIGCTag 解析来源文件的 AIGC 标签；不是 JSON 对象时视为没有标识。
func parseAIGCTag(raw string) (map[string]any, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, false
	}
	var fields map[string]any
	if err := json.Unmarshal([]byte(raw), &fields); err != nil || fields == nil {
		return nil, false
	}
	return fields, true
}

// aigcField 按字段名（大小写不敏感）读取字符串或数字值，截断到 aigcFieldMaxRunes。
func aigcField(fields map[string]any, key string) string {
	value, ok := fields[key]
	if !ok {
		for name, candidate := range fields {
			if strings.EqualFold(name, key) {
				value, ok = candidate, true
				break
			}
		}
	}
	if !ok {
		return ""
	}
	switch typed := value.(type) {
	case string:
		return truncateRunes(strings.TrimSpace(typed), aigcFieldMaxRunes)
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	default:
		return ""
	}
}
