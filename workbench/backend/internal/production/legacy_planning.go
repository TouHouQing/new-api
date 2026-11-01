// SPDX-License-Identifier: AGPL-3.0-or-later
package production

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"html"
	"strings"
	"unicode/utf8"

	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

// A converter upgrade creates a separate recovered chapter. It never rewrites
// the existing shots, current brief, human revisions or immutable import receipt.
func projectLegacyPlanning(rows *repository.ProductionImportRows, document map[string]any, resources map[string]model.Resource, identities map[string]map[string]string) ([]string, error) {
	production := objectValue(document["production"])
	initial := rows.Unit.ID != ""
	brief, err := legacyCreativeBrief(production)
	if err != nil {
		return nil, err
	}
	briefJSON := ""
	if brief != nil {
		raw, err := json.Marshal(brief)
		if err != nil {
			return nil, err
		}
		briefJSON = string(raw)
		if initial {
			rows.Project.CreativeBriefJSON = briefJSON
		}
	}
	description := stringValue(production, "brief")
	if initial && description != "" {
		rows.Project.Description = description
	}
	unit := rows.Unit
	shots, revisions, references, artifacts := rows.Shots, rows.ShotRevisions, rows.ShotReferences, rows.ShotArtifacts
	rootVersions := []model.AssetVersion{}
	rootRepresentations := []model.AssetRepresentation{}
	if !initial {
		rootVersions, rootRepresentations, err = ensureLegacyPlanningRoots(rows.Project, rows.Receipt.ID, document, resources, identities, rows.Receipt.CreatedAt)
		if err != nil {
			return nil, err
		}
	}
	contexts, err := resolveLegacyReferenceContexts(document, identities, resources, rows.Receipt.ID, rows.Receipt.CreatedAt)
	if err != nil {
		return nil, err
	}
	rootVersions = append(rootVersions, contexts.Versions...)
	rootRepresentations = append(rootRepresentations, contexts.Representations...)
	if !initial {
		unit = model.ProjectUnit{ID: legacyNativeID("legacy-planning-v8-unit", rows.Receipt.ID), ProjectID: rows.Project.ID, Kind: model.ProjectUnitKindChapter, Title: "原工程制作方案", Status: model.ProjectUnitStatusDraft, CreatedAt: rows.Receipt.CreatedAt, UpdatedAt: rows.Receipt.CreatedAt}
		texts := []string{}
		if description != "" {
			texts = append(texts, description)
		}
		if screenplay := stringValue(objectValue(production["screenplay"]), "source"); screenplay != "" {
			texts = append(texts, screenplay)
		}
		if len(texts) == 0 {
			for _, value := range listValue(document["nodes"]) {
				data := objectValue(objectValue(value)["data"])
				if stringValue(data, "kind") != "text" {
					continue
				}
				text := stringValue(data, "outputText")
				for _, value := range listValue(data["takes"]) {
					take := objectValue(value)
					if stringValue(take, "id") == stringValue(data, "selectedTakeId") {
						text = stringValue(take, "outputText")
						break
					}
				}
				if text == "" {
					text = stringValue(data, "prompt")
				}
				if text != "" {
					texts = append(texts, text)
				}
			}
		}
		for _, text := range texts {
			unit.SourceText += "<p>" + strings.ReplaceAll(html.EscapeString(text), "\n", "</p><p>") + "</p>"
		}
		unit.WordCount = utf8.RuneCountInString(strings.Join(texts, "\n"))
		projector := &legacyProjection{rows: repository.ProductionImportRows{Project: rows.Project}, identities: identities, nodes: map[string]map[string]any{}, resources: resources, now: rows.Receipt.CreatedAt}
		projector.referenceContexts = contexts.Nodes
		sequence := 0
		projector.newID = func() string {
			sequence++
			return legacyNativeID("legacy-planning-v8", rows.Receipt.ID, fmt.Sprint(sequence))
		}
		// Clone the map before assigning recovered shot identities.
		projector.identities = map[string]map[string]string{}
		for kind, values := range identities {
			projector.identities[kind] = map[string]string{}
			for key, value := range values {
				projector.identities[kind][key] = value
			}
		}
		for _, value := range listValue(document["nodes"]) {
			node := objectValue(value)
			projector.nodes[stringValue(node, "id")] = objectValue(node["data"])
		}
		for index, value := range listValue(document["shots"]) {
			projector.addShot(objectValue(value), rows.Project.ID, unit.ID, index)
		}
		if projector.err != nil {
			return nil, projector.err
		}
		shots, revisions, references, artifacts = projector.rows.Shots, projector.rows.ShotRevisions, projector.rows.ShotReferences, projector.rows.ShotArtifacts
	}
	if len(shots) > 200 {
		return nil, fmt.Errorf("%w: recovered chapter exceeds200 shots", ErrLegacyBundle)
	}
	if len(shots) != len(listValue(document["shots"])) || len(revisions) != len(shots) {
		return nil, fmt.Errorf("%w: planning identity mismatch", ErrLegacyBundle)
	}
	narratives := objectValue(production["shotNarrative"])
	statesByShot := map[string][]model.ShotReferenceState{}
	for _, value := range listValue(production["continuityStates"]) {
		state := objectValue(value)
		shotID := stringValue(state, "shotId")
		assetID := stringValue(state, "assetId")
		versionID := stringValue(state, "versionId")
		targets, err := legacyStateReferenceTargets(document, contexts, identities, shotID, assetID, versionID)
		if err != nil {
			return nil, err
		}
		for _, target := range targets {
			converted := model.ShotReferenceState{AssetVersionID: target.VersionID, Stage: target.Stage, Wardrobe: stringValue(state, "wardrobe"), Emotion: stringValue(state, "emotion"), PropState: stringValue(state, "propState"), Note: stringValue(state, "note"), ReferenceResourceIDs: []string{}}
			for _, value := range listValue(state["referenceMediaIds"]) {
				id, ok := value.(string)
				resource, exists := resources[id]
				if !ok || !exists || !strings.HasPrefix(resource.MimeType, "image/") {
					return nil, fmt.Errorf("%w: state image missing", ErrLegacyBundle)
				}
				converted.ReferenceResourceIDs = append(converted.ReferenceResourceIDs, id)
			}
			if len(converted.ReferenceResourceIDs) == 0 && target.ResourceID != "" {
				resource, exists := resources[target.ResourceID]
				if !exists || !strings.HasPrefix(resource.MimeType, "image/") {
					return nil, ErrLegacyBundle
				}
				converted.ReferenceResourceIDs = append(converted.ReferenceResourceIDs, target.ResourceID)
			}
			statesByShot[shotID] = append(statesByShot[shotID], converted)
		}
	}
	seenLegacyShots := map[string]bool{}
	for index, value := range listValue(document["shots"]) {
		source := objectValue(value)
		oldID := stringValue(source, "id")
		seenLegacyShots[oldID] = true
		if raw, ok := narratives[oldID]; ok {
			encoded, err := json.Marshal(raw)
			if err != nil {
				return nil, err
			}
			var narrative model.ShotNarrative
			if json.Unmarshal(encoded, &narrative) != nil || ValidateShotNarrative(narrative) != nil {
				return nil, fmt.Errorf("%w: invalid shot intention", ErrLegacyBundle)
			}
			revisions[index].NarrativeJSON = string(encoded)
		}
		states := statesByShot[oldID]
		if len(states) > 0 {
			if err := ValidateShotReferenceStates(states); err != nil {
				return nil, fmt.Errorf("%w: %v", ErrLegacyBundle, err)
			}
			raw, _ := json.Marshal(states)
			revisions[index].ReferenceStatesJSON = string(raw)
			for _, state := range states {
				found := false
				for _, ref := range references {
					if ref.ShotID == shots[index].ID && ref.AssetVersionID == state.AssetVersionID {
						found = true
						break
					}
				}
				if !found {
					references = append(references, model.ShotAssetReference{ID: legacyNativeID("legacy-state-reference-v8", rows.Receipt.ID, shots[index].ID, state.AssetVersionID), ShotID: shots[index].ID, AssetVersionID: state.AssetVersionID, Role: "reference", Status: "ready", CreatedAt: rows.Receipt.CreatedAt})
				}
			}
		}
	}
	for id := range narratives {
		if !seenLegacyShots[id] {
			return nil, fmt.Errorf("%w: intention refers to missing shot", ErrLegacyBundle)
		}
	}
	for id := range statesByShot {
		if !seenLegacyShots[id] {
			return nil, fmt.Errorf("%w: state refers to missing shot", ErrLegacyBundle)
		}
	}
	fields := []string{}
	if brief != nil {
		fields = append(fields, "project-creative-brief")
	}
	if description != "" {
		fields = append(fields, "project-description")
	}
	if len(narratives) > 0 {
		fields = append(fields, "shot-narrative")
	}
	if len(statesByShot) > 0 {
		fields = append(fields, "fixed-shot-reference-states")
	}
	if len(shots) == 0 && brief == nil && description == "" {
		return fields, nil
	}
	snapshot := model.ShotPlanSnapshot{Version: 1, ProjectID: rows.Project.ID, UnitID: unit.ID, SourceTextAtArchive: unit.SourceText, ProjectBriefJSON: briefJSON, ProjectDescription: description, Entries: []model.ShotPlanEntry{}, References: references, Selections: []model.ShotPlanSelection{}}
	for _, shot := range shots {
		snapshot.Entries = append(snapshot.Entries, model.ShotPlanEntry{ShotID: shot.ID, RevisionID: shot.CurrentRevisionID, Title: shot.Title, Position: shot.Position, DurationMs: shot.DurationMs, Status: shot.Status, VideoSource: shot.VideoSource})
	}
	for _, artifact := range artifacts {
		if artifact.Selected {
			snapshot.Selections = append(snapshot.Selections, model.ShotPlanSelection{ShotID: artifact.ShotID, ArtifactID: artifact.ID, ResourceID: artifact.ResourceID, RevisionID: artifact.RevisionID, Status: artifact.Status})
		}
	}
	if snapshot.References == nil {
		snapshot.References = []model.ShotAssetReference{}
	}
	raw, err := json.Marshal(snapshot)
	if err != nil {
		return nil, err
	}
	if len(raw) > 4<<20 {
		return nil, fmt.Errorf("%w: recovered plan exceeds4MiB", ErrLegacyBundle)
	}
	digest := fmt.Sprintf("%x", sha256.Sum256(raw))
	record := model.ProjectShotPlanRecord{ID: legacyNativeID("legacy-planning-v8-archive", rows.Receipt.ID, unit.ID), UserID: rows.Project.UserID, ProjectID: rows.Project.ID, UnitID: unit.ID, Kind: "archive", Title: "原工程制作方案", PayloadJSON: string(raw), PayloadSHA256: digest, ShotCount: len(shots), CreatedAt: rows.Receipt.CreatedAt}
	rows.Planning = &repository.LegacyPlanningRows{Record: record}
	if initial {
		rows.ShotRevisions = revisions
		rows.ShotReferences = references
	} else {
		rows.Planning.Unit = &unit
		rows.Planning.Shots = shots
		rows.Planning.Revisions = revisions
		rows.Planning.References = references
		rows.Planning.Artifacts = artifacts
		rows.Planning.Versions = rootVersions
		rows.Planning.Representations = rootRepresentations
	}
	return fields, nil
}

