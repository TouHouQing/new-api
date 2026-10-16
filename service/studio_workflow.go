package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type StudioRelayResponse struct {
	Status      int
	ContentType string
	Body        []byte
	SafeToRetry bool // Private dispatcher proves rejection occurred before channel selection.
}

// Injected by router; the private dispatcher uses the ordinary billed relay.
var StudioWorkflowRelay func(context.Context, *model.StudioWorkflowJob, string, []byte) (StudioRelayResponse, error)

type StudioWorkflowPlan struct {
	ConnectorTarget *StudioConnectorTarget `json:"connector_target,omitempty"`
	Document        map[string]any         `json:"document"`
	NodeIDs         []string               `json:"node_ids"`
	Render          *StudioRenderPlan      `json:"render,omitempty"`
	Operation       *StudioMediaOperation  `json:"operation,omitempty"`
}

type StudioMediaOperation struct {
	ConnectorID          string             `json:"connector_id,omitempty"`
	ExternalResourceID   string             `json:"external_resource_id,omitempty"`
	TakeID               string             `json:"take_id,omitempty"`
	ConfirmExternalWrite bool               `json:"confirm_external_write,omitempty"`
	Samples              int                `json:"samples,omitempty"`
	Dimensions           []string           `json:"dimensions,omitempty"`
	Edit                 *StudioMediaEdit   `json:"edit,omitempty"`
	DialogueCueID        string             `json:"dialogue_cue_id,omitempty"`
	MediaID              string             `json:"media_id"`
	Model                string             `json:"model"`
	Group                string             `json:"group"`
	Language             string             `json:"language"`
	Action               string             `json:"action,omitempty"`
	NodeID               string             `json:"node_id,omitempty"`
	Prompt               string             `json:"prompt,omitempty"`
	Seconds              float64            `json:"seconds,omitempty"`
	ReferenceMediaIDs    []string           `json:"reference_media_ids,omitempty"`
	VoiceID              string             `json:"voice_id,omitempty"`
	ConfirmVoiceRights   bool               `json:"confirm_voice_rights,omitempty"`
	Options              *StudioToolOptions `json:"options,omitempty"`
}

// Typed tool parameters are bounded on the server and by the worker. They are
// preserved in the Take snapshot so a revision can reproduce the operation.
type StudioToolOptions struct {
	PanelPrompts     []string `json:"panel_prompts,omitempty"`
	RedoPanel        int      `json:"redo_panel,omitempty"`
	OutpaintMode     string   `json:"outpaint_mode,omitempty"`
	MaskSource       string   `json:"mask_source,omitempty"`
	BackgroundPrompt string   `json:"background_prompt,omitempty"`
	RepairStart      *float64 `json:"repair_start,omitempty"`
	RepairEnd        *float64 `json:"repair_end,omitempty"`
	CandidateStart   *float64 `json:"candidate_start,omitempty"`
	CandidateEnd     *float64 `json:"candidate_end,omitempty"`
	MusicMode        string   `json:"music_mode,omitempty"`
	Lyrics           string   `json:"lyrics,omitempty"`
	BPM              int      `json:"bpm,omitempty"`
	Seed             *int64   `json:"seed,omitempty"`
	Negative         string   `json:"negative,omitempty"`
	Width            int      `json:"width,omitempty"`
	Height           int      `json:"height,omitempty"`
	Scale            int      `json:"scale,omitempty"`
	Rows             int      `json:"rows,omitempty"`
	Columns          int      `json:"columns,omitempty"`
	Speed            float64  `json:"speed,omitempty"`
	Pitch            float64  `json:"pitch,omitempty"`
	Pause            float64  `json:"pause,omitempty"`
	Expression       float64  `json:"expression"`
	Translation      string   `json:"translation,omitempty"`
}

type StudioWorkflowProgress struct {
	Completed       []string                  `json:"completed"`
	NodeID          string                    `json:"node_id,omitempty"`
	TaskID          string                    `json:"task_id,omitempty"`
	RequestID       string                    `json:"request_id,omitempty"`
	Phase           string                    `json:"phase,omitempty"`
	MediaID         string                    `json:"media_id,omitempty"`
	Take            map[string]any            `json:"take,omitempty"`
	AdditionalTakes []map[string]any          `json:"additional_takes,omitempty"`
	ResponseMediaID string                    `json:"response_media_id,omitempty"`
	Outputs         map[string]map[string]any `json:"outputs,omitempty"`
}

func QueueStudioWorkflow(userID int, projectID, requestID, kind string, revision, budget int64, nodeIDs []string, render *StudioRenderPlan, operations ...*StudioMediaOperation) (*model.StudioWorkflowJob, error) {
	var operation *StudioMediaOperation
	if len(operations) > 0 {
		operation = operations[0]
	}
	return QueueScheduledStudioWorkflow(userID, projectID, requestID, kind, revision, budget, 0, nodeIDs, render, operation)
}

// A scheduled workflow freezes its input and budget at confirmation time. The
// same durable queue handles immediate execution, cancellation and recovery.
var ErrStudioGenerationCredit = errors.New("Insufficient generation credit. Add credit or continue with free editing.")

func StudioGenerationFunding(userID int) (int, bool, error) {
	user, err := model.GetUserById(userID, false)
	if err != nil {
		return 0, false, err
	}
	preference := common.NormalizeBillingPreference(user.GetSetting().BillingPreference)
	funded := user.Quota > 0 && preference != "subscription_only"
	if !funded && preference != "wallet_only" {
		funded, err = model.HasActiveUserSubscription(userID)
	}
	return user.Quota, funded, err
}

