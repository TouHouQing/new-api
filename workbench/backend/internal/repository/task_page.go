package repository

import (
	"time"
	"yingce/backend/internal/model"
)

// TaskPageAfter uses the full sort key. IDs are random, so ID alone cannot
// paginate a list ordered by its creation time.
func (r *Repository) TaskPageAfter(userID, projectID, taskType string, activeOnly bool, beforeTime time.Time, beforeID string, limit int) ([]model.Task, error) {
	if limit < 1 || limit > 100 {
		limit = 50
	}
	query := r.taskListQuery(userID, projectID, activeOnly, "")
	if taskType != "" {
		query = query.Where("type = ?", taskType)
	}
	if beforeID != "" {
		query = query.Where("created_at < ? OR (created_at = ? AND id < ?)", beforeTime, beforeTime, beforeID)
	}
	var tasks []model.Task
	err := query.Order("created_at desc, id desc").Limit(limit + 1).Find(&tasks).Error
	return tasks, err
}
