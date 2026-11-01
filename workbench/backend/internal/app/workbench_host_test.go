package app

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"yingce/backend/internal/assets"
	"yingce/backend/internal/model"
	"yingce/backend/internal/platform"
	"yingce/backend/internal/protocol"
)

type testWorkbenchHost struct {
	actor  WorkbenchHostUser
	models []WorkbenchHostModel
	groups []WorkbenchHostGroup
	bill   WorkbenchHostBilling
	calls  int
}

type workbenchVideoTestHost struct {
	testWorkbenchHost
	relay func(WorkbenchRelay) (*http.Response, error)
}

func (h *workbenchVideoTestHost) Relay(_ context.Context, call WorkbenchRelay) (*http.Response, error) {
	return h.relay(call)
}

type workbenchResourceTestHost struct{ testWorkbenchHost }

func (h *workbenchResourceTestHost) PublicBaseURL() string { return "https://host.example" }

func TestWorkbenchLocalReferencesUseFilesOrHostSignedURLsWithoutCanvasPublicSetting(t *testing.T) {
	t.Setenv("CANVAS_PUBLIC_BASE_URL", "")
	svc := newResourceTestService(t)
	host := &workbenchResourceTestHost{testWorkbenchHost{actor: WorkbenchHostUser{ID: "42"}}}
	require.NoError(t, svc.ConfigureWorkbenchHost(host))
	_, pixels, err := decodeProviderDataURL(testGeminiReferenceImageDataURL)
	require.NoError(t, err)
	resource, _, err := svc.storeResource("newapi:42", "image", "reference.png", "image/png", int64(len(pixels)), 1, 1, 0, strings.NewReader(string(pixels)), nil, false)
	require.NoError(t, err)
	input := canvasGenerationInput{Mode: "video", Config: providerConfig{ChannelID: "newapi-video", InterfaceType: "newapi", BaseURL: "http://newapi.workbench.invalid/v1"}, ReferenceImages: []providerMedia{{StorageKey: "resource:" + resource.ID}}}
	ctx := context.WithValue(context.Background(), providerAnalyticsKey{}, providerAnalyticsContext{Service: svc})
	require.NoError(t, svc.hydrateGenerationMedia("newapi:42", &input, providerMediaHydrationPolicyFor(ctx, input)))
	assert.Empty(t, input.ReferenceImages[0].URL)
	assert.NotEmpty(t, input.ReferenceImages[0].DataURL, "one image uses its owned file without a public URL")
	external := input
	external.ReferenceImages = []providerMedia{{URL: "https://media.example/public.png"}}
	require.NoError(t, svc.hydrateGenerationMedia("newapi:42", &external, providerMediaHydrationPolicyFor(ctx, external)))
	assert.Equal(t, "https://media.example/public.png", external.ReferenceImages[0].URL, "explicit public image URLs remain supported")
	input.ReferenceImages = []providerMedia{{StorageKey: "resource:" + resource.ID}, {StorageKey: "resource:" + resource.ID}}
	require.NoError(t, svc.hydrateGenerationMedia("newapi:42", &input, providerMediaHydrationPolicyFor(ctx, input)))
	for _, media := range input.ReferenceImages {
		u, err := url.Parse(media.URL)
		require.NoError(t, err)
		assert.Equal(t, "host.example", u.Host)
		assert.NotEmpty(t, u.Query().Get("signature"))
		options := ResourceAccessOptions{Variant: assets.ResourceVariant(u.Query().Get("variant"))}
		delivery, err := svc.PreparePublicResourceDelivery(resource.ID, u.Query().Get("expires"), u.Query().Get("signature"), options, "")
		require.NoError(t, err, "the signed link must work without a login cookie")
		require.NotNil(t, delivery.Stream)
		_ = delivery.Stream.Body.Close()
		_, err = svc.PreparePublicResourceDelivery(resource.ID, u.Query().Get("expires"), "tampered", options, "")
		require.Error(t, err)
	}
	require.Error(t, svc.hydrateGenerationMedia("newapi:other", &input, providerMediaHydrationPolicyFor(ctx, input)))
	t.Setenv("CANVAS_PUBLIC_BASE_URL", "https://explicit.example")
	base, err := svc.publicResourceBaseURL()
	require.NoError(t, err)
	assert.Equal(t, "explicit.example", base.Host, "explicit media configuration retains priority")
}

