// SPDX-License-Identifier: AGPL-3.0-or-later
// Studio contracts: Copyright (C) 2023-2026 QuantumNous.
package production

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"yingce/backend/internal/canvas"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

type LegacyProjectionReport struct {
	Nodes              int                 `json:"nodes"`
	Takes              int                 `json:"takes"`
	Shots              int                 `json:"shots"`
	Assets             int                 `json:"assets"`
	Resources          int                 `json:"resources"`
	Transcripts        int                 `json:"transcripts"`
	TranscriptVersions int                 `json:"transcriptVersions"`
	MediaAnalyses      int                 `json:"mediaAnalyses"`
	AnalysisVersions   int                 `json:"analysisVersions"`
	PlanningRecordID   string              `json:"planningRecordId,omitempty"`
	RecoveredUnitID    string              `json:"recoveredUnitId,omitempty"`
	PlanningShots      int                 `json:"planningShots,omitempty"`
	PlanningReused     bool                `json:"planningReused,omitempty"`
	AudioLinks         int                 `json:"audioLinks,omitempty"`
	Previs             *LegacyPrevisReport `json:"previs,omitempty"`
	TimelineClips      int                 `json:"timelineClips"`
	NativeFields       []string            `json:"nativeFields"`
	PreservedOnly      []string            `json:"preservedOnly"`
	Warnings           []string            `json:"warnings"`
}

type legacyProjection struct {
	rows              repository.ProductionImportRows
	report            LegacyProjectionReport
	identities        map[string]map[string]string
	nodes             map[string]map[string]any
	referenceContexts map[string][]legacyFixedReference
	resources         map[string]model.Resource
	newID             func() string
	now               time.Time
	err               error
}

