package controller

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func StudioProjectMediaIndex(c *gin.Context) {
	if c.Request.Method == http.MethodPost {
		var request struct {
			service.StudioBrollRequest
			Action string `json:"action"`
			JobID  string `json:"job_id"`
		}
		if common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, 1024), &request) != nil {
			studioCloudError(c, errors.New("invalid media indexing request"))
			return
		}
		if request.Action == "prepare" {
			record, err := service.PrepareStudioBrollPlan(c.Request.Context(), c.GetInt("id"), c.Param("project_id"), request.StudioBrollRequest)
			if err != nil {
				studioCloudError(c, err)
				return
			}
			c.JSON(http.StatusOK, gin.H{"success": true, "data": studioProductionRecordPayload(record)})
			return
		}
		if request.Action != "" && request.Action != "index" {
			studioCloudError(c, errors.New("unsupported media index action"))
			return
		}
		record, err := service.IndexStudioMediaAnalysis(c.Request.Context(), c.GetInt("id"), c.Param("project_id"), request.JobID)
		if err != nil {
			studioCloudError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": studioProductionRecordPayload(record)})
		return
	}
	limit, limitErr := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, offsetErr := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if limitErr != nil || offsetErr != nil {
		studioCloudError(c, errors.New("invalid media search page"))
		return
	}
	result, err := service.SearchStudioIndexedMedia(c.GetInt("id"), c.Param("project_id"), c.Query("query"), limit, offset)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
}
