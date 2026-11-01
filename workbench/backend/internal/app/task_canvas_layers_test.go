package app

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"strings"
	"testing"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
	"yingce/backend/internal/protocol"
)

// These are stored PNG software/protocol fixtures, not dedicated-model runs.
func dedicatedLayerFixture(t *testing.T, s *Service, db *gorm.DB) (*model.Task, []string) {
	t.Helper()
	source := seedNativeImageLayerGroup(t, s, db)
	root := map[string]any{"id": "dedicated-root", "type": "image", "title": "用户作品", "position": map[string]any{"x": 1200., "y": 800.}, "width": 470., "height": 290., "metadata": map[string]any{"status": "loading", "manualSize": true, "layerDecomposition": map[string]any{"sourceNodeId": "layer-base", "canvas": map[string]any{"width": 31, "height": 23}}}}
	input, _ := json.Marshal(map[string]any{"mode": "image", "metadata": map[string]any{"nodeId": root["id"], "layerDecomposition": true, "canvasTaskDraft": map[string]any{"node": root}}})
	task := &model.Task{ID: "dedicated-software-contract", UserID: "image-user", ProjectID: source.CanvasID, Type: "canvas_image", Status: model.TaskStatusQueued, Model: "software-contract-fixture", Attempts: 1, InputJSON: string(input), CreatedAt: time.Now()}
	if err := s.createTaskWithinStorageQuota(task, nil, defaultRuntimePolicy()); err != nil {
		t.Fatal(err)
	}
	ids := []string{source.Composition.Layers[0].ResourceID, source.Composition.Layers[1].ResourceID}
	return task, ids
}

func completeDedicatedLayerFixture(t *testing.T, s *Service, db *gorm.DB, task *model.Task, ids []string) {
	t.Helper()
	checkpoint := mediaCheckpoint{Mode: "image", StartedAt: time.Now()}
	outputs := []any{}
	for index, id := range ids {
		checkpoint.Items = append(checkpoint.Items, mediaCheckpointItem{ResourceID: id, MIMEType: "image/png", Reference: protocol.MediaReference{Name: fmt.Sprintf("layer-%d", index)}})
		outputs = append(outputs, map[string]any{"storageKey": "resource:" + id, "dataUrl": resourceFileURL(id), "width": 31, "height": 23})
	}
	raw, _ := json.Marshal(checkpoint)
	var err error
	task.MediaRecoveryJSON, err = s.encryptSettingSecret(string(raw))
	if err != nil {
		t.Fatal(err)
	}
	task.Status = model.TaskStatusRunning
	if err := db.Model(task).Updates(map[string]any{"status": task.Status, "media_recovery_json": task.MediaRecoveryJSON}).Error; err != nil {
		t.Fatal(err)
	}
	result, _ := json.Marshal(map[string]any{"images": outputs})
	if err := s.saveTaskCompletionWithinStorageQuota(task, result, nil, false); err != nil {
		t.Fatal(err)
	}
}

func dedicatedLayerRoot(t *testing.T, s *Service, task *model.Task) (*model.CanvasProject, map[string]any, map[string]any) {
	t.Helper()
	project, err := s.repo.CanvasProjectForUser(task.UserID, task.ProjectID)
	if err != nil {
		t.Fatal(err)
	}
	doc, err := creationDocument(project.PayloadJSON)
	if err != nil {
		t.Fatal(err)
	}
	for _, node := range creationMaps(doc["nodes"]) {
		if node["id"] == "dedicated-root" {
			return project, doc, node
		}
	}
	t.Fatal("missing original placeholder")
	return nil, nil, nil
}

