/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"reflect"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"gorm.io/gorm"
)

type StudioTemplateInput struct {
	ID       string `json:"id"`
	Label    string `json:"label"`
	Kind     string `json:"kind"`
	Path     string `json:"path"`
	Required bool   `json:"required"`
	Default  any    `json:"default"`
}
type StudioTemplateSlot struct {
	ID       string `json:"id"`
	Label    string `json:"label"`
	Kind     string `json:"kind"`
	MediaID  string `json:"media_id"`
	Required bool   `json:"required"`
}

type StudioTemplateBinding struct {
	Path    string `json:"path"`
	Pattern string `json:"pattern"`
}
type StudioTemplateDefinition struct {
	ID                string                  `json:"id"`
	Version           int64                   `json:"version"`
	Name              string                  `json:"name"`
	Description       string                  `json:"description"`
	Kind              string                  `json:"kind"`
	SourceProjectID   string                  `json:"source_project_id,omitempty"`
	SourceRevision    int64                   `json:"source_revision,omitempty"`
	SourceLicense     string                  `json:"source_license"`
	SampleMediaID     string                  `json:"sample_media_id,omitempty"`
	Blueprint         map[string]any          `json:"blueprint"`
	Inputs            []StudioTemplateInput   `json:"inputs"`
	Bindings          []StudioTemplateBinding `json:"bindings,omitempty"`
	Slots             []StudioTemplateSlot    `json:"slots"`
	Capabilities      []map[string]any        `json:"capabilities"`
	CreatedAt         string                  `json:"created_at"`
	LegacyFingerprint string                  `json:"legacy_fingerprint,omitempty"`
}
type StudioTemplateSaveRequest struct {
	ID               string                  `json:"id"`
	ExpectedVersion  int64                   `json:"expected_version"`
	ProjectID        string                  `json:"project_id"`
	ProjectRevision  int64                   `json:"project_revision"`
	Name             string                  `json:"name"`
	Description      string                  `json:"description"`
	SourceLicense    string                  `json:"source_license"`
	Inputs           []StudioTemplateInput   `json:"inputs"`
	Bindings         []StudioTemplateBinding `json:"bindings,omitempty"`
	LegacyParameters map[string]any          `json:"legacy_parameters,omitempty"`
}
type StudioTemplateInstantiateRequest struct {
	ProjectID          string            `json:"project_id"`
	Title              string            `json:"title"`
	Version            int64             `json:"version"`
	Inputs             map[string]any    `json:"inputs"`
	Media              map[string]string `json:"media"`
	ReuseOriginalMedia bool              `json:"reuse_original_media"`
}

func studioTemplateVersionID(id string, version int64) string {
	return fmt.Sprintf("%s_v%d", id, version)
}

func ListStudioTemplateDefinitions(actorID int) ([]StudioTemplateDefinition, error) {
	var records []model.StudioProductionRecord
	if err := model.DB.Where("owner_id = ? AND kind = ?", actorID, "template").Order("revision DESC").Limit(2000).Find(&records).Error; err != nil {
		return nil, err
	}
	result := []StudioTemplateDefinition{}
	seen := map[string]bool{}
	for _, record := range records {
		var definition StudioTemplateDefinition
		if common.Unmarshal([]byte(record.Document), &definition) != nil || seen[definition.ID] {
			continue
		}
		seen[definition.ID] = true
		// The list carries metadata and inputs, not every production blueprint.
		definition.Blueprint = nil
		result = append(result, definition)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].CreatedAt > result[j].CreatedAt })
	return result, nil
}

func ReadStudioTemplateDefinition(actorID int, id string, version int64) (*StudioTemplateDefinition, error) {
	if !StudioIDPattern.MatchString(id) || len(id) > 100 || version < 0 {
		return nil, errors.New("invalid template version")
	}
	var record model.StudioProductionRecord
	query := model.DB.Where("owner_id = ? AND kind = ? AND parent_id = ?", actorID, "template", id)
	if version > 0 {
		query = query.Where("revision = ?", version)
	}
	if query.Order("revision DESC").First(&record).Error != nil {
		return nil, model.ErrStudioAccess
	}
	var definition StudioTemplateDefinition
	if common.Unmarshal([]byte(record.Document), &definition) != nil {
		return nil, errors.New("stored template is invalid")
	}
	return &definition, nil
}