func QueueScheduledStudioWorkflow(userID int, projectID, requestID, kind string, revision, budget, runAfter int64, nodeIDs []string, render *StudioRenderPlan, operation *StudioMediaOperation) (*model.StudioWorkflowJob, error) {
	if runAfter < 0 || runAfter > time.Now().Add(7*24*time.Hour).Unix() {
		return nil, errors.New("schedule must be within the next seven days")
	}
	if !StudioIDPattern.MatchString(requestID) || (kind != "generate" && kind != "render" && kind != "quality" && kind != "transcribe" && kind != "media" && kind != "previs" && kind != "graphics" && kind != "connector" && kind != "transform" && kind != "analyze") || budget < 0 || budget > 2_000_000_000 || len(nodeIDs) > 100 {
		return nil, errors.New("invalid workflow request")
	}
	project, _, err := model.StudioProjectAccess(model.DB, userID, projectID, true)
	if err != nil {
		return nil, err
	}
	var prior model.StudioWorkflowJob
	if model.DB.Where("user_id = ? AND request_id = ?", userID, requestID).First(&prior).Error == nil {
		var original StudioWorkflowPlan
		if err := common.Unmarshal([]byte(prior.Plan), &original); err != nil {
			return nil, err
		}
		oldInput, _ := common.Marshal([]any{original.NodeIDs, original.Render, original.Operation})
		newInput, _ := common.Marshal([]any{nodeIDs, render, operation})
		if prior.ProjectID != projectID || prior.Revision != revision || prior.Kind != kind || prior.Budget != budget || prior.RunAfter != runAfter || !bytes.Equal(oldInput, newInput) {
			return nil, errors.New("request ID was already used for a different workflow")
		}
		return &prior, nil
	}
	if project.Revision != revision {
		return nil, model.ErrStudioRevision
	}
	if StudioWorkflowNeedsGeneration(kind) {
		_, funded, err := StudioGenerationFunding(userID)
		if err != nil {
			return nil, err
		}
		if !funded {
			return nil, ErrStudioGenerationCredit
		}
	}
	if kind == "generate" && (budget < 1 || len(nodeIDs) == 0) {
		return nil, errors.New("generation requires selected nodes and an explicit quota budget")
	}
	if kind == "transcribe" && (budget < 1 || operation == nil || !StudioIDPattern.MatchString(operation.MediaID) || strings.TrimSpace(operation.Model) == "" || len(operation.Model) > 200 || len(operation.Language) > 40) {
		return nil, errors.New("transcription requires audio, a model and a quota budget")
	}
	var document map[string]any
	if err := common.Unmarshal([]byte(project.Document), &document); err != nil {
		return nil, err
	}
	if kind == "transcribe" && !StudioMediaReferences(document)[operation.MediaID] {
		return nil, errors.New("transcription audio is outside this project")
	}
	if kind == "media" {
		if budget < 1 {
			return nil, errors.New("media generation requires an explicit quota budget")
		}
		if err := ValidateStudioMediaOperation(project.OwnerID, document, operation); err != nil {
			return nil, err
		}
	}
	if kind == "transform" {
		if err := ValidateStudioTransform(project.OwnerID, document, operation); err != nil {
			return nil, err
		}
	}
	if kind == "analyze" {
		if budget < 1 {
			return nil, errors.New("reference analysis requires an explicit inference budget")
		}
		if err := ValidateStudioReferenceAnalysis(project.OwnerID, document, operation); err != nil {
			return nil, err
		}
	}
	if kind == "graphics" {
		if err := ValidateStudioGraphicsOperation(document, operation); err != nil {
			return nil, err
		}
	}
	if kind == "previs" {
		if operation == nil || (operation.Action != "previs_frame" && operation.Action != "previs_animation" && operation.Action != "previs_depth" && operation.Action != "previs_whitebox") || !StudioIDPattern.MatchString(operation.NodeID) || math.IsNaN(operation.Seconds) || math.IsInf(operation.Seconds, 0) || operation.Seconds < 0 {
			return nil, errors.New("invalid previsualization operation")
		}
		scene, err := StudioPrevisDocument(document)
		if err != nil {
			return nil, err
		}
		if operation.Seconds > scene.Duration {
			return nil, errors.New("frame time exceeds previsualization duration")
		}
		if operation.Options != nil {
			for _, dimension := range []int{operation.Options.Width, operation.Options.Height} {
				if dimension != 0 && (dimension < 64 || dimension > 4096 || dimension%2 != 0) {
					return nil, errors.New("choose even stage dimensions from 64 to 4096")
				}
			}
		}
		found := false
		for _, node := range studioObjects(document, "nodes") {
			if node["id"] != operation.NodeID {
				continue
			}
			data, _ := node["data"].(map[string]any)
			expected := "image"
			if operation.Action == "previs_animation" {
				expected = "video"
			}
			if data["kind"] != expected || data["purpose"] == "assembly" {
				return nil, errors.New("previsualization target must be an image or video node")
			}
			found = true
		}
		if !found {
			return nil, errors.New("previsualization target is unavailable")
		}
	}
	if kind == "generate" {
		order, err := StudioWorkflowOrder(document, nodeIDs)
		if err != nil {
			return nil, err
		}
		for _, node := range studioObjects(document, "nodes") {
			id, _ := node["id"].(string)
			data, _ := node["data"].(map[string]any)
			if !slices.Contains(order, id) || (!slices.Contains(nodeIDs, id) && data["status"] == "completed" && (data["mediaId"] != nil || data["outputText"] != nil)) {
				continue
			}
			modelName, _ := data["model"].(string)
			nodeKind, _ := data["kind"].(string)
			if strings.HasPrefix(modelName, "studio-") && slices.Contains([]string{"image", "audio", "video"}, nodeKind) {
				return nil, fmt.Errorf("node %s: reopen the media production tool to confirm its operation and parameters", id)
			}
			if err := validateStudioLocalVideoConfiguration(data); err != nil {
				return nil, fmt.Errorf("node %s: %w", id, err)
			}
			if err := validateStudioLocalVideoConnections(document, id, data); err != nil {
				return nil, fmt.Errorf("node %s: %w", id, err)
			}
		}
	}
	if kind == "render" {
		if render == nil {
			return nil, errors.New("render plan is required")
		}
		if err := ValidateStudioRenderPlan(render); err != nil {
			return nil, err
		}
		if err := ValidateStudioPendingCaptionDraft(document, render.VariantID); err != nil {
			return nil, err
		}
		if err := ValidateStudioRegionalRender(document, render); err != nil {
			return nil, err
		}
		if err := ValidateStudioDeliveryAudioReviews(document, render); err != nil {
			return nil, err
		}
		references := StudioMediaReferences(document)
		for _, clip := range render.Clips {
			if !references[clip.MediaID] {
				return nil, errors.New("render media is outside this project document")
			}
			if clip.VoiceoverMediaID != "" && !references[clip.VoiceoverMediaID] {
				return nil, errors.New("per-shot voiceover is outside this project document")
			}
		}
		for _, track := range render.Audio {
			if !references[track.MediaID] {
				return nil, errors.New("audio is outside this project document")
			}
		}
	}
	plan := StudioWorkflowPlan{Document: document, NodeIDs: nodeIDs, Render: render, Operation: operation}
	if kind == "connector" {
		if err := ValidateStudioConnectorOperation(userID, project, document, operation); err != nil {
			return nil, err
		}
		config, err := studioConnectorConfig(userID, operation.ConnectorID)
		if err != nil {
			return nil, err
		}
		target := studioConnectorTarget(config)
		plan.ConnectorTarget = &target
	}
	if kind != "connector" && !StudioStorageWritable() {
		return nil, errors.New(StudioStorageUnavailable)
	}
	encoded, err := common.Marshal(plan)
	if err != nil {
		return nil, err
	}
	fingerprintBytes, _ := common.Marshal([]any{projectID, kind, revision, budget, runAfter, plan})
	hash := sha256.Sum256(fingerprintBytes)
	fingerprint := hex.EncodeToString(hash[:])
	var existing model.StudioWorkflowJob
	if model.DB.Where("user_id = ? AND request_id = ?", userID, requestID).First(&existing).Error == nil {
		if existing.Fingerprint != fingerprint {
			return nil, errors.New("request ID was already used for a different workflow")
		}
		return &existing, nil
	}
	job := model.StudioWorkflowJob{ID: uuid.NewString(), ProjectID: projectID, UserID: userID, RequestID: requestID, Fingerprint: fingerprint, Kind: kind, Status: "queued", Revision: revision, Budget: budget, RunAfter: runAfter, Plan: model.StudioDocument(encoded), Result: "{}"}
	err = model.DB.Transaction(func(tx *gorm.DB) error {
		var count int64
		if err := tx.Model(&model.StudioWorkflowJob{}).Where("user_id = ? AND status IN ?", userID, []string{"queued", "running", "waiting", "paused", "uncertain"}).Count(&count).Error; err != nil {
			return err
		}
		if count >= 20 {
			return errors.New("too many unfinished workflows")
		}
		return tx.Create(&job).Error
	})
	if err != nil {
		if model.DB.Where("user_id = ? AND request_id = ? AND fingerprint = ?", userID, requestID, fingerprint).First(&existing).Error == nil {
			return &existing, nil
		}
		return nil, err
	}
	return &job, nil
}

func studioObjects(document map[string]any, key string) []map[string]any {
	values, _ := document[key].([]any)
	items := make([]map[string]any, 0, len(values))
	for _, value := range values {
		if item, ok := value.(map[string]any); ok {
			items = append(items, item)
		}
	}
	return items
}

