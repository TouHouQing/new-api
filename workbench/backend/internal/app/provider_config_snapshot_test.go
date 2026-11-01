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
)

// Fixtures model the order at submission: freeze, mark sent, then save receipt.
func freezeTestProviderAttempt(t *testing.T, s *Service, task *model.Task) *model.RouteAttempt {
	t.Helper()
	attempt := &model.RouteAttempt{ID: newID(), TaskID: task.ID, RouteRun: task.RouteRun, AttemptNumber: 1, Status: "selected", DispatchState: "not_sent", StartedAt: time.Now()}
	if err := s.repo.CreateRouteAttempt(attempt); err != nil {
		t.Fatal(err)
	}
	if err := s.markRouteAttemptDispatching(attempt); err != nil {
		t.Fatal(err)
	}
	attempt.ProviderRequestID = task.ProviderRequestID
	if attempt.ProviderRequestID != "" {
		attempt.DispatchState = "accepted"
	}
	if err := s.repo.SaveRouteAttempt(attempt); err != nil {
		t.Fatal(err)
	}
	return attempt
}

func TestProviderConfigSnapshotKeepsCredentialsModelAndCapabilitiesAfterChannelChanges(t *testing.T) {
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	s, db := newChannelModelTestService(t)
	var originalCalls, replacementCalls atomic.Int32
	original := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		originalCalls.Add(1)
		if r.Header.Get("Authorization") != "Bearer original-private-key" {
			t.Error("original credentials not used")
		}
		if r.Header.Get("X-Provider-Route") != "original" {
			t.Error("original headers not used")
		}
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body["model"] != "original-model" {
			t.Error("upstream model changed")
		}
		fmt.Fprint(w, `{"choices":[{"message":{"content":"original result"}}]}`)
	}))
	defer original.Close()
	replacement := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		replacementCalls.Add(1)
		http.Error(w, "wrong service", 500)
	}))
	defer replacement.Close()
	channel := model.ModelChannel{ID: "snapshot-channel", Scope: model.ChannelScopeSystem, Enabled: true, BaseURL: original.URL, APIKey: "original-private-key", HeadersJSON: `[{"name":"X-Provider-Route","value":"original"}]`}
	item := model.ChannelModel{ID: "snapshot-model", ChannelID: channel.ID, ModelKey: "public-model", ProviderModelKey: "original-model", Capability: "text", Protocol: model.ChannelInterfaceChatCompletion, Enabled: true, CapabilityConfigJSON: `{"version":1,"text":{"contextWindowTokens":32768,"maxOutputTokens":2048,"streaming":false,"references":{"promptMaxChars":30000}}}`}
	input := canvasGenerationInput{Mode: "text", Prompt: "test", Config: providerConfig{ChannelID: channel.ID, Model: item.ModelKey}}
	raw, _ := json.Marshal(input)
	task := model.Task{ID: "snapshot-task", UserID: "owner", Type: "canvas_text", RouteRun: 1, InputJSON: string(raw), Status: model.TaskStatusRunning}
	for _, row := range []any{&channel, &item, &task} {
		if err := db.Create(row).Error; err != nil {
			t.Fatal(err)
		}
	}
	attempt := freezeTestProviderAttempt(t, s, &task)
	if !strings.HasPrefix(attempt.ProviderConfigCipher, encryptedSettingPrefix) || strings.Contains(attempt.ProviderConfigCipher, "original-private-key") {
		t.Fatal("snapshot credentials are not encrypted")
	}
	if err := db.Model(&channel).Updates(map[string]any{"base_url": replacement.URL, "api_key": "replacement-private-key", "enabled": false}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&item).Updates(map[string]any{"provider_model_key": "replacement-model", "enabled": false, "capability_config_json": `{"version":1,"text":{"contextWindowTokens":8192,"maxOutputTokens":128}}`}).Error; err != nil {
		t.Fatal(err)
	}
	ctx := withTaskExecutionID(withProviderSubmissionKey(context.Background(), attempt), task.ID)
	config, err := s.resolveTaskProviderConfig(ctx, input.Config)
	if err != nil {
		t.Fatal(err)
	}
	if config.CapabilityConfig.Text.ContextWindowTokens != 32768 || config.CapabilityConfig.Text.MaxOutputTokens != 2048 {
		t.Fatal("capabilities changed during execution")
	}
	if err := postJSON(ctx, config, "/chat/completions", map[string]any{"model": config.Model}, &map[string]any{}); err != nil {
		t.Fatal(err)
	}
	if originalCalls.Load() != 1 || replacementCalls.Load() != 0 {
		t.Fatal("request was redirected to mutable channel")
	}
	encoded, _ := json.Marshal(attempt)
	if strings.Contains(string(encoded), "providerConfig") || strings.Contains(string(encoded), "enc:v1:") || strings.Contains(string(encoded), "private-key") {
		t.Fatal("API leaked execution secrets")
	}
	// Trust restoration must not override the CURRENT outbound address policy.
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "")
	if err := postJSON(ctx, config, "/chat/completions", map[string]any{}, &map[string]any{}); err == nil {
		t.Fatal("frozen config bypassed outbound policy")
	}
	if originalCalls.Load() != 1 {
		t.Fatal("blocked destination received another request")
	}
}

