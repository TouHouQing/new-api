package repository

import (
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"yingce/backend/internal/model"
)

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
	return r.db.Transaction(func(tx *gorm.DB) error {
		var order model.BillingOrder
		if err := tx.Where("id = ?", id).First(&order).Error; err != nil {
			return err
		}
		if !model.IsNewAPIBillingOrder(order) {
			return ErrNewAPIBillingAuthorityRequired
		}
		now := time.Now()
		if err := tx.Model(&model.BillingOrder{}).Where("id = ?", id).Updates(map[string]any{
			"billing_source": model.BillingSourceNewAPI, "status": status,
			"actual_amount_microcredits": charged, "reserved_amount_microcredits": reserved,
			"provider_request_id": providerID, "usage_source": model.BillingSourceNewAPI,
			"usage_available": status == model.BillingStatusSettled, "updated_at": now,
		}).Error; err != nil {
			return err
		}
		mirror := reserved
		if status == model.BillingStatusSettled || status == model.BillingStatusRefunded {
			mirror = charged
		}
		return tx.Model(&model.Task{}).Where("id = ? AND user_id = ?", order.TaskID, order.UserID).
			Update("authorized_charge_microcredits", mirror).Error
	})
}

func (r *Repository) TerminalWorkbenchBillingOrders(limit int) ([]model.BillingOrder, error) {
	var orders []model.BillingOrder
	err := r.db.Model(&model.BillingOrder{}).Joins("JOIN tasks ON tasks.id = billing_orders.task_id AND tasks.user_id = billing_orders.user_id").Where("(billing_orders.billing_mode IN ? OR billing_orders.billing_source = ?) AND billing_orders.status IN ? AND tasks.status IN ?", []string{model.BillingModeHost, model.BillingModeNewAPI}, model.BillingSourceNewAPI, []model.BillingStatus{model.BillingStatusPendingReceipt, model.BillingStatusReserved, model.BillingStatusRunning, model.BillingStatusUncertain}, []model.TaskStatus{model.TaskStatusSucceeded, model.TaskStatusFailed, model.TaskStatusCancelled}).Select("billing_orders.*").Order("billing_orders.updated_at asc").Limit(limit).Find(&orders).Error
	return orders, err
}