// Templates retain creative structure and immutable media references, never task
// receipts, review approvals, external URLs or request/credential snapshots.
func studioTemplateClean(value any) {
	switch item := value.(type) {
	case map[string]any:
		for key, child := range item {
			lower := strings.ToLower(key)
			forbidden := strings.Contains(lower, "token") || strings.Contains(lower, "password") || strings.Contains(lower, "credential") || strings.Contains(lower, "secret") || strings.Contains(lower, "authorization") || strings.Contains(lower, "apikey") || strings.HasSuffix(lower, "url") || strings.HasSuffix(lower, "uri") || strings.HasPrefix(lower, "pending")
			switch key {
			case "taskId", "requestSnapshot", "templateSnapshot", "clientRequestId", "channelId", "metadataJson", "payloadPatchJson", "error", "progress", "assembledMediaId", "assembledPlan", "reviewNote", "reviewStatus", "briefSettingsKey":
				forbidden = true
			}
			if forbidden {
				delete(item, key)
				continue
			}
			studioTemplateClean(child)
		}
	case []any:
		for _, child := range item {
			studioTemplateClean(child)
		}
	}
}

// Only explicit creative fields can be replaced; IDs, model routes, stored
// media references and template lineage are outside this boundary.
func studioTemplateInputTarget(document map[string]any, path string) (map[string]any, string, error) {
	parts := strings.Split(strings.TrimPrefix(path, "/"), "/")
	if len(parts) < 2 || len(parts) > 8 || !strings.HasPrefix(path, "/") {
		return nil, "", errors.New("invalid template input path")
	}
	key := parts[len(parts)-1]
	if studioTemplateTargetLimit(path) == 0 {
		return nil, "", errors.New("template input must target an editable creative field")
	}
	var current any = document
	for _, part := range parts[:len(parts)-1] {
		if part == "__proto__" || part == "constructor" || part == "prototype" {
			return nil, "", errors.New("invalid template input path")
		}
		switch item := current.(type) {
		case map[string]any:
			current = item[part]
		case []any:
			index, err := strconv.Atoi(part)
			if err != nil || index < 0 || index >= len(item) {
				return nil, "", errors.New("template input path is unavailable")
			}
			current = item[index]
		default:
			return nil, "", errors.New("template input path is unavailable")
		}
	}
	parent, ok := current.(map[string]any)
	if !ok {
		return nil, "", errors.New("template input path is unavailable")
	}
	if _, ok := parent[key]; !ok {
		return nil, "", errors.New("template input path is unavailable")
	}
	return parent, key, nil
}

// Paths are structural allowlists. A similarly named field inside a Take,
// receipt, asset version or an unknown future object is never writable.
func studioTemplateTargetLimit(path string) int {
	for pattern, limit := range map[string]int{
		`^/nodes/(0|[1-9][0-9]*)/data/prompt$`:                                         30000,
		`^/nodes/(0|[1-9][0-9]*)/data/title$`:                                          200,
		`^/nodes/(0|[1-9][0-9]*)/data/voice$`:                                          100,
		`^/nodes/(0|[1-9][0-9]*)/data/seconds$`:                                        3600,
		`^/nodes/(0|[1-9][0-9]*)/data/camera/(shotSize|angle|movement|lens|lighting)$`: 200,
		`^/assets/(0|[1-9][0-9]*)/title$`:                                              200,
		`^/assets/(0|[1-9][0-9]*)/prompt$`:                                             10000,
		`^/assets/(0|[1-9][0-9]*)/profile/(appearance|wardrobe|personality|voice|age|body|face|hair|eyes|makeup|accessories|timeOfDay|atmosphere|lighting|palette|continuity|avoid)$`: 2000,
		`^/shots/(0|[1-9][0-9]*)/title$`:                                                            200,
		`^/shots/(0|[1-9][0-9]*)/(dialogue|shotCaptionText)$`:                                       30000,
		`^/shots/(0|[1-9][0-9]*)/camera$`:                                                           2000,
		`^/shots/(0|[1-9][0-9]*)/shotType$`:                                                         200,
		`^/production/creativeBrief/(subject|audience)$`:                                            300,
		`^/production/creativeBrief/benefit$`:                                                       1000,
		`^/production/creativeBrief/callToAction$`:                                                  500,
		`^/production/brandKit/name$`:                                                               120,
		`^/production/brandKit/(address|callToAction)$`:                                             300,
		`^/production/timeline/(0|[1-9][0-9]*)/caption$`:                                            30000,
		`^/production/brief$`:                                                                       30000,
		`^/production/scenes/(0|[1-9][0-9]*)/title$`:                                                200,
		`^/production/scenes/(0|[1-9][0-9]*)/description$`:                                          10000,
		`^/production/props/(0|[1-9][0-9]*)/title$`:                                                 200,
		`^/production/props/(0|[1-9][0-9]*)/description$`:                                           10000,
		`^/production/shotNarrative/[A-Za-z0-9_-]{1,128}/emotion$`:                                  500,
		`^/production/shotNarrative/[A-Za-z0-9_-]{1,128}/(information|visualBeat|continuityNeeds)$`: 2000,
	} {
		if regexp.MustCompile(pattern).MatchString(path) {
			return limit
		}
	}
	return 0
}

