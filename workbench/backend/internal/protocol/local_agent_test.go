package protocol

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
)

func TestLocalAgentRoundTripAndReadOnlyRecovery(t *testing.T) {
	a := localAdapter{CapabilityText}
	c := AgentRequestContext{Model: "qwen3.5:9b", IdempotencyKey: "native-step", Thinking: true, ContextWindowTokens: 32768, MaxOutputTokens: 2048, Request: map[string]any{"chatCompletion": map[string]any{"messages": []any{map[string]any{"role": "user", "content": "inspect"}}, "tool_choice": "auto"}}}
	spec, err := a.BuildAgent(context.Background(), c)
	if err != nil || spec.Auth.Type != "none" || spec.Headers["Idempotency-Key"] != c.IdempotencyKey || spec.Path != "/api/agent/generate" {
		t.Fatal(spec, err)
	}
	body := spec.Body.(map[string]any)
	if body["context_length"] != 32768 || body["think"] != true || body["max_tokens"] != 2048 {
		t.Fatal(body)
	}
	if _, leaked := body["idempotencyKey"]; leaked {
		t.Fatal("host identity leaked into model body")
	}
	recovery, err := a.BuildAgentRecovery(context.Background(), c)
	if err != nil || recovery.Method != http.MethodGet || !recovery.OriginPath {
		t.Fatal(recovery, err)
	}
	wire := []byte(`{"message":{"content":"","tool_calls":[{"id":"call_123","function":{"name":"inspect_project","arguments":{"limit":1}}}]},"usage":{"total_tokens":25}}`)
	first, err := a.ParseAgent(context.Background(), wire)
	if err != nil || len(first.ToolCalls) != 1 || first.ToolCalls[0].Arguments != `{"limit":1}` || first.Usage["total_tokens"] != float64(25) {
		t.Fatal(first, err)
	}
	var payload any
	_ = json.Unmarshal(wire, &payload)
	saved, _ := json.Marshal(map[string]any{"status": "succeeded", "result": payload})
	restored, err := a.ParseAgent(context.Background(), saved)
	if err != nil || restored.ToolCalls[0].ID != first.ToolCalls[0].ID {
		t.Fatal(restored, err)
	}
	for _, capability := range []Capability{CapabilityImage, CapabilityVideo} {
		adapter := localAdapter{capability}
		if adapter.AgentAvailable() {
			t.Fatal("media advertised Agent")
		}
		if _, err := adapter.BuildAgent(context.Background(), c); err == nil {
			t.Fatal("media accepted Agent")
		}
	}
}

func TestLocalAgentRejectsUnusableReceiptsAndUnsupportedPolicy(t *testing.T) {
	a := localAdapter{CapabilityText}
	for _, body := range []string{`{"message":{"content":""}}`, `{"message":{"tool_calls":[{"function":{"name":"x","arguments":{}}}]}}`, `{"message":{"tool_calls":[{"id":"x","function":{"name":"x","arguments":"{}"}}]}}`} {
		if _, err := a.ParseAgent(context.Background(), []byte(body)); err == nil {
			t.Fatal("invalid receipt accepted")
		}
	}
	_, err := a.BuildAgent(context.Background(), AgentRequestContext{IdempotencyKey: "step", ContextWindowTokens: 128000, Request: map[string]any{"chatCompletion": map[string]any{"messages": []any{}}}})
	if err == nil {
		t.Fatal("unsupported context silently truncated")
	}
}
