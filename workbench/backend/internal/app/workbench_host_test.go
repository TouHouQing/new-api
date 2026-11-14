package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"yingce/backend/internal/assets"
	"yingce/backend/internal/model"
	"yingce/backend/internal/platform"
	"yingce/backend/internal/protocol"
	"yingce/backend/internal/repository"
)

type testWorkbenchHost struct {
	actor        WorkbenchHostUser
	models       []WorkbenchHostModel
	groups       []WorkbenchHostGroup
	bill         WorkbenchHostBilling
	calls        int
	billingReads int
}

type workbenchVideoTestHost struct {
	testWorkbenchHost
	relay func(WorkbenchRelay) (*http.Response, error)
}

type workbenchRecoveryBillingHost struct {
	*workbenchVideoTestHost
	billing func()
}

func (h *workbenchRecoveryBillingHost) Billing(ctx context.Context, userID, taskID string, attempt int) (WorkbenchHostBilling, error) {
	if h.billing != nil {
		h.billing()
	}
	return h.workbenchVideoTestHost.Billing(ctx, userID, taskID, attempt)
}

func (h *workbenchVideoTestHost) Relay(_ context.Context, call WorkbenchRelay) (*http.Response, error) {
	return h.relay(call)
}

type workbenchResourceTestHost struct{ testWorkbenchHost }

func (h *workbenchResourceTestHost) PublicBaseURL() string { return "https://host.example" }

type workbenchReceiptMismatchHost struct{ testWorkbenchHost }

func (h *workbenchReceiptMismatchHost) Billing(context.Context, string, string, int) (WorkbenchHostBilling, error) {
	return WorkbenchHostBilling{
		Source: model.BillingSourceNewAPI, UserID: "newapi:other",
		TaskID: "other-task", ReceiptID: "receipt:other", Final: true,
	}, nil
}

type workbenchVideoExecutionProbe struct {
	*Service
	orderStatus model.BillingStatus
	calls       int
}

func (p *workbenchVideoExecutionProbe) processTask(_ context.Context, task model.Task) (map[string]interface{}, []map[string]interface{}, error) {
	p.calls++
	order, err := p.repo.BillingOrder(task.BillingOrderID)
	if err != nil {
		return nil, nil, err
	}
	p.orderStatus = order.Status
	return nil, nil, errors.New("workbench video execution fixture reached")
}

type workbenchMissingReceiptHost struct{ testWorkbenchHost }

func (workbenchMissingReceiptHost) Billing(context.Context, string, string, int) (WorkbenchHostBilling, error) {
	return WorkbenchHostBilling{}, ErrWorkbenchBillingReceiptNotFound
}

func TestWorkbenchDramaTaskAdmissionUsesHostModelsAndSegmentIdentity(t *testing.T) {
	svc, db := newTimelineTaskTestService(t)
	svc.dataDir = t.TempDir()
	host := &testWorkbenchHost{actor: WorkbenchHostUser{ID: "42"}, models: []WorkbenchHostModel{
		{Key: "text-key", Name: "gpt-6.1-terra", Capability: "text", Protocol: "chat-completion"},
		{Key: "image-key", Name: "gpt-image-2-1k", Capability: "image", Protocol: "openai-image"},
		{Key: "video-key", Name: "特价seedance-2.0-720p", Capability: "video", Protocol: "newapi"},
	}}
	require.NoError(t, svc.ConfigureWorkbenchHost(host))
	user, err := svc.WorkbenchCurrentUser(WithWorkbenchIdentity(context.Background(), "42"))
	require.NoError(t, err)
	_, err = svc.workbenchModels(context.Background(), user.ID)
	require.NoError(t, err)
	project := model.Project{ID: "drama-project", UserID: user.ID, Name: "医院病房"}
	require.NoError(t, db.Create(&project).Error)
	run := &dramaRun{s: svc, project: &project}
	require.NoError(t, db.AutoMigrate(&model.DramaJob{}))
	job := &model.DramaJob{ID: "prompt-job", ProjectID: project.ID, Status: model.DramaJobQueued, EpisodeID: "episode", ShotID: "drama-segment", Kind: model.DramaJobSegmentPrompt}
	require.NoError(t, db.Create(job).Error)
	// Go through the real task admission, not the orchestrator's task hook.
	for _, capability := range []string{"text", "image", "video"} {
		t.Run(capability, func(t *testing.T) {
			choice := DramaModelChoice{ChannelID: "newapi-" + capability, ModelKey: capability + "-key"}
			config := map[string]any{}
			operation := "text"
			if capability == "image" {
				request := svc.dramaImageRequestFor(choice, "16:9", "")
				require.Empty(t, request.Issue)
				request.apply(config)
				operation = "text_to_image"
			}
			if capability == "video" {
				config["size"], config["videoSeconds"], config["vquality"] = "16:9", "5", "720p"
				operation = "text_to_video"
			}
			task, err := run.createTaskWith(job, choice, capability, operation, "A hospital room", map[string]any{"config": config, "metadata": run.metadata(job)})
			require.NoError(t, err)
			stored, err := svc.repo.Task(task.ID)
			require.NoError(t, err)
			var bound model.DramaJob
			require.NoError(t, db.First(&bound, "id = ?", job.ID).Error)
			assert.Equal(t, task.ID, bound.TaskID, "job binding and hosted task admission must commit together")
			var input map[string]any
			require.NoError(t, json.Unmarshal([]byte(stored.InputJSON), &input))
			metadata := input["metadata"].(map[string]any)
			assert.Equal(t, job.ShotID, metadata["dramaSegmentId"])
			assert.Empty(t, metadata["shotId"])
			config = input["config"].(map[string]any)
			assert.Empty(t, config["apiKey"], "host execution must not create an API key")
			var generation canvasGenerationInput
			require.NoError(t, json.Unmarshal([]byte(stored.InputJSON), &generation))
			resolved, err := svc.resolveProviderConfig(generation.Config)
			require.NoError(t, err)
			assert.Equal(t, "http://newapi.workbench.invalid/v1", resolved.BaseURL)
			assert.Empty(t, resolved.APIKey)
			if capability == "image" {
				assert.Equal(t, "1824x1024", config["size"])
			}
		})
	}
	run.project = &model.Project{ID: project.ID, UserID: "newapi:other"}
	_, err = run.createTaskWith(job, DramaModelChoice{ChannelID: "newapi-text", ModelKey: "text-key"}, "text", "text", "test", map[string]any{"metadata": run.metadata(job)})
	require.Error(t, err, "segment metadata must not bypass project ownership")
	assert.Zero(t, host.calls, "admission must not invoke inference")
}

func TestWorkbenchImageDefaultsKeepExplicitPixelTier(t *testing.T) {
	svc, _ := newTimelineTaskTestService(t)
	for _, tc := range []struct{ name, tier, pixels string }{
		{"gpt-image-2-1k", "1k", "1824x1024"},
		{"gpt-image-2-2k", "2k", "2752x1536"},
		{"gpt-image-2-4k", "4k", "3840x2160"},
		{"gpt-image-2", "1k", "1824x1024"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			profile, err := NormalizeModelCapabilityConfigForModel("image", "openai-image", tc.name, DefaultModelCapabilityConfigForModel("openai-image", tc.name), svc.protocolRegistry())
			require.NoError(t, err)
			require.NoError(t, validateImageSizePresetRequirement("image", "openai-image", profile))
			assert.Equal(t, tc.tier, profile.Image.Size.DefaultTier)
			for _, quality := range []string{"auto", "low", "high"} {
				config := providerConfig{InterfaceType: "openai-image", Model: "opaque-host-key", Size: "16:9", Quality: quality}
				require.NoError(t, applyImageParameterValues(&config, profile.Image))
				assert.Equal(t, tc.pixels, config.Size)
				assert.Equal(t, quality, config.Quality, "quality must not select resolution")
			}
		})
	}
}

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

