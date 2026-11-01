package app

import (
	"context"
	"encoding/json"
	"testing"
	"yingce/backend/internal/canvas"
	"yingce/backend/internal/model"
)

func TestImageOperationLayerMaterialsLateRoleEditKeepsStandaloneOutputs(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	source := materialFixture(t, s, db, false)
	result, err := s.CreateImageLayerMaterials(context.Background(), "image-user", source.CanvasID, source.NodeID, ImageLayerMaterialsRequest{RequestID: "native-material-late-role-edit", SourceGroupSHA256: source.SnapshotSHA256})
	if err != nil {
		t.Fatal(err)
	}
	project, err := s.repo.CanvasProjectForUser("image-user", source.CanvasID)
	if err != nil {
		t.Fatal(err)
	}
	base := project.Revision
	_, err = s.canvasDomain().ApplyUserCanvasOperations("image-user", source.CanvasID, canvas.CanvasOperationsRequest{MutationID: "material47-real-role-edit", BaseRevision: &base, Operations: []canvas.CanvasOperation{{Type: "patch_node", ID: "layer-base", Patch: map[string]json.RawMessage{"metadata.imageLayer": json.RawMessage(`{"kind":"base"}`)}, Before: map[string]json.RawMessage{"metadata.imageLayer": json.RawMessage(`{"kind":"transparent"}`)}}}})
	if err != nil {
		t.Fatal(err)
	}
	project, err = s.repo.CanvasProjectForUser("image-user", source.CanvasID)
	if err != nil {
		t.Fatal(err)
	}
	queued, err := s.repo.TaskForUser("image-user", result.TaskID)
	if err != nil {
		t.Fatal(err)
	}
	frozen, err := decodeImageOperationInput(queued)
	if err != nil {
		t.Fatal(err)
	}
	var edited struct {
		Nodes []map[string]any `json:"nodes"`
	}
	if json.Unmarshal([]byte(project.PayloadJSON), &edited) != nil || imageMaterialRolesUnchanged(edited.Nodes, frozen.Materials) {
		t.Fatal("role-edit fixture did not change admitted sources")
	}
	finished := runImageOperationTask(t, s, result.TaskID)
	if finished.Status != model.TaskStatusSucceeded || finished.ImageLayerDeliveryStatus != "detached" {
		t.Fatal("late role edit overwritten or original outputs lost", finished.Error, finished.ImageLayerDeliveryStatus)
	}
	current, err := s.repo.CanvasProjectForUser("image-user", source.CanvasID)
	if err != nil || current.PayloadJSON != project.PayloadJSON {
		t.Fatal("late result changed current canvas", err)
	}
	var outputs struct {
		Images []imageOperationStoredOutput `json:"images"`
	}
	if json.Unmarshal([]byte(finished.ResultJSON), &outputs) != nil || len(outputs.Images) != 1 {
		t.Fatal("standalone output missing")
	}
	if _, err := s.repo.AssetForUser("image-user", outputs.Images[0].AssetID); err != nil {
		t.Fatal("derived asset lost on detached delivery", err)
	}
	if _, err := s.ApplyImageOperationTask("image-user", finished.ID, ImageOperationApplyRequest{RequestID: "native-material-late-manual-adopt"}); err == nil {
		t.Fatal("manual apply ignored changed foreground role")
	}
}
