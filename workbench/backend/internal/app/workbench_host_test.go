package app

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"yingce/backend/internal/model"
)

type testWorkbenchHost struct {
	actor  WorkbenchHostUser
	models []WorkbenchHostModel
	groups []WorkbenchHostGroup
	bill   WorkbenchHostBilling
	calls  int
}

func (h *testWorkbenchHost) User(context.Context, string) (WorkbenchHostUser, error) {
	return h.actor, nil
}
func (h *testWorkbenchHost) Models(context.Context, string) ([]WorkbenchHostModel, error) {
	return h.models, nil
}
func (h *testWorkbenchHost) Groups(context.Context, string) ([]WorkbenchHostGroup, error) {
	return h.groups, nil
}
func (h *testWorkbenchHost) Balance(context.Context, string) (int64, error) { return 8_000_000, nil }
func (h *testWorkbenchHost) Billing(context.Context, string, string, int) (WorkbenchHostBilling, error) {
	return h.bill, nil
}
func (h *testWorkbenchHost) Relay(context.Context, WorkbenchRelay) (*http.Response, error) {
	h.calls++
	return nil, errors.New("this test must not infer")
}

func TestWorkbenchIdentityRequiresTrustedContextAndLiveOwner(t *testing.T) {
	svc, _ := newChannelModelTestService(t)
	host := &testWorkbenchHost{actor: WorkbenchHostUser{ID: "42", DisplayName: "Owner", Admin: true}}
	if err := svc.ConfigureWorkbenchHost(host); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.WorkbenchCurrentUser(context.Background()); err == nil {
		t.Fatal("untrusted request authenticated")
	}
	ctx := WithWorkbenchIdentity(context.Background(), "42")
	user, err := svc.WorkbenchCurrentUser(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if user.ID != "newapi:42" || user.Role != model.UserRoleAdmin {
		t.Fatal("incorrect host identity projection", user)
	}
	host.actor.Admin = false
	user, err = svc.WorkbenchCurrentUser(ctx)
	if err != nil || user.Role != model.UserRoleUser {
		t.Fatal("role revocation was not applied", err)
	}
	host.actor.ID = "43"
	if _, err = svc.WorkbenchCurrentUser(ctx); err == nil {
		t.Fatal("foreign account projection accepted")
	}
	for _, id := range []string{"", "../42", "42/other", "42\n"} {
		if _, err = svc.WorkbenchCurrentUser(WithWorkbenchIdentity(context.Background(), id)); err == nil {
			t.Fatalf("invalid identity %q accepted", id)
		}
	}
}

func TestWorkbenchCatalogAdmissionRechecksHostPermissions(t *testing.T) {
	svc, db := newChannelModelTestService(t)
	host := &testWorkbenchHost{actor: WorkbenchHostUser{ID: "42"}, models: []WorkbenchHostModel{{Key: "t123", Name: "Qwen", Capability: "text", Protocol: "chat-completion"}}}
	if err := svc.ConfigureWorkbenchHost(host); err != nil {
		t.Fatal(err)
	}
	if err := svc.requireWorkbenchModel(context.Background(), "newapi:42", "newapi-text", "t123"); err != nil {
		t.Fatal(err)
	}
	var channel model.ModelChannel
	if err := db.First(&channel, "id = ?", "newapi-text").Error; err != nil {
		t.Fatal(err)
	}
	if channel.APIKey != "" || channel.SecretKey != "" {
		t.Fatal("host catalog created credentials")
	}
	host.models = nil
	if err := svc.requireWorkbenchModel(context.Background(), "newapi:42", "newapi-text", "t123"); err == nil {
		t.Fatal("stale native projection bypassed live model permissions")
	}
	if host.calls != 0 {
		t.Fatal("catalog checks invoked inference")
	}
}

func TestWorkbenchCatalogShowsSelectableGroupsAndRemovesRevokedModels(t *testing.T) {
	svc, db := newChannelModelTestService(t)
	if err := db.AutoMigrate(&model.SystemSetting{}); err != nil {
		t.Fatal(err)
	}
	host := &testWorkbenchHost{actor: WorkbenchHostUser{ID: "42"}, models: []WorkbenchHostModel{
		{Key: "t-default", Name: "Qwen", Group: "default", Capability: "text", Protocol: "chat-completion"},
		{Key: "t-vip", Name: "Qwen", Group: "vip", Capability: "text", Protocol: "chat-completion"},
	}}
	host.groups = []WorkbenchHostGroup{{ID: "default", Label: "default"}, {ID: "vip", Label: "vip"}, {ID: "sd2", Label: "sd2"}}
	if err := svc.ConfigureWorkbenchHost(host); err != nil {
		t.Fatal(err)
	}
	user, err := svc.WorkbenchCurrentUser(WithWorkbenchIdentity(context.Background(), "42"))
	if err != nil {
		t.Fatal(err)
	}
	catalog, err := svc.ModelCatalogForUser(user, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(catalog.Channels) != 1 || len(catalog.Channels[0].Models) != 2 {
		t.Fatalf("missing grouped models: %#v", catalog)
	}
	labels := map[string]bool{}
	for _, item := range catalog.Channels[0].Models {
		labels[item.ChannelLabel] = true
		if item.NewAPIGroup == "" {
			t.Fatal("host group identity is missing from model DTO")
		}
	}
	if len(catalog.NewAPIGroups) != 3 || catalog.NewAPIGroups[2].ID != "sd2" {
		t.Fatal("selectable group without matching models was dropped", catalog.NewAPIGroups)
	}
	if !labels["New API · default"] || !labels["New API · vip"] {
		t.Fatal("group labels lost", labels)
	}
	host.models = host.models[:1]
	if err := svc.requireWorkbenchModel(context.Background(), user.ID, "newapi-text", "t-vip"); err == nil {
		t.Fatal("revoked group remained callable")
	}
}

func TestWorkbenchPrivateRelayRejectsMissingForeignExpiredAndCancelledTasks(t *testing.T) {
	svc, db := newChannelModelTestService(t)
	host := &testWorkbenchHost{}
	if err := svc.ConfigureWorkbenchHost(host); err != nil {
		t.Fatal(err)
	}
	request, _ := http.NewRequest(http.MethodPost, "http://newapi.workbench.invalid/v1/chat/completions", io.NopCloser(strings.NewReader("{}")))
	if _, err := svc.relayWorkbench(request); err == nil {
		t.Fatal("missing task context accepted")
	}
	expired := time.Now().Add(-time.Minute)
	task := model.Task{ID: "owned-host-task", UserID: "newapi:42", Status: model.TaskStatusRunning, LeaseOwner: "worker", LeaseExpiresAt: &expired}
	if err := db.Create(&task).Error; err != nil {
		t.Fatal(err)
	}
	if err := svc.ValidateWorkbenchTask("42", task.ID); err == nil {
		t.Fatal("expired execution accepted")
	}
	until := time.Now().Add(time.Minute)
	if err := db.Model(&task).Updates(map[string]any{"lease_expires_at": until}).Error; err != nil {
		t.Fatal(err)
	}
	if err := svc.ValidateWorkbenchTask("43", task.ID); err == nil {
		t.Fatal("foreign execution accepted")
	}
	if err := svc.ValidateWorkbenchTask("42", task.ID); err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&task).Update("status", model.TaskStatusCancelled).Error; err != nil {
		t.Fatal(err)
	}
	if err := svc.ValidateWorkbenchTask("42", task.ID); err == nil {
		t.Fatal("cancelled execution accepted")
	}
	if host.calls != 0 {
		t.Fatal("untrusted request reached inference")
	}
}

func TestWorkbenchRecoveryLeaseAllowsOnlyReadingItsExistingReceipt(t *testing.T) {
	svc, db := newChannelModelTestService(t)
	until := time.Now().Add(time.Minute)
	task := model.Task{ID: "recover-host-task", UserID: "newapi:42", Status: model.TaskStatusFailed, ProviderRequestID: "original-receipt", LeaseOwner: "manual-recovery:owner", LeaseExpiresAt: &until}
	if err := db.Create(&task).Error; err != nil {
		t.Fatal(err)
	}
	if err := svc.ValidateWorkbenchTaskRead("42", task.ID); err != nil {
		t.Fatal("owned recovery cannot read its original receipt", err)
	}
	if svc.ValidateWorkbenchTask("42", task.ID) == nil || svc.ValidateWorkbenchTaskRead("43", task.ID) == nil {
		t.Fatal("recovery permitted generation or a foreign user")
	}
	for _, changes := range []map[string]any{
		{"provider_request_id": ""},
		{"lease_owner": "worker"},
		{"lease_expires_at": time.Now().Add(-time.Second)},
		{"status": model.TaskStatusCancelled},
	} {
		if err := db.Model(&task).Updates(changes).Error; err != nil {
			t.Fatal(err)
		}
		if svc.ValidateWorkbenchTaskRead("42", task.ID) == nil {
			t.Fatal("recovery accepted a missing receipt, wrong lease, expiry or cancellation")
		}
		if err := db.Model(&task).Updates(map[string]any{"provider_request_id": "original-receipt", "lease_owner": "manual-recovery:owner", "lease_expires_at": until, "status": model.TaskStatusFailed}).Error; err != nil {
			t.Fatal(err)
		}
	}
}
