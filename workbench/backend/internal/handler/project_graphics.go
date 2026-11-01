package handler

import (
	"errors"
	"github.com/gin-gonic/gin"
	"net/http"
	"time"
	"yingce/backend/internal/service"
)

func registerProjectGraphicRoutes(r *gin.RouterGroup, svc *service.Service) {
	r.POST("/projects/:id/timeline/graphic-preview", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		if !enforceRateLimit(c, "graphic-preview:"+user.ID, 120, time.Minute) {
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 512<<10)
		var request service.GraphicPreviewRequest
		if err := c.ShouldBindJSON(&request); err != nil {
			var limit *http.MaxBytesError
			if errors.As(err, &limit) {
				fail(c, http.StatusRequestEntityTooLarge, err)
				return
			}
			fail(c, http.StatusBadRequest, err)
			return
		}
		result, err := svc.PreviewProjectGraphics(c.Request.Context(), user.ID, c.Param("id"), request)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
}
