package controller

import (
	"errors"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

// Archiving only removes an unused Take from the active canvas. Immutable
// project versions and linked source media remain available for restoration.
func ArchiveStudioProjectTake(c *gin.Context) {
	project, role, err := model.StudioProjectAccess(model.DB, c.GetInt("id"), c.Param("project_id"), true)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	var input struct {
		Revision int64  `json:"revision"`
		NodeID   string `json:"node_id"`
		TakeID   string `json:"take_id"`
	}
	if err := common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, 2048), &input); err != nil || !service.StudioIDPattern.MatchString(input.NodeID) || !service.StudioIDPattern.MatchString(input.TakeID) {
		studioCloudError(c, errors.New("invalid Take archive request"))
		return
	}
	if project.Revision != input.Revision {
		studioCloudError(c, model.ErrStudioRevision)
		return
	}
	var doc map[string]any
	if err := common.Unmarshal([]byte(project.Document), &doc); err != nil {
		studioCloudError(c, err)
		return
	}
	nodes, _ := doc["nodes"].([]any)
	var data map[string]any
	for _, raw := range nodes {
		node, _ := raw.(map[string]any)
		if node["id"] == input.NodeID {
			data, _ = node["data"].(map[string]any)
		}
	}
	if data == nil || data["selectedTakeId"] == input.TakeID {
		studioCloudError(c, errors.New("selected or unavailable Take cannot be archived"))
		return
	}
	edges, _ := doc["edges"].([]any)
	for _, raw := range edges {
		edge, _ := raw.(map[string]any)
		pin, _ := edge["data"].(map[string]any)
		if edge["source"] == input.NodeID && pin["sourceTakeId"] == input.TakeID {
			studioCloudError(c, errors.New("unpin the Take connection before archiving"))
			return
		}
	}
	production, _ := doc["production"].(map[string]any)
	timeline, _ := production["timeline"].([]any)
	for _, raw := range timeline {
		clip, _ := raw.(map[string]any)
		if clip["nodeId"] == input.NodeID && clip["takeId"] == input.TakeID {
			studioCloudError(c, errors.New("unpin the timeline Take before archiving"))
			return
		}
	}
	takes, _ := data["takes"].([]any)
	retained := []any{}
	found := false
	for _, raw := range takes {
		take, _ := raw.(map[string]any)
		if take["id"] != input.TakeID {
			retained = append(retained, raw)
			continue
		}
		if take["status"] != "completed" && take["status"] != "failed" {
			studioCloudError(c, errors.New("unfinished Take cannot be archived"))
			return
		}
		found = true
	}
	if !found {
		studioCloudError(c, errors.New("Take is unavailable"))
		return
	}
	data["takes"] = retained
	raw, err := common.Marshal(doc)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	project, err = model.SaveStudioProject(c.GetInt("id"), project.ID, project.Title, project.Revision, string(raw))
	if err != nil {
		studioCloudError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": studioProjectPayload(project, role)})
}