func StudioWorkflowOrder(document map[string]any, targets []string) ([]string, error) {
	nodes := map[string]map[string]any{}
	for _, node := range studioObjects(document, "nodes") {
		id, _ := node["id"].(string)
		nodes[id] = node
	}
	edges := studioObjects(document, "edges")
	state := map[string]int{}
	order := []string{}
	var visit func(string) error
	visit = func(id string) error {
		if state[id] == 1 {
			return errors.New("workflow contains a cycle")
		}
		if state[id] == 2 {
			return nil
		}
		if nodes[id] == nil {
			return errors.New("workflow node is unavailable")
		}
		state[id] = 1
		configuration, _ := nodes[id]["data"].(map[string]any)
		assetIDs, _ := configuration["assetIds"].([]any)
		pins, _ := configuration["assetVersionIds"].(map[string]any)
		for _, assetID := range assetIDs {
			if pins[fmt.Sprint(assetID)] != nil {
				continue
			}
			for dependencyID, dependency := range nodes {
				data, _ := dependency["data"].(map[string]any)
				if dependencyID != id && data["linkedAssetId"] == assetID {
					if err := visit(dependencyID); err != nil {
						return err
					}
				}
			}
		}
		for _, edge := range edges {
			if edge["target"] != id {
				continue
			}
			data, _ := edge["data"].(map[string]any)
			if data["sourceTakeId"] != nil {
				continue
			}
			source, _ := edge["source"].(string)
			if err := visit(source); err != nil {
				return err
			}
		}
		state[id] = 2
		order = append(order, id)
		return nil
	}
	for _, id := range targets {
		if err := visit(id); err != nil {
			return nil, err
		}
	}
	if len(order) > 100 {
		return nil, errors.New("workflow exceeds 100 nodes")
	}
	return order, nil
}

var studioRunnerOnce sync.Once

func StartStudioWorkflowRunner() {
	studioRunnerOnce.Do(func() {
		// Native edits and delivery must keep moving during a long model request.
		for _, inference := range []bool{true, false} {
			go func(inference bool) {
				runnerID := uuid.NewString()
				ticker := time.NewTicker(2 * time.Second)
				defer ticker.Stop()
				for range ticker.C {
					runStudioWorkflowsOnce(context.Background(), runnerID, &inference)
				}
			}(inference)
		}
	})
}

// Claims use compare-and-swap, including on SQLite. Expired paid executions are
// quarantined rather than blindly repeated by a replacement worker.
func RunStudioWorkflowsOnce(ctx context.Context, runnerID string) {
	runStudioWorkflowsOnce(ctx, runnerID, nil)
}

func runStudioWorkflowsOnce(ctx context.Context, runnerID string, inference *bool) {
	if StudioWorkflowRelay == nil || model.DB == nil {
		return
	}
	model.DB.Model(&model.StudioWorkflowJob{}).Where("status IN ? AND lease_until < ?", []string{"running", "waiting"}, time.Now().Unix()).Updates(map[string]any{"status": "uncertain", "error": "Worker disconnected. Inspect the saved task before resuming.", "lease_owner": ""})
	var abandoned []model.StudioWorkflowJob
	if model.DB.Where("status = ? AND lease_until > 0 AND lease_until < ?", "paused", time.Now().Unix()).Find(&abandoned).Error == nil {
		for _, job := range abandoned {
			var progress StudioWorkflowProgress
			updates := map[string]any{"lease_owner": "", "lease_until": 0}
			if StudioWorkflowNeedsGeneration(job.Kind) && common.Unmarshal([]byte(job.Result), &progress) == nil && progress.Phase == "submitting" && progress.TaskID == "" && progress.Take == nil {
				updates["status"] = "uncertain"
				updates["error"] = "Worker disconnected during submission. Reconcile the saved request before resuming."
			}
			model.DB.Model(&model.StudioWorkflowJob{}).Where("id = ? AND status = ? AND lease_until = ?", job.ID, "paused", job.LeaseUntil).Updates(updates)
		}
	}
	var jobs []model.StudioWorkflowJob
	query := model.DB.Where("status = ? AND run_after <= ?", "queued", time.Now().Unix())
	if inference != nil {
		kinds := []string{"generate", "transcribe", "media", "analyze"}
		if *inference {
			query = query.Where("kind IN ?", kinds)
		} else {
			query = query.Where("kind NOT IN ?", kinds)
		}
	}
	if query.Order("created_at ASC").Limit(2).Find(&jobs).Error != nil {
		return
	}
	for _, job := range jobs {
		claim := model.DB.Model(&model.StudioWorkflowJob{}).Where("id = ? AND status = ? AND run_after <= ?", job.ID, "queued", time.Now().Unix()).Updates(map[string]any{"status": "running", "lease_owner": runnerID, "lease_until": time.Now().Add(90 * time.Second).Unix()})
		if claim.Error != nil || claim.RowsAffected != 1 {
			continue
		}
		job.Status, job.LeaseOwner = "running", runnerID
		runCtx, cancel := context.WithTimeout(ctx, 30*time.Minute)
		done := make(chan struct{})
		go func() {
			ticker := time.NewTicker(10 * time.Second)
			defer ticker.Stop()
			for {
				select {
				case <-done:
					return
				case <-runCtx.Done():
					return
				case <-ticker.C:
					if !StudioWorkflowNeedsGeneration(job.Kind) {
						var current model.StudioWorkflowJob
						if model.DB.Where("id = ? AND lease_owner = ?", job.ID, runnerID).First(&current).Error != nil || current.Status == "cancelled" || current.Status == "paused" {
							cancel()
							return
						}
					}
					updated := model.DB.Model(&model.StudioWorkflowJob{}).Where("id = ? AND lease_owner = ?", job.ID, runnerID).Update("lease_until", time.Now().Add(90*time.Second).Unix())
					if updated.Error != nil || updated.RowsAffected != 1 {
						cancel()
						return
					}
				}
			}
		}()
		err := executeStudioWorkflow(runCtx, &job)
		close(done)
		cancel()
		var current model.StudioWorkflowJob
		if model.DB.Where("id = ?", job.ID).First(&current).Error != nil {
			continue
		}
		if current.Status == "paused" || current.Status == "cancelled" {
			model.DB.Model(&model.StudioWorkflowJob{}).Where("id = ? AND lease_owner = ?", job.ID, runnerID).Updates(map[string]any{"lease_owner": "", "lease_until": 0})
			if current.Status == "cancelled" && job.TokenID > 0 {
				model.DB.Model(&model.Token{}).Where("id = ?", job.TokenID).Update("status", common.TokenStatusDisabled)
			}
			continue
		}
		status, message := "succeeded", ""
		if err != nil {
			status, message = "failed", err.Error()
			if current.Status == "uncertain" {
				status = "uncertain"
			}
			var progress StudioWorkflowProgress
			if StudioWorkflowNeedsGeneration(job.Kind) && common.Unmarshal([]byte(current.Result), &progress) == nil && progress.Phase == "submitting" && progress.TaskID == "" && progress.Take == nil {
				status = "uncertain"
			}
		}
		updates := map[string]any{"status": status, "error": message, "lease_owner": "", "lease_until": 0}
		ReconcileStudioWorkflowSettlement(ctx, &current)
		if err == nil {
			updates["progress"] = 100
		}
		model.DB.Model(&model.StudioWorkflowJob{}).Where("id = ? AND lease_owner = ?", job.ID, runnerID).Updates(updates)
		if model.DB.Where("id = ?", job.ID).First(&current).Error == nil {
			if err := model.RecordStudioWorkflowEvent(&current); err != nil {
				common.SysError("Studio completion event could not be recorded")
			}
		}
		if job.TokenID > 0 && status != "uncertain" {
			model.DB.Model(&model.Token{}).Where("id = ?", job.TokenID).Update("status", common.TokenStatusDisabled)
		}
	}
}