func TestWorkbenchVideoUsesTHQWireContractAndResumesSameReceipt(t *testing.T) {
	svc, db := newChannelModelTestService(t)
	svc.coordinator = platform.NewCoordinatorWithRedis(nil, "thq-video-test")
	require.NoError(t, db.AutoMigrate(&model.SystemSetting{}))
	creates, polls := 0, 0
	host := &workbenchVideoTestHost{}
	host.relay = func(call WorkbenchRelay) (*http.Response, error) {
		request := call.Request
		assert.Equal(t, "42", call.UserID)
		var body string
		if request.Method == http.MethodPost {
			creates++
			assert.Equal(t, "/v1/videos", request.URL.Path)
			assert.Equal(t, "application/json", request.Header.Get("Content-Type"))
			var payload map[string]any
			require.NoError(t, json.NewDecoder(request.Body).Decode(&payload))
			assert.Equal(t, map[string]any{"model": "encoded-host-model", "prompt": "a cat walking", "seconds": "5", "size": "16:9", "resolution": "1080p"}, payload)
			body = `{"id":"task_full_receipt","status":"queued"}`
		} else {
			polls++
			assert.Equal(t, "/v1/videos/task_full_receipt", request.URL.Path)
			body = `{"id":"task_full_receipt","status":"completed"}`
			if polls == 2 {
				body = `{"id":"task_full_receipt","status":"failed","error":{"message":"stop mock before media download"}}`
			}
		}
		return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": []string{"application/json"}}, Body: io.NopCloser(strings.NewReader(body))}, nil
	}
	require.NoError(t, svc.ConfigureWorkbenchHost(host))
	until := time.Now().Add(time.Minute)
	task := model.Task{ID: "thq-video-wire", UserID: "newapi:42", Status: model.TaskStatusRunning, LeaseOwner: "worker", LeaseExpiresAt: &until}
	require.NoError(t, db.Create(&task).Error)
	input := canvasGenerationInput{Mode: "video", Prompt: "a cat walking", Config: providerConfig{ChannelID: "newapi-video", ChannelModelKey: "encoded-host-model", InterfaceType: "newapi", BaseURL: "http://newapi.workbench.invalid/v1", Model: "encoded-host-model", VideoSeconds: "5", Size: "16:9", VQuality: "1080p"}}
	metadata := providerAnalyticsContext{Service: svc, UserID: task.UserID, TaskID: task.ID, Model: input.Config.Model}
	ctx := context.WithValue(context.Background(), providerAnalyticsKey{}, metadata)
	_, err := runVideoTask(ctx, input)
	var pending providerStatePendingError
	require.ErrorAs(t, err, &pending)
	assert.True(t, pending.Detached)
	assert.Equal(t, "task_full_receipt", pending.TaskID)
	saved, err := svc.repo.Task(task.ID)
	require.NoError(t, err)
	assert.Equal(t, pending.TaskID, saved.ProviderRequestID)
	encodedInput, err := json.Marshal(input)
	require.NoError(t, err)
	attempt := model.RouteAttempt{ID: "thq-frozen-attempt", TaskID: task.ID, RouteRun: task.RouteRun}
	snapshot, err := json.Marshal(providerConfigSnapshot{Version: 1, TaskID: task.ID, UserID: task.UserID, AttemptID: attempt.ID, RouteRun: task.RouteRun, Config: input.Config})
	require.NoError(t, err)
	attempt.ProviderConfigCipher, err = svc.encryptSettingSecret(string(snapshot))
	require.NoError(t, err)
	require.NoError(t, db.Create(&attempt).Error)
	assert.True(t, svc.shouldDeferProviderTask(*saved, string(encodedInput), pending), "the worker must retain a fresh detached host task")
	expired := time.Now().Add(-49 * time.Hour)
	saved.StartedAt = &expired
	assert.False(t, svc.shouldDeferProviderTask(*saved, string(encodedInput), pending), "the outer timeout still applies")
	metadata.ProviderRequestID = saved.ProviderRequestID
	ctx = context.WithValue(ctx, providerAnalyticsKey{}, metadata)
	_, err = runVideoTask(ctx, input)
	require.ErrorAs(t, err, &pending, "completed without a URL must keep polling")
	_, err = runVideoTask(ctx, input)
	require.Error(t, err)
	assert.Equal(t, 1, creates, "recovery must not submit a second inference")
	assert.Equal(t, 2, polls)
}

