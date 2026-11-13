package generation

import "strings"

const workflowSpendingLimitMessage = "上游工作流已达到独立费用上限，请提高该工作流的费用上限或切换模型/渠道后重试。账号额度充足时也可能触发该工作流限额"

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
