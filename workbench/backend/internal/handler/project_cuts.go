package handler

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"yingce/backend/internal/service"
)

func bindProjectCutJSON(c *gin.Context, target any) bool {
	return bindStrictProjectJSON(c, target, (8<<20)+(64<<10), "剪辑版本参数无效，不能修改来源或原始回执", "剪辑版本超过请求大小限制")
}

func bindCaptionPreviewJSON(c *gin.Context, target any) bool {
	return bindStrictProjectJSON(c, target, 512<<10, "字幕预览参数无效", "字幕预览超过请求大小限制")
}

func bindStrictProjectJSON(c *gin.Context, target any, maximum int64, invalidMessage, oversizeMessage string) bool {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maximum)
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
		fail(c, http.StatusRequestEntityTooLarge, errors.New(oversizeMessage))
		return false
	}
	fail(c, http.StatusBadRequest, errors.New(invalidMessage))
	return false
}
func registerProjectCutRoutes(r *gin.RouterGroup, svc *service.Service) {
	r.GET("/projects/:id/timeline/cuts/:cutId/renders", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		limit, err := strconv.Atoi(c.DefaultQuery("limit", "10"))
		if err != nil {
			fail(c, 400, errors.New("导出记录分页无效"))
			return
		}
		result, err := svc.ListProjectCutRenders(user.ID, c.Param("id"), c.Param("cutId"), c.Query("cursor"), limit)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
	r.GET("/projects/:id/timeline/cuts/:cutId/render-request", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		result, err := svc.ReadProjectCutRender(user.ID, c.Param("id"), c.Param("cutId"), c.Query("requestId"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
	r.POST("/projects/:id/timeline/cuts/:cutId/renders", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var request service.ProjectCutRenderRequest
		if !bindStrictProjectJSON(c, &request, 64<<10, "固定版本导出参数无效", "固定版本导出参数过大") {
			return
		}
		result, err := svc.CreateProjectCutRender(user.ID, c.Param("id"), c.Param("cutId"), request)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
	r.POST("/projects/:id/timeline/caption-preview", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		if !enforceRateLimit(c, "caption-preview:"+user.ID, 120, time.Minute) {
			return
		}
		var request service.CaptionPreviewRequest
		if !bindCaptionPreviewJSON(c, &request) {
			return
		}
		result, err := svc.PreviewProjectCaptions(c.Request.Context(), user.ID, c.Param("id"), request)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
	r.GET("/projects/:id/timeline/canvas-cut-source", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		cursor, err := strconv.Atoi(c.DefaultQuery("cursor", "0"))
		if err != nil {
			fail(c, 400, errors.New("原画布片段分页无效"))
			return
		}
		limit, err := strconv.Atoi(c.DefaultQuery("limit", "50"))
		if err != nil {
			fail(c, 400, errors.New("原画布片段分页无效"))
			return
		}
		result, err := svc.ReadCanvasTimelineCut(user.ID, c.Param("id"), c.Query("canvasId"), c.Query("sourceSha256"), cursor, limit)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
	for _, apply := range []bool{false, true} {
		action := "preview"
		if apply {
			action = "apply"
		}
		r.POST("/projects/:id/timeline/canvas-cut/"+action, func(c *gin.Context) {
			user, err := currentUser(c, svc)
			if err != nil {
				failService(c, err)
				return
			}
			var request service.CanvasCutConvertRequest
			if !bindProjectCutJSON(c, &request) {
				return
			}
			if apply {
				result, err := svc.ApplyCanvasTimelineCut(user.ID, c.Param("id"), request)
				if err != nil {
					failService(c, err)
					return
				}
				ok(c, result)
			} else {
				result, err := svc.PreviewCanvasTimelineCut(user.ID, c.Param("id"), request)
				if err != nil {
					failService(c, err)
					return
				}
				ok(c, result)
			}
		})
	}
	r.GET("/projects/:id/timeline/cut-requests", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		result, err := svc.ReadProjectCutRequest(user.ID, c.Param("id"), c.Query("requestId"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
	r.GET("/projects/:id/timeline/cuts", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		limit, err := strconv.Atoi(c.DefaultQuery("limit", "20"))
		if err != nil {
			fail(c, 400, errors.New("分页数量无效"))
			return
		}
		archived, err := strconv.ParseBool(c.DefaultQuery("archived", "false"))
		if err != nil {
			fail(c, 400, errors.New("归档筛选无效"))
			return
		}
		includeAutomatic, err := strconv.ParseBool(c.DefaultQuery("includeAutomatic", "true"))
		if err != nil {
			fail(c, 400, errors.New("自动恢复版本筛选无效"))
			return
		}
		result, err := svc.ListProjectCuts(user.ID, c.Param("id"), c.Query("cursor"), archived, includeAutomatic, limit)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
	r.POST("/projects/:id/timeline/cuts", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var req service.ProjectCutCreateRequest
		if !bindProjectCutJSON(c, &req) {
			return
		}
		result, err := svc.CreateProjectCut(user.ID, c.Param("id"), req)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
	r.GET("/projects/:id/timeline/cut-applies", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		result, err := svc.ReadProjectCutApply(user.ID, c.Param("id"), c.Query("requestId"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
	r.GET("/projects/:id/timeline/cuts/:cutId", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		result, err := svc.GetProjectCut(user.ID, c.Param("id"), c.Param("cutId"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
	r.PATCH("/projects/:id/timeline/cuts/:cutId", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var req struct {
			ExpectedArchived *bool `json:"expectedArchived"`
			Archived         *bool `json:"archived"`
		}
		if !bindProjectCutJSON(c, &req) {
			return
		}
		if req.ExpectedArchived == nil || req.Archived == nil {
			fail(c, 400, errors.New("请提供原归档状态和目标状态"))
			return
		}
		result, err := svc.SetProjectCutArchived(user.ID, c.Param("id"), c.Param("cutId"), *req.ExpectedArchived, *req.Archived)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
	for _, mode := range []string{"preview", "apply"} {
		r.POST("/projects/:id/timeline/cuts/:cutId/"+mode, func(c *gin.Context) {
			user, err := currentUser(c, svc)
			if err != nil {
				failService(c, err)
				return
			}
			var req service.ProjectCutApplyRequest
			if !bindProjectCutJSON(c, &req) {
				return
			}
			if mode == "preview" {
				result, err := svc.PreviewProjectCutApply(user.ID, c.Param("id"), c.Param("cutId"), req)
				if err != nil {
					failService(c, err)
					return
				}
				ok(c, result)
				return
			}
			result, err := svc.ApplyProjectCut(user.ID, c.Param("id"), c.Param("cutId"), req)
			if err != nil {
				failService(c, err)
				return
			}
			ok(c, result)
		})
	}
}