func TestWorkbenchUncertainProviderTaskResumesOnlyOriginalPoll(t *testing.T) {
	svc, db := newTimelineTaskTestService(t)
	svc.coordinator = platform.NewCoordinatorWithRedis(nil, "uncertain-provider-poll")
	posts, polls := 0, 0
	host := &workbenchVideoTestHost{}
	host.relay = func(call WorkbenchRelay) (*http.Response, error) {
		if call.Request.Method == http.MethodPost {
			posts++
			return nil, errors.New("submitted provider task must not be created again")
		}
		polls++
		assert.Equal(t, "/v1/videos/provider-existing", call.Request.URL.Path)
		return &http.Response{
			StatusCode: http.StatusBadRequest,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(`{"error":{"message":"fixture poll failure"}}`)),
		}, nil
	}
	require.NoError(t, svc.ConfigureWorkbenchHost(host))
	until := time.Now().Add(time.Minute)
	task := model.Task{ID: "uncertain-provider-task", UserID: "newapi:42", Type: "canvas_video", Model: "uncertain-video", Status: model.TaskStatusRunning, ProviderRequestID: "provider-existing", PollStage: "accepted", LeaseOwner: "worker", LeaseExpiresAt: &until}
	require.NoError(t, db.Create(&task).Error)
	order := model.BillingOrder{
		ID: "uncertain-provider-order", UserID: task.UserID, TaskID: task.ID,
		IdempotencyKey: "newapi:" + task.ID + ":0:fixture", BillingSource: model.BillingSourceNewAPI, BillingMode: model.BillingModeNewAPI,
		Status: model.BillingStatusUncertain, ReservedAmountMicrocredits: 975_000, ProviderRequestID: "provider-existing",
	}
	require.NoError(t, db.Create(&order).Error)
	input := canvasGenerationInput{
		Mode: "video", Prompt: "resume original request",
		Config: providerConfig{
			ChannelID: "newapi-video", ChannelModelKey: "uncertain-video", InterfaceType: "newapi",
			BaseURL: "http://newapi.workbench.invalid/v1", Model: "uncertain-video", VideoSeconds: "5", Size: "16:9", VQuality: "480p",
		},
	}
	metadata := providerAnalyticsContext{Service: svc, UserID: task.UserID, TaskID: task.ID, BillingOrderID: order.ID, Model: input.Config.Model, ProviderRequestID: task.ProviderRequestID}
	ctx := context.WithValue(context.Background(), providerAnalyticsKey{}, metadata)
	_, err := runVideoTaskWithPolicy(ctx, input, fastVideoPollPolicy())
	require.Error(t, err)
	assert.Zero(t, posts, "a submitted provider task must never be POSTed again")
	assert.Positive(t, polls, "recovery must query the original provider task ID: %v", err)
}

func TestWorkbenchHydratesProviderRequestIDFromUncertainReceipt(t *testing.T) {
	svc, db := newTimelineTaskTestService(t)
	until := time.Now().Add(time.Minute)
	task := model.Task{ID: "hydrate-receipt-task", UserID: "newapi:42", Type: "canvas_video", Status: model.TaskStatusRunning, LeaseOwner: "worker", LeaseExpiresAt: &until}
	require.NoError(t, db.Create(&task).Error)
	order := model.BillingOrder{
		ID: "hydrate-receipt-order", UserID: task.UserID, TaskID: task.ID,
		IdempotencyKey: "newapi:" + task.ID + ":0:fixture", BillingSource: model.BillingSourceNewAPI, BillingMode: model.BillingModeNewAPI,
		Status: model.BillingStatusUncertain, ReservedAmountMicrocredits: 975_000, ProviderRequestID: "provider-existing",
	}
	require.NoError(t, db.Create(&order).Error)
	task.BillingOrderID = order.ID

	svc.hydrateTaskProviderReceiptFromBilling(&task)
	assert.Equal(t, "provider-existing", task.ProviderRequestID)
	assert.Equal(t, "accepted", task.PollStage)
	stored, err := svc.repo.Task(task.ID)
	require.NoError(t, err)
	assert.Equal(t, "provider-existing", stored.ProviderRequestID)
}

func TestWorkbenchProviderReceiptPersistsBillingMirrorWhenTaskStateWriteFails(t *testing.T) {
	svc, db := newTimelineTaskTestService(t)
	task := model.Task{ID: "partial-receipt-task", UserID: "newapi:42", Type: "canvas_video", Status: model.TaskStatusRunning}
	require.NoError(t, db.Create(&task).Error)
	order := model.BillingOrder{
		ID: "partial-receipt-order", UserID: task.UserID, TaskID: task.ID,
		IdempotencyKey: "newapi:" + task.ID + ":0:fixture", BillingSource: model.BillingSourceNewAPI, BillingMode: model.BillingModeNewAPI,
		Status: model.BillingStatusRunning,
	}
	require.NoError(t, db.Create(&order).Error)
	require.NoError(t, db.Model(&task).Update("billing_order_id", order.ID).Error)
	task.BillingOrderID = order.ID
	attempt := model.RouteAttempt{ID: "partial-receipt-attempt", TaskID: task.ID, RouteRun: task.RouteRun, DispatchState: "submission_unknown", Status: "dispatching"}
	require.NoError(t, db.Create(&attempt).Error)
	require.NoError(t, db.Exec(`CREATE TRIGGER fail_task_receipt BEFORE UPDATE OF provider_request_id ON tasks BEGIN SELECT RAISE(ABORT, 'task receipt write failed'); END`).Error)
	ctx := context.WithValue(context.Background(), providerAnalyticsKey{}, providerAnalyticsContext{Service: svc, UserID: task.UserID, TaskID: task.ID, BillingOrderID: order.ID})
	err := svc.recordProviderTaskReceipt(ctx, "provider-existing", "accepted", nil)
	require.Error(t, err)
	stored, readErr := svc.repo.BillingOrder(order.ID)
	require.NoError(t, readErr)
	assert.Equal(t, "provider-existing", stored.ProviderRequestID, "billing mirror must retain the submitted provider ID for recovery")
	receiptErr := providerReceiptPersistenceError{TaskID: "provider-existing", Cause: err}
	assert.True(t, svc.adoptSubmittedProviderReceipt(&task, receiptErr))
	storedAttempt, readErr := svc.repo.LatestRouteAttempt(task.ID)
	require.NoError(t, readErr)
	assert.Equal(t, "provider-existing", storedAttempt.ProviderRequestID)
	assert.Equal(t, "accepted", storedAttempt.DispatchState)
}

