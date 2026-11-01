package repository

import (
	"encoding/json"
	"strings"
	"time"
	"yingce/backend/internal/model"
)

// Use the same portable canonical-JSON prefilter as native layer history.
// The app verifies the complete frozen input before projecting a record.
func (r *Repository) VideoReworkTasks(userID, projectID, clipID string, before time.Time, beforeID string, limit int) ([]model.Task, error) {
	quoted, _ := json.Marshal(clipID)
	pattern := "%" + strings.NewReplacer("!", "!!", "%", "!%", "_", "!_").Replace(`"clipId":`+string(quoted)) + "%"
	query := r.db.Where("user_id = ? AND project_id = ? AND type = ?", userID, projectID, model.TaskTypeVideoRework).Where(`input_json LIKE ? ESCAPE '!'`, pattern)
	if !before.IsZero() {
		query = query.Where("(created_at < ? OR (created_at = ? AND id < ?))", before, before, beforeID)
	}
	var rows []model.Task
	err := query.Order("created_at DESC, id DESC").Limit(limit).Find(&rows).Error
	return rows, err
}
