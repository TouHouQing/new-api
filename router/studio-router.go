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
	configureStudioWorkflowRelay()
	cloud := router.Group("/api/studio/cloud")
	cloud.Use(middleware.RouteTag("api"), middleware.UserAuth(), middleware.StudioBridgeOriginGuard(), middleware.DisableCache())
	cloud.GET("/projects", controller.ListStudioProjects)
	cloud.GET("/trash", controller.StudioProjectTrash)
	cloud.GET("/capabilities", controller.StudioCloudCapabilities)
	cloud.GET("/project-schema", controller.StudioCloudProjectSchema)
	cloud.GET("/projects/:project_id", controller.ReadStudioProject)
	cloud.PUT("/projects/:project_id", middleware.StudioWriteRateLimit("project"), controller.PutStudioProject)
	cloud.DELETE("/projects/:project_id", controller.DeleteStudioProject)
	cloud.GET("/projects/:project_id/versions", controller.StudioProjectVersions)
	cloud.GET("/projects/:project_id/versions/:revision", controller.ReadStudioProjectVersion)
	cloud.POST("/projects/:project_id/undelete", controller.StudioProjectTrash)
	cloud.POST("/projects/:project_id/restore", controller.RestoreStudioProjectVersion)
	cloud.GET("/projects/:project_id/members", controller.StudioProjectMembers)
	cloud.PUT("/projects/:project_id/members", controller.StudioProjectMembers)
	cloud.DELETE("/projects/:project_id/members", controller.StudioProjectMembers)
	cloud.GET("/projects/:project_id/comments", controller.StudioProjectComments)
	cloud.GET("/projects/:project_id/events", controller.StudioProjectEvents)
	cloud.POST("/projects/:project_id/rework", middleware.StudioWriteRateLimit("project"), controller.StudioProjectRework)
	cloud.POST("/projects/:project_id/dialogue/align", middleware.StudioWriteRateLimit("project"), controller.AlignStudioProjectDialogue)
	cloud.GET("/projects/:project_id/review-shares", controller.StudioProjectReviewShares)
	cloud.POST("/projects/:project_id/review-shares", middleware.StudioWriteRateLimit("project"), controller.StudioProjectReviewShares)
	cloud.DELETE("/projects/:project_id/review-shares/:share_id", controller.StudioProjectReviewShares)
	cloud.POST("/projects/:project_id/review", controller.ReviewStudioProjectTake)
	cloud.POST("/projects/:project_id/takes/archive", controller.ArchiveStudioProjectTake)
	cloud.GET("/projects/:project_id/jobs", controller.StudioProjectJobs)
	cloud.GET("/projects/:project_id/connectors", controller.StudioProjectConnectors)
	cloud.GET("/projects/:project_id/connectors/:connector_id/resources", middleware.StudioWriteRateLimit("connector-read"), controller.StudioProjectConnectors)
	cloud.POST("/projects/:project_id/materialize", controller.MaterializeStudioProject)
	cloud.POST("/projects/:project_id/jobs", middleware.StudioWriteRateLimit("workflow"), controller.StudioProjectJobs)
	cloud.GET("/jobs/:job_id", controller.StudioWorkflowJob)
	cloud.POST("/jobs/:job_id/control", controller.StudioWorkflowJob)
	cloud.POST("/projects/:project_id/comments", controller.StudioProjectComments)
	cloud.PATCH("/projects/:project_id/comments", controller.StudioProjectComments)
	cloud.PUT("/media/:media_id", middleware.StudioWriteRateLimit("media"), controller.StudioProjectMedia)
	cloud.GET("/media/:media_id", controller.StudioProjectMedia)
	cloud.GET("/media/:media_id/probe", controller.StudioProjectMedia)
	publicReview := router.Group("/api/studio/review")
	publicReview.Use(middleware.RouteTag("api"), middleware.GlobalAPIRateLimit(), middleware.DisableCache())
	publicReview.GET("/:share_id", controller.ReadStudioReviewShare)
	publicReview.GET("/:share_id/media/:media_id", controller.ReadStudioReviewShare)
	publicReview.POST("/:share_id/comments", middleware.CriticalRateLimit(), controller.ReadStudioReviewShare)
	bridge := router.Group("/api/studio/bridge")
	bridge.Use(middleware.RouteTag("api"), middleware.SystemPerformanceCheck(), middleware.UserAuth(), middleware.StudioBridgeOriginGuard(), middleware.DisableCache())
	bridge.GET("/sessions", controller.ListStudioBridges)
	bridge.GET("/skill", controller.DownloadStudioAgentSkill)
	bridge.POST("/sessions", controller.OpenStudioBridge)
	bridge.GET("/sessions/:session_id", controller.ReadStudioBridge)
	bridge.PUT("/sessions/:session_id", controller.PublishStudioBridge)
	bridge.DELETE("/sessions/:session_id", controller.CloseStudioBridge)
	bridge.POST("/sessions/:session_id/commands", middleware.StudioWriteRateLimit("bridge-command"), controller.QueueStudioBridgeCommand)
	bridge.GET("/sessions/:session_id/commands/:command_id", controller.ReadStudioBridgeCommand)
	bridge.POST("/sessions/:session_id/commands/:command_id/claim", controller.ClaimStudioBridgeCommand)
	bridge.POST("/sessions/:session_id/commands/:command_id/result", controller.FinishStudioBridgeCommand)
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
	providerAPI.GET("/attempts/by-request/:request_id", controller.GetStudioAttemptByRequest)
	providerAPI.PUT("/providers/:kind", middleware.CriticalRateLimit(), controller.PutStudioProvider)
	providerAPI.DELETE("/providers/:kind", middleware.CriticalRateLimit(), controller.DeleteStudioProvider)
	providerAPI.GET("/providers/:kind/models", middleware.UserCriticalRateLimit("studio-provider"), controller.StudioProviderModels)
	providerAPI.POST("/providers/:kind/generate", middleware.UserCriticalRateLimit("studio-provider"), controller.StudioProviderGenerate)
	providerAPI.POST("/providers/text/storyboard", middleware.UserCriticalRateLimit("studio-provider"), controller.StudioProviderStoryboard)

	studio := router.Group("/pg/studio")
	studio.Use(
		middleware.RouteTag("relay"),
		middleware.SystemPerformanceCheck(),
		middleware.UserAuth(),
		studioSessionAuth(),
		middleware.StudioAttemptAudit(),
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
	studio.POST("/audio/speech", studioCanonicalPath("/v1/audio/speech"), middleware.ModelRequestRateLimit(), middleware.Distribute(), func(c *gin.Context) {
		controller.Relay(c, types.RelayFormatOpenAIAudio)
	})
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
