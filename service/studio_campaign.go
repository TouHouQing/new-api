/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
package service

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"gorm.io/gorm"
)

type StudioCampaignValue struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Value any    `json:"value"`
}
type StudioCampaignAxis struct {
	ID     string                `json:"id"`
	Label  string                `json:"label"`
	Kind   string                `json:"kind"`
	Path   string                `json:"path"`
	Values []StudioCampaignValue `json:"values"`
}
type StudioCampaignVariant struct {
	ID                  string            `json:"id"`
	Values              map[string]string `json:"values"`
	Budget              int64             `json:"budget"`
	ProjectID           string            `json:"project_id"`
	ProjectRevision     int64             `json:"project_revision"`
	ChangedNodeIDs      []string          `json:"changed_node_ids"`
	JobID               string            `json:"job_id,omitempty"`
	JobStatus           string            `json:"job_status,omitempty"`
	NeedsDialogueReview bool              `json:"needs_dialogue_review,omitempty"`
}
type StudioCampaignRequest struct {
	ID              string                  `json:"id"`
	Title           string                  `json:"title"`
	ProjectID       string                  `json:"project_id"`
	ProjectRevision int64                   `json:"project_revision"`
	TotalBudget     int64                   `json:"total_budget"`
	Axes            []StudioCampaignAxis    `json:"axes"`
	Variants        []StudioCampaignVariant `json:"variants"`
	SampleVariantID string                  `json:"sample_variant_id"`
}
type StudioCampaign struct {
	ID                     string                  `json:"id"`
	Title                  string                  `json:"title"`
	SourceProjectID        string                  `json:"source_project_id"`
	SourceRevision         int64                   `json:"source_revision"`
	SourceDigest           string                  `json:"source_digest"`
	Revision               int64                   `json:"revision"`
	TotalBudget            int64                   `json:"total_budget"`
	Axes                   []StudioCampaignAxis    `json:"axes"`
	Variants               []StudioCampaignVariant `json:"variants"`
	SampleVariantID        string                  `json:"sample_variant_id"`
	SampleApprovedRevision int64                   `json:"sample_approved_revision,omitempty"`
	CreatedAt              string                  `json:"created_at"`
}

func studioCampaignRequestID(id, variant string) string { return "campaign_" + id + "_" + variant }

func studioCampaignRead(actorID int, id string, write bool) (*model.StudioProductionRecord, *StudioCampaign, error) {
	if !StudioIDPattern.MatchString(id) || len(id) > 80 {
		return nil, nil, model.ErrStudioAccess
	}
	record, err := model.ReadStudioProductionRecord(actorID, id, write)
	if err != nil || record.Kind != "campaign" {
		return nil, nil, model.ErrStudioAccess
	}
	if write && record.OwnerID != actorID {
		return nil, nil, model.ErrStudioAccess
	}
	var campaign StudioCampaign
	if common.Unmarshal([]byte(record.Document), &campaign) != nil {
		return nil, nil, errors.New("stored campaign is invalid")
	}
	return record, &campaign, nil
}

func ReadStudioCampaign(actorID int, id string) (*StudioCampaign, error) {
	record, campaign, err := studioCampaignRead(actorID, id, false)
	if err != nil {
		return nil, err
	}
	for index := range campaign.Variants {
		variant := &campaign.Variants[index]
		var job model.StudioWorkflowJob
		// The stable request ID also recovers a crash after enqueue but before
		// the campaign receipt update. A retry must return that same job.
		if model.DB.Where("user_id = ? AND request_id = ? AND project_id = ?", record.OwnerID, studioCampaignRequestID(id, variant.ID), variant.ProjectID).First(&job).Error == nil {
			variant.JobID, variant.JobStatus = job.ID, job.Status
		}
		if variant.NeedsDialogueReview {
			child, _, accessErr := model.StudioProjectAccess(model.DB, actorID, variant.ProjectID, false)
			var document map[string]any
			if accessErr == nil && common.Unmarshal([]byte(child.Document), &document) == nil && studioCampaignDialogueReady(record.OwnerID, campaign, variant, document) {
				variant.NeedsDialogueReview = false
			}
		}
	}
	return campaign, nil
}

