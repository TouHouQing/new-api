package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"yingce/backend/internal/service"
)

func registerImageOperationRoutes(r *gin.RouterGroup, svc *service.Service) {
	r.GET("/canvas-projects/:id/image-layer-plans", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		limit := 20
		if value := c.Query("limit"); value != "" {
			limit, err = strconv.Atoi(value)
			if err != nil {
				fail(c, http.StatusBadRequest, service.BadAuthRequest("识图规划分页无效"))
				return
			}
		}
		result, err := svc.ReadImageLayerPlanningHistory(user.ID, c.Param("id"), c.Query("sourceNodeId"), c.Query("resourceId"), c.Query("cursor"), limit)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
	r.POST("/canvas-projects/:id/image-layer-workflows", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		policy, available := loadRuntimePolicy(c, svc)
		if !available || !enforceRateLimit(c, "image-layer-workflow:"+user.ID, policy.Request.TaskCreatePerMinute, time.Minute) {
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 512<<10)
		var req service.ImageLayerWorkflowRequest
		decoder := json.NewDecoder(c.Request.Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&req); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		if err := decoder.Decode(new(any)); err != io.EOF {
			fail(c, http.StatusBadRequest, service.BadAuthRequest("拆层工作流参数无效"))
			return
		}
		result, err := svc.CreateImageLayerWorkflow(c.Request.Context(), user.ID, c.Param("id"), req)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
	r.POST("/canvas-projects/:id/image-layer-groups/:nodeId/materials", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		if !enforceRateLimit(c, "image-layer-materials:"+user.ID, 30, time.Minute) {
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4<<10)
		var req service.ImageLayerMaterialsRequest
		decoder := json.NewDecoder(c.Request.Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&req); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		if err := decoder.Decode(new(any)); err != io.EOF {
			fail(c, http.StatusBadRequest, service.BadAuthRequest("独立素材参数无效"))
			return
		}
		result, err := svc.CreateImageLayerMaterials(c.Request.Context(), user.ID, c.Param("id"), c.Param("nodeId"), req)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
	r.GET("/images/:resourceId/alpha-bounds", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		if !enforceRateLimit(c, "image-alpha-bounds:"+user.ID, 30, time.Minute) {
			return
		}
		result, err := svc.InspectImageAlphaBounds(c.Request.Context(), user.ID, c.Param("resourceId"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
	r.POST("/canvas-projects/:id/image-layer-groups", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		if !enforceRateLimit(c, "image-layer-group-create:"+user.ID, 30, time.Minute) {
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16<<10)
		var req service.ImageLayerGroupCreateRequest
		decoder := json.NewDecoder(c.Request.Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&req); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		if err := decoder.Decode(new(any)); err != io.EOF {
			fail(c, http.StatusBadRequest, service.BadAuthRequest("图层组参数无效"))
			return
		}
		result, err := svc.CreateImageLayerGroup(user.ID, c.Param("id"), req)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
	r.GET("/canvas-projects/:id/image-layer-groups/:nodeId/source", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		if !enforceRateLimit(c, "image-layer-source:"+user.ID, 30, time.Minute) {
			return
		}
		result, err := svc.ReadImageLayerGroupSource(user.ID, c.Param("id"), c.Param("nodeId"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
	r.POST("/images/operations/:id/apply", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		policy, available := loadRuntimePolicy(c, svc)
		if !available || !enforceRateLimit(c, "image-operation-apply:"+user.ID, policy.Request.TaskCreatePerMinute, time.Minute) {
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4<<10)
		var req service.ImageOperationApplyRequest
		decoder := json.NewDecoder(c.Request.Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&req); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		if err := decoder.Decode(new(any)); err != io.EOF {
			fail(c, http.StatusBadRequest, service.BadAuthRequest("采用操作参数无效"))
			return
		}
		result, err := svc.ApplyImageOperationTask(user.ID, c.Param("id"), req)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
	r.POST("/images/operations", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		policy, available := loadRuntimePolicy(c, svc)
		if !available || !enforceRateLimit(c, "image-operation:"+user.ID, policy.Request.TaskCreatePerMinute, time.Minute) {
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 256<<10)
		var req service.ImageOperationCreateRequest
		decoder := json.NewDecoder(c.Request.Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&req); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		if err := decoder.Decode(new(any)); err != io.EOF {
			fail(c, http.StatusBadRequest, service.BadAuthRequest("图片操作参数无效"))
			return
		}
		result, err := svc.CreateImageOperationTask(user.ID, req)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
}
