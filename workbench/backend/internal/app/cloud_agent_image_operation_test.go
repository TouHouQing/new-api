package app

import (
	"bytes"
	"context"
	"encoding/json"
	"strings"
	"testing"

	"gorm.io/gorm"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

func agentImageOperationFixture(t *testing.T, permission string, postgres ...bool) (*Service, *gorm.DB, *model.CloudAgentExecution, cloudAgentRuntime) {
	t.Helper()
	var s *Service
	var db *gorm.DB
	if len(postgres) > 0 && postgres[0] {
		s, db = newProjectNameConflictPostgresService(t)
		s.dataDir, s.disablePiRuntime, s.legacyCloudAgentRootTask = t.TempDir(), true, true
		if err := database.MigrateSchema(db); err != nil {
			t.Fatal(err)
		}
		profile := mustEncodeModelCapabilityConfig(t, DefaultModelCapabilityConfigForModel("chat-completion", "text-test"))
		for _, row := range []any{
			&model.User{ID: "user", Username: "user", Role: model.UserRoleUser, Status: model.UserStatusActive},
			&model.ModelChannel{ID: "channel", Scope: model.ChannelScopeSystem, Enabled: true},
			&model.ChannelModel{ID: "cm", ChannelID: "channel", ModelKey: "text-test", Capability: "text", Protocol: model.ChannelInterfaceChatCompletion, CapabilityConfigJSON: profile, BillingMode: "fixed_request", UnitPriceMicrocredits: 100, PriceConfigured: true, Enabled: true},
			&model.ChannelModelPriceTier{ID: "tier", ChannelModelID: "cm", SelectorKey: "{}", SelectorJSON: "{}", BillingMode: "fixed_request", UnitPriceMicrocredits: 100, PriceConfigured: true, Enabled: true},
			&model.CreditAccount{UserID: "user", AvailableMicrocredits: 10000},
		} {
			if err := db.Create(row).Error; err != nil {
				t.Fatal(err)
			}
		}
		t.Cleanup(func() { s.closeApprovedCloudAgentMediaWaiters(); sqlDB, _ := db.DB(); _ = sqlDB.Close() })
	} else {
		s, db, _, _ = creationTestService(t)
	}
	s.activeCancels = map[string]context.CancelFunc{}
	_, data := seedImageOperationSource(t, s, db)
	resource, _, err := s.storeResource("user", "image", "original.png", "image/png", int64(len(data)), 31, 23, 0, bytes.NewReader(data), nil, false)
	if err != nil {
		t.Fatal(err)
	}
	payload, _ := json.Marshal(map[string]any{"id": "agent-canvas", "title": "图片工作台", "nodes": []any{map[string]any{"id": "source-node", "type": "image", "title": "原图", "position": map[string]int{"x": 0, "y": 0}, "width": 310, "height": 230, "metadata": map[string]any{"storageKey": "resource:" + resource.ID, "content": resourceFileURL(resource.ID), "status": "success"}}}, "connections": []any{}})
	if err := s.repo.UpsertCanvasProject(&model.CanvasProject{ID: "agent-canvas", UserID: "user", Title: "图片工作台", PayloadJSON: string(payload)}); err != nil {
		t.Fatal(err)
	}
	req := agentTestRequest()
	req.PermissionMode = permission
	root, err := s.CreateCloudAgentRun("user", req, "")
	if err != nil {
		t.Fatal(err)
	}
	run, _ := s.repo.CloudAgent("user", root.ID)
	state, err := cloudAgentDecode(run)
	if err != nil {
		t.Fatal(err)
	}
	// The fixture drives tools without model execution; leave no carrier job for
	// the real CPU worker's claim. Approval/CPU/writeback use production code.
	if err := db.Model(&model.Task{}).Where("id IN ?", state.TaskIDs).Update("status", model.TaskStatusSucceeded).Error; err != nil {
		t.Fatal(err)
	}
	state.ActiveTaskID = ""
	call := cloudAgentCall{ID: "cpu-image-call-1"}
	call.Function.Name = "image_process"
	call.Function.Arguments = `{"sourceNodeId":"source-node","recipe":{"operation":"split","split":{"rows":2,"columns":3,"horizontalLines":[0.37],"verticalLines":[0.23,0.71]}}}`
	state.Calls = []cloudAgentCall{call}
	if err := s.repo.MutateCloudAgent("user", run.ID, run.Revision, func(current *model.CloudAgentExecution, _ *repository.Repository) error {
		return cloudAgentSave(current, &state)
	}); err != nil {
		t.Fatal(err)
	}
	run, _ = s.repo.CloudAgent("user", run.ID)
	return s, db, run, state
}

func reloadAgentImageOperation(t *testing.T, s *Service, id string) (*model.CloudAgentExecution, cloudAgentRuntime) {
	t.Helper()
	run, err := s.repo.CloudAgent("user", id)
	if err != nil {
		t.Fatal(err)
	}
	state, err := cloudAgentDecode(run)
	if err != nil {
		t.Fatal(err)
	}
	return run, state
}

func approveAgentImageOperation(t *testing.T, s *Service, id string) (*model.CloudAgentExecution, cloudAgentRuntime) {
	t.Helper()
	run, state := reloadAgentImageOperation(t, s, id)
	if run.Status != "waiting_approval" || state.Approval == nil || state.Approval.ImageOperation == nil {
		t.Fatalf("CPU operation not awaiting approval: %s", run.Status)
	}
	if err := s.DecideCloudAgentApproval("user", id, state.Approval.ID, "approve", ""); err != nil {
		t.Fatal(err)
	}
	s.closeApprovedCloudAgentMediaWaiters()
	run, state = reloadAgentImageOperation(t, s, id)
	if state.MediaTaskID == "" && state.CallIndex < len(state.Calls) && state.Approval != nil {
		if err := s.advanceCloudAgentTool(run, &state); err != nil {
			t.Fatal(err)
		}
	}
	return reloadAgentImageOperation(t, s, id)
}

func TestCloudAgentImageProcessApprovalNativeTaskAndRestartCompletion(t *testing.T) {
	for _, permission := range []string{"auto", "request_approval"} {
		for _, postgres := range []bool{false, true} {
			t.Run(permission, func(t *testing.T) {
				s, db, run, state := agentImageOperationFixture(t, permission, postgres)
				if err := s.advanceCloudAgentTool(run, &state); err != nil {
					t.Fatal(err)
				}
				run, state = reloadAgentImageOperation(t, s, run.ID)
				var count int64
				db.Model(&model.Task{}).Where("type = ?", model.TaskTypeImageOperation).Count(&count)
				before, _ := s.repo.CanvasProjectForUser("user", "agent-canvas")
				if count != 0 || state.Approval == nil || state.Approval.Preview.Kind != "image_operation" || !strings.Contains(state.Approval.Preview.Description, "费用为0") || strings.Count(before.PayloadJSON, `"type":"image"`) != 1 {
					t.Fatal("dry approval created a job/node or lost CPU explanation")
				}
				run, state = approveAgentImageOperation(t, s, run.ID)
				if state.MediaTaskID == "" || state.Generations != 0 {
					t.Fatal("approval did not enqueue exactly a CPU child")
				}
				taskID := state.MediaTaskID
				if err := s.advanceCloudAgentMedia(run, &state, state.Calls[0]); err != nil {
					t.Fatal(err)
				}
				task := runImageOperationTask(t, s, taskID)
				if task.Status != model.TaskStatusSucceeded || task.AgentRunID != run.ID || task.BillingOrderID != "" {
					t.Fatalf("CPU child state %+v", task)
				}
				// Decode the persisted state in a fresh service, as after a restart.
				fresh := &Service{repo: s.repo, dataDir: s.dataDir}
				run, state = reloadAgentImageOperation(t, s, run.ID)
				if err := fresh.advanceCloudAgentMedia(run, &state, state.Calls[0]); err != nil {
					t.Fatal(err)
				}
				_, state = reloadAgentImageOperation(t, s, run.ID)
				after, _ := s.repo.CanvasProjectForUser("user", "agent-canvas")
				var doc struct {
					Nodes       []any
					Connections []any
				}
				json.Unmarshal([]byte(after.PayloadJSON), &doc)
				if state.MediaTaskID != "" || state.Approval != nil || state.CallIndex != 1 || len(doc.Nodes) != 7 || len(doc.Connections) != 6 || !strings.Contains(after.PayloadJSON, "assetVersionId") {
					t.Fatal("CPU completion did not persist exact graph and tool checkpoint")
				}
				agentCanvasPatchForOperation(t, state, "image_process_complete")
				db.Model(&model.Task{}).Where("type = ?", model.TaskTypeImageOperation).Count(&count)
				if count != 1 {
					t.Fatal("duplicate CPU task")
				}
				currentDoc, _ := creationDocument(after.PayloadJSON)
				if _, err := s.UndoCloudAgentCanvas("user", run.ID, state.Calls[0].ID, cloudAgentCanvasHash(currentDoc), "撤销采用，保留素材"); err != nil {
					t.Fatal("native Agent undo failed", err)
				}
				// The same recipe in the same run reuses the owned child, but its
				// historical receipt must never override the later explicit undo.
				run, state = reloadAgentImageOperation(t, s, run.ID)
				repeat := state.Calls[0]
				repeat.ID = "cpu-image-call-2"
				state.Calls = append(state.Calls, repeat)
				if err := s.repo.MutateCloudAgent("user", run.ID, run.Revision, func(current *model.CloudAgentExecution, _ *repository.Repository) error {
					return cloudAgentSave(current, &state)
				}); err != nil {
					t.Fatal(err)
				}
				run, state = reloadAgentImageOperation(t, s, run.ID)
				if err := s.advanceCloudAgentTool(run, &state); err != nil {
					t.Fatal(err)
				}
				run, state = approveAgentImageOperation(t, s, run.ID)
				if state.MediaTaskID != "" {
					if err := s.advanceCloudAgentMedia(run, &state, state.Calls[state.CallIndex]); err != nil {
						t.Fatal(err)
					}
				}
				canvas, _ := s.repo.CanvasProjectForUser("user", "agent-canvas")
				if strings.Contains(canvas.PayloadJSON, "image-operation:") {
					t.Fatal("replay overrode later undo")
				}
				db.Model(&model.Task{}).Where("type = ?", model.TaskTypeImageOperation).Count(&count)
				if count != 1 {
					t.Fatal("repeat recipe created another CPU task")
				}
			})
		}
	}
}

func TestCloudAgentImageProcessReadOnlyRejectAndSourceChange(t *testing.T) {
	for _, scenario := range []string{"read_only", "reject", "source_changed_before_submit", "source_changed_after_processing", "cancel"} {
		t.Run(scenario, func(t *testing.T) {
			permission := "auto"
			if scenario == "read_only" {
				permission = scenario
			}
			s, db, run, state := agentImageOperationFixture(t, permission)
			if err := s.advanceCloudAgentTool(run, &state); err != nil {
				t.Fatal(err)
			}
			run, state = reloadAgentImageOperation(t, s, run.ID)
			if scenario == "reject" {
				if err := s.DecideCloudAgentApproval("user", run.ID, state.Approval.ID, "reject", ""); err != nil {
					t.Fatal(err)
				}
			} else if scenario == "source_changed_before_submit" {
				changeAgentImageSource(t, s, db)
				run, state = approveAgentImageOperation(t, s, run.ID)
			} else if scenario != "read_only" {
				run, state = approveAgentImageOperation(t, s, run.ID)
				if scenario == "cancel" {
					if err := s.CancelCloudAgent(context.Background(), "user", run.ID); err != nil {
						t.Fatal(err)
					}
					task, err := s.repo.Task(state.MediaTaskID)
					if err != nil || task.Status != model.TaskStatusCancelled {
						t.Fatal("cancel did not stop CPU child", err)
					}
				} else {
					runImageOperationTask(t, s, state.MediaTaskID)
					changeAgentImageSource(t, s, db)
					run, state = reloadAgentImageOperation(t, s, run.ID)
					if err := s.advanceCloudAgentMedia(run, &state, state.Calls[0]); err != nil {
						t.Fatal(err)
					}
				}
			}
			var count int64
			db.Model(&model.Task{}).Where("type = ?", model.TaskTypeImageOperation).Count(&count)
			want := int64(0)
			if scenario == "cancel" || scenario == "source_changed_after_processing" {
				want = 1
			}
			if count != want {
				t.Fatal("permission/rejection/source change submitted unexpected task", count)
			}
			canvas, _ := s.repo.CanvasProjectForUser("user", "agent-canvas")
			if strings.Contains(canvas.PayloadJSON, "image-operation:") {
				t.Fatal("rejected/changed source wrote output nodes")
			}
		})
	}
}

func changeAgentImageSource(t *testing.T, s *Service, db *gorm.DB) {
	t.Helper()
	canvas, err := s.repo.CanvasProjectForUser("user", "agent-canvas")
	if err != nil {
		t.Fatal(err)
	}
	doc, _ := creationDocument(canvas.PayloadJSON)
	creationMaps(doc["nodes"])[0]["metadata"].(map[string]any)["storageKey"] = "resource:changed"
	raw, _ := json.Marshal(doc)
	if err := db.Model(&model.CanvasProject{}).Where("id = ?", canvas.ID).Update("payload_json", string(raw)).Error; err != nil {
		t.Fatal(err)
	}
}
