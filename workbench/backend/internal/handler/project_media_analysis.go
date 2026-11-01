package handler

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"yingce/backend/internal/service"
)

func bindMediaAnalysisJSON(c *gin.Context, target any) bool {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 2<<20)
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
	var oversize *http.MaxBytesError
	if errors.As(err, &oversize) {
		fail(c, http.StatusRequestEntityTooLarge, errors.New("素材分析请求超过大小限制"))
		return false
	}
	fail(c, http.StatusBadRequest, errors.New("素材分析参数无效，不能修改原始证据和来源"))
	return false
}

func registerProjectMediaAnalysisRoutes(r *gin.RouterGroup, svc *service.Service) {
	r.GET("/projects/:id/reference-adoptions", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		result, err := svc.ReadReferenceShotAdoption(user.ID, c.Param("id"), c.Query("requestId"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
	r.POST("/projects/:id/media-analyses/:analysisId/shots/preview", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var req service.ReferenceShotRequest
		if !bindMediaAnalysisJSON(c, &req) {
			return
		}
		preview, err := svc.PreviewReferenceShots(user.ID, c.Param("id"), c.Param("analysisId"), req)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, preview)
	})
	r.POST("/projects/:id/media-analyses/:analysisId/shots/apply", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var req service.ReferenceShotApplyRequest
		if !bindMediaAnalysisJSON(c, &req) {
			return
		}
		result, err := svc.ApplyReferenceShots(user.ID, c.Param("id"), c.Param("analysisId"), req)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
	r.POST("/projects/:id/media-analyses/manual-framing", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var req service.ProjectManualFramingRequest
		if !bindMediaAnalysisJSON(c, &req) {
			return
		}
		result, err := svc.CreateProjectManualFraming(c.Request.Context(), user.ID, c.Param("id"), req)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
	r.POST("/projects/:id/media-analyses/:analysisId/reframe/preview", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var req service.MediaAnalysisMarkerRequest
		if !bindMediaAnalysisJSON(c, &req) {
			return
		}
		view, err := svc.PreviewProjectMediaAnalysisReframe(user.ID, c.Param("id"), c.Param("analysisId"), req)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, view)
	})
	r.POST("/projects/:id/media-analyses/:analysisId/reframe/apply", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var req service.MediaAnalysisMarkerApplyRequest
		if !bindMediaAnalysisJSON(c, &req) {
			return
		}
		view, err := svc.ApplyProjectMediaAnalysisReframe(user.ID, c.Param("id"), c.Param("analysisId"), req)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, view)
	})
	r.POST("/projects/:id/media-analyses/:analysisId/markers/preview", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var req service.MediaAnalysisMarkerRequest
		if !bindMediaAnalysisJSON(c, &req) {
			return
		}
		preview, err := svc.PreviewProjectMediaAnalysisMarkers(user.ID, c.Param("id"), c.Param("analysisId"), req)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, preview)
	})
	r.POST("/projects/:id/media-analyses/:analysisId/markers/apply", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var req service.MediaAnalysisMarkerApplyRequest
		if !bindMediaAnalysisJSON(c, &req) {
			return
		}
		view, err := svc.ApplyProjectMediaAnalysisMarkers(user.ID, c.Param("id"), c.Param("analysisId"), req)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, view)
	})
	r.GET("/media-analyses/capabilities", func(c *gin.Context) {
		if _, err := currentUser(c, svc); err != nil {
			failService(c, err)
			return
		}
		ok(c, svc.GetMediaAnalysisCapabilities(c.Request.Context()))
	})
	r.POST("/projects/:id/media-analyses/tasks", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var req service.MediaAnalysisCreateRequest
		if !bindMediaAnalysisJSON(c, &req) {
			return
		}
		if req.ProjectID != "" && req.ProjectID != c.Param("id") {
			fail(c, http.StatusBadRequest, errors.New("分析项目与当前项目不一致"))
			return
		}
		req.ProjectID = c.Param("id")
		task, err := svc.CreateMediaAnalysisTask(c.Request.Context(), user.ID, req)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, task)
	})
	r.GET("/projects/:id/media-analyses", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		limit := 20
		if raw := c.Query("limit"); raw != "" {
			limit, err = strconv.Atoi(raw)
			if err != nil {
				fail(c, http.StatusBadRequest, errors.New("分析分页参数无效"))
				return
			}
		}
		archived := false
		if raw := c.Query("archived"); raw != "" {
			archived, err = strconv.ParseBool(raw)
			if err != nil {
				fail(c, http.StatusBadRequest, errors.New("归档筛选参数无效"))
				return
			}
		}
		page, err := svc.ListProjectMediaAnalyses(user.ID, c.Param("id"), c.Query("resourceId"), c.Query("kind"), c.Query("cursor"), archived, limit)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, page)
	})
	r.GET("/projects/:id/media-analyses/:analysisId", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		view, err := svc.GetProjectMediaAnalysis(user.ID, c.Param("id"), c.Param("analysisId"), c.Query("revisionId"))
		if err != nil {
			failService(c, err)
			return
		}
		c.Header("Cache-Control", "private, no-store")
		ok(c, view)
	})
	r.GET("/projects/:id/media-analyses/:analysisId/history", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		limit, before := 20, int64(0)
		if raw := c.Query("limit"); raw != "" {
			limit, err = strconv.Atoi(raw)
			if err != nil {
				fail(c, http.StatusBadRequest, errors.New("分析历史分页参数无效"))
				return
			}
		}
		if raw := c.Query("beforeVersion"); raw != "" {
			before, err = strconv.ParseInt(raw, 10, 64)
			if err != nil {
				fail(c, http.StatusBadRequest, errors.New("分析历史版本参数无效"))
				return
			}
		}
		page, err := svc.ProjectMediaAnalysisHistory(user.ID, c.Param("id"), c.Param("analysisId"), before, limit)
		if err != nil {
			failService(c, err)
			return
		}
		c.Header("Cache-Control", "private, no-store")
		ok(c, page)
	})
	r.PUT("/projects/:id/media-analyses/:analysisId", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var req service.ProjectMediaAnalysisWriteRequest
		if !bindMediaAnalysisJSON(c, &req) {
			return
		}
		result, err := svc.SaveProjectMediaAnalysis(user.ID, c.Param("id"), c.Param("analysisId"), req)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
}