func TestWorkbenchVideoReferencePayloadsAndCompletionURLs(t *testing.T) {
	base, ok := loadOfficialFallbackRegistry().Resolve("newapi")
	require.True(t, ok)
	adapter := workbenchVideoAdapter{base}
	request := protocol.GenerationRequest{Model: "sd4-seedance2.0-1080p", Prompt: "fixture", Duration: 5, AspectRatio: "9:16", Resolution: "1080p"}
	request.Images = []protocol.MediaReference{{URL: "https://media.example/a.png"}, {URL: "https://media.example/b.png"}}
	request.Videos = []protocol.MediaReference{{URL: "https://media.example/ref.mp4"}}
	request.Audios = []protocol.MediaReference{{URL: "https://media.example/ref.wav"}}
	spec, err := adapter.BuildCreate(context.Background(), protocol.RequestContext{Request: request})
	require.NoError(t, err)
	assert.Equal(t, "application/json", spec.ContentType)
	body := spec.Body.(map[string]any)
	assert.Equal(t, []string{"https://media.example/a.png", "https://media.example/b.png"}, body["images"])
	assert.Equal(t, []string{"https://media.example/ref.mp4"}, body["reference_videos"])
	assert.Equal(t, []string{"https://media.example/ref.wav"}, body["reference_audios"])
	assert.NotContains(t, body, "resolution_name")
	request.Images[1].URL = "blob:private-image"
	_, err = adapter.BuildCreate(context.Background(), protocol.RequestContext{Request: request})
	require.Error(t, err, "never silently discard a reference")
	request.Images = []protocol.MediaReference{{DataURL: testReferenceImageDataURL}}
	request.Videos, request.Audios = nil, nil
	spec, err = adapter.BuildCreate(context.Background(), protocol.RequestContext{Request: request})
	require.NoError(t, err)
	assert.Equal(t, "multipart/form-data", spec.ContentType)
	require.Len(t, spec.Files, 1)
	assert.Equal(t, "input_reference", spec.Files[0].Name)
	assert.Equal(t, "5", spec.Body.(map[string]any)["seconds"])
	for _, seconds := range []int{-1, 0, 3601} {
		request.Duration = seconds
		_, err = adapter.BuildCreate(context.Background(), protocol.RequestContext{Request: request})
		require.Error(t, err)
	}
	for _, payload := range []string{
		`{"status":"completed","url":"https://media.example/result.mp4"}`,
		`{"data":{"status":"completed","result":{"url":"https://media.example/result.mp4"}}}`,
	} {
		result, err := adapter.ParsePoll(context.Background(), protocol.PollContext{TaskID: "task_full_receipt"}, []byte(payload))
		require.NoError(t, err)
		assert.Equal(t, protocol.StatusSucceeded, result.Status)
		require.NotNil(t, result.Result)
		require.Len(t, result.Result.Videos, 1)
		assert.Equal(t, "https://media.example/result.mp4", result.Result.Videos[0].URL)
	}
	// The upstream OpenAI adapter's authenticated /content fallback is preserved.
	capability, ok := base.(protocol.ResultCapability)
	require.True(t, ok)
	assert.True(t, capability.ResultAvailable())
	_, ok = any(adapter).(protocol.ResultAdapter)
	assert.False(t, ok, "THQ must not call Sora's /content endpoint")
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
		{Key: "t-default", Name: "Qwen", Description: "管理员配置的描述", Group: "default", Capability: "text", Protocol: "chat-completion"},
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
		if item.ModelKey == "t-default" && item.Description != host.models[0].Description {
			t.Fatal("configured host description was replaced", item.Description)
		}
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