func ListStudioCampaigns(actorID int, projectID string) ([]StudioCampaign, error) {
	if _, _, err := model.StudioProjectAccess(model.DB, actorID, projectID, false); err != nil {
		return nil, err
	}
	var records []model.StudioProductionRecord
	if err := model.DB.Where("project_id = ? AND kind = ?", projectID, "campaign").Order("created_at DESC").Limit(100).Find(&records).Error; err != nil {
		return nil, err
	}
	result := []StudioCampaign{}
	for _, record := range records {
		campaign, err := ReadStudioCampaign(actorID, record.ID)
		if err != nil {
			return nil, err
		}
		result = append(result, *campaign)
	}
	return result, nil
}

func studioCampaignTarget(document map[string]any, axis StudioCampaignAxis) (map[string]any, string, error) {
	parts := strings.Split(strings.TrimPrefix(axis.Path, "/"), "/")
	if !slices.Contains([]string{"hook", "benefit", "audience", "scene", "duration", "language"}, axis.Kind) {
		return nil, "", errors.New("unsupported campaign variable")
	}
	if len(parts) == 4 && parts[0] == "nodes" && parts[2] == "data" && (parts[3] == "prompt" || axis.Kind == "duration" && parts[3] == "seconds") {
		index, err := strconv.Atoi(parts[1])
		nodes := studioObjects(document, "nodes")
		if err != nil || index < 0 || index >= len(nodes) {
			return nil, "", errors.New("campaign target is unavailable")
		}
		data, _ := nodes[index]["data"].(map[string]any)
		if data == nil || data["locked"] == true || data["purpose"] == "assembly" || data["sourceMode"] == "upload" {
			return nil, "", errors.New("campaign target is locked or cannot generate independently")
		}
		if axis.Kind == "language" {
			return nil, "", errors.New("language variants require explicit translated dialogue or caption text")
		}
		if axis.Kind == "duration" && (parts[3] != "seconds" || data["kind"] != "video") {
			return nil, "", errors.New("duration variables require a video duration field")
		}
		return data, parts[3], nil
	}
	if len(parts) == 3 && parts[0] == "shots" && axis.Kind == "language" && (parts[2] == "dialogue" || parts[2] == "shotCaptionText") {
		index, err := strconv.Atoi(parts[1])
		shots := studioObjects(document, "shots")
		if err != nil || index < 0 || index >= len(shots) {
			return nil, "", errors.New("campaign shot is unavailable")
		}
		for _, node := range studioObjects(document, "nodes") {
			data, _ := node["data"].(map[string]any)
			if (node["id"] == shots[index]["videoNodeId"] || node["id"] == shots[index]["textNodeId"]) && data["locked"] == true {
				return nil, "", errors.New("campaign target is locked")
			}
		}
		return shots[index], parts[2], nil
	}
	return nil, "", errors.New("campaign variables may only change declared shot directions, duration or translated dialogue")
}

