package router

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestStudioFrontendAssetsRemainAvailableWhenPageLimitIsExhausted(t *testing.T) {
	directory := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(directory, "index.123abc.js"), []byte("actual compiled asset fixture"), 0600))
	require.NoError(t, os.WriteFile(filepath.Join(directory, "index.html"), []byte("page"), 0600))
	router := gin.New()
	pageRequests := 0
	router.NoRoute(serveCachedWebAsset(static.LocalFile(directory, false)), func(c *gin.Context) {
		pageRequests++
		c.Header("Retry-After", "180")
		c.AbortWithStatus(http.StatusTooManyRequests)
	})
	for _, input := range []struct {
		method, path string
		status       int
	}{
		{http.MethodGet, "/studio", 429},
		{http.MethodGet, "/index.123abc.js", 200},
		{http.MethodHead, "/index.123abc.js", 200},
		{http.MethodGet, "/index.html", 429},
		{http.MethodGet, "/missing.js", 429},
		{http.MethodPost, "/index.123abc.js", 429},
		{http.MethodGet, "/api/unknown", 429},
	} {
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest(input.method, input.path, nil))
		require.Equal(t, input.status, response.Code, input.path)
		if input.status == 200 {
			require.Equal(t, "max-age=604800", response.Header().Get("Cache-Control"))
		} else {
			require.Empty(t, response.Header().Get("Cache-Control"), "do not cache a rate-limit refusal")
			require.Equal(t, "180", response.Header().Get("Retry-After"))
		}
	}
	require.Equal(t, 5, pageRequests)
}
