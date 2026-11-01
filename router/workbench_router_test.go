package router

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestWorkbenchVideoSizeAcceptsCanvasRatiosAndPixelDimensions(t *testing.T) {
	t.Setenv("STUDIO_LOCAL_MODEL_URL", "http://verified-local.invalid")
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
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.UserSession{}, &model.AuditLog{}, &model.Token{}))
	priorDB, priorLog, priorRedis, priorSecret, priorSecure := model.DB, model.LOG_DB, common.RedisEnabled, common.SessionSecret, common.SessionCookieSecure
	model.DB, model.LOG_DB, common.RedisEnabled, common.SessionSecret, common.SessionCookieSecure = db, db, false, "workbench-session-regression", true
	t.Cleanup(func() {
		model.DB, model.LOG_DB, common.RedisEnabled, common.SessionSecret, common.SessionCookieSecure = priorDB, priorLog, priorRedis, priorSecret, priorSecure
		sqlDB, _ := db.DB()
		_ = sqlDB.Close()
	})
	pat := "workbench-pat-fixture"
	user := model.User{Username: "workbench-user", Password: "unused", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1, AccessToken: &pat}
	require.NoError(t, db.Create(&user).Error)
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
		{"PAT is not a browser session", http.MethodGet, pat, "same-origin", false, http.StatusUnauthorized},
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
	require.NoError(t, db.Model(&user).Update("access_token", "revoked-workbench-pat").Error)
	revokedAgent := httptest.NewRecorder()
	engine.ServeHTTP(revokedAgent, agentRequest.Clone(agentRequest.Context()))
	assert.Equal(t, http.StatusUnauthorized, revokedAgent.Code)
}