func studioCampaignVariantDocument(source map[string]any, axes []StudioCampaignAxis, variant StudioCampaignVariant) (map[string]any, []string, bool, error) {
	var document map[string]any
	raw, err := common.Marshal(source)
	if err != nil {
		return nil, nil, false, err
	}
	if err = common.Unmarshal(raw, &document); err != nil {
		return nil, nil, false, err
	}
	changed := map[string]bool{}
	language := false
	languageShots := map[string]bool{}
	oldVoiceMedia := map[string]bool{}
	for _, axis := range axes {
		parent, key, err := studioCampaignTarget(document, axis)
		if err != nil {
			return nil, nil, false, err
		}
		var value *StudioCampaignValue
		for index := range axis.Values {
			if axis.Values[index].ID == variant.Values[axis.ID] {
				value = &axis.Values[index]
				break
			}
		}
		if value == nil {
			return nil, nil, false, errors.New("campaign combination contains an unknown variable value")
		}
		old, _ := common.Marshal(parent[key])
		next, _ := common.Marshal(value.Value)
		parent[key] = value.Value
		if string(old) == string(next) {
			continue
		}
		parts := strings.Split(strings.TrimPrefix(axis.Path, "/"), "/")
		index, _ := strconv.Atoi(parts[1])
		if parts[0] == "nodes" {
			id, _ := studioObjects(document, "nodes")[index]["id"].(string)
			changed[id] = true
		} else {
			language = true
			shot := studioObjects(document, "shots")[index]
			shotID, _ := shot["id"].(string)
			languageShots[shotID] = true
			if voiceID, ok := shot["shotVoiceoverMediaId"].(string); ok {
				oldVoiceMedia[voiceID] = true
			}
			id, _ := shot["videoNodeId"].(string)
			changed[id] = true
			for _, field := range []string{"shotVoiceoverMediaId", "shotVoiceoverVolume", "shotVoiceoverOffsetSeconds", "shotCaptionOffsetSeconds", "shotCaptionDurationSeconds"} {
				delete(shot, field)
			}
			if key != "shotCaptionText" {
				delete(shot, "shotCaptionText")
			}
		}
	}
	// Invalidate only descendants of changed creative inputs. Completed inputs
	// on other branches remain immutable shared media rather than regeneration.
	for pass := 0; pass < len(studioObjects(document, "nodes")); pass++ {
		added := false
		for _, edge := range studioObjects(document, "edges") {
			from, _ := edge["source"].(string)
			to, _ := edge["target"].(string)
			if changed[from] && !changed[to] {
				changed[to] = true
				added = true
			}
		}
		if !added {
			break
		}
	}
	ids := []string{}
	for _, node := range studioObjects(document, "nodes") {
		id, _ := node["id"].(string)
		data, _ := node["data"].(map[string]any)
		if !changed[id] || data == nil {
			continue
		}
		if data["locked"] == true {
			return nil, nil, false, errors.New("an affected downstream shot is locked")
		}
		for _, field := range []string{"mediaId", "outputUrl", "selectedTakeId", "outputText", "outputImagePrompt", "outputVideoPrompt", "taskId", "pendingRequestId", "pendingRequestFingerprint", "pendingRequestPrompt", "pendingRequestGroup", "pendingRequestModel", "pendingRequestSnapshot", "error", "progress"} {
			delete(data, field)
		}
		data["status"] = "idle"
		if data["purpose"] != "assembly" {
			ids = append(ids, id)
		}
	}
	if len(ids) == 0 || len(ids) > 100 {
		return nil, nil, false, errors.New("a campaign variant must change at least one independent generation node")
	}
	delete(document, "assembledMediaId")
	delete(document, "assembledPlan")
	production, _ := document["production"].(map[string]any)
	if production != nil {
		for _, field := range []string{"assistant", "milestones", "reviews", "changes", "continuityReviews", "templateOrigin", "appliedEditPlans", "captionDraft"} {
			delete(production, field)
		}
		for _, clip := range studioObjects(production, "timeline") {
			id, _ := clip["nodeId"].(string)
			if changed[id] {
				delete(clip, "takeId")
				if language {
					clip["caption"] = ""
				}
			}
		}
		if images, ok := production["approvedKeyImages"].(map[string]any); ok {
			for _, shot := range studioObjects(document, "shots") {
				id, _ := shot["imageNodeId"].(string)
				if changed[id] {
					delete(images, shot["id"].(string))
				}
			}
		}
		if language {
			if voiceID, ok := document["voiceoverMediaId"].(string); ok {
				oldVoiceMedia[voiceID] = true
			}
			delete(document, "captionsText")
			delete(document, "voiceoverMediaId")
			cues := []any{}
			for _, cue := range studioObjects(production, "dialogueCues") {
				shotID, _ := cue["shotId"].(string)
				if languageShots[shotID] {
					if mediaID, ok := cue["audioMediaId"].(string); ok {
						oldVoiceMedia[mediaID] = true
					}
					continue
				}
				cues = append(cues, cue)
			}
			if _, exists := production["dialogueCues"]; exists {
				production["dialogueCues"] = cues
			}
			tracks := []any{}
			for _, track := range studioObjects(production, "audioTracks") {
				mediaID, _ := track["mediaId"].(string)
				if !oldVoiceMedia[mediaID] {
					tracks = append(tracks, track)
				}
			}
			if _, exists := production["audioTracks"]; exists {
				production["audioTracks"] = tracks
			}
		}
	}
	return document, ids, language, nil
}

