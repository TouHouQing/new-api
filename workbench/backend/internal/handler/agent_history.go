package handler

import (
	"github.com/gin-gonic/gin"
	"net/http"
	"strconv"
	"yingce/backend/internal/service"
)

func registerAgentHistoryRoutes(r *gin.RouterGroup, svc *service.Service) {
	r.GET("/agent/history", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		limit := 20
		if raw, exists := c.GetQuery("limit"); exists {
			limit, err = strconv.Atoi(raw)
			if err != nil {
				fail(c, http.StatusBadRequest, err)
				return
			}
		}
		page, err := svc.CloudAgentHistory(user.ID, service.CloudAgentHistoryRequest{CanvasID: c.Query("canvasId"), Cursor: c.Query("cursor"), Limit: limit})
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, page)
	})
	r.GET("/agent/runs/:id/restore", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		view, err := svc.RestoreCloudAgentRun(user.ID, c.Param("id"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, view)
	})
}