func TestProviderConfigSnapshotRejectsReboundCorruptAndPlaintextEnvelopes(t *testing.T) {
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	s, db := newChannelModelTestService(t)
	task := model.Task{ID: "bound-task", UserID: "owner", Type: "canvas_text", RouteRun: 2, InputJSON: `{"mode":"text","prompt":"test","config":{"baseUrl":"http://127.0.0.1:8001","model":"test","apiKey":"private","interfaceType":"chat-completion"}}`}
	if err := db.Create(&task).Error; err != nil {
		t.Fatal(err)
	}
	attempt := freezeTestProviderAttempt(t, s, &task)
	for _, field := range []string{"owner", "task", "attempt", "run", "cipher", "plaintext", "protocol"} {
		t.Run(field, func(t *testing.T) {
			otherTask, otherAttempt := task, *attempt
			switch field {
			case "owner":
				otherTask.UserID = "other"
			case "task":
				otherTask.ID = "other"
			case "attempt":
				otherAttempt.ID = "other"
			case "run":
				otherTask.RouteRun++
			case "cipher":
				otherAttempt.ProviderConfigCipher += "!"
			case "plaintext":
				otherAttempt.ProviderConfigCipher = `{"version":1}`
			case "protocol":
				snapshot, err := s.decodeProviderConfigSnapshot(&task, attempt)
				if err != nil {
					t.Fatal(err)
				}
				snapshot.ProtocolVersion = "different-version"
				raw, _ := json.Marshal(snapshot)
				otherAttempt.ProviderConfigCipher, err = s.encryptSettingSecret(string(raw))
				if err != nil {
					t.Fatal(err)
				}
			}
			if _, err := s.decodeProviderConfigSnapshot(&otherTask, &otherAttempt); err == nil {
				t.Fatal("rebound or invalid snapshot accepted")
			}
		})
	}
}

func TestProviderConfigSnapshotRecoversLocalReceiptWithoutAnotherSubmission(t *testing.T) {
	for _, agent := range []bool{false, true} {
		for _, missing := range []bool{false, true} {
			t.Run(fmt.Sprintf("agent=%t/missing=%t", agent, missing), func(t *testing.T) {
				t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
				s, db := legacyImportService(t)
				var posts, reads atomic.Int32
				server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					if r.Method != http.MethodGet {
						posts.Add(1)
						t.Error("recovery repeated inference")
						http.Error(w, "POST forbidden", 500)
						return
					}
					reads.Add(1)
					if !strings.HasPrefix(r.URL.Path, "/api/receipts/") {
						t.Error("not original receipt lookup")
					}
					if missing {
						http.Error(w, "missing receipt", 404)
						return
					}
					if agent {
						fmt.Fprint(w, `{"result":{"message":{"content":"saved agent result"},"usage":{"total_tokens":12}}}`)
					} else {
						fmt.Fprint(w, `{"result":{"content":"saved text result","usage":{"total_tokens":12}}}`)
					}
				}))
				defer server.Close()
				channel := model.ModelChannel{ID: "local-snapshot", Scope: model.ChannelScopeSystem, Enabled: true, BaseURL: server.URL}
				item := model.ChannelModel{ID: "local-snapshot-model", ChannelID: channel.ID, ModelKey: "qwen3.5:9b", Capability: "text", Protocol: protocol.LocalText, Enabled: true}
				profile, _ := json.Marshal(DefaultModelCapabilityConfigForModel(protocol.LocalText, item.ModelKey))
				item.CapabilityConfigJSON = string(profile)
				input := canvasGenerationInput{Mode: "text", Prompt: "test", Config: providerConfig{ChannelID: channel.ID, Model: item.ModelKey}}
				if agent {
					input.AgentRequests = &agentToolRequests{ChatCompletion: map[string]any{"messages": []any{map[string]any{"role": "user", "content": "test"}}}}
				}
				raw, _ := json.Marshal(input)
				task := model.Task{ID: "receipt-snapshot-task", UserID: "owner", Type: "canvas_text", RouteRun: 1, InputJSON: string(raw), Status: model.TaskStatusRunning}
				for _, row := range []any{&channel, &item, &task} {
					if err := db.Create(row).Error; err != nil {
						t.Fatal(err)
					}
				}
				freezeTestProviderAttempt(t, s, &task)
				if err := db.Delete(&item).Error; err != nil {
					t.Fatal(err)
				}
				if err := db.Delete(&channel).Error; err != nil {
					t.Fatal(err)
				}
				attempt, err := s.beginTaskRouteAttempt(&task)
				if err != nil || !attempt.ReceiptOnlyRecovery {
					t.Fatal("original receipt cannot resume", err)
				}
				result, _, err := s.processTask(withProviderSubmissionKey(context.Background(), attempt), task)
				if missing {
					if err == nil || !isRouteDispatchUncertain(err) || safeRouteRejection(err) {
						t.Fatal("missing receipt was treated as safe to regenerate", err)
					}
				} else if err != nil || result == nil {
					t.Fatal("saved result unavailable", err)
				}
				if posts.Load() != 0 || reads.Load() != 1 {
					t.Fatal("recovery didn't use exactly one read", posts.Load(), reads.Load())
				}
			})
		}
	}
}

