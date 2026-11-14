package repository

import (
	"errors"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"yingce/backend/internal/model"
)

func validateNewAPIReceiptIdentity(order model.BillingOrder, taskID string, attempt int) error {
	if order.BillingSource != model.BillingSourceNewAPI ||
		order.BillingMode != model.BillingModeNewAPI ||
		!strings.HasPrefix(order.UserID, "newapi:") ||
		strings.TrimSpace(strings.TrimPrefix(order.UserID, "newapi:")) == "" ||
		strings.TrimSpace(taskID) == "" ||
		order.TaskID != taskID ||
		attempt < 0 {
		return ErrNewAPIBillingIdentityMismatch
	}
	keyAttempt, err := newAPIReceiptKeyAttempt(order, taskID)
	if err != nil || keyAttempt != attempt {
		return ErrNewAPIBillingIdentityMismatch
	}
	return nil
}

func newAPIReceiptKeyAttempt(order model.BillingOrder, taskID string) (int, error) {
	parts := strings.Split(order.IdempotencyKey, ":")
	if len(parts) != 4 || parts[0] != "newapi" || parts[1] != taskID || parts[3] == "" {
		return 0, ErrNewAPIBillingIdentityMismatch
	}
	attempt, err := strconv.Atoi(parts[2])
	if err != nil || attempt < 0 {
		return 0, ErrNewAPIBillingIdentityMismatch
	}
	return attempt, nil
}

// Account projection deliberately uses a stable host namespace. Existing
// native accounts are never linked by matching an email or display name.
func (r *Repository) SyncWorkbenchUser(id, displayName string, role model.UserRole) (*model.User, error) {
	var existing model.User
	if err := r.db.Where("id = ?", id).First(&existing).Error; err == nil && existing.DisplayName == displayName && existing.Role == role && existing.Status == model.UserStatusActive {
		return &existing, nil
	}
	now := time.Now()
	user := model.User{ID: id, Username: id, DisplayName: displayName, Role: role, Status: model.UserStatusActive, CreatedAt: now, UpdatedAt: now}
	err := r.db.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "id"}}, DoUpdates: clause.Assignments(map[string]any{"display_name": displayName, "role": role, "status": model.UserStatusActive, "updated_at": now})}).Create(&user).Error
	if err != nil {
		return nil, err
	}
	err = r.db.Where("id = ?", id).First(&user).Error
	return &user, err
}

func (r *Repository) SyncWorkbenchModel(key, name, description, capability, protocol, profile string) error {
	now := time.Now()
	channelID := "newapi-" + capability
	cmID := "host-" + key
	var existing model.ChannelModel
	if err := r.db.Where("id = ?", cmID).First(&existing).Error; err == nil && existing.DisplayName == name && existing.Description == description && string(existing.Protocol) == protocol && existing.CapabilityConfigJSON == profile && existing.UnitPriceMicrocredits == 0 {
		return nil
	}
	return r.db.Transaction(func(tx *gorm.DB) error {
		channel := model.ModelChannel{ID: channelID, Scope: model.ChannelScopeSystem, Enabled: true, Name: "New API", BaseURL: "http://newapi.workbench.invalid/v1", APIFormat: "openai", ModelsJSON: "[]", HeadersJSON: "[]", CreatedAt: now, UpdatedAt: now}
		if err := tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "id"}}, DoUpdates: clause.AssignmentColumns([]string{"enabled", "base_url", "updated_at"})}).Create(&channel).Error; err != nil {
			return err
		}
		cm := model.ChannelModel{ID: cmID, ChannelID: channelID, ModelKey: key, ProviderModelKey: key, DisplayName: name, Description: description, Capability: capability, Protocol: model.ChannelInterfaceType(protocol), Enabled: true, PriceConfigured: true, PriceVersion: 1, CapabilityVersion: 1, BillingMode: "fixed_request", PriceCurrency: "credits", CapabilityConfigJSON: profile, Tags: []model.ChannelModelTag{}, CreatedAt: now, UpdatedAt: now}
		if err := tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "id"}}, DoUpdates: clause.AssignmentColumns([]string{"display_name", "description", "protocol", "capability_config_json", "enabled", "unit_price_microcredits", "updated_at"})}).Create(&cm).Error; err != nil {
			return err
		}
		tier := model.ChannelModelPriceTier{ID: "tier-" + key, ChannelModelID: cmID, SelectorKey: "{}", SelectorJSON: "{}", Resolution: "*", ProviderModelKey: key, BillingMode: "fixed_request", Enabled: true, PriceConfigured: true, PriceVersion: 1, CreatedAt: now, UpdatedAt: now}
		return tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "id"}}, DoUpdates: clause.AssignmentColumns([]string{"unit_price_microcredits", "updated_at"})}).Create(&tier).Error
	})
}

