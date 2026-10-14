package controller

import (
	"errors"
	"net/http"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func StudioProjectConnectors(c *gin.Context) {
	project, _, err := model.StudioProjectAccess(model.DB, c.GetInt("id"), c.Param("project_id"), false)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	if project.OwnerID != c.GetInt("id") {
		studioCloudError(c, errors.New("external connections are managed by the project owner"))
		return
	}
	if c.Param("connector_id") == "" {
		values, err := service.StudioConnectorStatuses(c.GetInt("id"))
		if err != nil {
			studioCloudError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": values})
		return
	}
	values, err := service.ListStudioConnectorResources(c.Request.Context(), c.GetInt("id"), c.Param("connector_id"), c.Query("cursor"))
	if err != nil {
		studioCloudError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": values})
}