func studioSaveProgress(job *model.StudioWorkflowJob, progress StudioWorkflowProgress, percent int) error {
	encoded, err := common.Marshal(progress)
	if err != nil {
		return err
	}
	job.Result = model.StudioDocument(encoded)
	updated := model.DB.Model(&model.StudioWorkflowJob{}).Where("id = ? AND lease_owner = ?", job.ID, job.LeaseOwner).Updates(map[string]any{"result": model.StudioDocument(encoded), "progress": percent})
	if updated.Error != nil {
		return updated.Error
	}
	if updated.RowsAffected != 1 {
		return errors.New("workflow lease was lost")
	}
	return nil
}

func executeStudioWorkflow(ctx context.Context, job *model.StudioWorkflowJob) error {
	var plan StudioWorkflowPlan
	if err := common.Unmarshal([]byte(job.Plan), &plan); err != nil {
		return err
	}
	project, _, err := model.StudioProjectAccess(model.DB, job.UserID, job.ProjectID, true)
	if err != nil {
		return err
	}
	if job.Kind == "render" {
		frozen, err := common.Marshal(plan.Document)
		if err != nil {
			return err
		}
		project.Document = model.StudioDocument(frozen)
		project.Revision = job.Revision
		return RunStudioRender(ctx, job, project, plan.Render)
	}
	if job.Kind == "quality" {
		frozen, err := common.Marshal(plan.Document)
		if err != nil {
			return err
		}
		project.Document = model.StudioDocument(frozen)
		project.Revision = job.Revision
		return RunStudioQuality(ctx, job, project)
	}
	if job.Kind == "transcribe" {
		return RunStudioTranscription(ctx, job, project, plan.Operation)
	}
	if job.Kind == "media" {
		return RunStudioMediaOperation(ctx, job, project, plan.Operation)
	}
	if job.Kind == "graphics" {
		return RunStudioGraphics(ctx, job, project, &plan)
	}
	if job.Kind == "connector" {
		return RunStudioConnector(ctx, job, project, &plan)
	}
	if job.Kind == "previs" {
		return RunStudioPrevis(ctx, job, project, &plan)
	}
	if job.Kind == "transform" {
		return RunStudioTransform(ctx, job, project, &plan)
	}
	if job.Kind == "analyze" {
		return RunStudioReferenceAnalysis(ctx, job, project, &plan)
	}
	order, err := StudioWorkflowOrder(plan.Document, plan.NodeIDs)
	if err != nil {
		return err
	}
	var progress StudioWorkflowProgress
	if err := common.Unmarshal([]byte(job.Result), &progress); err != nil {
		return err
	}
	if progress.Outputs == nil {
		progress.Outputs = map[string]map[string]any{}
	}
	for _, node := range studioObjects(plan.Document, "nodes") {
		if take := progress.Outputs[fmt.Sprint(node["id"])]; take != nil {
			applyStudioWorkflowOutput(plan.Document, fmt.Sprint(node["id"]), take)
		}
	}
	for index, id := range order {
		var current model.StudioWorkflowJob
		if err := model.DB.Where("id = ?", job.ID).First(&current).Error; err != nil {
			return err
		}
		if current.Status == "paused" || current.Status == "cancelled" {
			return nil
		}
		already := false
		for _, done := range progress.Completed {
			if done == id {
				already = true
			}
		}
		if already {
			continue
		}
		var node map[string]any
		for _, candidate := range studioObjects(plan.Document, "nodes") {
			if candidate["id"] == id {
				node = candidate
				break
			}
		}
		data, _ := node["data"].(map[string]any)
		if data == nil {
			return errors.New("invalid workflow node")
		}
		if progress.NodeID == id && progress.Take != nil {
			if err := publishStudioWorkflowResult(job, id, progress); err != nil {
				return err
			}
			applyStudioWorkflowOutput(plan.Document, id, progress.Take)
			progress.Outputs[id] = progress.Take
			progress.Completed = append(progress.Completed, id)
			progress.Take, progress.TaskID, progress.Phase, progress.AdditionalTakes, progress.ResponseMediaID = nil, "", "completed", nil, ""
			if err := studioSaveProgress(job, progress, (index+1)*100/max(1, len(order))); err != nil {
				return err
			}
			continue
		}
		if takes, _ := data["takes"].([]any); len(takes) >= 100 {
			return errors.New("node reached its Take limit; archive an old Take before generation")
		}
		if data["purpose"] == "assembly" {
			return errors.New("use a render workflow for assembly nodes")
		}
		if !slices.Contains(plan.NodeIDs, id) && data["status"] == "completed" && (data["mediaId"] != nil || data["outputText"] != nil) {
			progress.Completed = append(progress.Completed, id)
			continue
		}
		modelName, _ := data["model"].(string)
		if modelName == "" {
			if data["kind"] == "text" {
				data["outputText"] = data["prompt"]
				progress.Completed = append(progress.Completed, id)
				continue
			}
			return fmt.Errorf("configure a model or upload media for node %s", id)
		}
		resumeTask := progress.NodeID == id && progress.TaskID != ""
		resumeReceipt := progress.NodeID == id && progress.ResponseMediaID != ""
		if !resumeTask && !resumeReceipt {
			progress.NodeID, progress.TaskID, progress.RequestID, progress.Phase = id, "", uuid.NewString(), "preparing"
		}
		if err := studioSaveProgress(job, progress, index*100/max(1, len(order))); err != nil {
			return err
		}
		kind, _ := data["kind"].(string)
		request, err := studioNodeRequest(ctx, project.OwnerID, plan.Document, node)
		if err != nil {
			return err
		}
		var response StudioRelayResponse
		if resumeTask {
			body, _ := common.Marshal(map[string]string{"id": progress.TaskID})
			response = StudioRelayResponse{Status: http.StatusOK, ContentType: "application/json", Body: body}
		} else if resumeReceipt {
			response, err = LoadStudioRelayReceipt(project.OwnerID, progress.ResponseMediaID)
			progress.AdditionalTakes = nil
		} else {
			if !StudioStorageWritable() {
				return errors.New(StudioStorageUnavailable)
			}
			progress.Phase = "submitting"
			if err := studioSaveProgress(job, progress, index*100/max(1, len(order))); err != nil {
				return err
			}
			response, err = StudioWorkflowRelay(ctx, job, kind, request)
		}
		if err != nil {
			model.DB.Model(&model.StudioWorkflowJob{}).Where("id = ? AND status = ?", job.ID, "running").Updates(map[string]any{"status": "uncertain", "error": "Generation response was lost. Inspect the task before submitting again."})
			return err
		}
		if response.Status < 200 || response.Status >= 300 {
			progress.Phase = "rejected"
			if !response.SafeToRetry && (response.Status >= 500 || response.Status == http.StatusRequestTimeout) {
				progress.Phase = "submitting"
				model.DB.Model(&model.StudioWorkflowJob{}).Where("id = ? AND lease_owner = ?", job.ID, job.LeaseOwner).Update("status", "uncertain")
			}
			if err := studioSaveProgress(job, progress, index*100/max(1, len(order))); err != nil {
				return err
			}
			var failure struct {
				Error struct {
					Code    string `json:"code"`
					Message string `json:"message"`
				} `json:"error"`
			}
			if common.Unmarshal(response.Body, &failure) == nil && failure.Error.Code == "local_inference_failed" {
				if strings.Contains(failure.Error.Message, "memory is exhausted") {
					return errors.New("Local model memory is exhausted. Completed results are retained. Wait or choose a smaller draft before retrying.")
				}
				return errors.New("The local model reported a terminal inference failure. Completed results are retained; review the task before retrying.")
			}
			return fmt.Errorf("generation returned HTTP %d", response.Status)
		}
		if !resumeTask && !resumeReceipt {
			media, err := SaveStudioMedia(project.OwnerID, "receipt-"+progress.RequestID, response.ContentType, bytes.NewReader(response.Body))
			if err != nil {
				return err
			}
			progress.ResponseMediaID, progress.Phase = media.MediaID, "responded"
			if err := studioSaveProgress(job, progress, index*100/max(1, len(order))); err != nil {
				return err
			}
		}
		take := map[string]any{"id": progress.RequestID, "createdAt": time.Now().UTC().Format(time.RFC3339Nano), "status": "completed", "model": modelName, "prompt": data["prompt"]}
		if kind == "text" {
			var parsed struct {
				Choices []struct {
					Message struct {
						Content string `json:"content"`
					} `json:"message"`
				} `json:"choices"`
			}
			if err := common.Unmarshal(response.Body, &parsed); err != nil || len(parsed.Choices) == 0 || parsed.Choices[0].Message.Content == "" {
				return errors.New("text generation returned no text")
			}
			take["outputText"] = parsed.Choices[0].Message.Content
			var shot StudioGeneratedShot
			if common.Unmarshal([]byte(parsed.Choices[0].Message.Content), &shot) == nil && shot.Text != "" {
				take["outputText"], take["outputImagePrompt"], take["outputVideoPrompt"] = shot.Text, shot.ImagePrompt, shot.VideoPrompt
			}
		} else {
			var content []byte
			mediaType := response.ContentType
			if kind == "video" {
				var parsed struct {
					ID string `json:"id"`
				}
				if common.Unmarshal(response.Body, &parsed) != nil || parsed.ID == "" {
					return errors.New("video generation returned no task ID")
				}
				progress.TaskID, progress.Phase = parsed.ID, "waiting"
				if err := studioSaveProgress(job, progress, index*100/max(1, len(order))); err != nil {
					return err
				}
				take["taskId"] = parsed.ID
				if err := waitStudioTask(ctx, job, parsed.ID); err != nil {
					return err
				}
				mediaResponse, err := StudioWorkflowRelay(ctx, job, "media:"+parsed.ID, nil)
				if err != nil || mediaResponse.Status != 200 {
					return errors.New("completed video could not be stored")
				}
				content, mediaType = mediaResponse.Body, mediaResponse.ContentType
			} else if kind == "image" {
				images, err := StudioGeneratedImages(response.Body)
				if err != nil {
					return err
				}
				takes, _ := data["takes"].([]any)
				if len(takes)+len(images) > 100 {
					return errors.New("generated image batch exceeds available Take capacity")
				}
				for imageIndex, image := range images {
					imageContent, imageType, err := ReadStudioRemoteMedia(ctx, image)
					if err != nil {
						return err
					}
					if !strings.HasPrefix(imageType, "image/") {
						return errors.New("image generation returned an incompatible media type")
					}
					if data["reworkRegion"] != nil {
						imageContent, imageType, err = studioComposeImageRegion(project.OwnerID, data, imageContent)
						if err != nil {
							return err
						}
					}
					if imageIndex == 0 {
						content, mediaType = imageContent, imageType
						continue
					}
					id := fmt.Sprintf("%s-%d", progress.RequestID, imageIndex+1)
					if _, err := SaveStudioMedia(project.OwnerID, id, imageType, bytes.NewReader(imageContent)); err != nil {
						return err
					}
					if err := LinkStudioProjectMedia(project.ID, id); err != nil {
						return err
					}
					progress.AdditionalTakes = append(progress.AdditionalTakes, map[string]any{"id": id, "createdAt": take["createdAt"], "status": "completed", "model": modelName, "prompt": data["prompt"], "mediaId": id})
				}
			} else {
				content = response.Body
			}
			mediaID := progress.RequestID
			if _, err := SaveStudioMedia(project.OwnerID, mediaID, mediaType, bytes.NewReader(content)); err != nil {
				return err
			}
			if err := LinkStudioProjectMedia(project.ID, mediaID); err != nil {
				return err
			}
			take["mediaId"] = mediaID
		}
		progress.Take, progress.Phase = take, "collected"
		if err := studioSaveProgress(job, progress, index*100/max(1, len(order))); err != nil {
			return err
		}
		if err := publishStudioWorkflowResult(job, id, progress); err != nil {
			return err
		}
		applyStudioWorkflowOutput(plan.Document, id, take)
		progress.Completed = append(progress.Completed, id)
		progress.Outputs[id] = take
		progress.Take = nil
		progress.AdditionalTakes = nil
		progress.ResponseMediaID = ""
		progress.TaskID = ""
		progress.Phase = "completed"
		if err := studioSaveProgress(job, progress, (index+1)*100/max(1, len(order))); err != nil {
			return err
		}
	}
	return nil
}

