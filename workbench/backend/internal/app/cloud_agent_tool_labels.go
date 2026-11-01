package app

// Parameter names and JSON types already carry these labels. Removing only
// this explicit set saves prompt bytes without deleting permissions, approval,
// source provenance, bounds, enum choices or conditional requirements.
func compactCloudAgentToolLabels(value any) {
	switch node := value.(type) {
	case map[string]any:
		if description, ok := node["description"].(string); ok {
			switch description {
			case "标识", "任务内容", "选项文字", "字段ID", "字段显示名称", "选项名称", "可选说明", "输入提示", "默认选项", "导演场景 ID", "镜头 ID", "待精读的真实节点ID", "文本或文件节点ID", "真实批量创作表节点ID", "真实分镜脚本节点ID", "真实图片节点ID", "标注文字", "技能ID", "可选关键词", "真实任务ID", "工具名", "这一步做什么", "新的结果节点ID", "结果节点名称", "源图片节点ID", "分镜脚本标题", "节点或连线唯一ID", "连线来源节点ID", "连线目标节点ID", "分组展示名", "节点ID", "文本/镜头提示词节点ID":
				delete(node, "description")
			}
		}
		for _, child := range node {
			compactCloudAgentToolLabels(child)
		}
	case []any:
		for _, child := range node {
			compactCloudAgentToolLabels(child)
		}
	case []map[string]any:
		for _, child := range node {
			compactCloudAgentToolLabels(child)
		}
	}
}
