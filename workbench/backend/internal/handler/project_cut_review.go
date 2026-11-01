package handler

import (
	"github.com/gin-gonic/gin"
	"yingce/backend/internal/service"
)

func registerProjectCutReviewRoutes(r *gin.RouterGroup, svc *service.Service) {
	for _, apply := range []bool{false, true} {
		path := "/projects/:id/timeline/legacy-settings/preview"
		if apply {
			path = "/projects/:id/timeline/legacy-settings/apply"
		}
		r.POST(path, func(c *gin.Context) {
			user, err := currentUser(c, svc)
			if err != nil {
				failService(c, err)
				return
			}
			var request service.ProjectCutReviewRequest
			if !bindTimelineEditJSON(c, &request) {
				return
			}
			if apply {
				result, err := svc.ApplyProjectCutReview(user.ID, c.Param("id"), request)
				if err != nil {
					failService(c, err)
					return
				}
				ok(c, result)
			} else {
				result, err := svc.PreviewProjectCutReview(user.ID, c.Param("id"), request)
				if err != nil {
					failService(c, err)
					return
				}
				ok(c, result)
			}
		})
	}
	r.GET("/projects/:id/timeline/legacy-settings/results", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		result, err := svc.ReadProjectCutReview(user.ID, c.Param("id"), c.Query("requestId"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
}
