package app

import (
	"context"
	"encoding/json"
	"reflect"
	"testing"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/database"
	"yingce/backend/internal/imageops"
	"yingce/backend/internal/model"
)

func seedNativeImageLayerGroup(t *testing.T, s *Service, db *gorm.DB) ImageLayerGroupSource {
	t.Helper()
	resource, _ := seedImageOperationSource(t, s, db)
	if err := db.Model(&model.User{}).Where("id = ?", "image-user").Update("status", model.UserStatusActive).Error; err != nil {
		t.Fatal(err)
	}
	outputs := []imageOperationStoredOutput{}
	for index, mode := range []string{"keep", "remove"} {
		request := ImageOperationCreateRequest{RequestID: "native-layer-source-mask-" + mode, ResourceID: resource.ID, Recipe: imageops.Recipe{Operation: "mask", Mask: &imageops.Mask{Width: 31, Height: 23, Mode: mode, Strokes: []imageops.MaskStroke{{Diameter: 10, Points: [][]float64{{15.5, 10.5}}}}}}}
		task, err := s.CreateImageOperationTask("image-user", request)
		if err != nil {
			t.Fatal(err)
		}
		completed := runImageOperationTask(t, s, task.ID)
		if completed.Status != model.TaskStatusSucceeded {
			t.Fatal(completed.Error)
		}
		var result struct {
			Images []imageOperationStoredOutput `json:"images"`
		}
		if err := json.Unmarshal([]byte(completed.ResultJSON), &result); err != nil || len(result.Images) != 1 {
			t.Fatal("native source mask missing", index, err)
		}
		outputs = append(outputs, result.Images[0])
	}
	nodes := []any{}
	names := []string{"group-root", "layer-base", "layer-top"}
	for i, name := range names {
		output := outputs[0]
		if i == 2 {
			output = outputs[1]
		}
		meta := map[string]any{"storageKey": "resource:" + output.ResourceID, "content": resourceFileURL(output.ResourceID), "assetId": output.AssetID, "assetVersionId": output.AssetVersionID, "naturalWidth": 31, "naturalHeight": 23, "status": "success"}
		if i == 0 {
			meta["imageLayerGroup"] = map[string]any{"width": 31, "height": 23, "layers": []any{map[string]any{"nodeId": "layer-base", "x": 0, "y": 0, "visible": true}, map[string]any{"nodeId": "layer-top", "x": 0.5, "y": 0, "visible": true, "opacity": 0.5}}}
		}
		nodes = append(nodes, map[string]any{"id": name, "type": "image", "title": name, "position": map[string]int{"x": i * 350, "y": 20}, "width": 310, "height": 230, "metadata": meta})
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	raw, err := json.Marshal(map[string]any{"id": "native-layer-canvas", "title": "原生图层", "createdAt": now, "updatedAt": now, "nodes": nodes, "connections": []any{}, "chatSessions": []any{}, "viewport": map[string]int{"x": 0, "y": 0, "k": 1}})
	if err != nil {
		t.Fatal(err)
	}
	row := model.CanvasProject{ID: "native-layer-canvas", UserID: "image-user", Title: "原生图层", PayloadJSON: string(raw)}
	if err := s.repo.UpsertCanvasProject(&row); err != nil {
		t.Fatal(err)
	}
	if err := s.canvasDomain().ValidateCanvasMediaAssets("image-user", raw); err != nil {
		t.Fatal("source fixtures must satisfy real native asset guard", err)
	}
	snapshot, err := s.ReadImageLayerGroupSource("image-user", row.ID, "group-root")
	if err != nil {
		t.Fatal(err)
	}
	return snapshot
}
func nativeLayerRequest(snapshot ImageLayerGroupSource, intent string) ImageOperationCreateRequest {
	return ImageOperationCreateRequest{RequestID: intent, ProjectID: snapshot.CanvasID, SourceNodeID: snapshot.NodeID, ResourceID: snapshot.ResourceID, Recipe: imageops.Recipe{Operation: "compose", Compose: &snapshot.Composition}, SourceGroupSHA256: snapshot.SnapshotSHA256, ClientCompositeSignature: "native-layer-client-layout-v1"}
}

func TestImageOperationLayerGroupNativeApplyHistoryAndLateResultProtection(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	verifyNativeImageLayerGroup(t, s, db)
}
func TestImageOperationLayerGroupPostgresApplyHistoryAndLateResultProtection(t *testing.T) {
	s, db := newProjectNameConflictPostgresService(t)
	s.dataDir = t.TempDir()
	s.activeCancels = map[string]context.CancelFunc{}
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	verifyNativeImageLayerGroup(t, s, db)
}
func verifyNativeImageLayerGroup(t *testing.T, s *Service, db *gorm.DB) {
	t.Helper()
	snapshot := seedNativeImageLayerGroup(t, s, db)
	request := nativeLayerRequest(snapshot, "native-layer-actual-compose-1")
	task, err := s.CreateImageOperationTask("image-user", request)
	if err != nil {
		t.Fatal(err)
	}
	request2 := nativeLayerRequest(snapshot, "native-layer-actual-compose-2")
	second, err := s.CreateImageOperationTask("image-user", request2)
	if err != nil {
		t.Fatal(err)
	}
	beforeAdopt, err := s.repo.CanvasProjectForUser("image-user", snapshot.CanvasID)
	if err != nil {
		t.Fatal(err)
	}
	expectedBefore, err := s.canvasDomain().UserCanvasProject("image-user", snapshot.CanvasID)
	if err != nil {
		t.Fatal(err)
	}
	first := runImageOperationTask(t, s, task.ID)
	if first.Status != model.TaskStatusSucceeded {
		t.Fatal(first.Error)
	}
	late := runImageOperationTask(t, s, second.ID)
	if late.Status != model.TaskStatusSucceeded {
		t.Fatal(late.Error)
	}
	if first.ImageLayerDeliveryStatus != "applied" || late.ImageLayerDeliveryStatus != "detached" {
		t.Fatal("server did not deliver the current result and retain the late standalone version", first.ImageLayerDeliveryStatus, late.ImageLayerDeliveryStatus)
	}
	input, err := decodeImageOperationInput(first)
	if err != nil || !reflect.DeepEqual(input.LayerSources, snapshot.LayerSources) {
		t.Fatal("composition lost concrete layer snapshots", err)
	}
	applyRequest := ImageOperationApplyRequest{RequestID: "native-layer-adopt-intent-1"}
	applied, err := s.ApplyImageOperationTask("image-user", first.ID, applyRequest)
	if err != nil {
		t.Fatal(err)
	}
	if len(applied.AddedNodeIDs) != 0 || len(applied.UpdatedNodeIDs) != 1 || applied.UpdatedNodeIDs[0] != "group-root" || applied.Revision <= snapshot.CanvasRevision {
		t.Fatal("group was duplicated rather than updated", applied)
	}
	if !applied.Replayed {
		t.Fatal("browser/MCP adoption did not recover the server delivery receipt")
	}
	current, err := s.repo.CanvasProjectForUser("image-user", snapshot.CanvasID)
	if err != nil {
		t.Fatal(err)
	}
	beforeReplay := current.PayloadJSON
	if err := s.canvasDomain().ValidateCanvasMediaAssets("image-user", []byte(current.PayloadJSON)); err != nil {
		t.Fatal("native updated composition failed actual asset invariant", err)
	}
	var document struct {
		Nodes []map[string]any `json:"nodes"`
	}
	if json.Unmarshal([]byte(current.PayloadJSON), &document) != nil || len(document.Nodes) != 3 {
		t.Fatal("group adoption changed layer nodes")
	}
	meta := document.Nodes[0]["metadata"].(map[string]any)
	group := meta["imageLayerGroup"].(map[string]any)
	if meta["storageKey"] == "resource:"+snapshot.ResourceID || group["compositeSignature"] != request.ClientCompositeSignature || group["nativeComposition"] == nil {
		t.Fatal("group source, cache marker or version did not advance")
	}
	replayed, err := s.ApplyImageOperationTask("image-user", first.ID, applyRequest)
	if err != nil || !replayed.Replayed || replayed.Revision != applied.Revision {
		t.Fatal("group receipt did not survive changed original pointer", err)
	}
	if _, err := s.ApplyImageOperationTask("image-user", late.ID, ImageOperationApplyRequest{RequestID: "native-layer-late-adopt-intent"}); err == nil {
		t.Fatal("late result overwrote a newer group")
	}
	current, err = s.repo.CanvasProjectForUser("image-user", snapshot.CanvasID)
	if err != nil || current.PayloadJSON != beforeReplay {
		t.Fatal("replay/late result rewrote current group", err)
	}
	var histories int64
	if err := db.Model(&model.CanvasSnapshot{}).Where("canvas_id = ?", snapshot.CanvasID).Count(&histories).Error; err != nil {
		t.Fatal(err)
	}
	if histories < 1 {
		t.Fatal("group adoption lacks the prior immutable native version")
	}
	var prior model.CanvasSnapshot
	if err := db.Where("canvas_id = ? AND revision = ?", snapshot.CanvasID, beforeAdopt.Revision).First(&prior).Error; err != nil || prior.PayloadJSON != string(expectedBefore) {
		t.Fatal("group adoption did not retain exact native pre-apply document", err)
	}
}

func TestImageOperationLayerGroupSourceRejectsCycleChangedAndForeignReferences(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	snapshot := seedNativeImageLayerGroup(t, s, db)
	if _, err := s.ReadImageLayerGroupSource("foreign-user", snapshot.CanvasID, snapshot.NodeID); err == nil {
		t.Fatal("foreign caller read group sources")
	}
	row, err := s.repo.CanvasProjectForUser("image-user", snapshot.CanvasID)
	if err != nil {
		t.Fatal(err)
	}
	var document map[string]any
	if err := json.Unmarshal([]byte(row.PayloadJSON), &document); err != nil {
		t.Fatal(err)
	}
	nodes := document["nodes"].([]any)
	root := nodes[0].(map[string]any)
	group := root["metadata"].(map[string]any)["imageLayerGroup"].(map[string]any)
	layers := group["layers"].([]any)
	root["title"] = "独立改名"
	root["position"] = map[string]int{"x": 777, "y": 888}
	raw, _ := json.Marshal(document)
	row.PayloadJSON = string(raw)
	if err := s.repo.UpsertCanvasProject(row); err != nil {
		t.Fatal(err)
	}
	renamed, err := s.ReadImageLayerGroupSource("image-user", snapshot.CanvasID, snapshot.NodeID)
	if err != nil || renamed.SnapshotSHA256 != snapshot.SnapshotSHA256 {
		t.Fatal("unrelated name/position invalidated composition dependencies", err)
	}
	layers[1].(map[string]any)["opacity"] = 0.75
	raw, _ = json.Marshal(document)
	row.PayloadJSON = string(raw)
	if err := s.repo.UpsertCanvasProject(row); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateImageOperationTask("image-user", nativeLayerRequest(snapshot, "native-layer-rejected-old-layout")); err == nil {
		t.Fatal("stale layout created a task")
	}
	layers[0].(map[string]any)["nodeId"] = "group-root"
	raw, _ = json.Marshal(document)
	row.PayloadJSON = string(raw)
	if err := s.repo.UpsertCanvasProject(row); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ReadImageLayerGroupSource("image-user", snapshot.CanvasID, snapshot.NodeID); err == nil {
		t.Fatal("self-referential group accepted")
	}
}
