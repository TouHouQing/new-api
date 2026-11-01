package app

import (
	"encoding/json"
	"errors"
	"gorm.io/gorm"
	"yingce/backend/internal/model"
)

// Compare terminal source nodes/tasks without acquiring raster memory while
// holding storageMu. Raster workers acquire memory before publishing storage.
func (s *Service) imageLayerWorkflowResumeSnapshot(userID, canvasID, taskID string) (string, error) {
	if taskID == "" {
		return "", nil
	}
	parent, err := s.repo.TaskForUser(userID, taskID)
	if err != nil {
		return "", err
	}
	if parent.ProjectID != canvasID || (parent.Status != model.TaskStatusFailed && parent.Status != model.TaskStatusCancelled) || parent.ImageLayerDeliveryStatus != "applied" {
		return "", BadAuthRequest("请等待原拆层停止并完成结果核对，再继续未完成图层")
	}
	input, err := decodeImageLayerWorkflowInput(parent)
	if err != nil {
		return "", err
	}
	project, err := s.repo.CanvasProjectForUser(userID, canvasID)
	if err != nil {
		return "", err
	}
	var doc struct {
		Nodes []map[string]any `json:"nodes"`
	}
	if err := json.Unmarshal([]byte(project.PayloadJSON), &doc); err != nil {
		return "", err
	}
	wanted := map[string]bool{input.NodeID: true}
	for _, id := range input.ChildNodeIDs {
		wanted[id] = true
	}
	nodes := []map[string]any{}
	for _, node := range doc.Nodes {
		id, _ := node["id"].(string)
		if wanted[id] {
			nodes = append(nodes, node)
		}
	}
	if len(nodes) != len(wanted) {
		return "", imageMaterialSourceChanged()
	}
	states := []any{}
	for _, id := range imageLayerWorkflowChildTasks(*parent, input) {
		if id == "" {
			continue
		}
		child, err := s.repo.TaskForUser(userID, id)
		if errors.Is(err, gorm.ErrRecordNotFound) {
			states = append(states, []any{id, "missing"})
			continue
		}
		if err != nil {
			return "", err
		}
		states = append(states, []any{id, child.Status, cutSignature(child.InputJSON), cutSignature(child.ResultJSON), child.ProviderCancelStatus, cutSignature(child.MediaRecoveryJSON), child.BillingOrderID})
		if child.BillingOrderID != "" {
			order, err := s.repo.BillingOrder(child.BillingOrderID)
			if err != nil {
				return "", err
			}
			if order == nil {
				return "", BadAuthRequest("原图层账单尚未核对完成")
			}
			states = append(states, []any{order.ID, order.Status, order.AmountMicrocredits})
		}
	}
	return cutSignature([]any{parent.ID, parent.Status, parent.ImageLayerDeliveryStatus, cutSignature(parent.InputJSON), nodes, states}), nil
}