func CreateStudioCampaign(actorID int, input StudioCampaignRequest) (*StudioCampaign, error) {
	if !StudioIDPattern.MatchString(input.ID) || len(input.ID) > 80 || strings.TrimSpace(input.Title) == "" || len([]rune(input.Title)) > 120 || input.ProjectRevision < 1 || input.TotalBudget < 1 || input.TotalBudget > 2_000_000_000 || len(input.Axes) < 1 || len(input.Axes) > 6 || len(input.Variants) < 1 || len(input.Variants) > 16 {
		return nil, errors.New("invalid campaign matrix")
	}
	requestBytes, _ := common.Marshal(input)
	digest := sha256.Sum256(requestBytes)
	fingerprint := hex.EncodeToString(digest[:])
	var prior model.StudioProductionRecord
	if model.DB.First(&prior, "id = ?", input.ID).Error == nil {
		if prior.OwnerID != actorID {
			return nil, model.ErrStudioAccess
		}
		if prior.Kind != "campaign" || prior.Fingerprint != fingerprint {
			return nil, model.ErrStudioRevision
		}
		return ReadStudioCampaign(actorID, input.ID)
	}
	project, role, err := model.StudioProjectAccess(model.DB, actorID, input.ProjectID, true)
	if err != nil || role != "owner" {
		return nil, model.ErrStudioAccess
	}
	if project.Revision != input.ProjectRevision {
		return nil, model.ErrStudioRevision
	}
	var source map[string]any
	if err = common.Unmarshal([]byte(project.Document), &source); err != nil {
		return nil, err
	}
	axes := map[string]bool{}
	paths := map[string]bool{}
	for _, axis := range input.Axes {
		if !StudioIDPattern.MatchString(axis.ID) || len(axis.ID) > 40 || axes[axis.ID] || paths[axis.Path] || strings.TrimSpace(axis.Label) == "" || len([]rune(axis.Label)) > 200 || len(axis.Values) < 1 || len(axis.Values) > 4 {
			return nil, errors.New("invalid campaign variable")
		}
		axes[axis.ID], paths[axis.Path] = true, true
		if _, _, err := studioCampaignTarget(source, axis); err != nil {
			return nil, err
		}
		seen := map[string]bool{}
		for _, value := range axis.Values {
			if !StudioIDPattern.MatchString(value.ID) || seen[value.ID] || len(value.ID) > 40 || strings.TrimSpace(value.Label) == "" || len([]rune(value.Label)) > 200 {
				return nil, errors.New("invalid campaign value")
			}
			seen[value.ID] = true
			if axis.Kind == "duration" {
				number, ok := value.Value.(float64)
				if !ok || number < 1 || number > relaycommon.MaxTaskDurationSeconds || number != float64(int(number)) {
					return nil, errors.New("invalid campaign video duration")
				}
			} else {
				text, ok := value.Value.(string)
				if !ok || strings.TrimSpace(text) == "" || len([]rune(text)) > 30000 {
					return nil, errors.New("invalid campaign creative text")
				}
			}
		}
	}
	budget := int64(0)
	ids := map[string]bool{}
	combinations := map[string]bool{}
	sampleFound := false
	for _, variant := range input.Variants {
		if !StudioIDPattern.MatchString(variant.ID) || len(variant.ID) > 24 || ids[variant.ID] || variant.Budget < 1 || variant.Budget > input.TotalBudget-budget || len(variant.Values) != len(input.Axes) {
			return nil, errors.New("variant allocations exceed the campaign budget or contain duplicate identifiers")
		}
		for id := range variant.Values {
			if !axes[id] {
				return nil, errors.New("unknown campaign variable")
			}
		}
		encoded, _ := common.Marshal(variant.Values)
		if combinations[string(encoded)] {
			return nil, errors.New("duplicate campaign combination")
		}
		combinations[string(encoded)] = true
		budget += variant.Budget
		ids[variant.ID] = true
		sampleFound = sampleFound || variant.ID == input.SampleVariantID
	}
	if !sampleFound {
		return nil, errors.New("choose a sample from the selected variants")
	}
	sourceSum := sha256.Sum256([]byte(project.Document))
	campaign := &StudioCampaign{ID: input.ID, Title: strings.TrimSpace(input.Title), SourceProjectID: project.ID, SourceRevision: project.Revision, SourceDigest: hex.EncodeToString(sourceSum[:]), Revision: 1, TotalBudget: input.TotalBudget, Axes: input.Axes, Variants: []StudioCampaignVariant{}, SampleVariantID: input.SampleVariantID, CreatedAt: time.Now().UTC().Format(time.RFC3339)}
	projects := []model.StudioProject{}
	for _, requested := range input.Variants {
		document, changed, language, err := studioCampaignVariantDocument(source, input.Axes, requested)
		if err != nil {
			return nil, err
		}
		childID := input.ID + "_" + requested.ID
		document["id"], document["title"], document["createdAt"], document["updatedAt"] = childID, fmt.Sprintf("%s · %s", campaign.Title, requested.ID), campaign.CreatedAt, campaign.CreatedAt
		raw, err := common.Marshal(document)
		if err != nil {
			return nil, err
		}
		title, err := ValidateStudioDocument(childID, raw)
		if err != nil {
			return nil, err
		}
		for mediaID := range StudioMediaReferences(document) {
			if _, err := GetStudioMedia(project.OwnerID, mediaID); err != nil {
				return nil, model.ErrStudioAccess
			}
		}
		projects = append(projects, model.StudioProject{ID: childID, OwnerID: actorID, Title: title, Revision: 1, Document: model.StudioDocument(raw)})
		campaign.Variants = append(campaign.Variants, StudioCampaignVariant{ID: requested.ID, Values: requested.Values, Budget: requested.Budget, ProjectID: childID, ProjectRevision: 1, ChangedNodeIDs: changed, NeedsDialogueReview: language})
	}
	raw, err := common.Marshal(campaign)
	if err != nil || len(raw) > StudioMaxDocumentBytes {
		return nil, errors.New("campaign exceeds its document limit")
	}
	err = model.DB.Transaction(func(tx *gorm.DB) error {
		var current model.StudioProject
		if tx.First(&current, "id = ? AND owner_id = ? AND revision = ?", project.ID, actorID, input.ProjectRevision).Error != nil {
			return model.ErrStudioRevision
		}
		for index := range projects {
			child := &projects[index]
			if err := tx.Create(child).Error; err != nil {
				return model.ErrStudioRevision
			}
			if err := tx.Create(&model.StudioProjectVersion{ProjectID: child.ID, Revision: 1, AuthorID: actorID, Document: child.Document}).Error; err != nil {
				return err
			}
			var document map[string]any
			if err := common.Unmarshal([]byte(child.Document), &document); err != nil {
				return err
			}
			for mediaID := range StudioMediaReferences(document) {
				if err := tx.Create(&model.StudioProjectMediaLink{ProjectID: child.ID, MediaID: mediaID}).Error; err != nil {
					return err
				}
			}
		}
		return tx.Create(&model.StudioProductionRecord{ID: input.ID, ProjectID: project.ID, OwnerID: actorID, AuthorID: actorID, Kind: "campaign", Revision: 1, State: "prepared", Fingerprint: fingerprint, Document: model.StudioDocument(raw)}).Error
	})
	if err != nil {
		if existing, _, readErr := studioCampaignRead(actorID, input.ID, false); readErr == nil && existing.Fingerprint == fingerprint {
			return ReadStudioCampaign(actorID, input.ID)
		}
		return nil, err
	}
	return campaign, nil
}