func waitStudioTask(ctx context.Context, job *model.StudioWorkflowJob, taskID string) error {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for {
		var current model.StudioWorkflowJob
		if err := model.DB.WithContext(ctx).Select("status").Where("id = ? AND user_id = ?", job.ID, job.UserID).First(&current).Error; err != nil {
			return err
		}
		if current.Status == "paused" || current.Status == "cancelled" {
			// The task poller keeps the upstream receipt. Release this workflow
			// worker so a stopped task cannot block the next production job.
			return context.Canceled
		}
		task, exists, err := model.GetByTaskId(job.UserID, taskID)
		if err != nil {
			return err
		}
		if exists && task.Status == model.TaskStatusSuccess {
			return nil
		}
		if exists && task.Status == model.TaskStatusFailure {
			return errors.New("video task failed: " + task.FailReason)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}
	}
}

func publishStudioWorkflowResult(job *model.StudioWorkflowJob, nodeID string, progress StudioWorkflowProgress) error {
	for _, take := range progress.AdditionalTakes {
		if err := publishStudioWorkflowTake(job, nodeID, take, false); err != nil {
			return err
		}
	}
	return publishStudioWorkflowTake(job, nodeID, progress.Take)
}

func publishStudioWorkflowTake(job *model.StudioWorkflowJob, nodeID string, take map[string]any, selections ...bool) error {
	for range 5 {
		project, _, err := model.StudioProjectAccess(model.DB, job.UserID, job.ProjectID, true)
		if err != nil {
			return err
		}
		var doc map[string]any
		if err := common.Unmarshal([]byte(project.Document), &doc); err != nil {
			return err
		}
		found := false
		var frozen StudioWorkflowPlan
		if err := common.Unmarshal([]byte(job.Plan), &frozen); err != nil {
			return err
		}
		// Reference cards generated earlier in this same workflow are expected
		// inputs. Replay their committed outputs before checking for human edits.
		// A different current reference or an edited prompt still fails the check.
		var committed StudioWorkflowProgress
		if len(job.Result) > 0 {
			if err := common.Unmarshal([]byte(job.Result), &committed); err != nil {
				return err
			}
		}
		for dependencyID, output := range committed.Outputs {
			if dependencyID != nodeID {
				applyStudioWorkflowOutput(frozen.Document, dependencyID, output)
			}
		}
		for _, node := range studioObjects(doc, "nodes") {
			if node["id"] != nodeID {
				continue
			}
			found = true
			data, _ := node["data"].(map[string]any)
			takes, _ := data["takes"].([]any)
			for _, value := range takes {
				if existing, ok := value.(map[string]any); ok && existing["id"] == take["id"] {
					return nil
				}
			}
			if len(takes) >= 100 {
				return errors.New("node reached its Take limit")
			}
			data["takes"] = append(takes, take)
			// Human edits win; retain the generated Take without selecting it when
			// the prompt or model changed while the worker was running.
			matches := studioWorkflowConfigurationMatches(frozen.Document, doc, nodeID)
			if job.Kind == "previs" || job.Kind == "graphics" {
				old, _ := frozen.Document["production"].(map[string]any)
				next, _ := doc["production"].(map[string]any)
				field := "previs"
				if job.Kind == "graphics" {
					field = "motionGraphics"
				}
				before, _ := common.Marshal(old[field])
				after, _ := common.Marshal(next[field])
				matches = matches && bytes.Equal(before, after)
			}
			if matches && data["locked"] != true && (len(selections) == 0 || selections[0]) {
				applyStudioTakeOutput(data, take)
				data["selectedTakeId"] = take["id"]
				if data["purpose"] == "assembly" {
					doc["assembledMediaId"] = take["mediaId"]
				}
				if assetID, ok := data["linkedAssetId"].(string); ok && take["mediaId"] != nil {
					for _, asset := range studioObjects(doc, "assets") {
						if asset["id"] != assetID {
							continue
						}
						asset["mediaId"] = take["mediaId"]
						versions, _ := asset["versions"].([]any)
						if len(versions) < 30 {
							version := map[string]any{"id": take["id"], "createdAt": take["createdAt"], "prompt": asset["prompt"], "mediaId": take["mediaId"]}
							for _, artifact := range studioObjects(take, "auxiliary") {
								if artifact["role"] == "mesh" && artifact["mimeType"] == "model/gltf-binary" {
									version["modelMediaId"] = artifact["mediaId"]
								}
							}
							if asset["profile"] != nil {
								version["profile"] = asset["profile"]
							}
							if version["modelMediaId"] != nil {
								asset["modelMediaId"] = version["modelMediaId"]
							} else {
								delete(asset, "modelMediaId")
							}
							asset["versions"] = append(versions, version)
						}
					}
				}
				for _, shot := range studioObjects(doc, "shots") {
					if shot["videoNodeId"] == nodeID || shot["imageNodeId"] == nodeID {
						shot["reviewStatus"] = "unreviewed"
					}
				}
				pending := []string{nodeID}
				visited := map[string]bool{nodeID: true}
				for len(pending) > 0 {
					source := pending[0]
					pending = pending[1:]
					for _, edge := range studioObjects(doc, "edges") {
						pin, _ := edge["data"].(map[string]any)
						target, _ := edge["target"].(string)
						if edge["source"] != source || pin["sourceTakeId"] != nil || visited[target] {
							continue
						}
						visited[target] = true
						pending = append(pending, target)
						for _, dependent := range studioObjects(doc, "nodes") {
							if dependent["id"] == target {
								output, _ := dependent["data"].(map[string]any)
								output["status"] = "idle"
								for _, key := range []string{"mediaId", "outputUrl", "outputText", "outputImagePrompt", "outputVideoPrompt", "taskId", "selectedTakeId"} {
									delete(output, key)
								}
							}
						}
					}
				}
			}
		}
		if !found {
			return errors.New("the generated node was deleted; workflow result remains available")
		}
		encoded, err := common.Marshal(doc)
		if err != nil {
			return err
		}
		if _, err := ValidateStudioDocument(project.ID, encoded); err != nil {
			return err
		}
		_, err = model.SaveStudioProject(job.UserID, project.ID, project.Title, project.Revision, string(encoded))
		if errors.Is(err, model.ErrStudioRevision) {
			continue
		}
		return err
	}
	return model.ErrStudioRevision
}

