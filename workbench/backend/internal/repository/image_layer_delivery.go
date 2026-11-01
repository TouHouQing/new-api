package repository

import (
	"time"
	"yingce/backend/internal/model"
)

func (r *Repository) PendingImageLayerDeliveries(afterID string, limit int) ([]model.Task, error) {
	if limit < 1 || limit > 20 {
		limit = 5
	}
	query := r.db.Where("type = ? AND operation IN ? AND status = ? AND image_layer_delivery_status = ?", model.TaskTypeImageOperation, []string{"compose", "trim-layers"}, model.TaskStatusSucceeded, "pending")
	if afterID != "" {
		query = query.Where("id > ?", afterID)
	}
	rows := []model.Task{}
	err := query.Order("id ASC").Limit(limit).Find(&rows).Error
	return rows, err
}

// Caller owns the domain transition and payload validation. The repository
// enforces current task owner/type/state and an optimistic delivery status.
func (r *Repository) UpdateImageLayerDelivery(userID, taskID, expected, status, raw string) error {
	result := r.db.Model(&model.Task{}).Where("id = ? AND user_id = ? AND type = ? AND operation IN ? AND status = ? AND COALESCE(image_layer_delivery_status, '') = ?", taskID, userID, model.TaskTypeImageOperation, []string{"compose", "trim-layers"}, model.TaskStatusSucceeded, expected).Updates(map[string]any{"image_layer_delivery_status": status, "image_layer_delivery_json": raw, "updated_at": time.Now()})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrTaskStateConflict
	}
	return nil
}
