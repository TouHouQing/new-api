package router

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	pluginruntime "github.com/QuantumNous/new-api/pkg/jsplugin"
	taskplugin "github.com/QuantumNous/new-api/relay/channel/task/jsplugin"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"yingce/backend/pkg/integration"
)

func TestWorkbenchInspirationCatalogUsesBundledFilesAndRejectsOtherPaths(t *testing.T) {
	assets := fstest.MapFS{"web/dist/workbench/inspirations/youmind.json": {Data: []byte(`{"entries":[{"id":"example"}]}`)}}
	engine := gin.New()
	engine.GET("/*path", func(c *gin.Context) { serveWorkbenchInspiration(c, assets) })
	for _, test := range []struct {
		path   string
		status int
	}{
		{"/inspirations/youmind", http.StatusOK},
		{"/inspirations/manifest", http.StatusServiceUnavailable},
		{"/inspirations/../../secrets", http.StatusNotFound},
		{"/inspirations/youmind.json", http.StatusNotFound},
	} {
		t.Run(test.path, func(t *testing.T) {
			response := httptest.NewRecorder()
			engine.ServeHTTP(response, httptest.NewRequest(http.MethodGet, test.path, nil))
			require.Equal(t, test.status, response.Code)
			if test.status == http.StatusOK {
				require.JSONEq(t, `{"entries":[{"id":"example"}]}`, response.Body.String())
				require.Contains(t, response.Header().Get("Content-Type"), "application/json")
			}
		})
	}
}

func TestWorkbenchVideoSizeAcceptsCanvasRatiosAndPixelDimensions(t *testing.T) {
	t.Setenv("STUDIO_LOCAL_MODEL_URL", "http://verified-local.invalid")
	t.Setenv("STUDIO_LOCAL_CAPABILITY_MODELS", " wan2.2-ti2v-5b ")
	cache := &workbenchCapabilitiesCache
	cache.Lock()
	base, at, profiles, failure := cache.base, cache.at, cache.profiles, cache.err
	cache.base, cache.at, cache.err = os.Getenv("STUDIO_LOCAL_MODEL_URL"), time.Now(), nil
	cache.profiles = []workbenchLocalProfile{{ModelID: "wan2.2-ti2v-5b", Action: "video", Support: "supported", Readiness: "ready", Constraints: map[string]any{"resolutions": []any{map[string]any{"width": float64(640), "height": float64(384)}, map[string]any{"width": float64(384), "height": float64(640)}, map[string]any{"width": float64(512), "height": float64(512)}}}}}
	cache.Unlock()
	t.Cleanup(func() {
		cache.Lock()
		cache.base, cache.at, cache.profiles, cache.err = base, at, profiles, failure
		cache.Unlock()
	})
	for input, expected := range map[string]string{"16:9": "640x384", "9:16": "384x640", "1:1": "512x512", "640x384": "640x384", "2.35:1": "640x384"} {
		actual, err := workbenchVideoSize(context.Background(), "wan2.2-ti2v-5b", input)
		require.NoError(t, err)
		require.Equal(t, expected, actual)
	}
	for _, invalid := range []string{"0:1", "NaN:1", "1:Inf", "16:9:1", "portrait"} {
		_, err := workbenchVideoSize(context.Background(), "wan2.2-ti2v-5b", invalid)
		require.Error(t, err)
	}
	cache.Lock()
	cache.at, cache.profiles, cache.err = time.Now(), nil, context.DeadlineExceeded
	cache.Unlock()
	for _, name := range []string{"特价seedance-2.0-720p", "MiniMax-H3", "wan3.0"} {
		for _, size := range []string{"16:9", "9:16", "1280x720"} {
			actual, err := workbenchVideoSize(context.Background(), name, size)
			require.NoError(t, err, "external channels must work while the local worker is offline")
			assert.Equal(t, size, actual)
		}
	}
	_, err := workbenchVideoSize(context.Background(), "wan2.2-ti2v-5b", "16:9")
	require.ErrorIs(t, err, context.DeadlineExceeded, "local models still need a verified runtime")
}