func studioNodeRequest(ctx context.Context, ownerID int, document map[string]any, node map[string]any) ([]byte, error) {
	data, _ := node["data"].(map[string]any)
	prompt, _ := data["prompt"].(string)
	request := map[string]any{"model": data["model"], "studio_group": data["group"]}
	images, content := []string{}, []any{}
	depthReference := false
	for _, edge := range studioObjects(document, "edges") {
		if edge["target"] != node["id"] {
			continue
		}
		for _, source := range studioObjects(document, "nodes") {
			if source["id"] != edge["source"] {
				continue
			}
			sourceData, _ := source["data"].(map[string]any)
			if pinned, _ := edge["data"].(map[string]any); pinned["sourceTakeId"] != nil {
				takes, _ := sourceData["takes"].([]any)
				for _, value := range takes {
					take, _ := value.(map[string]any)
					if take["id"] == pinned["sourceTakeId"] {
						sourceData = take
						break
					}
				}
			}
			if text, ok := sourceData["outputText"].(string); ok && text != "" {
				if edge["sourceHandle"] == "image_prompt" {
					if value, ok := sourceData["outputImagePrompt"].(string); ok {
						text = value
					}
				}
				if edge["sourceHandle"] == "video_prompt" {
					if value, ok := sourceData["outputVideoPrompt"].(string); ok {
						text = value
					}
				}
				prompt = strings.TrimSpace(prompt + "\n" + text)
			}
			mediaID, _ := sourceData["mediaId"].(string)
			if mediaID != "" {
				role, _ := edge["targetHandle"].(string)
				if data["kind"] == "video" && role == "" {
					originalSource, _ := source["data"].(map[string]any)
					if originalSource["kind"] == "video" {
						role = "reference_video"
					} else {
						role = "first_frame"
					}
				}
				if strings.HasPrefix(role, "reference_video") {
					role = "reference_video"
					depthReference = depthReference || studioDepthReference(sourceData)
				}
				if strings.HasPrefix(role, "reference_image") {
					role = "reference_image"
				}
				if role == "extend_video" {
					frame, err := StudioLastFrame(ctx, ownerID, mediaID)
					if err != nil {
						return nil, err
					}
					mediaID, role = frame.MediaID, "first_frame"
				}
				url, err := StudioMediaDataURL(ownerID, mediaID)
				if data["kind"] == "video" && data["model"] != "wan2.1-vace-1.3b" && role != "first_frame" && role != "last_frame" {
					url, err = StudioMediaProviderReference(ownerID, mediaID)
				}
				if err != nil {
					return nil, err
				}
				if strings.HasPrefix(role, "reference_video") || role == "extend_video" || role == "native_extend" {
					if role == "native_extend" {
						request["mode"] = "extend"
					}
					content = append(content, map[string]any{"type": "video_url", "role": "reference_video", "video_url": map[string]string{"url": url}})
				} else {
					images = append(images, url)
					content = append(content, map[string]any{"type": "image_url", "role": role, "image_url": map[string]string{"url": url}})
				}
			}
		}
	}
	if camera, ok := data["camera"].(map[string]any); ok {
		encoded, _ := common.Marshal(camera)
		prompt += "\nCamera: " + string(encoded)
	}
	selectedAssets, _ := data["assetIds"].([]any)
	pinnedVersions, _ := data["assetVersionIds"].(map[string]any)
	production, _ := document["production"].(map[string]any)
	// This local Wan endpoint implements first-frame conditioning only. Character
	// assets condition the generated first frame; their descriptions still enter
	// motion generation, while unsupported native reference-image slots do not.
	firstFrameOnly := data["kind"] == "video" && data["model"] == "wan2.2-ti2v-5b"
	if data["kind"] == "video" && data["model"] == "wan2.1-vace-1.3b" {
		for _, raw := range content {
			item, _ := raw.(map[string]any)
			if item["role"] == "first_frame" || item["role"] == "last_frame" {
				firstFrameOnly = true
			}
		}
	}
	shotPins := map[string]any{}
	for key, value := range pinnedVersions {
		shotPins[key] = value
	}
	for _, shot := range studioObjects(document, "shots") {
		if shot["videoNodeId"] != node["id"] && shot["imageNodeId"] != node["id"] && shot["textNodeId"] != node["id"] {
			continue
		}
		for _, state := range studioObjects(production, "continuityStates") {
			if state["shotId"] != shot["id"] {
				continue
			}
			selectedAssets = append(selectedAssets, state["assetId"])
			if versionID, ok := state["versionId"].(string); ok && versionID != "" {
				shotPins[fmt.Sprint(state["assetId"])] = versionID
			}
		}
	}
	pinnedVersions = shotPins
	for _, asset := range studioObjects(document, "assets") {
		selected := asset["id"] == data["linkedAssetId"]
		for _, id := range selectedAssets {
			if id == asset["id"] {
				selected = true
			}
		}
		if !selected {
			continue
		}
		reference := asset
		if versionID := pinnedVersions[fmt.Sprint(asset["id"])]; versionID != nil {
			found := false
			versions, _ := asset["versions"].([]any)
			for _, value := range versions {
				version, _ := value.(map[string]any)
				if version["id"] == versionID {
					reference = version
					found = true
					break
				}
			}
			if !found {
				return nil, errors.New("pinned asset version is unavailable")
			}
		}
		if value, ok := reference["prompt"].(string); ok {
			prompt += "\n" + value
		}
		if profile, ok := reference["profile"].(map[string]any); ok {
			encoded, _ := common.Marshal(profile)
			prompt += "\n" + string(encoded)
		}
		if mediaID, ok := reference["mediaId"].(string); ok && mediaID != "" {
			if firstFrameOnly {
				continue
			}
			url, err := StudioMediaDataURL(ownerID, mediaID)
			if data["kind"] == "video" {
				url, err = StudioMediaProviderReference(ownerID, mediaID)
			}
			if err != nil {
				return nil, err
			}
			images = append(images, url)
			content = append(content, map[string]any{"type": "image_url", "role": "reference_image", "image_url": map[string]string{"url": url}})
		}
	}
	if len(prompt) > 30000 {
		return nil, errors.New("combined prompt exceeds 30000 characters")
	}
	for _, shot := range studioObjects(document, "shots") {
		if shot["videoNodeId"] != node["id"] && shot["imageNodeId"] != node["id"] && shot["textNodeId"] != node["id"] {
			continue
		}
		if production, ok := document["production"].(map[string]any); ok {
			for _, scene := range studioObjects(production, "scenes") {
				shotIDs, _ := scene["shotIds"].([]any)
				for _, id := range shotIDs {
					if id == shot["id"] && pinnedVersions[fmt.Sprint(scene["id"])] == nil {
						prompt += "\nScene: " + fmt.Sprint(scene["title"]) + ": " + fmt.Sprint(scene["description"])
					}
				}
			}
			bindings, _ := production["assetBindings"].(map[string]any)
			selected, _ := bindings[fmt.Sprint(shot["id"])].([]any)
			for _, prop := range studioObjects(production, "props") {
				for _, id := range selected {
					if prop["id"] == id {
						prompt += "\nProp: " + fmt.Sprint(prop["title"]) + ": " + fmt.Sprint(prop["description"])
						if data["kind"] != "image" && data["kind"] != "video" {
							continue
						}
						if firstFrameOnly {
							continue
						}
						mediaIDs, _ := prop["mediaIds"].([]any)
						for _, value := range mediaIDs {
							mediaID, _ := value.(string)
							url, err := StudioMediaDataURL(ownerID, mediaID)
							if data["kind"] == "video" {
								url, err = StudioMediaProviderReference(ownerID, mediaID)
							}
							if err != nil {
								return nil, err
							}
							images = append(images, url)
							content = append(content, map[string]any{"type": "image_url", "role": "reference_image", "image_url": map[string]string{"url": url}})
						}
					}
				}
			}
		}
		if shot["camera"] != nil {
			prompt += "\nCamera: " + fmt.Sprint(shot["camera"])
		}
		if shot["dialogue"] != nil && data["kind"] != "image" && !firstFrameOnly {
			prompt += "\nDialogue: " + fmt.Sprint(shot["dialogue"])
		}
		for _, state := range studioObjects(production, "continuityStates") {
			if state["shotId"] != shot["id"] {
				continue
			}
			for _, field := range []string{"wardrobe", "emotion", "propState", "note"} {
				if value, ok := state[field].(string); ok && strings.TrimSpace(value) != "" {
					prompt += "\n" + field + ": " + value
				}
			}
			mediaIDs, _ := state["referenceMediaIds"].([]any)
			for _, value := range mediaIDs {
				if firstFrameOnly {
					continue
				}
				mediaID, _ := value.(string)
				url, err := StudioMediaDataURL(ownerID, mediaID)
				if data["kind"] == "video" {
					url, err = StudioMediaProviderReference(ownerID, mediaID)
				}
				if err != nil {
					return nil, err
				}
				images = append(images, url)
				content = append(content, map[string]any{"type": "image_url", "role": "reference_image", "image_url": map[string]string{"url": url}})
			}
		}
	}
	if len(prompt) > 30000 {
		return nil, errors.New("combined prompt exceeds 30000 characters")
	}
	switch data["kind"] {
	case "text":
		systemPrompt := studioShotSystemPrompt
		if data["textMode"] == "plain" || data["purpose"] == "script" {
			systemPrompt = studioPlainTextSystemPrompt
		}
		if data["purpose"] == "script" {
			systemPrompt = studioScreenplaySystemPrompt
		}
		if data["assistantPlan"] == true {
			systemPrompt = studioAssistantPlanSystemPrompt
		}
		request["messages"] = []any{map[string]string{"role": "system", "content": systemPrompt}, map[string]string{"role": "user", "content": prompt}}
		request["max_tokens"] = 8192
		if data["assistantPlan"] == true && data["model"] == "qwen3.5:9b" {
			request["max_tokens"] = 4096
			request["context_length"] = 32768
			skillID, _ := data["assistantSkillId"].(string)
			scoped := make(map[string]any, len(document)+1)
			for key, value := range document {
				scoped[key] = value
			}
			scoped["assistantScopeNodeIds"] = data["assistantScopeNodeIds"]
			format, err := studioAssistantResponseSchema(scoped, prompt, skillID)
			if err != nil {
				return nil, err
			}
			request["response_format"] = format
		}
	case "image":
		if data["reworkRegion"] != nil {
			reference, err := studioImageRegionReference(ownerID, document, data)
			if err != nil {
				return nil, err
			}
			images = []string{reference}
		}
		request["prompt"] = prompt
		rawMetadata, _ := data["metadataJson"].(string)
		metadata, err := StudioRequestOptions(rawMetadata)
		if err != nil {
			return nil, err
		}
		if len(metadata) > 0 {
			request["metadata"] = metadata
		}
		request["n"] = 1
		if count, ok := data["imageCount"].(float64); ok {
			takes, _ := data["takes"].([]any)
			if count != math.Trunc(count) || count < 1 || count > dto.MaxImageN || count+float64(len(takes)) > 100 {
				return nil, errors.New("invalid image count or insufficient Take capacity")
			}
			request["n"] = int(count)
		}
		if len(images) > 0 {
			request["images"] = images
		}
		if data["imageSize"] != nil {
			request["size"] = data["imageSize"]
		}
		if data["imageQuality"] != nil {
			request["quality"] = data["imageQuality"]
		}
	case "audio":
		request["input"] = prompt
		request["voice"] = data["voice"]
		if request["voice"] == nil {
			request["voice"] = "alloy"
		}
		request["response_format"] = "mp3"
		if data["speed"] != nil {
			request["speed"] = data["speed"]
		}
	case "video":
		if keys, ok := data["videoKeyframes"].([]any); ok && len(keys) > 0 {
			if data["model"] != "wan2.1-vace-1.3b" || len(keys) > 8 {
				return nil, errors.New("timed frame control requires a compatible VACE model")
			}
			seen := map[int]bool{}
			duration := 5.0
			if seconds, ok := data["seconds"].(float64); ok {
				duration = seconds
			}
			for _, raw := range keys {
				key, _ := raw.(map[string]any)
				id, _ := key["mediaId"].(string)
				timestamp, valid := key["time"].(float64)
				frame := int(math.Round(timestamp * 16))
				if !valid || timestamp < 0 || timestamp > duration || math.IsNaN(timestamp) || math.IsInf(timestamp, 0) || seen[frame] {
					return nil, errors.New("timed keyframes must have distinct frame times within the shot")
				}
				seen[frame] = true
				media, err := GetStudioMedia(ownerID, id)
				if err != nil || !strings.HasPrefix(media.MimeType, "image/") {
					return nil, errors.New("timed keyframe image is unavailable")
				}
				url, err := StudioMediaProviderReference(ownerID, id)
				if err != nil {
					return nil, err
				}
				content = append(content, map[string]any{"type": "image_url", "role": "key_frame", "time": timestamp, "image_url": map[string]string{"url": url}})
			}
		}
		if rawRange, ok := data["reworkRange"].(map[string]any); ok {
			mediaID, _ := rawRange["sourceMediaId"].(string)
			start, startOK := rawRange["start"].(float64)
			end, endOK := rawRange["end"].(float64)
			if !startOK || !endOK || end <= start || !StudioMediaReferences(document)[mediaID] {
				return nil, errors.New("invalid rework time range")
			}
			frame, err := StudioFrameAt(ctx, ownerID, mediaID, start)
			if err != nil {
				return nil, err
			}
			source, err := GetStudioMedia(ownerID, mediaID)
			if err != nil {
				return nil, err
			}
			path, err := StudioMediaPath(source)
			if err != nil {
				return nil, err
			}
			probe, err := ProbeStudioMedia(ctx, path)
			if err != nil || end > probe.Duration+0.05 {
				return nil, errors.New("rework time range exceeds the source video")
			}
			url, err := StudioMediaDataURL(ownerID, frame.MediaID)
			if err != nil {
				return nil, err
			}
			images = []string{url}
			filtered := []any{map[string]any{"type": "image_url", "role": "first_frame", "image_url": map[string]string{"url": url}}}
			for _, raw := range content {
				reference, _ := raw.(map[string]any)
				if reference["role"] != "first_frame" {
					filtered = append(filtered, raw)
				}
			}
			content = filtered
		}
		lastFrames, firstFrames := 0, 0
		for _, rawReference := range content {
			reference, ok := rawReference.(map[string]any)
			if !ok {
				continue
			}
			if reference["role"] == "last_frame" {
				lastFrames++
			}
			if reference["role"] == "first_frame" {
				firstFrames++
			}
		}
		if lastFrames > 1 || (lastFrames > 0 && firstFrames > 1) {
			return nil, errors.New("each frame slot accepts one image")
		}
		if lastFrames > 0 {
			modelName, _ := data["model"].(string)
			modelName = strings.ToLower(modelName)
			if !strings.Contains(modelName, "seedance") && !strings.Contains(modelName, "h3") && modelName != "wan2.1-vace-1.3b" {
				return nil, errors.New("selected model does not declare last-frame support")
			}
			for _, rawReference := range content {
				reference, ok := rawReference.(map[string]any)
				if !ok {
					continue
				}
				if modelName != "wan2.1-vace-1.3b" && (reference["role"] == "reference_image" || reference["role"] == "reference_video") {
					return nil, errors.New("frame mode cannot be mixed with reference mode")
				}
			}
		}
		request["prompt"] = prompt
		seconds := 5
		if value, ok := data["seconds"].(float64); ok {
			if value != math.Trunc(value) || value < 1 || value > relaycommon.MaxTaskDurationSeconds {
				return nil, errors.New("invalid video duration")
			}
			seconds = int(value)
		}
		if seconds < 1 || seconds > relaycommon.MaxTaskDurationSeconds {
			return nil, errors.New("invalid video duration")
		}
		request["seconds"] = fmt.Sprint(seconds)
		rawMetadata, _ := data["metadataJson"].(string)
		metadata, err := StudioRequestOptions(rawMetadata)
		if err != nil {
			return nil, err
		}
		if data["resolution"] != nil {
			metadata["resolution"] = data["resolution"]
		}
		if depthReference {
			if data["model"] != "wan2.1-vace-1.3b" {
				return nil, errors.New("depth-video control requires a compatible VACE model")
			}
			metadata["reference_control"] = "depth"
		}
		if data["referenceControl"] == "depth" || data["referenceControl"] == "edges" {
			if data["model"] != "wan2.1-vace-1.3b" {
				return nil, errors.New("movement control requires a compatible VACE model")
			}
			if !depthReference {
				metadata["reference_control"] = data["referenceControl"]
			}
		}
		if data["ratio"] != nil {
			metadata["ratio"] = data["ratio"]
		}
		if len(content) > 0 {
			metadata["content"] = content
		}
		if len(images) > 0 && lastFrames == 0 {
			request["image"] = images[0]
			request["input_reference"] = images[0]
		}
		request["metadata"] = metadata
		if data["model"] == "wan2.2-ti2v-5b" {
			request["size"] = "640x384"
			if data["ratio"] == "9:16" {
				request["size"] = "384x640"
			}
			if data["ratio"] == "1:1" {
				request["size"] = "512x512"
			}
			if resolution, ok := data["resolution"].(string); ok && resolution != "" {
				request["size"] = resolution
			}
		}
		if data["model"] == "wan2.1-vace-1.3b" {
			request["size"] = "640x384"
			if data["ratio"] == "9:16" {
				request["size"] = "384x640"
			}
			if data["ratio"] == "1:1" {
				request["size"] = "512x512"
			}
			if resolution, ok := data["resolution"].(string); ok && resolution != "" {
				request["size"] = resolution
			}
			imageCount, videoCount := 0, 0
			for _, raw := range content {
				item, _ := raw.(map[string]any)
				if item["role"] == "reference_image" {
					imageCount++
				}
				if item["role"] == "reference_video" {
					videoCount++
				}
			}
			if imageCount > 1 || videoCount > 1 {
				return nil, errors.New("VACE accepts one reference per slot")
			}
			if request["mode"] == "extend" {
				return nil, errors.New("local VACE continuation requires an extracted last frame")
			}
		}
		rawPatch, _ := data["payloadPatchJson"].(string)
		patch, err := StudioRequestOptions(rawPatch)
		if err != nil {
			return nil, err
		}
		allowed := map[string]bool{"seconds": true, "duration": true, "mode": true, "size": true, "image": true, "images": true, "input_reference": true, "metadata": true}
		for key, value := range patch {
			if !allowed[key] {
				return nil, errors.New("unsupported video payload override")
			}
			request[key] = value
		}
		if duration, exists := patch["duration"]; exists {
			request["seconds"] = fmt.Sprint(duration)
		}
	default:
		return nil, errors.New("unsupported workflow node")
	}
	return common.Marshal(request)
}

