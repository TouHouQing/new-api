package app

import (
	"strings"
	"testing"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

func TestCloudAgentImageProcessMaskApprovalAndNativeResult(t *testing.T) {
	for _, postgres := range []bool{false, true} {
		t.Run(map[bool]string{false: "sqlite", true: "postgres"}[postgres], func(t *testing.T) {
			s, db, run, state := agentImageOperationFixture(t, "auto", postgres)
			state.Calls[0].Function.Arguments = `{"sourceNodeId":"source-node","recipe":{"operation":"mask","mask":{"width":31,"height":23,"mode":"keep","strokes":[{"diameter":6,"erase":false,"points":[[8,8],[12,10]]}]}}}`
			if err := s.repo.MutateCloudAgent("user", run.ID, run.Revision, func(current *model.CloudAgentExecution, _ *repository.Repository) error {
				return cloudAgentSave(current, &state)
			}); err != nil {
				t.Fatal(err)
			}
			run, state = reloadAgentImageOperation(t, s, run.ID)
			if err := s.advanceCloudAgentTool(run, &state); err != nil {
				t.Fatal(err)
			}
			run, state = reloadAgentImageOperation(t, s, run.ID)
			if run.Status != "waiting_approval" || state.Approval == nil || len(state.Approval.Preview.Items) != 1 || !strings.Contains(strings.Join(state.Approval.Preview.Items[0].Details, " "), "1 条笔画") {
				t.Fatal("mask did not produce an accurate explicit approval")
			}
			var count int64
			db.Model(&model.Task{}).Where("type = ?", model.TaskTypeImageOperation).Count(&count)
			if count != 0 {
				t.Fatal("mask ran before approval")
			}
			run, state = approveAgentImageOperation(t, s, run.ID)
			taskID := state.MediaTaskID
			if taskID == "" {
				t.Fatal("approved mask was not queued")
			}
			task := runImageOperationTask(t, s, taskID)
			if task.Status != model.TaskStatusSucceeded || task.BillingOrderID != "" || task.Operation != "mask" {
				t.Fatal("mask did not use native free CPU task")
			}
			run, state = reloadAgentImageOperation(t, s, run.ID)
			if err := s.advanceCloudAgentMedia(run, &state, state.Calls[0]); err != nil {
				t.Fatal(err)
			}
			_, state = reloadAgentImageOperation(t, s, run.ID)
			if state.MediaTaskID != "" || state.Approval != nil || state.CallIndex != 1 {
				t.Fatal("mask result did not complete native adoption")
			}
			project, err := s.repo.CanvasProjectForUser("user", "agent-canvas")
			if err != nil || strings.Count(project.PayloadJSON, `"type":"image"`) != 2 || !strings.Contains(project.PayloadJSON, "assetVersionId") {
				t.Fatal("mask result missing original image or fixed derived version", err)
			}
		})
	}
}

func TestCloudAgentImageProcessRejectsUnadvertisedRecipeBeforeApproval(t *testing.T) {
	for _, operation := range []string{"compose", "background-patch", "unknown"} {
		call := cloudAgentCall{}
		call.Function.Arguments = `{"sourceNodeId":"source-node","recipe":{"operation":"` + operation + `"}}`
		if _, err := decodeCloudAgentImageOperation(call); err == nil {
			t.Fatal("unadvertised recipe reached approval preview", operation)
		}
	}
}
