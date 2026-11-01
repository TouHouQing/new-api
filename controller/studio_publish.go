package controller

import (
	"errors"
	"mime"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func ListStudioPublications(c *gin.Context) {
	projectID := c.Param("project_id")
	values, err := service.ListStudioPublications(c.GetInt("id"), projectID)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	accounts, err := service.StudioPublishingAccounts(c.GetInt("id"))
	if err != nil {
		studioCloudError(c, err)
		return
	}
	project, role, err := model.StudioProjectAccess(model.DB, c.GetInt("id"), projectID, false)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	var jobs []model.StudioWorkflowJob
	if err := model.DB.Where("project_id = ? AND kind = ? AND status = ?", projectID, "render", "succeeded").Order("created_at DESC").Limit(50).Find(&jobs).Error; err != nil {
		studioCloudError(c, err)
		return
	}
	renders := []gin.H{}
	for _, job := range jobs {
		var result struct {
			MediaID  string  `json:"media_id"`
			Duration float64 `json:"duration"`
		}
		if common.Unmarshal([]byte(job.Result), &result) == nil && result.MediaID != "" {
			renders = append(renders, gin.H{"id": job.ID, "revision": job.Revision, "created_at": job.CreatedAt, "media_id": result.MediaID, "duration": result.Duration})
		}
	}
	var publishingJobs []model.StudioWorkflowJob
	if err := model.DB.Where("project_id = ? AND kind = ?", projectID, "publish").Order("created_at DESC").Limit(100).Find(&publishingJobs).Error; err != nil {
		studioCloudError(c, err)
		return
	}
	jobStatuses := []gin.H{}
	for _, job := range publishingJobs {
		var plan service.StudioWorkflowPlan
		if common.Unmarshal([]byte(job.Plan), &plan) == nil && plan.Operation != nil {
			jobStatuses = append(jobStatuses, gin.H{"id": job.ID, "status": job.Status, "progress": job.Progress, "error": job.Error, "action": plan.Operation.Action, "publication_id": plan.Operation.PublishID})
		}
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"publications": values, "accounts": accounts, "renders": renders, "jobs": jobStatuses, "project_revision": project.Revision, "role": role}})
}
func ReadStudioPublication(c *gin.Context) {
	value, _, err := service.ReadStudioPublication(c.GetInt("id"), c.Param("project_id"), c.Param("publish_id"))
	if err != nil {
		studioCloudError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": value})
}
func CreateStudioPublication(c *gin.Context) {
	var input service.StudioPublicationRequest
	if common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, 32768), &input) != nil {
		studioCloudError(c, errors.New("invalid publication draft"))
		return
	}
	value, err := service.CreateStudioPublication(c.GetInt("id"), c.Param("project_id"), input)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": value})
}
func ConfirmStudioPublication(c *gin.Context) {
	contentType, _, _ := mime.ParseMediaType(c.GetHeader("Content-Type"))
	if contentType != "application/json" {
		studioCloudError(c, errors.New("publishing confirmation requires an authenticated JSON request"))
		return
	}
	var input struct {
		Fingerprint          string `json:"fingerprint"`
		ConfirmExternalWrite bool   `json:"confirm_external_write"`
	}
	if common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, 4096), &input) != nil {
		studioCloudError(c, errors.New("invalid publication confirmation"))
		return
	}
	value, err := service.ConfirmStudioPublication(c.GetInt("id"), c.Param("project_id"), c.Param("publish_id"), input.Fingerprint, input.ConfirmExternalWrite)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": value})
}
func QueueStudioPublication(c *gin.Context) {
	contentType, _, _ := mime.ParseMediaType(c.GetHeader("Content-Type"))
	if contentType != "application/json" {
		studioCloudError(c, errors.New("publishing actions require an authenticated JSON request"))
		return
	}
	var input struct {
		Action    string `json:"action"`
		RequestID string `json:"request_id"`
	}
	if common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, 4096), &input) != nil {
		studioCloudError(c, errors.New("invalid publishing action"))
		return
	}
	job, err := service.QueueStudioPublication(c.GetInt("id"), c.Param("project_id"), c.Param("publish_id"), input.Action, input.RequestID)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	c.JSON(http.StatusAccepted, gin.H{"success": true, "data": studioJobPayload(job)})
}
func CancelStudioPublication(c *gin.Context) {
	value, err := service.CancelStudioPublication(c.GetInt("id"), c.Param("project_id"), c.Param("publish_id"))
	if err != nil {
		studioCloudError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": value})
}