var studioTemplateToken = regexp.MustCompile(`\{\{([^{}]+)\}\}`)

func studioTemplateRenderPattern(pattern string, values map[string]any) (string, error) {
	if len([]rune(pattern)) > 30000 || len(studioTemplateToken.FindAllStringSubmatch(pattern, -1)) == 0 {
		return "", errors.New("template binding must contain declared input tokens")
	}
	remaining := studioTemplateToken.ReplaceAllString(pattern, "")
	if strings.ContainsAny(remaining, "{}") {
		return "", errors.New("invalid template binding token")
	}
	var problem error
	result := studioTemplateToken.ReplaceAllStringFunc(pattern, func(token string) string {
		id := token[2 : len(token)-2]
		value, ok := values[id]
		if !ok || !StudioIDPattern.MatchString(id) {
			problem = errors.New("template binding references an unknown input")
			return ""
		}
		switch value := value.(type) {
		case string:
			return value
		case float64:
			return strconv.FormatFloat(value, 'f', -1, 64)
		default:
			problem = errors.New("invalid template binding input type")
			return ""
		}
	})
	return result, problem
}

func studioTemplateValidateBindings(definition *StudioTemplateDefinition) error {
	if len(definition.Bindings) > 100 {
		return errors.New("too many template bindings")
	}
	values, targets := map[string]any{}, map[string]bool{}
	for _, field := range definition.Inputs {
		if targets[field.Path] {
			return errors.New("duplicate template target")
		}
		targets[field.Path], values[field.ID] = true, field.Default
	}
	for _, binding := range definition.Bindings {
		if targets[binding.Path] {
			return errors.New("duplicate template target")
		}
		targets[binding.Path] = true
		parent, key, err := studioTemplateInputTarget(definition.Blueprint, binding.Path)
		if err != nil {
			return err
		}
		original, ok := parent[key].(string)
		if !ok {
			return errors.New("template binding target must be text")
		}
		rendered, err := studioTemplateRenderPattern(binding.Pattern, values)
		if err != nil {
			return err
		}
		if len([]rune(rendered)) > studioTemplateTargetLimit(binding.Path) || rendered != original {
			return errors.New("template binding defaults must reproduce the current creative field exactly")
		}
	}
	return nil
}