func TestWorkbenchQuotaConversionIsReadOnlyDisplayConversion(t *testing.T) {
	quota := int64(2_500_000)
	microcredits, err := workbenchMicrocredits(quota)
	require.NoError(t, err)
	assert.Positive(t, microcredits)
	_, err = workbenchMicrocredits(-1)
	require.Error(t, err)
}

func TestWorkbenchHostBillingReturnsOwnedNewAPIReceipt(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.StudioWorkflowJob{}, &model.StudioWorkflowCharge{}))
	prior := model.DB
	model.DB = db
	t.Cleanup(func() {
		model.DB = prior
		sqlDB, _ := db.DB()
		_ = sqlDB.Close()
	})
	jobID := "wb:task-owned:2"
	require.NoError(t, db.Create(&model.StudioWorkflowJob{
		ID: jobID, RequestID: jobID, UserID: 1, Kind: "workbench",
		BillingSource: model.StudioWorkflowBillingSourceNewAPI, Status: "succeeded",
		Result: model.StudioDocument(`{"providerRequestId":"provider-owned"}`),
	}).Error)
	require.NoError(t, db.Create(&model.StudioWorkflowCharge{
		RequestID: "request-owned", JobID: jobID, UserID: 1,
		Quota: 250_000, Final: true,
	}).Error)

	bill, err := (newAPIWorkbenchHost{}).Billing(context.Background(), "1", "task-owned", 2)
	require.NoError(t, err)
	assert.Equal(t, "newapi", bill.Source)
	assert.Equal(t, "newapi:1", bill.UserID)
	assert.Equal(t, "task-owned", bill.TaskID)
	assert.Equal(t, jobID, bill.ReceiptID)
	assert.Equal(t, "provider-owned", bill.ProviderRequestID)
	assert.True(t, bill.Final)
	assert.False(t, bill.Uncertain)
	assert.Zero(t, bill.ReservedMicrocredits)
	assert.Positive(t, bill.ChargedMicrocredits)

	runningJobID := "wb:task-running:1"
	require.NoError(t, db.Create(&model.StudioWorkflowJob{
		ID: runningJobID, RequestID: runningJobID, UserID: 1, Kind: "workbench",
		BillingSource: model.StudioWorkflowBillingSourceNewAPI, Status: "running",
	}).Error)
	runningBill, err := (newAPIWorkbenchHost{}).Billing(context.Background(), "1", "task-running", 1)
	require.NoError(t, err)
	assert.False(t, runningBill.Final, "a running New API job without a charge row is not final")
	assert.Zero(t, runningBill.ChargedMicrocredits)
	assert.Zero(t, runningBill.ReservedMicrocredits)

	_, err = (newAPIWorkbenchHost{}).Billing(context.Background(), "1", "missing-task", 1)
	require.ErrorIs(t, err, integration.ErrWorkbenchBillingReceiptNotFound)
	assert.Empty(t, workbenchHostProviderRequestID(model.StudioDocument(`{"providerRequestId":42}`)))
}

func TestInternalRelayRestoresServerRequestURIWithoutBypassingAuthentication(t *testing.T) {
	previousRelay, previousCallback := studioPrivateRelay, service.StudioWorkflowRelay
	configureStudioWorkflowRelay()
	t.Cleanup(func() {
		studioPrivateRelay, service.StudioWorkflowRelay = previousRelay, previousCallback
	})
	request, err := http.NewRequest(http.MethodGet, "/v1/videos/task_owned?check=1", nil)
	require.NoError(t, err)
	require.Empty(t, request.RequestURI)
	response := httptest.NewRecorder()
	studioPrivateRelay.ServeHTTP(response, request)
	require.Equal(t, "/v1/videos/task_owned?check=1", request.RequestURI)
	require.Equal(t, http.StatusForbidden, response.Code)
}

