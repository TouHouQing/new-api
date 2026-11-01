package app

import (
	"context"
	"encoding/json"
	"errors"
	"gorm.io/gorm"
	"sync"
	"testing"
	"time"
	"yingce/backend/internal/model"
)

func nativeCanvasBatchFixture(t *testing.T, s *Service, db *gorm.DB) CreateCanvasTaskBatchRequest {
	t.Helper()
	capability := mustEncodeModelCapabilityConfig(t, DefaultModelCapabilityConfigForModel(string(model.ChannelInterfaceChatCompletion), "text-test"))
	for _, row := range []any{
		&model.ModelChannel{ID: "channel", Scope: model.ChannelScopeSystem, Enabled: true, Name: "受控测试"},
		&model.ChannelModel{ID: "cm", ChannelID: "channel", ModelKey: "text-test", Capability: "text", Protocol: model.ChannelInterfaceChatCompletion, CapabilityConfigJSON: capability, BillingMode: "fixed_request", UnitPriceMicrocredits: 100, PriceConfigured: true, Enabled: true},
		&model.ChannelModelPriceTier{ID: "tier", ChannelModelID: "cm", SelectorKey: "{}", SelectorJSON: "{}", BillingMode: "fixed_request", UnitPriceMicrocredits: 100, PriceConfigured: true, Enabled: true},
		&model.CreditAccount{UserID: "user-1", AvailableMicrocredits: 10000},
		&model.CanvasProject{ID: "batch-canvas", UserID: "user-1", PayloadJSON: `{"nodes":[{"id":"source","type":"text","title":"故事","position":{"x":0,"y":0},"width":300,"height":200,"metadata":{"content":"原内容","status":"success"}}],"connections":[]}`},
	} {
		if err := db.Create(row).Error; err != nil {
			t.Fatal(err)
		}
	}
	req := CreateCanvasTaskBatchRequest{}
	for _, id := range []string{"first", "second", "third"} {
		item := creationTextRequest()
		item.ProjectID = "batch-canvas"
		item.Input["metadata"] = map[string]any{"nodeId": id, "clientOperationId": "canvas-batch:" + id, "canvasTaskDraft": map[string]any{"node": map[string]any{"id": id, "type": "text", "title": "分镜", "position": map[string]any{"x": 500., "y": 0.}, "width": 300., "height": 200., "metadata": map[string]any{"status": "loading"}}, "connections": []any{map[string]any{"id": "to-" + id, "fromNodeId": "source", "toNodeId": id, "fromHandleId": "story", "toHandleId": "prompt", "fromAnchorRatio": .25, "toAnchorRatio": .75, "relation": "storyboard-output", "storyboardRowId": "row-1"}}}}
		req.Tasks = append(req.Tasks, item)
	}
	return req
}