func verifyDedicatedLayerDelivery(t *testing.T, s *Service, db *gorm.DB) {
	t.Helper()
	task, ids := dedicatedLayerFixture(t, s, db)
	completeDedicatedLayerFixture(t, s, db, task, ids)
	stored, err := s.repo.Task(task.ID)
	if err != nil || stored.Status != model.TaskStatusSucceeded || stored.Attempts != 1 || stored.CanvasDeliveryStatus != "applied" {
		t.Fatal("original model task was not closed once", stored, err)
	}
	_, doc, root := dedicatedLayerRoot(t, s, task)
	meta := root["metadata"].(map[string]any)
	marker, _ := meta["nativeLayerDecomposition"].(map[string]any)
	if marker["sourceTaskId"] != task.ID || marker["resultSha256"] != cutSignature(stored.ResultJSON) || root["title"] != "用户作品" || root["width"] != 470. || root["height"] != 290. || root["position"].(map[string]any)["x"] != 1200. {
		t.Fatal("group lost provenance or user geometry", root)
	}
	children := 0
	for _, node := range creationMaps(doc["nodes"]) {
		childMeta, _ := node["metadata"].(map[string]any)
		if childMeta["batchRootId"] != root["id"] {
			continue
		}
		children++
		index := int(childMeta["imageLayer"].(map[string]any)["outputIndex"].(float64))
		if childMeta["storageKey"] != "resource:"+ids[index] || childMeta["assetId"] != generationMediaAssetID(task.ID, index) || stringValue(childMeta["assetVersionId"]) == "" {
			t.Fatal("layer output/version mapping is not exact", node)
		}
	}
	if children != 2 || len(creationMaps(doc["nodes"])) != 6 {
		t.Fatal("missing layers or duplicate root", doc)
	}
	composeID := stringValue(marker["compositeTaskId"])
	if composeID == "" {
		t.Fatal("no queued native compose")
	}
	if s.requireReadyImageLayerGroup(task.UserID, task.ProjectID, "dedicated-root") == nil {
		t.Fatal("temporary first image was usable as composite")
	}
	complete := runImageOperationTask(t, s, composeID)
	if complete.Status != model.TaskStatusSucceeded || complete.ImageLayerDeliveryStatus != "applied" {
		t.Fatal("real CPU compose did not close", complete.Error, complete.ImageLayerDeliveryStatus)
	}
	if err := s.requireReadyImageLayerGroup(task.UserID, task.ProjectID, "dedicated-root"); err != nil {
		t.Fatal(err)
	}
	if ready, err := s.dedicatedLayerTaskReady(stored, "dedicated-root"); err != nil || !ready {
		t.Fatal("Agent could not use the exact composed group", ready, err)
	}
	project, doc, root := dedicatedLayerRoot(t, s, task)
	meta = root["metadata"].(map[string]any)
	if meta["storageKey"] == "resource:"+ids[0] || meta["storageKey"] == "resource:"+ids[1] || meta["assetVersionId"] == nil {
		t.Fatal("individual layer impersonated the composed output", meta)
	}
	// Simulate a later user edit/deletion followed by restart and an old delivery.
	root["title"] = "已编辑作品"
	kept := []any{}
	deleted := false
	for _, node := range creationMaps(doc["nodes"]) {
		if !deleted && node["metadata"].(map[string]any)["batchRootId"] == root["id"] {
			deleted = true
			continue
		}
		kept = append(kept, node)
	}
	doc["nodes"] = kept
	if err := saveCloudAgentDocument(s.repo, project, doc, defaultRuntimePolicy()); err != nil {
		t.Fatal(err)
	}
	before, _, _ := dedicatedLayerRoot(t, s, task)
	if err := db.Model(&model.Task{}).Where("id = ?", task.ID).Updates(map[string]any{"canvas_delivery_status": "pending", "canvas_delivery_next_attempt_at": nil}).Error; err != nil {
		t.Fatal(err)
	}
	if err := s.reconcileCanvasTaskDelivery(context.Background(), task.ID); err != nil {
		t.Fatal(err)
	}
	after, _, _ := dedicatedLayerRoot(t, s, task)
	if after.PayloadJSON != before.PayloadJSON || after.Revision != before.Revision {
		t.Fatal("historical delivery recreated deleted layer or overwrote edits")
	}
	final, _ := s.repo.Task(task.ID)
	if final.ResultJSON != stored.ResultJSON || final.Attempts != 1 {
		t.Fatal("delivery changed model result or reran inference")
	}
}