func TestProviderConfigSnapshotBlocksLegacyManagedRecovery(t *testing.T) {
	s, db := newChannelModelTestService(t)
	task := model.Task{ID: "legacy-managed", Type: "canvas_video", UserID: "owner", ProviderRequestID: "old-service-receipt", InputJSON: `{"mode":"video","config":{"channelId":"live-channel","model":"model"}}`}
	if err := db.Create(&task).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := s.providerCancellationInput(&task); !isRouteDispatchUncertain(err) {
		t.Fatal("legacy receipt can be sent to a new channel", err)
	}
}

func TestProviderConfigSnapshotMediaDownloadResumesOriginalCredentialsAndProxy(t *testing.T) {
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	s, db := newMediaRecoveryTestService(t)
	picture := mediaTestPNG(t)
	var originalCalls, replacementCalls atomic.Int32
	original := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.Header.Get("Authorization") != "Bearer old-media-key" {
			t.Error("wrong recovery request or credential")
		}
		if originalCalls.Add(1) == 1 {
			http.Error(w, "retry download", 503)
			return
		}
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(picture)
	}))
	defer original.Close()
	replacement := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		replacementCalls.Add(1)
		http.Error(w, "wrong target", 500)
	}))
	defer replacement.Close()
	profile, _ := json.Marshal(DefaultModelCapabilityConfigForModel("chat-completion", "image-model"))
	channel := model.ModelChannel{ID: "download-snapshot", Scope: model.ChannelScopeSystem, Enabled: true, BaseURL: original.URL, APIKey: "old-media-key"}
	item := model.ChannelModel{ID: "download-model", ChannelID: channel.ID, ModelKey: "image-model", Capability: "image", Protocol: model.ChannelInterfaceChatCompletion, Enabled: true, CapabilityConfigJSON: string(profile)}
	for _, row := range []any{&channel, &item} {
		if err := db.Create(row).Error; err != nil {
			t.Fatal(err)
		}
	}
	task := seedMediaTask(t, db, providerConfig{ChannelID: channel.ID, Model: item.ModelKey})
	attempt := freezeTestProviderAttempt(t, s, task)
	ctx := withTaskExecutionID(withProviderSubmissionKey(context.Background(), attempt), task.ID)
	config, err := s.resolveTaskProviderConfig(ctx, providerConfig{})
	if err != nil {
		t.Fatal(err)
	}
	ctx = context.WithValue(withProviderAnalytics(ctx, s, *task), mediaExecutionTaskKey{}, *task)
	_, handled, err := recoverProtocolMedia(ctx, config, "image", []protocol.MediaReference{{URL: original.URL + "/result.png"}})
	if !handled || err == nil {
		t.Fatal("download failure not checkpointed")
	}
	if err := db.Model(&channel).Updates(map[string]any{"base_url": replacement.URL, "api_key": "new-media-key", "proxy_url": "http://127.0.0.1:1", "enabled": false}).Error; err != nil {
		t.Fatal(err)
	}
	saved, err := s.repo.Task(task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if result, err := s.resumeTaskMedia(context.Background(), saved); err != nil || result == nil {
		t.Fatal("original media failed to recover", err)
	}
	if originalCalls.Load() != 2 || replacementCalls.Load() != 0 {
		t.Fatal("download followed edited channel")
	}
}
