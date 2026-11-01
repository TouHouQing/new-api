package controller

import (
	"errors"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func StudioProjectSceneStudies(c *gin.Context) {
	project, _, err := model.StudioProjectAccess(model.DB, c.GetInt("id"), c.Param("project_id"), c.Request.Method != http.MethodGet)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	if c.Request.Method == http.MethodGet {
		var records []model.StudioProductionRecord
		if err := model.DB.Where("project_id = ? AND kind IN ?", project.ID, []string{"analysis", "edit_plan"}).Order("created_at DESC").Limit(500).Find(&records).Error; err != nil {
			studioCloudError(c, err)
			return
		}
		result := []gin.H{}
		for i := range records {
			var payload struct {
				Kind   string `json:"kind"`
				Impact struct {
					Action string `json:"action"`
				} `json:"impact"`
			}
			if common.Unmarshal([]byte(records[i].Document), &payload) == nil && (payload.Kind == "scene_correction" || payload.Impact.Action == "adapt_scene_structure") {
				result = append(result, studioProductionRecordPayload(&records[i]))
			}
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
		return
	}
	var raw map[string]any
	if common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, 2<<20), &raw) != nil {
		studioCloudError(c, errors.New("invalid scene-study request"))
		return
	}
	content, err := common.Marshal(raw)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	if raw["action"] == "correct" {
		var request service.StudioSceneCorrectionRequest
		if common.Unmarshal(content, &request) != nil {
			studioCloudError(c, errors.New("invalid scene-cut correction"))
			return
		}
		record, err := service.SaveStudioSceneCorrection(c.Request.Context(), c.GetInt("id"), project.ID, request)
		if err != nil {
			studioCloudError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": studioProductionRecordPayload(record)})
		return
	}
	if raw["action"] != "prepare" {
		studioCloudError(c, errors.New("choose correct or prepare for a scene study"))
		return
	}
	var request service.StudioSceneAdaptationRequest
	if common.Unmarshal(content, &request) != nil {
		studioCloudError(c, errors.New("invalid scene adaptation"))
		return
	}
	record, err := service.PrepareStudioSceneAdaptation(c.Request.Context(), c.GetInt("id"), project.ID, request)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": studioProductionRecordPayload(record)})
}
