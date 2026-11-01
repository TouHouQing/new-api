package app

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

func TestTaskHistoryCompletePagingSearchAndPrivateFields(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	for _, c := range []model.CanvasProject{{ID: "history-owned", UserID: "owner", Title: "较早的剪辑画布", PayloadJSON: `{"private":"canvas-private-marker"}`}, {ID: "history-foreign", UserID: "other", Title: "foreign-private-title", PayloadJSON: `{}`}} {
		if err := db.Create(&c).Error; err != nil {
			t.Fatal(err)
		}
	}
	now := time.Now().UTC()
	statuses := []model.TaskStatus{model.TaskStatusQueued, model.TaskStatusRunning, model.TaskStatusSucceeded, model.TaskStatusFailed, model.TaskStatusCancelled}
	rows := make([]model.Task, 0, 137)
	for i := 0; i < 135; i++ {
		prompt := fmt.Sprintf("真实历史记录 %03d", i)
		if i == 0 {
			prompt = "只匹配原文 100%_ 产品"
		}
		if i == 1 {
			prompt = "不匹配 100abcd 产品"
		}
		rows = append(rows, model.Task{ID: fmt.Sprintf("history-%03d", i), UserID: "owner", ProjectID: "history-owned", Type: "canvas_text", Status: statuses[i%5], Model: "model-a", Prompt: prompt, InputJSON: `{"apiKey":"input-private-marker"}`, ResultJSON: `{"text":"result-private-marker"}`, CreatedAt: now.Add(time.Duration(i-135) * time.Minute), UpdatedAt: now})
	}
	rows = append(rows, model.Task{ID: "foreign-owner-task", UserID: "other", ProjectID: "history-owned", Type: "canvas_text", Model: "foreign-private-model", Prompt: "owner must not find this", Status: model.TaskStatusSucceeded, CreatedAt: now, InputJSON: `{}`}, model.Task{ID: "owned-task-foreign-canvas", UserID: "owner", ProjectID: "history-foreign", Type: "canvas_image", Model: "model-b", Prompt: "引用暂不可用", Status: model.TaskStatusSucceeded, CreatedAt: now, InputJSON: `{}`})
	if err := db.CreateInBatches(rows, 25).Error; err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	for page := 1; page <= 7; page++ {
		result, err := s.TaskHistory("owner", TaskHistoryRequest{Page: page, PageSize: 20, TimeZone: "Asia/Shanghai"})
		if err != nil {
			t.Fatal(err)
		}
		if result.Total != 136 || result.Stats.Total != 136 || result.Stats.Active != 54 || result.Stats.Succeeded != 28 || result.Stats.Failed != 54 {
			t.Fatalf("full history/stats truncated: %+v", result.Stats)
		}
		if len(result.Canvases) != 1 || result.Canvases[0].ID != "history-owned" || len(result.Models) != 2 {
			t.Fatal("history facets lost older records or leaked foreign labels", result.Canvases, result.Models)
		}
		encoded, _ := json.Marshal(result)
		for _, marker := range []string{"input-private-marker", "result-private-marker", "canvas-private-marker", "foreign-private-title", "foreign-private-model", "inputJson", "resultJson"} {
			if strings.Contains(string(encoded), marker) {
				t.Fatalf("history leaked protected field %s", marker)
			}
		}
		for _, task := range result.Tasks {
			if seen[task.ID] || task.ID == "foreign-owner-task" {
				t.Fatal("repeated or foreign task", task.ID)
			}
			seen[task.ID] = true
		}
	}
	if len(seen) != 136 || !seen["history-000"] {
		t.Fatal("oldest record was not reachable")
	}
	for _, item := range []struct {
		query string
		count int64
	}{{"100%_", 1}, {"history-000", 1}, {"较早的剪辑画布", 135}, {"foreign-private-title", 0}, {"input-private-marker", 0}, {"result-private-marker", 0}} {
		result, err := s.TaskHistory("owner", TaskHistoryRequest{Page: 1, PageSize: 20, Query: item.query})
		if err != nil || result.Total != item.count {
			t.Fatalf("search %q: got %d want %d, %v", item.query, result.Total, item.count, err)
		}
	}
}