func TestDedicatedCanvasLayersAgentWaitsForCpuAndNeverAcceptsAnOrdinaryModel(t *testing.T) {
	for _, tc := range []struct {
		protocol   string
		count      any
		references []any
		valid      bool
	}{
		{"yingce-local-image", "1", []any{"resource:source"}, false},
		{"image-tools-layer-decomposition", "2", []any{"resource:source"}, false},
		{"image-tools-layer-decomposition", 2, []any{"resource:source"}, false},
		{"image-tools-layer-decomposition", "1", nil, false},
		{"image-tools-layer-decomposition", "1", []any{"resource:source"}, true},
		{"image-tools-layer-decomposition", 1, []any{"resource:source"}, true},
	} {
		input, _ := json.Marshal(map[string]any{"metadata": map[string]any{"layerDecomposition": true}, "config": map[string]any{"interfaceType": tc.protocol, "count": tc.count}, "referenceImages": tc.references})
		task := &model.Task{Type: "canvas_image", InputJSON: string(input)}
		if err := validateDedicatedLayerTaskAdmission(task); (err == nil) != tc.valid {
			t.Fatal("dedicated protocol/count/reference gate mismatch", tc, err)
		}
	}
	s, db := newMediaRecoveryTestService(t)
	task, ids := dedicatedLayerFixture(t, s, db)
	completeDedicatedLayerFixture(t, s, db, task, ids)
	stored, _ := s.repo.Task(task.ID)
	if ready, err := s.dedicatedLayerTaskReady(stored, "dedicated-root"); err != nil || ready {
		t.Fatal("Agent accepted first-image placeholder before CPU composition", ready, err)
	}
	_, _, root := dedicatedLayerRoot(t, s, task)
	cpuID := stringValue(root["metadata"].(map[string]any)["nativeLayerDecomposition"].(map[string]any)["compositeTaskId"])
	if err := db.Model(&model.Task{}).Where("id = ?", cpuID).Update("status", model.TaskStatusFailed).Error; err != nil {
		t.Fatal(err)
	}
	if ready, err := s.dedicatedLayerTaskReady(stored, "dedicated-root"); err == nil || ready {
		t.Fatal("Agent waits forever or falsely succeeds after failed CPU composition", ready, err)
	}
}

func TestDedicatedCanvasLayersAgentAliasRejectsOrdinaryModelBeforeSubmission(t *testing.T) {
	s, db, args := agentMediaFixture(t)
	capability := DefaultModelCapabilityConfigForModel(string(model.ChannelInterfaceGeminiImage), "nano-banana-pro")
	for _, row := range []any{
		&model.ChannelModel{ID: "layer-ordinary-image", ChannelID: "channel", ModelKey: "nano-banana-pro", Capability: "image", Protocol: model.ChannelInterfaceGeminiImage, CapabilityConfigJSON: mustEncodeModelCapabilityConfig(t, capability), BillingMode: "fixed_request", PriceConfigured: true, Enabled: true},
		&model.ChannelModelPriceTier{ID: "layer-ordinary-tier", ChannelModelID: "layer-ordinary-image", SelectorKey: "{}", SelectorJSON: "{}", BillingMode: "fixed_request", UnitPriceMicrocredits: 1, PriceConfigured: true, Enabled: true},
	} {
		if err := db.Create(row).Error; err != nil {
			t.Fatal(err)
		}
	}
	args.Mode, args.ChannelModelKey, args.Duration, args.Size, args.VideoGenerateAudio = "image", "nano-banana-pro", 0, "1:1", nil
	run, state := agentMediaRun(t, s, args, "request_approval")
	call := agentMediaCall(args)
	call.Function.Name = "image_layer_split"
	call = cloudAgentMediaCall(call)
	req, _, err := s.prepareCloudAgentMedia(run, &state, call)
	if err != nil {
		t.Fatal(err)
	}
	if req.Input["metadata"].(map[string]any)["layerDecomposition"] != true {
		t.Fatal("Agent alias lost the native dedicated delivery marker")
	}
	req.creationPrepare = &creationTaskPreparation{}
	var before, after int64
	if err := db.Model(&model.Task{}).Count(&before).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateTask("user", req); err == nil || !strings.Contains(err.Error(), "不是专用拆层协议") {
		t.Fatal("ordinary media model was not rejected by the dedicated protocol gate", err)
	}
	if err := db.Model(&model.Task{}).Count(&after).Error; err != nil || after != before {
		t.Fatal("rejected split submitted a task", before, after, err)
	}
}

