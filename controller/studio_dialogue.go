package controller

import (
	"context"
	"errors"
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"net/http"
	"time"
)

// Match video duration to recorded dialogue without another model submission.
func AlignStudioProjectDialogue(c *gin.Context) {
	project, role, err := model.StudioProjectAccess(model.DB, c.GetInt("id"), c.Param("project_id"), true)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	var input struct {
		Revision int64 `json:"revision"`
	}
	if common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, 2048), &input) != nil || input.Revision != project.Revision {
		studioCloudError(c, model.ErrStudioRevision)
		return
	}
	var document map[string]any
	if common.Unmarshal([]byte(project.Document), &document) != nil {
		studioCloudError(c, model.ErrStudioAccess)
		return
	}
	production, _ := document["production"].(map[string]any)
	if production == nil {
		studioCloudError(c, errors.New("dialogue cues are unavailable"))
		return
	}
	timeline, _ := production["timeline"].([]any)
	shots, _ := document["shots"].([]any)
	nodes, _ := document["nodes"].([]any)
	if len(timeline) == 0 {
		for _, value := range shots {
			shot, _ := value.(map[string]any)
			timeline = append(timeline, map[string]any{"id": shot["id"], "nodeId": shot["videoNodeId"], "trimStart": 0, "speed": 1, "volume": 1, "muted": false, "caption": "", "captionOffset": 0, "captionDuration": 0, "fadeIn": 0, "fadeOut": 0})
		}
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Minute)
	defer cancel()
	cues, _ := production["dialogueCues"].([]any)
	for _, value := range timeline {
		clip, _ := value.(map[string]any)
		shotID := ""
		for _, value := range shots {
			shot, _ := value.(map[string]any)
			if shot["videoNodeId"] == clip["nodeId"] {
				shotID, _ = shot["id"].(string)
			}
		}
		required := 0.0
		for _, value := range cues {
			cue, _ := value.(map[string]any)
			if cue["shotId"] != shotID || cue["audioMediaId"] == nil {
				continue
			}
			mediaID, _ := cue["audioMediaId"].(string)
			media, err := service.GetStudioMedia(project.OwnerID, mediaID)
			if err != nil {
				studioCloudError(c, err)
				return
			}
			path, err := service.StudioMediaPath(media)
			if err != nil {
				studioCloudError(c, err)
				return
			}
			probe, err := service.ProbeStudioMedia(ctx, path)
			if err != nil || !probe.HasAudio {
				studioCloudError(c, errors.New("dialogue audio is unavailable"))
				return
			}
			offset, _ := cue["offset"].(float64)
			cue["duration"] = probe.Duration
			required = max(required, offset+probe.Duration)
		}
		if required == 0 {
			continue
		}
		mediaID := ""
		for _, value := range nodes {
			node, _ := value.(map[string]any)
			if node["id"] != clip["nodeId"] {
				continue
			}
			data, _ := node["data"].(map[string]any)
			mediaID, _ = data["mediaId"].(string)
			if clip["takeId"] != nil {
				takes, _ := data["takes"].([]any)
				for _, value := range takes {
					take, _ := value.(map[string]any)
					if take["id"] == clip["takeId"] {
						mediaID, _ = take["mediaId"].(string)
					}
				}
			}
		}
		media, err := service.GetStudioMedia(project.OwnerID, mediaID)
		if err != nil {
			studioCloudError(c, err)
			return
		}
		path, err := service.StudioMediaPath(media)
		if err != nil {
			studioCloudError(c, err)
			return
		}
		probe, err := service.ProbeStudioMedia(ctx, path)
		if err != nil || !probe.HasVideo {
			studioCloudError(c, errors.New("dialogue video is unavailable"))
			return
		}
		start, _ := clip["trimStart"].(float64)
		end, ok := clip["trimEnd"].(float64)
		if !ok {
			end = probe.Duration
		}
		end = min(end, probe.Duration)
		if end <= start {
			studioCloudError(c, errors.New("invalid clip trim"))
			return
		}
		speed, ok := clip["speed"].(float64)
		if !ok {
			speed = 1
		}
		if (end-start)/speed < required {
			speed = (end - start) / required
			if speed < .25 {
				studioCloudError(c, errors.New("dialogue needs a longer video or shorter speech; alignment exceeds the supported speed range"))
				return
			}
			clip["speed"] = speed
		}
	}
	production["timeline"], production["timelineEdited"] = timeline, true
	raw, err := common.Marshal(document)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	if _, err := service.ValidateStudioDocument(project.ID, raw); err != nil {
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
