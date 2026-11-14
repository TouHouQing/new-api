package app

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"time"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

var ErrWorkbenchBillingReceiptNotFound = errors.New("New API billing receipt not found")

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
						switch {
						case errors.Is(err, repository.ErrBillingStorageBusy):
							slog.Warn("workbench billing mirror storage busy; retrying later", "task", order.TaskID, "order", order.ID)
						case errors.Is(err, repository.ErrNewAPIBillingIdentityMismatch):
							slog.Error("workbench billing receipt identity mismatch", "task", order.TaskID, "order", order.ID)
						case errors.Is(err, repository.ErrBillingStateConflict):
							slog.Error("workbench billing receipt state conflict", "task", order.TaskID, "order", order.ID)
						default:
							slog.Warn("workbench settlement remains pending", "task", order.TaskID, "order", order.ID, "error", err)
						}
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
	if !model.IsNewAPIBillingOrder(*order) {
		if refund {
			return r.Repository.RefundBillingOrder(id, "")
		}
		return r.Repository.SettleBillingOrder(id, providerID)
	}
	if order.BillingSource != model.BillingSourceNewAPI || !strings.HasPrefix(order.UserID, "newapi:") {
		return BadAuthRequest("New API 计费回执缺少权威来源或用户归属")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	attempt, err := workbenchReceiptAttempt(*order, order.TaskID)
	if err != nil {
		return err
	}
	bill, err := r.svc.host.Billing(ctx, strings.TrimPrefix(order.UserID, "newapi:"), order.TaskID, attempt)
	if err != nil {
		return err
	}
	return r.syncBillingReceipt(*order, bill, providerID, refund)
}

func (r *workbenchBillingRepository) syncBillingReceipt(order model.BillingOrder, bill WorkbenchHostBilling, providerID string, refund bool) error {
	if err := validateWorkbenchBillingReceipt(order, bill); err != nil {
		return err
	}
	effectiveProviderID := strings.TrimSpace(providerID)
	if effectiveProviderID == "" {
		effectiveProviderID = strings.TrimSpace(order.ProviderRequestID)
	}
	if effectiveProviderID == "" {
		effectiveProviderID = strings.TrimSpace(bill.ProviderRequestID)
	}
	if err := validateWorkbenchBillingProviderID(order, bill, effectiveProviderID); err != nil {
		return err
	}
	status := model.BillingStatusUncertain
	if bill.Final && !bill.Uncertain {
		status = model.BillingStatusSettled
		if refund && bill.ChargedMicrocredits == 0 {
			status = model.BillingStatusRefunded
		}
	}
	return r.Repository.SyncWorkbenchBilling(order.ID, status, bill.ChargedMicrocredits, bill.ReservedMicrocredits, effectiveProviderID)
}