// ProjectLegacyDocument maps media and candidate history to native Yingce
// assets/versions/artifacts. Historical tasks stay metadata; no task is queued.
func ProjectLegacyDocument(document map[string]any, inspection LegacyBundleInspection, resources map[string]model.Resource, userID, name string, now time.Time, newID func() string, options ...LegacyProjectionData) (*repository.ProductionImportRows, LegacyProjectionReport, error) {
	if userID == "" || newID == nil {
		return nil, LegacyProjectionReport{}, ErrLegacyBundle
	}
	p := &legacyProjection{newID: newID, now: now, nodes: map[string]map[string]any{}, identities: map[string]map[string]string{"nodes": {}, "takes": {}, "shots": {}, "assets": {}, "assetVersions": {}, "assetRoots": {}}, report: LegacyProjectionReport{PreservedOnly: []string{}, Warnings: []string{}, Resources: len(resources)}}
	p.resources = resources
	pid, cid, uid := newID(), newID(), newID()
	ratio := stringValue(objectValue(document["defaults"]), "ratio")
	if ratio != "16:9" && ratio != "9:16" && ratio != "1:1" && ratio != "4:3" && ratio != "3:4" {
		ratio = "16:9"
	}
	p.rows.Project = model.Project{ID: pid, UserID: userID, Name: name, Type: "short-drama", AspectRatio: ratio, SourceType: "studio-import", Status: model.ProjectStatusActive, Revision: 1, CreatedAt: now, UpdatedAt: now}
	p.rows.Unit = model.ProjectUnit{ID: uid, ProjectID: pid, Kind: model.ProjectUnitKindEpisode, Title: "导入的分镜", Status: model.ProjectUnitStatusDraft, CreatedAt: now, UpdatedAt: now}
	p.rows.Canvas = model.CanvasProject{ID: cid, UserID: userID, ProjectID: pid, Title: name, Revision: 1, CreatedAt: now, UpdatedAt: now}
	p.rows.CanvasLink = model.CanvasUnitLink{ID: newID(), ProjectID: pid, CanvasID: cid, UnitID: uid, Role: "storyboard", CreatedAt: now}
	canvasNodes := []any{}
	for index, value := range listValue(document["nodes"]) {
		node := objectValue(value)
		data := objectValue(node["data"])
		oldID := stringValue(node, "id")
		kind := stringValue(data, "kind")
		if oldID == "" || (kind != "text" && kind != "image" && kind != "video" && kind != "audio") {
			return nil, p.report, fmt.Errorf("%w: unsupported node at %d", ErrLegacyBundle, index)
		}
		nid := newID()
		p.identities["nodes"][oldID] = nid
		p.nodes[oldID] = data
		assetID, selectedVersion := p.addNodeAsset(oldID, data, userID, pid, index)
		metadata := map[string]any{"prompt": data["prompt"], "model": data["model"], "assetId": assetID, "assetVersionId": selectedVersion, "legacyNodeId": oldID, "status": "idle"}
		resourceID := stringValue(data, "mediaId")
		if selected := p.selectedTake(data); selected != nil {
			resourceID = stringValue(selected, "mediaId")
			if kind == "text" {
				metadata["content"] = selected["outputText"]
			}
		}
		if kind == "text" && metadata["content"] == nil {
			metadata["content"] = data["outputText"]
		}
		if r, ok := resources[resourceID]; ok {
			metadata["storageKey"] = "resource:" + r.ID
			metadata["content"] = "/api/resources/" + r.ID + "/file"
			metadata["status"] = "success"
			metadata["mimeType"] = r.MimeType
			metadata["bytes"] = r.Size
			metadata["durationMs"] = r.DurationMs
		}
		if kind == "text" && metadata["content"] == nil {
			metadata["content"] = data["prompt"]
		}
		if kind == "text" {
			if text, ok := metadata["content"].(string); ok && strings.TrimSpace(text) != "" {
				if p.rows.Unit.SourceText != "" {
					p.rows.Unit.SourceText += "\n\n"
				}
				p.rows.Unit.SourceText += text
			}
		}
		position := objectValue(node["position"])
		canvasNodes = append(canvasNodes, map[string]any{"id": nid, "type": kind, "title": stringValue(data, "title"), "position": map[string]any{"x": numberValue(position["x"]), "y": numberValue(position["y"])}, "width": positiveNumber(node["width"], 360), "height": positiveNumber(node["height"], 240), "createdAt": now.Format(time.RFC3339Nano), "updatedAt": now.Format(time.RFC3339Nano), "metadata": metadata})
	}
	for index, value := range listValue(document["assets"]) {
		p.addDefinitionAsset(objectValue(value), userID, pid, index+len(canvasNodes))
	}
	contexts, err := resolveLegacyReferenceContexts(document, p.identities, resources, pid, now)
	if err != nil {
		return nil, p.report, err
	}
	p.referenceContexts = contexts.Nodes
	for _, version := range contexts.Versions {
		for _, existing := range p.rows.Versions {
			if existing.AssetID == version.AssetID && existing.Version >= version.Version {
				version.Version = existing.Version + 1
			}
		}
		p.rows.Versions = append(p.rows.Versions, version)
	}
	p.rows.Representations = append(p.rows.Representations, contexts.Representations...)
	clips := []any{}
	var cursor int64
	for index, value := range listValue(document["shots"]) {
		shot := objectValue(value)
		sid := p.addShot(shot, pid, uid, index)
		video := p.nodes[stringValue(shot, "videoNodeId")]
		take := p.selectedTake(video)
		resourceID := stringValue(video, "mediaId")
		if take != nil {
			resourceID = stringValue(take, "mediaId")
		}
		if r, ok := resources[resourceID]; ok {
			start := secondsToMS(shot["trimStart"])
			end := secondsToMS(shot["trimEnd"])
			if end <= start {
				end = r.DurationMs
			}
			if end <= start {
				end = secondsToMS(video["seconds"])
			}
			if end > start {
				clip := map[string]any{"id": newID(), "kind": "video", "nodeId": p.identities["nodes"][stringValue(shot, "videoNodeId")], "trackId": "import-video", "startMs": cursor, "durationMs": end - start, "sourceStartMs": start, "sourceDurationMs": r.DurationMs, "title": stringValue(shot, "title"), "volume": positiveNumber(shot["volume"], 1), "directMedia": map[string]any{"id": r.ID, "kind": "video", "title": stringValue(shot, "title"), "storageKey": "resource:" + r.ID, "url": "/api/resources/" + r.ID + "/file", "durationMs": r.DurationMs, "mimeType": r.MimeType}, "productionBinding": map[string]any{"shotId": sid, "assetVersionId": p.identities["takes"][stringValue(shot, "videoNodeId")+"/"+stringValue(take, "id")]}}
				if value, exists := shot["volume"]; exists {
					volume := numberValue(value)
					if volume >= 0 && volume <= 8 {
						clip["volume"] = volume
					}
				}
				if shot["muted"] == true {
					clip["volume"] = 0
				}
				clips = append(clips, clip)
				cursor += end - start
			} else {
				p.report.Warnings = append(p.report.Warnings, "镜头“"+stringValue(shot, "title")+"”没有可信时长，请在时间线确认后使用")
			}
		}
	}
	connections := []any{}
	for _, value := range listValue(document["edges"]) {
		edge := objectValue(value)
		from, to := p.identities["nodes"][stringValue(edge, "source")], p.identities["nodes"][stringValue(edge, "target")]
		if from == "" || to == "" {
			return nil, p.report, fmt.Errorf("%w: dangling canvas edge", ErrLegacyBundle)
		}
		connections = append(connections, map[string]any{"id": newID(), "fromNodeId": from, "toNodeId": to})
	}
	for _, key := range []string{"production", "canvas", "captionsText", "soundtrackMediaId", "voiceoverMediaId", "assembledMediaId"} {
		if value, ok := document[key]; ok && value != nil && value != "" {
			p.report.PreservedOnly = append(p.report.PreservedOnly, key)
		}
	}
	for _, value := range listValue(document["shots"]) {
		shot := objectValue(value)
		for _, key := range []string{"transition", "reviewStatus", "reviewNote", "shotCaptionText", "shotVoiceoverMediaId"} {
			if _, ok := shot[key]; ok {
				p.report.PreservedOnly = appendUnique(p.report.PreservedOnly, "shots."+key)
			}
		}
	}
	canvas := map[string]any{"id": cid, "projectId": pid, "title": name, "createdAt": now.Format(time.RFC3339Nano), "updatedAt": now.Format(time.RFC3339Nano), "nodes": canvasNodes, "connections": connections, "chatSessions": []any{}, "activeChatId": nil, "backgroundMode": "dots", "showImageInfo": true, "viewport": map[string]any{"x": 0, "y": 0, "k": 1}, "previsScenes": []any{}, "timeline": map[string]any{"version": 2, "tracks": []any{map[string]any{"id": "import-video", "kind": "video", "label": "导入的镜头", "order": 0}}, "clips": clips, "durationMs": cursor}}
	p.rows.Canvas.PayloadJSON = p.json(canvas)
	timeline := canvas["timeline"]
	p.rows.Timeline = &model.ProjectTimeline{ProjectID: pid, UserID: userID, Revision: 1, PayloadJSON: p.json(timeline), CreatedAt: now, UpdatedAt: now}
	delete(canvas, "timeline")
	p.rows.Canvas.PayloadJSON = p.json(canvas)
	refs := []any{}
	for _, r := range resources {
		refs = append(refs, map[string]any{"resourceId": r.ID})
	}
	p.report.Nodes = len(canvasNodes)
	p.rows.Unit.WordCount = len([]rune(p.rows.Unit.SourceText))
	p.report.Shots = len(p.rows.Shots)
	p.report.Assets = len(p.rows.Assets)
	p.rows.Receipt = model.ProductionImport{ID: newID(), UserID: userID, SourceFingerprint: inspection.SourceFingerprint, SourceProjectID: inspection.SourceProjectID, ProjectID: pid, CanvasID: cid, ContractVersion: 2, SourceDocumentJSON: p.json(document), ResourceRefsJSON: p.json(refs), ReportJSON: p.json(p.report), IdentityMapJSON: p.json(p.identities), CreatedAt: now}
	if p.err == nil {
		data := LegacyProjectionData{}
		if len(options) > 1 {
			return nil, p.report, ErrLegacyBundle
		}
		if len(options) == 1 {
			data = options[0]
		}
		p.rows.Receipt.ContractVersion = LegacyNativeProjectionVersion
		var err error
		p.report, err = EnrichLegacyImport(&p.rows, p.report, document, resources, p.identities, data, now)
		if err != nil {
			return nil, p.report, err
		}
		p.rows.Receipt.ReportJSON = p.json(p.report)
		p.rows.Receipt.IdentityMapJSON = p.json(p.identities)
	}
	return &p.rows, p.report, p.err
}