func TestWorkbenchDatabaseIsolationRealServerConnections(t *testing.T) {
	for _, test := range []struct {
		name, primary, separate string
		open                    func(string) gorm.Dialector
	}{
		{"mysql", os.Getenv("STUDIO_TEST_MYSQL_DSN"), os.Getenv("WORKBENCH_TEST_MYSQL_DSN"), func(dsn string) gorm.Dialector { return mysql.Open(dsn) }},
		{"postgres", os.Getenv("STUDIO_TEST_POSTGRES_DSN"), os.Getenv("WORKBENCH_TEST_POSTGRES_DSN"), func(dsn string) gorm.Dialector { return postgres.Open(dsn) }},
	} {
		t.Run(test.name, func(t *testing.T) {
			if test.primary == "" || test.separate == "" {
				t.Skip("dedicated databases not configured")
			}
			primary, err := gorm.Open(test.open(test.primary), &gorm.Config{})
			require.NoError(t, err)
			same, err := gorm.Open(test.open(test.primary), &gorm.Config{})
			require.NoError(t, err)
			separate, err := gorm.Open(test.open(test.separate), &gorm.Config{})
			require.NoError(t, err)
			t.Cleanup(func() {
				for _, db := range []*gorm.DB{primary, same, separate} {
					connection, _ := db.DB()
					_ = connection.Close()
				}
			})
			require.Error(t, validateWorkbenchDatabaseIsolation(primary, same))
			require.NoError(t, validateWorkbenchDatabaseIsolation(primary, separate))
		})
	}
}

func TestWorkbenchDatabaseIsolationRejectsSeparateConnectionsToSameFile(t *testing.T) {
	file := filepath.Join(t.TempDir(), "host.db")
	primary, err := gorm.Open(sqlite.Open(file), &gorm.Config{})
	require.NoError(t, err)
	same, err := gorm.Open(sqlite.Open(file), &gorm.Config{})
	require.NoError(t, err)
	other, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "workbench.db")), &gorm.Config{})
	require.NoError(t, err)
	t.Cleanup(func() {
		for _, db := range []*gorm.DB{primary, same, other} {
			connection, _ := db.DB()
			_ = connection.Close()
		}
	})
	require.Error(t, validateWorkbenchDatabaseIsolation(primary, same))
	require.NoError(t, validateWorkbenchDatabaseIsolation(primary, other))
	require.False(t, primary.Migrator().HasTable("schema_migrations"), "validation must not migrate the host database")
}

func TestWorkbenchDatabaseIsolationRejectsHardLinkedFile(t *testing.T) {
	file := filepath.Join(t.TempDir(), "host.db")
	primary, err := gorm.Open(sqlite.Open(file), &gorm.Config{})
	require.NoError(t, err)
	alias := filepath.Join(filepath.Dir(file), "workbench.db")
	require.NoError(t, os.Link(file, alias))
	workbench, err := gorm.Open(sqlite.Open(alias), &gorm.Config{})
	require.NoError(t, err)
	t.Cleanup(func() {
		for _, db := range []*gorm.DB{primary, workbench} {
			connection, _ := db.DB()
			_ = connection.Close()
		}
	})
	require.Error(t, validateWorkbenchDatabaseIsolation(primary, workbench))
	require.False(t, primary.Migrator().HasTable("schema_migrations"))
}

