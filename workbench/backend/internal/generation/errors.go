package generation

import "strings"

const workflowSpendingLimitMessage = "本次生成超过工作台预授权的任务费用上限。账号总余额可能仍然充足，请缩短时长、降低分辨率，或重新创建预算足够的任务后重试"

func workflowSpendingLimitUserMessage(raw string) string {
	normalized := strings.ToLower(strings.TrimSpace(raw))
	switch {
	case strings.Contains(normalized, "workflow spending limit reached"),
		strings.Contains(normalized, "workflow spending limit"),
		strings.Contains(normalized, "workflow_spending_limit"),
		strings.Contains(normalized, "spending limit reached"):
		return workflowSpendingLimitMessage
	default:
		return ""
	}
}
