package app

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"yingce/backend/internal/model"
)

func TestWorkbenchRetryPreservesHostSettlementAndNeverRefundsNativeCredits(t *testing.T) {
	for _, tc := range []struct {
		name    string
		bill    WorkbenchHostBilling
		want    model.BillingStatus
		blocked bool
	}{
		{"confirmed no charge", WorkbenchHostBilling{Final: true}, model.BillingStatusRefunded, false},
		{"already charged", WorkbenchHostBilling{Final: true, ChargedMicrocredits: 120000}, model.BillingStatusSettled, false},
		{"still reconciling", WorkbenchHostBilling{Uncertain: true, ReservedMicrocredits: 5000000}, model.BillingStatusUncertain, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, db := newTimelineTaskTestService(t)
			s.dataDir = t.TempDir()
			host := &testWorkbenchHost{actor: WorkbenchHostUser{ID: "42"}, bill: tc.bill, models: []WorkbenchHostModel{{Key: "retry-text", Name: "Fixture text", Capability: "text", Protocol: "chat-completion", SpendingCapMicrocredits: 5000000}}}
			require.NoError(t, s.ConfigureWorkbenchHost(host))
			user, err := s.WorkbenchCurrentUser(WithWorkbenchIdentity(context.Background(), "42"))
			require.NoError(t, err)
			task, err := s.CreateTask(user.ID, CreateTaskRequest{Type: "canvas_text", Operation: "text", Prompt: "retry fixture", Input: map[string]any{"mode": "text", "prompt": "retry fixture", "config": map[string]any{"channelId": "newapi-text", "model": "retry-text"}}})
			require.NoError(t, err)
			oldOrder := task.BillingOrderID
			require.NotEmpty(t, oldOrder)
			require.NoError(t, db.Model(&model.Task{}).Where("id = ?", task.ID).Update("status", model.TaskStatusFailed).Error)
			_, err = s.RetryTask(user.ID, task.ID)
			if tc.blocked {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}
			stored, readErr := s.repo.Task(task.ID)
			require.NoError(t, readErr)
			if tc.blocked {
				assert.Equal(t, task.RouteRun, stored.RouteRun)
				assert.Equal(t, oldOrder, stored.BillingOrderID)
			} else {
				assert.Equal(t, task.RouteRun+1, stored.RouteRun)
				assert.NotEqual(t, oldOrder, stored.BillingOrderID)
			}
			original, err := s.repo.BillingOrder(oldOrder)
			require.NoError(t, err)
			assert.Equal(t, tc.want, original.Status)
			assert.Equal(t, tc.bill.ChargedMicrocredits, original.ActualAmountMicrocredits)
			assert.Positive(t, host.billingReads)
			assert.Zero(t, host.calls, "retry admission must not invoke a model")
			var entries int64
			require.NoError(t, db.Model(&model.CreditLedgerEntry{}).Where("user_id = ?", user.ID).Count(&entries).Error)
			assert.Zero(t, entries, "only New API may change the hosted wallet")
		})
	}
}