func TestWorkbenchCatalogUsesVerifiedLocalCapabilities(t *testing.T) {
	profiles := []workbenchLocalProfile{{ModelID: "local-video", Action: "video", Support: "supported", Readiness: "ready", Constraints: map[string]any{"maxReferences": float64(1), "maxSeconds": float64(10)}}}
	price := model.Pricing{ModelName: "local-video", SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeOpenAI}}
	require.Equal(t, []string{"video"}, workbenchGenerationCapabilities(price, profiles, true))
	price.ModelName = "offline-local"
	require.Empty(t, workbenchGenerationCapabilities(price, profiles, true))
	price.ModelName = "image-model"
	price.SupportedEndpointTypes = append(price.SupportedEndpointTypes, constant.EndpointTypeImageGeneration)
	require.Equal(t, []string{"image"}, workbenchGenerationCapabilities(price, nil, false))
	price.SupportedEndpointTypes = []constant.EndpointType{constant.EndpointTypeOpenAIResponse}
	require.True(t, workbenchResponsesOnly(price))
	require.Equal(t, []string{"text"}, workbenchGenerationCapabilities(price, nil, false))
	contract, err := workbenchCapabilityContract("local-video", "video", "newapi", profiles, true)
	require.NoError(t, err)
	video := contract["video"].(map[string]any)
	require.Equal(t, []string{"384p"}, video["resolutions"])
	require.Equal(t, false, video["generateAudio"].(map[string]any)["supported"])
	_, err = workbenchCapabilityContract("offline-local", "video", "newapi", profiles, true)
	require.Error(t, err)
}

func TestWorkbenchCatalogRecognizesLegacyVideoSKUsOnOpenAIChannels(t *testing.T) {
	for _, name := range []string{"wan3.0", "xw-wan-3.0-1080p", "wan3.0-video-720p", "sd4-seedance2.0fast-720p", "特价seedance-2.5-720p", "at2-seedance-2.5-480p", "sora-2", "veo3.1", "MiniMax-H3", "TTseadanco2.5-480", "nsfw-2.0-2k", "grok-imagine-video", "grok-imagine-video-1.5"} {
		t.Run(name, func(t *testing.T) {
			price := model.Pricing{ModelName: name, SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeOpenAI}}
			require.Equal(t, []string{"video"}, workbenchGenerationCapabilities(price, nil, false))
			price.SupportedEndpointTypes = []constant.EndpointType{constant.EndpointTypeOpenAIResponse}
			require.Equal(t, []string{"text"}, workbenchGenerationCapabilities(price, nil, false), "explicit Responses endpoint must keep its contract")
			price.SupportedEndpointTypes = []constant.EndpointType{constant.EndpointTypeImageGeneration, constant.EndpointTypeOpenAI}
			require.Equal(t, []string{"image"}, workbenchGenerationCapabilities(price, nil, false), "explicit image endpoint must keep its contract")
			require.Empty(t, workbenchGenerationCapabilities(price, nil, true), "offline local models must stay unavailable")
		})
	}
	for _, name := range []string{"seedream-5.0-lite", "seedream-5.0-flash", "seedream-5.0-pro", "seedream-5.0", "gpt-image-1", "flux.2-klein-4b"} {
		price := model.Pricing{ModelName: name, SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeOpenAI}}
		require.Equal(t, []string{"image"}, workbenchGenerationCapabilities(price, nil, false))
	}
	for _, name := range []string{"qwen3.5:9b", "gpt-4o", "soraya-chat", "klingon-translator", "wan-analysis", "my-video-assistant"} {
		price := model.Pricing{ModelName: name, SupportedEndpointTypes: []constant.EndpointType{constant.EndpointTypeOpenAI}}
		require.Equal(t, []string{"text"}, workbenchGenerationCapabilities(price, nil, false))
	}
}

func TestWorkbenchVideoSKUsUseTheirResolutionAndFixedDuration(t *testing.T) {
	for _, tc := range []struct{ name, resolution string }{
		{"sd4-seedance2.0-1080p", "1080p"}, {"at-seedance-2.0-4k", "4k"},
		{"wan-3.0-720p", "720p"}, {"at2-seedance-2.5-480p", "480p"},
		{"nsfw-2.0-768p", "768p"}, {"TTseadanco2.5-480", "480p"},
		{"nsfw-2.0-2k", "2k"}, {"TTseadanco2.5-720", "720p"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			contract, err := workbenchCapabilityContract(tc.name, "video", "newapi", nil, false)
			require.NoError(t, err)
			video := contract["video"].(map[string]any)
			assert.Equal(t, []string{tc.resolution}, video["resolutions"])
			assert.Equal(t, tc.resolution, video["defaultResolution"])
			assert.Equal(t, 5, video["duration"].(map[string]any)["default"])
		})
	}
	contract, err := workbenchCapabilityContract("特价seedance-2.5-720p", "video", "newapi", nil, false)
	require.NoError(t, err)
	duration := contract["video"].(map[string]any)["duration"].(map[string]any)
	assert.Equal(t, []int{30}, duration["values"])
	assert.Equal(t, 30, duration["default"])
	h3, err := workbenchCapabilityContract("MiniMax-H3", "video", "newapi", nil, false)
	require.NoError(t, err)
	assert.Equal(t, "768p", h3["video"].(map[string]any)["defaultResolution"])
}