func legacyCreativeBrief(production map[string]any) (*model.ProjectCreativeBrief, error) {
	creative := objectValue(production["creativeBrief"])
	guide := objectValue(production["guide"])
	if !legacyVersionFieldHasContent(creative) && !legacyVersionFieldHasContent(guide) && !legacyVersionFieldHasContent(production["targetDuration"]) {
		return nil, nil
	}
	goal := stringValue(guide, "goal")
	if goal == "" {
		goal = stringValue(creative, "recipeId")
		if goal == "store" {
			goal = "product"
		}
	}
	switch goal {
	case "story", "product", "explain", "presenter", "music":
	default:
		goal = "custom"
	}
	message := []string{}
	for _, part := range []struct{ key, label string }{{"subject", "主题"}, {"benefit", "观众收益"}, {"callToAction", "行动引导"}} {
		if value := stringValue(creative, part.key); value != "" {
			message = append(message, part.label+"："+value)
		}
	}
	brief := &model.ProjectCreativeBrief{Version: 1, Goal: goal, Audience: stringValue(creative, "audience"), KeyMessage: strings.Join(message, "\n"), TargetDurationMs: secondsToMS(production["targetDuration"]), Constraints: []string{}}
	if raw, ok := production["targetDuration"]; ok && numberValue(raw) > 0 && brief.TargetDurationMs == 0 {
		return nil, fmt.Errorf("%w: invalid target duration", ErrLegacyBundle)
	}
	if err := ValidateCreativeBrief(*brief); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrLegacyBundle, err)
	}
	return brief, nil
}
