package handler

import (
	"fmt"
	"github.com/gin-gonic/gin"
	"net/http"
	"time"
	"yingce/backend/internal/service"
)

func registerCanvasTaskBatchRoutes(r *gin.RouterGroup, svc *service.Service) {
	r.POST("/tasks/canvas-batch", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		policy, available := loadRuntimePolicy(c, svc)
		if !available || !enforceRateLimit(c, "tasks:"+user.ID, policy.Request.TaskCreatePerMinute, time.Minute) {
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4<<20)
		var req service.CreateCanvasTaskBatchRequest
		if err = c.ShouldBindJSON(&req); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		if len(req.Tasks) < 2 || len(req.Tasks) > 15 {
			fail(c, http.StatusBadRequest, fmt.Errorf("生成批次须包含2到15个任务"))
			return
		}
		for index := 1; index < len(req.Tasks); index++ {
			if !enforceRateLimit(c, "tasks:"+user.ID, policy.Request.TaskCreatePerMinute, time.Minute) {
				return
			}
		}
		for index := range req.Tasks {
			req.Tasks[index].TraceID = TraceID(c)
			req.Tasks[index].RequestID = RequestID(c)
		}
		tasks, err := svc.CreateCanvasTaskBatch(user.ID, req)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"tasks": tasks})
	})
}