func TestWorkbenchVideoRequestPassesGatewayPluginValidation(t *testing.T) {
	source, err := os.ReadFile("../plugins/tasks/sora/plugin.js")
	require.NoError(t, err)
	plugin, err := pluginruntime.NewRegistry().Register(string(source), pluginruntime.Options{})
	require.NoError(t, err)
	for _, tc := range []struct {
		size, seconds string
		valid         bool
	}{
		{"16:9", "5", true}, {"9:16", "30", true}, {"1:1", "5", true},
		{"4:3", "5", true}, {"3:4", "5", true}, {"21:9", "5", true},
		{"1280x720", "5", true}, {"1792x1024", "8", true},
		{"999999x999999", "5", false}, {"16:9", "3601", false},
		{"16:9", "-5", false}, {"16:9", "NaN", false},
	} {
		t.Run(tc.size+"/"+tc.seconds, func(t *testing.T) {
			info := &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: "https://supplier.example", ApiKey: "unused"}, OriginModelName: "sd4-seedance2.0-1080p", TaskRelayInfo: &relaycommon.TaskRelayInfo{PublicTaskID: "task_fixture"}}
			info.UpstreamModelName = info.OriginModelName
			adapter := taskplugin.New(plugin)
			adapter.Init(info)
			ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
			payload := map[string]any{"model": info.OriginModelName, "prompt": "fixture", "seconds": tc.seconds, "size": tc.size, "resolution": "1080p", "images": []any{"https://media.example/ref.png"}, "reference_videos": []any{"https://media.example/ref.mp4"}, "reference_audios": []any{"https://media.example/ref.wav"}}
			encoded, err := common.Marshal(payload)
			require.NoError(t, err)
			ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/videos", strings.NewReader(string(encoded)))
			ctx.Request.Header.Set("Content-Type", "application/json")
			taskErr := adapter.ValidateRequestAndSetAction(ctx, info)
			if !tc.valid {
				require.NotNil(t, taskErr)
				return
			}
			require.Nil(t, taskErr, "a documented THQ ratio must reach the channel")
			_, err = adapter.ExtractUsageFactsValidated(ctx, info)
			require.NoError(t, err)
			reader, err := adapter.BuildRequestBody(ctx, info)
			require.NoError(t, err)
			var upstream map[string]any
			require.NoError(t, common.DecodeJson(reader, &upstream))
			assert.Equal(t, payload, upstream, "keep seconds string, ratio, resolution and all media intact")
			uri, err := adapter.BuildRequestURL(info)
			require.NoError(t, err)
			assert.True(t, strings.HasSuffix(uri, "/v1/videos"))
		})
	}
	created, err := plugin.Engine.Call(context.Background(), "parseSubmitResponse", map[string]any{"requestBody": map[string]any{"size": "16:9"}}, map[string]any{"body": map[string]any{"id": "task_original", "status": "queued"}})
	require.NoError(t, err)
	state := created.(map[string]any)["state"]
	form, err := plugin.Engine.Call(context.Background(), "buildSubmitRequest", map[string]any{
		"baseUrl": "https://supplier.example", "upstreamModel": "wan3.0",
		"requestBody": map[string]any{"prompt": "fixture", "seconds": "5", "duration": 5, "resolution": "720p"},
		"files":       []any{map[string]any{"field": "input_reference", "ref": "request_file:input_reference", "filename": "reference.png"}},
	})
	require.NoError(t, err)
	for _, part := range form.(map[string]any)["parts"].([]any) {
		assert.NotEqual(t, "duration", part.(map[string]any)["name"], "multipart must not duplicate seconds through an alias")
	}
	for _, tc := range []struct {
		state any
		body  map[string]any
		want  string
	}{
		{state, map[string]any{"status": "completed"}, "IN_PROGRESS"},
		{state, map[string]any{"status": "completed", "url": "https://media.example/out.mp4"}, "SUCCESS"},
		{nil, map[string]any{"status": "completed"}, "SUCCESS"},
	} {
		value, err := plugin.Engine.Call(context.Background(), "parseTaskResult", map[string]any{"state": tc.state}, tc.body)
		require.NoError(t, err)
		assert.Equal(t, tc.want, value.(map[string]any)["status"])
	}
}