func TestDedicatedCanvasLayersNativeQueueWithoutBrowser(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	verifyDedicatedLayerDelivery(t, s, db)
}

func TestDedicatedCanvasLayersPostgresAtomicDelivery(t *testing.T) {
	s, db := newProjectNameConflictPostgresService(t)
	s.dataDir = t.TempDir()
	s.activeCancels = map[string]context.CancelFunc{}
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	verifyDedicatedLayerDelivery(t, s, db)
}

func TestDedicatedCanvasLayersRejectsInvalidOutputWithoutPartialGroup(t *testing.T) {
	for _, mode := range []string{"single", "duplicate", "wrong-canvas", "empty", "dimensions", "deleted", "reassigned", "too-many"} {
		t.Run(mode, func(t *testing.T) {
			s, db := newMediaRecoveryTestService(t)
			task, ids := dedicatedLayerFixture(t, s, db)
			project, doc, root := dedicatedLayerRoot(t, s, task)
			switch mode {
			case "single":
				ids = ids[:1]
			case "duplicate":
				ids[1] = ids[0]
			case "empty", "dimensions":
				w, h := 31, 23
				if mode == "dimensions" {
					w, h = 16, 17
				}
				picture := image.NewNRGBA(image.Rect(0, 0, w, h))
				if mode == "dimensions" {
					picture.SetNRGBA(0, 0, color.NRGBA{R: 20, A: 255})
				}
				var data bytes.Buffer
				if err := png.Encode(&data, picture); err != nil {
					t.Fatal(err)
				}
				resource, _, err := s.storeResource(task.UserID, "image", mode+".png", "image/png", int64(data.Len()), w, h, 0, bytes.NewReader(data.Bytes()), nil, false)
				if err != nil {
					t.Fatal(err)
				}
				ids[1] = resource.ID
			case "too-many":
				for len(ids) < 33 {
					ids = append(ids, ids[0])
				}
			case "wrong-canvas":
				root["metadata"].(map[string]any)["layerDecomposition"].(map[string]any)["canvas"] = map[string]any{"width": 200, "height": 200}
			case "deleted":
				doc["nodes"] = []any{}
			case "reassigned":
				root["metadata"].(map[string]any)["taskId"] = "new-task"
			}
			if err := saveCloudAgentDocument(s.repo, project, doc, defaultRuntimePolicy()); err != nil {
				t.Fatal(err)
			}
			if mode == "too-many" {
				// The media checkpoint already rejects >32 upstream outputs. Also
				// exercise recovery of a malformed old terminal result directly.
				outputs := []any{}
				for _, id := range ids {
					outputs = append(outputs, map[string]any{"storageKey": "resource:" + id})
				}
				raw, _ := json.Marshal(map[string]any{"images": outputs})
				if err := db.Model(task).Updates(map[string]any{"status": model.TaskStatusSucceeded, "result_json": string(raw), "canvas_delivery_status": "pending"}).Error; err != nil {
					t.Fatal(err)
				}
				if err := s.reconcileCanvasTaskDelivery(context.Background(), task.ID); err != nil {
					t.Fatal(err)
				}
			} else {
				completeDedicatedLayerFixture(t, s, db, task, ids)
			}
			stored, _ := s.repo.Task(task.ID)
			current, err := s.repo.CanvasProjectForUser(task.UserID, task.ProjectID)
			if err != nil {
				t.Fatal(err)
			}
			currentDoc, _ := creationDocument(current.PayloadJSON)
			if mode == "deleted" || mode == "reassigned" {
				if stored.CanvasDeliveryStatus != "skipped" {
					t.Fatal("user deletion/reassignment not preserved", stored.CanvasDeliveryStatus)
				}
			} else {
				_, _, root = dedicatedLayerRoot(t, s, task)
				meta := root["metadata"].(map[string]any)
				if meta["status"] != "error" || meta["imageLayerGroup"] != nil || meta["nativeLayerDecomposition"].(map[string]any)["status"] != "needs_correction" || len(creationMaps(currentDoc["nodes"])) != 4 {
					t.Fatal("invalid result created partial group", root)
				}
			}
			if stored.Status != model.TaskStatusSucceeded || stored.Attempts != 1 {
				t.Fatal("validation resubmitted or altered the original model task")
			}
		})
	}
}