func SubmitStudioCampaignVariant(actorID int, id, variantID string, confirm bool) (*model.StudioWorkflowJob, error) {
	if !confirm {
		return nil, errors.New("campaign generation requires explicit confirmation")
	}
	record, campaign, err := studioCampaignRead(actorID, id, true)
	if err != nil {
		return nil, err
	}
	var variant *StudioCampaignVariant
	for index := range campaign.Variants {
		if campaign.Variants[index].ID == variantID {
			variant = &campaign.Variants[index]
			break
		}
	}
	if variant == nil {
		return nil, errors.New("campaign variant is unavailable")
	}
	if variantID != campaign.SampleVariantID {
		if campaign.SampleApprovedRevision < 1 {
			return nil, errors.New("review and approve the sample before starting other variants")
		}
		for _, sample := range campaign.Variants {
			if sample.ID == campaign.SampleVariantID {
				project, _, err := model.StudioProjectAccess(model.DB, actorID, sample.ProjectID, false)
				if err != nil || project.Revision != campaign.SampleApprovedRevision {
					return nil, errors.New("the approved sample changed; review it again")
				}
			}
		}
	}
	job, err := QueueStudioWorkflow(actorID, variant.ProjectID, studioCampaignRequestID(id, variant.ID), "generate", variant.ProjectRevision, variant.Budget, variant.ChangedNodeIDs, nil)
	if err != nil {
		return nil, err
	}
	variant.JobID, variant.JobStatus = job.ID, job.Status
	campaign.Revision++
	raw, _ := common.Marshal(campaign)
	updated := model.DB.Model(&model.StudioProductionRecord{}).Where("id = ? AND revision = ?", id, record.Revision).Updates(map[string]any{"document": model.StudioDocument(raw), "revision": campaign.Revision, "updated_at": time.Now()})
	if updated.Error != nil {
		return nil, updated.Error
	}
	// An optimistic conflict never triggers a second job. Read derives any
	// missing receipt from the stable request ID, even after a lost response.
	return job, nil
}