func StudioMediaDataURL(ownerID int, mediaID string) (string, error) {
	media, err := GetStudioMedia(ownerID, mediaID)
	if err != nil {
		return "", err
	}
	if media.Size > 12<<20 {
		return "", errors.New("reference media exceeds the inline provider limit")
	}
	path, err := StudioMediaPath(media)
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return "data:" + media.MimeType + ";base64," + base64.StdEncoding.EncodeToString(data), nil
}

func ReadStudioRemoteMedia(ctx context.Context, rawURL string) ([]byte, string, error) {
	if strings.HasPrefix(rawURL, "data:") {
		header, encoded, ok := strings.Cut(rawURL, ",")
		if !ok || !strings.HasSuffix(header, ";base64") || len(encoded) > StudioMaxMediaBytes*2 {
			return nil, "", errors.New("invalid generated media")
		}
		data, err := base64.StdEncoding.DecodeString(encoded)
		return data, strings.TrimSuffix(strings.TrimPrefix(header, "data:"), ";base64"), err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, "", err
	}
	response, err := GetSSRFProtectedHTTPClient().Do(request)
	if err != nil {
		return nil, "", err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, "", errors.New("generated media download failed")
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, StudioMaxMediaBytes+1))
	if len(data) > StudioMaxMediaBytes {
		return nil, "", errors.New("generated media exceeds 512 MiB")
	}
	return data, response.Header.Get("Content-Type"), err
}
