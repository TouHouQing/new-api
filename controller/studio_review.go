package controller

import (
	"bytes"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func studioProductionReviews(document map[string]any) []any {
	production, _ := document["production"].(map[string]any)
	reviews, _ := production["reviews"].([]any)
	if reviews == nil {
		return []any{}
	}
	return reviews
}

// General saves cannot impersonate a reviewer or remove a review trail.
func validateStudioReviewPreservation(userID int, projectID string, document map[string]any) error {
	var original map[string]any
	project, _, err := model.StudioProjectAccess(model.DB, userID, projectID, false)
	if err == nil {
		if err := common.Unmarshal([]byte(project.Document), &original); err != nil {
			return err
		}
	}
	before, err := common.Marshal(studioProductionReviews(original))
	if err != nil {
		return err
	}
	after, err := common.Marshal(studioProductionReviews(document))
	if err != nil {
		return err
	}
	if !bytes.Equal(before, after) {
		return errors.New("use the review action to change review decisions")
	}
	return nil
}

// Existing storyboard controls edit shot.reviewStatus. Convert an explicit
// change into an exact media review with server-derived author provenance.
// Retaining an old status while replacing a Take never approves the new media.
func recordStudioStoryboardReviewEdits(userID int, projectID string, revision int64, document map[string]any) error {
	var before map[string]any
	ownerID := userID
	if project, role, err := model.StudioProjectAccess(model.DB, userID, projectID, false); err == nil {
		if role != "owner" && role != "editor" {
			return model.ErrStudioAccess
		}
		ownerID = project.OwnerID
		if err := common.Unmarshal([]byte(project.Document), &before); err != nil {
			return err
		}
	}
	objects := func(doc map[string]any, key string) []map[string]any {
		values, _ := doc[key].([]any)
		result := []map[string]any{}
		for _, value := range values {
			if item, ok := value.(map[string]any); ok {
				result = append(result, item)
			}
		}
		return result
	}
	for _, shot := range objects(document, "shots") {
		status, _ := shot["reviewStatus"].(string)
		if status == "" {
			continue
		}
		var old map[string]any
		for _, item := range objects(before, "shots") {
			if item["id"] == shot["id"] {
				old = item
				break
			}
		}
		var data, previous map[string]any
		for _, node := range objects(document, "nodes") {
			if node["id"] == shot["videoNodeId"] {
				data, _ = node["data"].(map[string]any)
			}
		}
		for _, node := range objects(before, "nodes") {
			if node["id"] == shot["videoNodeId"] {
				previous, _ = node["data"].(map[string]any)
			}
		}
		if status == old["reviewStatus"] {
			if data["mediaId"] != previous["mediaId"] || data["selectedTakeId"] != previous["selectedTakeId"] {
				shot["reviewStatus"] = "unreviewed"
			}
			continue
		}
		mediaID, _ := data["mediaId"].(string)
		takeID, _ := data["selectedTakeId"].(string)
		if mediaID == "" || data["status"] != "completed" {
			if status == "approved" {
				return errors.New("approve a completed, stored video Take")
			}
			continue
		}
		if _, err := service.GetStudioMedia(ownerID, mediaID); err != nil {
			return err
		}
		production, _ := document["production"].(map[string]any)
		if production == nil {
			production = map[string]any{}
			document["production"] = production
		}
		reviews := studioProductionReviews(document)
		if len(reviews) >= 500 {
			return errors.New("project review limit reached")
		}
		note, _ := shot["reviewNote"].(string)
		production["reviews"] = append(reviews, map[string]any{"nodeId": shot["videoNodeId"], "takeId": takeID, "mediaId": mediaID, "status": status, "reviewerId": userID, "revision": max(1, revision), "reviewedAt": time.Now().UTC().Format(time.RFC3339Nano), "note": note})
	}
	return nil
}

func ReviewStudioProjectTake(c *gin.Context) {
	project, role, err := model.StudioProjectAccess(model.DB, c.GetInt("id"), c.Param("project_id"), false)
	if err != nil || role == "viewer" {
		studioCloudError(c, model.ErrStudioAccess)
		return
	}
	var input struct {
		Revision int64  `json:"revision"`
		NodeID   string `json:"node_id"`
		TakeID   string `json:"take_id"`
		Status   string `json:"status"`
		Note     string `json:"note"`
	}
	if err := common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, 16384), &input); err != nil || input.Status != "approved" && input.Status != "retake" && input.Status != "unreviewed" || len([]rune(input.Note)) > 2000 {
		studioCloudError(c, errors.New("invalid review decision"))
		return
	}
	if input.Revision != project.Revision {
		studioCloudError(c, model.ErrStudioRevision)
		return
	}
	var document map[string]any
	if err := common.Unmarshal([]byte(project.Document), &document); err != nil {
		studioCloudError(c, err)
		return
	}
	nodes, _ := document["nodes"].([]any)
	mediaID := ""
	mediaKind := ""
	selected := false
	for _, value := range nodes {
		node, _ := value.(map[string]any)
		if node["id"] != input.NodeID {
			continue
		}
		data, _ := node["data"].(map[string]any)
		if data["kind"] != "video" && data["kind"] != "image" && data["kind"] != "audio" {
			continue
		}
		mediaKind, _ = data["kind"].(string)
		if input.TakeID == "" {
			mediaID, _ = data["mediaId"].(string)
			selected = true
		} else {
			takes, _ := data["takes"].([]any)
			for _, value := range takes {
				take, _ := value.(map[string]any)
				if take["id"] == input.TakeID && take["status"] == "completed" {
					mediaID, _ = take["mediaId"].(string)
					selected = data["selectedTakeId"] == input.TakeID
					break
				}
			}
		}
	}
	if mediaID == "" {
		studioCloudError(c, errors.New("review a completed, stored image, audio or video Take"))
		return
	}
	stored, err := service.GetStudioMedia(project.OwnerID, mediaID)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	if !strings.HasPrefix(stored.MimeType, mediaKind+"/") {
		studioCloudError(c, errors.New("the stored media does not match the reviewed node type"))
		return
	}
	production, _ := document["production"].(map[string]any)
	if production == nil {
		production = map[string]any{}
		document["production"] = production
	}
	reviews := studioProductionReviews(document)
	if len(reviews) >= 500 {
		studioCloudError(c, errors.New("project review limit reached; archive a delivery version"))
		return
	}
	reviews = append(reviews, map[string]any{"nodeId": input.NodeID, "takeId": input.TakeID, "mediaId": mediaID, "status": input.Status, "reviewerId": c.GetInt("id"), "revision": project.Revision, "reviewedAt": time.Now().UTC().Format(time.RFC3339Nano), "note": input.Note})
	production["reviews"] = reviews
	if selected {
		shots, _ := document["shots"].([]any)
		for _, value := range shots {
			shot, _ := value.(map[string]any)
			if shot["videoNodeId"] == input.NodeID {
				shot["reviewStatus"], shot["reviewNote"] = input.Status, input.Note
			}
		}
	}
	raw, err := common.Marshal(document)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	if _, err := service.ValidateStudioDocument(project.ID, raw); err != nil {
		studioCloudError(c, err)
		return
	}
	saved, err := model.SaveStudioProjectReview(c.GetInt("id"), project.ID, project.Title, project.Revision, string(raw))
	if err != nil {
		studioCloudError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": studioProjectPayload(saved, role)})
}
