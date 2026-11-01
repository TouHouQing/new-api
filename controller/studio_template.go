package controller

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func ListStudioTemplates(c *gin.Context) {
	definitions, err := service.ListStudioTemplateDefinitions(c.GetInt("id"))
	if err != nil {
		studioCloudError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": definitions})
}
func ReadStudioTemplate(c *gin.Context) {
	version, err := strconv.ParseInt(c.DefaultQuery("version", "0"), 10, 64)
	if err != nil {
		studioCloudError(c, errors.New("invalid template version"))
		return
	}
	definition, err := service.ReadStudioTemplateDefinition(c.GetInt("id"), c.Param("template_id"), version)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": definition})
}
func CreateStudioTemplate(c *gin.Context) { saveStudioTemplate(c, false) }
func UpdateStudioTemplate(c *gin.Context) { saveStudioTemplate(c, true) }
func saveStudioTemplate(c *gin.Context, update bool) {
	var input service.StudioTemplateSaveRequest
	if common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, 128<<10), &input) != nil {
		studioCloudError(c, errors.New("invalid production template"))
		return
	}
	if update {
		input.ID = c.Param("template_id")
		if input.ExpectedVersion < 1 {
			studioCloudError(c, errors.New("expected template version is required"))
			return
		}
	} else if input.ExpectedVersion != 0 {
		studioCloudError(c, errors.New("new templates start at version one"))
		return
	}
	definition, err := service.SaveStudioTemplate(c.GetInt("id"), input)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": definition})
}
func InstantiateStudioTemplate(c *gin.Context) {
	if studioClientDocumentVersion(c) < 2 {
		studioCloudError(c, service.ErrStudioClientVersion)
		return
	}
	var input service.StudioTemplateInstantiateRequest
	if common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, 128<<10), &input) != nil {
		studioCloudError(c, errors.New("invalid template instance"))
		return
	}
	project, err := service.InstantiateStudioTemplate(c.GetInt("id"), c.Param("template_id"), input)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": studioProjectPayload(project, "owner", studioClientDocumentVersion(c))})
}