func TestHostedNewAPIVideoNormalizesDeclaredResolutionAliasBeforeWire(t *testing.T) {
	svc, db := newChannelModelTestService(t)
	svc.coordinator = platform.NewCoordinatorWithRedis(nil, "hosted-resolution-alias")
	profile := DefaultModelCapabilityConfigForModel("newapi", "declared-480-video")
	profile.Video.Resolutions = []string{"480p", "720p"}
	profile.Video.DefaultResolution = "480p"
	rawProfile, err := json.Marshal(profile)
	require.NoError(t, err)
	var capability map[string]any
	require.NoError(t, json.Unmarshal(rawProfile, &capability))
	host := &workbenchVideoTestHost{testWorkbenchHost: testWorkbenchHost{
		actor: WorkbenchHostUser{ID: "42"},
		models: []WorkbenchHostModel{{
			Key: "declared-480-video", Name: "declared-480-video",
			Capability: "video", Protocol: "newapi", CapabilityConfig: capability,
		}},
	}}
	require.NoError(t, svc.ConfigureWorkbenchHost(host))
	_, err = svc.workbenchModels(context.Background(), "newapi:42")
	require.NoError(t, err)

	for _, test := range []struct {
		name    string
		quality string
		want    string
		frozen  bool
	}{
		{name: "numeric alias", quality: "480", want: "480p"},
		{name: "canonical value", quality: "480p", want: "480p"},
		{name: "provider value", quality: "native-high", want: "native-high"},
		{name: "legacy retry snapshot", quality: "480", want: "480p", frozen: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			var payload map[string]any
			host.relay = func(call WorkbenchRelay) (*http.Response, error) {
				require.Equal(t, "/v1/videos", call.Request.URL.Path)
				require.NoError(t, json.NewDecoder(call.Request.Body).Decode(&payload))
				return &http.Response{
					StatusCode: http.StatusBadRequest,
					Header:     http.Header{"Content-Type": []string{"application/json"}},
					Body:       io.NopCloser(strings.NewReader(`{"error":{"message":"fixture stops after create"}}`)),
				}, nil
			}
			until := time.Now().Add(time.Minute)
			task := model.Task{ID: "hosted-resolution-" + test.name, UserID: "newapi:42", Status: model.TaskStatusRunning, LeaseOwner: "worker", LeaseExpiresAt: &until}
			require.NoError(t, db.Create(&task).Error)
			input := canvasGenerationInput{
				Mode: "video", Prompt: "a cat walking",
				Config: providerConfig{
					ChannelID: "newapi-video", ChannelModelKey: "declared-480-video",
					InterfaceType: "newapi", BaseURL: "http://newapi.workbench.invalid/v1",
					Model: "declared-480-video", VideoSeconds: "5", Size: "16:9",
					VQuality: test.quality, frozenExecutionConfig: test.frozen,
				},
			}
			require.NoError(t, svc.validateResolvedVideoCapability(&input))
			metadata := providerAnalyticsContext{Service: svc, UserID: task.UserID, TaskID: task.ID, Model: input.Config.Model}
			ctx := context.WithValue(context.Background(), providerAnalyticsKey{}, metadata)
			_, err := runVideoTask(ctx, input)
			require.Error(t, err)
			assert.Equal(t, test.want, payload["resolution"])
			assert.NotContains(t, payload, "resolution_name")
			assert.Equal(t, "16:9", payload["size"])
			assert.Equal(t, "5", payload["seconds"])
		})
	}
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
func (h *testWorkbenchHost) Billing(_ context.Context, userID, taskID string, attempt int) (WorkbenchHostBilling, error) {
	h.billingReads++
	bill := h.bill
	if bill.Source == "" {
		bill.Source = model.BillingSourceNewAPI
	}
	if bill.UserID == "" {
		bill.UserID = "newapi:" + userID
	}
	if bill.TaskID == "" {
		bill.TaskID = taskID
	}
	if bill.ReceiptID == "" {
		bill.ReceiptID = fmt.Sprintf("wb:%s:%d", taskID, attempt)
	}
	return bill, nil
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

func TestWorkbenchTaskAdmissionDoesNotUseHostBalanceAsLocalBudget(t *testing.T) {
	for _, hostID := range []string{"1", "342"} {
		t.Run(hostID, func(t *testing.T) {
			svc, db := newTimelineTaskTestService(t)
			svc.dataDir = t.TempDir()
			const largeSnapshot = int64(12_000_000)
			host := &testWorkbenchHost{
				actor: WorkbenchHostUser{ID: hostID},
				models: []WorkbenchHostModel{{
					Key: "large-balance-text", Name: "Fixture text", Capability: "text",
					Protocol: "chat-completion", SpendingCapMicrocredits: largeSnapshot,
				}},
			}
			require.NoError(t, svc.ConfigureWorkbenchHost(host))
			user, err := svc.WorkbenchCurrentUser(WithWorkbenchIdentity(context.Background(), hostID))
			require.NoError(t, err)
			task, err := svc.CreateTask(user.ID, CreateTaskRequest{
				Type: "canvas_text", Operation: "text", Prompt: "large balance fixture",
				admission: &taskAdmission{ID: "host-admission-" + hostID, MaxCharge: 0},
				Input: map[string]any{
					"mode": "text", "prompt": "large balance fixture",
					"config": map[string]any{"channelId": "newapi-text", "model": "large-balance-text"},
				},
			})
			require.NoError(t, err)
			require.NotEmpty(t, task.BillingOrderID)
			order, err := svc.repo.BillingOrder(task.BillingOrderID)
			require.NoError(t, err)
			assert.Equal(t, model.BillingModeNewAPI, order.BillingMode)
			assert.Equal(t, model.BillingSourceNewAPI, order.BillingSource)
			assert.Equal(t, model.BillingStatusPendingReceipt, order.Status)
			assert.Zero(t, order.AmountMicrocredits)
			assert.Zero(t, order.ReservedAmountMicrocredits)
			assert.Zero(t, task.AuthorizedChargeMicrocredits)
			var channelModel model.ChannelModel
			require.NoError(t, db.First(&channelModel, "id = ?", "host-"+host.models[0].Key).Error)
			assert.Zero(t, channelModel.UnitPriceMicrocredits, "host authorization snapshots must not become local prices")
			var ledgerCount int64
			require.NoError(t, db.Model(&model.CreditLedgerEntry{}).Count(&ledgerCount).Error)
			assert.Zero(t, ledgerCount, "catalog snapshots must not move Workbench credits")
			assert.Zero(t, host.calls, "admission must not invoke inference")
		})
	}
}

func TestWorkbenchNewAPIVideoReceiptEntersRunningBeforeRelay(t *testing.T) {
	svc, db := newTimelineTaskTestService(t)
	host := &testWorkbenchHost{
		actor: WorkbenchHostUser{ID: "1"},
		models: []WorkbenchHostModel{{
			Key: "vcbc7b9441cf008b2ee87a340", Name: "THQ video fixture",
			Capability: "video", Protocol: "newapi",
		}},
	}
	require.NoError(t, svc.ConfigureWorkbenchHost(host))
	user, err := svc.WorkbenchCurrentUser(WithWorkbenchIdentity(context.Background(), "1"))
	require.NoError(t, err)
	task, err := svc.CreateTask(user.ID, CreateTaskRequest{
		Type: "canvas_video", Operation: "text_to_video", Prompt: "a cat walking",
		Input: map[string]any{
			"mode": "video", "prompt": "a cat walking",
			"config": map[string]any{
				"channelId": "newapi-video", "model": "vcbc7b9441cf008b2ee87a340",
				"size": "16:9", "videoSeconds": "5", "vquality": "720p",
			},
		},
	})
	require.NoError(t, err)
	order, err := svc.repo.BillingOrder(task.BillingOrderID)
	require.NoError(t, err)
	require.Equal(t, model.BillingStatusPendingReceipt, order.Status)

	require.NoError(t, svc.taskBilling().MarkBillingRunning(order.ID, task.ID, task.RouteRun))
	order, err = svc.repo.BillingOrder(order.ID)
	require.NoError(t, err)
	assert.Equal(t, model.BillingStatusRunning, order.Status)
	var accounts, entries int64
	require.NoError(t, db.Model(&model.CreditAccount{}).Count(&accounts).Error)
	require.NoError(t, db.Model(&model.CreditLedgerEntry{}).Count(&entries).Error)
	assert.Zero(t, accounts)
	assert.Zero(t, entries)
	assert.Zero(t, host.calls, "transition must complete before any New API request")
}

func TestWorkbenchVideoWorkerAdvancesPendingReceiptBeforeExecution(t *testing.T) {
	svc, _ := newTimelineTaskTestService(t)
	svc.dataDir = t.TempDir()
	host := &testWorkbenchHost{
		actor: WorkbenchHostUser{ID: "1"},
		models: []WorkbenchHostModel{{
			Key: "vcbc7b9441cf008b2ee87a340", Name: "THQ video fixture",
			Capability: "video", Protocol: "newapi",
		}},
	}
	require.NoError(t, svc.ConfigureWorkbenchHost(host))
	user, err := svc.WorkbenchCurrentUser(WithWorkbenchIdentity(context.Background(), "1"))
	require.NoError(t, err)
	task, err := svc.CreateTask(user.ID, CreateTaskRequest{
		Type: "canvas_video", Operation: "text_to_video", Prompt: "a cat walking",
		Input: map[string]any{
			"mode": "video", "prompt": "a cat walking",
			"config": map[string]any{
				"channelId": "newapi-video", "model": "vcbc7b9441cf008b2ee87a340",
				"size": "16:9", "videoSeconds": "5", "vquality": "720p",
			},
		},
	})
	require.NoError(t, err)
	claimed, err := svc.repo.ClaimNextTask("workbench-billing-worker", time.Minute)
	require.NoError(t, err)
	require.NotNil(t, claimed)
	require.Equal(t, task.ID, claimed.ID)

	probe := &workbenchVideoExecutionProbe{Service: svc}
	svc.activeCancels = make(map[string]context.CancelFunc)
	svc.taskRouteExecutor = &taskRouteExecutor{port: probe}
	err = svc.taskWorker().processClaimedTask(claimed, nil)
	require.Error(t, err)
	stored, readErr := svc.repo.Task(task.ID)
	require.NoError(t, readErr)
	require.Equal(t, 1, probe.calls, "execution must receive the task only after the New API receipt mirror is running: worker=%v task=%s/%s", err, stored.Stage, stored.Error)
	require.Equal(t, model.BillingStatusRunning, probe.orderStatus)
	require.NotContains(t, err.Error(), "计费状态已变化")
}

func TestWorkbenchSubmittedVideoRecoveryPollsOriginalProviderIDAndSettles(t *testing.T) {
	t.Setenv("CANVAS_ALLOW_PRIVATE_UPSTREAMS", "true")
	videoFixture, err := os.ReadFile("../../../../web/public/studio-presets/videos/camera-static.mp4")
	require.NoError(t, err)
	mediaServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/result.mp4", r.URL.Path)
		w.Header().Set("Content-Type", "video/mp4")
		_, _ = w.Write(videoFixture)
	}))
	defer mediaServer.Close()

	svc, db := newTimelineTaskTestService(t)
	svc.dataDir = t.TempDir()
	svc.coordinator = platform.NewCoordinatorWithRedis(nil, "workbench-recovery-seam")
	svc.activeCancels = make(map[string]context.CancelFunc)
	posts, polls := 0, 0
	const providerID = "provider-recover-1"
	host := &workbenchVideoTestHost{testWorkbenchHost: testWorkbenchHost{
		actor: WorkbenchHostUser{ID: "42"},
		models: []WorkbenchHostModel{{
			Key: "recover-video", Name: "Recovery video", Capability: "video", Protocol: "newapi",
		}},
	}}
	host.relay = func(call WorkbenchRelay) (*http.Response, error) {
		if call.Request.Method == http.MethodPost {
			posts++
			host.bill = WorkbenchHostBilling{
				ProviderRequestID: providerID, ReservedMicrocredits: 975_000,
			}
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     http.Header{"Content-Type": []string{"application/json"}},
				Body:       io.NopCloser(strings.NewReader(fmt.Sprintf(`{"id":%q,"status":"queued"}`, providerID))),
			}, nil
		}
		polls++
		require.Equal(t, "/v1/videos/"+providerID, call.Request.URL.Path)
		host.bill = WorkbenchHostBilling{
			ProviderRequestID: providerID, Final: true, ChargedMicrocredits: 975_000,
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body: io.NopCloser(strings.NewReader(fmt.Sprintf(
				`{"id":%q,"status":"completed","url":%q}`,
				providerID, mediaServer.URL+"/result.mp4",
			))),
		}, nil
	}
	require.NoError(t, svc.ConfigureWorkbenchHost(host))
	user, err := svc.WorkbenchCurrentUser(WithWorkbenchIdentity(context.Background(), "42"))
	require.NoError(t, err)
	task, err := svc.CreateTask(user.ID, CreateTaskRequest{
		Type: "canvas_video", Operation: "text_to_video", Prompt: "recover exact provider request",
		Input: map[string]any{
			"mode": "video", "prompt": "recover exact provider request",
			"config": map[string]any{
				"channelId": "newapi-video", "model": "recover-video",
				"size": "16:9", "videoSeconds": "5", "vquality": "480p",
			},
		},
	})
	require.NoError(t, err)

	firstClaim, err := svc.repo.ClaimNextTask("first-worker", time.Minute)
	require.NoError(t, err)
	require.NotNil(t, firstClaim)
	require.Equal(t, task.ID, firstClaim.ID)
	require.NoError(t, svc.taskWorker().processClaimedTask(firstClaim, nil))
	assert.Equal(t, 1, posts)
	assert.Zero(t, polls)

	stored, err := svc.repo.Task(task.ID)
	require.NoError(t, err)
	assert.Equal(t, model.TaskStatusRunning, stored.Status)
	assert.Equal(t, providerID, stored.ProviderRequestID)
	order, err := svc.repo.BillingOrder(task.BillingOrderID)
	require.NoError(t, err)
	require.Equal(t, providerID, order.ProviderRequestID)
	coordinator := &workbenchBillingRepository{Repository: svc.repo, svc: svc}
	require.NoError(t, coordinator.sync(order.ID, order.ProviderRequestID, false))
	order, err = svc.repo.BillingOrder(order.ID)
	require.NoError(t, err)
	require.Equal(t, model.BillingStatusUncertain, order.Status)
	assert.EqualValues(t, 975_000, order.ReservedAmountMicrocredits)

	require.NoError(t, db.Model(&model.Task{}).Where("id = ?", task.ID).
		Update("next_poll_at", time.Now().Add(-time.Second)).Error)
	secondClaim, err := svc.repo.ClaimNextTask("second-worker", time.Minute)
	require.NoError(t, err)
	require.NotNil(t, secondClaim)
	require.Equal(t, task.ID, secondClaim.ID)
	require.Equal(t, providerID, secondClaim.ProviderRequestID)
	require.NoError(t, svc.taskWorker().processClaimedTask(secondClaim, nil))

	assert.Equal(t, 1, posts, "recovery must never create a second provider task")
	assert.Equal(t, 1, polls)
	stored, err = svc.repo.Task(task.ID)
	require.NoError(t, err)
	assert.Equal(t, model.TaskStatusSucceeded, stored.Status)
	var savedResult struct {
		Video map[string]any `json:"video"`
	}
	require.NoError(t, json.Unmarshal([]byte(stored.ResultJSON), &savedResult))
	assert.NotEmpty(t, savedResult.Video["resourceId"])
	assert.Equal(t, "video/mp4", savedResult.Video["mimeType"])
	order, err = svc.repo.BillingOrder(task.BillingOrderID)
	require.NoError(t, err)
	assert.Equal(t, model.BillingStatusSettled, order.Status)
	assert.EqualValues(t, 975_000, order.ActualAmountMicrocredits)
	assert.Zero(t, order.ReservedAmountMicrocredits)
	assert.Equal(t, providerID, order.ProviderRequestID)
	var accounts, entries int64
	require.NoError(t, db.Model(&model.CreditAccount{}).Count(&accounts).Error)
	require.NoError(t, db.Model(&model.CreditLedgerEntry{}).Count(&entries).Error)
	assert.Zero(t, accounts, "hosted recovery must not create a Workbench wallet")
	assert.Zero(t, entries, "hosted recovery must not create a local billing ledger")
}