func TestCanvasTaskBatchAtomicAdmissionAndRestartReplay(t *testing.T) {
	planningBothDatabases(t, func(t *testing.T, s *Service, db *gorm.DB, _ model.Project, _ model.ProjectUnit) {
		req := nativeCanvasBatchFixture(t, s, db)
		tasks, err := s.CreateCanvasTaskBatch("user-1", req)
		if err != nil || len(tasks) != 3 {
			t.Fatal("batch admission", err)
		}
		var account model.CreditAccount
		db.First(&account, "user_id = ?", "user-1")
		if account.AvailableMicrocredits != 9700 || account.ReservedMicrocredits != 300 {
			t.Fatal("wrong native credit reservation", account)
		}
		project, _ := s.repo.CanvasProjectForUser("user-1", "batch-canvas")
		doc, _ := creationDocument(project.PayloadJSON)
		if len(creationMaps(doc["nodes"])) != 4 || len(creationMaps(doc["connections"])) != 3 {
			t.Fatal("partial batch document")
		}
		edge := creationMaps(doc["connections"])[0]
		if edge["fromHandleId"] != "story" || edge["toHandleId"] != "prompt" || edge["relation"] != "storyboard-output" || edge["storyboardRowId"] != "row-1" || edge["fromAnchorRatio"] != .25 {
			t.Fatal("lost actual port and storyboard relation", edge)
		}
		if err = db.Model(&model.ChannelModel{}).Where("id = ?", "cm").Update("enabled", false).Error; err != nil {
			t.Fatal(err)
		}
		restarted := &Service{repo: s.repo, dataDir: s.dataDir, disablePiRuntime: true}
		replay, err := restarted.CreateCanvasTaskBatch("user-1", req)
		if err != nil || len(replay) != 3 {
			t.Fatal("restart replay", err)
		}
		for i, task := range replay {
			if task.ID != tasks[i].ID {
				t.Fatal("batch duplicated original task")
			}
		}
		changed := req
		changed.Tasks = append([]CreateTaskRequest(nil), req.Tasks...)
		changed.Tasks[2].Prompt = "改变内容"
		_, err = restarted.CreateCanvasTaskBatch("user-1", changed)
		var conflict *AppError
		if !errors.As(err, &conflict) || conflict.Status != 409 {
			t.Fatal("changed batch intent reused child IDs", err)
		}
		for _, task := range tasks {
			if err = db.Model(&model.Task{}).Where("id = ?", task.ID).Updates(map[string]any{"status": model.TaskStatusSucceeded, "result_json": `{"text":"完整本地数据库验证结果"}`, "completed_at": time.Now()}).Error; err != nil {
				t.Fatal(err)
			}
			if err = restarted.reconcileCanvasTaskDelivery(context.Background(), task.ID); err != nil {
				t.Fatal(err)
			}
		}
		project, _ = s.repo.CanvasProjectForUser("user-1", "batch-canvas")
		doc, _ = creationDocument(project.PayloadJSON)
		for _, node := range creationMaps(doc["nodes"]) {
			if node["id"] == "source" {
				continue
			}
			meta := node["metadata"].(map[string]any)
			if meta["content"] != "完整本地数据库验证结果" || meta["status"] != "success" {
				t.Fatal("headless batch incomplete", node)
			}
		}
	})
}

func TestCanvasTaskBatchRollbackLeavesNoPartialNodesJobsOrReservations(t *testing.T) {
	for _, failure := range []string{"invalid-final-model", "credit-limit", "missing-existing-target", "foreign-owner"} {
		t.Run(failure, func(t *testing.T) {
			planningBothDatabases(t, func(t *testing.T, s *Service, db *gorm.DB, _ model.Project, _ model.ProjectUnit) {
				req := nativeCanvasBatchFixture(t, s, db)
				owner := "user-1"
				switch failure {
				case "invalid-final-model":
					req.Tasks[2].Model = "missing"
					req.Tasks[2].Input["config"].(map[string]any)["model"] = "missing"
				case "credit-limit":
					if err := db.Model(&model.CreditAccount{}).Where("user_id = ?", owner).Update("available_microcredits", 250).Error; err != nil {
						t.Fatal(err)
					}
				case "missing-existing-target":
					req.Tasks[2].Input["metadata"].(map[string]any)["canvasTaskDraft"].(map[string]any)["requireExisting"] = true
				case "foreign-owner":
					owner = "other"
				}
				before, _ := s.repo.CanvasProjectForUser("user-1", "batch-canvas")
				var balance model.CreditAccount
				db.First(&balance, "user_id = ?", "user-1")
				if _, err := s.CreateCanvasTaskBatch(owner, req); err == nil {
					t.Fatal("invalid batch accepted")
				}
				after, _ := s.repo.CanvasProjectForUser("user-1", "batch-canvas")
				if before.PayloadJSON != after.PayloadJSON || before.Revision != after.Revision {
					t.Fatal("partial canvas write")
				}
				for _, row := range []any{&model.Task{}, &model.BillingOrder{}} {
					var count int64
					if err := db.Model(row).Count(&count).Error; err != nil || count != 0 {
						t.Fatal("partial task or billing order", count, err)
					}
				}
				var final model.CreditAccount
				db.First(&final, "user_id = ?", "user-1")
				if final.AvailableMicrocredits != balance.AvailableMicrocredits || final.ReservedMicrocredits != balance.ReservedMicrocredits {
					t.Fatal("partial reservation")
				}
			})
		})
	}
}

