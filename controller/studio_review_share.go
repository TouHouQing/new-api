package controller

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func StudioProjectReviewShares(c *gin.Context) {
	project, role, err := model.StudioProjectAccess(model.DB, c.GetInt("id"), c.Param("project_id"), true)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	if c.Request.Method == http.MethodGet {
		var shares []model.StudioReviewShare
		err = model.DB.Where("project_id = ?", project.ID).Order("created_at DESC").Limit(100).Find(&shares).Error
		if err != nil {
			studioCloudError(c, err)
			return
		}
		c.JSON(200, gin.H{"success": true, "data": shares})
		return
	}
	if c.Request.Method == http.MethodDelete {
		if role != "owner" {
			studioCloudError(c, model.ErrStudioAccess)
			return
		}
		result := model.DB.Model(&model.StudioReviewShare{}).Where("id = ? AND project_id = ?", c.Param("share_id"), project.ID).Update("revoked_at", time.Now())
		if result.Error != nil || result.RowsAffected == 0 {
			studioCloudError(c, model.ErrStudioAccess)
			return
		}
		c.JSON(200, gin.H{"success": true})
		return
	}
	var input struct {
		Revision      int64  `json:"revision"`
		MediaID       string `json:"media_id"`
		NodeID        string `json:"node_id"`
		TakeID        string `json:"take_id"`
		ExpiresHours  int    `json:"expires_hours"`
		AllowComments bool   `json:"allow_comments"`
	}
	if common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, 4096), &input) != nil || !service.StudioIDPattern.MatchString(input.MediaID) || input.ExpiresHours < 1 || input.ExpiresHours > 720 {
		studioCloudError(c, errors.New("invalid review link configuration"))
		return
	}
	if input.Revision != project.Revision {
		studioCloudError(c, model.ErrStudioRevision)
		return
	}
	var link model.StudioProjectMediaLink
	if model.DB.Where("project_id = ? AND media_id = ?", project.ID, input.MediaID).First(&link).Error != nil {
		studioCloudError(c, model.ErrStudioAccess)
		return
	}
	media, err := service.GetStudioMedia(project.OwnerID, input.MediaID)
	if err != nil || !strings.HasPrefix(media.MimeType, "video/") {
		studioCloudError(c, model.ErrStudioAccess)
		return
	}
	if input.NodeID != "" {
		var document map[string]any
		if common.Unmarshal([]byte(project.Document), &document) != nil {
			studioCloudError(c, model.ErrStudioAccess)
			return
		}
		found := false
		nodes, _ := document["nodes"].([]any)
		for _, value := range nodes {
			node, _ := value.(map[string]any)
			if node["id"] != input.NodeID {
				continue
			}
			data, _ := node["data"].(map[string]any)
			takes, _ := data["takes"].([]any)
			for _, value := range takes {
				take, _ := value.(map[string]any)
				if take["id"] == input.TakeID && take["mediaId"] == input.MediaID {
					found = true
				}
			}
		}
		if !found {
			studioCloudError(c, errors.New("review link must match an exact stored Take"))
			return
		}
	}
	secret := make([]byte, 32)
	if _, err = rand.Read(secret); err != nil {
		studioCloudError(c, err)
		return
	}
	token := base64.RawURLEncoding.EncodeToString(secret)
	digest := sha256.Sum256([]byte(token))
	share := model.StudioReviewShare{ID: uuid.NewString(), ProjectID: project.ID, CreatorID: c.GetInt("id"), TokenHash: hex.EncodeToString(digest[:]), Revision: project.Revision, MediaID: input.MediaID, NodeID: input.NodeID, TakeID: input.TakeID, AllowComments: input.AllowComments, ExpiresAt: time.Now().Add(time.Duration(input.ExpiresHours) * time.Hour)}
	if job, _ := studioDeliveryReviewSource(project.ID, input.MediaID); job != nil {
		share.Revision = job.Revision
	}
	if err := model.DB.Create(&share).Error; err != nil {
		studioCloudError(c, err)
		return
	}
	c.JSON(200, gin.H{"success": true, "data": gin.H{"share": share, "url": "/studio-review#id=" + share.ID + "&token=" + token}})
}

