package app

import (
	"encoding/json"
	"gorm.io/gorm"
	"io"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"strings"
	"sync"
	"testing"
	"time"
	"yingce/backend/internal/model"
)

// Declared model-protocol fixtures exercise the real coordinator, approvals,
// native writes and stored checkpoints. They are not actual local inference.
func TestNativeProductionRuntimeNativeProjectUnitAndReceiptReplay(t *testing.T) {
	for _, mode := range []string{"auto", "request_approval"} {
		t.Run(mode, func(t *testing.T) {
			if _, err := exec.LookPath("node"); err != nil {
				t.Skip("node required")
			}
			if _, err := agentRuntimeDirForTest(); err != nil {
				t.Skip(err.Error())
			}
			t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
			t.Setenv("REDIS_URL", "")
			var s *Service
			var testDB *gorm.DB
			var mu sync.Mutex
			requests := 0
			var handlerErr error
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				io.Copy(io.Discard, r.Body)
				mu.Lock()
				requests++
				step := requests
				mu.Unlock()
				w.Header().Set("Content-Type", "application/json")
				if step >= 6 {
					io.WriteString(w, `{"choices":[{"message":{"content":"原生项目与章节已创建，旧回执未覆盖后续修改。"}}]}`)
					return
				}
				action, intent, body := "project.create", "production-runtime-project-01", map[string]any{"name": "Agent实际原生项目", "type": "short-drama", "sourceType": "blank", "aspectRatio": "16:9"}
				if step >= 4 {
					action, intent, body = "unit.create", "production-runtime-unit-0001", map[string]any{"kind": "chapter", "title": "第一章", "sourceText": "<p>原创建正文</p>", "position": 0}
				}
				if step == 5 {
					var unit model.ProjectUnit
					canvas, readErr := s.repo.CanvasProjectForUser("user", "agent-canvas")
					if readErr == nil {
						readErr = testDB.Where("project_id = ?", canvas.ProjectID).First(&unit).Error
					}
					if readErr != nil {
						mu.Lock()
						handlerErr = readErr
						mu.Unlock()
					} else {
						_, err := s.UpdateProjectUnit("user", unit.ProjectID, unit.ID, UpdateProjectUnitRequest{ExpectedUpdatedAt: &unit.UpdatedAt, Title: "用户后来改的章节", SourceText: "<p>用户后来改的正文</p>", Status: "ready"})
						if err != nil {
							mu.Lock()
							handlerErr = err
							mu.Unlock()
						}
					}
				}
				args, _ := json.Marshal(map[string]any{"action": action, "intentId": intent, "arguments": map[string]any{"request": body}})
				tool := "production_edit"
				if step == 1 {
					tool = "production_catalog"
					args = []byte(`{"action":"project.create"}`)
				}
				if step == 3 {
					tool = "production_read"
					args = []byte(`{"action":"project.get","arguments":{}}`)
				}
				json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{"message": map[string]any{"content": "", "tool_calls": []any{map[string]any{"id": "production-call-" + string(rune('0'+step)), "type": "function", "function": map[string]any{"name": tool, "arguments": string(args)}}}}}}})
			}))
			defer upstream.Close()
			initial, db, _, _ := creationTestService(t)
			testDB = db
			s = New(initial.repo, initial.dataDir)
			t.Cleanup(func() { s.Close() })
			if err := db.Model(&model.ModelChannel{}).Where("id = ?", "channel").Updates(map[string]any{"base_url": upstream.URL, "api_key": "declared-test-only"}).Error; err != nil {
				t.Fatal(err)
			}
			if err := db.Create(&model.CanvasProject{ID: "agent-canvas", UserID: "user", Title: "原生制作", PayloadJSON: `{"nodes":[],"connections":[]}`, Revision: 1}).Error; err != nil {
				t.Fatal(err)
			}
			stop := make(chan struct{})
			defer close(stop)
			go func() {
				for {
					select {
					case <-stop:
						return
					default:
					}
					s.ProcessNextTask()
					time.Sleep(20 * time.Millisecond)
				}
			}()
			request := agentTestRequest()
			request.PermissionMode = mode
			request.ContextScope = []string{"canvas", "project"}
			request.ProductionProjectID = "client-cannot-choose-this-project"
			run, err := s.CreateCloudAgentRun("user", request, "")
			if err != nil {
				t.Fatal(err)
			}
			approvals := map[string]bool{}
			deadline := time.Now().Add(60 * time.Second)
			completed := false
			for time.Now().Before(deadline) {
				current, err := s.CloudAgentRun("user", run.ID)
				if err != nil {
					t.Fatal(err)
				}
				if current.Status == "completed" {
					completed = true
					break
				}
				if current.Status == "failed" || current.Status == "rejected" || current.Status == "cancelled" {
					t.Fatalf("production runtime stopped: %+v", current)
				}
				if current.Status == "waiting_approval" && current.Approval != nil && !approvals[current.Approval.ID] {
					approvals[current.Approval.ID] = true
					if err := s.DecideCloudAgentApproval("user", run.ID, current.Approval.ID, "approve", "确认本轮原生制作"); err != nil {
						t.Fatal(err)
					}
				}
				time.Sleep(25 * time.Millisecond)
			}
			if !completed {
				t.Fatal("native production runtime did not complete")
			}
			mu.Lock()
			failure, calls := handlerErr, requests
			mu.Unlock()
			if failure != nil {
				if execution, readErr := s.repo.CloudAgent("user", run.ID); readErr == nil {
					for _, event := range execution.Journal {
						if strings.Contains(event.EventJSON, "tool_failed") {
							t.Log(event.EventJSON)
						}
					}
				}
				t.Fatal(failure)
			}
			if calls != 6 {
				t.Fatalf("unexpected model-protocol calls: %d", calls)
			}
			canvas, err := s.repo.CanvasProjectForUser("user", "agent-canvas")
			if err != nil {
				t.Fatal(err)
			}
			var units []model.ProjectUnit
			if err := db.Where("project_id = ?", canvas.ProjectID).Find(&units).Error; err != nil || len(units) != 1 || units[0].SourceText != "<p>用户后来改的正文</p>" || units[0].Title != "用户后来改的章节" {
				t.Fatalf("receipt replay duplicated or overwrote native units: %+v %v", units, err)
			}
			if canvas.ProjectID != units[0].ProjectID {
				t.Fatal("new project did not retain native canvas binding")
			}
			execution, err := s.repo.CloudAgent("user", run.ID)
			if err != nil {
				t.Fatal(err)
			}
			for _, name := range []string{"production_catalog", "production_read"} {
				matched := false
				for _, event := range execution.Journal {
					if strings.Contains(event.EventJSON, `"type":"tool_completed"`) && strings.Contains(event.EventJSON, `"toolName":"`+name+`"`) {
						matched = true
					}
				}
				if !matched {
					t.Fatalf("native %s never returned through the actual coordinator", name)
				}
			}
			state, err := cloudAgentDecode(execution)
			if err != nil {
				t.Fatal(err)
			}
			if state.Request.ProductionProjectID != "" || state.CreatedProductionProjectID != canvas.ProjectID || len(state.ProductionIntents) != 2 {
				t.Fatal("server scope or original native intents were not preserved")
			}
			for _, intent := range state.ProductionIntents {
				if !intent.Complete {
					t.Fatal("native result lacks durable completion")
				}
			}
			if mode == "request_approval" && len(approvals) != 2 || mode == "auto" && len(approvals) != 0 {
				t.Fatal("native receipt recovery requested repeated approval")
			}
			if strings.Contains(execution.StateJSON, "client-cannot-choose-this-project") {
				t.Fatal("caller-controlled project escaped into native execution")
			}
		})
	}
}