func TestCanvasImageBatchDeliveryKeepsManualGeometryAndChosenResult(t *testing.T) {
	raw := `{"nodes":[{"id":"root","type":"image","position":{"x":40,"y":50},"width":500,"height":600,"metadata":{"isBatchRoot":true,"batchChildIds":["a","b","removed"],"primaryImageId":"b","manualSize":true}},{"id":"a","type":"image","width":300,"height":200,"metadata":{"batchRootId":"root","status":"success","storageKey":"resource:a","content":"/api/resources/a/file","taskId":"task-a"}},{"id":"b","type":"image","width":300,"height":200,"metadata":{"batchRootId":"root","status":"success","storageKey":"resource:b","content":"/api/resources/b/file","taskId":"task-b"}}],"connections":[]}`
	var doc map[string]any
	if err := json.Unmarshal([]byte(raw), &doc); err != nil {
		t.Fatal(err)
	}
	if !reconcileNativeCanvasImageBatch(doc, "a", "root") {
		t.Fatal("valid batch not reconciled")
	}
	root := creationMaps(doc["nodes"])[0]
	meta := root["metadata"].(map[string]any)
	if root["width"] != 500. || root["height"] != 600. || meta["primaryImageId"] != "b" || meta["content"] != "/api/resources/b/file" || meta["batchFailedCount"] != 1 || meta["status"] != "success" {
		t.Fatal("lost manual choice or hung deleted child", root)
	}
	if reconcileNativeCanvasImageBatch(doc, "obsolete", "root") {
		t.Fatal("obsolete task changed later batch")
	}
}

func TestCanvasTaskBatchConcurrentAdmissionsShareOneNativeReservation(t *testing.T) {
	planningBothDatabases(t, func(t *testing.T, s *Service, db *gorm.DB, _ model.Project, _ model.ProjectUnit) {
		request := nativeCanvasBatchFixture(t, s, db)
		other := &Service{repo: s.repo, dataDir: s.dataDir, disablePiRuntime: true}
		var group sync.WaitGroup
		start := make(chan struct{})
		results := make(chan []model.Task, 2)
		failures := make(chan error, 2)
		for _, writer := range []*Service{s, other} {
			group.Add(1)
			go func(service *Service) {
				defer group.Done()
				<-start
				tasks, err := service.CreateCanvasTaskBatch("user-1", request)
				if err != nil {
					failures <- err
				} else {
					results <- tasks
				}
			}(writer)
		}
		close(start)
		group.Wait()
		close(results)
		close(failures)
		for err := range failures {
			t.Fatal("concurrent batch rejected canonical replay", err)
		}
		var first []model.Task
		count := 0
		for tasks := range results {
			count++
			if first == nil {
				first = tasks
				continue
			}
			for index, task := range tasks {
				if task.ID != first[index].ID {
					t.Fatal("duplicate concurrent task")
				}
			}
		}
		if count != 2 {
			t.Fatal("both callers must receive canonical batch")
		}
		var account model.CreditAccount
		db.First(&account, "user_id = ?", "user-1")
		if account.AvailableMicrocredits != 9700 || account.ReservedMicrocredits != 300 {
			t.Fatal("concurrent double reservation", account)
		}
	})
}

