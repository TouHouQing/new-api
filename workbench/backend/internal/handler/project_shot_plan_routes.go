package handler

import (
	"encoding/json"
	"errors"
	"github.com/gin-gonic/gin"
	"io"
	"net/http"
	"yingce/backend/internal/service"
)

func registerProjectShotPlanRoutes(r *gin.RouterGroup, svc *service.Service) {
	r.PATCH("/projects/:id/shots/:shotId/intentions", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 256<<10)
		var request service.UpdateShotIntentionsRequest
		decoder := json.NewDecoder(c.Request.Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&request); err != nil {
			fail(c, http.StatusBadRequest, errors.New("镜头意图格式无效"))
			return
		}
		if err := decoder.Decode(&struct{}{}); err != io.EOF {
			fail(c, http.StatusBadRequest, errors.New("镜头意图只能包含一个对象"))
			return
		}
		shot, revision, err := svc.UpdateShotIntentions(user.ID, c.Param("id"), c.Param("shotId"), request)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"shot": shot, "revision": revision})
	})
	r.GET("/projects/:id/units/:unitId/shot-plan-source", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		result, err := svc.ReadShotPlanSource(user.ID, c.Param("id"), c.Param("unitId"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
	r.GET("/projects/:id/units/:unitId/shot-plans", func(c *gin.Context) {
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
		if size > 50 {
			fail(c, http.StatusBadRequest, errors.New("每页最多50个分镜方案"))
			return
		}
		result, err := svc.ListShotPlans(user.ID, c.Param("id"), c.Param("unitId"), page, size)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
	r.GET("/projects/:id/shot-plans/:recordId", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		page, err := parsePositiveQueryInt(c.Query("page"), 1)
		if err != nil || page > 1000 {
			fail(c, http.StatusBadRequest, errors.New("方案页码须为1至1000"))
			return
		}
		result, err := svc.ReadShotPlan(user.ID, c.Param("id"), c.Param("recordId"), page)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
	r.POST("/projects/:id/shot-plans/:recordId/restore", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 32<<10)
		var req service.RestoreShotPlanRequest
		decoder := json.NewDecoder(c.Request.Body)
		decoder.DisallowUnknownFields()
		var extra any
		if err := decoder.Decode(&req); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		if err := decoder.Decode(&extra); err != io.EOF {
			fail(c, http.StatusBadRequest, io.ErrUnexpectedEOF)
			return
		}
		result, err := svc.RestoreShotPlan(user.ID, c.Param("id"), c.Param("recordId"), req)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
}
