package controller

import (
	"errors"
	"github.com/QuantumNous/new-api/common"
	"net/http"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func CorrectStudioProjectTracking(c *gin.Context) {
	var request service.StudioTrackingCorrection
	if common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, 32768), &request) != nil {
		studioCloudError(c, errors.New("invalid tracking corrections"))
		return
	}
	record, err := service.CorrectStudioTracking(c.GetInt("id"), c.Param("project_id"), c.Param("analysis_id"), request)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": studioProductionRecordPayload(record)})
}

func CorrectStudioProjectTranscript(c *gin.Context) {
	var request service.StudioTranscriptCorrection
	if common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, 1<<20), &request) != nil {
		studioCloudError(c, errors.New("invalid transcript corrections"))
		return
	}
	record, err := service.CorrectStudioTranscript(c.GetInt("id"), c.Param("project_id"), c.Param("analysis_id"), request)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": studioProductionRecordPayload(record)})
}

func StudioProjectAnalyses(c *gin.Context) {
	project, _, err := model.StudioProjectAccess(model.DB, c.GetInt("id"), c.Param("project_id"), false)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	if id := c.Param("analysis_id"); id != "" {
		record, result, err := service.ReadStudioAnalysisResult(c.GetInt("id"), id)
		if err != nil {
			studioCloudError(c, err)
			return
		}
		if record.ProjectID != project.ID {
			studioCloudError(c, model.ErrStudioAccess)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"id": record.ID, "revision": record.Revision, "document": result}})
		return
	}
	var records []model.StudioProductionRecord
	if err := model.DB.Where("project_id = ? AND kind = ?", project.ID, "analysis").Order("created_at DESC").Limit(100).Find(&records).Error; err != nil {
		studioCloudError(c, err)
		return
	}
	result := []gin.H{}
	for i := range records {
		result = append(result, studioProductionRecordPayload(&records[i]))
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
}
