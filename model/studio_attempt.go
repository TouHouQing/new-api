package model

import "time"

// StudioAttempt records a dashboard video submission, including rejections
// that happen before a billable task exists. Request bodies and credentials
// are never persisted here.
type StudioAttempt struct {
	ID         string    `json:"id" gorm:"type:varchar(36);primaryKey"`
	UserID     int       `json:"-" gorm:"not null;index:idx_studio_attempt_owner_time,priority:1"`
	Group      string    `json:"group" gorm:"column:group_id;type:varchar(100)"`
	Model      string    `json:"model" gorm:"type:varchar(200)"`
	PluginKey  string    `json:"plugin_key,omitempty" gorm:"type:varchar(100)"`
	ChannelID  int       `json:"channel_id,omitempty"`
	HTTPStatus int       `json:"http_status"`
	ErrorCode  string    `json:"error_code,omitempty" gorm:"type:varchar(100)"`
	TaskID     string    `json:"task_id,omitempty" gorm:"type:varchar(191)"`
	Stage      string    `json:"stage" gorm:"type:varchar(32);not null"`
	CreatedAt  time.Time `json:"created_at" gorm:"index:idx_studio_attempt_owner_time,priority:2"`
	UpdatedAt  time.Time `json:"-"`
}

func CreateStudioAttempt(attempt *StudioAttempt) error {
	return DB.Create(attempt).Error
}

func FinishStudioAttempt(attempt *StudioAttempt) error {
	return DB.Model(&StudioAttempt{}).
		Where("id = ? AND user_id = ?", attempt.ID, attempt.UserID).
		Updates(map[string]any{
			"group_id":    attempt.Group,
			"model":       attempt.Model,
			"plugin_key":  attempt.PluginKey,
			"channel_id":  attempt.ChannelID,
			"http_status": attempt.HTTPStatus,
			"error_code":  attempt.ErrorCode,
			"task_id":     attempt.TaskID,
			"stage":       attempt.Stage,
		}).Error
}

func ListStudioAttempts(userID, limit int) ([]StudioAttempt, error) {
	if limit < 1 || limit > 50 {
		limit = 20
	}
	var attempts []StudioAttempt
	err := DB.Where("user_id = ?", userID).
		Order("created_at DESC").Limit(limit).Find(&attempts).Error
	return attempts, err
}
