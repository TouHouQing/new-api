/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
package controller

import (
	"errors"
	"mime"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func StudioCampaigns(c *gin.Context) {
	if c.Request.Method == http.MethodGet {
		campaigns, err := service.ListStudioCampaigns(c.GetInt("id"), c.Param("project_id"))
		if err != nil {
			studioCloudError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": campaigns})
		return
	}
	if !studioCampaignJSON(c) {
		return
	}
	var input service.StudioCampaignRequest
	if common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, 1<<20), &input) != nil {
		studioCloudError(c, errors.New("invalid campaign matrix"))
		return
	}
	input.ProjectID = c.Param("project_id")
	campaign, err := service.CreateStudioCampaign(c.GetInt("id"), input)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": campaign})
}

func StudioCampaign(c *gin.Context) {
	campaign, err := service.ReadStudioCampaign(c.GetInt("id"), c.Param("campaign_id"))
	if err != nil {
		studioCloudError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": campaign})
}

func StudioCampaignSubmit(c *gin.Context) {
	if !studioCampaignJSON(c) {
		return
	}
	var input struct {
		ConfirmGeneration bool `json:"confirm_generation"`
	}
	if common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, 1024), &input) != nil {
		studioCloudError(c, errors.New("invalid campaign confirmation"))
		return
	}
	job, err := service.SubmitStudioCampaignVariant(c.GetInt("id"), c.Param("campaign_id"), c.Param("variant_id"), input.ConfirmGeneration)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	c.JSON(http.StatusAccepted, gin.H{"success": true, "data": studioJobPayload(job)})
}

func StudioCampaignApproveSample(c *gin.Context) {
	if !studioCampaignJSON(c) {
		return
	}
	var input struct {
		Revision      int64 `json:"revision"`
		ConfirmSample bool  `json:"confirm_sample"`
	}
	if common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, 1024), &input) != nil || !input.ConfirmSample {
		studioCloudError(c, errors.New("reviewing the sample requires explicit confirmation"))
		return
	}
	campaign, err := service.ApproveStudioCampaignSample(c.GetInt("id"), c.Param("campaign_id"), input.Revision)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": campaign})
}

func studioCampaignJSON(c *gin.Context) bool {
	if studioClientDocumentVersion(c) < 2 {
		studioCloudError(c, service.ErrStudioClientVersion)
		return false
	}
	contentType, _, err := mime.ParseMediaType(c.GetHeader("Content-Type"))
	if err != nil || contentType != "application/json" {
		studioCloudError(c, errors.New("campaign changes require an authenticated JSON request"))
		return false
	}
	return true
}
