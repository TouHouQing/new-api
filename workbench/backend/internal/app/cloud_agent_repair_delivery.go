package app

// Repair markers share the append-only native journal with model/tool receipts.
// A settled snapshot may predate a newly queued correction; a later response or
// tool receipt proves consumption and must never trigger another model call.
func cloudAgentPiRepairResumeState(state *cloudAgentRuntime) (known, pending bool) {
	if state == nil || state.PiResumePrompt == "" {
		return false, false
	}
	digest := cloudAgentInterjectionDigest(state.PiResumePrompt)
	laterResponse := false
	for i := len(state.Events) - 1; i >= 0; i-- {
		event := state.Events[i]
		if event.Type == "tool_repair_continuation" && stringValue(event.Payload["resumePromptDigest"]) == digest {
			responses := -1
			switch value := event.Payload["assistantResponses"].(type) {
			case int:
				responses = value
			case float64:
				responses = int(value)
			}
			return true, !laterResponse && responses >= 0 && responses == state.PiAssistantResponses
		}
		switch event.Type {
		case "assistant_message", "tool_completed", "tool_failed", "approval_requested", "generation_task_created":
			laterResponse = true
		}
	}
	return false, false
}

func cloudAgentPiMayResumeSettledSnapshot(state *cloudAgentRuntime) bool {
	_, pending := cloudAgentPiRepairResumeState(state)
	return pending || cloudAgentPiResumePromptDeliversInterjection(state) || cloudAgentPiResumePromptNudgesPlan(state)
}

func cloudAgentRepairContinuationPayload(state *cloudAgentRuntime, text, reason string) map[string]any {
	return map[string]any{"text": text, "reason": reason, "attempt": 1, "maxAttempts": 1, "resumePromptDigest": cloudAgentInterjectionDigest(state.PiResumePrompt), "assistantResponses": state.PiAssistantResponses}
}
