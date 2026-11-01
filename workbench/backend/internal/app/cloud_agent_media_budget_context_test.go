package app

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestCloudAgentMediaBudgetProjectionKeepsCompletedWorkAndNoSecondGenerationTool(t *testing.T) {
	state := cloudAgentRuntime{Request: agentTestRequest(), Generations: 1}
	state.Request.PermissionMode = "request_approval"
	state.Request.Budget.MaxGenerationTasks = 1
	state.Canonical = canonicalAgentRequest{Tools: cloudAgentTools(state.Request), Messages: []map[string]any{{"role": "user", "content": "只生成一张候选"}}}
	before, _ := json.Marshal(state)
	projection := state.Canonical
	cloudAgentApplyMediaBudgetContext(&projection, &state)
	names := map[string]bool{}
	for _, tool := range projection.Tools {
		fn, _ := tool["function"].(map[string]any)
		names[stringValue(fn["name"])] = true
	}
	if names["generate_media"] || names["image_layer_split"] || names["image_layer_plan"] || !names["task_get"] || !names["canvas_get_state"] {
		t.Fatalf("exhausted generation scope: %v", names)
	}
	last := projection.Messages[len(projection.Messages)-1]
	var observation map[string]any
	if err := json.Unmarshal([]byte(strings.TrimPrefix(stringField(last, "content"), cloudAgentMediaBudgetMarker)), &observation); err != nil || observation["remaining"] != float64(0) || observation["submitted"] != float64(1) {
		t.Fatalf("missing current budget: %v %v", observation, err)
	}
	cloudAgentApplyMediaBudgetContext(&projection, &state)
	if len(projection.Messages) != 2 {
		t.Fatal("budget context accumulated on repeated projection")
	}
	after, _ := json.Marshal(state)
	if string(after) != string(before) {
		t.Fatal("projection changed durable permissions, tool catalogue or transcript")
	}
	if err := validateCloudAgentMediaBudget(cloudAgentMediaArgs{Mode: "image"}, &state); err == nil {
		t.Fatal("stale runtime tool call bypassed real admission")
	}
}

func TestCloudAgentMediaBudgetProjectionRetainsAvailableAndUnlimitedGeneration(t *testing.T) {
	for _, limit := range []int{0, 2} {
		state := cloudAgentRuntime{Request: agentTestRequest(), Generations: 1}
		state.Request.PermissionMode = "request_approval"
		state.Request.Budget.MaxGenerationTasks = limit
		projection := canonicalAgentRequest{Tools: cloudAgentTools(state.Request)}
		count := len(projection.Tools)
		cloudAgentApplyMediaBudgetContext(&projection, &state)
		if len(projection.Tools) != count || (limit == 0 && len(projection.Messages) != 0) || (limit == 2 && len(projection.Messages) != 1) {
			t.Fatalf("available generation scope changed: limit=%d", limit)
		}
	}
}