func (r *Repository) SyncWorkbenchBilling(id string, status model.BillingStatus, charged, reserved int64, providerID string) error {
	if charged < 0 || reserved < 0 {
		return gorm.ErrInvalidData
	}
	var err error
	for retry := 0; retry < 5; retry++ {
		err = r.db.Transaction(func(tx *gorm.DB) error {
			var order model.BillingOrder
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", id).First(&order).Error; err != nil {
				return err
			}
			if !model.IsNewAPIBillingOrder(order) {
				return ErrNewAPIBillingAuthorityRequired
			}
			if order.BillingSource != model.BillingSourceNewAPI || !strings.HasPrefix(order.UserID, "newapi:") {
				return ErrNewAPIBillingIdentityMismatch
			}
			attempt, err := newAPIReceiptKeyAttempt(order, order.TaskID)
			if err != nil {
				return err
			}
			if err := validateNewAPIReceiptIdentity(order, order.TaskID, attempt); err != nil {
				return err
			}
			if !validWorkbenchBillingTransition(order.Status, status) {
				return ErrBillingStateConflict
			}
			if (order.Status == model.BillingStatusSettled || order.Status == model.BillingStatusRefunded) && order.Status == status {
				if order.ActualAmountMicrocredits != charged || order.ReservedAmountMicrocredits != reserved {
					return ErrBillingStateConflict
				}
				return nil
			}
			now := time.Now()
			updates := map[string]any{
				"billing_source": model.BillingSourceNewAPI, "status": status,
				"actual_amount_microcredits": charged, "reserved_amount_microcredits": reserved,
				"provider_request_id": providerID, "usage_source": model.BillingSourceNewAPI,
				"usage_available": status == model.BillingStatusSettled, "updated_at": now,
			}
			if status == model.BillingStatusRefunded {
				updates["refunded_at"] = &now
				updates["refunded_amount_microcredits"] = charged
			}
			changed := tx.Model(&model.BillingOrder{}).
				Where("id = ? AND status = ? AND user_id = ? AND task_id = ?", id, order.Status, order.UserID, order.TaskID).
				Updates(updates)
			if changed.Error != nil {
				return changed.Error
			}
			if changed.RowsAffected != 1 {
				return ErrBillingStateConflict
			}
			mirror := reserved
			if status == model.BillingStatusSettled || status == model.BillingStatusRefunded {
				mirror = charged
			}
			updatedTask := tx.Model(&model.Task{}).Where("id = ? AND user_id = ?", order.TaskID, order.UserID).
				Update("authorized_charge_microcredits", mirror)
			if updatedTask.Error != nil {
				return updatedTask.Error
			}
			if updatedTask.RowsAffected != 1 {
				return ErrNewAPIBillingIdentityMismatch
			}
			return nil
		})
		if !billingDatabaseBusy(err) {
			return err
		}
		time.Sleep(time.Duration(5*(retry+1)) * time.Millisecond)
	}
	return err
}

func validWorkbenchBillingTransition(from, to model.BillingStatus) bool {
	switch from {
	case model.BillingStatusPendingReceipt, model.BillingStatusReserved, model.BillingStatusRunning, model.BillingStatusUncertain:
		return to == model.BillingStatusUncertain || to == model.BillingStatusSettled || to == model.BillingStatusRefunded
	case model.BillingStatusSettled:
		return to == model.BillingStatusSettled
	case model.BillingStatusRefunded:
		return to == model.BillingStatusRefunded
	default:
		return false
	}
}