func (p *legacyProjection) addNodeAsset(oldID string, data map[string]any, userID, pid string, position int) (string, string) {
	aid := p.newID()
	takes := listValue(data["takes"])
	selected := ""
	selectedResource := stringValue(data, "mediaId")
	selectedText := stringValue(data, "outputText")
	for index, value := range takes {
		take := objectValue(value)
		vid := p.newID()
		tid := stringValue(take, "id")
		p.identities["takes"][oldID+"/"+tid] = vid
		if tid == stringValue(data, "selectedTakeId") {
			selected = vid
			selectedResource = stringValue(take, "mediaId")
			selectedText = stringValue(take, "outputText")
		}
		definition := map[string]any{"legacyTake": take, "resourceId": take["mediaId"], "sourceNodeId": oldID}
		p.rows.Versions = append(p.rows.Versions, model.AssetVersion{ID: vid, AssetID: aid, Version: index + 1, Status: model.AssetVersionStatusDraft, DefinitionJSON: p.json(definition), Prompt: stringValue(take, "prompt"), CreatedAt: p.now, UpdatedAt: p.now})
		if rid := stringValue(take, "mediaId"); rid != "" {
			p.rows.Representations = append(p.rows.Representations, model.AssetRepresentation{ID: p.newID(), AssetVersionID: vid, ResourceID: rid, MediaType: stringValue(data, "kind"), Role: "primary", MetadataJSON: p.json(map[string]any{"legacyTakeId": tid}), CreatedAt: p.now})
		}
		p.report.Takes++
	}
	if selected == "" {
		if stringValue(data, "selectedTakeId") != "" {
			p.err = fmt.Errorf("%w: selected Take missing", ErrLegacyBundle)
		}
		selected = p.newID()
		if p.identities["nodeSources"] == nil {
			p.identities["nodeSources"] = map[string]string{}
		}
		p.identities["nodeSources"][oldID] = selected
		definition := map[string]any{"sourceNodeId": oldID, "resourceId": data["mediaId"], "legacyNodeSource": map[string]any{"kind": data["kind"], "title": data["title"], "prompt": data["prompt"], "outputText": data["outputText"], "mediaId": data["mediaId"]}}
		p.rows.Versions = append(p.rows.Versions, model.AssetVersion{ID: selected, AssetID: aid, Version: len(takes) + 1, Status: model.AssetVersionStatusDraft, DefinitionJSON: p.json(definition), Prompt: stringValue(data, "prompt"), CreatedAt: p.now, UpdatedAt: p.now})
		if selectedResource != "" {
			p.rows.Representations = append(p.rows.Representations, model.AssetRepresentation{ID: p.newID(), AssetVersionID: selected, ResourceID: selectedResource, MediaType: stringValue(data, "kind"), Role: "primary", MetadataJSON: p.json(map[string]any{"source": "legacy-node-file", "legacyNodeId": oldID}), CreatedAt: p.now})
		}
	}
	kind := stringValue(data, "kind")
	content := map[string]any{"content": selectedText}
	cover := ""
	if resource, ok := p.resources[selectedResource]; ok && kind != "text" {
		address := "/api/resources/" + resource.ID + "/file"
		content = map[string]any{"storageKey": resourceKey(resource.ID), "width": resource.Width, "height": resource.Height, "bytes": resource.Size, "mimeType": resource.MimeType, "durationMs": resource.DurationMs}
		if kind == "image" {
			content["dataUrl"], cover = address, address
		} else {
			content["url"] = address
		}
	} else if kind != "text" {
		// A pending/failed media node is still editable on the canvas. Its
		// source definition is an entity, never a fabricated zero-pixel image.
		kind, content = "entity", map[string]any{"definition": map[string]any{"sourceNodeId": oldID, "sourceKind": data["kind"], "prompt": data["prompt"], "status": data["status"]}}
	}
	p.appendAsset(userID, aid, stringValue(data, "title"), kind, model.AssetCategoryMaterial, selected, cover, content)
	p.rows.AssetLinks = append(p.rows.AssetLinks, model.ProjectAssetLink{ID: p.newID(), ProjectID: pid, AssetID: aid, Position: position, CreatedAt: p.now})
	return aid, selected
}

