package repository

import (
	"errors"
	"net/http"
	"sync"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"yingce/backend/internal/model"
)

func newWorkbenchBillingStateRepository(t *testing.T) (*Repository, *gorm.DB) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+newRepositoryID()+"?mode=memory&cache=shared&_pragma=busy_timeout(5000)"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(
		&model.Task{},
		&model.RouteAttempt{},
		&model.BillingOrder{},
		&model.ApiCallLog{},
		&model.CreditAccount{},
		&model.CreditLedgerEntry{},
	); err != nil {
		t.Fatal(err)
	}
	repo := New(db)
	repo.RequireNewAPIBillingAuthority()
	return repo, db
}

func seedNewAPIReceiptOrder(t *testing.T, db *gorm.DB, taskID, orderID, attempt string, status model.BillingStatus) model.BillingOrder {
	t.Helper()
	task := model.Task{ID: taskID, UserID: "newapi:42", Type: "canvas_video", Status: model.TaskStatusRunning}
	if err := db.Create(&task).Error; err != nil {
		t.Fatal(err)
	}
	order := model.BillingOrder{
		ID: orderID, UserID: task.UserID, TaskID: task.ID,
		IdempotencyKey: "newapi:" + task.ID + ":" + attempt + ":fixture",
		BillingMode:    model.BillingModeNewAPI, BillingSource: model.BillingSourceNewAPI,
		Status: status,
	}
	if err := db.Create(&order).Error; err != nil {
		t.Fatal(err)
	}
	return order
}

func TestMarkBillingRunningNewAPIReceiptDoesNotMoveLocalFunds(t *testing.T) {
	repo, db := newWorkbenchBillingStateRepository(t)
	order := seedNewAPIReceiptOrder(t, db, "task-video", "order-video", "1", model.BillingStatusPendingReceipt)

	if err := repo.MarkBillingRunning(order.ID, order.TaskID, 1); err != nil {
		t.Fatal(err)
	}
	stored, err := repo.BillingOrder(order.ID)
	if err != nil {
		t.Fatal(err)
	}
	if stored.Status != model.BillingStatusRunning {
		t.Fatalf("status = %s, want running", stored.Status)
	}
	var accounts, entries int64
	if err := db.Model(&model.CreditAccount{}).Count(&accounts).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&model.CreditLedgerEntry{}).Count(&entries).Error; err != nil {
		t.Fatal(err)
	}
	if accounts != 0 || entries != 0 {
		t.Fatalf("New API running mirror moved local funds: accounts=%d entries=%d", accounts, entries)
	}
	if err := repo.MarkBillingRunning(order.ID, order.TaskID, 1); err != nil {
		t.Fatalf("idempotent running retry: %v", err)
	}
}

func TestMarkBillingRunningKeepsLegacyLocalStateMachine(t *testing.T) {
	repo, db := newWorkbenchBillingStateRepository(t)
	db = db.Session(&gorm.Session{SkipHooks: true})
	task := model.Task{ID: "local-task", UserID: "local-user", Type: "canvas_image", Status: model.TaskStatusRunning}
	order := model.BillingOrder{
		ID: "local-order", UserID: task.UserID, TaskID: task.ID, IdempotencyKey: "local:fixture",
		BillingMode: "fixed_request", Status: model.BillingStatusReserved,
	}
	for _, value := range []any{&task, &order} {
		if err := db.Create(value).Error; err != nil {
			t.Fatal(err)
		}
	}

	if err := repo.MarkBillingRunning(order.ID, task.ID, 0); err != nil {
		t.Fatal(err)
	}
	stored, err := repo.BillingOrder(order.ID)
	if err != nil {
		t.Fatal(err)
	}
	if stored.Status != model.BillingStatusRunning {
		t.Fatalf("local status = %s, want running", stored.Status)
	}
}

