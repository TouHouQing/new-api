package controller

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func studioProductionRecordPayload(record *model.StudioProductionRecord) gin.H {
	return gin.H{"id": record.ID, "project_id": record.ProjectID, "kind": record.Kind, "revision": record.Revision, "state": record.State, "applied_revision": record.AppliedRevision, "created_at": record.CreatedAt, "document": json.RawMessage(record.Document)}
}

func StudioProjectEditPlans(c *gin.Context) {
	project, _, err := model.StudioProjectAccess(model.DB, c.GetInt("id"), c.Param("project_id"), c.Request.Method != http.MethodGet)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	if c.Request.Method == http.MethodGet {
		var records []model.StudioProductionRecord
		if err := model.DB.Where("project_id = ? AND kind = ?", project.ID, "edit_plan").Order("created_at DESC").Limit(50).Find(&records).Error; err != nil {
			studioCloudError(c, err)
			return
		}
		result := []gin.H{}
		for i := range records {
			result = append(result, studioProductionRecordPayload(&records[i]))
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
		return
	}
	if studioClientDocumentVersion(c) < service.StudioDocumentVersion {
		studioCloudError(c, service.ErrStudioClientVersion)
		return
	}
	var request service.StudioEditRequest
	if err := common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, 32768), &request); err != nil {
		studioCloudError(c, errors.New("invalid edit plan request"))
		return
	}
	record, err := service.PrepareStudioEditPlan(c.Request.Context(), c.GetInt("id"), project.ID, request)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": studioProductionRecordPayload(record)})
}

func ApplyStudioProjectEditPlan(c *gin.Context) {
	if studioClientDocumentVersion(c) < service.StudioDocumentVersion {
		studioCloudError(c, service.ErrStudioClientVersion)
		return
	}
	record, err := model.ReadStudioProductionRecord(c.GetInt("id"), c.Param("plan_id"), true)
	if err != nil || record.ProjectID != c.Param("project_id") || record.Kind != "edit_plan" {
		studioCloudError(c, model.ErrStudioAccess)
		return
	}
	var request struct {
		Revision int64 `json:"revision"`
	}
	if common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, 1024), &request) != nil {
		studioCloudError(c, errors.New("invalid edit plan revision"))
		return
	}
	project, receipt, err := model.ApplyStudioEditRecord(c.GetInt("id"), record.ID, request.Revision, service.ValidateStudioIndexedBrollPlan)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	_, role, _ := model.StudioProjectAccess(model.DB, c.GetInt("id"), project.ID, false)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"project": studioProjectPayload(project, role), "applied_revision": receipt.AppliedRevision}})
}
