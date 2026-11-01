package handler

import (
	"github.com/gin-gonic/gin"
	"yingce/backend/internal/service"
)

func registerProjectLyricsRoutes(r *gin.RouterGroup, svc *service.Service) {
	for _, action := range []string{"preview", "apply"} {
		r.POST("/projects/:id/transcripts/:transcriptId/lyrics-"+action, func(c *gin.Context) {
			user, err := currentUser(c, svc)
			if err != nil {
				failService(c, err)
				return
			}
			var input service.ProjectLyricsRequest
			if !bindTranscriptJSON(c, &input, 256<<10, "歌词参数无效，请检查原词范围或人工时间；不能混用两种时间来源") {
				return
			}
			if action == "preview" {
				value, err := svc.PreviewProjectLyrics(user.ID, c.Param("id"), c.Param("transcriptId"), input)
				if err != nil {
					failService(c, err)
					return
				}
				ok(c, value)
			} else {
				value, err := svc.ApplyProjectLyrics(user.ID, c.Param("id"), c.Param("transcriptId"), input)
				if err != nil {
					failService(c, err)
					return
				}
				ok(c, value)
			}
		})
	}
	r.GET("/projects/:id/transcripts/:transcriptId/lyrics-results/:requestId", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		value, err := svc.ReadProjectLyricsResult(user.ID, c.Param("id"), c.Param("transcriptId"), c.Param("requestId"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, value)
	})
}