func TestWorkbenchBillingRecoveryAuthorizationIsReadOnlyAndValidated(t *testing.T) {
	type setup struct {
		orderStatus     model.BillingStatus
		orderUser       string
		orderTask       string
		orderProvider   string
		attemptRouteRun int
		attemptProvider string
		billProvider    string
		billUser        string
		billTask        string
		billReceipt     string
		mirrorReserved  int64
		mirrorCharged   int64
		billFinal       bool
		billFinalSet    bool
		billCharged     int64
		billChargedSet  bool
		wantIdentity    bool
		wantEvidence    bool
		wantState       bool
		wantNoReceipt   bool
	}
	tests := []struct {
		name  string
		apply func(*setup)
	}{
		{name: "uncertain remains read only"},
		{name: "settled remains settled", apply: func(s *setup) {
			s.orderStatus = model.BillingStatusSettled
			s.mirrorReserved = 0
			s.mirrorCharged = 975_000
		}},
		{name: "refunded remains refunded", apply: func(s *setup) {
			s.orderStatus = model.BillingStatusRefunded
			s.mirrorReserved = 0
		}},
		{name: "settled terminal regression rejected", apply: func(s *setup) {
			s.orderStatus = model.BillingStatusSettled
			s.mirrorReserved = 0
			s.mirrorCharged = 975_000
			s.billFinal, s.billFinalSet = false, true
			s.wantState = true
		}},
		{name: "settled amount mismatch rejected", apply: func(s *setup) {
			s.orderStatus = model.BillingStatusSettled
			s.mirrorReserved = 0
			s.mirrorCharged = 975_000
			s.billCharged, s.billChargedSet = 800_000, true
			s.wantState = true
		}},
		{name: "refunded charged receipt rejected", apply: func(s *setup) {
			s.orderStatus = model.BillingStatusRefunded
			s.mirrorReserved = 0
			s.billCharged, s.billChargedSet = 1, true
			s.wantState = true
		}},
		{name: "wrong order user", apply: func(s *setup) {
			s.orderUser = "newapi:other"
			s.wantIdentity = true
		}},
		{name: "wrong order task", apply: func(s *setup) {
			s.orderTask = "other-task"
			s.wantIdentity = true
		}},
		{name: "wrong route run", apply: func(s *setup) {
			s.attemptRouteRun = 9
			s.wantEvidence = true
		}},
		{name: "wrong route provider", apply: func(s *setup) {
			s.attemptProvider = "other-provider"
			s.wantIdentity = true
		}},
		{name: "wrong mirror provider", apply: func(s *setup) {
			s.orderProvider = "other-provider"
			s.wantIdentity = true
		}},
		{name: "wrong authoritative provider", apply: func(s *setup) {
			s.billProvider = "other-provider"
			s.wantIdentity = true
		}},
		{name: "wrong authoritative user", apply: func(s *setup) {
			s.billUser = "newapi:other"
			s.wantIdentity = true
		}},
		{name: "wrong authoritative task", apply: func(s *setup) {
			s.billTask = "other-task"
			s.wantIdentity = true
		}},
		{name: "wrong authoritative receipt", apply: func(s *setup) {
			s.billReceipt = "wb:other-task:0"
			s.wantIdentity = true
		}},
		{name: "missing receipt", apply: func(s *setup) {
			s.wantNoReceipt = true
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			values := setup{
				orderStatus: model.BillingStatusUncertain, orderUser: "newapi:42",
				orderTask: "recovery-task", orderProvider: "provider-1",
				attemptRouteRun: 0, attemptProvider: "provider-1",
				billProvider: "provider-1", billUser: "newapi:42",
				billTask: "recovery-task", billReceipt: "wb:recovery-task:0",
				mirrorReserved: 975_000,
			}
			if tt.apply != nil {
				tt.apply(&values)
			}
			billFinal := values.orderStatus == model.BillingStatusSettled || values.orderStatus == model.BillingStatusRefunded
			if values.billFinalSet {
				billFinal = values.billFinal
			}
			billCharged := values.mirrorCharged
			if values.billChargedSet {
				billCharged = values.billCharged
			}
			svc, db := newTimelineTaskTestService(t)
			host := &testWorkbenchHost{
				actor: WorkbenchHostUser{ID: "42"},
				bill: WorkbenchHostBilling{
					ProviderRequestID:    values.billProvider,
					ReservedMicrocredits: values.mirrorReserved,
					ChargedMicrocredits:  billCharged,
					Final:                billFinal,
				},
			}
			var configured WorkbenchHost = host
			if values.wantNoReceipt {
				configured = &workbenchMissingReceiptHost{testWorkbenchHost: testWorkbenchHost{
					actor: WorkbenchHostUser{ID: "42"},
				}}
			}
			require.NoError(t, svc.ConfigureWorkbenchHost(configured))
			order := model.BillingOrder{
				ID: "recovery-order", UserID: values.orderUser, TaskID: values.orderTask,
				IdempotencyKey: "newapi:recovery-task:0:fixture",
				BillingSource:  model.BillingSourceNewAPI, BillingMode: model.BillingModeNewAPI,
				Status: values.orderStatus, ProviderRequestID: values.orderProvider,
				ReservedAmountMicrocredits: values.mirrorReserved, ActualAmountMicrocredits: values.mirrorCharged,
			}
			require.NoError(t, db.Create(&order).Error)
			routeAttempt := &model.RouteAttempt{
				ID: "recovery-attempt", TaskID: "recovery-task",
				RouteRun: values.attemptRouteRun, DispatchState: "accepted",
				ProviderRequestID: values.attemptProvider,
			}
			host.bill.Source = model.BillingSourceNewAPI
			host.bill.UserID = values.billUser
			host.bill.TaskID = values.billTask
			host.bill.ReceiptID = values.billReceipt
			if values.wantNoReceipt {
				host.bill = WorkbenchHostBilling{}
			}
			coordinator := &workbenchBillingRepository{Repository: svc.repo, svc: svc}
			err := coordinator.AuthorizeBillingRecovery(
				context.Background(),
				order.ID, "recovery-task", "newapi:42", "provider-1", 0, routeAttempt,
			)
			switch {
			case values.wantNoReceipt:
				require.ErrorIs(t, err, ErrWorkbenchBillingReceiptNotFound)
			case values.wantIdentity:
				require.ErrorIs(t, err, repository.ErrNewAPIBillingIdentityMismatch)
			case values.wantEvidence:
				require.ErrorIs(t, err, ErrWorkbenchBillingRecoveryEvidence)
			case values.wantState:
				require.ErrorIs(t, err, repository.ErrBillingStateConflict)
			default:
				require.NoError(t, err)
			}
			stored, readErr := svc.repo.BillingOrder(order.ID)
			require.NoError(t, readErr)
			assert.Equal(t, values.orderStatus, stored.Status)
			assert.EqualValues(t, values.mirrorReserved, stored.ReservedAmountMicrocredits)
			assert.EqualValues(t, values.mirrorCharged, stored.ActualAmountMicrocredits)
		})
	}
}