func SaveStudioTemplate(actorID int, input StudioTemplateSaveRequest) (*StudioTemplateDefinition, error) {
	if !StudioIDPattern.MatchString(input.ID) || len(input.ID) > 100 || input.ExpectedVersion < 0 || strings.TrimSpace(input.Name) == "" || len([]rune(input.Name)) > 120 || len([]rune(input.Description)) > 2000 || len([]rune(input.SourceLicense)) > 2000 || len(input.Inputs) > 100 {
		return nil, errors.New("invalid production template")
	}
	version := input.ExpectedVersion + 1
	if input.ExpectedVersion > 0 {
		latest, err := ReadStudioTemplateDefinition(actorID, input.ID, 0)
		if err != nil {
			return nil, err
		}
		if latest.Version != input.ExpectedVersion {
			return nil, model.ErrStudioRevision
		}
	} else {
		if _, err := ReadStudioTemplateDefinition(actorID, input.ID, 0); err == nil {
			return nil, model.ErrStudioRevision
		}
	}
	definition := StudioTemplateDefinition{ID: input.ID, Version: version, Name: strings.TrimSpace(input.Name), Description: input.Description, SourceLicense: input.SourceLicense, Kind: "production", Inputs: input.Inputs, Bindings: input.Bindings, Slots: []StudioTemplateSlot{}, Capabilities: []map[string]any{}, CreatedAt: time.Now().UTC().Format(time.RFC3339)}
	if input.LegacyParameters != nil {
		if input.ExpectedVersion != 0 {
			return nil, errors.New("import legacy parameters as a separate template")
		}
		allowed := map[string]bool{"model": true, "group": true, "seconds": true, "resolution": true, "ratio": true}
		for key := range input.LegacyParameters {
			if !allowed[key] {
				return nil, errors.New("legacy parameter contains unsupported fields")
			}
		}
		modelName, _ := input.LegacyParameters["model"].(string)
		seconds, ok := input.LegacyParameters["seconds"].(float64)
		if modelName == "" || len(modelName) > 200 || !ok || seconds < 1 || seconds > 3600 || seconds != float64(int(seconds)) {
			return nil, errors.New("invalid legacy parameters")
		}
		raw, _ := common.Marshal(input.LegacyParameters)
		sum := sha256.Sum256(raw)
		definition.LegacyFingerprint = hex.EncodeToString(sum[:])
		var imports []model.StudioProductionRecord
		if err := model.DB.Where("owner_id = ? AND kind = ?", actorID, "template").Find(&imports).Error; err != nil {
			return nil, err
		}
		for _, record := range imports {
			var existing StudioTemplateDefinition
			if common.Unmarshal([]byte(record.Document), &existing) == nil && existing.LegacyFingerprint == definition.LegacyFingerprint {
				return &existing, nil
			}
		}
		data := map[string]any{"kind": "video", "title": "Video", "prompt": "", "model": modelName, "seconds": seconds, "status": "idle"}
		for key, value := range input.LegacyParameters {
			if key != "model" {
				data[key] = value
			}
		}
		definition.Kind = "parameters"
		definition.Blueprint = map[string]any{"id": "parameter-template", "title": input.Name, "nodes": []any{map[string]any{"id": "video", "type": "studio", "position": map[string]any{"x": 0, "y": 0}, "data": data}}, "edges": []any{}, "createdAt": definition.CreatedAt, "updatedAt": definition.CreatedAt}
		definition.Inputs = []StudioTemplateInput{{ID: "prompt", Label: "Video description", Kind: "text", Path: "/nodes/0/data/prompt", Required: true, Default: ""}}
	} else {
		project, role, err := model.StudioProjectAccess(model.DB, actorID, input.ProjectID, false)
		if err != nil || role != "owner" {
			return nil, model.ErrStudioAccess
		}
		if input.ProjectRevision < 1 || project.Revision != input.ProjectRevision {
			return nil, model.ErrStudioRevision
		}
		definition.SourceProjectID, definition.SourceRevision = project.ID, project.Revision
		if err := common.Unmarshal([]byte(project.Document), &definition.Blueprint); err != nil {
			return nil, err
		}
		definition.SampleMediaID, _ = definition.Blueprint["assembledMediaId"].(string)
		if definition.SampleMediaID != "" {
			media, err := GetStudioMedia(actorID, definition.SampleMediaID)
			if err != nil || !strings.HasPrefix(media.MimeType, "video/") {
				return nil, errors.New("template sample must be a stored video owned by you")
			}
			path, err := StudioMediaPath(media)
			if err != nil {
				return nil, err
			}
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			probe, probeErr := ProbeStudioMedia(ctx, path)
			cancel()
			if probeErr != nil || !probe.HasVideo || probe.Duration <= 0 {
				return nil, errors.New("template sample must be a readable finished video")
			}
		}
		studioTemplateClean(definition.Blueprint)
		for _, node := range studioObjects(definition.Blueprint, "nodes") {
			data, _ := node["data"].(map[string]any)
			if data == nil {
				continue
			}
			completed := []any{}
			for _, take := range studioObjects(data, "takes") {
				if take["status"] == "completed" && (take["mediaId"] != "" && take["mediaId"] != nil || take["outputText"] != "" && take["outputText"] != nil) {
					completed = append(completed, take)
				}
			}
			if _, exists := data["takes"]; exists {
				data["takes"] = completed
			}
			selected := false
			for _, raw := range completed {
				if raw.(map[string]any)["id"] == data["selectedTakeId"] {
					selected = true
				}
			}
			if !selected {
				delete(data, "selectedTakeId")
			}
			data["status"] = "idle"
			if data["mediaId"] != "" && data["mediaId"] != nil || data["outputText"] != "" && data["outputText"] != nil {
				data["status"] = "completed"
			}
		}
		if production, ok := definition.Blueprint["production"].(map[string]any); ok {
			for _, key := range []string{"assistant", "milestones", "reviews", "changes", "templateOrigin", "analysisRefs", "appliedEditPlans", "continuityReviews", "referenceAnalysis", "mediaAnalysis", "editPlans", "campaignExperiments", "publishJobs", "collaboration", "qualityChecks"} {
				delete(production, key)
			}
		}
	}
	seen := map[string]bool{}
	for index := range definition.Inputs {
		field := &definition.Inputs[index]
		if !StudioIDPattern.MatchString(field.ID) || seen[field.ID] || strings.TrimSpace(field.Label) == "" || len([]rune(field.Label)) > 200 || field.Kind != "text" && field.Kind != "number" {
			return nil, errors.New("invalid template input schema")
		}
		parent, key, err := studioTemplateInputTarget(definition.Blueprint, field.Path)
		if err != nil {
			return nil, err
		}
		switch value := parent[key].(type) {
		case string:
			if field.Kind != "text" || len([]rune(value)) > studioTemplateTargetLimit(field.Path) {
				return nil, errors.New("template input type mismatch")
			}
			field.Default = value
		case float64:
			if field.Kind != "number" || math.IsNaN(value) || math.IsInf(value, 0) || value < 1 || value > 3600 {
				return nil, errors.New("template input type mismatch")
			}
			field.Default = value
		default:
			return nil, errors.New("template input must be text or a number")
		}
		field.Required = true
		seen[field.ID] = true
	}
	if err := studioTemplateValidateBindings(&definition); err != nil {
		return nil, err
	}
	refs := StudioMediaReferences(definition.Blueprint)
	var active map[string]any
	_ = common.Unmarshal(mustStudioTemplateJSON(definition.Blueprint), &active)
	studioTemplateRemoveHistory(active)
	activeRefs := StudioMediaReferences(active)
	ids := make([]string, 0, len(refs))
	for id := range refs {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		media, err := GetStudioMedia(actorID, id)
		if err != nil {
			return nil, errors.New("template references media not owned by you")
		}
		if !activeRefs[id] {
			continue
		}
		kind, _, _ := strings.Cut(media.MimeType, "/")
		label := id
		for _, node := range studioObjects(definition.Blueprint, "nodes") {
			data, _ := node["data"].(map[string]any)
			if data["mediaId"] == id {
				if title, ok := data["title"].(string); ok && title != "" {
					label = title
					break
				}
			}
		}
		definition.Slots = append(definition.Slots, StudioTemplateSlot{ID: id, Label: label, MediaID: id, Kind: kind, Required: true})
	}
	for _, node := range studioObjects(definition.Blueprint, "nodes") {
		data, _ := node["data"].(map[string]any)
		if data == nil {
			continue
		}
		if data["kind"] == "video" || data["kind"] == "image" || data["kind"] == "audio" {
			capability := map[string]any{}
			for _, key := range []string{"kind", "model", "videoFamily", "resolution", "ratio", "seconds", "imageSize", "referenceControl"} {
				if value, ok := data[key]; ok {
					capability[key] = value
				}
			}
			definition.Capabilities = append(definition.Capabilities, capability)
		}
	}
	raw, err := common.Marshal(definition)
	if err != nil || len(raw) > StudioMaxDocumentBytes {
		return nil, errors.New("template exceeds its limit")
	}
	if _, err := ValidateStudioDocument(definition.Blueprint["id"].(string), mustStudioTemplateJSON(definition.Blueprint)); err != nil {
		return nil, err
	}
	sum := sha256.Sum256(raw)
	record := &model.StudioProductionRecord{ID: studioTemplateVersionID(input.ID, version), ParentID: input.ID, Kind: "template", Revision: version, State: "ready", Document: model.StudioDocument(raw), Fingerprint: hex.EncodeToString(sum[:])}
	if _, err := model.CreateStudioProductionRecord(actorID, record); err != nil {
		return nil, err
	}
	return &definition, nil
}

