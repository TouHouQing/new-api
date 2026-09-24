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