func TestCanvasTaskBatchImageRootAndEveryTerminalStatePersistWithoutBrowser(t *testing.T) {
	planningBothDatabases(t, func(t *testing.T, s *Service, db *gorm.DB, _ model.Project, _ model.ProjectUnit) {
		req := nativeCanvasBatchFixture(t, s, db)
		capability := mustEncodeModelCapabilityConfig(t, DefaultModelCapabilityConfigForModel(string(model.ChannelInterfaceOpenAIImage), "gpt-image-1"))
		if err := db.Model(&model.ChannelModel{}).Where("id = ?", "cm").Updates(map[string]any{"model_key": "gpt-image-1", "capability": "image", "protocol": model.ChannelInterfaceOpenAIImage, "capability_config_json": capability}).Error; err != nil {
			t.Fatal(err)
		}
		children := []any{}
		for index := range req.Tasks {
			item := &req.Tasks[index]
			item.Type, item.Operation, item.Model = "canvas_image", "image", "gpt-image-1"
			item.Input["mode"] = "image"
			item.Input["config"] = map[string]any{"channelId": "channel", "model": "gpt-image-1", "count": "1", "size": "1024x1024"}
			draft := item.Input["metadata"].(map[string]any)["canvasTaskDraft"].(map[string]any)
			node := draft["node"].(map[string]any)
			node["type"] = "image"
			node["metadata"].(map[string]any)["batchRootId"] = "batch-root"
			draft["connections"].([]any)[0].(map[string]any)["fromNodeId"] = "batch-root"
			children = append(children, node["id"])
		}
		req.Root = &CanvasTaskDraft{Node: map[string]any{"id": "batch-root", "type": "image", "title": "三张候选", "position": map[string]any{"x": 400., "y": 100.}, "width": 300., "height": 200., "metadata": map[string]any{"isBatchRoot": true, "batchChildIds": children}}, Connections: []map[string]any{{"id": "to-root", "fromNodeId": "source", "toNodeId": "batch-root"}}}
		tasks, err := s.CreateCanvasTaskBatch("user-1", req)
		if err != nil {
			t.Fatal("image native admission", err)
		}
		resource := model.Resource{ID: "controlled-image", UserID: "user-1", Kind: "image", Status: "ready", MimeType: "image/png", Width: 800, Height: 400, Size: 400}
		if err = db.Create(&resource).Error; err != nil {
			t.Fatal(err)
		}
		restarted := &Service{repo: s.repo, dataDir: s.dataDir}
		for index, task := range tasks {
			status := []model.TaskStatus{model.TaskStatusSucceeded, model.TaskStatusFailed, model.TaskStatusCancelled}[index]
			result := ""
			if index == 0 {
				result = `{"images":[{"storageKey":"resource:controlled-image","dataUrl":"/api/resources/controlled-image/file"}]}`
			}
			if err = db.Model(&model.Task{}).Where("id = ?", task.ID).Updates(map[string]any{"status": status, "result_json": result, "completed_at": time.Now()}).Error; err != nil {
				t.Fatal(err)
			}
			if err = restarted.reconcileCanvasTaskDelivery(context.Background(), task.ID); err != nil {
				t.Fatal(err)
			}
		}
		project, _ := s.repo.CanvasProjectForUser("user-1", "batch-canvas")
		doc, _ := creationDocument(project.PayloadJSON)
		if len(creationMaps(doc["nodes"])) != 5 || len(creationMaps(doc["connections"])) != 4 {
			t.Fatal("incomplete root/children/edges")
		}
		for _, node := range creationMaps(doc["nodes"]) {
			if node["id"] != "batch-root" {
				continue
			}
			meta := node["metadata"].(map[string]any)
			if meta["status"] != "success" || meta["primaryImageId"] != "first" || meta["batchFailedCount"] != 2. || meta["storageKey"] != "resource:controlled-image" {
				t.Fatal("batch root did not converge", node)
			}
		}
	})
}