func TestDedicatedCanvasLayersQueueFailureRollsBackThenRestartsWithoutInference(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	task, ids := dedicatedLayerFixture(t, s, db)
	before, _, _ := dedicatedLayerRoot(t, s, task)
	if err := db.Exec(`CREATE TRIGGER reject_layer_cpu BEFORE INSERT ON tasks WHEN NEW.type = 'image_operation' BEGIN SELECT RAISE(ABORT, 'isolated queue failure'); END`).Error; err != nil {
		t.Fatal(err)
	}
	completeDedicatedLayerFixture(t, s, db, task, ids)
	stored, _ := s.repo.Task(task.ID)
	after, _, _ := dedicatedLayerRoot(t, s, task)
	if stored.Status != model.TaskStatusSucceeded || stored.CanvasDeliveryStatus != "pending" || stored.CanvasDeliveryNextAttemptAt == nil || stored.Attempts != 1 || after.PayloadJSON != before.PayloadJSON || after.Revision != before.Revision {
		t.Fatal("failed queue left partial layers or lost original model result", stored.CanvasDeliveryStatus, stored.CanvasDeliveryError)
	}
	var tasks int64
	if err := db.Model(&model.Task{}).Where("type = ?", "image_operation").Count(&tasks).Error; err != nil || tasks != 2 {
		t.Fatal("failed queue persisted a task", tasks, err)
	}
	if err := db.Exec("DROP TRIGGER reject_layer_cpu").Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&model.Task{}).Where("id = ?", task.ID).Update("canvas_delivery_next_attempt_at", nil).Error; err != nil {
		t.Fatal(err)
	}
	// A fresh service reads only native persisted state, not browser/in-memory data.
	restarted := &Service{repo: s.repo, dataDir: s.dataDir, pendingStorage: s.pendingStorage}
	if err := restarted.reconcileCanvasTaskDelivery(context.Background(), task.ID); err != nil {
		t.Fatal(err)
	}
	current, _ := s.repo.Task(task.ID)
	_, _, root := dedicatedLayerRoot(t, s, task)
	marker := root["metadata"].(map[string]any)["nativeLayerDecomposition"].(map[string]any)
	if current.CanvasDeliveryStatus != "applied" || current.ResultJSON != stored.ResultJSON || current.Attempts != 1 {
		t.Fatal("restart did not adopt the exact original result")
	}
	complete := runImageOperationTask(t, s, stringValue(marker["compositeTaskId"]))
	if complete.Status != model.TaskStatusSucceeded || complete.ImageLayerDeliveryStatus != "applied" {
		t.Fatal("recovered CPU composite failed", complete.Error)
	}
	if err := db.Model(&model.Task{}).Where("type = ?", "image_operation").Count(&tasks).Error; err != nil || tasks != 3 {
		t.Fatal("recovery duplicated CPU job", tasks, err)
	}
}

func TestDedicatedCanvasLayersThirtyTwoOutputsKeepOriginalIndexes(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	task, _ := dedicatedLayerFixture(t, s, db)
	ids := []string{}
	for i := 0; i < 32; i++ {
		picture := image.NewNRGBA(image.Rect(0, 0, 31, 23))
		picture.SetNRGBA(i%31, i%23, color.NRGBA{R: uint8(i + 1), A: 255})
		var data bytes.Buffer
		if err := png.Encode(&data, picture); err != nil {
			t.Fatal(err)
		}
		resource, _, err := s.storeResource(task.UserID, "image", fmt.Sprintf("layer-%d.png", i), "image/png", int64(data.Len()), 31, 23, 0, bytes.NewReader(data.Bytes()), nil, false)
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, resource.ID)
	}
	completeDedicatedLayerFixture(t, s, db, task, ids)
	stored, _ := s.repo.Task(task.ID)
	_, doc, root := dedicatedLayerRoot(t, s, task)
	if stored.CanvasDeliveryStatus != "applied" || len(creationMaps(doc["nodes"])) != 36 {
		t.Fatal("32-layer boundary failed", stored.CanvasDeliveryError)
	}
	meta := root["metadata"].(map[string]any)
	layers := creationMaps(meta["imageLayerGroup"].(map[string]any)["layers"])
	if len(layers) != 32 {
		t.Fatal("layer output order truncated")
	}
	complete := runImageOperationTask(t, s, stringValue(meta["nativeLayerDecomposition"].(map[string]any)["compositeTaskId"]))
	if complete.Status != model.TaskStatusSucceeded || complete.ImageLayerDeliveryStatus != "applied" {
		t.Fatal("32-layer real CPU composite failed", complete.Error)
	}
	if err := s.requireReadyImageLayerGroup(task.UserID, task.ProjectID, "dedicated-root"); err != nil {
		t.Fatal(err)
	}
}