func TestWorkbenchBillingMirrorAdoptsAuthoritativeProviderRequestID(t *testing.T) {
	svc, db := newTimelineTaskTestService(t)
	host := &testWorkbenchHost{
		actor: WorkbenchHostUser{ID: "42"},
		bill: WorkbenchHostBilling{
			ProviderRequestID: "provider-from-host", ReservedMicrocredits: 975_000,
		},
	}
	require.NoError(t, svc.ConfigureWorkbenchHost(host))
	task := model.Task{ID: "host-provider-task", UserID: "newapi:42", Type: "canvas_video", Status: model.TaskStatusRunning}
	require.NoError(t, db.Create(&task).Error)
	order := model.BillingOrder{
		ID: "host-provider-order", UserID: task.UserID, TaskID: task.ID,
		IdempotencyKey: "newapi:" + task.ID + ":0:fixture",
		BillingSource:  model.BillingSourceNewAPI, BillingMode: model.BillingModeNewAPI,
		Status: model.BillingStatusRunning,
	}
	require.NoError(t, db.Create(&order).Error)
	coordinator := &workbenchBillingRepository{Repository: svc.repo, svc: svc}
	require.NoError(t, coordinator.sync(order.ID, "", false))
	stored, err := svc.repo.BillingOrder(order.ID)
	require.NoError(t, err)
	assert.Equal(t, model.BillingStatusUncertain, stored.Status)
	assert.Equal(t, "provider-from-host", stored.ProviderRequestID)
	assert.EqualValues(t, 975_000, stored.ReservedAmountMicrocredits)
	var ledgerCount int64
	require.NoError(t, db.Model(&model.CreditLedgerEntry{}).Count(&ledgerCount).Error)
	assert.Zero(t, ledgerCount)
}