func TestMarkBillingRunningRejectsReservedNewAPIReceipt(t *testing.T) {
	repo, db := newWorkbenchBillingStateRepository(t)
	order := seedNewAPIReceiptOrder(t, db, "reserved-newapi-task", "reserved-newapi-order", "1", model.BillingStatusReserved)

	if err := repo.MarkBillingRunning(order.ID, order.TaskID, 1); !errors.Is(err, ErrBillingStateConflict) {
		t.Fatalf("reserved New API transition error = %v", err)
	}
	stored, err := repo.BillingOrder(order.ID)
	if err != nil {
		t.Fatal(err)
	}
	if stored.Status != model.BillingStatusReserved {
		t.Fatalf("reserved New API status = %s, want unchanged", stored.Status)
	}
}

func TestMarkBillingRunningRejectsTerminalAndMismatchedNewAPIReceipts(t *testing.T) {
	for _, status := range []model.BillingStatus{
		model.BillingStatusSettled,
		model.BillingStatusRefunded,
		model.BillingStatusUncertain,
	} {
		t.Run(string(status), func(t *testing.T) {
			repo, db := newWorkbenchBillingStateRepository(t)
			order := seedNewAPIReceiptOrder(t, db, "task-"+string(status), "order-"+string(status), "1", status)
			if err := repo.MarkBillingRunning(order.ID, order.TaskID, 1); !errors.Is(err, ErrBillingStateConflict) {
				t.Fatalf("terminal transition error = %v", err)
			}
		})
	}

	for _, mutate := range []func(*model.BillingOrder){
		func(order *model.BillingOrder) { order.BillingSource = "" },
		func(order *model.BillingOrder) { order.UserID = "local-user" },
		func(order *model.BillingOrder) { order.IdempotencyKey = "newapi:other:1:fixture" },
		func(order *model.BillingOrder) { order.IdempotencyKey = "newapi:" + order.TaskID + ":2:fixture" },
	} {
		repo, db := newWorkbenchBillingStateRepository(t)
		order := seedNewAPIReceiptOrder(t, db, "mismatch-task", "mismatch-order", "1", model.BillingStatusPendingReceipt)
		mutate(&order)
		if err := db.Model(&model.BillingOrder{}).Where("id = ?", order.ID).Updates(map[string]any{
			"billing_source": order.BillingSource, "user_id": order.UserID, "idempotency_key": order.IdempotencyKey,
		}).Error; err != nil {
			t.Fatal(err)
		}
		if err := repo.MarkBillingRunning(order.ID, order.TaskID, 1); !errors.Is(err, ErrNewAPIBillingIdentityMismatch) {
			t.Fatalf("identity mismatch error = %v", err)
		}
	}
}

func TestMarkBillingRunningConcurrentWorkersRemainIdempotent(t *testing.T) {
	repo, db := newWorkbenchBillingStateRepository(t)
	order := seedNewAPIReceiptOrder(t, db, "concurrent-task", "concurrent-order", "1", model.BillingStatusPendingReceipt)
	start := make(chan struct{})
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			errs <- repo.MarkBillingRunning(order.ID, order.TaskID, 1)
		}()
	}
	close(start)
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil && !errors.Is(err, ErrBillingStateConflict) {
			t.Fatalf("concurrent transition failed unsafely: %v", err)
		}
	}
	stored, err := repo.BillingOrder(order.ID)
	if err != nil {
		t.Fatal(err)
	}
	if stored.Status != model.BillingStatusRunning {
		t.Fatalf("final status = %s, want running", stored.Status)
	}
}

func TestMarkBillingUncertainAllowsOnlyOpenNewAPIReceipts(t *testing.T) {
	repo, db := newWorkbenchBillingStateRepository(t)
	order := seedNewAPIReceiptOrder(t, db, "uncertain-task", "uncertain-order", "1", model.BillingStatusPendingReceipt)
	if err := repo.MarkBillingUncertain(order.ID, "提交状态未知"); err != nil {
		t.Fatal(err)
	}
	stored, err := repo.BillingOrder(order.ID)
	if err != nil {
		t.Fatal(err)
	}
	if stored.Status != model.BillingStatusUncertain {
		t.Fatalf("status = %s, want uncertain", stored.Status)
	}
	settled := seedNewAPIReceiptOrder(t, db, "settled-task", "settled-order", "1", model.BillingStatusSettled)
	if err := repo.MarkBillingUncertain(settled.ID, "不能倒退"); !errors.Is(err, ErrBillingStateConflict) {
		t.Fatalf("settled regression error = %v", err)
	}
	var accounts, entries int64
	if err := db.Model(&model.CreditAccount{}).Count(&accounts).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&model.CreditLedgerEntry{}).Count(&entries).Error; err != nil {
		t.Fatal(err)
	}
	if accounts != 0 || entries != 0 {
		t.Fatalf("uncertain mirror moved local funds: accounts=%d entries=%d", accounts, entries)
	}
}