func TestWorkbenchVideoReceiptProjectsOnlyACompletedMediaURL(t *testing.T) {
	body := []byte(`{"id":"task_owned","status":"completed","custom":"preserved"}`)
	for _, tc := range []struct {
		status model.TaskStatus
		url    string
		want   bool
	}{
		{model.TaskStatusSuccess, "https://cdn.example/video.mp4", true},
		{model.TaskStatusInProgress, "https://cdn.example/video.mp4", false},
		{model.TaskStatusSuccess, "data:video/mp4;base64,private", false},
		{model.TaskStatusSuccess, "https://secret:password@cdn.example/video.mp4", false},
	} {
		receipt := &model.Task{Status: tc.status, PrivateData: model.TaskPrivateData{Key: "never-expose-provider-key", ResultURL: tc.url}}
		result := workbenchVideoReceiptResponse(body, receipt)
		var response map[string]any
		require.NoError(t, common.Unmarshal(result, &response))
		assert.Equal(t, "task_owned", response["id"])
		assert.Equal(t, "preserved", response["custom"])
		assert.NotContains(t, string(result), receipt.PrivateData.Key)
		if tc.want {
			assert.Equal(t, tc.url, response["url"])
		} else {
			assert.NotContains(t, response, "url")
		}
	}
}

func TestWorkbenchH3PreservesRatioAndUsesNativeResolution(t *testing.T) {
	source, err := os.ReadFile("../plugins/tasks/hailuo/plugin.js")
	require.NoError(t, err)
	plugin, err := pluginruntime.NewRegistry().Register(string(source), pluginruntime.Options{})
	require.NoError(t, err)
	decoded, err := plugin.Engine.CallPath(context.Background(), "protocols", []string{"openai_video", "decodeRequest"}, map[string]any{"model": "MiniMax-H3", "body": map[string]any{"kind": "json", "value": map[string]any{"model": "MiniMax-H3", "prompt": "fixture", "size": "9:16", "seconds": "5", "resolution": "768p"}}})
	require.NoError(t, err)
	canonical := decoded.(map[string]any)["requestBody"].(map[string]any)
	assert.Equal(t, "768P", canonical["resolution"], "normalize before plugin usage enum validation")
	value, err := plugin.Engine.Call(context.Background(), "buildSubmitRequest", map[string]any{
		"upstreamModel": "MiniMax-H3", "baseUrl": "https://supplier.example", "apiKey": "unused",
		"requestBody": map[string]any{"prompt": "fixture", "size": "9:16", "seconds": "5", "resolution": "768p"},
	})
	require.NoError(t, err)
	body := value.(map[string]any)["body"].(map[string]any)
	assert.Equal(t, "9:16", body["ratio"])
	assert.Equal(t, "768P", body["resolution"])
	assert.EqualValues(t, 5, body["duration"])
}