func studioTemplateRemoveHistory(value any) {
	switch item := value.(type) {
	case map[string]any:
		for key, child := range item {
			if key == "takes" || key == "versions" || key == "history" || key == "requestSnapshot" || key == "derivedFrom" {
				delete(item, key)
				continue
			}
			studioTemplateRemoveHistory(child)
		}
	case []any:
		for _, child := range item {
			studioTemplateRemoveHistory(child)
		}
	}
}

func mustStudioTemplateJSON(value any) []byte { raw, _ := common.Marshal(value); return raw }

func InstantiateStudioTemplate(actorID int, id string, input StudioTemplateInstantiateRequest) (*model.StudioProject, error) {
	if !StudioIDPattern.MatchString(input.ProjectID) || input.Version < 1 || strings.TrimSpace(input.Title) == "" || len([]rune(input.Title)) > 200 {
		return nil, errors.New("invalid template instance")
	}
	definition, err := ReadStudioTemplateDefinition(actorID, id, input.Version)
	if err != nil {
		return nil, err
	}
	var document map[string]any
	if err := common.Unmarshal(mustStudioTemplateJSON(definition.Blueprint), &document); err != nil {
		return nil, err
	}
	if len(input.Inputs) != len(definition.Inputs) {
		return nil, errors.New("provide every declared template input")
	}
	if err := studioTemplateValidateBindings(definition); err != nil {
		return nil, err
	}
	changedPaths := []string{}
	for _, field := range definition.Inputs {
		value, ok := input.Inputs[field.ID]
		if !ok {
			return nil, errors.New("template input is missing")
		}
		switch field.Kind {
		case "text":
			text, ok := value.(string)
			if !ok || strings.TrimSpace(text) == "" || len([]rune(text)) > studioTemplateTargetLimit(field.Path) {
				return nil, errors.New("template text input is invalid")
			}
		case "number":
			number, ok := value.(float64)
			if !ok || math.IsNaN(number) || math.IsInf(number, 0) || number < 1 || number > 3600 {
				return nil, errors.New("template numeric input is invalid")
			}
		default:
			return nil, errors.New("unknown template input type")
		}
		parent, key, err := studioTemplateInputTarget(document, field.Path)
		if err != nil {
			return nil, err
		}
		if !reflect.DeepEqual(parent[key], value) {
			changedPaths = append(changedPaths, field.Path)
		}
		parent[key] = value
	}
	for _, binding := range definition.Bindings {
		parent, key, err := studioTemplateInputTarget(document, binding.Path)
		if err != nil {
			return nil, err
		}
		value, err := studioTemplateRenderPattern(binding.Pattern, input.Inputs)
		if err != nil {
			return nil, err
		}
		if len([]rune(value)) > studioTemplateTargetLimit(binding.Path) {
			return nil, errors.New("rendered template field exceeds its limit")
		}
		if parent[key] != value {
			changedPaths = append(changedPaths, binding.Path)
		}
		parent[key] = value
	}
	remap := map[string]string{}
	for _, slot := range definition.Slots {
		replacement := input.Media[slot.ID]
		if replacement == "" && input.ReuseOriginalMedia {
			replacement = slot.MediaID
		}
		if replacement == "" || !StudioIDPattern.MatchString(replacement) {
			return nil, errors.New("replace every media slot or explicitly reuse your original media")
		}
		media, err := GetStudioMedia(actorID, replacement)
		if err != nil || !strings.HasPrefix(media.MimeType, slot.Kind+"/") {
			return nil, errors.New("replacement media is unavailable or has the wrong type")
		}
		remap[slot.MediaID] = replacement
	}
	for slotID := range input.Media {
		if _, ok := remap[slotID]; !ok {
			return nil, errors.New("unknown template media slot")
		}
	}
	replacedNodes := map[string]bool{}
	replacedAssets := map[string]bool{}
	for _, node := range studioObjects(document, "nodes") {
		data, _ := node["data"].(map[string]any)
		old, _ := data["mediaId"].(string)
		if replacement := remap[old]; replacement != "" && replacement != old {
			replacedNodes[fmt.Sprint(node["id"])] = true
		}
	}
	for _, asset := range studioObjects(document, "assets") {
		for _, key := range []string{"mediaId", "modelMediaId"} {
			old, _ := asset[key].(string)
			if replacement := remap[old]; replacement != "" && replacement != old {
				replacedAssets[fmt.Sprint(asset["id"])] = true
			}
		}
	}
	studioTemplateReplaceMedia(document, remap)
	studioTemplateInvalidateChanged(document, changedPaths, replacedNodes, replacedAssets)
	document["id"], document["title"], document["createdAt"], document["updatedAt"] = input.ProjectID, input.Title, time.Now().UTC().Format(time.RFC3339), time.Now().UTC().Format(time.RFC3339)
	production, _ := document["production"].(map[string]any)
	if production == nil {
		production = map[string]any{}
		document["production"] = production
	}
	hash, _ := common.Marshal(map[string]any{"inputs": input.Inputs, "media": remap})
	sum := sha256.Sum256(hash)
	production["documentVersion"] = 2
	production["templateOrigin"] = map[string]any{"id": id, "version": definition.Version, "inputHash": hex.EncodeToString(sum[:])}
	raw, err := common.Marshal(document)
	if err != nil {
		return nil, err
	}
	title, err := ValidateStudioDocument(input.ProjectID, raw)
	if err != nil {
		return nil, err
	}
	// Validate existence before adding links: a guessed existing project ID must
	// never gain new links or be modified by template instantiation.
	var count int64
	if err := model.DB.Unscoped().Model(&model.StudioProject{}).Where("id = ?", input.ProjectID).Count(&count).Error; err != nil {
		return nil, err
	}
	if count != 0 {
		return nil, model.ErrStudioRevision
	}
	for mediaID := range StudioMediaReferences(document) {
		if _, err := GetStudioMedia(actorID, mediaID); err != nil {
			return nil, model.ErrStudioAccess
		}
	}
	project := &model.StudioProject{ID: input.ProjectID, OwnerID: actorID, Title: title, Revision: 1, Document: model.StudioDocument(raw)}
	err = model.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(project).Error; err != nil {
			return model.ErrStudioRevision
		}
		if err := tx.Create(&model.StudioProjectVersion{ProjectID: project.ID, Revision: 1, AuthorID: actorID, Document: project.Document}).Error; err != nil {
			return err
		}
		for mediaID := range StudioMediaReferences(document) {
			if err := tx.Create(&model.StudioProjectMediaLink{ProjectID: project.ID, MediaID: mediaID}).Error; err != nil {
				return err
			}
		}
		return nil
	})
	return project, err
}

