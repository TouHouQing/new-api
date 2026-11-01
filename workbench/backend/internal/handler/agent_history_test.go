package handler

import (
	"github.com/gin-gonic/gin"
	"net/http"
	"net/http/httptest"
	"testing"
	"yingce/backend/internal/service"
)

func TestAgentHistoryRoutesRequireLoginBeforeReadingRecords(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	RegisterAgentRoutes(router.Group("/api"), &service.Service{})
	for _, path := range []string{"/api/agent/history?canvasId=owned-canvas", "/api/agent/runs/owned-run/restore"} {
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
		if response.Code != http.StatusUnauthorized {
			t.Fatalf("unauthenticated history status %d", response.Code)
		}
	}
}
