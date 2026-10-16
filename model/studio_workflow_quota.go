package model

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

// StudioWorkflowCharge is a spending reservation, never an API credential.
// Request identity links synchronous billing and later task settlement.
type StudioWorkflowCharge struct {
	RequestID string `gorm:"type:varchar(128);primaryKey"`
	JobID     string `gorm:"type:varchar(128);not null;index"`
	UserID    int    `gorm:"not null;index"`
	Quota     int64  `gorm:"not null;default:0"`
	Final     bool   `gorm:"not null;default:false"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

var ErrStudioWorkflowBudget = errors.New("workflow spending limit reached; increase the limit before starting another generation")

func EnsureStudioWorkflowCharge(userID int, jobID, requestID string) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		var job StudioWorkflowJob
		if err := lockForUpdate(tx).Where("id = ? AND user_id = ? AND status = ?", jobID, userID, "running").First(&job).Error; err != nil {
			return err
		}
		// Existing jobs may have spent money before keyless execution shipped.
		// Import current usage into the spending limit without authenticating by key.
		if job.TokenID > 0 {
			var token Token
			if err := tx.Where("id = ? AND user_id = ?", job.TokenID, userID).First(&token).Error; err != nil {
				return err
			}
			var total struct{ Quota int64 }
			if err := tx.Model(&StudioWorkflowCharge{}).Select("COALESCE(SUM(quota), 0) AS quota").Where("job_id = ? AND user_id = ?", jobID, userID).Scan(&total).Error; err != nil {
				return err
			}
			if err := tx.Model(&StudioWorkflowJob{}).Where("id = ?", jobID).Update("reserved", int64(token.UsedQuota)+total.Quota).Error; err != nil {
				return err
			}
		}
		var charge StudioWorkflowCharge
		err := tx.Where("request_id = ?", requestID).First(&charge).Error
		if err == nil {
			if charge.JobID != jobID || charge.UserID != userID {
				return ErrStudioAccess
			}
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		return tx.Create(&StudioWorkflowCharge{RequestID: requestID, JobID: jobID, UserID: userID}).Error
	})
}

// Quota is absolute at settlement and relative at reservation. Settlements may
// report an upstream overrun; it must remain visible and block further spending.
func UpdateStudioWorkflowCharge(userID int, jobID, requestID string, quota int64, reserve, final bool) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		var job StudioWorkflowJob
		if err := lockForUpdate(tx).Where("id = ? AND user_id = ?", jobID, userID).First(&job).Error; err != nil {
			return err
		}
		var charge StudioWorkflowCharge
		if err := lockForUpdate(tx).Where("request_id = ? AND job_id = ? AND user_id = ?", requestID, jobID, userID).First(&charge).Error; err != nil {
			return err
		}
		if reserve {
			if quota < 0 || charge.Final || job.Status != "running" {
				return ErrStudioWorkflowBudget
			}
			quota += charge.Quota
		}
		if quota < 0 {
			return errors.New("workflow quota cannot be negative")
		}
		delta := quota - charge.Quota
		update := tx.Model(&StudioWorkflowJob{}).Where("id = ? AND user_id = ? AND reserved >= ?", jobID, userID, -delta)
		if reserve {
			update = update.Where("reserved <= ?", job.Budget-delta)
		}
		if reserve && job.Reserved+delta > job.Budget {
			return ErrStudioWorkflowBudget
		}
		if delta != 0 {
			changed := update.Update("reserved", gorm.Expr("reserved + ?", delta))
			if changed.Error != nil {
				return changed.Error
			}
			if changed.RowsAffected != 1 {
				return ErrStudioWorkflowBudget
			}
		}
		return tx.Model(&StudioWorkflowCharge{}).Where("request_id = ? AND quota = ?", requestID, charge.Quota).Updates(map[string]any{"quota": quota, "final": final, "updated_at": time.Now()}).Error
	})
}

func StudioWorkflowChargeUsage(userID int, jobID string) (int64, bool, error) {
	var charges []StudioWorkflowCharge
	if err := DB.Where("job_id = ? AND user_id = ?", jobID, userID).Find(&charges).Error; err != nil {
		return 0, false, err
	}
	var used int64
	final := true
	for _, charge := range charges {
		used += charge.Quota
		final = final && charge.Final
	}
	return used, final, nil
}
