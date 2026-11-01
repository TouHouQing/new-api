package handler

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
	"yingce/backend/internal/service"
)

func bindTimelineEditJSON(c *gin.Context, target any) bool {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 64<<10)
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	err := decoder.Decode(target)
	if err == nil {
		var extra any
		err = decoder.Decode(&extra)
		if err == io.EOF {
			return true
		}
	}
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		fail(c, http.StatusRequestEntityTooLarge, errors.New("编辑参数超过大小限制"))
	} else {
		fail(c, http.StatusBadRequest, errors.New("编辑参数无效，请使用明确动作；不能提交自造的剪辑结果或来源"))
	}
	return false
}
func timelineEditWriteHandler(svc *service.Service, apply bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var request service.TimelineEditRequest
		if !bindTimelineEditJSON(c, &request) {
			return
		}
		if apply {
			result, err := svc.ApplyTimelineEdits(user.ID, c.Param("id"), request)
			if err != nil {
				failService(c, err)
				return
			}
			ok(c, result)
		} else {
			result, err := svc.PreviewTimelineEdits(user.ID, c.Param("id"), request)
			if err != nil {
				failService(c, err)
				return
			}
			ok(c, result)
		}
	}
}
func registerTimelineEditRoutes(r *gin.RouterGroup, svc *service.Service) {
	registerVideoReworkRoutes(r, svc)
	registerProjectCutReviewRoutes(r, svc)
	r.GET("/projects/:id/timeline/canvas-source", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		result, err := svc.ReadCanvasTimelineSource(user.ID, c.Param("id"), c.Query("canvasId"), c.Query("nodeId"), c.Query("resourceId"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
	r.POST("/projects/:id/timeline/edits/preview", timelineEditWriteHandler(svc, false))
	r.POST("/projects/:id/timeline/edits/apply", timelineEditWriteHandler(svc, true))
	r.GET("/projects/:id/timeline/edit-results", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		result, err := svc.ReadTimelineEditResult(user.ID, c.Param("id"), c.Query("requestId"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
}
