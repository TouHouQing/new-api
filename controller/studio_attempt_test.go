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
