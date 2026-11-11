package router

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestStudioFrontendAssetsRemainAvailableWhenPageLimitIsExhausted(t *testing.T) {
	previousRedis := common.RedisEnabled
	previousWebEnabled, previousWebNum, previousWebDuration := common.GlobalWebRateLimitEnable, common.GlobalWebRateLimitNum, common.GlobalWebRateLimitDuration
	previousStaticEnabled := common.GlobalStaticRateLimitEnable
	t.Cleanup(func() {
		common.RedisEnabled = previousRedis
		common.GlobalWebRateLimitEnable, common.GlobalWebRateLimitNum, common.GlobalWebRateLimitDuration = previousWebEnabled, previousWebNum, previousWebDuration
		common.GlobalStaticRateLimitEnable = previousStaticEnabled
	})
	common.RedisEnabled = false
	common.GlobalWebRateLimitEnable, common.GlobalWebRateLimitNum, common.GlobalWebRateLimitDuration = true, 1, 180
	common.GlobalStaticRateLimitEnable = false
	directory := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(directory, "index.123abc.js"), []byte("actual compiled asset fixture"), 0600))
	require.NoError(t, os.WriteFile(filepath.Join(directory, "index.html"), []byte("page"), 0600))
	router := gin.New()
	pageRequests := 0
	frontendFS := static.LocalFile(directory, false)
	router.NoRoute(middleware.GlobalWebRateLimit(frontendFS), middleware.Cache(), middleware.ServeFrontendFiles(frontendFS), func(c *gin.Context) {
		pageRequests++
		c.Status(http.StatusNoContent)
	})
	for _, input := range []struct {
		method, path string
		status       int
	}{
		{http.MethodGet, "/studio", 204},
		{http.MethodGet, "/studio", 429},
		{http.MethodGet, "/index.123abc.js", 200},
		{http.MethodHead, "/index.123abc.js", 200},
		{http.MethodGet, "/index.html", 301},
		{http.MethodGet, "/missing.js", 429},
		{http.MethodGet, "/api/unknown", 429},
	} {
		response := httptest.NewRecorder()
		request := httptest.NewRequest(input.method, input.path, nil)
		request.RemoteAddr = "192.0.2.185:8181"
		router.ServeHTTP(response, request)
		require.Equal(t, input.status, response.Code, input.path)
		if input.status != http.StatusTooManyRequests {
			require.Equal(t, "max-age=604800", response.Header().Get("Cache-Control"))
		} else {
			require.Empty(t, response.Header().Get("Cache-Control"), "do not cache a rate-limit refusal")
			require.Equal(t, "180", response.Header().Get("Retry-After"))
		}
		if input.method == http.MethodGet && input.status == http.StatusOK {
			require.Equal(t, "actual compiled asset fixture", response.Body.String())
		}
	}
	require.Equal(t, 1, pageRequests)
}
