package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"yingce/backend/internal/service"
)

func registerProjectTimelineRoutes(r *gin.RouterGroup, svc *service.Service) {
	registerProjectCutRoutes(r, svc)
	registerProjectGraphicRoutes(r, svc)
	registerTimelineEditRoutes(r, svc)
	r.GET("/projects/:id/timeline", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		result, err := svc.GetProjectTimeline(user.ID, c.Param("id"))
		if err != nil {
			if service.IsProjectNotFound(err) {
				fail(c, http.StatusNotFound, err)
			} else {
				failService(c, err)
			}
			return
		}
		ok(c, result)
	})
	r.PUT("/projects/:id/timeline", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, (8<<20)+(64<<10))
		var req service.SaveProjectTimelineRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		result, err := svc.SaveProjectTimeline(user.ID, c.Param("id"), req)
		if err != nil {
			if service.IsProjectNotFound(err) {
				fail(c, http.StatusNotFound, err)
			} else {
				failService(c, err)
			}
			return
		}
		ok(c, result)
	})
}
