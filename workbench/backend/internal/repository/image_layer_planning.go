package repository

import (
	"encoding/json"
	"strings"
	"time"

	"yingce/backend/internal/model"
)

func (r *Repository) ImageLayerPlanningTasks(userID, canvasID, sourceNodeID string, before time.Time, beforeID string, limit int) ([]model.Task, error) {
	quoted, _ := json.Marshal(sourceNodeID)
	escape := strings.NewReplacer("!", "!!", "%", "!%", "_", "!_")
	pattern := "%" + escape.Replace(`"sourceNodeId":`+string(quoted)) + "%"
	query := r.db.Where("user_id = ? AND project_id = ? AND type = ?", userID, canvasID, "canvas_text").Where(`input_json LIKE ? ESCAPE '!'`, pattern).Where(`input_json LIKE ?`, `%"edit":"layer-planning"%`)
	if !before.IsZero() {
		query = query.Where("(created_at < ? OR (created_at = ? AND id < ?))", before, before, beforeID)
	}
	var tasks []model.Task
	err := query.Order("created_at DESC, id DESC").Limit(limit).Find(&tasks).Error
	return tasks, err
}
