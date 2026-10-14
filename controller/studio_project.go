package controller

import (
	"context"
	"encoding/json"
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
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func studioCloudError(c *gin.Context, err error) {
	status, code := http.StatusBadRequest, "studio_invalid_request"
	if errors.Is(err, model.ErrStudioAccess) || errors.Is(err, gorm.ErrRecordNotFound) {
		status, code = http.StatusNotFound, "studio_unavailable"
	}
	if errors.Is(err, model.ErrStudioRevision) {
		status, code = http.StatusConflict, "studio_revision_conflict"
	}
	if errors.Is(err, service.ErrStudioGenerationCredit) {
		status, code = http.StatusPaymentRequired, "studio_insufficient_quota"
	}
	c.JSON(status, gin.H{"success": false, "code": code, "message": err.Error()})
}

func studioProjectPayload(project *model.StudioProject, role string) gin.H {
	return gin.H{"id": project.ID, "owner_id": project.OwnerID, "title": project.Title, "revision": project.Revision, "role": role, "updated_at": project.UpdatedAt, "document": json.RawMessage(project.Document)}
}

func ListStudioProjects(c *gin.Context) {
	userID := c.GetInt("id")
	members := model.DB.Model(&model.StudioProjectMember{}).Select("project_id").Where("user_id = ?", userID)
	var projects []model.StudioProject
	if err := model.DB.Where("owner_id = ? OR id IN (?)", userID, members).Order("updated_at DESC").Limit(200).Find(&projects).Error; err != nil {
		studioCloudError(c, err)
		return
	}
	data := make([]gin.H, 0, len(projects))
	for _, project := range projects {
		_, role, err := model.StudioProjectAccess(model.DB, userID, project.ID, false)
		if err == nil {
			data = append(data, studioProjectPayload(&project, role))
		}
	}
	if c.Query("summary") == "true" {
		offset, offsetErr := strconv.Atoi(c.DefaultQuery("offset", "0"))
		limit, limitErr := strconv.Atoi(c.DefaultQuery("limit", "25"))
		if offsetErr != nil || limitErr != nil || offset < 0 || offset > 1000000 || limit < 1 || limit > 100 {
			studioCloudError(c, errors.New("invalid project page"))
			return
		}
		summaries := make([]gin.H, 0, min(limit, len(data)))
		end := min(len(data), offset+limit)
		for index := min(offset, len(data)); index < end; index++ {
			item := data[index]
			summaries = append(summaries, gin.H{"id": item["id"], "title": item["title"], "revision": item["revision"], "role": item["role"], "owner_id": item["owner_id"], "updated_at": item["updated_at"]})
		}
		var nextOffset any
		if end < len(data) {
			nextOffset = end
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"projects": summaries, "total": len(data), "nextOffset": nextOffset}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": data})
}

func ReadStudioProject(c *gin.Context) {
	project, role, err := model.StudioProjectAccess(model.DB, c.GetInt("id"), c.Param("project_id"), false)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": studioProjectPayload(project, role)})
}

func PutStudioProject(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, service.StudioMaxDocumentBytes+1024)
	var input struct {
		Revision int64           `json:"revision"`
		Document json.RawMessage `json:"document"`
	}
	if err := common.DecodeJson(c.Request.Body, &input); err != nil || input.Revision < 0 {
		studioCloudError(c, errors.New("invalid project revision or document"))
		return
	}
	title, err := service.ValidateStudioDocument(c.Param("project_id"), input.Document)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	var document map[string]any
	if err := common.Unmarshal(input.Document, &document); err != nil {
		studioCloudError(c, err)
		return
	}
	if err := service.ValidateStudioProjectMedia(c.GetInt("id"), c.Param("project_id"), document); err != nil {
		studioCloudError(c, err)
		return
	}
	if err := validateStudioReviewPreservation(c.GetInt("id"), c.Param("project_id"), document); err != nil {
		studioCloudError(c, err)
		return
	}
	if err := recordStudioStoryboardReviewEdits(c.GetInt("id"), c.Param("project_id"), input.Revision, document); err != nil {
		studioCloudError(c, err)
		return
	}
	encoded, err := common.Marshal(document)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	if _, err := service.ValidateStudioDocument(c.Param("project_id"), encoded); err != nil {
		studioCloudError(c, err)
		return
	}
	input.Document = encoded
	project, err := model.SaveStudioProject(c.GetInt("id"), c.Param("project_id"), title, input.Revision, string(input.Document))
	if err != nil {
		studioCloudError(c, err)
		return
	}
	_, role, _ := model.StudioProjectAccess(model.DB, c.GetInt("id"), project.ID, false)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": studioProjectPayload(project, role)})
}

func DeleteStudioProject(c *gin.Context) {
	project, role, err := model.StudioProjectAccess(model.DB, c.GetInt("id"), c.Param("project_id"), true)
	if err != nil || role != "owner" {
		studioCloudError(c, model.ErrStudioAccess)
		return
	}
	var active int64
	if err := model.DB.Model(&model.StudioWorkflowJob{}).Where("project_id = ? AND (status IN ? OR lease_until > ?)", project.ID, []string{"queued", "running", "waiting"}, time.Now().Unix()).Count(&active).Error; err != nil {
		studioCloudError(c, err)
		return
	}
	if active > 0 {
		studioCloudError(c, errors.New("pause or cancel active workflows before deleting the project"))
		return
	}
	if err := model.DB.Delete(project).Error; err != nil {
		studioCloudError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func StudioProjectVersions(c *gin.Context) {
	project, _, err := model.StudioProjectAccess(model.DB, c.GetInt("id"), c.Param("project_id"), false)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	var versions []model.StudioProjectVersion
	if err := model.DB.Select("id", "project_id", "revision", "author_id", "created_at").Where("project_id = ?", project.ID).Order("revision DESC").Limit(100).Find(&versions).Error; err != nil {
		studioCloudError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": versions})
}

func ReadStudioProjectVersion(c *gin.Context) {
	project, role, err := model.StudioProjectAccess(model.DB, c.GetInt("id"), c.Param("project_id"), false)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	var version model.StudioProjectVersion
	if err := model.DB.Where("project_id = ? AND revision = ?", project.ID, c.Param("revision")).First(&version).Error; err != nil {
		studioCloudError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"project_id": project.ID, "revision": version.Revision, "author_id": version.AuthorID, "created_at": version.CreatedAt, "role": role, "document": json.RawMessage(version.Document)}})
}

func StudioProjectTrash(c *gin.Context) {
	if c.Request.Method == http.MethodPost {
		project, err := model.RestoreStudioDeletedProject(c.GetInt("id"), c.Param("project_id"))
		if err != nil {
			studioCloudError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": studioProjectPayload(project, "owner")})
		return
	}
	var projects []model.StudioProject
	if err := model.DB.Unscoped().Select("id", "title", "revision", "deleted_at").Where("owner_id = ? AND deleted_at IS NOT NULL", c.GetInt("id")).Order("deleted_at DESC").Limit(200).Find(&projects).Error; err != nil {
		studioCloudError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": projects})
}

func RestoreStudioProjectVersion(c *gin.Context) {
	project, _, err := model.StudioProjectAccess(model.DB, c.GetInt("id"), c.Param("project_id"), true)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	var input struct {
		Revision         int64 `json:"revision"`
		ExpectedRevision int64 `json:"expected_revision"`
	}
	if err := common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, 2048), &input); err != nil {
		studioCloudError(c, err)
		return
	}
	var version model.StudioProjectVersion
	if err := model.DB.Where("project_id = ? AND revision = ?", project.ID, input.Revision).First(&version).Error; err != nil {
		studioCloudError(c, err)
		return
	}
	title, err := service.ValidateStudioDocument(project.ID, []byte(version.Document))
	if err != nil {
		studioCloudError(c, err)
		return
	}
	var document, current map[string]any
	if err := common.Unmarshal([]byte(version.Document), &document); err != nil {
		studioCloudError(c, err)
		return
	}
	if err := common.Unmarshal([]byte(project.Document), &current); err != nil {
		studioCloudError(c, err)
		return
	}
	if reviews := studioProductionReviews(current); len(reviews) > 0 {
		production, _ := document["production"].(map[string]any)
		if production == nil {
			production = map[string]any{}
			document["production"] = production
		}
		production["reviews"] = reviews
	}
	// Named checkpoints describe the project's history, so restoring creative
	// content must not erase names added after the selected snapshot.
	if currentProduction, ok := current["production"].(map[string]any); ok {
		if milestones, ok := currentProduction["milestones"].([]any); ok {
			production, _ := document["production"].(map[string]any)
			if production == nil {
				production = map[string]any{}
				document["production"] = production
			}
			production["milestones"] = milestones
		}
	}
	raw, err := common.Marshal(document)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	restored, err := model.SaveStudioProject(c.GetInt("id"), project.ID, title, input.ExpectedRevision, string(raw))
	if err != nil {
		studioCloudError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": studioProjectPayload(restored, "editor")})
}

func StudioProjectMembers(c *gin.Context) {
	project, role, err := model.StudioProjectAccess(model.DB, c.GetInt("id"), c.Param("project_id"), false)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	if c.Request.Method == http.MethodGet {
		var members []model.StudioProjectMember
		if err := model.DB.Where("project_id = ?", project.ID).Find(&members).Error; err != nil {
			studioCloudError(c, err)
			return
		}
		ids := make([]int, 0, len(members))
		for _, member := range members {
			ids = append(ids, member.UserID)
		}
		var users []model.User
		if len(ids) > 0 {
			if err := model.DB.Select("id", "username", "display_name").Where("id IN ?", ids).Find(&users).Error; err != nil {
				studioCloudError(c, err)
				return
			}
		}
		names := make(map[int]model.User, len(users))
		for _, user := range users {
			names[user.Id] = user
		}
		result := make([]gin.H, 0, len(members))
		for _, member := range members {
			user := names[member.UserID]
			result = append(result, gin.H{"user_id": member.UserID, "role": member.Role, "username": user.Username, "display_name": user.DisplayName})
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
		return
	}
	if role != "owner" {
		studioCloudError(c, model.ErrStudioAccess)
		return
	}
	var input struct {
		UserID   int    `json:"user_id"`
		Role     string `json:"role"`
		Username string `json:"username"`
	}
	if err := common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, 2048), &input); err != nil {
		studioCloudError(c, errors.New("invalid project member"))
		return
	}
	if input.UserID == 0 && strings.TrimSpace(input.Username) != "" {
		var recipient model.User
		if len(input.Username) > 80 || model.DB.Select("id").Where("username = ?", strings.TrimSpace(input.Username)).First(&recipient).Error != nil {
			studioCloudError(c, errors.New("account is unavailable"))
			return
		}
		input.UserID = recipient.Id
	}
	if input.UserID <= 0 || input.UserID == project.OwnerID {
		studioCloudError(c, errors.New("invalid project member"))
		return
	}
	if c.Request.Method == http.MethodDelete {
		err = model.DB.Where("project_id = ? AND user_id = ?", project.ID, input.UserID).Delete(&model.StudioProjectMember{}).Error
	} else {
		if input.Role != "editor" && input.Role != "reviewer" && input.Role != "viewer" {
			studioCloudError(c, errors.New("invalid project role"))
			return
		}
		if user, e := model.GetUserById(input.UserID, false); e != nil || user == nil {
			studioCloudError(c, errors.New("account is unavailable"))
			return
		}
		member := model.StudioProjectMember{ProjectID: project.ID, UserID: input.UserID, Role: input.Role}
		err = model.DB.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "project_id"}, {Name: "user_id"}}, DoUpdates: clause.AssignmentColumns([]string{"role"})}).Create(&member).Error
	}
	if err != nil {
		studioCloudError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func StudioProjectComments(c *gin.Context) {
	project, role, err := model.StudioProjectAccess(model.DB, c.GetInt("id"), c.Param("project_id"), false)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	if c.Request.Method == http.MethodGet {
		var comments []model.StudioReviewComment
		if err := model.DB.Where("project_id = ?", project.ID).Order("id DESC").Limit(1000).Find(&comments).Error; err != nil {
			studioCloudError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": comments})
		return
	}
	if role == "viewer" {
		studioCloudError(c, model.ErrStudioAccess)
		return
	}
	if c.Request.Method == http.MethodPatch {
		var input struct {
			ID       uint `json:"id"`
			Resolved bool `json:"resolved"`
		}
		if err := common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, 2048), &input); err != nil {
			studioCloudError(c, err)
			return
		}
		query := model.DB.Model(&model.StudioReviewComment{}).Where("id = ? AND project_id = ?", input.ID, project.ID)
		if role != "owner" && role != "editor" {
			query = query.Where("author_id = ?", c.GetInt("id"))
		}
		result := query.Update("resolved", input.Resolved)
		if result.Error != nil || result.RowsAffected != 1 {
			studioCloudError(c, model.ErrStudioAccess)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true})
		return
	}
	var input model.StudioReviewComment
	if err := common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, 16384), &input); err != nil || len([]rune(input.Message)) > 2000 || strings.TrimSpace(input.Message) == "" || math.IsNaN(input.Seconds) || math.IsInf(input.Seconds, 0) || input.Seconds < 0 || input.Seconds > 3600 || len(input.NodeID) > 128 || len(input.TakeID) > 128 || input.Revision > project.Revision || input.Revision < 1 {
		studioCloudError(c, errors.New("invalid review comment"))
		return
	}
	comment := model.StudioReviewComment{ProjectID: project.ID, Revision: input.Revision, AuthorID: c.GetInt("id"), NodeID: input.NodeID, TakeID: input.TakeID, Seconds: input.Seconds, Message: input.Message}
	if err := model.DB.Create(&comment).Error; err != nil {
		studioCloudError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": comment})
}