func (p *legacyProjection) addDefinitionAsset(asset map[string]any, userID, pid string, position int) {
	aid := p.newID()
	oldID := stringValue(asset, "id")
	p.identities["assets"][oldID] = aid
	category := model.AssetCategoryOther
	if stringValue(asset, "kind") == "character" {
		category = model.AssetCategoryCharacter
	}
	if stringValue(asset, "kind") == "location" {
		category = model.AssetCategoryEnvironment
	}
	versions := listValue(asset["versions"])
	if len(versions) == 0 {
		versions = []any{asset}
	}
	primary := ""
	for i, value := range versions {
		version := objectValue(value)
		vid := p.newID()
		primary = vid
		p.identities["assetVersions"][oldID+"/"+stringValue(version, "id")] = vid
		definition := map[string]any{"legacyDefinition": version, "resourceId": version["mediaId"], "prompt": version["prompt"]}
		for key, value := range objectValue(version["profile"]) {
			definition[key] = value
		}
		p.rows.Versions = append(p.rows.Versions, model.AssetVersion{ID: vid, AssetID: aid, Version: i + 1, Status: model.AssetVersionStatusDraft, DefinitionJSON: p.json(definition), Prompt: stringValue(version, "prompt"), CreatedAt: p.now, UpdatedAt: p.now})
		if rid := stringValue(version, "mediaId"); rid != "" {
			p.rows.Representations = append(p.rows.Representations, model.AssetRepresentation{ID: p.newID(), AssetVersionID: vid, ResourceID: rid, MediaType: "image", Role: "primary", CreatedAt: p.now})
		}
	}
	root := legacyMatchingRootVersion(asset, p.identities["assetVersions"])
	if root == "" {
		root = p.newID()
		p.rows.Versions = append(p.rows.Versions, legacyRootVersion(asset, root, aid, len(versions)+1, p.now))
		if rid := stringValue(asset, "mediaId"); rid != "" {
			p.rows.Representations = append(p.rows.Representations, model.AssetRepresentation{ID: p.newID(), AssetVersionID: root, ResourceID: rid, MediaType: "image", Role: "primary", CreatedAt: p.now})
		}
	}
	primary = root
	p.identities["assetRoots"][oldID] = root
	p.appendAsset(userID, aid, stringValue(asset, "title"), "entity", category, primary, "", map[string]any{"definition": asset})
	p.rows.AssetLinks = append(p.rows.AssetLinks, model.ProjectAssetLink{ID: p.newID(), ProjectID: pid, AssetID: aid, Position: position, CreatedAt: p.now})
}

