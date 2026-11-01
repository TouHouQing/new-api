package handler

import (
	"github.com/gin-gonic/gin"
	"strconv"
	"yingce/backend/internal/service"
)

func registerVideoReworkRoutes(r *gin.RouterGroup, svc *service.Service) {
	r.GET("/projects/:id/video-reworks/history", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		limit, err := strconv.Atoi(c.DefaultQuery("limit", "10"))
		if err != nil {
			failService(c, service.BadAuthRequest("修复历史分页参数无效"))
			return
		}
		result, err := svc.ReadVideoReworkHistory(user.ID, c.Param("id"), c.Query("clipId"), c.Query("cursor"), limit)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
	r.GET("/projects/:id/video-reworks/source", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		result, err := svc.ReadVideoReworkSource(user.ID, c.Param("id"), c.Query("clipId"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
	r.GET("/projects/:id/video-reworks/media", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		result, err := svc.ReadVideoReworkMedia(user.ID, c.Param("id"), c.Query("resourceId"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
	r.GET("/projects/:id/video-reworks/by-request", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		result, err := svc.ReadVideoReworkTask(user.ID, c.Param("id"), c.Query("requestId"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
	r.POST("/projects/:id/video-reworks", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var request service.VideoReworkCreateRequest
		if !bindTimelineEditJSON(c, &request) {
			return
		}
		result, err := svc.CreateVideoReworkTask(user.ID, c.Param("id"), request)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
}
