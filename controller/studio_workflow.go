package controller

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"mime"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	studioagent "github.com/QuantumNous/new-api/integrations/studio-agent"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

// Collect completed gateway tasks into durable, project-owned media. This also
// repairs browser-created video nodes whose upstream URLs have not been cached.
func MaterializeStudioProject(c *gin.Context) {
	project, role, err := model.StudioProjectAccess(model.DB, c.GetInt("id"), c.Param("project_id"), true)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	var document map[string]any
	if err := common.Unmarshal([]byte(project.Document), &document); err != nil {
		studioCloudError(c, err)
		return
	}
	nodes, _ := document["nodes"].([]any)
	changed := false
	for _, value := range nodes {
		node, ok := value.(map[string]any)
		if !ok {
			continue
		}
		data, _ := node["data"].(map[string]any)
		if data == nil || data["kind"] != "video" || data["mediaId"] != nil && data["mediaId"] != "" {
			continue
		}
		taskID, _ := data["taskId"].(string)
		if taskID == "" {
			continue
		}
		var task model.Task
		if model.DB.Where("task_id = ? AND user_id = ?", taskID, c.GetInt("id")).First(&task).Error != nil || task.Status != model.TaskStatusSuccess {
			studioCloudError(c, errors.New("video task is unavailable or incomplete"))
			return
		}
		if service.StudioWorkflowRelay == nil {
			studioCloudError(c, errors.New("media relay is unavailable"))
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Minute)
		response, relayErr := service.StudioWorkflowRelay(ctx, &model.StudioWorkflowJob{UserID: c.GetInt("id")}, "media:"+taskID, nil)
		cancel()
		if relayErr != nil || response.Status < 200 || response.Status >= 300 {
			studioCloudError(c, errors.New("video download failed"))
			return
		}
		media, err := service.SaveStudioMedia(project.OwnerID, "task-"+taskID, response.ContentType, bytes.NewReader(response.Body))
		if err != nil {
			studioCloudError(c, err)
			return
		}
		data["mediaId"] = media.MediaID
		if err := service.LinkStudioProjectMedia(project.ID, media.MediaID); err != nil {
			studioCloudError(c, err)
			return
		}
		if takes, ok := data["takes"].([]any); ok {
			for _, value := range takes {
				if take, ok := value.(map[string]any); ok && take["id"] == data["selectedTakeId"] {
					take["mediaId"] = media.MediaID
				}
			}
		}
		changed = true
	}
	if changed {
		raw, err := common.Marshal(document)
		if err != nil {
			studioCloudError(c, err)
			return
		}
		project, err = model.SaveStudioProject(c.GetInt("id"), project.ID, project.Title, project.Revision, string(raw))
		if err != nil {
			studioCloudError(c, err)
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": studioProjectPayload(project, role)})
}

func studioJobPayload(job *model.StudioWorkflowJob) gin.H {
	var plan struct {
		NodeIDs         []string                       `json:"node_ids"`
		Operation       *service.StudioMediaOperation  `json:"operation"`
		ConnectorTarget *service.StudioConnectorTarget `json:"connector_target"`
	}
	_ = common.Unmarshal([]byte(job.Plan), &plan)
	if len(plan.NodeIDs) == 0 && plan.Operation != nil && plan.Operation.NodeID != "" {
		plan.NodeIDs = []string{plan.Operation.NodeID}
	}
	value := gin.H{"id": job.ID, "project_id": job.ProjectID, "user_id": job.UserID, "request_id": job.RequestID, "kind": job.Kind, "node_ids": plan.NodeIDs, "status": job.Status, "revision": job.Revision, "budget": job.Budget, "progress": job.Progress, "run_after": job.RunAfter, "error": job.Error, "created_at": job.CreatedAt, "updated_at": job.UpdatedAt, "result": json.RawMessage(job.Result)}
	if job.TokenID == 0 && !service.StudioWorkflowNeedsGeneration(job.Kind) {
		value["used_quota"], value["settlement_final"] = 0, true
	} else if job.TokenID == 0 && model.DB != nil {
		if used, final, err := model.StudioWorkflowChargeUsage(job.UserID, job.ID); err == nil {
			value["used_quota"] = used
			value["settlement_final"] = final && (job.Status == "succeeded" || job.Status == "failed" || job.Status == "cancelled")
		}
	} else if job.TokenID > 0 && model.DB != nil {
		var usage struct{ UsedQuota int }
		if model.DB.Model(&model.Token{}).Select("used_quota").Where("id = ? AND user_id = ?", job.TokenID, job.UserID).Take(&usage).Error == nil {
			value["used_quota"] = usage.UsedQuota
			value["settlement_final"] = job.Status == "succeeded"
			if used, final, err := model.StudioWorkflowChargeUsage(job.UserID, job.ID); err == nil {
				value["used_quota"] = usage.UsedQuota + int(used)
				value["settlement_final"] = final && job.Status == "succeeded"
			}
		}
	}
	if job.Kind == "connector" && plan.Operation != nil && plan.ConnectorTarget != nil {
		value["connector"] = gin.H{"id": plan.Operation.ConnectorID, "provider": plan.ConnectorTarget.Provider, "action": plan.Operation.Action}
	}
	return value
}

func StudioCloudCapabilities(c *gin.Context) {
	quota, funded, fundingErr := service.StudioGenerationFunding(c.GetInt("id"))
	if fundingErr != nil {
		studioCloudError(c, fundingErr)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"storage": "server", "storage_available": service.StudioStorageWritable(), "available_quota": quota, "generation_credit_available": funded, "quota_per_unit": common.QuotaPerUnit, "render_available": service.StudioRenderAvailable(), "previs_render_available": service.StudioPrevisBrowserPath() != "", "previs_operations": []string{"previs_frame", "previs_animation", "previs_whitebox", "previs_depth"}, "max_nodes": 500, "max_workflow_nodes": 100, "max_media_bytes": service.StudioMaxMediaBytes, "operations": []string{"generate", "render", "quality", "transcribe", "media", "previs", "graphics", "connector", "transform", "analyze"}, "media_operations": []string{"music", "sound_effects", "voice_clone", "voice_speech", "lip_sync", "audio_separate", "audio_translate", "image_bg_remove", "image_upscale", "image_outpaint", "image_layers", "image_grid", "image_to_3d", "video_remove", "video_replace", "video_depth"}, "native_operations": []string{"crop", "resize", "rotate", "frame", "trim", "speed", "reverse", "extract_audio", "sound_preset"}, "sound_presets": []string{"rain", "wind", "footsteps", "whoosh", "impact", "notification"}, "reference_audio_semantics": service.StudioReferenceAudioSemanticsAvailable(), "roles": []string{"owner", "editor", "reviewer", "viewer"}}})
}

