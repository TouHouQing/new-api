package app

import (
	"context"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"time"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

// Only the host changes money. These rows are immutable execution receipts and
// mirrors of host settlement, never a second credit ledger.
type workbenchBillingRepository struct {
	*repository.Repository
	svc *Service
}

func (s *Service) StartWorkbenchBillingReconciliation() {
	if s.host == nil {
		return
	}
	s.runWorkerLoop(func(ctx context.Context) {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			orders, err := s.repo.TerminalWorkbenchBillingOrders(100)
			if err != nil {
				slog.Warn("workbench billing reconciliation query failed")
			} else {
				coordinator := &workbenchBillingRepository{Repository: s.repo, svc: s}
				for _, order := range orders {
					if ctx.Err() != nil {
						return
					}
					task, err := s.repo.Task(order.TaskID)
					if err != nil {
						continue
					}
					if err := coordinator.sync(order.ID, order.ProviderRequestID, task.Status != model.TaskStatusSucceeded); err != nil {
						slog.Warn("workbench settlement remains pending", "task", order.TaskID)
					}
				}
			}
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	})
}

func (r *workbenchBillingRepository) sync(id, providerID string, refund bool) error {
	order, err := r.Repository.BillingOrder(id)
	if err != nil {
		return err
	}
	if order.BillingMode != "host" {
		if refund {
			return r.Repository.RefundBillingOrder(id, "")
		}
		return r.Repository.SettleBillingOrder(id, providerID)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	parts := strings.Split(order.IdempotencyKey, ":")
	if len(parts) != 4 {
		return BadAuthRequest("工作台计费回执无效")
	}
	attempt, err := strconv.Atoi(parts[2])
	if err != nil || attempt < 0 {
		return BadAuthRequest("工作台计费回执无效")
	}
	bill, err := r.svc.host.Billing(ctx, strings.TrimPrefix(order.UserID, "newapi:"), order.TaskID, attempt)
	if err != nil {
		return err
	}
	status := model.BillingStatusUncertain
	if bill.Final && !bill.Uncertain {
		status = model.BillingStatusSettled
		if refund && bill.ChargedMicrocredits == 0 {
			status = model.BillingStatusRefunded
		}
	}
	return r.Repository.SyncWorkbenchBilling(id, status, bill.ChargedMicrocredits, bill.ReservedMicrocredits, providerID)
}
func (r *workbenchBillingRepository) SettleBillingOrder(id, providerID string) error {
	return r.sync(id, providerID, false)
}
func (r *workbenchBillingRepository) SettleBillingOrderWithAudioDuration(id, providerID string, _ int64) error {
	return r.sync(id, providerID, false)
}
func (r *workbenchBillingRepository) RestoreRefundedBillingOrder(id, providerID string) error {
	return r.sync(id, providerID, false)
}
func (r *workbenchBillingRepository) RefundBillingOrder(id, _ string) error {
	return r.sync(id, "", true)
}

func (s *Service) workbenchTaskBillingOrder(userID string, task *model.Task, input map[string]any) (*model.BillingOrder, error) {
	config, _ := input["config"].(map[string]any)
	if config == nil || !strings.HasPrefix(stringValue(config["channelId"]), "newapi-") {
		return nil, nil
	}
	items, err := s.workbenchModels(context.Background(), userID)
	if err != nil {
		return nil, err
	}
	limit := int64(-1)
	for _, item := range items {
		if item.Key == stringValue(config["model"]) && "newapi-"+item.Capability == stringValue(config["channelId"]) {
			limit = item.SpendingCapMicrocredits
			break
		}
	}
	if limit < 0 {
		return nil, InvalidModelSelection("当前账户无权使用此模型")
	}
	task.AuthorizedChargeMicrocredits = limit
	now := time.Now()
	return &model.BillingOrder{ID: newID(), UserID: userID, TaskID: task.ID, IdempotencyKey: fmt.Sprintf("host:%s:%d:%s", task.ID, task.RouteRun, newID()), ChannelID: stringValue(config["channelId"]), Model: stringValue(config["model"]), Capability: capabilityFromTaskType(task.Type), Scene: task.Operation, BillingMode: "host", AmountMicrocredits: limit, ChargeLimitSet: true, ChargeLimitMicrocredits: limit, Status: model.BillingStatusReserved, CreatedAt: now, UpdatedAt: now}, nil
}