// AuthorizeBillingRecovery is a read-only fence for a task that already has a
// provider ID. It queries the authoritative New API receipt but never changes
// the local mirror state or moves funds.
func (r *workbenchBillingRepository) AuthorizeBillingRecovery(ctx context.Context, orderID, taskID, userID, providerID string, attempt int, routeAttempt *model.RouteAttempt) error {
	if r == nil || r.Repository == nil || r.svc == nil || r.svc.host == nil {
		return repository.ErrNewAPIBillingAuthorityRequired
	}
	providerID = strings.TrimSpace(providerID)
	if providerID == "" || strings.TrimSpace(taskID) == "" || strings.TrimSpace(userID) == "" {
		return ErrWorkbenchBillingRecoveryEvidence
	}
	order, err := r.Repository.BillingOrder(orderID)
	if err != nil {
		return err
	}
	if order == nil || !model.IsNewAPIBillingOrder(*order) {
		return repository.ErrNewAPIBillingAuthorityRequired
	}
	if order.TaskID != taskID || order.UserID != userID {
		return repository.ErrNewAPIBillingIdentityMismatch
	}
	keyAttempt, err := workbenchReceiptAttempt(*order, taskID)
	if err != nil || keyAttempt != attempt {
		return repository.ErrNewAPIBillingIdentityMismatch
	}
	switch order.Status {
	case model.BillingStatusPendingReceipt, model.BillingStatusRunning, model.BillingStatusUncertain,
		model.BillingStatusSettled, model.BillingStatusRefunded:
	default:
		return repository.ErrBillingStateConflict
	}
	if routeAttempt == nil ||
		routeAttempt.TaskID != taskID ||
		routeAttempt.RouteRun != attempt ||
		(routeAttempt.DispatchState != "accepted" && routeAttempt.DispatchState != "submission_unknown") {
		return ErrWorkbenchBillingRecoveryEvidence
	}
	if routeAttempt.ProviderRequestID != "" && routeAttempt.ProviderRequestID != providerID {
		return repository.ErrNewAPIBillingIdentityMismatch
	}
	if order.ProviderRequestID != "" && order.ProviderRequestID != providerID {
		return repository.ErrNewAPIBillingIdentityMismatch
	}
	if order.ProviderRequestID == "" && routeAttempt.ProviderRequestID == "" {
		return ErrWorkbenchBillingRecoveryEvidence
	}
	receiptCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	bill, err := r.svc.host.Billing(receiptCtx, strings.TrimPrefix(order.UserID, "newapi:"), taskID, attempt)
	if err != nil {
		return err
	}
	if err := validateWorkbenchBillingReceipt(*order, bill); err != nil {
		return err
	}
	if err := validateWorkbenchBillingRecoveryState(*order, bill); err != nil {
		return err
	}
	return validateWorkbenchBillingProviderID(*order, bill, providerID)
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

func (r *workbenchBillingRepository) RefundUnsentBillingOrder(id, taskID, errorText string) error {
	order, err := r.Repository.BillingOrder(id)
	if err != nil {
		return err
	}
	if !model.IsNewAPIBillingOrder(*order) {
		return r.Repository.RefundBillingOrder(id, errorText)
	}
	attempt, err := workbenchReceiptAttempt(*order, taskID)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	bill, err := r.svc.host.Billing(ctx, strings.TrimPrefix(order.UserID, "newapi:"), taskID, attempt)
	if errors.Is(err, ErrWorkbenchBillingReceiptNotFound) {
		return r.Repository.ResolveWorkbenchBillingNotSent(id, taskID, errorText)
	}
	if err != nil {
		return err
	}
	return r.syncBillingReceipt(*order, bill, "", true)
}

func workbenchReceiptAttempt(order model.BillingOrder, taskID string) (int, error) {
	if order.BillingSource != model.BillingSourceNewAPI ||
		order.BillingMode != model.BillingModeNewAPI ||
		!strings.HasPrefix(order.UserID, "newapi:") ||
		strings.TrimSpace(strings.TrimPrefix(order.UserID, "newapi:")) == "" ||
		taskID == "" ||
		order.TaskID != taskID {
		return 0, repository.ErrNewAPIBillingIdentityMismatch
	}
	parts := strings.Split(order.IdempotencyKey, ":")
	if len(parts) != 4 || parts[0] != "newapi" || parts[1] != taskID || parts[3] == "" {
		return 0, repository.ErrNewAPIBillingIdentityMismatch
	}
	attempt, err := strconv.Atoi(parts[2])
	if err != nil || attempt < 0 {
		return 0, repository.ErrNewAPIBillingIdentityMismatch
	}
	return attempt, nil
}

func validateWorkbenchBillingReceipt(order model.BillingOrder, bill WorkbenchHostBilling) error {
	attempt, err := workbenchReceiptAttempt(order, order.TaskID)
	if err != nil {
		return err
	}
	expectedReceiptID := fmt.Sprintf("wb:%s:%d", order.TaskID, attempt)
	if bill.Source != model.BillingSourceNewAPI ||
		bill.ReceiptID != expectedReceiptID ||
		bill.UserID != order.UserID ||
		bill.TaskID != order.TaskID {
		return repository.ErrNewAPIBillingIdentityMismatch
	}
	if bill.ReservedMicrocredits < 0 || bill.ChargedMicrocredits < 0 {
		return BadAuthRequest("New API 计费回执金额无效")
	}
	if bill.Final && bill.ReservedMicrocredits != 0 {
		return BadAuthRequest("New API 已终结的回执不能保留冻结金额")
	}
	return nil
}

func validateWorkbenchBillingProviderID(order model.BillingOrder, bill WorkbenchHostBilling, providerID string) error {
	if strings.TrimSpace(bill.ProviderRequestID) == "" {
		return nil
	}
	expected := strings.TrimSpace(providerID)
	if expected == "" {
		expected = strings.TrimSpace(order.ProviderRequestID)
	}
	// At create-response time the host can be the first durable component to
	// learn the provider ID; the mirror is allowed to adopt it. Recovery always
	// supplies the expected ID and remains strict.
	if expected != "" && strings.TrimSpace(bill.ProviderRequestID) != expected {
		return repository.ErrNewAPIBillingIdentityMismatch
	}
	return nil
}

func validateWorkbenchBillingRecoveryState(order model.BillingOrder, bill WorkbenchHostBilling) error {
	switch order.Status {
	case model.BillingStatusSettled:
		if !bill.Final || bill.Uncertain || bill.ChargedMicrocredits != order.ActualAmountMicrocredits {
			return repository.ErrBillingStateConflict
		}
	case model.BillingStatusRefunded:
		if !bill.Final || bill.Uncertain || bill.ChargedMicrocredits != 0 {
			return repository.ErrBillingStateConflict
		}
	}
	return nil
}

func (s *Service) workbenchReceiptOrder(userID string, task *model.Task, input map[string]any) (*model.BillingOrder, error) {
	config, _ := input["config"].(map[string]any)
	if config == nil || !strings.HasPrefix(stringValue(config["channelId"]), "newapi-") {
		return nil, nil
	}
	items, err := s.workbenchModels(context.Background(), userID)
	if err != nil {
		return nil, err
	}
	found := false
	for _, item := range items {
		if item.Key == stringValue(config["model"]) && "newapi-"+item.Capability == stringValue(config["channelId"]) {
			found = true
			break
		}
	}
	if !found {
		return nil, InvalidModelSelection("当前账户无权使用此模型")
	}
	// The catalog does not authorize money. This task remains at zero until
	// New API returns its reservation/settlement receipt.
	task.AuthorizedChargeMicrocredits = 0
	now := time.Now()
	return &model.BillingOrder{
		ID: newID(), UserID: userID, TaskID: task.ID,
		IdempotencyKey: fmt.Sprintf("newapi:%s:%d:%s", task.ID, task.RouteRun, newID()),
		ChannelID:      stringValue(config["channelId"]), Model: stringValue(config["model"]),
		Capability: capabilityFromTaskType(task.Type), Scene: task.Operation,
		BillingMode: model.BillingModeNewAPI, BillingSource: model.BillingSourceNewAPI,
		Status: model.BillingStatusPendingReceipt, CreatedAt: now, UpdatedAt: now,
	}, nil
}
