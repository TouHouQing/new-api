package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"mime"
	"net/url"
	"strings"
	"time"
	"unicode"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

func RunStudioConnector(ctx context.Context, job *model.StudioWorkflowJob, project *model.StudioProject, plan *StudioWorkflowPlan) error {
	var actor model.User
	if model.DB.Select("id", "status").Where("id = ? AND status = ?", job.UserID, common.UserStatusEnabled).First(&actor).Error != nil {
		return errors.New("connector account is unavailable")
	}
	if err := ValidateStudioConnectorOperation(job.UserID, project, plan.Document, plan.Operation); err != nil {
		return err
	}
	operation := plan.Operation
	config, err := studioConnectorConfig(job.UserID, operation.ConnectorID)
	if err != nil {
		return err
	}
	if plan.ConnectorTarget == nil || *plan.ConnectorTarget != studioConnectorTarget(config) {
		return errors.New("connector destination changed after submission; review and submit the new destination")
	}
	copy := *project
	project = &copy
	if title, ok := plan.Document["title"].(string); ok {
		project.Title = title
	}
	var progress StudioWorkflowProgress
	if err := common.Unmarshal([]byte(job.Result), &progress); err != nil {
		return err
	}
	if progress.Phase == "completed" {
		return nil
	}
	switch operation.Action {
	case "import_context":
		if progress.Take == nil {
			document, err := studioReadConnectorContext(ctx, config, operation.ExternalResourceID)
			if err != nil {
				return err
			}
			snapshot, err := common.Marshal(map[string]string{"connector_id": config.ID, "provider": config.Provider, "resource_id": operation.ExternalResourceID})
			if err != nil {
				return err
			}
			title := []rune(document.Title)
			if len(title) > 200 {
				title = title[:200]
			}
			progress.Take = map[string]any{"id": "connector-context-" + job.ID, "createdAt": time.Now().UTC().Format(time.RFC3339Nano), "prompt": "Imported context from " + config.Label + ": " + string(title), "status": "completed", "sourceMode": "upload", "outputText": document.Text, "requestSnapshot": string(snapshot)}
			progress.Phase = "collected"
			if err := studioSaveProgress(job, progress, 90); err != nil {
				return err
			}
		}
		if err := publishStudioWorkflowTake(job, operation.NodeID, progress.Take); err != nil {
			return err
		}
		progress.Phase = "completed"
		return studioSaveProgress(job, progress, 100)
	case "import_media":
		if progress.Take == nil {
			data, mimeType, name, err := studioConnectorImport(ctx, config, operation.ExternalResourceID)
			if err != nil {
				return err
			}
			kind := strings.SplitN(mimeType, "/", 2)[0]
			for _, node := range studioObjects(plan.Document, "nodes") {
				if node["id"] == operation.NodeID && node["data"].(map[string]any)["kind"] != kind {
					return errors.New("connector file type differs from the selected output node")
				}
			}
			media, err := SaveStudioMedia(project.OwnerID, "connector-import-"+job.ID, mimeType, bytes.NewReader(data))
			if err != nil {
				return err
			}
			if err := LinkStudioProjectMedia(project.ID, media.MediaID); err != nil {
				return err
			}
			if len([]rune(name)) > 200 {
				name = string([]rune(name)[:200])
			}
			progress.Take = map[string]any{"id": "connector-import-" + job.ID, "createdAt": time.Now().UTC().Format(time.RFC3339Nano), "prompt": "Imported from " + config.Label + ": " + name, "status": "completed", "sourceMode": "upload", "mediaId": media.MediaID}
			progress.Phase = "collected"
			if err := studioSaveProgress(job, progress, 90); err != nil {
				return err
			}
		}
		if err := publishStudioWorkflowTake(job, operation.NodeID, progress.Take); err != nil {
			return err
		}
		progress.Phase = "completed"
		return studioSaveProgress(job, progress, 100)
	case "export_media":
		media, err := GetStudioMedia(project.OwnerID, operation.MediaID)
		if err != nil {
			return err
		}
		name := strings.Map(func(value rune) rune {
			if unicode.IsLetter(value) || unicode.IsDigit(value) || value == '-' || value == '_' {
				return value
			}
			return '-'
		}, project.Title)
		for len(name) > 160 {
			name = string([]rune(name)[:len([]rune(name))-1])
		}
		if name == "" {
			name = "film"
		}
		extensions, _ := mime.ExtensionsByType(media.MimeType)
		extension := ".bin"
		if len(extensions) > 0 {
			extension = extensions[0]
		}
		remoteID, err := studioConnectorUpload(ctx, job, config, media, name+"-"+job.ID+extension)
		if err != nil {
			return err
		}
		result, err := common.Marshal(map[string]any{"phase": "completed", "connector_id": config.ID, "provider": config.Provider, "external_resource_id": remoteID, "media_id": media.MediaID, "source_digest": media.Digest, "delivery_state": "uploaded"})
		if err != nil {
			return err
		}
		return model.DB.Model(job).Updates(map[string]any{"result": string(result), "progress": 100}).Error
	case "sync_review":
		return syncStudioFrameIOReview(ctx, job, project, plan, config)
	case "notify_delivery":
		return notifyStudioConnectorDelivery(ctx, job, project, config, operation)
	}
	return errors.New("unsupported connection operation")
}