func ReadStudioReviewShare(c *gin.Context) {
	token := c.GetHeader("X-Studio-Review-Token")
	digest := sha256.Sum256([]byte(token))
	var share model.StudioReviewShare
	if len(token) != 43 || model.DB.Where("id = ? AND revoked_at IS NULL AND expires_at > ?", c.Param("share_id"), time.Now()).First(&share).Error != nil || subtle.ConstantTimeCompare([]byte(share.TokenHash), []byte(hex.EncodeToString(digest[:]))) != 1 {
		studioCloudError(c, model.ErrStudioAccess)
		return
	}
	project, _, err := model.StudioProjectAccess(model.DB, share.CreatorID, share.ProjectID, true)
	if err != nil {
		studioCloudError(c, model.ErrStudioAccess)
		return
	}
	c.Header("Referrer-Policy", "no-referrer")
	c.Header("Cache-Control", "no-store")
	if c.Param("media_id") != "" {
		if c.Param("media_id") != share.MediaID {
			studioCloudError(c, model.ErrStudioAccess)
			return
		}
		media, err := service.GetStudioMedia(project.OwnerID, share.MediaID)
		if err != nil {
			studioCloudError(c, model.ErrStudioAccess)
			return
		}
		path, err := service.StudioMediaPath(media)
		if err != nil {
			studioCloudError(c, err)
			return
		}
		c.Header("Content-Type", media.MimeType)
		c.Header("X-Content-Type-Options", "nosniff")
		c.File(path)
		return
	}
	if c.Request.Method == http.MethodPost {
		var input struct {
			Name    string  `json:"name"`
			Message string  `json:"message"`
			Seconds float64 `json:"seconds"`
		}
		if !share.AllowComments || common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, 12000), &input) != nil || len(input.Name) > 80 || strings.TrimSpace(input.Message) == "" || len(input.Message) > 2000 || math.IsNaN(input.Seconds) || math.IsInf(input.Seconds, 0) || input.Seconds < 0 || input.Seconds > 3600 {
			studioCloudError(c, errors.New("invalid review feedback"))
			return
		}
		comment := model.StudioReviewComment{ProjectID: project.ID, Revision: share.Revision, NodeID: share.NodeID, TakeID: share.TakeID, Seconds: input.Seconds, Message: "[Review link " + share.ID + " / " + strings.TrimSpace(input.Name) + "] " + input.Message}
		if comment.NodeID == "" {
			_, delivery := studioDeliveryReviewSource(project.ID, share.MediaID)
			position := 0.0
			for index, clip := range delivery.Clips {
				if index >= len(delivery.Durations) {
					break
				}
				if input.Seconds >= position && input.Seconds < position+delivery.Durations[index] {
					comment.NodeID, comment.TakeID = clip.NodeID, clip.TakeID
					break
				}
				position += delivery.Durations[index]
			}
		}
		if err := model.DB.Create(&comment).Error; err != nil {
			studioCloudError(c, err)
			return
		}
		c.JSON(200, gin.H{"success": true, "data": comment})
		return
	}
	c.JSON(200, gin.H{"success": true, "data": gin.H{"share": share, "title": project.Title}})
}

// Events survive browser closure and use an integer cursor independent of timezone.
func StudioProjectEvents(c *gin.Context) {
	project, _, err := model.StudioProjectAccess(model.DB, c.GetInt("id"), c.Param("project_id"), false)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	after := uint64(0)
	if raw := c.Query("after"); raw != "" {
		after, err = strconv.ParseUint(raw, 10, 63)
		if err != nil {
			studioCloudError(c, errors.New("invalid event cursor"))
			return
		}
	}
	// Backfill jobs produced before the event table existed, and repair a crash
	// between terminal settlement and event insertion without duplicating events.
	for _, status := range []string{"succeeded", "failed", "uncertain", "cancelled"} {
		existing := model.DB.Model(&model.StudioWorkflowEvent{}).Select("job_id").Where("project_id = ? AND status = ?", project.ID, status)
		var jobs []model.StudioWorkflowJob
		if err := model.DB.Select("id, project_id, status, kind, revision, error, updated_at").Where("project_id = ? AND status = ? AND id NOT IN (?)", project.ID, status, existing).Order("updated_at ASC, id ASC").Limit(100).Find(&jobs).Error; err != nil {
			studioCloudError(c, err)
			return
		}
		for _, job := range jobs {
			if err := model.RecordStudioWorkflowEvent(&job); err != nil {
				studioCloudError(c, err)
				return
			}
		}
	}
	var events []model.StudioWorkflowEvent
	if err := model.DB.Where("project_id = ? AND id > ?", project.ID, after).Order("id ASC").Limit(100).Find(&events).Error; err != nil {
		studioCloudError(c, err)
		return
	}
	cursor := strconv.FormatUint(after, 10)
	if len(events) > 0 {
		cursor = strconv.FormatUint(events[len(events)-1].ID, 10)
	}
	c.JSON(200, gin.H{"success": true, "data": gin.H{"events": events, "cursor": cursor}})
}

