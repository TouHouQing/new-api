package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/url"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

// Recovery reads the already-created remote object and proves it is the frozen
// source. It never creates a new upload, appends a block or sends a notification.
func ReconcileStudioConnector(ctx context.Context, job *model.StudioWorkflowJob, remoteID string) error {
	if job.Kind != "connector" || !((job.Status == "uncertain" || job.Status == "failed" || job.Status == "paused") && job.LeaseUntil <= time.Now().Unix()) {
		return errors.New("only an inactive connection task can be reconciled")
	}
	project, _, err := model.StudioProjectAccess(model.DB, job.UserID, job.ProjectID, true)
	if err != nil {
		return err
	}
	var actor model.User
	if model.DB.Where("id = ? AND status = ?", job.UserID, common.UserStatusEnabled).First(&actor).Error != nil {
		return errors.New("connector account is unavailable")
	}
	var plan StudioWorkflowPlan
	if err := common.Unmarshal([]byte(job.Plan), &plan); err != nil {
		return err
	}
	if err := ValidateStudioConnectorOperation(job.UserID, project, plan.Document, plan.Operation); err != nil {
		return err
	}
	config, err := studioConnectorConfig(job.UserID, plan.Operation.ConnectorID)
	if err != nil {
		return err
	}
	if plan.ConnectorTarget == nil || *plan.ConnectorTarget != studioConnectorTarget(config) {
		return errors.New("connector destination changed after submission")
	}
	if plan.Operation.Action != "export_media" && plan.Operation.Action != "notify_delivery" {
		return errors.New("this connection task can be resumed directly")
	}
	media, err := GetStudioMedia(project.OwnerID, plan.Operation.MediaID)
	if err != nil {
		return err
	}
	receipt, err := studioConnectorReadReceipt(job.ID)
	if err != nil {
		return err
	}
	if receipt.SourceDigest != media.Digest || receipt.Provider != config.Provider || receipt.Stage == "" {
		return errors.New("saved connection receipt differs from the frozen source")
	}
	// Acquire a short lease before network I/O so two controls cannot reconcile
	// the same receipt concurrently, including on SQLite.
	lease := time.Now().Add(5 * time.Minute).Unix()
	claimed := model.DB.Model(&model.StudioWorkflowJob{}).Where("id = ? AND status = ? AND lease_until <= ?", job.ID, job.Status, time.Now().Unix()).Updates(map[string]any{"lease_owner": "connector-reconcile", "lease_until": lease})
	if claimed.Error != nil {
		return claimed.Error
	}
	if claimed.RowsAffected != 1 {
		return model.ErrStudioRevision
	}
	defer model.DB.Model(&model.StudioWorkflowJob{}).Where("id = ? AND lease_owner = ? AND lease_until = ?", job.ID, "connector-reconcile", lease).Updates(map[string]any{"lease_owner": "", "lease_until": 0})
	if plan.Operation.Action == "notify_delivery" {
		var response struct {
			EventID string `json:"event_id"`
			Digest  string `json:"sha256"`
			State   string `json:"state"`
		}
		if err := studioConnectorJSON(ctx, config, "GET", "?event_id="+url.QueryEscape(job.ID), nil, &response); err != nil {
			return err
		}
		if response.EventID != job.ID || response.Digest != media.Digest || response.State != "received" {
			return errors.New("receiver has not verified this exact delivery event")
		}
		remoteID = job.ID
	} else {
		if remoteID == "" {
			return errors.New("choose the already-uploaded remote file or Notion block")
		}
		data, _, _, err := studioConnectorFile(ctx, config, remoteID)
		if err != nil {
			return err
		}
		digest := sha256.Sum256(data)
		if hex.EncodeToString(digest[:]) != media.Digest || int64(len(data)) != media.Size {
			return errors.New("remote file differs from the frozen source; the task remains unresolved")
		}
	}
	receipt.Stage, receipt.RemoteID, receipt.Parts = "completed", remoteID, nil
	if err := studioConnectorSaveReceipt(job.ID, receipt); err != nil {
		return err
	}
	result, err := common.Marshal(map[string]any{"phase": "completed", "connector_id": config.ID, "provider": config.Provider, "external_resource_id": remoteID, "media_id": media.MediaID, "source_digest": media.Digest, "delivery_state": "verified", "reconciled": true})
	if err != nil {
		return err
	}
	updated := model.DB.Model(&model.StudioWorkflowJob{}).Where("id = ? AND lease_owner = ? AND lease_until = ? AND status = ?", job.ID, "connector-reconcile", lease, job.Status).Updates(map[string]any{"status": "succeeded", "result": string(result), "error": "", "progress": 100})
	if updated.Error != nil {
		return updated.Error
	}
	if updated.RowsAffected != 1 {
		return model.ErrStudioRevision
	}
	if err := model.DB.First(job, "id = ?", job.ID).Error; err != nil {
		return err
	}
	return model.RecordStudioWorkflowEvent(job)
}

func StudioConnectorCanResume(job *model.StudioWorkflowJob) bool {
	var plan StudioWorkflowPlan
	if common.Unmarshal([]byte(job.Plan), &plan) != nil || plan.Operation == nil {
		return false
	}
	if plan.Operation.Action == "import_media" || plan.Operation.Action == "import_context" || plan.Operation.Action == "sync_review" {
		return true
	}
	receipt, err := studioConnectorReadReceipt(job.ID)
	if err != nil {
		return false
	}
	if receipt.Stage == "completed" {
		return true
	}
	return plan.Operation.Action == "export_media" && (receipt.Stage == "uploading" || receipt.Stage == "uploaded") && (receipt.RemoteID != "" || receipt.UploadID != "")
}
