package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestListStudioAttemptsOnlyReturnsOwnerRecords(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previousDB := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.StudioAttempt{}))
	model.DB = db
	t.Cleanup(func() { model.DB = previousDB })
	require.NoError(t, model.CreateStudioAttempt(&model.StudioAttempt{ID: "owner", UserID: 12, Model: "video", Stage: "submitted", TaskID: "task-1"}))
	require.NoError(t, model.CreateStudioAttempt(&model.StudioAttempt{ID: "other", UserID: 13, Model: "private", Stage: "submitted"}))

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodGet, "/api/studio/attempts", nil)
	context.Set("id", 12)
	ListStudioAttempts(context)
	var payload struct {
		Success bool                  `json:"success"`
		Data    []model.StudioAttempt `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &payload))
	assert.True(t, payload.Success)
	require.Len(t, payload.Data, 1)
	assert.Equal(t, "owner", payload.Data[0].ID)
	assert.Equal(t, "task-1", payload.Data[0].TaskID)
}

func TestGetStudioAttemptByRequestOnlyReturnsOwnerRecord(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previousDB := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.StudioAttempt{}))
	model.DB = db
	t.Cleanup(func() { model.DB = previousDB })
	requestID := "e0fb443a-bd8c-4ca1-9654-2f64a0fa7833"
	require.NoError(t, model.CreateStudioAttempt(&model.StudioAttempt{
		ID: "owner", UserID: 12, ClientRequestID: &requestID, Stage: "submitted", TaskID: "task-1",
	}))

	engine := gin.New()
	engine.GET("/api/studio/attempts/by-request/:request_id", func(c *gin.Context) {
		c.Set("id", 12)
		c.Next()
	}, GetStudioAttemptByRequest)
	owned := httptest.NewRecorder()
	engine.ServeHTTP(owned, httptest.NewRequest(http.MethodGet, "/api/studio/attempts/by-request/"+requestID, nil))
	require.Equal(t, http.StatusOK, owned.Code)
	assert.Contains(t, owned.Body.String(), "task-1")
	assert.Equal(t, "private, no-store", owned.Header().Get("Cache-Control"))

	otherEngine := gin.New()
	otherEngine.GET("/api/studio/attempts/by-request/:request_id", func(c *gin.Context) {
		c.Set("id", 13)
		c.Next()
	}, GetStudioAttemptByRequest)
	other := httptest.NewRecorder()
	otherEngine.ServeHTTP(other, httptest.NewRequest(http.MethodGet, "/api/studio/attempts/by-request/"+requestID, nil))
	assert.Equal(t, http.StatusNotFound, other.Code)
	assert.NotContains(t, other.Body.String(), "task-1")
}
