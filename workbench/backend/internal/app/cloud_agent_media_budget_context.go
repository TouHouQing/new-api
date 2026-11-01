package app

import (
	"encoding/json"
	"strings"
)

const cloudAgentMediaBudgetMarker = "[当前媒体生成预算]"

// This is a request projection. The durable tool catalogue and admission checks
// retain their authority, including when a runtime replays an old tool call.
func cloudAgentApplyMediaBudgetContext(canonical *canonicalAgentRequest, state *cloudAgentRuntime) {
	if canonical == nil || state == nil || state.Request.PermissionMode == "read_only" {
		return
	}
	limit := state.Request.Budget.MaxGenerationTasks
	if limit <= 0 {
		return
	}
	remaining := max(0, limit-state.Generations)
	if remaining == 0 {
		tools := make([]map[string]any, 0, len(canonical.Tools))
		for _, tool := range canonical.Tools {
			fn, _ := tool["function"].(map[string]any)
			name := stringValue(fn["name"])
			if name != "generate_media" && name != "image_layer_split" && name != "image_layer_plan" {
				tools = append(tools, tool)
			}
		}
		canonical.Tools = tools
	}
	observation := map[string]any{
		"source": "durable_run_checkpoint", "submitted": state.Generations,
		"limit": limit, "remaining": remaining,
		"instruction": "只提交用户要求且仍在本轮预算内的生成；已经提交或成功的任务不要重新生成。",
	}
	if remaining == 0 {
		observation["instruction"] = "本轮生成次数已用尽。不要再次调用 generate_media、image_layer_split 或 image_layer_plan。保留已提交任务与结果；需要核对时使用 task_get、task_history 或 canvas_get_state，最后如实说明已有结果和未完成部分。任务成功不等于视觉质量合格。"
	}
	body, _ := json.Marshal(observation)
	messages := make([]map[string]any, 0, len(canonical.Messages)+1)
	for _, message := range canonical.Messages {
		if stringField(message, "role") == "user" && strings.HasPrefix(stringField(message, "content"), cloudAgentMediaBudgetMarker) {
			continue
		}
		messages = append(messages, message)
	}
	canonical.Messages = append(messages, map[string]any{"role": "user", "content": cloudAgentMediaBudgetMarker + string(body), cloudAgentContextSourceKey: "runtime"})
}