func TestTaskHistoryFiltersAllRecordsAndRetainsIndependentStatusCounts(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	rows := []model.Task{
		{ID: "text", UserID: "owner", Type: "canvas_text", Model: "qwen", Status: model.TaskStatusSucceeded},
		{ID: "image", UserID: "owner", Type: "image_operation", Model: "flux", Status: model.TaskStatusFailed},
		{ID: "video", UserID: "owner", Type: "video_image_to_video", Model: "wan", Status: model.TaskStatusCancelled},
		{ID: "voice", UserID: "owner", Type: "canvas_audio", Model: "voice", Status: model.TaskStatusRunning},
		{ID: "other-voice", UserID: "other", Type: "canvas_audio", Model: "voice", Status: model.TaskStatusRunning},
	}
	for _, row := range rows {
		row.InputJSON = `{}`
		if err := db.Create(&row).Error; err != nil {
			t.Fatal(err)
		}
	}
	for _, kind := range []string{"text", "image", "video", "audio"} {
		result, err := s.TaskHistory("owner", TaskHistoryRequest{Page: 1, PageSize: 1, Kind: kind})
		if err != nil || result.Total != 1 || len(result.Tasks) != 1 {
			t.Fatalf("kind %s: %+v %v", kind, result, err)
		}
	}
	result, err := s.TaskHistory("owner", TaskHistoryRequest{Page: 1, PageSize: 20, Status: "failed"})
	if err != nil || result.Total != 2 || result.Stats.Total != 4 || result.Stats.Active != 1 || result.Stats.Failed != 2 || result.Stats.Succeeded != 1 {
		t.Fatalf("independent overview was restricted to the selected status: %+v %v", result, err)
	}
	result, err = s.TaskHistory("owner", TaskHistoryRequest{Page: 1, PageSize: 20, Model: "voice", Status: "active", Kind: "audio"})
	if err != nil || result.Total != 1 || result.Tasks[0].ID != "voice" {
		t.Fatal("combined filters crossed owners", err)
	}
	result, err = s.TaskHistory("owner", TaskHistoryRequest{Page: 100, PageSize: 20})
	if err != nil || result.Total != 4 || len(result.Tasks) != 0 {
		t.Fatal("past-last-page request changed total or returned unrelated tasks", err)
	}
}

func TestTaskHistoryRejectsInvalidScopeAndTimeZone(t *testing.T) {
	s, _ := newMediaRecoveryTestService(t)
	requests := []TaskHistoryRequest{{Page: 0, PageSize: 20}, {Page: 1_000_001, PageSize: 20}, {Page: 1, PageSize: 101}, {Page: 1, PageSize: 20, Kind: "music"}, {Page: 1, PageSize: 20, Status: "anything"}, {Page: 1, PageSize: 20, TimeZone: "Local"}, {Page: 1, PageSize: 20, TimeZone: "No/Such_Zone"}, {Page: 1, PageSize: 20, Query: strings.Repeat("x", 1025)}}
	for _, req := range requests {
		if _, err := s.TaskHistory("owner", req); err == nil {
			t.Fatal("invalid history request accepted", req)
		}
	}
	if _, err := s.TaskHistory(" ", TaskHistoryRequest{Page: 1, PageSize: 20}); err == nil {
		t.Fatal("missing owner accepted")
	}
}

