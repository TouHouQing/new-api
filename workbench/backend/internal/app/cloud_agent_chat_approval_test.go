package app

import "testing"

func TestCloudAgentPlainChatApprovalHasOneCorrectionAndNeverGrantsApproval(t *testing.T) {
	for _, recovered := range []bool{false, true} {
		t.Run(map[bool]string{false: "still-chat-only", true: "corrected"}[recovered], func(t *testing.T) {
			s, db, root := interjectionPiRoot(t)
			run, state := agentInterjectionState(t, s, root.ID)
			run.Status = "running"
			state.ActiveTaskID = ""
			state.PiAssistantResponses = 1
			state.Request.PermissionMode = "request_approval"
			state.Request.ContextScope = []string{"canvas"}
			state.Request.Budget.MaxSteps = 5
			state.Step = 2
			state.event(root.ID, "assistant_message", map[string]any{"text": "已读取原图片。\n请确认是否按此配方执行切图？"})
			interjectionSaveState(t, s, db, run, &state)
			if err := s.completeCloudAgentPiRun("user", root.ID); err != nil {
				t.Fatal(err)
			}
			run, state = agentInterjectionState(t, s, root.ID)
			if run.Status != "running" || state.PiApprovalRepairResumeCount != 1 || state.Approval != nil || len(state.Decisions) != 0 || state.MediaTaskID != "" || state.PiResumePrompt != cloudAgentChatApprovalCorrection || agentHasEvent(state, "run_completed") {
				t.Fatal("chat confirmation became consent or completion")
			}
			if !cloudAgentPiMayResumeSettledSnapshot(&state) {
				t.Fatal("new correction would be discarded as an old settled turn")
			}
			if err := s.completeCloudAgentPiRun("user", root.ID); err != nil {
				t.Fatal(err)
			}
			run, state = agentInterjectionState(t, s, root.ID)
			if run.Status != "running" || state.PiApprovalRepairResumeCount != 1 {
				t.Fatal("duplicate finish consumed an undelivered correction")
			}
			state.PiResumePrompt = ""
			if recovered {
				state.event(root.ID, "assistant_message", map[string]any{"text": "当前仅说明功能，没有执行制作任务。"})
			}
			interjectionSaveState(t, s, db, run, &state)
			if err := s.completeCloudAgentPiRun("user", root.ID); err != nil {
				t.Fatal(err)
			}
			run, state = agentInterjectionState(t, s, root.ID)
			want := "failed"
			if recovered {
				want = "completed"
			}
			if run.Status != want || state.PiApprovalRepairResumeCount != 1 {
				t.Fatal("unbounded or incorrect approval correction", run.Status)
			}
		})
	}
}

func TestCloudAgentChatApprovalPatternDoesNotConvertCreativeQuestionsOrReadOnly(t *testing.T) {
	for _, text := range []string{"请确认你更喜欢雨天还是晴天？", "请回复你想要的画幅，便于开始制作。", "下面是操作说明，不执行。", "> 请确认是否执行切图？", "> 等待审批通过后才生成。", "流程说明：提交生成请求后等待审批。", "工具已经完成。需要更多创作建议吗？"} {
		state := cloudAgentRuntime{Request: CloudAgentRequest{PermissionMode: "auto", ContextScope: []string{"canvas"}}, Events: []CloudAgentEvent{{Type: "assistant_message", Payload: map[string]any{"text": text}}}}
		if cloudAgentUnrequestedChatApproval(&state) {
			t.Fatal("non-execution question was treated as approval", text)
		}
	}
	state := cloudAgentRuntime{Request: CloudAgentRequest{PermissionMode: "read_only", ContextScope: []string{"canvas"}}, Events: []CloudAgentEvent{{Type: "assistant_message", Payload: map[string]any{"text": "请确认是否执行切图？"}}}}
	if cloudAgentUnrequestedChatApproval(&state) {
		t.Fatal("read-only run offered a write correction")
	}
	state.Request.PermissionMode = "request_approval"
	state.Request.Prompt = "先讨论怎么切图，暂不执行。"
	if cloudAgentUnrequestedChatApproval(&state) {
		t.Fatal("explicit discussion-only preference was overridden")
	}
}

func TestCloudAgentInlineApprovalClaimRequiresAnActualToolProposal(t *testing.T) {
	for _, text := range []string{
		"您确认的配方已明确。我已调用 image_process 工具执行切图操作，等待平台审批。请批准后立即执行。",
		"我先读取画布获取原图片，然后构建切图配方。\n- 行：2，列：3\n请回复“可以”或确认是否有调整。",
		"已读取图片，拟执行切图。\n请回复“开始”。",
		"准备按2行3列切分。请确认以下配方：\n- 操作类型：split\n- 保留原图，结果添加到画布",
		"已查询到音频模型目录并确认参数符合要求。现在提交生成任务：使用角色卡的固定声音，语言为中文，格式为wav。等待审批通过后才提交生成。",
		"准备执行配音。等待平台审批后开始生成。",
		"正在准备生成。等待您批准后执行。",
	} {
		state := cloudAgentRuntime{Request: CloudAgentRequest{PermissionMode: "request_approval", ContextScope: []string{"canvas"}}, Events: []CloudAgentEvent{{Type: "assistant_message", Payload: map[string]any{"text": text}}}}
		if !cloudAgentUnrequestedChatApproval(&state) {
			t.Fatal("chat-only approval claim could become completed without a tool proposal", text)
		}
	}
}