func ApproveStudioCampaignSample(actorID int, id string, revision int64) (*StudioCampaign, error) {
	record, campaign, err := studioCampaignRead(actorID, id, true)
	if err != nil {
		return nil, err
	}
	if record.Revision != revision {
		return nil, model.ErrStudioRevision
	}
	for _, sample := range campaign.Variants {
		if sample.ID != campaign.SampleVariantID {
			continue
		}
		var job model.StudioWorkflowJob
		if model.DB.Where("user_id = ? AND project_id = ? AND request_id = ? AND status = ?", actorID, sample.ProjectID, studioCampaignRequestID(id, sample.ID), "succeeded").First(&job).Error != nil {
			return nil, errors.New("the sample must finish successfully before approval")
		}
		project, _, err := model.StudioProjectAccess(model.DB, actorID, sample.ProjectID, false)
		if err != nil {
			return nil, err
		}
		var plan StudioWorkflowPlan
		var current map[string]any
		if common.Unmarshal([]byte(job.Plan), &plan) != nil || common.Unmarshal([]byte(project.Document), &current) != nil {
			return nil, errors.New("the sample production snapshot is unavailable")
		}
		if studioCampaignCreativeInputs(plan.Document, sample.ChangedNodeIDs, !sample.NeedsDialogueReview) != studioCampaignCreativeInputs(current, sample.ChangedNodeIDs, !sample.NeedsDialogueReview) {
			return nil, errors.New("the sample draft changed after generation; create and review a new experiment")
		}
		if sample.NeedsDialogueReview && !studioCampaignDialogueReady(actorID, campaign, &sample, current) {
			return nil, errors.New("finish and review the translated voice and subtitles before approving this sample")
		}
		campaign.SampleApprovedRevision = project.Revision
	}
	if campaign.SampleApprovedRevision < 1 {
		return nil, errors.New("campaign sample is unavailable")
	}
	campaign.Revision++
	raw, _ := common.Marshal(campaign)
	updated := model.DB.Model(&model.StudioProductionRecord{}).Where("id = ? AND revision = ?", id, revision).Updates(map[string]any{"document": model.StudioDocument(raw), "revision": campaign.Revision, "state": "sample_approved", "updated_at": time.Now()})
	if updated.Error != nil {
		return nil, updated.Error
	}
	if updated.RowsAffected != 1 {
		return nil, model.ErrStudioRevision
	}
	return ReadStudioCampaign(actorID, id)
}

