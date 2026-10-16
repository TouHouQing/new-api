package service

import (
	"context"
	"errors"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"gorm.io/gorm"
)

// An async settlement can occur after the worker/browser has gone away.
// Link it by the host-owned execution snapshot, never a client-provided job ID.
func finalizeStudioTaskCharge(ctx context.Context, task *model.Task, quota int) {
	if task.PrivateData.StudioWorkflowID == "" || task.PrivateData.TokenId != 0 || task.PrivateData.Execution == nil || task.PrivateData.Execution.RequestID == "" {
		return
	}
	var charge model.StudioWorkflowCharge
	err := model.DB.WithContext(ctx).Where("request_id = ? AND user_id = ? AND job_id = ?", task.PrivateData.Execution.RequestID, task.UserId, task.PrivateData.StudioWorkflowID).First(&charge).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return
	}
	if err != nil {
		common.SysError("workflow settlement lookup failed")
		return
	}
	if err := model.UpdateStudioWorkflowCharge(task.UserId, charge.JobID, charge.RequestID, int64(quota), false, true); err != nil {
		common.SysError("workflow settlement update failed")
	}
}

// Recover settlement metadata for an interrupted worker, using only its last
// host-owned terminal task. This never issues inference or changes wallet funds.
func ReconcileStudioWorkflowSettlement(ctx context.Context, job *model.StudioWorkflowJob) {
	var progress StudioWorkflowProgress
	if common.Unmarshal([]byte(job.Result), &progress) != nil || progress.TaskID == "" || progress.RequestID == "" {
		return
	}
	task, exists, err := model.GetByTaskId(job.UserID, progress.TaskID)
	if err != nil || !exists || task == nil || task.PrivateData.StudioWorkflowID != job.ID || task.PrivateData.Execution == nil || task.PrivateData.Execution.RequestID != progress.RequestID {
		return
	}
	if task.Status == model.TaskStatusFailure && task.Quota == 0 {
		finalizeStudioTaskCharge(ctx, task, 0)
	}
	if task.Status == model.TaskStatusSuccess && task.PrivateData.BillingContext != nil && task.PrivateData.BillingContext.PerCallBilling && task.PrivateData.BillingContext.TieredSnapshot == nil {
		finalizeStudioTaskCharge(ctx, task, task.Quota)
	}
}