func StudioProjectMedia(c *gin.Context) {
	ownerID := c.GetInt("id")
	projectID := c.Query("project_id")
	if projectID != "" {
		project, _, err := model.StudioProjectAccess(model.DB, ownerID, projectID, c.Request.Method == http.MethodPut)
		if err != nil {
			studioCloudError(c, err)
			return
		}
		ownerID = project.OwnerID
		if c.Request.Method == http.MethodGet && project.OwnerID != c.GetInt("id") && !service.StudioProjectHasMedia(project.ID, c.Param("media_id")) {
			studioCloudError(c, model.ErrStudioAccess)
			return
		}
	}
	mediaID := c.Param("media_id")
	if !service.StudioIDPattern.MatchString(mediaID) {
		studioCloudError(c, errors.New("invalid media ID"))
		return
	}
	if c.Request.Method == http.MethodPut {
		if ownerID != c.GetInt("id") && !service.StudioProjectHasMedia(projectID, mediaID) {
			var existing model.StudioMedia
			if model.DB.Where("owner_id = ? AND media_id = ?", ownerID, mediaID).First(&existing).Error == nil {
				studioCloudError(c, model.ErrStudioAccess)
				return
			}
		}
		media, err := service.SaveStudioMedia(ownerID, mediaID, c.GetHeader("Content-Type"), http.MaxBytesReader(c.Writer, c.Request.Body, service.StudioMaxMediaBytes+1))
		if err != nil {
			studioCloudError(c, err)
			return
		}
		if projectID != "" {
			if err := service.LinkStudioProjectMedia(projectID, mediaID); err != nil {
				studioCloudError(c, err)
				return
			}
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": media})
		return
	}
	media, err := service.GetStudioMedia(ownerID, mediaID)
	if err != nil {
		studioCloudError(c, model.ErrStudioAccess)
		return
	}
	path, err := service.StudioMediaPath(media)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	if strings.HasSuffix(c.FullPath(), "/probe") {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
		defer cancel()
		probe, err := service.ProbeStudioMedia(ctx, path)
		if err != nil {
			studioCloudError(c, errors.New("stored media metadata could not be read"))
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": probe})
		return
	}
	c.Header("Content-Type", media.MimeType)
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Content-Disposition", "attachment; filename=\""+media.MediaID+"\"")
	c.Header("ETag", "\""+media.Digest+"\"")
	c.Header("Content-Length", strconv.FormatInt(media.Size, 10))
	c.File(path)
}