func studioCampaignCreativeInputs(document map[string]any, nodeIDs []string, includeCaptions bool) string {
	inputs := []any{}
	for _, node := range studioObjects(document, "nodes") {
		id, _ := node["id"].(string)
		if !slices.Contains(nodeIDs, id) {
			continue
		}
		data, _ := node["data"].(map[string]any)
		input := map[string]any{"id": id}
		for _, key := range []string{"prompt", "model", "group", "seconds", "camera", "resolution", "ratio", "imageSize", "imageQuality", "imageCount", "assetIds", "assetVersionIds", "metadataJson", "payloadPatchJson", "referenceControl"} {
			if value, ok := data[key]; ok {
				input[key] = value
			}
		}
		inputs = append(inputs, input)
	}
	inputs = append(inputs, document["edges"], document["assets"])
	for _, shot := range studioObjects(document, "shots") {
		input := []any{shot["id"], shot["dialogue"], shot["camera"]}
		if includeCaptions {
			input = append(input, shot["shotCaptionText"])
		}
		inputs = append(inputs, input)
	}
	raw, _ := common.Marshal(inputs)
	return string(raw)
}

func studioCampaignDialogueReady(ownerID int, campaign *StudioCampaign, variant *StudioCampaignVariant, document map[string]any) bool {
	for _, axis := range campaign.Axes {
		if axis.Kind != "language" {
			continue
		}
		parts := strings.Split(strings.TrimPrefix(axis.Path, "/"), "/")
		if len(parts) != 3 {
			return false
		}
		index, err := strconv.Atoi(parts[1])
		shots := studioObjects(document, "shots")
		if err != nil || index < 0 || index >= len(shots) {
			return false
		}
		shot := shots[index]
		var translated string
		for _, value := range axis.Values {
			if value.ID == variant.Values[axis.ID] {
				translated, _ = value.Value.(string)
			}
		}
		if translated == "" || shot["shotCaptionText"] != translated {
			return false
		}
		if parts[2] == "shotCaptionText" {
			continue
		}
		if shot["dialogue"] != translated {
			return false
		}
		voiceID, _ := shot["shotVoiceoverMediaId"].(string)
		if voiceID == "" {
			production, _ := document["production"].(map[string]any)
			for _, cue := range studioObjects(production, "dialogueCues") {
				if cue["shotId"] == shot["id"] && cue["text"] == translated {
					voiceID, _ = cue["audioMediaId"].(string)
					if voiceID != "" {
						break
					}
				}
			}
		}
		if voiceID == "" {
			return false
		}
		media, err := GetStudioMedia(ownerID, voiceID)
		if err != nil || !strings.HasPrefix(media.MimeType, "audio/") {
			return false
		}
	}
	return true
}