// Match the editor's unpinned-edge invalidation boundary. Only changed creative
// nodes and their live dependents lose active output; historical/pinned sources
// and unrelated branches remain available for an explicit user choice.
func studioTemplateInvalidateChanged(document map[string]any, paths []string, replacedNodes, replacedAssets map[string]bool) {
	nodes, assets, shots := studioObjects(document, "nodes"), studioObjects(document, "assets"), studioObjects(document, "shots")
	production, _ := document["production"].(map[string]any)
	changed, direct, changedAssets := map[string]bool{}, map[string]bool{}, map[string]bool{}
	mark := func(id any) {
		if value, ok := id.(string); ok && value != "" {
			changed[value], direct[value] = true, true
		}
	}
	markShot := func(shot map[string]any) {
		for _, key := range []string{"textNodeId", "imageNodeId", "videoNodeId"} {
			mark(shot[key])
		}
	}
	for _, path := range paths {
		parts := strings.Split(strings.TrimPrefix(path, "/"), "/")
		index := -1
		if len(parts) > 1 {
			index, _ = strconv.Atoi(parts[1])
		}
		switch parts[0] {
		case "nodes":
			if index >= 0 && index < len(nodes) && parts[len(parts)-1] != "title" {
				mark(nodes[index]["id"])
			}
		case "assets":
			if index >= 0 && index < len(assets) && parts[len(parts)-1] != "title" {
				asset := assets[index]
				changedAssets[fmt.Sprint(asset["id"])] = true
				if !replacedAssets[fmt.Sprint(asset["id"])] {
					delete(asset, "mediaId")
					delete(asset, "modelMediaId")
					delete(asset, "outputUrl")
				}
			}
		case "shots":
			if index >= 0 && index < len(shots) && parts[len(parts)-1] != "title" {
				markShot(shots[index])
			}
		case "production":
			if len(parts) == 4 && parts[1] == "shotNarrative" {
				for _, shot := range shots {
					if shot["id"] == parts[2] {
						markShot(shot)
					}
				}
			}
			if len(parts) == 4 && (parts[1] == "scenes" || parts[1] == "props") {
				itemIndex, err := strconv.Atoi(parts[2])
				items := studioObjects(production, parts[1])
				if err != nil || itemIndex < 0 || itemIndex >= len(items) {
					continue
				}
				item := items[itemIndex]
				for _, shot := range shots {
					selected := false
					if parts[1] == "scenes" {
						for _, id := range studioSlice(item["shotIds"]) {
							if id == shot["id"] {
								selected = true
							}
						}
					}
					if parts[1] == "props" {
						bindings, _ := production["assetBindings"].(map[string]any)
						for _, id := range studioSlice(bindings[fmt.Sprint(shot["id"])]) {
							if id == item["id"] {
								selected = true
							}
						}
					}
					if selected {
						if parts[1] == "props" {
							markShot(shot)
							continue
						}
						for _, node := range nodes {
							if node["id"] != shot["textNodeId"] && node["id"] != shot["imageNodeId"] && node["id"] != shot["videoNodeId"] {
								continue
							}
							_, pins := studioTemplateNodeAssets(document, node)
							if pins[fmt.Sprint(item["id"])] == nil {
								mark(node["id"])
							}
						}
					}
				}
			}
		}
	}
	for _, node := range nodes {
		selected, pins := studioTemplateNodeAssets(document, node)
		for _, assetID := range selected {
			id, ok := assetID.(string)
			if ok && changedAssets[id] && pins[id] == nil {
				mark(node["id"])
			}
		}
	}
	// A replaced upload is a new explicit source, not a relabelled old Take.
	for _, node := range nodes {
		id := fmt.Sprint(node["id"])
		if !replacedNodes[id] {
			continue
		}
		data, _ := node["data"].(map[string]any)
		delete(data, "selectedTakeId")
		data["sourceMode"], data["status"] = "upload", "completed"
	}
	pending := []string{}
	for id := range changed {
		pending = append(pending, id)
	}
	for id := range replacedNodes {
		pending = append(pending, id)
	}
	visited := map[string]bool{}
	for len(pending) > 0 {
		source := pending[0]
		pending = pending[1:]
		if visited[source] {
			continue
		}
		visited[source] = true
		for _, edge := range studioObjects(document, "edges") {
			pin, _ := edge["data"].(map[string]any)
			target, _ := edge["target"].(string)
			if edge["source"] == source && pin["sourceTakeId"] == nil && !visited[target] {
				changed[target] = true
				pending = append(pending, target)
			}
		}
	}
	for _, node := range nodes {
		id := fmt.Sprint(node["id"])
		if !changed[id] {
			continue
		}
		data, _ := node["data"].(map[string]any)
		if !direct[id] && (data["kind"] == "image" || data["kind"] == "audio" || data["sourceMode"] == "upload") && data["purpose"] != "assembly" && (data["model"] == nil || data["model"] == "") {
			continue
		}
		data["status"] = "idle"
		if title, ok := data["title"].(string); ok {
			data["staleSourceTitle"] = title
		}
		for _, key := range []string{"mediaId", "outputUrl", "outputText", "outputImagePrompt", "outputVideoPrompt", "taskId", "selectedTakeId", "progress", "error"} {
			delete(data, key)
		}
		if approved, ok := production["approvedKeyImages"].(map[string]any); ok {
			delete(approved, id)
		}
		for _, shot := range shots {
			if shot["textNodeId"] == id || shot["imageNodeId"] == id || shot["videoNodeId"] == id {
				shot["reviewStatus"] = "unreviewed"
			}
		}
	}
}

