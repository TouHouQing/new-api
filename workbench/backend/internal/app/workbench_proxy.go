package app

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"yingce/backend/internal/model"
)

type workbenchProxyReceipt struct {
	Mode        string `json:"mode"`
	Text        string `json:"text"`
	Body        []byte `json:"hostResponse"`
	ContentType string `json:"hostContentType"`
	Status      int    `json:"hostStatus"`
}

// WorkbenchProxy persists a synchronous text invocation before entering the
// host relay. Replayed idempotency keys never start another inference.
func (s *Service) WorkbenchProxy(ctx context.Context, userID, channelID, key, path, idempotency string, body []byte) (*http.Response, error) {
	if err := s.requireWorkbenchModel(ctx, userID, channelID, key); err != nil {
		return nil, err
	}
	if channelID != "newapi-text" || (path != "/chat/completions" && path != "/responses") {
		return nil, BadAuthRequest("请通过工作台任务入口提交生成请求")
	}
	if idempotency == "" {
		idempotency = newID()
	}
	if len(idempotency) > 160 {
		return nil, BadAuthRequest("请求标识过长")
	}
	digest := sha256.Sum256(body)
	id := uuid.NewSHA1(uuid.NameSpaceOID, []byte(userID+"\x00"+idempotency)).String()
	if existing, err := s.repo.TaskForUser(userID, id); err == nil {
		if existing.CreationIntentSHA256 != fmt.Sprintf("%x", digest) {
			return nil, BadAuthRequest("同一请求标识不能用于不同内容")
		}
		var receipt workbenchProxyReceipt
		if existing.Status != model.TaskStatusSucceeded || json.Unmarshal([]byte(existing.ResultJSON), &receipt) != nil || receipt.Status == 0 {
			return nil, BadAuthRequest("此请求已经提交，请查看创作历史，避免重复生成")
		}
		return &http.Response{StatusCode: receipt.Status, Header: http.Header{"Content-Type": []string{receipt.ContentType}}, Body: io.NopCloser(bytes.NewReader(receipt.Body)), ContentLength: int64(len(receipt.Body))}, nil
	}
	now := time.Now()
	until := now.Add(40 * time.Minute)
	input := map[string]any{"mode": "text", "config": map[string]any{"channelId": channelID, "model": key}}
	encoded, _ := json.Marshal(input)
	task := model.Task{ID: id, UserID: userID, Type: "text", Operation: "host_proxy", Model: key, Status: model.TaskStatusRunning, Stage: "正在生成文本", InputJSON: string(encoded), CreationIntentSHA256: fmt.Sprintf("%x", digest), LeaseOwner: "host-proxy", LeaseExpiresAt: &until, StartedAt: &now, CreatedAt: now, UpdatedAt: now, AuthorizedChargeMicrocredits: 5 * CreditScale}
	order, err := s.workbenchTaskBillingOrder(userID, &task, input)
	if err != nil {
		return nil, err
	}
	task.BillingOrderID = order.ID
	policy, err := s.RuntimePolicy()
	if err != nil {
		return nil, err
	}
	if err = s.createTaskWithinStorageQuota(&task, order, policy); err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(withProviderAnalytics(ctx, s, task), http.MethodPost, "http://newapi.workbench.invalid/v1"+path, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := s.relayWorkbench(request)
	if err != nil {
		_, _ = s.repo.UpdateTaskTerminalState(id, task.LeaseOwner, model.TaskStatusRunning, model.TaskStatusFailed, "调用中断，请核对费用后重试", "New API 调用中断", time.Now())
		_ = s.MarkBillingUncertain(order.ID, "调用中断")
		return nil, err
	}
	defer response.Body.Close()
	result, err := io.ReadAll(io.LimitReader(response.Body, textReplayMaxTaskBytes+1))
	if err != nil || len(result) > textReplayMaxTaskBytes {
		_, _ = s.repo.UpdateTaskTerminalState(id, task.LeaseOwner, model.TaskStatusRunning, model.TaskStatusFailed, "响应未能完整保存，请核对费用", "New API 文本响应未完整保存", time.Now())
		_ = s.MarkBillingUncertain(order.ID, "文本响应未完整保存")
		return nil, BadAuthRequest("文本响应超过存储限制")
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		_, _ = s.repo.UpdateTaskTerminalState(id, task.LeaseOwner, model.TaskStatusRunning, model.TaskStatusFailed, "生成失败", "New API 拒绝请求", time.Now())
		_ = s.RefundBilling(order.ID, "New API 拒绝请求")
	} else {
		protocol := "chat-completion"
		if path == "/responses" {
			protocol = "responses"
		}
		parser := newStreamingAgentParser(protocol, nil)
		text := ""
		if strings.Contains(response.Header.Get("Content-Type"), "event-stream") {
			parser.consume(response.Header.Get("Content-Type"), result)
			parser.flush()
			if parsed, e := parser.result(); e == nil {
				text = stringField(parsed, "text")
			}
		} else {
			var parsed map[string]any
			_ = json.Unmarshal(result, &parsed)
			text = extractTextPayload(parsed, protocol)
		}
		receipt, _ := json.Marshal(workbenchProxyReceipt{Mode: "text", Text: text, Body: result, ContentType: response.Header.Get("Content-Type"), Status: response.StatusCode})
		task.ResultJSON = string(receipt)
		task.Status = model.TaskStatusSucceeded
		task.Progress = 100
		task.Stage = "已完成"
		completed := time.Now()
		task.CompletedAt = &completed
		if err = s.repo.SaveTaskCompletion(&task, model.TaskStatusRunning, nil); err != nil {
			return nil, err
		}
		if err = s.SettleBilling(order.ID, ""); err != nil {
			return nil, err
		}
	}
	response.Body = io.NopCloser(bytes.NewReader(result))
	response.ContentLength = int64(len(result))
	return response, nil
}
