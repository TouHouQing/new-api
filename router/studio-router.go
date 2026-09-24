package router

import (
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

// SetStudioRouter exposes the existing billed image and video relay to a live
// dashboard session. These two fixed routes never accept an upstream URL from
// the browser or a token supplied by the Studio UI.
func SetStudioRouter(router *gin.Engine) {
	providerAPI := router.Group("/api/studio")
	providerAPI.Use(
		middleware.RouteTag("api"),
		middleware.SystemPerformanceCheck(),
		middleware.UserAuth(),
		studioSessionAuth(),
		middleware.DisableCache(),
	)
	providerAPI.GET("/providers", controller.ListStudioProviderConfigs)
	providerAPI.GET("/attempts", controller.ListStudioAttempts)
	providerAPI.PUT("/providers/:kind", middleware.CriticalRateLimit(), controller.PutStudioProvider)
	providerAPI.DELETE("/providers/:kind", middleware.CriticalRateLimit(), controller.DeleteStudioProvider)
	providerAPI.GET("/providers/:kind/models", middleware.UserCriticalRateLimit("studio-provider"), controller.StudioProviderModels)
	providerAPI.POST("/providers/:kind/generate", middleware.UserCriticalRateLimit("studio-provider"), controller.StudioProviderGenerate)

	studio := router.Group("/pg/studio")
	studio.Use(
		middleware.RouteTag("relay"),
		middleware.SystemPerformanceCheck(),
		middleware.UserAuth(),
		middleware.StudioAttemptAudit(),
		studioSessionAuth(),
	)
	studio.POST(
		"/images/generations",
		studioCanonicalPath("/v1/images/generations"),
		middleware.ModelRequestRateLimit(),
		middleware.PinTaskPluginEndpoint(),
		middleware.PrepareTaskPluginEndpoint(),
		middleware.Distribute(),
		func(c *gin.Context) {
			controller.RelayTaskPluginEndpoint(c, func(c *gin.Context) {
				controller.Relay(c, types.RelayFormatOpenAIImage)
			})
		},
	)
	studio.POST(
		"/videos",
		studioCanonicalPath("/v1/videos"),
		middleware.PinTaskPluginEndpoint(),
		middleware.TaskPluginEndpointOnly(middleware.ModelRequestRateLimit()),
		middleware.PrepareTaskPluginEndpoint(),
		middleware.Distribute(),
		func(c *gin.Context) {
			controller.RelayTaskPluginEndpoint(c, controller.RelayTask)
		},
	)
}

func studioSessionAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		if _, ok := middleware.GetSessionAuthIdentity(c); !ok {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": gin.H{"code": "studio_session_required", "message": "Studio requires a browser session"},
			})
			return
		}
		userID := c.GetInt("id")
		group := c.GetString("group")
		if userID <= 0 || group == "" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": gin.H{"code": "studio_user_invalid", "message": "Studio user is unavailable"},
			})
			return
		}
		selectedGroup := group
		requested := strings.TrimSpace(c.GetHeader("X-Studio-Group"))
		query := c.Request.URL.Query()
		if values, present := query["studio_group"]; present {
			if len(values) != 1 || values[0] == "" {
				c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
					"error": gin.H{"code": "studio_group_invalid", "message": "Studio group is invalid"},
				})
				return
			}
			requested = values[0]
			query.Del("studio_group")
			c.Request.URL.RawQuery = query.Encode()
		}
		if requested != "" {
			if !service.IsUserSelectableGroup(group, requested) {
				c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
					"error": gin.H{"code": "studio_group_forbidden", "message": "Studio group is unavailable to this account"},
				})
				return
			}
			selectedGroup = requested
		}
		common.SetContextKey(c, constant.ContextKeyUsingGroup, selectedGroup)
		token := &model.Token{UserId: userID, Name: "studio", Group: selectedGroup}
		if err := middleware.SetupContextForToken(c, token); err != nil {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": gin.H{"code": "studio_user_invalid", "message": "Studio user is unavailable"},
			})
			return
		}
		c.Set("studio_session_relay", true)
		c.Next()
	}
}

func studioCanonicalPath(path string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Request.URL.Path = path
		c.Request.URL.RawPath = ""
		c.Next()
	}
}