func TestResolveUnsentNewAPIReceiptOnlyRefundsWithoutSubmissionEvidence(t *testing.T) {
	repo, db := newWorkbenchBillingStateRepository(t)
	order := seedNewAPIReceiptOrder(t, db, "unsent-task", "unsent-order", "1", model.BillingStatusPendingReceipt)
	if err := db.Create(&model.RouteAttempt{
		ID: "unsent-attempt", TaskID: order.TaskID, RouteRun: 1, DispatchState: "not_sent", Status: "selected",
	}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.ApiCallLog{
		ID: "request-not-sent", TaskID: order.TaskID, BillingOrderID: order.ID,
		Status: model.ApiCallStatusFailed, ErrorCode: "request_not_sent", Billable: true,
	}).Error; err != nil {
		t.Fatal(err)
	}
	// Historical evidence from another attempt or another receipt must not make
	// this attempt look submitted.
	if err := db.Create(&model.RouteAttempt{
		ID: "other-attempt", TaskID: order.TaskID, RouteRun: 2,
		DispatchState: "submission_unknown", Status: "selected",
	}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.ApiCallLog{
		ID: "other-order-success", TaskID: order.TaskID, BillingOrderID: "other-order",
		Status: model.ApiCallStatusSucceeded, Billable: true,
	}).Error; err != nil {
		t.Fatal(err)
	}

	if err := repo.ResolveWorkbenchBillingNotSent(order.ID, order.TaskID, "请求未发出"); err != nil {
		t.Fatal(err)
	}
	stored, err := repo.BillingOrder(order.ID)
	if err != nil {
		t.Fatal(err)
	}
	if stored.Status != model.BillingStatusRefunded || stored.ActualAmountMicrocredits != 0 || stored.ReservedAmountMicrocredits != 0 {
		t.Fatalf("unsent receipt mirror = %#v", stored)
	}
	if err := repo.ResolveWorkbenchBillingNotSent(order.ID, order.TaskID, "重复清理"); err != nil {
		t.Fatalf("idempotent repeated cleanup: %v", err)
	}
	var accounts, entries int64
	if err := db.Model(&model.CreditAccount{}).Count(&accounts).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&model.CreditLedgerEntry{}).Count(&entries).Error; err != nil {
		t.Fatal(err)
	}
	if accounts != 0 || entries != 0 {
		t.Fatalf("unsent cleanup moved local funds: accounts=%d entries=%d", accounts, entries)
	}
}

func TestResolveUnsentNewAPIReceiptMarksAmbiguousSubmissionsUncertain(t *testing.T) {
	for _, scenario := range []string{"submission_unknown", "route_receipt", "http_failure", "successful_call"} {
		t.Run(scenario, func(t *testing.T) {
			repo, db := newWorkbenchBillingStateRepository(t)
			order := seedNewAPIReceiptOrder(t, db, "unknown-"+scenario, "order-"+scenario, "1", model.BillingStatusPendingReceipt)
			if scenario == "submission_unknown" {
				if err := db.Create(&model.RouteAttempt{
					ID: "unknown-attempt", TaskID: order.TaskID, RouteRun: 1, DispatchState: "submission_unknown", Status: "selected",
				}).Error; err != nil {
					t.Fatal(err)
				}
			} else if scenario == "route_receipt" {
				if err := db.Create(&model.RouteAttempt{
					ID: "route-receipt-attempt", TaskID: order.TaskID, RouteRun: 1, DispatchState: "not_sent",
					ProviderRequestID: "provider-accepted", Status: "selected",
				}).Error; err != nil {
					t.Fatal(err)
				}
			} else if scenario == "http_failure" {
				if err := db.Create(&model.ApiCallLog{
					ID: "failed-provider-call", TaskID: order.TaskID, BillingOrderID: order.ID,
					Status: model.ApiCallStatusFailed, StatusCode: http.StatusBadGateway, Billable: true,
				}).Error; err != nil {
					t.Fatal(err)
				}
			} else {
				if err := db.Create(&model.ApiCallLog{
					ID: "successful-call", TaskID: order.TaskID, BillingOrderID: order.ID,
					Status: model.ApiCallStatusSucceeded, Billable: true,
				}).Error; err != nil {
					t.Fatal(err)
				}
			}
			err := repo.ResolveWorkbenchBillingNotSent(order.ID, order.TaskID, "请求状态不明确")
			if !errors.Is(err, ErrNewAPIBillingSubmissionUncertain) {
				t.Fatalf("ambiguity error = %v", err)
			}
			stored, readErr := repo.BillingOrder(order.ID)
			if readErr != nil {
				t.Fatal(readErr)
			}
			if stored.Status != model.BillingStatusUncertain {
				t.Fatalf("ambiguous status = %s, want uncertain", stored.Status)
			}
		})
	}
}

