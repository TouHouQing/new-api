package router

import (
	"embed"
	"net/http"
	"path"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-contrib/gzip"
	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
)

// WebAssets holds the embedded dashboard frontend assets.
type WebAssets struct {
	BuildFS   embed.FS
	IndexPage []byte
}

func SetWebRouter(router *gin.Engine, assets WebAssets, pluginDispatcher gin.HandlerFunc) {
	frontendFS := common.EmbedFolder(assets.BuildFS, "web/dist")

	router.NoRoute(
		pluginDispatcher,
		middleware.RouteTag("web"),
		gzip.Gzip(gzip.DefaultCompression),
		middleware.AccessTokenAudit(),
		serveCachedWebAsset(frontendFS),
		middleware.GlobalWebRateLimit(),
		middleware.Cache(),
		static.Serve("/", frontendFS),
		func(c *gin.Context) {
			if strings.HasPrefix(c.Request.RequestURI, "/v1") || strings.HasPrefix(c.Request.RequestURI, "/api") || strings.HasPrefix(c.Request.RequestURI, "/assets") {
				controller.RelayNotFound(c)
				return
			}
			c.Header("Cache-Control", "no-cache")
			c.Data(http.StatusOK, "text/html; charset=utf-8", assets.IndexPage)
		},
	)
}

// A page loads many compiled chunks. Counting those public files as additional
// page visits can prevent collaborators behind one IP from loading the editor.
// Only existing non-HTML files served by the embedded filesystem take this path.
func serveCachedWebAsset(frontendFS static.ServeFileSystem) gin.HandlerFunc {
	serve := static.Serve("/", frontendFS)
	return func(c *gin.Context) {
		extension := path.Ext(c.Request.URL.Path)
		if (c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead) || extension == "" || strings.EqualFold(extension, ".html") {
			return
		}
		if frontendFS.Exists("/", c.Request.URL.Path) {
			c.Header("Cache-Control", "max-age=604800")
			serve(c)
		}
	}
}
