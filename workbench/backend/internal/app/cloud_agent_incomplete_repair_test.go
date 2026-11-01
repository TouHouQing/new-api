package app

import "testing"

func TestCloudAgentIncompleteToolRepairCannotBecomeCompleted(t *testing.T) {
	for _, recovered := range []bool{false, true} {
		t.Run(map[bool]string{false: "still-failed", true: "recovered"}[recovered], func(t *testing.T) {
			s, db, root := interjectionPiRoot(t)
			run, state := agentInterjectionState(t, s, root.ID)
			run.Status = "running"
			state.PiAssistantResponses = 1
			state.ActiveTaskID = ""
			state.Request.Budget.MaxSteps = 5
			state.Step = 2
			state.ToolRepairs = map[string]cloudAgentToolRepair{"canvas_apply_ops": {GroupID: root.ID + ":repair:failed-op", Attempt: 2}}
			interjectionSaveState(t, s, db, run, &state)
			if err := s.completeCloudAgentPiRun("user", root.ID); err != nil {
				t.Fatal(err)
			}
			run, state = agentInterjectionState(t, s, root.ID)
			if run.Status != "running" || state.PiRepairResumeCount != 1 || state.PiResumePrompt == "" || agentHasEvent(state, "run_completed") {
				t.Fatal("unresolved failed operation was reported complete")
			}
			state.PiResumePrompt = ""
			if recovered {
				delete(state.ToolRepairs, "canvas_apply_ops")
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
			if run.Status != want || state.PiRepairResumeCount != 1 {
				t.Fatal("incorrect final receipt after bounded continuation", run.Status)
			}
			if !recovered && agentHasEvent(state, "run_completed") {
				t.Fatal("failed repair emitted completion")
			}
		})
	}
}
