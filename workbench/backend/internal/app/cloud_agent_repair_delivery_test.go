package app

import (
	"encoding/json"
	"testing"
)

func TestCloudAgentPendingRepairDeliverySurvivesSettledSnapshotButNotNewResponse(t *testing.T) {
	for _, reason := range []string{"tool_repair_incomplete", "approval_not_requested"} {
		state := cloudAgentRuntime{PiResumePrompt: "bounded native correction", PiAssistantResponses: 2, Events: []CloudAgentEvent{}}
		state.event("run", "assistant_message", map[string]any{"text": "previous final reply"})
		state.event("run", "tool_repair_continuation", cloudAgentRepairContinuationPayload(&state, "repair", reason))
		raw, _ := json.Marshal(state)
		var restored cloudAgentRuntime
		if err := json.Unmarshal(raw, &restored); err != nil {
			t.Fatal(err)
		}
		if known, pending := cloudAgentPiRepairResumeState(&restored); !known || !pending || !cloudAgentPiMayResumeSettledSnapshot(&restored) {
			t.Fatal("durable new correction was discarded")
		}
		restored.PiAssistantResponses++
		if _, pending := cloudAgentPiRepairResumeState(&restored); pending || cloudAgentPiMayResumeSettledSnapshot(&restored) {
			t.Fatal("consumed correction could repeat a model call")
		}
		restored.PiAssistantResponses--
		restored.event("run", "tool_completed", map[string]any{"toolName": "image_process"})
		if known, pending := cloudAgentPiRepairResumeState(&restored); !known || pending {
			t.Fatal("tool receipt did not prove correction consumption")
		}
		restored.PiResumePrompt = "unrelated stale prompt"
		if known, pending := cloudAgentPiRepairResumeState(&restored); known || pending {
			t.Fatal("unmatched prompt borrowed another correction receipt")
		}
	}
}
