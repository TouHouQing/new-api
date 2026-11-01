package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"yingce/backend/internal/service"
)

func TestCanvasHistoryRoutesRequireLogin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	registerCanvasHistoryRoutes(router.Group("/api"), &service.Service{})
	for _, test := range []struct{ method, path string }{{"GET", "/api/canvas-projects/owned/history"}, {"GET", "/api/canvas-projects/owned/history/snapshot"}, {"POST", "/api/canvas-projects/owned/history/snapshot/restore"}} {
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest(test.method, test.path, nil))
		if response.Code != http.StatusUnauthorized {
			t.Fatalf("unauthenticated history status %d", response.Code)
		}
	}
}
