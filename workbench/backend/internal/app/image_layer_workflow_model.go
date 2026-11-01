package app

import (
	"encoding/json"
	"fmt"
	"yingce/backend/internal/model"
)

// Reuse the native model catalog, route, ownership, quote and charge ceiling.
// The workflow accepts model selections; no caller API key or base URL is used.
func (s *Service) prepareImageLayerWorkflowModel(userID, canvasID, parentID string, index int, stage string, selection ImageLayerWorkflowModel, resource model.Resource, maxCharge int64) (*model.Task, *model.BillingOrder, error) {
	size := selection.Size
	if size == "" {
		size = fmt.Sprintf("%dx%d", resource.Width, resource.Height)
	}
	config := map[string]any{"model": selection.Model, "size": size, "count": "1", "taskWorkflowProvider": "model", "transparentBackground": "true"}
	if selection.Quality != "" {
		config["quality"] = selection.Quality
	}
	if index == 0 {
		config["transparentBackground"] = "false"
	}
	prepare := &creationTaskPreparation{}
	request := CreateTaskRequest{ProjectID: canvasID, Type: "canvas_image", Operation: "edit", LogicalModelID: selection.LogicalModelID, Model: selection.Model, Prompt: selection.Prompt, creationPrepare: prepare, admission: &taskAdmission{ID: imageLayerWorkflowModelTaskID(parentID, index, stage), MaxCharge: maxCharge}, Input: map[string]any{"mode": "image", "prompt": selection.Prompt, "config": config, "referenceImages": []providerMedia{{ID: resource.ID, Name: resource.ID, StorageKey: "resource:" + resource.ID, DataURL: resourceFileURL(resource.ID), MimeType: resource.MimeType, Type: resource.MimeType, Bytes: resource.Size, Width: resource.Width, Height: resource.Height}}, "metadata": map[string]any{"imageLayerWorkflow": map[string]any{"taskId": parentID, "index": index, "stage": stage, "selectionSha256": cutSignature(selection)}}}}
	task, err := s.CreateTask(userID, request)
	if err != nil {
		return nil, nil, err
	}
	var input map[string]any
	if err := json.Unmarshal([]byte(task.InputJSON), &input); err != nil {
		return nil, nil, err
	}
	if err := s.protectTaskSecrets(input); err != nil {
		return nil, nil, err
	}
	encoded, err := json.Marshal(input)
	if err != nil {
		return nil, nil, err
	}
	task.InputJSON = string(encoded)
	if prepare.Order != nil {
		task.BillingOrderID = prepare.Order.ID
	}
	return task, prepare.Order, nil
}