func syncStudioFrameIOReview(ctx context.Context, job *model.StudioWorkflowJob, project *model.StudioProject, plan *StudioWorkflowPlan, config StudioConnectorConfig) error {
	operation := plan.Operation
	media, err := GetStudioMedia(project.OwnerID, operation.MediaID)
	if err != nil {
		return err
	}
	path, err := StudioMediaPath(media)
	if err != nil {
		return err
	}
	probe, err := ProbeStudioMedia(ctx, path)
	if err != nil || !probe.HasVideo || probe.FrameRate <= 0 {
		return errors.New("review synchronization requires a decodable pinned video Take")
	}
	remote, _, _, err := studioConnectorImport(ctx, config, operation.ExternalResourceID)
	if err != nil {
		return err
	}
	digest := sha256.Sum256(remote)
	if hex.EncodeToString(digest[:]) != media.Digest {
		return errors.New("external review file differs from the pinned Take; import that exact file before binding review comments")
	}
	var comments []model.StudioReviewComment
	if err := model.DB.Where("project_id = ? AND node_id = ? AND take_id = ?", project.ID, operation.NodeID, operation.TakeID).Find(&comments).Error; err != nil {
		return err
	}
	existing := map[string]bool{}
	for _, comment := range comments {
		if prefix, _, ok := strings.Cut(comment.Message, "] "); ok {
			existing[prefix+"] "] = true
		}
	}
	cursor, imported := "", 0
	for page := range 100 {
		var response struct {
			Data []struct {
				ID, Text  string
				Timestamp *float64 `json:"timestamp"`
				Duration  *int     `json:"duration"`
				Owner     struct{ Name string }
			}
			Links struct{ Next string }
		}
		query := url.Values{"page_size": {"100"}, "include": {"owner"}, "sort": {"created_at_asc"}, "timestamp_as_timecode": {"false"}}
		if cursor != "" {
			query.Set("after", cursor)
		}
		resource := "/v4/accounts/" + url.PathEscape(config.AccountID) + "/files/" + url.PathEscape(operation.ExternalResourceID) + "/comments?" + query.Encode()
		if err := studioConnectorJSON(ctx, config, "GET", resource, nil, &response); err != nil {
			return err
		}
		for _, comment := range response.Data {
			if !StudioIDPattern.MatchString(comment.ID) || strings.TrimSpace(comment.Text) == "" || len([]rune(comment.Text)) > 10000 {
				return errors.New("external review contains an invalid comment")
			}
			prefix := "[frameio:" + config.ID + ":" + comment.ID + "] "
			if existing[prefix] {
				continue
			}
			seconds := 0.0
			if comment.Timestamp != nil {
				seconds = max(0, (*comment.Timestamp-1)/probe.FrameRate)
			}
			if math.IsNaN(seconds) || math.IsInf(seconds, 0) || seconds > probe.Duration+.05 {
				return errors.New("external review timestamp exceeds the pinned video")
			}
			message := prefix + comment.Owner.Name + ": " + comment.Text
			if comment.Duration != nil && *comment.Duration > 0 {
				message += fmt.Sprintf("\n[Range: %.3f seconds]", float64(*comment.Duration)/probe.FrameRate)
			}
			value := model.StudioReviewComment{ProjectID: project.ID, Revision: job.Revision, AuthorID: job.UserID, NodeID: operation.NodeID, TakeID: operation.TakeID, Seconds: seconds, Message: message}
			created, err := model.SaveStudioImportedReviewComment(job.UserID, prefix, &value)
			if err != nil {
				return err
			}
			existing[prefix] = true
			if created {
				imported++
			}
		}
		if response.Links.Next == "" {
			break
		}
		next, err := url.Parse(response.Links.Next)
		if err != nil || next.Query().Get("after") == "" || next.Query().Get("after") == cursor || page == 99 {
			return errors.New("external review pagination could not complete")
		}
		cursor = next.Query().Get("after")
	}
	result, err := common.Marshal(map[string]any{"phase": "completed", "connector_id": config.ID, "provider": "frameio", "imported_comments": imported, "media_id": operation.MediaID, "node_id": operation.NodeID, "take_id": operation.TakeID, "timestamp_units": "one_based_frames"})
	if err != nil {
		return err
	}
	return model.DB.Model(job).Updates(map[string]any{"result": string(result), "progress": 100}).Error
}