func TestTaskHistoryTodayUsesRequestedLocalMidnight(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	zone, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().In(zone)
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, zone)
	for i, at := range []time.Time{start.Add(-time.Second), start, start.Add(time.Hour), start.AddDate(0, 0, 1)} {
		row := model.Task{ID: fmt.Sprintf("day-%d", i), UserID: "owner", Type: "canvas_text", Status: model.TaskStatusSucceeded, InputJSON: `{}`, CreatedAt: at.UTC()}
		if err := db.Create(&row).Error; err != nil {
			t.Fatal(err)
		}
	}
	result, err := s.TaskHistory("owner", TaskHistoryRequest{Page: 1, PageSize: 20, TimeZone: "Asia/Shanghai"})
	if err != nil || result.Stats.Total != 4 || result.Stats.Today != 2 {
		t.Fatalf("local day boundary: %+v %v", result.Stats, err)
	}
}

func TestTaskHistoryAgentReadIsScopedAndUsesReadBudget(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	state := &cloudAgentRuntime{Request: agentTestRequest()}
	if err := db.Create(&model.CanvasProject{ID: state.Request.CanvasID, UserID: "user", Title: "当前画布历史", PayloadJSON: `{}`}).Error; err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 42; i++ {
		owner, canvas := "user", state.Request.CanvasID
		if i == 40 {
			owner = "someone-else"
		}
		if i == 41 {
			canvas = "different-canvas"
		}
		row := model.Task{ID: fmt.Sprintf("agent-history-%02d", i), UserID: owner, ProjectID: canvas, Type: "canvas_text", Status: model.TaskStatusSucceeded, Model: "local-qwen", Prompt: fmt.Sprintf("历史内容 %d", i), InputJSON: `{}`, CreatedAt: time.Now().Add(-time.Duration(i) * time.Hour)}
		if err := db.Create(&row).Error; err != nil {
			t.Fatal(err)
		}
	}
	call := cloudAgentCall{ID: "history-read"}
	call.Function.Name, call.Function.Arguments = "task_history", `{"query":"agent-history-39","page":1,"pageSize":20}`
	value, err := cloudAgentReadToolCached(s.repo, "user", state, call, s)
	if err != nil {
		t.Fatal(err)
	}
	result := value.(map[string]any)
	if result["total"] != int64(1) || result["tasks"].([]TaskSummary)[0].ID != "agent-history-39" || result["canvases"] != nil || state.ReadToolCalls != 1 || cloudAgentWrite("task_history") || cloudAgentReadToolCacheable("task_history") {
		t.Fatal("history bypassed canvas scope/read budget or returned unrelated facets", result)
	}
	for _, arguments := range []string{`{"query":"agent-history-40"}`, `{"query":"agent-history-41"}`} {
		call.Function.Arguments = arguments
		result, err := cloudAgentReadToolCached(s.repo, "user", state, call, s)
		if err != nil || result.(map[string]any)["total"] != int64(0) {
			t.Fatal("Agent history crossed ownership or canvas boundary", err)
		}
	}
	for _, arguments := range []string{`{"page":0}`, `{"pageSize":51}`, `{"projectId":"different-canvas"}`} {
		call.Function.Arguments = arguments
		if _, err := cloudAgentReadToolCached(s.repo, "user", state, call, s); err == nil {
			t.Fatal("invalid or cross-scope read arguments accepted", arguments)
		}
	}
}

