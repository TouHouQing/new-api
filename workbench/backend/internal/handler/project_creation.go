package handler

import (
	"github.com/gin-gonic/gin"
	"net/http"
	"yingce/backend/internal/service"
)

func registerProjectCreationRoutes(r *gin.RouterGroup, svc *service.Service) {
	r.GET("/projects/:id/story-results/:taskId", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		result, err := svc.ProjectStoryResult(user.ID, c.Param("id"), c.Param("taskId"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
	r.GET("/project-creations/:key", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		project, err := svc.ProjectCreationByKey(user.ID, c.Param("key"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"project": project, "idempotencyKey": c.Param("key")})
	})
	r.GET("/project-starter-presets", func(c *gin.Context) {
		if _, err := currentUser(c, svc); err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"presets": svc.ProjectStarterPresets()})
	})
	r.POST("/project-creations", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 512<<10)
		var req service.CreateProjectRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		if req.IdempotencyKey == "" {
			failService(c, service.BadAuthRequest("创建项目需要稳定的请求编号"))
			return
		}
		project, err := svc.CreateProject(user.ID, req)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"project": project, "idempotencyKey": req.IdempotencyKey})
	})
}