func (r *Repository) ResolveWorkbenchBillingNotSent(id, taskID, errorText string) error {
	if id == "" {
		return nil
	}
	if !r.newAPIBillingOnly {
		return r.RefundBillingOrder(id, errorText)
	}
	submissionUncertain := false
	err := r.db.Transaction(func(tx *gorm.DB) error {
		var order model.BillingOrder
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&order, "id = ?", id).Error; err != nil {
			return err
		}
		if order.BillingSource != model.BillingSourceNewAPI || order.BillingMode != model.BillingModeNewAPI || order.TaskID != taskID {
			return ErrNewAPIBillingIdentityMismatch
		}
		parts := strings.Split(order.IdempotencyKey, ":")
		if len(parts) != 4 || parts[0] != "newapi" || parts[1] != taskID || parts[3] == "" {
			return ErrNewAPIBillingIdentityMismatch
		}
		attempt, err := strconv.Atoi(parts[2])
		if err != nil || attempt < 0 {
			return ErrNewAPIBillingIdentityMismatch
		}
		if err := validateNewAPIReceiptIdentity(order, taskID, attempt); err != nil {
			return err
		}
		if order.Status == model.BillingStatusRefunded {
			return nil
		}
		if order.Status != model.BillingStatusPendingReceipt && order.Status != model.BillingStatusRunning {
			return ErrBillingStateConflict
		}
		ambiguous, err := workbenchReceiptSubmissionAmbiguous(tx, order)
		if err != nil {
			return err
		}
		now := time.Now()
		if ambiguous {
			changed := tx.Model(&model.BillingOrder{}).
				Where("id = ? AND status = ?", order.ID, order.Status).
				Updates(map[string]any{"status": model.BillingStatusUncertain, "error": errorText, "updated_at": now})
			if changed.Error != nil {
				return changed.Error
			}
			if changed.RowsAffected != 1 {
				return ErrBillingStateConflict
			}
			submissionUncertain = true
			return nil
		}
		changed := tx.Model(&model.BillingOrder{}).
			Where("id = ? AND status = ?", order.ID, order.Status).
			Updates(map[string]any{
				"status": model.BillingStatusRefunded, "error": errorText,
				"actual_amount_microcredits": 0, "reserved_amount_microcredits": 0,
				"refunded_amount_microcredits": 0, "refunded_at": &now,
				"usage_source": model.BillingSourceNewAPI, "usage_available": false, "updated_at": now,
			})
		if changed.Error != nil {
			return changed.Error
		}
		if changed.RowsAffected != 1 {
			return ErrBillingStateConflict
		}
		updatedTask := tx.Model(&model.Task{}).Where("id = ? AND user_id = ?", order.TaskID, order.UserID).
			Update("authorized_charge_microcredits", 0)
		if updatedTask.Error != nil {
			return updatedTask.Error
		}
		if updatedTask.RowsAffected != 1 {
			return ErrNewAPIBillingIdentityMismatch
		}
		return nil
	})
	if err != nil {
		return err
	}
	if submissionUncertain {
		return ErrNewAPIBillingSubmissionUncertain
	}
	return nil
}

func workbenchReceiptSubmissionAmbiguous(tx *gorm.DB, order model.BillingOrder) (bool, error) {
	attempt, err := newAPIReceiptKeyAttempt(order, order.TaskID)
	if err != nil {
		return false, err
	}
	var task model.Task
	if err := tx.Select("id", "provider_request_id").First(&task, "id = ? AND user_id = ?", order.TaskID, order.UserID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return true, nil
		}
		return false, err
	}
	if strings.TrimSpace(task.ProviderRequestID) != "" || strings.TrimSpace(order.ProviderRequestID) != "" {
		return true, nil
	}
	var submitted int64
	if err := tx.Model(&model.RouteAttempt{}).
		Where("task_id = ? AND route_run = ? AND (dispatch_state IN ? OR provider_request_id <> '')",
			order.TaskID, attempt, []string{"dispatching", "accepted", "submission_unknown"}).
		Count(&submitted).Error; err != nil {
		return false, err
	}
	if submitted > 0 {
		return true, nil
	}
	var dispatched int64
	if err := tx.Model(&model.ApiCallLog{}).
		Where("task_id = ? AND billing_order_id = ? AND (status_code > 0 OR provider_request_id <> '')", order.TaskID, order.ID).
		Count(&dispatched).Error; err != nil {
		return false, err
	}
	if dispatched > 0 {
		return true, nil
	}
	var successful int64
	if err := tx.Model(&model.ApiCallLog{}).
		Where("task_id = ? AND billing_order_id = ? AND billable = ? AND status = ?",
			order.TaskID, order.ID, true, model.ApiCallStatusSucceeded).
		Count(&successful).Error; err != nil {
		return false, err
	}
	return successful > 0, nil
}

func (r *Repository) TerminalWorkbenchBillingOrders(limit int) ([]model.BillingOrder, error) {
	var orders []model.BillingOrder
	err := r.db.Model(&model.BillingOrder{}).
		Joins("JOIN tasks ON tasks.id = billing_orders.task_id AND tasks.user_id = billing_orders.user_id").
		Where("billing_orders.billing_source = ? AND billing_orders.billing_mode = ?", model.BillingSourceNewAPI, model.BillingModeNewAPI).
		Where("billing_orders.status IN ?", []model.BillingStatus{model.BillingStatusPendingReceipt, model.BillingStatusReserved, model.BillingStatusRunning, model.BillingStatusUncertain}).
		Where("tasks.status <> ?", model.TaskStatusTextReplay).
		Select("billing_orders.*").
		Order("billing_orders.updated_at asc").
		Limit(limit).
		Find(&orders).Error
	return orders, err
}
