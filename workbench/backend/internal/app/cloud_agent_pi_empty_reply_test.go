package app

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"testing"
	"time"

	"yingce/backend/internal/model"
)

func TestCloudAgentPiConfirmedEmptyReplyPreservesReceiptWithoutCompletionOrReplay(t *testing.T) {
	for _, text := range []string{"", " \n\t"} {
		t.Run(map[bool]string{true: "empty", false: "whitespace"}[text == ""], func(t *testing.T) {
			s, db, runID := piOutputLimitFixture(t)
			_, before := agentInterjectionState(t, s, runID)
			ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
			defer cancel()
			done := make(chan error, 1)
			go func() {
				_, err := s.cloudAgentPiModel(ctx, "user", runID, map[string]json.RawMessage{
					"messages": json.RawMessage(`[{"role":"user","content":"继续"}]`),
				})
				done <- err
			}()
			var taskID string
			for taskID == "" {
				_, state := agentInterjectionState(t, s, runID)
				taskID = state.ActiveTaskID
				if taskID != "" {
					break
				}
				select {
				case err := <-done:
					t.Fatalf("model bridge returned before its task: %v", err)
				case <-ctx.Done():
					t.Fatal("model task was not scheduled")
				case <-time.After(20 * time.Millisecond):
				}
			}
			raw, err := json.Marshal(map[string]any{"text": text, "reasoning": "internal reasoning only", "toolCalls": []any{}})
			if err != nil {
				t.Fatal(err)
			}
			if err := db.Model(&model.Task{}).Where("id = ?", taskID).Updates(map[string]any{"status": model.TaskStatusSucceeded, "result_json": string(raw)}).Error; err != nil {
				t.Fatal(err)
			}
			select {
			case err := <-done:
				if err == nil || !strings.Contains(err.Error(), "本轮操作尚未完成") {
					t.Fatalf("empty response became a usable completion: %v", err)
				}
			case <-ctx.Done():
				t.Fatal("empty response was retried or left active")
			}
			_, after := agentInterjectionState(t, s, runID)
			if after.ActiveTaskID != "" || len(after.Calls) != 0 || !reflect.DeepEqual(before.Canonical, after.Canonical) || after.PiAssistantResponses != before.PiAssistantResponses {
				t.Fatal("empty response changed conversation or execution state")
			}
			var count int64
			if err := db.Model(&model.Task{}).Where("agent_run_id = ? AND operation = ?", runID, cloudAgentStepOperation).Count(&count).Error; err != nil || count != 1 {
				t.Fatalf("confirmed upstream inference was replayed: %d (%v)", count, err)
			}
			var original model.Task
			if err := db.First(&original, "id = ?", taskID).Error; err != nil || original.Status != model.TaskStatusSucceeded || original.ResultJSON != string(raw) {
				t.Fatal("confirmed upstream receipt was rewritten", err)
			}
			for _, event := range after.Events {
				if event.Type == "run_completed" || event.Type == "approval_requested" || event.Type == "tool_completed" || event.Type == "assistant_message" {
					t.Fatal("empty response invented a completion or action", event.Type)
				}
			}
		})
	}
}
