package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"yingce/backend/internal/service"
)

func registerCanvasHistoryRoutes(r *gin.RouterGroup, svc *service.Service) {
	r.GET("/canvas-projects/:id/history", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		result, err := svc.CanvasHistory(user.ID, c.Param("id"))
		if err != nil {
			failService(c, err)
			return
		}
		c.Header("Cache-Control", "private, no-store")
		ok(c, result)
	})
	r.GET("/canvas-projects/:id/history/:snapshotId", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		result, err := svc.CanvasHistorySnapshot(user.ID, c.Param("id"), c.Param("snapshotId"))
		if err != nil {
			failService(c, err)
			return
		}
		c.Header("Cache-Control", "private, no-store")
		ok(c, gin.H{"snapshot": result, "project": json.RawMessage(result.PayloadJSON)})
	})
	r.POST("/canvas-projects/:id/history/:snapshotId/restore", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		policy, available := loadRuntimePolicy(c, svc)
		if !available || !enforceRateLimit(c, "canvas-write:"+user.ID, policy.Request.CanvasWritePerMinute, time.Minute) {
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4096)
		var req struct {
			ExpectedRevision *int64 `json:"expectedRevision"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		result, err := svc.RestoreCanvasHistory(user.ID, c.Param("id"), c.Param("snapshotId"), req.ExpectedRevision)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"project": result})
	})
}
