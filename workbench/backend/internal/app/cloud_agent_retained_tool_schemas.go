package app

func cloudAgentRetainedToolSchemas() []map[string]any {
	tools := []map[string]any{}
	add := func(name, description string, properties map[string]any, required ...string) {
		if required == nil {
			required = []string{}
		}
		tools = append(tools, map[string]any{"type": "function", "function": map[string]any{"name": name, "description": description, "parameters": map[string]any{"type": "object", "properties": properties, "required": required, "additionalProperties": false}}})
	}
	str := func(description string) map[string]any {
		return map[string]any{"type": "string", "description": description}
	}
	add("task_history", "分页搜索本人当前画布的全部任务编号、提示词和模型，返回总数及状态计数。用task_get读取原结果；不生成、不重试、不跨画布。", map[string]any{
		"page": map[string]any{"type": "integer", "minimum": 1, "maximum": 1000000}, "pageSize": map[string]any{"type": "integer", "minimum": 1, "maximum": 50},
		"query": str("搜索任务编号、提示词或模型"), "model": str("精确模型编号，可省略"), "timeZone": str("用户IANA时区，默认UTC"),
		"kind": map[string]any{"type": "string", "enum": []string{"text", "image", "video", "audio"}}, "status": map[string]any{"type": "string", "enum": []string{"active", "succeeded", "failed", "recorded"}},
	})

	add("image_layer_plan", "当前看图文本模型识图拆层，先界面审批。不生成图片；0预算仅免费模型。关页用task_get找回；需修正如实报告，勿重试。", map[string]any{
		"sourceNodeId": str("本人已保存原图节点ID"),
		"instructions": map[string]any{"type": "string", "minLength": 1, "maxLength": 6000},
		"purpose":      map[string]any{"type": "string", "enum": []string{"materials", "recompose"}},
		"input":        map[string]any{"type": "string", "enum": []string{"preview", "original"}},
		"maxCredits":   map[string]any{"type": "number", "minimum": 0, "maximum": 1000000},
	}, "sourceNodeId", "instructions", "purpose", "maxCredits")
	add("image_process", "免费CPU切分/裁剪/插值/遮罩，原图保留，另存结果/节点。先读sourceNodeId，等界面审批。均分split={rows:2,columns:3}省略分割线，rows上下/columns左右；resize不补细节。", cloudAgentImageOperationSchema(), "sourceNodeId", "recipe")
	add("production_catalog", "查本轮项目制作动作目录；传action读取完整参数合同，group筛选。", map[string]any{"action": str("动作名，省略列目录"), "group": str("可选分组")})
	add("production_read", "按目录读取原生项目、素材、剪辑、版本、审片及修复；不会执行写动作。", map[string]any{"action": str("目录中的只读动作"), "arguments": map[string]any{"type": "object"}}, "action", "arguments")
	add("production_edit", "执行目录写动作；先预览，复用intentId核对回执，不能改编号重复提交。权限、审批和原生CAS仍生效。", map[string]any{"action": str("目录中的写动作"), "intentId": map[string]any{"type": "string", "minLength": 16, "maxLength": 128}, "arguments": map[string]any{"type": "object"}}, "action", "intentId", "arguments")
	return tools
}
