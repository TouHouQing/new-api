package repository

import (
	"errors"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"time"
	"yingce/backend/internal/model"
)

func (r *Repository) PendingCanvasTaskDeliveries(now time.Time, limit int) ([]string, error) {
	if limit < 1 || limit > 64 {
		limit = 32
	}
	var ids []string
	err := r.db.Model(&model.Task{}).Where("canvas_delivery_status = ? AND status IN ? AND (canvas_delivery_next_attempt_at IS NULL OR canvas_delivery_next_attempt_at <= ?)", "pending", []model.TaskStatus{model.TaskStatusSucceeded, model.TaskStatusFailed, model.TaskStatusCancelled}, now).Order("canvas_delivery_next_attempt_at ASC, id ASC").Limit(limit).Pluck("id", &ids).Error
	return ids, err
}

// The row lock spans only native database work. It never holds a model lease or
// calls a provider, and a delivery failure cannot reopen the original task.
func (r *Repository) WithPendingCanvasTaskDelivery(id string, now time.Time, apply func(*Repository, *model.Task) error) error {
	return r.Transaction(func(repo *Repository) error {
		if err := repo.LockCanvasTaskMutation(id); err != nil {
			return err
		}
		var task model.Task
		err := repo.db.Clauses(clause.Locking{Strength: "UPDATE", Options: "SKIP LOCKED"}).Where("id = ? AND canvas_delivery_status = ? AND status IN ? AND (canvas_delivery_next_attempt_at IS NULL OR canvas_delivery_next_attempt_at <= ?)", id, "pending", []model.TaskStatus{model.TaskStatusSucceeded, model.TaskStatusFailed, model.TaskStatusCancelled}, now).First(&task).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		if err != nil {
			return err
		}
		return apply(repo, &task)
	})
}

// Acquire the canvas before the task row in all delivery/retry transactions.
// The first statement is a write so SQLite never upgrades a stale snapshot.
func (r *Repository) LockCanvasTaskMutation(taskID string) error {
	if err := r.db.Model(&model.Project{}).Where("id = (SELECT project_id FROM tasks WHERE id = ? AND type = ? AND input_json LIKE ?) AND user_id = (SELECT user_id FROM tasks WHERE id = ?)", taskID, "canvas_text", "%nativeProjectStory%", taskID).UpdateColumn("revision", gorm.Expr("revision")).Error; err != nil {
		return err
	}
	return r.db.Model(&model.CanvasProject{}).Where("id = (SELECT project_id FROM tasks WHERE id = ?) AND user_id = (SELECT user_id FROM tasks WHERE id = ?)", taskID, taskID).UpdateColumn("revision", gorm.Expr("revision")).Error
}

func (r *Repository) SaveCanvasTaskDelivery(task *model.Task, status, message string, next *time.Time) error {
	if status != "pending" && status != "applied" && status != "skipped" {
		return errors.New("invalid canvas delivery state")
	}
	result := r.db.Model(&model.Task{}).Where("id = ? AND user_id = ? AND canvas_delivery_status = ?", task.ID, task.UserID, "pending").Updates(map[string]any{"canvas_delivery_status": status, "canvas_delivery_error": message, "canvas_delivery_next_attempt_at": next, "canvas_delivery_attempts": gorm.Expr("COALESCE(canvas_delivery_attempts,0) + 1")})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrTaskStateConflict
	}
	task.CanvasDeliveryStatus, task.CanvasDeliveryError, task.CanvasDeliveryNextAttemptAt = status, message, next
	task.CanvasDeliveryAttempts++
	return nil
}
