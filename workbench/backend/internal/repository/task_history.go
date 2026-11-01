package repository

import (
	"strings"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
)

type TaskHistoryFilter struct {
	ProjectID string
	Query     string
	Kind      string
	Model     string
	Status    string
}

type TaskHistoryStats struct {
	Total     int64 `json:"total"`
	Today     int64 `json:"today"`
	Active    int64 `json:"active"`
	Succeeded int64 `json:"succeeded"`
	Failed    int64 `json:"failed"`
	Recorded  int64 `json:"recorded"`
}

func taskHistoryLiteral(value string) string {
	// '!' is an explicit escape in both PostgreSQL and SQLite. Search terms
	// containing percent/underscore must not silently match unrelated tasks.
	return "%" + strings.NewReplacer("!", "!!", "%", "!%", "_", "!_").Replace(strings.ToLower(value)) + "%"
}

func (r *Repository) taskHistoryQuery(userID string, filter TaskHistoryFilter, includeStatus bool) *gorm.DB {
	query := r.db.Model(&model.Task{}).Where("tasks.user_id = ?", userID)
	if filter.ProjectID != "" {
		query = query.Where("tasks.project_id = ?", filter.ProjectID)
	}
	if filter.Model != "" {
		query = query.Where("tasks.model = ?", filter.Model)
	}
	if filter.Query != "" {
		pattern := taskHistoryLiteral(filter.Query)
		query = query.Where("(LOWER(tasks.id) LIKE ? ESCAPE '!' OR LOWER(tasks.prompt) LIKE ? ESCAPE '!' OR LOWER(tasks.model) LIKE ? ESCAPE '!' OR EXISTS (SELECT 1 FROM canvas_projects c WHERE c.id = tasks.project_id AND c.user_id = ? AND LOWER(c.title) LIKE ? ESCAPE '!'))", pattern, pattern, pattern, userID, pattern)
	}
	// Keep the same classification as taskMediaKind, including historical video
	// operations and local image-operation tasks.
	kind := "CASE WHEN tasks.type = 'canvas_audio' THEN 'audio' WHEN LOWER(tasks.type || ' ' || COALESCE(tasks.operation, '')) LIKE '%video%' OR (tasks.type || ' ' || COALESCE(tasks.operation, '')) LIKE '%视频%' THEN 'video' WHEN LOWER(tasks.type || ' ' || COALESCE(tasks.operation, '')) LIKE '%image%' OR (tasks.type || ' ' || COALESCE(tasks.operation, '')) LIKE '%图片%' OR (tasks.type || ' ' || COALESCE(tasks.operation, '')) LIKE '%画面%' THEN 'image' ELSE 'text' END"
	if filter.Kind != "" {
		query = query.Where("("+kind+") = ?", filter.Kind)
	}
	if includeStatus {
		switch filter.Status {
		case "active":
			query = query.Where("tasks.status IN ?", []model.TaskStatus{model.TaskStatusQueued, model.TaskStatusRunning})
		case "succeeded":
			query = query.Where("tasks.status = ?", model.TaskStatusSucceeded)
		case "failed":
			query = query.Where("tasks.status IN ?", []model.TaskStatus{model.TaskStatusFailed, model.TaskStatusCancelled})
		case "recorded":
			query = query.Where("tasks.status = ?", model.TaskStatusTextReplay)
		}
	}
	return query
}

func (r *Repository) TaskHistory(userID string, filter TaskHistoryFilter, page, limit int, start, end time.Time) ([]model.Task, int64, TaskHistoryStats, error) {
	var stats TaskHistoryStats
	selection := "COUNT(*) AS total, COALESCE(SUM(CASE WHEN created_at >= ? AND created_at < ? THEN 1 ELSE 0 END), 0) AS today, COALESCE(SUM(CASE WHEN status IN ('queued','running') THEN 1 ELSE 0 END), 0) AS active, COALESCE(SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END), 0) AS succeeded, COALESCE(SUM(CASE WHEN status IN ('failed','cancelled') THEN 1 ELSE 0 END), 0) AS failed, COALESCE(SUM(CASE WHEN status = 'text_replay' THEN 1 ELSE 0 END), 0) AS recorded"
	if err := r.taskHistoryQuery(userID, filter, false).Select(selection, start, end).Scan(&stats).Error; err != nil {
		return nil, 0, stats, err
	}
	total := stats.Total
	if filter.Status != "" {
		if err := r.taskHistoryQuery(userID, filter, true).Count(&total).Error; err != nil {
			return nil, 0, stats, err
		}
	}
	var tasks []model.Task
	err := r.taskHistoryQuery(userID, filter, true).Order("tasks.created_at DESC, tasks.id DESC").Offset((page - 1) * limit).Limit(limit).Find(&tasks).Error
	return tasks, total, stats, err
}

func (r *Repository) TaskHistoryFacets(userID string) ([]model.CanvasProject, []string, error) {
	var canvases []model.CanvasProject
	err := r.db.Model(&model.CanvasProject{}).Select("DISTINCT canvas_projects.id, canvas_projects.title, canvas_projects.project_id").Joins("JOIN tasks ON tasks.project_id = canvas_projects.id AND tasks.user_id = ?", userID).Where("canvas_projects.user_id = ?", userID).Order("canvas_projects.title ASC, canvas_projects.id ASC").Find(&canvases).Error
	if err != nil {
		return nil, nil, err
	}
	var models []string
	err = r.db.Model(&model.Task{}).Where("user_id = ? AND TRIM(model) <> ''", userID).Distinct().Order("model ASC").Pluck("model", &models).Error
	return canvases, models, err
}
