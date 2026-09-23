package router

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestStudioRoutesRequireDashboardAuthentication(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	SetStudioRouter(engine)

	for _, path := range []string{
		"/pg/studio/images/generations",
		"/pg/studio/videos",
	} {
		t.Run(path, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{"model":"MiniMax-H3","prompt":"test"}`))
			request.Header.Set("Content-Type", "application/json")
			recorder := httptest.NewRecorder()
			engine.ServeHTTP(recorder, request)
			assert.Equal(t, http.StatusUnauthorized, recorder.Code)
		})
	}

	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/pg/studio/arbitrary", nil))
	require.Equal(t, http.StatusNotFound, recorder.Code)
}

func TestStudioCanonicalPathIsFixedByRoute(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.POST("/pg/studio/videos", studioCanonicalPath("/v1/videos"), func(c *gin.Context) {
		c.String(http.StatusOK, c.Request.URL.Path)
	})

	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/pg/studio/videos", nil))
	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Equal(t, "/v1/videos", recorder.Body.String())
}

func TestStudioSessionUsesItsOwnerAndRejectsPAT(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previousDB := model.DB
	previousLogDB := model.LOG_DB
	previousRedis := common.RedisEnabled
	previousSecret := common.SessionSecret
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.UserSession{}, &model.AuditLog{}))
	model.DB = db
	model.LOG_DB = db
	common.RedisEnabled = false
	common.SessionSecret = "studio-route-test-secret"
	t.Cleanup(func() {
		model.DB = previousDB
		model.LOG_DB = previousLogDB
		common.RedisEnabled = previousRedis
		common.SessionSecret = previousSecret
	})

	pat := "studio-test-pat"
	user := &model.User{
		Username: "studio-test-user", Password: "unused", Role: common.RoleCommonUser,
		Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1,
		AccessToken: &pat,
	}
	require.NoError(t, db.Create(user).Error)
	session, err := service.CreateLoginSession(user.Id, "password", "127.0.0.1", "test")
	require.NoError(t, err)

	engine := gin.New()
	engine.POST("/studio-auth", middleware.UserAuth(), studioSessionAuth(), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"user_id":  c.GetInt("id"),
			"group":    c.GetString("group"),
			"funded":   c.GetBool("studio_session_relay"),
			"token_id": c.GetInt("token_id"),
		})
	})

	request := httptest.NewRequest(http.MethodPost, "/studio-auth", nil)
	request.Header.Set("Authorization", "Bearer "+session.AccessToken)
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, request)
	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	var body map[string]any
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &body))
	assert.EqualValues(t, user.Id, body["user_id"])
	assert.Equal(t, "default", body["group"])
	assert.Equal(t, true, body["funded"])
	assert.EqualValues(t, 0, body["token_id"])

	patRequest := httptest.NewRequest(http.MethodPost, "/studio-auth", nil)
	patRequest.Header.Set("Authorization", "Bearer "+pat)
	patRecorder := httptest.NewRecorder()
	engine.ServeHTTP(patRecorder, patRequest)
	assert.Equal(t, http.StatusForbidden, patRecorder.Code)
}
