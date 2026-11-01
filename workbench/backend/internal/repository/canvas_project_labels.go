package repository

import (
	"errors"
	"strings"

	"yingce/backend/internal/model"
)

// Read only labels belonging to the task owner, without loading canvas payloads.
func (r *Repository) CanvasProjectLabelsForUser(userID string, ids []string) (map[string]model.CanvasProject, error) {
	result := make(map[string]model.CanvasProject)
	if len(ids) == 0 {
		return result, nil
	}
	if strings.TrimSpace(userID) == "" {
		return nil, errors.New("canvas labels require an owner")
	}
	var rows []model.CanvasProject
	if err := r.db.Select("id", "title", "project_id").Where("user_id = ? AND id IN ?", userID, ids).Find(&rows).Error; err != nil {
		return nil, err
	}
	for _, row := range rows {
		result[row.ID] = row
	}
	return result, nil
}