func (p *legacyProjection) appendAsset(userID, id, title, kind string, category model.AssetCategory, primary, cover string, data map[string]any) {
	payload := p.json(map[string]any{"id": id, "title": title, "kind": kind, "category": category, "status": "draft", "primaryVersionId": primary, "coverUrl": cover, "tags": []string{}, "createdAt": p.now.Format(time.RFC3339Nano), "updatedAt": p.now.Format(time.RFC3339Nano), "data": data})
	asset, err := canvas.AssetFromJSON(userID, json.RawMessage(payload))
	if err != nil {
		p.err = fmt.Errorf("%w: imported asset %s: %v", ErrLegacyBundle, id, err)
		return
	}
	p.rows.Assets = append(p.rows.Assets, asset)
}

func (p *legacyProjection) addShot(source map[string]any, pid, uid string, position int) string {
	sid, rid := p.newID(), p.newID()
	p.identities["shots"][stringValue(source, "id")] = sid
	text, image, video := p.nodes[stringValue(source, "textNodeId")], p.nodes[stringValue(source, "imageNodeId")], p.nodes[stringValue(source, "videoNodeId")]
	duration := secondsToMS(video["seconds"])
	description := ""
	if take := p.selectedTake(text); take != nil {
		description = stringValue(take, "outputText")
	} else if stringValue(text, "selectedTakeId") == "" {
		description = stringValue(text, "outputText")
	}
	for _, candidate := range []string{stringValue(text, "prompt"), stringValue(image, "prompt"), stringValue(video, "prompt"), stringValue(source, "title")} {
		if strings.TrimSpace(description) == "" {
			description = candidate
		}
	}
	p.rows.Shots = append(p.rows.Shots, model.Shot{ID: sid, ProjectID: pid, UnitID: uid, CurrentRevisionID: rid, Title: stringValue(source, "title"), Description: description, Position: position, DurationMs: duration, Status: "draft", CreatedAt: p.now, UpdatedAt: p.now})
	p.rows.ShotRevisions = append(p.rows.ShotRevisions, model.ShotRevision{ID: rid, ShotID: sid, Version: 1, PlotDescription: description, Dialogue: stringValue(source, "dialogue"), ShotSize: stringValue(source, "shotType"), CameraMovement: stringValue(source, "camera"), ImagePrompt: stringValue(image, "prompt"), VideoPrompt: stringValue(video, "prompt"), DurationMs: duration, CreatedAt: p.now})
	for _, part := range []struct{ key, kind string }{{"textNodeId", "text"}, {"imageNodeId", "image"}, {"videoNodeId", "video"}} {
		nid := stringValue(source, part.key)
		data := p.nodes[nid]
		if stringValue(data, "selectedTakeId") == "" && part.kind != "text" {
			if resourceID := stringValue(data, "mediaId"); resourceID != "" {
				resource, exists := p.resources[resourceID]
				if !exists || !strings.HasPrefix(resource.MimeType, part.kind+"/") {
					p.err = fmt.Errorf("%w: source node file kind mismatch", ErrLegacyBundle)
					continue
				}
				artifactType := part.kind
				if artifactType == "image" {
					artifactType = "storyboard"
				}
				versionID := p.identities["nodeSources"][nid]
				if versionID == "" {
					versionID = p.identities["takes"][nid+"/current"]
				}
				p.rows.ShotArtifacts = append(p.rows.ShotArtifacts, model.ShotArtifact{ID: p.newID(), ProjectID: pid, UnitID: uid, ShotID: sid, RevisionID: rid, Type: artifactType, Version: len(listValue(data["takes"])) + 1, ResourceID: resourceID, Status: "ready", Selected: true, MetadataJSON: p.json(map[string]any{"source": "legacy-node-file", "legacyNodeId": nid, "assetVersionId": versionID, "title": "导入的原文件", "mimeType": resource.MimeType}), CreatedAt: p.now, UpdatedAt: p.now})
			}
		}
		for i, value := range listValue(data["takes"]) {
			take := objectValue(value)
			status := "failed"
			if stringValue(take, "status") == "completed" {
				status = "ready"
			}
			artifactType := part.kind
			if artifactType == "image" {
				artifactType = "storyboard"
			}
			p.rows.ShotArtifacts = append(p.rows.ShotArtifacts, model.ShotArtifact{ID: p.newID(), ProjectID: pid, UnitID: uid, ShotID: sid, RevisionID: rid, Type: artifactType, Version: i + 1, ResourceID: stringValue(take, "mediaId"), Status: status, Selected: stringValue(data, "selectedTakeId") == stringValue(take, "id") && status == "ready", MetadataJSON: p.json(map[string]any{"legacyTake": take, "assetVersionId": p.identities["takes"][nid+"/"+stringValue(take, "id")]}), CreatedAt: p.now, UpdatedAt: p.now})
		}
	}
	seenReferences := map[string]bool{}
	if p.referenceContexts != nil {
		for _, nodeID := range []string{stringValue(source, "imageNodeId"), stringValue(source, "videoNodeId")} {
			for _, reference := range p.referenceContexts[nodeID] {
				if seenReferences[reference.VersionID] {
					continue
				}
				seenReferences[reference.VersionID] = true
				p.rows.ShotReferences = append(p.rows.ShotReferences, model.ShotAssetReference{ID: p.newID(), ShotID: sid, AssetVersionID: reference.VersionID, Role: "reference", Status: "ready", CreatedAt: p.now})
			}
		}
		return sid
	}
	for _, data := range []map[string]any{image, video} {
		for _, value := range listValue(data["assetIds"]) {
			oldAsset, _ := value.(string)
			version := stringValue(objectValue(data["assetVersionIds"]), oldAsset)
			target := p.identities["assetVersions"][oldAsset+"/"+version]
			if target == "" && version == "" {
				target = p.identities["assetRoots"][oldAsset]
			}
			if target == "" {
				p.err = fmt.Errorf("%w: missing referenced asset version", ErrLegacyBundle)
				continue
			}
			if seenReferences[target] {
				continue
			}
			seenReferences[target] = true
			p.rows.ShotReferences = append(p.rows.ShotReferences, model.ShotAssetReference{ID: p.newID(), ShotID: sid, AssetVersionID: target, Role: "reference", Status: "ready", CreatedAt: p.now})
		}
	}
	return sid
}