func seedWorkbenchAcceptedRecoveryTask(t *testing.T, host WorkbenchHost) (*Service, *gorm.DB, *model.Task, *model.BillingOrder, string) {
	t.Helper()
	const providerID = "provider-accepted-1"
	svc, db := newTimelineTaskTestService(t)
	svc.dataDir = t.TempDir()
	svc.coordinator = platform.NewCoordinatorWithRedis(nil, "workbench-recovery-fixture")
	svc.activeCancels = make(map[string]context.CancelFunc)
	require.NoError(t, svc.ConfigureWorkbenchHost(host))
	user, err := svc.WorkbenchCurrentUser(WithWorkbenchIdentity(context.Background(), "42"))
	require.NoError(t, err)
	task, err := svc.CreateTask(user.ID, CreateTaskRequest{
		Type: "canvas_video", Operation: "text_to_video", Prompt: "accepted recovery fixture",
		Input: map[string]any{
			"mode": "video", "prompt": "accepted recovery fixture",
			"config": map[string]any{
				"channelId": "newapi-video", "model": "recovery-fixture",
				"size": "16:9", "videoSeconds": "5", "vquality": "480p",
			},
		},
	})
	require.NoError(t, err)
	routeAttempt, err := svc.createDirectTaskAttempt(task)
	require.NoError(t, err)
	require.NoError(t, svc.captureRouteAttemptProviderConfig(routeAttempt))
	routeAttempt.ProviderRequestID = providerID
	routeAttempt.DispatchState = "accepted"
	routeAttempt.Status = "accepted"
	require.NoError(t, svc.repo.SaveRouteAttempt(routeAttempt))
	require.NoError(t, db.Model(&model.Task{}).Where("id = ?", task.ID).Updates(map[string]any{
		"provider_request_id": providerID, "poll_stage": "accepted",
	}).Error)
	order, err := svc.repo.BillingOrder(task.BillingOrderID)
	require.NoError(t, err)
	require.NoError(t, db.Model(&model.BillingOrder{}).Where("id = ?", order.ID).Updates(map[string]any{
		"status": model.BillingStatusUncertain, "provider_request_id": providerID,
		"reserved_amount_microcredits": 975_000,
	}).Error)
	order, err = svc.repo.BillingOrder(order.ID)
	require.NoError(t, err)
	task, err = svc.repo.Task(task.ID)
	require.NoError(t, err)
	return svc, db, task, order, providerID
}

func TestWorkbenchSettledBillingMirrorPollsWithoutReturningToRunning(t *testing.T) {
	host := &workbenchVideoTestHost{testWorkbenchHost: testWorkbenchHost{
		actor: WorkbenchHostUser{ID: "42"},
		models: []WorkbenchHostModel{{
			Key: "recovery-fixture", Name: "Recovery fixture", Capability: "video", Protocol: "newapi",
		}},
		bill: WorkbenchHostBilling{
			ProviderRequestID: "provider-accepted-1", Final: true, ChargedMicrocredits: 975_000,
		},
	}}
	svc, db, _, order, _ := seedWorkbenchAcceptedRecoveryTask(t, host)
	require.NoError(t, db.Model(&model.BillingOrder{}).Where("id = ?", order.ID).Updates(map[string]any{
		"status": model.BillingStatusSettled, "reserved_amount_microcredits": 0,
		"actual_amount_microcredits": 975_000,
	}).Error)
	claimed, err := svc.repo.ClaimNextTask("settled-read-worker", time.Minute)
	require.NoError(t, err)
	require.NotNil(t, claimed)
	probe := &workbenchVideoExecutionProbe{Service: svc}
	svc.taskRouteExecutor = &taskRouteExecutor{port: probe}
	_ = svc.taskWorker().processClaimedTask(claimed, nil)
	assert.Equal(t, 1, probe.calls)
	assert.Equal(t, model.BillingStatusSettled, probe.orderStatus)
}

func TestWorkbenchRecoveryLeaseLossCannotPollOrRecreate(t *testing.T) {
	videoHost := &workbenchVideoTestHost{testWorkbenchHost: testWorkbenchHost{
		actor: WorkbenchHostUser{ID: "42"},
		models: []WorkbenchHostModel{{
			Key: "recovery-fixture", Name: "Recovery fixture", Capability: "video", Protocol: "newapi",
		}},
		bill: WorkbenchHostBilling{
			ProviderRequestID: "provider-accepted-1", ReservedMicrocredits: 975_000,
		},
	}}
	leaseStolen := false
	host := &workbenchRecoveryBillingHost{workbenchVideoTestHost: videoHost}
	svc, db, task, _, providerID := seedWorkbenchAcceptedRecoveryTask(t, host)
	host.billing = func() {
		leaseStolen = true
		require.NoError(t, db.Model(&model.Task{}).Where("id = ?", task.ID).
			Update("lease_owner", "new-worker").Error)
	}
	claimed, err := svc.repo.ClaimNextTask("old-worker", time.Minute)
	require.NoError(t, err)
	require.NotNil(t, claimed)
	require.Equal(t, providerID, claimed.ProviderRequestID)
	probe := &workbenchVideoExecutionProbe{Service: svc}
	svc.taskRouteExecutor = &taskRouteExecutor{port: probe}
	err = svc.taskWorker().processClaimedTask(claimed, nil)
	require.Error(t, err)
	assert.True(t, leaseStolen)
	assert.Zero(t, probe.calls)
	stored, readErr := svc.repo.BillingOrder(claimed.BillingOrderID)
	require.NoError(t, readErr)
	assert.Equal(t, model.BillingStatusUncertain, stored.Status)
}

func TestWorkbenchRecoveryMissingReceiptDefersWithoutFailureOrCreate(t *testing.T) {
	host := &workbenchMissingReceiptHost{testWorkbenchHost: testWorkbenchHost{
		actor: WorkbenchHostUser{ID: "42"},
		models: []WorkbenchHostModel{{
			Key: "recovery-fixture", Name: "Recovery fixture", Capability: "video", Protocol: "newapi",
		}},
	}}
	svc, db, task, order, _ := seedWorkbenchAcceptedRecoveryTask(t, host)
	claimed, err := svc.repo.ClaimNextTask("receipt-retry-worker", time.Minute)
	require.NoError(t, err)
	require.NotNil(t, claimed)
	probe := &workbenchVideoExecutionProbe{Service: svc}
	svc.taskRouteExecutor = &taskRouteExecutor{port: probe}
	require.NoError(t, svc.taskWorker().processClaimedTask(claimed, nil))
	assert.Zero(t, probe.calls)
	storedTask, err := svc.repo.Task(task.ID)
	require.NoError(t, err)
	assert.Equal(t, model.TaskStatusRunning, storedTask.Status)
	assert.Empty(t, storedTask.LeaseOwner)
	require.NotNil(t, storedTask.NextPollAt)
	assert.Equal(t, "计费回执暂不可用", storedTask.Stage)
	storedOrder, err := svc.repo.BillingOrder(order.ID)
	require.NoError(t, err)
	assert.Equal(t, model.BillingStatusUncertain, storedOrder.Status)
	var ledgerCount int64
	require.NoError(t, db.Model(&model.CreditLedgerEntry{}).Count(&ledgerCount).Error)
	assert.Zero(t, ledgerCount)
}

