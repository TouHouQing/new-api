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

func bindTranscriptJSON(c *gin.Context, target any, limit int64, invalidMessage ...string) bool {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, limit)
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
		fail(c, http.StatusRequestEntityTooLarge, errors.New("文字稿请求超过大小限制"))
	} else {
		message := "文字稿参数无效，校正文字不能修改来源时间"
		if len(invalidMessage) > 0 {
			message = invalidMessage[0]
		}
		fail(c, http.StatusBadRequest, errors.New(message))
	}
	return false
}

func registerProjectTranscriptRoutes(r *gin.RouterGroup, svc *service.Service) {
	registerProjectLyricsRoutes(r, svc)
	r.GET("/projects/:id/transcripts/:transcriptId/suggestions", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		hints, err := svc.GetProjectTranscriptSuggestions(user.ID, c.Param("id"), c.Param("transcriptId"), c.Query("revisionId"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, hints)
	})
	r.POST("/projects/:id/transcripts/:transcriptId/cut-preview", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var input service.TranscriptCutPreviewRequest
		if !bindTranscriptJSON(c, &input, 2<<20) {
			return
		}
		preview, err := svc.PreviewProjectTranscriptCut(user.ID, c.Param("id"), c.Param("transcriptId"), input)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, preview)
	})
	r.POST("/projects/:id/transcripts/:transcriptId/cut-apply", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var input service.TranscriptCutApplyRequest
		if !bindTranscriptJSON(c, &input, 2<<20) {
			return
		}
		timeline, err := svc.ApplyProjectTranscriptCut(user.ID, c.Param("id"), c.Param("transcriptId"), input)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, timeline)
	})
	r.GET("/projects/:id/transcripts", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		limit, err := parsePositiveQueryInt(c.Query("pageSize"), 30)
		if err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		page, err := svc.ListProjectTranscripts(user.ID, c.Param("id"), c.Query("resourceId"), c.Query("cursor"), c.Query("archived") == "true", limit)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, page)
	})
	r.POST("/projects/:id/transcripts", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var input service.ProjectTranscriptCreateRequest
		if !bindTranscriptJSON(c, &input, 8<<10) {
			return
		}
		view, err := svc.CreateProjectTranscript(user.ID, c.Param("id"), input)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, view)
	})
	r.GET("/projects/:id/transcripts/by-task/:taskId", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		view, err := svc.GetProjectTranscriptForTask(user.ID, c.Param("id"), c.Param("taskId"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, view)
	})
	r.GET("/projects/:id/transcripts/:transcriptId", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		view, err := svc.GetProjectTranscript(user.ID, c.Param("id"), c.Param("transcriptId"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, view)
	})
	r.PATCH("/projects/:id/transcripts/:transcriptId", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var input service.ProjectTranscriptWriteRequest
		if !bindTranscriptJSON(c, &input, 2<<20) {
			return
		}
		view, err := svc.UpdateProjectTranscript(user.ID, c.Param("id"), c.Param("transcriptId"), input)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, view)
	})
	r.GET("/projects/:id/transcripts/:transcriptId/versions", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		limit, err := parsePositiveQueryInt(c.Query("pageSize"), 30)
		if err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		var before int64
		if raw := c.Query("beforeVersion"); raw != "" {
			before, err = strconv.ParseInt(raw, 10, 64)
			if err != nil || before < 1 {
				fail(c, http.StatusBadRequest, errors.New("历史版本游标无效"))
				return
			}
		}
		page, err := svc.ProjectTranscriptHistory(user.ID, c.Param("id"), c.Param("transcriptId"), before, limit)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, page)
	})
	r.GET("/projects/:id/transcripts/:transcriptId/versions/:revisionId", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		view, err := svc.GetProjectTranscriptVersion(user.ID, c.Param("id"), c.Param("transcriptId"), c.Param("revisionId"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, view)
	})
}
