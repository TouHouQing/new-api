// SPDX-License-Identifier: AGPL-3.0-or-later
package protocol

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

func (a localAdapter) AgentAvailable() bool { return a.capability == CapabilityText }

func (a localAdapter) BuildAgent(_ context.Context, c AgentRequestContext) (RequestSpec, error) {
	if !a.AgentAvailable() || c.IdempotencyKey == "" {
		return RequestSpec{}, fmt.Errorf("本地 Agent 需要文本模型及原生任务提交标识")
	}
	chat, ok := c.Request["chatCompletion"].(map[string]any)
	if !ok || chat["messages"] == nil {
		return RequestSpec{}, fmt.Errorf("本地 Agent 缺少会话参数")
	}
	window, output := c.ContextWindowTokens, c.MaxOutputTokens
	if window == 0 {
		window = 8192
	}
	if output == 0 {
		output = 2048
	}
	if window < 2048 || window > 32768 || output < 1 || output > 8192 {
		return RequestSpec{}, fmt.Errorf("本地 Agent 上下文需为 2048–32768，输出需为 1–8192；请调整模型能力配置")
	}
	body := map[string]any{"model_name": c.Model, "messages": chat["messages"], "tools": chat["tools"], "tool_choice": chat["tool_choice"], "max_tokens": output, "context_length": window, "think": c.Thinking}
	return RequestSpec{Method: http.MethodPost, Path: "/api/agent/generate", OriginPath: true, ContentType: "application/json", Auth: ManifestAuth{Type: "none"}, Headers: map[string]string{"Idempotency-Key": c.IdempotencyKey}, Body: body}, nil
}

func (a localAdapter) BuildAgentRecovery(_ context.Context, c AgentRequestContext) (RequestSpec, error) {
	if !a.AgentAvailable() || c.IdempotencyKey == "" {
		return RequestSpec{}, fmt.Errorf("本地 Agent 缺少原始提交标识")
	}
	return RequestSpec{Method: http.MethodGet, Path: fmt.Sprintf("/api/receipts/%x", sha256.Sum256([]byte(c.IdempotencyKey))), OriginPath: true, Auth: ManifestAuth{Type: "none"}}, nil
}

func (a localAdapter) ParseAgent(_ context.Context, body []byte) (AgentResult, error) {
	payload, err := decodeObject(body)
	if err != nil {
		return AgentResult{}, err
	}
	if saved, ok := payload["result"].(map[string]any); ok {
		payload = saved
	}
	message, ok := payload["message"].(map[string]any)
	if !ok {
		return AgentResult{}, fmt.Errorf("本地 Agent 未返回完整会话结果")
	}
	text, _ := message["content"].(string)
	reasoning, _ := message["thinking"].(string)
	usage, _ := payload["usage"].(map[string]any)
	result := AgentResult{Text: text, Reasoning: reasoning, Usage: usage}
	ids := map[string]bool{}
	for _, item := range arrayValue(message["tool_calls"]) {
		call, ok := item.(map[string]any)
		if !ok {
			return AgentResult{}, fmt.Errorf("本地 Agent 工具结果格式无效")
		}
		id, _ := call["id"].(string)
		fn, _ := call["function"].(map[string]any)
		name, _ := fn["name"].(string)
		args, ok := fn["arguments"].(map[string]any)
		if id == "" || ids[id] || strings.TrimSpace(name) == "" || !ok {
			return AgentResult{}, fmt.Errorf("本地 Agent 工具标识或参数无效")
		}
		encoded, err := json.Marshal(args)
		if err != nil {
			return AgentResult{}, err
		}
		ids[id] = true
		result.ToolCalls = append(result.ToolCalls, AgentToolCall{ID: id, Name: name, Arguments: string(encoded)})
	}
	if strings.TrimSpace(text) == "" && len(result.ToolCalls) == 0 {
		return AgentResult{}, fmt.Errorf("本地 Agent 未返回正文或工具调用")
	}
	return result, nil
}
