package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestStudioStorageOutageReturnsRetryableServiceStatus(t *testing.T) {
	response := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(response)
	studioCloudError(ctx, model.ErrStudioStorageUnavailable)
	require.Equal(t, http.StatusServiceUnavailable, response.Code)
	require.Equal(t, "2", response.Header().Get("Retry-After"))
	require.Contains(t, response.Body.String(), `"code":"studio_storage_unavailable"`)
	require.NotContains(t, response.Body.String(), "SQL")
}
