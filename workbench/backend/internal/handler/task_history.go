package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"yingce/backend/internal/service"
)

func registerTaskHistoryRoutes(r *gin.RouterGroup, svc *service.Service) {
	r.GET("/tasks/history", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		page, err := parsePositiveQueryInt(c.Query("page"), 1)
		if err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		size, err := parsePositiveQueryInt(c.Query("pageSize"), 20)
		if err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		result, err := svc.TaskHistory(user.ID, service.TaskHistoryRequest{Page: page, PageSize: size, ProjectID: c.Query("projectId"), Query: c.Query("q"), Kind: c.Query("kind"), Model: c.Query("model"), Status: c.Query("status"), TimeZone: c.Query("timeZone")})
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
}