func TestTaskHistoryRecordedCarriersRemainDistinctAndFilterable(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	for index, status := range []model.TaskStatus{model.TaskStatusTextReplay, model.TaskStatusTextReplay, model.TaskStatusQueued, model.TaskStatusSucceeded, model.TaskStatusFailed} {
		if err := db.Create(&model.Task{ID: fmt.Sprintf("recorded-%d", index), UserID: "owner", Type: "canvas_text", Status: status, Prompt: "本人历史", InputJSON: `{}`, CreatedAt: time.Now()}).Error; err != nil {
			t.Fatal(err)
		}
	}
	if err := db.Create(&model.Task{ID: "recorded-foreign", UserID: "other", Type: "canvas_text", Status: model.TaskStatusTextReplay, Prompt: "其他人的对话", InputJSON: `{}`}).Error; err != nil {
		t.Fatal(err)
	}
	page, err := s.TaskHistory("owner", TaskHistoryRequest{Page: 1, PageSize: 20, Status: "recorded"})
	if err != nil || page.Total != 2 || len(page.Tasks) != 2 || page.Stats.Recorded != 2 || page.Stats.Total != 5 || page.Stats.Active != 1 || page.Stats.Succeeded != 1 || page.Stats.Failed != 1 {
		t.Fatalf("conversation carriers mixed with inference state: %+v %v", page, err)
	}
	if page.Stats.Total != page.Stats.Active+page.Stats.Succeeded+page.Stats.Failed+page.Stats.Recorded {
		t.Fatal("history counts do not account for the carriers")
	}
	for _, row := range page.Tasks {
		if row.Status != model.TaskStatusTextReplay || row.Billing != nil || row.ID == "recorded-foreign" {
			t.Fatal("readonly carrier acquired billing or crossed ownership", row)
		}
	}
	all, err := s.TaskHistory("owner", TaskHistoryRequest{Page: 1, PageSize: 20})
	if err != nil || all.Total != 5 || all.Stats != page.Stats {
		t.Fatal("status filtering changed whole-history counts", err)
	}
}

func TestTaskHistoryAgentRuntimeBridgeUsesServiceBeforeCheckpoint(t *testing.T) {
	s, db, _, _ := creationTestService(t)
	req := agentTestRequest()
	req.PermissionMode = "read_only"
	if err := db.Create(&model.CanvasProject{ID: req.CanvasID, UserID: "user", Title: "桥接历史", PayloadJSON: `{"nodes":[]}`}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.Task{ID: "history-bridge-task", UserID: "user", ProjectID: req.CanvasID, Type: "canvas_text", Status: model.TaskStatusSucceeded, Prompt: "历史桥接", InputJSON: `{}`, CreatedAt: time.Now()}).Error; err != nil {
		t.Fatal(err)
	}
	run, err := s.CreateCloudAgentRun("user", req, "")
	if err != nil {
		t.Fatal(err)
	}
	persisted, err := s.repo.CloudAgent("user", run.ID)
	if err != nil {
		t.Fatal(err)
	}
	state, err := cloudAgentDecode(persisted)
	if err != nil {
		t.Fatal(err)
	}
	call := cloudAgentCall{ID: "actual-history-bridge"}
	call.Function.Name, call.Function.Arguments = "task_history", `{"query":"history-bridge-task","page":1,"pageSize":20}`
	state.Calls, state.CallIndex = []cloudAgentCall{call}, 0
	state.Canonical.Messages = append(state.Canonical.Messages, map[string]any{"role": "assistant", "tool_calls": state.Calls})
	if err := s.repo.MutateCloudAgent("user", run.ID, persisted.Revision, func(current *model.CloudAgentExecution, _ *repository.Repository) error {
		return cloudAgentSave(current, &state)
	}); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		result, err := s.executeCloudAgentRuntimeTool(context.Background(), "user", run.ID, call)
		if err != nil {
			t.Fatal(err)
		}
		content, _ := result.(map[string]any)["content"].(string)
		var history struct {
			Tasks []TaskSummary `json:"tasks"`
			Total int64         `json:"total"`
		}
		if err := json.Unmarshal([]byte(content), &history); err != nil || history.Total != 1 || len(history.Tasks) != 1 || history.Tasks[0].ID != "history-bridge-task" || strings.Contains(content, `"canvases"`) {
			t.Fatalf("runtime history lost service, canvas scope or replay: %s %v", content, err)
		}
	}
	persisted, err = s.repo.CloudAgent("user", run.ID)
	if err != nil {
		t.Fatal(err)
	}
	state, err = cloudAgentDecode(persisted)
	if err != nil || state.ReadToolCalls != 1 {
		t.Fatalf("replayed tool spent another read: %d %v", state.ReadToolCalls, err)
	}
}
