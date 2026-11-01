package app

import (
	"fmt"
	"strings"
	"yingce/backend/internal/production"
)

type timelineRenderFormat = production.TimelineOutput

func validateTimelineOutput(format timelineRenderFormat) error {
	return production.ValidateTimelineOutput(format)
}

func timelineOutputFormat(aspectRatio string) (timelineRenderFormat, error) {
	ratio := strings.TrimSpace(aspectRatio)
	if ratio == "" {
		ratio = "16:9"
	}
	sizes := map[string][2]int{
		"16:9": {1920, 1080}, "9:16": {1080, 1920}, "1:1": {1080, 1080},
		"4:3": {1440, 1080}, "3:4": {1080, 1440}, "3:2": {1620, 1080},
		"2:3": {1080, 1620}, "21:9": {2520, 1080}, "9:21": {1080, 2520},
	}
	size, ok := sizes[ratio]
	if !ok {
		return timelineRenderFormat{}, fmt.Errorf("暂不支持导出画幅 %s，请在项目设置中选择常用画幅", ratio)
	}
	return timelineRenderFormat{Width: size[0], Height: size[1], FPS: 30}, nil
}

func (plan renderPlan) outputFormat() timelineRenderFormat {
	if plan.Output.Width == 0 {
		if plan.Width >= 16 && plan.Height >= 16 && plan.Width <= 4096 && plan.Height <= 4096 {
			return timelineRenderFormat{Width: plan.Width &^ 1, Height: plan.Height &^ 1, FPS: renderFPS, Fit: plan.Fit}
		}
		return timelineRenderFormat{Width: renderWidth, Height: renderHeight, FPS: renderFPS}
	}
	return plan.Output
}

func renderCaptionLineUnits(width int) int { return min(76, max(2, int(float64(width)*0.9/22))) }
