package app

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"yingce/backend/internal/model"
	"yingce/backend/internal/protocol"
	"yingce/backend/internal/repository"
)

func TestLocalSubmittedCancellationUsesNativeOwnerChannelCASAndReconciliation(t *testing.T) {
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	var calls atomic.Int64
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "" {
			t.Error("keyless cancellation sent authorization")
		}
		switch {
		case r.Method == "POST" && r.URL.Path == "/api/jobs/510bce55-076a-4c32-a765-f6ff2ebbf803/cancel":
			calls.Add(1)
			fmt.Fprint(w, `{"status":"cancelled"}`)
		case r.Method == "GET" && r.URL.Path == "/api/jobs/510bce55-076a-4c32-a765-f6ff2ebbf803":
			fmt.Fprint(w, `{"status":"cancelled"}`)
		default:
			t.Error("unexpected upstream operation", r.Method, r.URL.Path)
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	svc, db := legacyImportService(t)
	channel := model.ModelChannel{ID: "cancel-local-system", Name: "Local", Scope: model.ChannelScopeSystem, Enabled: true, BaseURL: server.URL, APIFormat: "openai", ModelsJSON: `["local-image"]`}
	item := model.ChannelModel{ID: "cancel-local-model", ChannelID: channel.ID, ModelKey: "local-image", Capability: "image", Protocol: protocol.LocalImage, Enabled: true}
	profile, _ := json.Marshal(DefaultModelCapabilityConfigForModel(protocol.LocalImage, item.ModelKey))
	item.CapabilityConfigJSON = string(profile)
	task := model.Task{ID: "local-cancel-task", UserID: "owner", Type: "canvas_image", Status: model.TaskStatusRunning, Stage: "上游生成中", ProviderRequestID: "510bce55-076a-4c32-a765-f6ff2ebbf803", InputJSON: fmt.Sprintf(`{"mode":"image","config":{"channelId":%q,"model":"local-image","interfaceType":%q}}`, channel.ID, protocol.LocalImage)}
	for _, row := range []any{&channel, &item, &task} {
		if err := db.Create(row).Error; err != nil {
			t.Fatal(err)
		}
	}
	freezeTestProviderAttempt(t, svc, &task)
	if err := db.Model(&channel).Updates(map[string]any{"base_url": "http://127.0.0.1:1", "proxy_url": "http://127.0.0.1:1", "enabled": false}).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := svc.CancelTask(context.Background(), "other", task.ID); err == nil || calls.Load() != 0 {
		t.Fatal("foreign user cancelled a local inference")
	}
	output := taskForOutput(task)
	if !output.CanCancelAfterSubmission || !taskSummaryForOutput(task).CanCancelAfterSubmission || strings.Contains(output.InputJSON, "interfaceType") {
		t.Fatal("missing cancellation display hint or leaked channel configuration")
	}
	cancelled, err := svc.CancelTask(context.Background(), "owner", task.ID)
	if err != nil || cancelled.Status != model.TaskStatusCancelled {
		t.Fatalf("local cancellation rejected: %+v %v", cancelled, err)
	}
	if cancelled.ProviderCancelStatus != model.ProviderCancelStatusRequested {
		t.Fatal("cancel response falsely claimed upstream confirmation")
	}
	deadline := time.Now().Add(3 * time.Second)
	for calls.Load() == 0 && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	if calls.Load() != 1 {
		t.Fatalf("expected one scoped upstream cancellation, got%d", calls.Load())
	}
	latest, err := svc.repo.TaskForUser("owner", task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if latest.ProviderCancelStatus != model.ProviderCancelStatusRequested {
		t.Fatalf("cancellation not awaiting confirmation: %s", latest.ProviderCancelStatus)
	}
	if err := svc.reconcileProviderCancellation(context.Background(), latest); err != nil {
		t.Fatal(err)
	}
	latest, err = svc.repo.TaskForUser("owner", task.ID)
	if err != nil || latest.ProviderCancelStatus != model.ProviderCancelStatusConfirmed {
		t.Fatal("provider cancellation wasn't confirmed", err)
	}
	applied, err := svc.repo.UpdateTaskTerminalState(task.ID, "", model.TaskStatusRunning, model.TaskStatusSucceeded, "late output", "", time.Now())
	if err != nil || applied {
		t.Fatal("late generation resurrected a cancelled native task", err)
	}
	if _, err := svc.CancelTask(context.Background(), "owner", task.ID); err != nil || calls.Load() != 1 {
		t.Fatal("repeated cancellation sent another inference/cancel", err)
	}
}

func TestLocalCancellationIntentAndReceiptSurviveBeforeFirstNetworkRequest(t *testing.T) {
	svc, db := legacyImportService(t)
	task := model.Task{ID: "cancel-before-network", UserID: "owner", Status: model.TaskStatusRunning, Stage: "上游生成中"}
	if err := db.Create(&task).Error; err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	intent := model.TaskCancellationIntent{Source: model.TaskCancellationUserRequest, ActorID: "owner", RequestedAt: now, ProviderRequestID: "durable-receipt"}
	applied, err := svc.repo.CancelTaskIfStatus("owner", task.ID, model.TaskStatusRunning, now, intent)
	if err != nil || !applied {
		t.Fatal("cancel intent did not persist", err)
	}
	// A fresh repository can resume even if the process died before its first
	// upstream POST. The receipt and requested state are one atomic update.
	restarted := repository.New(db)
	loaded, err := restarted.TaskForUser("owner", task.ID)
	if err != nil || loaded.ProviderRequestID != "durable-receipt" || loaded.ProviderCancelStatus != model.ProviderCancelStatusRequested || loaded.ProviderCancelAttempts != 0 || loaded.ProviderCancelNextCheckAt == nil {
		t.Fatal("cancellation recovery data incomplete", err)
	}
	if err := restarted.ClaimTaskProviderCancellation("owner", task.ID, time.Now()); err != nil {
		t.Fatal("first cancellation request cannot resume", err)
	}
	if err := restarted.ClaimTaskProviderCancellation("owner", task.ID, time.Now()); err == nil {
		t.Fatal("duplicate initial network claim allowed")
	}
	conflicting := model.Task{ID: "other-receipt", UserID: "owner", Status: model.TaskStatusRunning, ProviderRequestID: "actual-receipt"}
	if err := db.Create(&conflicting).Error; err != nil {
		t.Fatal(err)
	}
	applied, err = restarted.CancelTaskIfStatus("owner", conflicting.ID, model.TaskStatusRunning, now, intent)
	if err != nil || applied {
		t.Fatal("stale hydrated receipt overwrote actual provider identity", err)
	}
}

func TestLocalCancellationDisplayHintsDoNotGrantForgedChannelAuthority(t *testing.T) {
	svc, db := legacyImportService(t)
	for _, scope := range []string{"no-channel", "forged-private-url"} {
		input := map[string]any{"mode": "video", "config": map[string]any{"channelId": scope, "model": "wan2.2-ti2v-5b", "interfaceType": protocol.LocalVideo, "baseUrl": "http://127.0.0.1:8001"}}
		raw, _ := json.Marshal(input)
		task := model.Task{ID: scope, UserID: "owner", Type: "canvas_video", Status: model.TaskStatusRunning, Stage: "上游生成中", ProviderRequestID: "receipt", InputJSON: string(raw)}
		if err := db.Create(&task).Error; err != nil {
			t.Fatal(err)
		}
		if _, err := svc.CancelTask(context.Background(), "owner", task.ID); err == nil {
			t.Fatal("forged system channel bypassed cancellation authorization")
		}
		latest, _ := svc.repo.TaskForUser("owner", task.ID)
		if latest.Status != model.TaskStatusRunning {
			t.Fatal("failed authorization mutated task")
		}
	}
}

func TestLocalCancellationReconcilesLostPostAndDoesNotRefundMissingReceipt(t *testing.T) {
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	status := "processing"
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			calls++
			fmt.Fprint(w, `{"status":"processing"}`)
			return
		}
		if status == "missing" {
			fmt.Fprint(w, `{"status":"failed","reason":"receipt_missing"}`)
			return
		}
		fmt.Fprintf(w, `{"status":%q}`, status)
	}))
	defer server.Close()
	config := providerConfig{BaseURL: server.URL, InterfaceType: protocol.LocalVideo}
	result, _, err := queryProviderCancellation(context.Background(), config, "510bce55-076a-4c32-a765-f6ff2ebbf803")
	if err != nil || result != providerCancellationPending || calls != 1 {
		t.Fatal("lost POST not safely retried", err)
	}
	status = "missing"
	if _, _, err := queryProviderCancellation(context.Background(), config, "510bce55-076a-4c32-a765-f6ff2ebbf803"); err == nil {
		t.Fatal("missing receipt falsely confirmed a refundable terminal state")
	}
	if calls != 1 {
		t.Fatal("missing receipt triggered another upstream mutation")
	}
}