func StudioCloudProjectSchema(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"success": true, "data": json.RawMessage(studioagent.ProjectSchema())})
}

func StudioProjectJobs(c *gin.Context) {
	project, _, err := model.StudioProjectAccess(model.DB, c.GetInt("id"), c.Param("project_id"), c.Request.Method == http.MethodPost)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	if c.Request.Method == http.MethodGet {
		var jobs []model.StudioWorkflowJob
		if err := model.DB.Where("project_id = ?", project.ID).Order("created_at DESC").Limit(100).Find(&jobs).Error; err != nil {
			studioCloudError(c, err)
			return
		}
		data := make([]gin.H, 0, len(jobs))
		for _, job := range jobs {
			data = append(data, studioJobPayload(&job))
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": data})
		return
	}
	var input struct {
		RequestID         string                        `json:"request_id"`
		Kind              string                        `json:"kind"`
		Revision          int64                         `json:"revision"`
		Budget            int64                         `json:"budget"`
		RunAfter          int64                         `json:"run_after"`
		NodeIDs           []string                      `json:"node_ids"`
		Render            *service.StudioRenderPlan     `json:"render"`
		Operation         *service.StudioMediaOperation `json:"operation"`
		ConfirmGeneration bool                          `json:"confirm_generation"`
	}
	if err := common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, 1<<20), &input); err != nil {
		studioCloudError(c, err)
		return
	}
	if input.Kind == "connector" {
		contentType, _, _ := mime.ParseMediaType(c.GetHeader("Content-Type"))
		if contentType != "application/json" {
			studioCloudError(c, errors.New("connector operations require an authenticated JSON request"))
			return
		}
	}
	if service.StudioWorkflowNeedsGeneration(input.Kind) && !input.ConfirmGeneration {
		studioCloudError(c, errors.New("generation requires explicit confirmation"))
		return
	}
	job, err := service.QueueScheduledStudioWorkflow(c.GetInt("id"), project.ID, input.RequestID, input.Kind, input.Revision, input.Budget, input.RunAfter, input.NodeIDs, input.Render, input.Operation)
	if err != nil {
		studioCloudError(c, err)
		return
	}
	c.JSON(http.StatusAccepted, gin.H{"success": true, "data": studioJobPayload(job)})
}

