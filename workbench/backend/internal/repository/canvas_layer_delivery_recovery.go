package repository

import "yingce/backend/internal/model"

// Coarse text selection is followed by strict JSON/owned-target validation in
// app. Avoid dialect-specific JSON casts that fail on old malformed input.
func (r *Repository) LegacyDedicatedCanvasDeliveries(after string) ([]model.Task, error) {
	var tasks []model.Task
	err := r.db.Where("id > ? AND type = ? AND status = ? AND COALESCE(canvas_delivery_status, '') IN ? AND input_json LIKE ?", after, "canvas_image", model.TaskStatusSucceeded, []string{"", "applied"}, "%layerDecomposition%").Order("id ASC").Limit(64).Find(&tasks).Error
	return tasks, err
}

func (r *Repository) RequeueDedicatedCanvasDelivery(task *model.Task) error {
	result := r.db.Model(&model.Task{}).Where("id = ? AND user_id = ? AND project_id = ? AND status = ? AND COALESCE(canvas_delivery_status, '') = ? AND input_json = ? AND result_json = ?", task.ID, task.UserID, task.ProjectID, model.TaskStatusSucceeded, task.CanvasDeliveryStatus, task.InputJSON, task.ResultJSON).Updates(map[string]any{"canvas_delivery_status": "pending", "canvas_delivery_error": "", "canvas_delivery_next_attempt_at": nil})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrTaskStateConflict
	}
	return nil
}