func TestSyncWorkbenchBillingMirrorsAmountsAndRejectsStateRegression(t *testing.T) {
	repo, db := newWorkbenchBillingStateRepository(t)
	order := seedNewAPIReceiptOrder(t, db, "sync-task", "sync-order", "1", model.BillingStatusPendingReceipt)
	if err := repo.SyncWorkbenchBilling(order.ID, model.BillingStatusUncertain, 0, 250_000, "provider-task"); err != nil {
		t.Fatal(err)
	}
	stored, err := repo.BillingOrder(order.ID)
	if err != nil {
		t.Fatal(err)
	}
	if stored.Status != model.BillingStatusUncertain || stored.ReservedAmountMicrocredits != 250_000 || stored.ProviderRequestID != "provider-task" {
		t.Fatalf("uncertain mirror = %#v", stored)
	}
	if err := repo.SyncWorkbenchBilling(order.ID, model.BillingStatusSettled, 180_000, 0, "provider-task"); err != nil {
		t.Fatal(err)
	}
	if err := repo.SyncWorkbenchBilling(order.ID, model.BillingStatusRefunded, 0, 0, "provider-task"); !errors.Is(err, ErrBillingStateConflict) {
		t.Fatalf("settled regression error = %v", err)
	}
	stored, err = repo.BillingOrder(order.ID)
	if err != nil {
		t.Fatal(err)
	}
	if stored.Status != model.BillingStatusSettled || stored.ActualAmountMicrocredits != 180_000 {
		t.Fatalf("settled mirror regressed: %#v", stored)
	}
	if err := repo.SyncWorkbenchBilling(order.ID, model.BillingStatusSettled, 180_000, 0, "provider-task"); err != nil {
		t.Fatalf("idempotent reconciliation: %v", err)
	}
}

func TestTerminalWorkbenchBillingOrdersIncludesOpenAndTerminalTasks(t *testing.T) {
	repo, db := newWorkbenchBillingStateRepository(t)
	pending := seedNewAPIReceiptOrder(t, db, "pending-task", "pending-order", "1", model.BillingStatusPendingReceipt)
	running := seedNewAPIReceiptOrder(t, db, "running-task", "running-order", "1", model.BillingStatusRunning)
	terminal := seedNewAPIReceiptOrder(t, db, "terminal-task", "terminal-order", "1", model.BillingStatusUncertain)
	if err := db.Model(&model.Task{}).Where("id = ?", terminal.TaskID).Update("status", model.TaskStatusFailed).Error; err != nil {
		t.Fatal(err)
	}
	orders, err := repo.TerminalWorkbenchBillingOrders(10)
	if err != nil {
		t.Fatal(err)
	}
	ids := map[string]bool{}
	for _, order := range orders {
		ids[order.ID] = true
	}
	for _, id := range []string{pending.ID, running.ID, terminal.ID} {
		if !ids[id] {
			t.Fatalf("reconciliation omitted %s: %#v", id, ids)
		}
	}
}