func StudioWorkflowJob(c *gin.Context) {
	var job model.StudioWorkflowJob
	if err := model.DB.Where("id = ?", c.Param("job_id")).First(&job).Error; err != nil {
		studioCloudError(c, model.ErrStudioAccess)
		return
	}
	if _, _, err := model.StudioProjectAccess(model.DB, c.GetInt("id"), job.ProjectID, c.Request.Method != http.MethodGet); err != nil {
		studioCloudError(c, err)
		return
	}
	if c.Request.Method == http.MethodGet {
		c.JSON(http.StatusOK, gin.H{"success": true, "data": studioJobPayload(&job)})
		return
	}
	if job.UserID != c.GetInt("id") {
		studioCloudError(c, model.ErrStudioAccess)
		return
	}
	var input struct {
		Action                 string `json:"action"`
		ConfirmGeneration      bool   `json:"confirm_generation"`
		AcknowledgeUncertainty bool   `json:"acknowledge_uncertainty"`
		Note                   string `json:"note"`
		ExternalResourceID     string `json:"external_resource_id"`
	}
	if err := common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, 2048), &input); err != nil {
		studioCloudError(c, err)
		return
	}
	status := ""
	errorNote := ""
	service.ReconcileStudioWorkflowSettlement(c.Request.Context(), &job)
	switch input.Action {
	case "reconcile":
		if err := service.ReconcileStudioConnector(c.Request.Context(), &job, input.ExternalResourceID); err != nil {
			studioCloudError(c, err)
			return
		}
		if err := model.DB.First(&job, "id = ?", job.ID).Error; err != nil {
			studioCloudError(c, err)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": studioJobPayload(&job)})
		return
	case "abandon":
		if job.Status == "uncertain" && input.AcknowledgeUncertainty && len([]rune(strings.TrimSpace(input.Note))) >= 10 && len([]rune(input.Note)) <= 1000 {
			status = "cancelled"
			errorNote = "Uncertain result abandoned; charges may still settle. " + strings.TrimSpace(input.Note)
		}
	case "pause":
		if job.Status == "queued" || job.Status == "running" || job.Status == "waiting" {
			status = "paused"
		}
	case "cancel":
		if job.Status == "queued" || job.Status == "running" || job.Status == "waiting" || job.Status == "paused" {
			status = "cancelled"
		}
	case "resume":
		var progress service.StudioWorkflowProgress
		if err := common.Unmarshal([]byte(job.Result), &progress); err != nil {
			studioCloudError(c, err)
			return
		}
		if job.Status == "uncertain" && progress.TaskID == "" && progress.RequestID != "" {
			attempt, err := model.GetStudioAttemptByRequest(job.UserID, progress.RequestID)
			if err != nil {
				studioCloudError(c, err)
				return
			}
			if attempt != nil && attempt.TaskID != "" {
				progress.TaskID, progress.Phase = attempt.TaskID, "waiting"
				raw, err := common.Marshal(progress)
				if err != nil {
					studioCloudError(c, err)
					return
				}
				job.Result = model.StudioDocument(raw)
			}
			if err := service.ReconcileStudioRelayReceipt(&job, &progress); err != nil {
				studioCloudError(c, err)
				return
			}
			if progress.ResponseMediaID != "" {
				raw, err := common.Marshal(progress)
				if err != nil {
					studioCloudError(c, err)
					return
				}
				job.Result = model.StudioDocument(raw)
			}
		}
		if job.Status == "paused" && job.LeaseUntil <= time.Now().Unix() {
			status = "queued"
		}
		if job.Status == "uncertain" {
			if progress.TaskID != "" || progress.Take != nil || progress.ResponseMediaID != "" {
				status = "queued"
			}
			if job.Kind == "connector" && service.StudioConnectorCanResume(&job) {
				status = "queued"
			}
		}
		if job.Status == "failed" && (progress.Phase == "preparing" || progress.Phase == "rejected" || progress.Take != nil || progress.TaskID != "" || progress.ResponseMediaID != "") {
			// A confirmed terminal failure needs a new submission. An active,
			// successful or uncertain receipt must keep its identity for recovery.
			if progress.TaskID != "" && progress.Take == nil {
				task, exists, err := model.GetByTaskId(job.UserID, progress.TaskID)
				if err != nil {
					studioCloudError(c, err)
					return
				}
				if exists && task.Status == model.TaskStatusFailure {
					progress.TaskID, progress.RequestID, progress.ResponseMediaID, progress.Phase = "", "", "", "preparing"
					progress.AdditionalTakes = nil
					raw, err := common.Marshal(progress)
					if err != nil {
						studioCloudError(c, err)
						return
					}
					job.Result = model.StudioDocument(raw)
				}
			}
			status = "queued"
		}
		if !service.StudioWorkflowNeedsGeneration(job.Kind) && (job.Status == "failed" || job.Status == "paused") {
			status = "queued"
		}
	}
	if status == "" {
		studioCloudError(c, errors.New("this workflow cannot perform that action; running or uncertain paid submissions require reconciliation"))
		return
	}
	if service.StudioWorkflowNeedsGeneration(job.Kind) && status == "queued" {
		var progress service.StudioWorkflowProgress
		if common.Unmarshal([]byte(job.Result), &progress) == nil && (progress.Phase == "preparing" || progress.Phase == "rejected") && progress.TaskID == "" && progress.Take == nil && progress.ResponseMediaID == "" {
			_, funded, err := service.StudioGenerationFunding(job.UserID)
			if err != nil {
				studioCloudError(c, err)
				return
			}
			if !funded {
				studioCloudError(c, service.ErrStudioGenerationCredit)
				return
			}
		}
		if !input.ConfirmGeneration {
			studioCloudError(c, errors.New("resuming generation requires confirmation"))
			return
		}
	}
	updated := model.DB.Model(&model.StudioWorkflowJob{}).Where("id = ? AND status = ?", job.ID, job.Status).Updates(map[string]any{"status": status, "error": errorNote, "result": job.Result})
	if updated.Error != nil || updated.RowsAffected != 1 {
		studioCloudError(c, model.ErrStudioRevision)
		return
	}
	job.Status = status
	job.Error = errorNote
	if status == "cancelled" && job.TokenID > 0 && job.LeaseUntil <= time.Now().Unix() {
		model.DB.Model(&model.Token{}).Where("id = ? AND user_id = ?", job.TokenID, job.UserID).Update("status", common.TokenStatusDisabled)
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": studioJobPayload(&job)})
}
