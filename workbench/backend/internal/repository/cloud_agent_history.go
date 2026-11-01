package repository

import (
	"time"
	"yingce/backend/internal/model"
)

// List only owned metadata; never hydrate credentials or the model transcript.
func (r *Repository) CloudAgentHistoryPage(userID, canvasID string, before *time.Time, beforeID string, limit int) ([]model.CloudAgentExecution, error) {
	rows := []model.CloudAgentExecution{}
	query := r.db.Model(&model.CloudAgentExecution{}).Select("id", "canvas_id", "parent_id", "title", "status", "created_at", "updated_at").Where("user_id = ? AND canvas_id = ?", userID, canvasID).
		Where("EXISTS (SELECT 1 FROM tasks t WHERE t.id = cloud_agent_executions.id AND t.user_id = cloud_agent_executions.user_id)")
	if before != nil {
		query = query.Where("created_at < ? OR (created_at = ? AND id < ?)", *before, *before, beforeID)
	}
	err := query.Order("created_at DESC").Order("id DESC").Limit(limit).Find(&rows).Error
	return rows, err
}