func TestWorkbenchFailedTaskControlledRecoveryPollsOriginalProviderID(t *testing.T) {
	t.Setenv("CANVAS_ALLOW_PRIVATE_UPSTREAMS", "true")
	videoFixture, err := os.ReadFile("../../../../web/public/studio-presets/videos/camera-static.mp4")
	require.NoError(t, err)
	mediaServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/recovered.mp4", r.URL.Path)
		w.Header().Set("Content-Type", "video/mp4")
		_, _ = w.Write(videoFixture)
	}))
	defer mediaServer.Close()

	posts, polls := 0, 0
	host := &workbenchVideoTestHost{testWorkbenchHost: testWorkbenchHost{
		actor: WorkbenchHostUser{ID: "42"},
		models: []WorkbenchHostModel{{
			Key: "recovery-fixture", Name: "Recovery fixture", Capability: "video", Protocol: "newapi",
		}},
		bill: WorkbenchHostBilling{
			ProviderRequestID: "provider-accepted-1", ReservedMicrocredits: 975_000,
		},
	}}
	svc, db, task, order, providerID := seedWorkbenchAcceptedRecoveryTask(t, host)
	host.bill = WorkbenchHostBilling{
		ProviderRequestID: providerID, Final: true, ChargedMicrocredits: 975_000,
	}
	require.NoError(t, db.Model(&model.BillingOrder{}).Where("id = ?", order.ID).Updates(map[string]any{
		"status": model.BillingStatusSettled, "reserved_amount_microcredits": 0,
		"actual_amount_microcredits": 975_000,
	}).Error)
	host.relay = func(call WorkbenchRelay) (*http.Response, error) {
		if call.Request.Method == http.MethodPost {
			posts++
			return nil, errors.New("controlled recovery must never repeat create")
		}
		polls++
		require.Equal(t, "/v1/videos/"+providerID, call.Request.URL.Path)
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body: io.NopCloser(strings.NewReader(fmt.Sprintf(
				`{"id":%q,"status":"completed","url":%q}`,
				providerID, mediaServer.URL+"/recovered.mp4",
			))),
		}, nil
	}
	require.NoError(t, db.Model(&model.Task{}).Where("id = ?", task.ID).Updates(map[string]any{
		"status": model.TaskStatusFailed, "stage": "任务失败",
		"error":       "legacy recovery path incorrectly marked failed",
		"lease_owner": "", "lease_expires_at": nil,
	}).Error)

	result, err := svc.QueryFailedVideoTask(context.Background(), "newapi:42", task.ID)
	require.NoError(t, err)
	require.NotNil(t, result)
	assert.True(t, result.Recovered)
	assert.True(t, result.BillingSettled)
	assert.Equal(t, "succeeded", result.ProviderStatus)
	assert.Zero(t, posts, "controlled recovery must not create a replacement task")
	assert.Equal(t, 1, polls)

	storedTask, err := svc.repo.Task(task.ID)
	require.NoError(t, err)
	assert.Equal(t, model.TaskStatusSucceeded, storedTask.Status)
	assert.Equal(t, providerID, storedTask.ProviderRequestID)
	assert.Contains(t, storedTask.ResultJSON, `"mode":"video"`)
	storedOrder, err := svc.repo.BillingOrder(order.ID)
	require.NoError(t, err)
	assert.Equal(t, model.BillingStatusSettled, storedOrder.Status)
	assert.EqualValues(t, 975_000, storedOrder.ActualAmountMicrocredits)
	assert.Zero(t, storedOrder.ReservedAmountMicrocredits)
	assert.Equal(t, providerID, storedOrder.ProviderRequestID)
	var ledgerCount int64
	require.NoError(t, db.Model(&model.CreditLedgerEntry{}).Count(&ledgerCount).Error)
	assert.Zero(t, ledgerCount)
}

func TestWorkbenchUnsentReceiptRefundRequiresNoSubmissionEvidence(t *testing.T) {
	for _, scenario := range []string{"not_sent", "submission_unknown"} {
		t.Run(scenario, func(t *testing.T) {
			svc, db := newTimelineTaskTestService(t)
			host := &workbenchMissingReceiptHost{testWorkbenchHost{
				actor: WorkbenchHostUser{ID: "42"},
				models: []WorkbenchHostModel{{
					Key: "unsent-text", Name: "Unsent text", Capability: "text", Protocol: "chat-completion",
				}},
			}}
			require.NoError(t, svc.ConfigureWorkbenchHost(host))
			user, err := svc.WorkbenchCurrentUser(WithWorkbenchIdentity(context.Background(), "42"))
			require.NoError(t, err)
			task, err := svc.CreateTask(user.ID, CreateTaskRequest{
				Type: "canvas_text", Operation: "text", Prompt: "unsent fixture",
				Input: map[string]any{"mode": "text", "prompt": "unsent fixture", "config": map[string]any{"channelId": "newapi-text", "model": "unsent-text"}},
			})
			require.NoError(t, err)
			dispatch := model.RouteAttempt{ID: "attempt-" + scenario, TaskID: task.ID, DispatchState: scenario, Status: "selected"}
			require.NoError(t, db.Create(&dispatch).Error)

			err = svc.taskBilling().RefundUnsentBilling(task.BillingOrderID, task.ID, "request not sent")
			order, readErr := svc.repo.BillingOrder(task.BillingOrderID)
			require.NoError(t, readErr)
			if scenario == "submission_unknown" {
				require.ErrorIs(t, err, repository.ErrNewAPIBillingSubmissionUncertain)
				assert.Equal(t, model.BillingStatusUncertain, order.Status)
			} else {
				require.NoError(t, err)
				assert.Equal(t, model.BillingStatusRefunded, order.Status)
			}
			var accounts, entries int64
			require.NoError(t, db.Model(&model.CreditAccount{}).Count(&accounts).Error)
			require.NoError(t, db.Model(&model.CreditLedgerEntry{}).Count(&entries).Error)
			assert.Zero(t, accounts)
			assert.Zero(t, entries)
		})
	}
}

func TestWorkbenchRejectsBillingReceiptOwnedByAnotherTask(t *testing.T) {
	svc, db := newTimelineTaskTestService(t)
	host := &workbenchReceiptMismatchHost{testWorkbenchHost{actor: WorkbenchHostUser{ID: "42"}}}
	require.NoError(t, svc.ConfigureWorkbenchHost(host))
	order := model.BillingOrder{
		ID: "receipt-mismatch", UserID: "newapi:42", TaskID: "owned-task",
		IdempotencyKey: "newapi:owned-task:1:fixture", BillingMode: model.BillingModeNewAPI,
		BillingSource: model.BillingSourceNewAPI, Status: model.BillingStatusReserved,
	}
	require.NoError(t, db.Create(&order).Error)

	coordinator := &workbenchBillingRepository{Repository: svc.repo, svc: svc}
	err := coordinator.sync(order.ID, "owned-task", false)
	require.Error(t, err)
	stored, readErr := svc.repo.BillingOrder(order.ID)
	require.NoError(t, readErr)
	assert.Equal(t, model.BillingStatusReserved, stored.Status)
	assert.Zero(t, stored.ActualAmountMicrocredits)
}

