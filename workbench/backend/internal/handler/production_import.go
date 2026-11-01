package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"yingce/backend/internal/service"
)

const legacyProjectBodyLimit = (1 << 30) + (64 << 10)

func registerProductionImportRoutes(r *gin.RouterGroup, svc *service.Service) {
	r.GET("/projects/:id/legacy-versions", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		cursor, err := strconv.Atoi(c.DefaultQuery("cursor", "0"))
		if err != nil {
			fail(c, 400, errors.New("旧工程版本分页无效"))
			return
		}
		limit, err := strconv.Atoi(c.DefaultQuery("limit", "20"))
		if err != nil {
			fail(c, 400, errors.New("旧工程版本分页无效"))
			return
		}
		result, err := svc.ReadLegacyVersions(user.ID, c.Param("id"), c.Query("sourceSha256"), cursor, limit)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
	for _, action := range []string{"preview", "apply"} {
		r.POST("/projects/:id/legacy-versions/"+action, func(c *gin.Context) {
			user, err := currentUser(c, svc)
			if err != nil {
				failService(c, err)
				return
			}
			var request service.LegacyVersionRequest
			if !bindStrictProjectJSON(c, &request, 64<<10, "旧版本转换参数无效", "旧版本转换参数过大") {
				return
			}
			if action == "preview" {
				result, err := svc.PreviewLegacyVersion(user.ID, c.Param("id"), request)
				if err != nil {
					failService(c, err)
					return
				}
				ok(c, result)
				return
			}
			result, err := svc.ApplyLegacyVersion(user.ID, c.Param("id"), request)
			if err != nil {
				failService(c, err)
				return
			}
			ok(c, result)
		})
	}
	r.GET("/projects/:id/legacy-native", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		result, err := svc.GetLegacyNativeStatus(user.ID, c.Param("id"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
	for _, action := range []string{"preview", "apply"} {
		r.POST("/projects/:id/legacy-native/"+action, func(c *gin.Context) {
			user, err := currentUser(c, svc)
			if err != nil {
				failService(c, err)
				return
			}
			var req service.LegacyNativeRequest
			if !bindProjectCutJSON(c, &req) {
				return
			}
			if action == "preview" {
				result, err := svc.PreviewLegacyNative(c.Request.Context(), user.ID, c.Param("id"), req)
				if err != nil {
					failService(c, err)
					return
				}
				ok(c, result)
				return
			}
			result, err := svc.ApplyLegacyNative(c.Request.Context(), user.ID, c.Param("id"), req)
			if err != nil {
				failService(c, err)
				return
			}
			ok(c, result)
		})
	}
	for _, mode := range []string{"inspect", "import"} {
		r.POST("/projects/legacy/"+mode, func(c *gin.Context) {
			user, err := currentUser(c, svc)
			if err != nil {
				failService(c, err)
				return
			}
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, legacyProjectBodyLimit)
			if err := c.Request.ParseMultipartForm(8 << 20); err != nil {
				var tooLarge *http.MaxBytesError
				if errors.As(err, &tooLarge) {
					fail(c, http.StatusRequestEntityTooLarge, err)
				} else {
					fail(c, http.StatusBadRequest, err)
				}
				return
			}
			defer c.Request.MultipartForm.RemoveAll()
			header, err := c.FormFile("file")
			if err != nil {
				fail(c, http.StatusBadRequest, err)
				return
			}
			file, err := header.Open()
			if err != nil {
				fail(c, http.StatusBadRequest, err)
				return
			}
			defer file.Close()
			if mode == "inspect" {
				result, err := svc.InspectLegacyProject(user.ID, file, header.Size)
				if err != nil {
					failService(c, err)
					return
				}
				ok(c, result)
				return
			}
			result, err := svc.ImportLegacyProject(c.Request.Context(), user.ID, file, header.Size, c.PostForm("fingerprint"), c.PostForm("name"))
			if err != nil {
				failService(c, err)
				return
			}
			ok(c, result)
		})
	}
}
