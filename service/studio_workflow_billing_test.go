package service

import (
	"context"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestStudioWorkflowAccountBillingPreservesLimitAndSettlementWithoutToken(t *testing.T) {
	studioProductionFixture(t)
	priorRedis := common.RedisEnabled
	common.RedisEnabled = false
	t.Cleanup(func() { common.RedisEnabled = priorRedis })
	job := model.StudioWorkflowJob{ID: "billing-film", UserID: 1, ProjectID: "film", RequestID: "billing-job", Kind: "generate", Status: "running", Budget: 1000, Plan: "{}", Result: "{}"}
	require.NoError(t, model.DB.Create(&job).Error)
	require.NoError(t, model.EnsureStudioWorkflowCharge(1, job.ID, "billing-request"))
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	info := &relaycommon.RelayInfo{UserId: 1, IsPlayground: true, StudioWorkflowID: job.ID, RequestId: "billing-request", ForcePreConsume: true, UserSetting: dto.UserSetting{BillingPreference: "wallet_only"}}
	require.NotNil(t, PreConsumeBilling(c, 1500, info))
	user, err := model.GetUserById(1, false)
	require.NoError(t, err)
	assert.Equal(t, 10_000_000, user.Quota)
	require.Nil(t, PreConsumeBilling(c, 400, info))
	assert.Error(t, info.Billing.Reserve(1200))
	user, err = model.GetUserById(1, false)
	require.NoError(t, err)
	assert.Equal(t, 9_999_600, user.Quota)
	require.NoError(t, SettleBilling(c, info, 250))
	user, err = model.GetUserById(1, false)
	require.NoError(t, err)
	assert.Equal(t, 9_999_750, user.Quota)
	used, final, err := model.StudioWorkflowChargeUsage(1, job.ID)
	require.NoError(t, err)
	assert.EqualValues(t, 250, used)
	assert.False(t, final)
	// A host-owned async task finalizes after the worker has released its lease.
	task := &model.Task{UserId: 1, PrivateData: model.TaskPrivateData{StudioWorkflowID: job.ID, Execution: &model.TaskExecutionSnapshot{RequestID: "billing-request"}}}
	finalizeStudioTaskCharge(context.Background(), task, 250)
	finalizeStudioTaskCharge(context.Background(), task, 250)
	used, final, err = model.StudioWorkflowChargeUsage(1, job.ID)
	require.NoError(t, err)
	assert.EqualValues(t, 250, used)
	assert.True(t, final)
	var count int64
	require.NoError(t, model.DB.Model(&model.Token{}).Count(&count).Error)
	assert.Zero(t, count)
}

func TestStudioWorkflowZeroCostTerminalTasksFinalizeSettlement(t *testing.T) {
	studioProductionFixture(t)
	for _, status := range []model.TaskStatus{model.TaskStatusSuccess, model.TaskStatusFailure} {
		id := "free-final-" + string(status)
		job := model.StudioWorkflowJob{ID: id, UserID: 1, ProjectID: "film", RequestID: id, Status: "running", Kind: "generate", Budget: 1000, Plan: "{}", Result: "{}"}
		require.NoError(t, model.DB.Create(&job).Error)
		require.NoError(t, model.EnsureStudioWorkflowCharge(1, id, id+"-request"))
		task := &model.Task{UserId: 1, Status: status, PrivateData: model.TaskPrivateData{StudioWorkflowID: id, Execution: &model.TaskExecutionSnapshot{RequestID: id + "-request"}, BillingContext: &model.TaskBillingContext{PerCallBilling: true}}}
		finalizeTerminalTask(t.Context(), &taskPollingFetchAdaptor{}, task, &relaycommon.TaskInfo{})
		used, final, err := model.StudioWorkflowChargeUsage(1, id)
		require.NoError(t, err)
		assert.Zero(t, used)
		assert.True(t, final)
	}
}

func TestStudioWorkflowResumeReconcilesConfirmedZeroCostFailure(t *testing.T) {
	studioProductionFixture(t)
	progress, err := common.Marshal(StudioWorkflowProgress{TaskID: "settled-receipt", RequestID: "settled-request"})
	require.NoError(t, err)
	job := model.StudioWorkflowJob{ID: "settled-job", UserID: 1, ProjectID: "film", RequestID: "settled-job-request", Status: "running", Kind: "generate", Budget: 1000, Plan: "{}", Result: model.StudioDocument(progress)}
	require.NoError(t, model.DB.Create(&job).Error)
	require.NoError(t, model.EnsureStudioWorkflowCharge(1, job.ID, "settled-request"))
	task := model.Task{TaskID: "settled-receipt", UserId: 1, Status: model.TaskStatusFailure, PrivateData: model.TaskPrivateData{StudioWorkflowID: job.ID, Execution: &model.TaskExecutionSnapshot{RequestID: "settled-request"}}}
	require.NoError(t, model.DB.Create(&task).Error)
	ReconcileStudioWorkflowSettlement(t.Context(), &job)
	used, final, err := model.StudioWorkflowChargeUsage(1, job.ID)
	require.NoError(t, err)
	assert.Zero(t, used)
	assert.True(t, final)
}