func TestWorkbenchTextContextUsesBoundedRuntimeCapabilities(t *testing.T) {
	for _, test := range []struct {
		name   string
		limits map[string]any
		window int
		output int
	}{
		{"verified", map[string]any{"contextWindowTokens": float64(65536), "maxOutputTokens": float64(8192)}, 65536, 8192},
		{"legacy", map[string]any{}, 32768, 8192},
		{"invalid", map[string]any{"contextWindowTokens": float64(1 << 40)}, 32768, 8192},
	} {
		t.Run(test.name, func(t *testing.T) {
			profiles := []workbenchLocalProfile{{ModelID: "local-text", Action: "text", Support: "supported", Readiness: "ready", Constraints: test.limits}}
			contract, err := workbenchCapabilityContract("local-text", "text", "newapi", profiles, true)
			require.NoError(t, err)
			text := contract["text"].(map[string]any)
			require.Equal(t, test.window, text["contextWindowTokens"])
			require.Equal(t, test.output, text["maxOutputTokens"])
		})
	}
}

func TestWorkbenchReadSessionIsLiveReadOnlyAndCannotCreateAPIKeys(t *testing.T) {
	require.NoError(t, i18n.Init())
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.UserSession{}, &model.UserAccessToken{}, &model.AuditLog{}, &model.Token{}))
	priorDB, priorLog, priorRedis, priorSecret, priorSecure := model.DB, model.LOG_DB, common.RedisEnabled, common.SessionSecret, common.SessionCookieSecure
	model.DB, model.LOG_DB, common.RedisEnabled, common.SessionSecret, common.SessionCookieSecure = db, db, false, "workbench-session-regression", true
	t.Cleanup(func() {
		model.DB, model.LOG_DB, common.RedisEnabled, common.SessionSecret, common.SessionCookieSecure = priorDB, priorLog, priorRedis, priorSecret, priorSecure
		sqlDB, _ := db.DB()
		_ = sqlDB.Close()
	})
	pat := model.AccessTokenPrefix + "workbench-pat-fixture"
	user := model.User{Username: "workbench-user", Password: "unused", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1}
	require.NoError(t, db.Create(&user).Error)
	access := model.UserAccessToken{UserId: user.Id, Name: "workbench acceptance", TokenHash: model.AccessTokenFingerprint(pat), TokenHint: "fixture", ExpiresAt: time.Now().Add(time.Hour).Unix()}
	require.NoError(t, access.SetScopes([]string{"workbench:read", "workbench:write"}))
	require.NoError(t, model.CreateUserAccessToken(user.Id, &access, service.AccessTokenMaxPerUser))
	session, err := service.CreateLoginSession(user.Id, "password", "127.0.0.1", "test")
	require.NoError(t, err)
	engine := gin.New()
	SetWorkbenchRouter(engine, WebAssets{})
	request := httptest.NewRequest(http.MethodPost, "https://localhost/api/workbench/host-session", nil)
	request.Header.Set("Authorization", "Bearer "+session.AccessToken)
	request.Header.Set("Origin", "https://localhost")
	response := httptest.NewRecorder()
	engine.ServeHTTP(response, request)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	profileRequest := httptest.NewRequest(http.MethodGet, "https://localhost/api/workbench/host-profile", nil)
	profileRequest.Header.Set("Authorization", "Bearer "+session.AccessToken)
	profileResponse := httptest.NewRecorder()
	engine.ServeHTTP(profileResponse, profileRequest)
	require.Equal(t, http.StatusOK, profileResponse.Code, profileResponse.Body.String())
	assert.Contains(t, profileResponse.Body.String(), `"username":"workbench-user"`)
	assert.Contains(t, profileResponse.Body.String(), `"accountSettingsURL":"/profile"`)
	assert.NotContains(t, profileResponse.Body.String(), pat)
	assert.NotContains(t, profileResponse.Body.String(), `"password"`)
	cookies := response.Result().Cookies()
	require.Len(t, cookies, 1)
	cookie := cookies[0]
	assert.True(t, cookie.HttpOnly)
	assert.True(t, cookie.Secure)
	assert.Equal(t, http.SameSiteStrictMode, cookie.SameSite)
	assert.Equal(t, "/api/workbench", cookie.Path)
	assert.Equal(t, 300, cookie.MaxAge)
	for _, test := range []struct {
		name, method, token, site string
		cookie                    bool
		want                      int
	}{
		{"read session", http.MethodGet, "", "same-origin", true, http.StatusServiceUnavailable},
		{"cookie cannot write", http.MethodPost, "", "same-origin", true, http.StatusUnauthorized},
		{"cross-site read", http.MethodGet, "", "cross-site", true, http.StatusForbidden},
		{"forged identity", http.MethodGet, "", "same-origin", false, http.StatusUnauthorized},
		{"PAT is not a browser session", http.MethodGet, pat, "same-origin", false, http.StatusForbidden},
	} {
		t.Run(test.name, func(t *testing.T) {
			req := httptest.NewRequest(test.method, "https://localhost/api/workbench/auth/session", nil)
			req.Header.Set("Sec-Fetch-Site", test.site)
			req.Header.Set("X-Workbench-User", "1")
			if test.cookie {
				req.AddCookie(cookie)
			}
			if test.token != "" {
				req.Header.Set("Authorization", "Bearer "+test.token)
			}
			out := httptest.NewRecorder()
			engine.ServeHTTP(out, req)
			assert.Equal(t, test.want, out.Code, out.Body.String())
		})
	}
	require.NoError(t, db.Model(&model.UserSession{}).Where("sid = ?", session.Session.SID).Updates(map[string]any{"status": model.UserSessionStatusRevoked, "revoked_at": time.Now().Unix()}).Error)
	revoked := httptest.NewRequest(http.MethodGet, "https://localhost/api/workbench/auth/session", nil)
	revoked.AddCookie(cookie)
	out := httptest.NewRecorder()
	engine.ServeHTTP(out, revoked)
	assert.Equal(t, http.StatusUnauthorized, out.Code)
	var tokens int64
	require.NoError(t, db.Model(&model.Token{}).Count(&tokens).Error)
	assert.Zero(t, tokens, "opening the workbench must not create API credentials")
	agentRequest := httptest.NewRequest(http.MethodGet, "https://localhost/api/workbench-agent/projects", nil)
	agentRequest.Header.Set("Authorization", "Bearer "+pat)
	agentResponse := httptest.NewRecorder()
	engine.ServeHTTP(agentResponse, agentRequest)
	assert.Equal(t, http.StatusServiceUnavailable, agentResponse.Code, "explicit PAT should reach the dedicated agent endpoint")
	for _, tc := range []struct {
		name, method, path string
		scopes             []string
		want               int
	}{
		{"unrelated scope denied", http.MethodGet, "/projects", []string{"profile:read"}, http.StatusForbidden},
		{"read scope can read", http.MethodGet, "/projects", []string{"workbench:read"}, http.StatusServiceUnavailable},
		{"read scope cannot generate", http.MethodPost, "/tasks", []string{"workbench:read"}, http.StatusForbidden},
		{"write scope can submit", http.MethodPost, "/tasks", []string{"workbench:write"}, http.StatusServiceUnavailable},
		{"agent grant cannot administer", http.MethodGet, "/admin/users", []string{"workbench:read", "workbench:write"}, http.StatusForbidden},
	} {
		t.Run(tc.name, func(t *testing.T) {
			require.NoError(t, access.SetScopes(tc.scopes))
			require.NoError(t, db.Model(&access).Update("scopes", access.Scopes).Error)
			req := httptest.NewRequest(tc.method, "https://localhost/api/workbench-agent"+tc.path, nil)
			req.Header.Set("Authorization", "Bearer "+pat)
			response := httptest.NewRecorder()
			engine.ServeHTTP(response, req)
			assert.Equal(t, tc.want, response.Code, response.Body.String())
		})
	}
	require.NoError(t, db.Delete(&access).Error)
	revokedAgent := httptest.NewRecorder()
	engine.ServeHTTP(revokedAgent, agentRequest.Clone(agentRequest.Context()))
	assert.Equal(t, http.StatusUnauthorized, revokedAgent.Code)
}