func studioSlice(value any) []any { result, _ := value.([]any); return result }

func studioTemplateNodeAssets(document, node map[string]any) ([]any, map[string]any) {
	data, _ := node["data"].(map[string]any)
	pins := map[string]any{}
	for id, version := range studioMap(data["assetVersionIds"]) {
		pins[id] = version
	}
	selected := append([]any{data["linkedAssetId"]}, studioSlice(data["assetIds"])...)
	production, _ := document["production"].(map[string]any)
	for _, shot := range studioObjects(document, "shots") {
		if node["id"] != shot["textNodeId"] && node["id"] != shot["imageNodeId"] && node["id"] != shot["videoNodeId"] {
			continue
		}
		for _, state := range studioObjects(production, "continuityStates") {
			if state["shotId"] != shot["id"] {
				continue
			}
			selected = append(selected, state["assetId"])
			if version, ok := state["versionId"].(string); ok && version != "" {
				pins[fmt.Sprint(state["assetId"])] = version
			}
		}
	}
	return selected, pins
}

func studioMap(value any) map[string]any { result, _ := value.(map[string]any); return result }

func studioTemplateReplaceMedia(value any, replacements map[string]string) {
	switch item := value.(type) {
	case map[string]any:
		for key, child := range item {
			// Historical Takes and asset versions are immutable sources. Pinned
			// edges continue to resolve those originals, even with a replacement.
			if key == "takes" || key == "versions" || key == "history" || key == "requestSnapshot" || key == "derivedFrom" {
				continue
			}
			if key == "mediaId" || strings.HasSuffix(key, "MediaId") {
				if id, ok := child.(string); ok {
					if replacement, ok := replacements[id]; ok {
						item[key] = replacement
					}
				}
			}
			if key == "mediaIds" || key == "referenceMediaIds" || key == "musicMediaIds" {
				if ids, ok := child.([]any); ok {
					for index, value := range ids {
						if id, ok := value.(string); ok {
							if replacement, ok := replacements[id]; ok {
								ids[index] = replacement
							}
						}
					}
				}
			}
			if key == "approvedKeyImages" {
				if images, ok := child.(map[string]any); ok {
					for node, value := range images {
						if id, ok := value.(string); ok {
							if replacement, ok := replacements[id]; ok {
								images[node] = replacement
							}
						}
					}
				}
			}
			studioTemplateReplaceMedia(child, replacements)
		}
	case []any:
		for _, child := range item {
			studioTemplateReplaceMedia(child, replacements)
		}
	}
}