func StudioProjectRework(c *gin.Context) {
	project, role, err := model.StudioProjectAccess(model.DB, c.GetInt("id"), c.Param("project_id"), true)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	var input struct {
		Revision  int64  `json:"revision"`
		CommentID uint   `json:"comment_id"`
		Action    string `json:"action"`
	}
	if common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, 4096), &input) != nil || input.Revision != project.Revision || (input.Action != "regenerate" && input.Action != "edit" && input.Action != "audio") {
		studioCloudError(c, errors.New("invalid rework plan or stale revision"))
		return
	}
	var comment model.StudioReviewComment
	if model.DB.Where("id = ? AND project_id = ?", input.CommentID, project.ID).First(&comment).Error != nil {
		studioCloudError(c, model.ErrStudioAccess)
		return
	}
	var document map[string]any
	if common.Unmarshal([]byte(project.Document), &document) != nil {
		studioCloudError(c, model.ErrStudioAccess)
		return
	}
	production, _ := document["production"].(map[string]any)
	if production == nil {
		production = map[string]any{}
		document["production"] = production
	}
	changes, _ := production["changes"].([]any)
	requestID := "review-" + strconv.FormatUint(uint64(comment.ID), 10) + "-" + input.Action
	for _, value := range changes {
		change, _ := value.(map[string]any)
		if change["id"] == requestID {
			c.JSON(200, gin.H{"success": true, "data": studioProjectPayload(project, role)})
			return
		}
	}
	if len(changes) >= 200 {
		studioCloudError(c, errors.New("resolve previous rework plans first"))
		return
	}
	nodes := []string{}
	if comment.NodeID != "" {
		nodes = append(nodes, comment.NodeID)
	}
	if input.Action == "audio" {
		shots, _ := document["shots"].([]any)
		cues, _ := production["dialogueCues"].([]any)
		projectNodes, _ := document["nodes"].([]any)
		for _, shot := range shots {
			item, _ := shot.(map[string]any)
			if item["videoNodeId"] != comment.NodeID {
				continue
			}
			for _, cue := range cues {
				value, _ := cue.(map[string]any)
				if value["shotId"] != item["id"] {
					continue
				}
				for _, object := range projectNodes {
					node, _ := object.(map[string]any)
					data, _ := node["data"].(map[string]any)
					if data["kind"] == "audio" && value["audioMediaId"] != nil && data["mediaId"] == value["audioMediaId"] {
						if id, ok := node["id"].(string); ok {
							nodes = []string{id}
						}
					}
				}
			}
		}
	}
	message := []rune(input.Action + " at " + strconv.FormatFloat(comment.Seconds, 'f', 2, 64) + "s: " + comment.Message)
	if len(message) > 2000 {
		message = message[:2000]
	}
	changes = append(changes, map[string]any{"id": requestID, "kind": "review", "action": input.Action, "commentId": comment.ID, "seconds": comment.Seconds, "takeId": comment.TakeID, "message": string(message), "nodeIds": nodes, "status": "pending", "createdAt": time.Now().UTC().Format(time.RFC3339)})
	production["changes"] = changes
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
	c.JSON(200, gin.H{"success": true, "data": studioProjectPayload(project, role)})
}

type studioReviewDelivery struct {
	MediaID   string                     `json:"media_id"`
	Clips     []service.StudioRenderClip `json:"clips"`
	Durations []float64                  `json:"clip_durations"`
}

func studioDeliveryReviewSource(projectID, mediaID string) (*model.StudioWorkflowJob, studioReviewDelivery) {
	var jobs []model.StudioWorkflowJob
	model.DB.Where("project_id = ? AND kind = ? AND status = ?", projectID, "render", "succeeded").Order("updated_at DESC").Limit(100).Find(&jobs)
	for _, job := range jobs {
		var delivery studioReviewDelivery
		if common.Unmarshal([]byte(job.Result), &delivery) == nil && delivery.MediaID == mediaID {
			return &job, delivery
		}
	}
	return nil, studioReviewDelivery{}
}