func notifyStudioConnectorDelivery(ctx context.Context, job *model.StudioWorkflowJob, project *model.StudioProject, config StudioConnectorConfig, operation *StudioMediaOperation) error {
	receipt, err := studioConnectorReadReceipt(job.ID)
	if err != nil {
		return err
	}
	if receipt.Stage == "sending" {
		model.DB.Model(job).Update("status", "uncertain")
		return errors.New("delivery notification is uncertain; check the receiver using the saved event ID before sending again")
	}
	if receipt.SentAt == 0 {
		receipt.SentAt = time.Now().Unix()
	}
	media, err := GetStudioMedia(project.OwnerID, operation.MediaID)
	if err != nil {
		return err
	}
	body, err := common.Marshal(map[string]any{"event": "studio.delivery.ready", "event_id": job.ID, "timestamp": receipt.SentAt, "project_id": project.ID, "project_title": project.Title, "revision": job.Revision, "media_id": media.MediaID, "sha256": media.Digest, "bytes": media.Size, "mime_type": media.MimeType})
	if err != nil {
		return err
	}
	if receipt.Stage == "completed" {
		digest := sha256.Sum256(body)
		result, err := common.Marshal(map[string]any{"phase": "completed", "connector_id": config.ID, "event_id": job.ID, "media_id": media.MediaID, "payload_sha256": hex.EncodeToString(digest[:]), "delivery_state": "acknowledged"})
		if err != nil {
			return err
		}
		return model.DB.Model(job).Updates(map[string]any{"result": string(result), "progress": 100}).Error
	}
	receipt.Stage, receipt.Provider, receipt.SourceDigest = "sending", config.Provider, media.Digest
	if err := studioConnectorSaveReceipt(job.ID, receipt); err != nil {
		return err
	}
	// The payload carries a stable event ID and content digest. The receiver
	// acknowledges that ID; a lost acknowledgement is never silently replayed.
	response, _, err := studioConnectorRequest(ctx, config, "POST", "", "application/json", bytes.NewReader(body), 65536)
	if err != nil {
		model.DB.Model(job).Update("status", "uncertain")
		return err
	}
	var acknowledgement struct {
		EventID string `json:"event_id"`
	}
	if common.Unmarshal(response, &acknowledgement) != nil || acknowledgement.EventID != job.ID {
		model.DB.Model(job).Update("status", "uncertain")
		return errors.New("delivery receiver did not acknowledge the exact event ID")
	}
	receipt.Stage, receipt.RemoteID = "completed", job.ID
	if err := studioConnectorSaveReceipt(job.ID, receipt); err != nil {
		return err
	}
	digest := sha256.Sum256(body)
	result, err := common.Marshal(map[string]any{"phase": "completed", "connector_id": config.ID, "event_id": job.ID, "media_id": media.MediaID, "payload_sha256": hex.EncodeToString(digest[:]), "delivery_state": "acknowledged"})
	if err != nil {
		return err
	}
	return model.DB.Model(job).Updates(map[string]any{"result": string(result), "progress": 100}).Error
}
