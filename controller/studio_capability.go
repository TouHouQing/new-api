package controller

import (
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"net/http"
)

func StudioModelCapabilityProfiles(c *gin.Context) {
	group := c.GetString("group")
	result, err := service.StudioCapabilityProfiles(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"profiles": []any{}, "status": "unknown", "message": err.Error()}})
		return
	}
	allowed := map[string]bool{}
	for _, name := range model.GetGroupEnabledModels(group) {
		allowed[name] = true
	}
	profiles := []any{}
	for _, value := range result["profiles"].([]any) {
		entry, _ := value.(map[string]any)
		if name, _ := entry["modelId"].(string); allowed[name] {
			profiles = append(profiles, entry)
		}
	}
	result["profiles"] = profiles
	c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
}