func TestWorkbenchMirrorsNewAPISettlementWithoutLocalDeduction(t *testing.T) {
	svc, db := newTimelineTaskTestService(t)
	host := &testWorkbenchHost{
		actor: WorkbenchHostUser{ID: "42"},
		bill:  WorkbenchHostBilling{Final: true, ChargedMicrocredits: 640_000},
	}
	require.NoError(t, svc.ConfigureWorkbenchHost(host))
	task := model.Task{
		ID: "settled-host-task", UserID: "newapi:42", Type: "canvas_text",
		Status: model.TaskStatusSucceeded,
	}
	order := model.BillingOrder{
		ID: "settled-host-order", UserID: task.UserID, TaskID: task.ID,
		IdempotencyKey: "newapi:settled-host-task:1:fixture",
		BillingMode:    model.BillingModeNewAPI, BillingSource: model.BillingSourceNewAPI,
		Status: model.BillingStatusReserved,
	}
	require.NoError(t, db.Create(&task).Error)
	require.NoError(t, db.Create(&order).Error)

	coordinator := &workbenchBillingRepository{Repository: svc.repo, svc: svc}
	require.NoError(t, coordinator.sync(order.ID, "", false))
	stored, err := svc.repo.BillingOrder(order.ID)
	require.NoError(t, err)
	assert.Equal(t, model.BillingStatusSettled, stored.Status)
	assert.EqualValues(t, 640_000, stored.ActualAmountMicrocredits)
	var mirrored model.Task
	require.NoError(t, db.First(&mirrored, "id = ?", task.ID).Error)
	assert.EqualValues(t, 640_000, mirrored.AuthorizedChargeMicrocredits)
	var ledgerCount int64
	require.NoError(t, db.Model(&model.CreditLedgerEntry{}).Count(&ledgerCount).Error)
	assert.Zero(t, ledgerCount, "settlement mirror must not create a local ledger entry")
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

func TestWorkbenchProxyMirrorsNewAPIRejectionWithoutLocalDeduction(t *testing.T) {
	svc, db := newTimelineTaskTestService(t)
	host := &workbenchVideoTestHost{testWorkbenchHost: testWorkbenchHost{
		actor: WorkbenchHostUser{ID: "42"},
		models: []WorkbenchHostModel{{
			Key: "proxy-text", Name: "Proxy text", Capability: "text",
			Protocol: "chat-completion",
		}},
		bill: WorkbenchHostBilling{Final: true},
	}}
	relayCalls := 0
	host.relay = func(WorkbenchRelay) (*http.Response, error) {
		relayCalls++
		return &http.Response{
			StatusCode: http.StatusForbidden,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(`{"error":{"message":"insufficient quota"}}`)),
		}, nil
	}
	require.NoError(t, svc.ConfigureWorkbenchHost(host))

	response, err := svc.WorkbenchProxy(
		context.Background(), "newapi:42", "newapi-text", "proxy-text",
		"/chat/completions", "rejected-proxy",
		[]byte(`{"model":"ignored","messages":[{"role":"user","content":"hi"}]}`),
	)
	require.NoError(t, err)
	assert.Equal(t, http.StatusForbidden, response.StatusCode)
	var task model.Task
	require.NoError(t, db.Where("user_id = ? AND operation = ?", "newapi:42", "host_proxy").Order("created_at desc").First(&task).Error)
	order, err := svc.repo.BillingOrder(task.BillingOrderID)
	require.NoError(t, err)
	assert.Equal(t, model.BillingStatusRefunded, order.Status)
	assert.Zero(t, order.ActualAmountMicrocredits)
	assert.Equal(t, 1, relayCalls)
	var ledgerCount int64
	require.NoError(t, db.Model(&model.CreditLedgerEntry{}).Count(&ledgerCount).Error)
	assert.Zero(t, ledgerCount)
}

func TestWorkbenchProxyPreservesNewAPIAdmissionFailures(t *testing.T) {
	for _, tc := range []struct {
		name   string
		status int
		body   string
	}{
		{"price missing", http.StatusBadRequest, `{"error":{"message":"model price is not configured"}}`},
		{"channel unavailable", http.StatusServiceUnavailable, `{"error":{"message":"no available channel"}}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			svc, db := newTimelineTaskTestService(t)
			host := &workbenchVideoTestHost{testWorkbenchHost: testWorkbenchHost{
				actor: WorkbenchHostUser{ID: "42"},
				models: []WorkbenchHostModel{{
					Key: "admission-text", Name: "Admission text", Capability: "text",
					Protocol: "chat-completion",
				}},
				bill: WorkbenchHostBilling{Final: true},
			}}
			host.relay = func(WorkbenchRelay) (*http.Response, error) {
				return &http.Response{
					StatusCode: tc.status,
					Header:     http.Header{"Content-Type": []string{"application/json"}},
					Body:       io.NopCloser(strings.NewReader(tc.body)),
				}, nil
			}
			require.NoError(t, svc.ConfigureWorkbenchHost(host))
			response, err := svc.WorkbenchProxy(
				context.Background(), "newapi:42", "newapi-text", "admission-text",
				"/chat/completions", "admission-"+strings.ReplaceAll(tc.name, " ", "-"),
				[]byte(`{"model":"ignored","messages":[]}`),
			)
			require.NoError(t, err)
			assert.Equal(t, tc.status, response.StatusCode)
			var task model.Task
			require.NoError(t, db.Where("user_id = ? AND operation = ?", "newapi:42", "host_proxy").Order("created_at desc").First(&task).Error)
			order, err := svc.repo.BillingOrder(task.BillingOrderID)
			require.NoError(t, err)
			assert.Equal(t, model.BillingStatusRefunded, order.Status)
			var ledgerCount int64
			require.NoError(t, db.Model(&model.CreditLedgerEntry{}).Count(&ledgerCount).Error)
			assert.Zero(t, ledgerCount)
		})
	}
}

func TestWorkbenchFreeModelSettlesFromNewAPIReceiptWithoutLocalCharge(t *testing.T) {
	svc, db := newTimelineTaskTestService(t)
	host := &workbenchVideoTestHost{testWorkbenchHost: testWorkbenchHost{
		actor: WorkbenchHostUser{ID: "42"},
		models: []WorkbenchHostModel{{
			Key: "free-text", Name: "Free text", Capability: "text",
			Protocol: "chat-completion", PriceLabel: "免费，由 New API 结算",
		}},
		bill: WorkbenchHostBilling{Final: true},
	}}
	relayCalls := 0
	host.relay = func(WorkbenchRelay) (*http.Response, error) {
		relayCalls++
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(`{"id":"free-receipt","choices":[]}`)),
		}, nil
	}
	require.NoError(t, svc.ConfigureWorkbenchHost(host))

	response, err := svc.WorkbenchProxy(
		context.Background(), "newapi:42", "newapi-text", "free-text",
		"/chat/completions", "free-proxy",
		[]byte(`{"model":"ignored","messages":[{"role":"user","content":"hi"}]}`),
	)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, response.StatusCode)
	replayed, err := svc.WorkbenchProxy(
		context.Background(), "newapi:42", "newapi-text", "free-text",
		"/chat/completions", "free-proxy",
		[]byte(`{"model":"ignored","messages":[{"role":"user","content":"hi"}]}`),
	)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, replayed.StatusCode)
	assert.Equal(t, 1, relayCalls, "idempotent replay must not submit a second New API request")
	var task model.Task
	require.NoError(t, db.Where("user_id = ? AND operation = ?", "newapi:42", "host_proxy").Order("created_at desc").First(&task).Error)
	order, err := svc.repo.BillingOrder(task.BillingOrderID)
	require.NoError(t, err)
	assert.Equal(t, model.BillingStatusSettled, order.Status)
	assert.Zero(t, order.ActualAmountMicrocredits)
	var ledgerCount int64
	require.NoError(t, db.Model(&model.CreditLedgerEntry{}).Count(&ledgerCount).Error)
	assert.Zero(t, ledgerCount)
}

func TestWorkbenchRejectsMissingOrNegativeHostAuthorizationBeforeLocalBilling(t *testing.T) {
	for _, tc := range []struct {
		name   string
		models []WorkbenchHostModel
	}{
		{name: "model unavailable"},
		{name: "negative authorization", models: []WorkbenchHostModel{{
			Key: "negative-text", Name: "Negative", Capability: "text",
			Protocol: "chat-completion", SpendingCapMicrocredits: -1,
		}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			svc, db := newTimelineTaskTestService(t)
			host := &testWorkbenchHost{actor: WorkbenchHostUser{ID: "42"}, models: tc.models}
			require.NoError(t, svc.ConfigureWorkbenchHost(host))
			modelKey := "missing-text"
			if len(tc.models) == 1 {
				modelKey = tc.models[0].Key
			}
			_, err := svc.WorkbenchProxy(
				context.Background(), "newapi:42", "newapi-text", modelKey,
				"/chat/completions", "invalid-host-"+strings.ReplaceAll(tc.name, " ", "-"),
				[]byte(`{"model":"ignored","messages":[]}`),
			)
			require.Error(t, err)
			var orderCount, ledgerCount int64
			require.NoError(t, db.Model(&model.BillingOrder{}).Count(&orderCount).Error)
			require.NoError(t, db.Model(&model.CreditLedgerEntry{}).Count(&ledgerCount).Error)
			assert.Zero(t, orderCount)
			assert.Zero(t, ledgerCount)
			assert.Zero(t, host.calls)
		})
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
