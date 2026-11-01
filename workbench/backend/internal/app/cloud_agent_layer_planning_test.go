package app

import (
	"encoding/json"
	"strings"
	"testing"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

func agentLayerPlanningFixture(t *testing.T) (*Service, *gorm.DB, *model.CloudAgentExecution, cloudAgentRuntime) {
	t.Helper()
	s, db, run, state := agentImageOperationFixture(t, "auto")
	// Real MCP requests select channelId+channelModelKey and omit the legacy Model.
	state.Request.Model = ""
	profile := DefaultModelCapabilityConfigForModel("chat-completion", "text-test")
	profile.Text.References.MaxImages = 1
	profile.Text.References.MaxImageBytes = 32 << 20
	if err := db.Model(&model.ChannelModel{}).Where("id = ?", "cm").Update("capability_config_json", mustEncodeModelCapabilityConfig(t, profile)).Error; err != nil {
		t.Fatal(err)
	}
	call := cloudAgentCall{ID: "native-layer-plan-call"}
	call.Function.Name = "image_layer_plan"
	call.Function.Arguments = `{"sourceNodeId":"source-node","instructions":"提取完整图片素材","purpose":"materials","input":"preview","maxCredits":1}`
	state.Calls = []cloudAgentCall{call}
	state.CallIndex = 0
	if err := s.repo.MutateCloudAgent("user", run.ID, run.Revision, func(current *model.CloudAgentExecution, _ *repository.Repository) error {
		return cloudAgentSave(current, &state)
	}); err != nil {
		t.Fatal(err)
	}
	run, _ = s.repo.CloudAgent("user", run.ID)
	return s, db, run, state
}

func TestCloudAgentLayerPlanningAlwaysApprovesBeforeOneNativeTaskAndPreservesOriginal(t *testing.T) {
	s, db, run, state := agentLayerPlanningFixture(t)
	before, err := s.repo.CanvasProjectForUser("user", "agent-canvas")
	if err != nil {
		t.Fatal(err)
	}
	if err := s.advanceCloudAgentTool(run, &state); err != nil {
		t.Fatal(err)
	}
	run, _ = s.repo.CloudAgent("user", run.ID)
	state, err = cloudAgentDecode(run)
	if err != nil {
		t.Fatal(err)
	}
	var count int64
	db.Model(&model.Task{}).Where("operation = ?", "text").Count(&count)
	if run.Status != "waiting_approval" || state.Approval == nil || state.Approval.LayerPlanning == nil || count != 0 || state.Generations != 0 {
		t.Fatalf("planning escaped approval: status=%s tasks=%d", run.Status, count)
	}
	if err := s.DecideCloudAgentApproval("user", run.ID, state.Approval.ID, "approve", ""); err != nil {
		t.Fatal(err)
	}
	run, _ = s.repo.CloudAgent("user", run.ID)
	state, err = cloudAgentDecode(run)
	if err != nil {
		t.Fatal(err)
	}
	if state.MediaTaskID == "" {
		if err := s.advanceCloudAgentTool(run, &state); err != nil {
			t.Fatal(err)
		}
		run, _ = s.repo.CloudAgent("user", run.ID)
		state, _ = cloudAgentDecode(run)
	}
	db.Model(&model.Task{}).Where("operation = ?", "text").Count(&count)
	if count != 1 || state.Generations != 1 || state.MediaTaskID == "" {
		t.Fatal("approved planning did not create exactly one native task")
	}
	task, err := s.repo.TaskForUser("user", state.MediaTaskID)
	if err != nil {
		t.Fatal(err)
	}
	if task.Type != "canvas_text" || task.Operation != "text" || task.AgentRunID != run.ID || task.ApprovalID == "" || task.AuthorizedChargeMicrocredits <= 0 {
		t.Fatal("planning bypassed ordinary routing and billing")
	}
	// Finish only the existing task through the shared completion boundary. This
	// regression does not claim a fixture is a real model or call an upstream.
	if err := db.Model(&model.Task{}).Where("id = ?", task.ID).Update("status", model.TaskStatusRunning).Error; err != nil {
		t.Fatal(err)
	}
	task.Status = model.TaskStatusRunning
	result, _ := json.Marshal(map[string]any{"text": `{"canPlan":false,"reason":"测试模型未提供可用视觉规划"}`})
	if err := s.saveTaskCompletionWithinStorageQuota(task, result, nil, false); err != nil {
		t.Fatal(err)
	}
	if err := s.advanceCloudAgentMedia(run, &state, state.Calls[0]); err != nil {
		t.Fatal(err)
	}
	run, _ = s.repo.CloudAgent("user", run.ID)
	state, err = cloudAgentDecode(run)
	if err != nil {
		t.Fatal(err)
	}
	if state.MediaTaskID != "" || state.CallIndex != 1 || state.Generations != 1 {
		t.Fatal("native planning result did not settle once")
	}
	encodedState, _ := json.Marshal(state)
	if !strings.Contains(string(encodedState), "识图回复需要修正") {
		t.Fatal("invalid model planning was shown as a successful tool result")
	}
	after, err := s.repo.CanvasProjectForUser("user", "agent-canvas")
	if err != nil || after.PayloadJSON != before.PayloadJSON {
		t.Fatal("planning changed the original canvas")
	}
	db.Model(&model.Task{}).Where("operation = ?", "text").Count(&count)
	if count != 1 {
		t.Fatal("planning completion repeated inference")
	}
}

func TestCloudAgentLayerPlanningRejectLeavesNoTaskAndNoFakeDraft(t *testing.T) {
	s, db, run, state := agentLayerPlanningFixture(t)
	if err := s.advanceCloudAgentTool(run, &state); err != nil {
		t.Fatal(err)
	}
	run, _ = s.repo.CloudAgent("user", run.ID)
	state, _ = cloudAgentDecode(run)
	if state.Approval == nil {
		t.Fatal("planning approval missing")
	}
	id := state.Approval.ID
	if err := s.DecideCloudAgentApproval("user", run.ID, id, "reject", ""); err != nil {
		t.Fatal(err)
	}
	run, _ = s.repo.CloudAgent("user", run.ID)
	state, err := cloudAgentDecode(run)
	if err != nil {
		t.Fatal(err)
	}
	var count int64
	db.Model(&model.Task{}).Where("operation = ?", "text").Count(&count)
	if run.Status != "rejected" || state.Approval != nil || state.Generations != 0 || count != 0 {
		t.Fatal("rejected planning was submitted")
	}
}
