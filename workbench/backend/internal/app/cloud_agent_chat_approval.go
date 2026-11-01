package app

import "strings"

const cloudAgentChatApprovalCorrection = "上一条回复仍在聊天里索取执行批准，平台没有收到这项批准，也没有待确认的审批。不要把用户原请求或本条纠正当成已批准。若用户已明确要求制作或修改，请调用本轮开放的具体工具，让服务端按权限执行或展示审批；不要调用ask_user索取执行授权。工具必须通过真实工具调用消息提交，正文写已调用不算调用。只有尚缺且会改变结果的创作偏好才用ask_user。若用户仅咨询，请回答说明，不提出执行批准。若请求已完成，请基于真实工具结果报告，不追加操作。"

// This only corrects a narrow terminal chat pattern; it never interprets the
// user's creative intent, invents tool arguments, approves or executes a write.
func cloudAgentUnrequestedChatApproval(state *cloudAgentRuntime) bool {
	if state.Request.PermissionMode == "read_only" || len(state.Request.ContextScope) == 0 {
		return false
	}
	for _, instruction := range []string{"不要执行", "暂不执行", "先不执行", "先讨论", "只讨论", "仅讨论", "不要调用任何工具", "只在聊天中确认", "只在聊天里确认"} {
		if strings.Contains(state.Request.Prompt, instruction) {
			return false
		}
	}
	for i := len(state.Events) - 1; i >= 0; i-- {
		event := state.Events[i]
		if event.Type != "assistant_message" {
			continue
		}
		text := strings.TrimSpace(stringValue(event.Payload["text"]))
		action := false
		for _, value := range []string{"执行", "切图", "切分", "裁剪", "缩放", "处理", "生成", "写入", "修改", "开始", "添加", "保存"} {
			if strings.Contains(text, value) {
				action = true
				break
			}
		}
		if !action {
			return false
		}
		// A directive can precede a recipe list or follow prose on the same
		// line. Quoted examples do not become execution consent or proposals.
		for _, clause := range strings.FieldsFunc(text, func(r rune) bool { return strings.ContainsRune("\r\n。！？!?", r) }) {
			clause = strings.TrimLeft(strings.TrimSpace(clause), "*# ")
			for _, prefix := range []string{"等待审批", "等待平台审批", "等待批准", "等待您批准", "等待你批准"} {
				if strings.HasPrefix(clause, prefix) {
					return true
				}
			}
			for _, prefix := range []string{"请确认", "请批准", "是否批准", "请回复"} {
				if strings.HasPrefix(clause, prefix) && (strings.Contains(clause, "确认") || strings.Contains(clause, "批准") || strings.Contains(clause, "同意") || strings.Contains(clause, "“可以”") || strings.Contains(clause, "“开始”")) {
					return true
				}
			}
		}
		return false
	}
	return false
}
