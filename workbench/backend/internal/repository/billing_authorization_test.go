package repository

import (
	"errors"
	"testing"

	"yingce/backend/internal/model"
)

func TestHostedRepositoryRejectsLocalCreditReservation(t *testing.T) {
	repo, db := newRefundedBillingRecoveryRepository(t)
	repo.RequireNewAPIBillingAuthority()

	localOrder := &model.BillingOrder{
		ID: "local-order", UserID: "newapi:42", IdempotencyKey: "local",
		BillingMode: "fixed_request", AmountMicrocredits: 1_000_000,
		Status: model.BillingStatusReserved,
	}
	if err := repo.ReserveBillingOrder(localOrder); !errors.Is(err, ErrNewAPIBillingAuthorityRequired) {
		t.Fatalf("local credit reservation error = %v", err)
	}
	var count int64
	if err := db.Model(&model.BillingOrder{}).Count(&count).Error; err != nil || count != 0 {
		t.Fatalf("local order persisted: count=%d err=%v", count, err)
	}

	externalOrder := &model.BillingOrder{
		ID: "external-order", UserID: "newapi:42", IdempotencyKey: "external",
		BillingMode: model.BillingModeNewAPI, BillingSource: model.BillingSourceNewAPI,
		Status: model.BillingStatusReserved,
	}
	if err := repo.ReserveBillingOrder(externalOrder); err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&model.CreditAccount{}).Count(&count).Error; err != nil || count != 0 {
		t.Fatalf("New API receipt touched local account: count=%d err=%v", count, err)
	}
}

func TestHostedRepositoryRejectsEveryLocalFundMutation(t *testing.T) {
	repo, db := newRefundedBillingRecoveryRepository(t)
	repo.RequireNewAPIBillingAuthority()

	checks := []struct {
		name string
		run  func() error
	}{
		{"grant", func() error {
			_, _, err := repo.GrantCreditsOnce("newapi:42", model.CreditLedgerSignupBonus, 100, "signup:42", "test")
			return err
		}},
		{"adjust", func() error {
			_, err := repo.AdjustCredits("newapi:42", "admin", 100, "test")
			return err
		}},
		{"redeem", func() error {
			_, err := repo.RedeemCode("newapi:42", "hash", "")
			return err
		}},
		{"payment", func() error {
			_, _, err := repo.CompletePaymentOrder("provider", "merchant", PaymentEvidence{})
			return err
		}},
		{"referral", func() error {
			_, err := repo.GrantReferralCommission(&model.ReferralCommission{CommissionMicrocredits: 100}, "test")
			return err
		}},
	}
	for _, check := range checks {
		t.Run(check.name, func(t *testing.T) {
			if err := check.run(); !errors.Is(err, ErrNewAPIBillingAuthorityRequired) {
				t.Fatalf("local fund mutation error = %v", err)
			}
		})
	}
	var ledgerCount, accountCount int64
	if err := db.Model(&model.CreditLedgerEntry{}).Count(&ledgerCount).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&model.CreditAccount{}).Count(&accountCount).Error; err != nil {
		t.Fatal(err)
	}
	if ledgerCount != 0 || accountCount != 0 {
		t.Fatalf("hosted mutations wrote local funds: ledger=%d accounts=%d", ledgerCount, accountCount)
	}
	account, err := repo.CreditAccount("newapi:42")
	if err != nil {
		t.Fatal(err)
	}
	if account.AvailableMicrocredits != 0 || account.ReservedMicrocredits != 0 {
		t.Fatalf("hosted balance projection is not zero: %+v", account)
	}
	if err := db.Model(&model.CreditAccount{}).Count(&accountCount).Error; err != nil || accountCount != 0 {
		t.Fatalf("hosted balance read created a local wallet: count=%d err=%v", accountCount, err)
	}
}

func TestAgentRouteReplacementCannotExpandApprovedCharge(t *testing.T) {
	repo, db := newRefundedBillingRecoveryRepository(t)
	if err := db.AutoMigrate(&model.Task{}); err != nil {
		t.Fatal(err)
	}
	task := model.Task{ID: "generation-task", UserID: "user", AgentRunID: "run", GenerationID: "generation", Status: model.TaskStatusRunning, RouteID: "original", BillingOrderID: "order", AuthorizedChargeMicrocredits: 100}
	order := model.BillingOrder{ID: "order", TaskID: task.ID, UserID: task.UserID, Status: model.BillingStatusRunning, BillingMode: "per_second", AmountMicrocredits: 100, ReservedAmountMicrocredits: 100, ChargeLimitSet: true, ChargeLimitMicrocredits: 100}
	for _, item := range []any{&task, &order, &model.CreditAccount{UserID: "user", AvailableMicrocredits: 1000, ReservedMicrocredits: 100}} {
		if err := db.Create(item).Error; err != nil {
			t.Fatal(err)
		}
	}
	replacement := order
	replacement.AmountMicrocredits = 101
	if err := repo.SwitchTaskLogicalRoute(task.ID, "original", "expensive", "{}", order.ID, "channel", "model", &replacement, model.BillingCostSnapshot{}); !errors.Is(err, ErrBillingChargeLimit) {
		t.Fatalf("expensive fallback accepted: %v", err)
	}
	stored, err := repo.Task(task.ID)
	if err != nil || stored.RouteID != "original" {
		t.Fatalf("route not rolled back: %+v %v", stored, err)
	}
	var account model.CreditAccount
	if err := db.First(&account, "user_id = ?", "user").Error; err != nil {
		t.Fatal(err)
	}
	if account.AvailableMicrocredits != 1000 || account.ReservedMicrocredits != 100 {
		t.Fatalf("credits changed: %+v", account)
	}
	replacement.AmountMicrocredits = 90
	if err := repo.SwitchTaskLogicalRoute(task.ID, "original", "cheaper", "{}", order.ID, "channel", "model", &replacement, model.BillingCostSnapshot{}); err != nil {
		t.Fatal(err)
	}
	if err := repo.SettleBillingOrder(order.ID, "provider"); err != nil {
		t.Fatal(err)
	}
	var settled model.BillingOrder
	if err := db.First(&settled, "id = ?", order.ID).Error; err != nil {
		t.Fatal(err)
	}
	if !settled.ChargeLimitSet || settled.ChargeLimitMicrocredits != 100 || settled.ActualAmountMicrocredits != 90 {
		t.Fatalf("lost authorization: %+v", settled)
	}
}

func TestBillingSettlementRejectsFixedChargeBeyondAuthorization(t *testing.T) {
	for _, restored := range []bool{false, true} {
		repo, db := newRefundedBillingRecoveryRepository(t)
		status := model.BillingStatusRunning
		if restored {
			status = model.BillingStatusRefunded
		}
		order := model.BillingOrder{ID: "order", UserID: "user", Status: status, BillingMode: "fixed_request", AmountMicrocredits: 10, ChargeLimitSet: true, ChargeLimitMicrocredits: 0}
		if err := db.Create(&order).Error; err != nil {
			t.Fatal(err)
		}
		var err error
		if restored {
			err = repo.RestoreRefundedBillingOrder(order.ID, "")
		} else {
			err = repo.SettleBillingOrder(order.ID, "")
		}
		if !errors.Is(err, ErrBillingChargeLimit) {
			t.Fatalf("zero authorization treated as uncapped: %v", err)
		}
	}
}