func (p *legacyProjection) selectedTake(data map[string]any) map[string]any {
	id := stringValue(data, "selectedTakeId")
	for _, v := range listValue(data["takes"]) {
		take := objectValue(v)
		if stringValue(take, "id") == id {
			return take
		}
	}
	return nil
}
func (p *legacyProjection) json(v any) string {
	raw, err := json.Marshal(v)
	if err != nil {
		p.err = err
	}
	return string(raw)
}
func objectValue(v any) map[string]any { object, _ := v.(map[string]any); return object }
func listValue(v any) []any            { values, _ := v.([]any); return values }
func stringValue(object map[string]any, key string) string {
	value, _ := object[key].(string)
	return value
}
func numberValue(v any) float64 {
	switch x := v.(type) {
	case json.Number:
		n, _ := strconv.ParseFloat(string(x), 64)
		return n
	case float64:
		return x
	case int:
		return float64(x)
	}
	return 0
}
func positiveNumber(v any, fallback float64) float64 {
	n := numberValue(v)
	if n > 0 && !math.IsNaN(n) && !math.IsInf(n, 0) {
		return n
	}
	return fallback
}
func secondsToMS(v any) int64 {
	n := numberValue(v)
	if n < 0 || n > 86400 || math.IsNaN(n) || math.IsInf(n, 0) {
		return 0
	}
	return int64(math.Round(n * 1000))
}
func resourceKey(id string) string {
	if strings.TrimSpace(id) == "" {
		return ""
	}
	return "resource:" + id
}
func appendUnique(values []string, value string) []string {
	for _, v := range values {
		if v == value {
			return values
		}
	}
	return append(values, value)
}
