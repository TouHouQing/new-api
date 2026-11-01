package app

// Editorial actions share exactly the native UI/MCP service operations. They
// never submit model inference; generating media retains generate_media's
// existing quote, approval, task-count and credit contracts.
func (s *Service) productionAgentEditorialActions() []productionAgentAction {
	return []productionAgentAction{
		{"lyrics.preview", "sound", "对齐完整歌词，只用原词测量或明确人工时间；未匹配、重复和未核对句子不能采用", true, s.PreviewProjectLyrics, []string{"$owner", "$project", "id", "request"}},
		{"lyrics.apply", "sound", "保存已逐句试听核对的歌词为新文字稿版本；保留原识别。稳定编号和原预览参数不能改变", false, s.ApplyProjectLyrics, []string{"$owner", "$project", "id", "request"}},
		{"lyrics.result", "sound", "按原编号找回歌词固定版本；Current=false表示后来已有修改，不应重插旧内容", true, s.ReadProjectLyricsResult, []string{"$owner", "$project", "id", "requestId"}},
		{"transcript.adopt", "sound", "采用本项目已完成的真实识别任务；不再次识别，按来源任务找回同一文字稿", false, s.CreateProjectTranscript, []string{"$owner", "$project", "request"}},
		{"transcript.for_task", "sound", "按已有识别任务查询原生文字稿", true, s.GetProjectTranscriptForTask, []string{"$owner", "$project", "taskId"}},
		{"transcript.suggestions", "sound", "读取固定文字稿中可核对的赘词与停顿建议，不直接剪辑", true, s.GetProjectTranscriptSuggestions, []string{"$owner", "$project", "id", "revisionId"}},
		{"analysis.markers.preview", "analysis", "预览已核对切镜或节拍标记映射到具体片段，保留原测量来源", true, s.PreviewProjectMediaAnalysisMarkers, []string{"$owner", "$project", "id", "request"}},
		{"analysis.markers.apply", "analysis", "按原预览采用标记；编辑与Agent回执在同一事务保存，重放不插回已撤销标记", false, s.ApplyProjectMediaAnalysisMarkers, []string{"$owner", "$project", "id", "request"}},
		{"analysis.reframe.preview", "analysis", "预览逐点核对后的主体跟踪构图；跟踪丢失区间必须人工修正", true, s.PreviewProjectMediaAnalysisReframe, []string{"$owner", "$project", "id", "request"}},
		{"analysis.reframe.apply", "analysis", "采用已预览的固定跟踪版本，保留其他素材实例与音轨", false, s.ApplyProjectMediaAnalysisReframe, []string{"$owner", "$project", "id", "request"}},
		{"review.state", "review", "按原生版本、角色权限和稳定编号修改审片状态，不替用户作质量批准", false, s.SetProjectReviewState, []string{"$owner", "$project", "id", "request"}},
		{"review.rework", "review", "读取具体意见的返工来源与对应镜头，不重新生成素材", true, s.ReadProjectReviewRework, []string{"$owner", "$project", "reviewId", "commentId"}},
		{"review.asset_source", "review", "读取审片绑定素材的固定版本来源", true, s.ReadProjectReviewAssetSource, []string{"$owner", "$project", "versionId"}},
		{"review.shares", "review", "读取已有审片链接与到期状态，不发送给他人", true, s.ListProjectReviewShares, []string{"$owner", "$project", "reviewId"}},
		{"review.share.create", "review", "创建有期限的本地审片链接，保留原编号回执；分享须由用户发送", false, s.CreateProjectReviewShare, []string{"$owner", "$project", "reviewId", "request"}},
		{"review.share.revoke", "review", "按原生版本与稳定编号撤销明确的审片链接", false, s.RevokeProjectReviewShare, []string{"$owner", "$project", "reviewId", "id", "request"}},
		{"workflow.create", "planning", "为已有章节建立原生制作步骤；不启动生成", false, s.CreateUnitWorkflow, []string{"$owner", "$project", "unitId"}},
		{"workflow.step", "planning", "更新明确的原生制作步骤，完成条件仍由原生服务检查", false, s.UpdateWorkflowStep, []string{"$owner", "$project", "stepId", "request"}},
		{"workflow.output", "planning", "登记已有任务产物到明确制作步骤；校验任务所属、完成状态和版本", false, s.RegisterTaskOutput, []string{"$owner", "$project", "stepId", "request"}},
	}
}