func TestCanvasTaskBatchTaskCenterRetryRebindsOriginalTargetAndRejectsDeletedTarget(t *testing.T) {
	planningBothDatabases(t, func(t *testing.T, s *Service, db *gorm.DB, _ model.Project, _ model.ProjectUnit) {
		req := nativeCanvasBatchFixture(t, s, db)
		tasks, err := s.CreateCanvasTaskBatch("user-1", req)
		if err != nil {
			t.Fatal(err)
		}
		for index := 0; index < 2; index++ {
			task := tasks[index]
			if _, err = s.CancelTask(context.Background(), "user-1", task.ID); err != nil {
				t.Fatal(err)
			}
			if err = s.reconcileCanvasTaskDelivery(context.Background(), task.ID); err != nil {
				t.Fatal(err)
			}
			if index == 1 {
				project, _ := s.repo.CanvasProjectForUser("user-1", "batch-canvas")
				doc, _ := creationDocument(project.PayloadJSON)
				kept := []any{}
				for _, node := range creationMaps(doc["nodes"]) {
					if node["id"] != "second" {
						kept = append(kept, node)
					}
				}
				doc["nodes"] = kept
				edges := []any{}
				for _, edge := range creationMaps(doc["connections"]) {
					if edge["toNodeId"] != "second" {
						edges = append(edges, edge)
					}
				}
				doc["connections"] = edges
				if err = saveCloudAgentDocument(s.repo, project, doc, defaultRuntimePolicy()); err != nil {
					t.Fatal(err)
				}
				var before model.CreditAccount
				db.First(&before, "user_id = ?", "user-1")
				if _, err = s.RetryTask("user-1", task.ID); err == nil {
					t.Fatal("deleted target allowed another billed generation")
				}
				original, _ := s.repo.Task(task.ID)
				if original.Status != model.TaskStatusCancelled {
					t.Fatal("rejected retry reopened original task")
				}
				var after model.CreditAccount
				db.First(&after, "user_id = ?", "user-1")
				if before.AvailableMicrocredits != after.AvailableMicrocredits || before.ReservedMicrocredits != after.ReservedMicrocredits {
					t.Fatal("rejected retry reserved more credits")
				}
				continue
			}
			retried, err := s.RetryTask("user-1", task.ID)
			if err != nil {
				t.Fatal(err)
			}
			if retried.ID != task.ID || retried.Status != model.TaskStatusQueued || retried.CanvasDeliveryStatus != "pending" || retried.CanvasDeliveryAttempts != 0 {
				t.Fatal("retry did not reset original delivery", retried)
			}
			project, _ := s.repo.CanvasProjectForUser("user-1", "batch-canvas")
			doc, _ := creationDocument(project.PayloadJSON)
			for _, node := range creationMaps(doc["nodes"]) {
				if node["id"] != "first" {
					continue
				}
				meta := node["metadata"].(map[string]any)
				if meta["taskId"] != task.ID || meta["taskStatus"] != "queued" || meta["status"] != "loading" || meta["errorDetails"] != nil {
					t.Fatal("retry left stale failure on canvas", node)
				}
			}
			if err = db.Model(&model.Task{}).Where("id = ?", task.ID).Updates(map[string]any{"status": model.TaskStatusSucceeded, "result_json": `{"text":"重试后完整结果"}`}).Error; err != nil {
				t.Fatal(err)
			}
			if err = s.reconcileCanvasTaskDelivery(context.Background(), task.ID); err != nil {
				t.Fatal(err)
			}
			saved, _ := s.repo.Task(task.ID)
			if saved.CanvasDeliveryStatus != "applied" {
				t.Fatal("retried result not delivered")
			}
		}
	})
}

func TestCanvasTaskBatchConfigSourceFinishesOnlyCurrentGeneration(t *testing.T) {
	planningBothDatabases(t, func(t *testing.T, s *Service, db *gorm.DB, _ model.Project, _ model.ProjectUnit) {
		req := nativeCanvasBatchFixture(t, s, db)
		if err := db.Model(&model.CanvasProject{}).Where("id = ?", "batch-canvas").Update("payload_json", `{"nodes":[{"id":"source","type":"config","position":{"x":0,"y":0},"width":300,"height":200,"metadata":{}}],"connections":[]}`).Error; err != nil {
			t.Fatal(err)
		}
		for index := range req.Tasks {
			req.Tasks[index].Input["metadata"].(map[string]any)["sourceNodeId"] = "source"
		}
		tasks, err := s.CreateCanvasTaskBatch("user-1", req)
		if err != nil {
			t.Fatal(err)
		}
		project, _ := s.repo.CanvasProjectForUser("user-1", "batch-canvas")
		doc, _ := creationDocument(project.PayloadJSON)
		source := creationMaps(doc["nodes"])[0]["metadata"].(map[string]any)
		if len(source["generationTargetNodeIds"].([]any)) != 3 {
			t.Fatal("batch source lost child membership")
		}
		for _, task := range tasks {
			if err = db.Model(&model.Task{}).Where("id = ?", task.ID).Updates(map[string]any{"status": model.TaskStatusSucceeded, "result_json": `{"text":"完整结果"}`}).Error; err != nil {
				t.Fatal(err)
			}
			if err = s.reconcileCanvasTaskDelivery(context.Background(), task.ID); err != nil {
				t.Fatal(err)
			}
		}
		project, _ = s.repo.CanvasProjectForUser("user-1", "batch-canvas")
		doc, _ = creationDocument(project.PayloadJSON)
		source = creationMaps(doc["nodes"])[0]["metadata"].(map[string]any)
		if source["status"] != "success" {
			t.Fatal("completed batch left source config loading")
		}
		source["generationTargetNodeIds"] = []any{"later-target"}
		source["status"] = "loading"
		if reconcileNativeCanvasGenerationSource(doc, "first") || source["status"] != "loading" {
			t.Fatal("old batch overwrote later config generation")
		}
	})
}