func TestDedicatedCanvasLayersRecoversOlderFirstImageOnlyAcknowledgement(t *testing.T) {
	for _, snapshot := range []bool{true, false} {
		t.Run(fmt.Sprintf("draft-%t", snapshot), func(t *testing.T) {
			s, db := newMediaRecoveryTestService(t)
			task, ids := dedicatedLayerFixture(t, s, db)
			originalInput := task.InputJSON
			var input map[string]any
			if err := json.Unmarshal([]byte(originalInput), &input); err != nil {
				t.Fatal(err)
			}
			metadata := input["metadata"].(map[string]any)
			delete(metadata, "layerDecomposition") // simulate the old generic first-image callback
			raw, _ := json.Marshal(input)
			task.InputJSON = string(raw)
			if err := db.Model(task).Update("input_json", task.InputJSON).Error; err != nil {
				t.Fatal(err)
			}
			completeDedicatedLayerFixture(t, s, db, task, ids)
			stored, _ := s.repo.Task(task.ID)
			if stored.CanvasDeliveryStatus != "applied" {
				t.Fatal("invalid old-release fixture")
			}
			_, _, root := dedicatedLayerRoot(t, s, task)
			meta := root["metadata"].(map[string]any)
			if meta["storageKey"] != "resource:"+ids[0] || meta["imageLayerGroup"] != nil {
				t.Fatal("old callback fixture must have only the first image")
			}
			if !snapshot {
				if err := json.Unmarshal([]byte(originalInput), &input); err != nil {
					t.Fatal(err)
				}
				delete(input["metadata"].(map[string]any), "canvasTaskDraft")
				raw, _ = json.Marshal(input)
				originalInput = string(raw)
			}
			if err := db.Model(task).Update("input_json", originalInput).Error; err != nil {
				t.Fatal(err)
			}
			if !snapshot { // the column did not exist when these old jobs completed
				if err := db.Model(task).Update("canvas_delivery_status", nil).Error; err != nil {
					t.Fatal(err)
				}
			}
			if err := s.repairLegacyDedicatedCanvasDeliveries(context.Background()); err != nil {
				t.Fatal(err)
			}
			pending, _ := s.repo.Task(task.ID)
			if pending.CanvasDeliveryStatus != "pending" || pending.ResultJSON != stored.ResultJSON || pending.Attempts != 1 {
				t.Fatal("upgrade did not preserve and requeue original result")
			}
			if err := s.reconcileCanvasTaskDelivery(context.Background(), task.ID); err != nil {
				t.Fatal(err)
			}
			current, _ := s.repo.Task(task.ID)
			_, _, root = dedicatedLayerRoot(t, s, task)
			marker, _ := root["metadata"].(map[string]any)["nativeLayerDecomposition"].(map[string]any)
			if current.CanvasDeliveryStatus != "applied" || marker["sourceTaskId"] != task.ID {
				t.Fatal("old first-image result not recovered", current.CanvasDeliveryError)
			}
			completed := runImageOperationTask(t, s, stringValue(marker["compositeTaskId"]))
			if completed.Status != model.TaskStatusSucceeded || completed.ImageLayerDeliveryStatus != "applied" {
				t.Fatal("old result CPU compose failed", completed.Error)
			}
			before, _, _ := dedicatedLayerRoot(t, s, task)
			if err := s.repairLegacyDedicatedCanvasDeliveries(context.Background()); err != nil {
				t.Fatal(err)
			}
			after, _, _ := dedicatedLayerRoot(t, s, task)
			if before.PayloadJSON != after.PayloadJSON || before.Revision != after.Revision {
				t.Fatal("upgrade replay changed a completed group")
			}
		})
	}
}
