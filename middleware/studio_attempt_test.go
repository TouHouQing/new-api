package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestStudioAttemptAuditRecordsPreTaskFailureWithoutSecrets(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previousDB := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.StudioAttempt{}))
	model.DB = db
	t.Cleanup(func() { model.DB = previousDB })

	engine := gin.New()
	engine.POST("/pg/studio/videos", func(c *gin.Context) {
		c.Set("id", 12)
		common.SetContextKey(c, constant.ContextKeyUsingGroup, "特价sd")
		c.Next()
	}, StudioAttemptAudit(), func(c *gin.Context) {
		common.SetContextKey(c, constant.ContextKeyChannelId, 73)
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
			"code": "upstream_rejected", "message": "Bearer sk-secret-should-not-persist",
		}})
	})
	request := httptest.NewRequest(http.MethodPost, "/pg/studio/videos", strings.NewReader(`{"model":"轮换渠道-会员视频","prompt":"film"}`))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, request)
	require.Equal(t, http.StatusBadRequest, recorder.Code)
	assert.NotEmpty(t, recorder.Header().Get("X-Studio-Attempt-ID"))

	attempts, err := model.ListStudioAttempts(12, 20)
	require.NoError(t, err)
	require.Len(t, attempts, 1)
	assert.Equal(t, "特价sd", attempts[0].Group)
	assert.Equal(t, "轮换渠道-会员视频", attempts[0].Model)
	assert.Equal(t, 73, attempts[0].ChannelID)
	assert.Equal(t, "upstream_rejected", attempts[0].ErrorCode)
	assert.Equal(t, http.StatusBadRequest, attempts[0].HTTPStatus)
	assert.NotContains(t, attempts[0].ErrorCode, "sk-secret")
	other, err := model.ListStudioAttempts(13, 20)
	require.NoError(t, err)
	assert.Empty(t, other)
}

func TestStudioAttemptAuditLinksSuccessfulTask(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previousDB := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.StudioAttempt{}))
	model.DB = db
	t.Cleanup(func() { model.DB = previousDB })

	engine := gin.New()
	engine.POST("/pg/studio/videos", func(c *gin.Context) {
		c.Set("id", 12)
		common.SetContextKey(c, constant.ContextKeyUsingGroup, "default")
		c.Next()
	}, StudioAttemptAudit(), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"id": "task-123", "status": "queued"})
	})
	request := httptest.NewRequest(http.MethodPost, "/pg/studio/videos", strings.NewReader(`{"model":"custom","prompt":"film"}`))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, request)
	require.Equal(t, http.StatusOK, recorder.Code)
	attempts, err := model.ListStudioAttempts(12, 20)
	require.NoError(t, err)
	require.Len(t, attempts, 1)
	assert.Equal(t, "task-123", attempts[0].TaskID)
	assert.Equal(t, "submitted", attempts[0].Stage)
}

func TestStudioAttemptAuditRejectsDuplicateRequestBeforeSecondRelay(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previousDB := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.StudioAttempt{}))
	model.DB = db
	t.Cleanup(func() { model.DB = previousDB })

	called := 0
	engine := gin.New()
	engine.POST("/pg/studio/videos", func(c *gin.Context) {
		c.Set("id", 12)
		c.Next()
	}, StudioAttemptAudit(), func(c *gin.Context) {
		called++
		c.JSON(http.StatusOK, gin.H{"id": "task-123"})
	})
	requestID := "e0fb443a-bd8c-4ca1-9654-2f64a0fa7833"
	submit := func() *httptest.ResponseRecorder {
		request := httptest.NewRequest(http.MethodPost, "/pg/studio/videos", strings.NewReader(`{"model":"video","prompt":"film"}`))
		request.Header.Set("X-Studio-Request-ID", requestID)
		recorder := httptest.NewRecorder()
		engine.ServeHTTP(recorder, request)
		return recorder
	}
	first := submit()
	require.Equal(t, http.StatusOK, first.Code)
	second := submit()
	require.Equal(t, http.StatusConflict, second.Code)
	assert.Equal(t, 1, called)
	assert.Contains(t, second.Body.String(), "studio_submission_exists")
	assert.Contains(t, second.Body.String(), "task-123")
	assert.Equal(t, first.Header().Get("X-Studio-Attempt-ID"), second.Header().Get("X-Studio-Attempt-ID"))
	attempts, err := model.ListStudioAttempts(12, 20)
	require.NoError(t, err)
	require.Len(t, attempts, 1)
	assert.Equal(t, requestID, *attempts[0].ClientRequestID)
}

func TestStudioAttemptAuditKeepsUncertainSubmissionSingleUse(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previousDB := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.StudioAttempt{}))
	model.DB = db
	t.Cleanup(func() { model.DB = previousDB })

	requestID := "e0fb443a-bd8c-4ca1-9654-2f64a0fa7833"
	require.NoError(t, model.CreateStudioAttempt(&model.StudioAttempt{
		ID: "prior-attempt", UserID: 12, ClientRequestID: &requestID, Stage: "started",
	}))
	called := false
	engine := gin.New()
	engine.POST("/pg/studio/videos", func(c *gin.Context) {
		c.Set("id", 12)
		c.Next()
	}, StudioAttemptAudit(), func(c *gin.Context) {
		called = true
		c.Status(http.StatusOK)
	})
	request := httptest.NewRequest(http.MethodPost, "/pg/studio/videos", nil)
	request.Header.Set("X-Studio-Request-ID", requestID)
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, request)
	require.Equal(t, http.StatusConflict, recorder.Code)
	assert.False(t, called)
	assert.Contains(t, recorder.Body.String(), `"stage":"started"`)
	assert.Equal(t, "prior-attempt", recorder.Header().Get("X-Studio-Attempt-ID"))
}
