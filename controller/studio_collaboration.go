package controller

import (
	"errors"
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"net/http"
)

func ReadStudioCollaboration(c *gin.Context) {
	snapshot, err := service.ReadStudioCollaborationSnapshot(c.GetInt("id"), c.Param("project_id"))
	if err != nil {
		studioCloudError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": snapshot})
}
func UpdateStudioPresence(c *gin.Context) {
	var input service.StudioPresenceRequest
	if common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, 4096), &input) != nil {
		studioCloudError(c, errors.New("invalid presence request"))
		return
	}
	result, err := service.HeartbeatStudioPresence(c.GetInt("id"), c.Param("project_id"), input)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
}
func CreateStudioReviewAssignment(c *gin.Context) { saveStudioReviewAssignment(c, false) }
func UpdateStudioReviewAssignment(c *gin.Context) { saveStudioReviewAssignment(c, true) }
func saveStudioReviewAssignment(c *gin.Context, update bool) {
	var input service.StudioReviewAssignmentRequest
	if common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, 16384), &input) != nil {
		studioCloudError(c, errors.New("invalid review task"))
		return
	}
	id := input.ID
	if update {
		id = c.Param("assignment_id")
		if input.ExpectedVersion < 1 {
			studioCloudError(c, errors.New("expected task version is required"))
			return
		}
	} else if input.ExpectedVersion != 0 || input.Operation != "create" {
		studioCloudError(c, errors.New("new review tasks start at version one"))
		return
	}
	result, err := service.SaveStudioReviewAssignment(c.GetInt("id"), c.Param("project_id"), id, input)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
}
