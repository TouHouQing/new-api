package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"time"
	"unicode"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"gorm.io/gorm"
)

type StudioIndexedClip struct {
	ID             string   `json:"id"`
	Start          float64  `json:"start"`
	End            float64  `json:"end"`
	Title          string   `json:"title"`
	Description    string   `json:"description"`
	Tags           []string `json:"tags"`
	ReviewRequired bool     `json:"review_required"`
}

type StudioMediaIndex struct {
	Kind           string              `json:"kind"`
	SourceMediaID  string              `json:"source_media_id"`
	SourceDigest   string              `json:"source_digest"`
	SourceTakeID   string              `json:"source_take_id,omitempty"`
	SourceNodeID   string              `json:"source_node_id,omitempty"`
	SourceDuration float64             `json:"source_duration"`
	JobID          string              `json:"job_id"`
	ReceiptMediaID string              `json:"receipt_media_id"`
	ReceiptDigest  string              `json:"receipt_digest"`
	Model          string              `json:"model"`
	ModelVersion   string              `json:"model_version"`
	Clips          []StudioIndexedClip `json:"clips"`
	Limitations    []string            `json:"limitations"`
}

type StudioMediaSearchHit struct {
	StudioIndexedClip
	IndexID        string   `json:"index_id"`
	SourceMediaID  string   `json:"source_media_id"`
	SourceDigest   string   `json:"source_digest"`
	SourceTakeID   string   `json:"source_take_id,omitempty"`
	SourceDuration float64  `json:"source_duration"`
	NodeID         string   `json:"node_id"`
	Model          string   `json:"model"`
	ReceiptMediaID string   `json:"receipt_media_id"`
	Score          int      `json:"score"`
	Matched        []string `json:"matched"`
}

type StudioMediaSearchResponse struct {
	Hits           []StudioMediaSearchHit `json:"hits"`
	Ranking        string                 `json:"ranking"`
	Total          int                    `json:"total"`
	NextOffset     *int                   `json:"next_offset"`
	IndexedRecords int                    `json:"indexed_records"`
	StaleRecords   int                    `json:"stale_records"`
	Truncated      bool                   `json:"truncated"`
	Limitations    []string               `json:"limitations"`
}

var errStudioIndexedSourceStale = errors.New("indexed source version is unavailable; analyze the current source again")

// The immutable job snapshot establishes the original node. A different node
// using the same media, or even a copied Take ID, cannot replace that evidence.
func studioReferenceIndexSourceNode(plan *StudioWorkflowPlan, mediaID, takeID string) (string, error) {
	if plan.Operation == nil || plan.Operation.MediaID != mediaID || plan.Operation.TakeID != takeID {
		return "", errStudioIndexedSourceStale
	}
	for _, node := range studioObjects(plan.Document, "nodes") {
		if node["id"] != plan.Operation.NodeID {
			continue
		}
		data, _ := node["data"].(map[string]any)
		origin, _ := data["derivedFrom"].(map[string]any)
		if origin["action"] == "analyze" && origin["mediaId"] == mediaID && (takeID == "" || origin["takeId"] == takeID) {
			if id, ok := origin["nodeId"].(string); ok && StudioIDPattern.MatchString(id) {
				return id, nil
			}
		}
		return "", errStudioIndexedSourceStale
	}
	// Older snapshots without an analysis output node can be resolved only
	// when their own frozen document has exactly one matching source.
	result := ""
	for _, node := range studioObjects(plan.Document, "nodes") {
		if studioIndexedNodeHasSource(node, mediaID, takeID) {
			if result != "" {
				return "", errStudioIndexedSourceStale
			}
			result, _ = node["id"].(string)
		}
	}
	if result == "" {
		return "", errStudioIndexedSourceStale
	}
	return result, nil
}

func studioIndexedNodeHasSource(node map[string]any, mediaID, takeID string) bool {
	data, _ := node["data"].(map[string]any)
	if data["kind"] != "video" {
		return false
	}
	if takeID == "" {
		return data["mediaId"] == mediaID
	}
	return slices.ContainsFunc(studioObjects(data, "takes"), func(take map[string]any) bool {
		return take["id"] == takeID && take["mediaId"] == mediaID && take["status"] == "completed"
	})
}

// Search, preview and transactional apply share this exact source contract.
// Legacy index records resolve their node from the frozen job, never from a
// convenient current node that happens to reference the same immutable media.
func studioIndexedMediaSource(db *gorm.DB, project *model.StudioProject, document map[string]any, index *StudioMediaIndex) (string, *model.StudioMedia, error) {
	if index.Kind != "media_index" || !StudioMediaReferences(document)[index.SourceMediaID] {
		return "", nil, errStudioIndexedSourceStale
	}
	nodeID := index.SourceNodeID
	if nodeID == "" {
		var job model.StudioWorkflowJob
		if err := db.Where("id = ? AND project_id = ? AND kind = ? AND status = ?", index.JobID, project.ID, "analyze", "succeeded").First(&job).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return "", nil, errStudioIndexedSourceStale
			}
			return "", nil, err
		}
		var plan StudioWorkflowPlan
		var progress StudioWorkflowProgress
		if common.Unmarshal([]byte(job.Plan), &plan) != nil || common.Unmarshal([]byte(job.Result), &progress) != nil || progress.ResponseMediaID != index.ReceiptMediaID {
			return "", nil, errStudioIndexedSourceStale
		}
		var err error
		nodeID, err = studioReferenceIndexSourceNode(&plan, index.SourceMediaID, index.SourceTakeID)
		if err != nil {
			return "", nil, err
		}
	}
	if !slices.ContainsFunc(studioObjects(document, "nodes"), func(node map[string]any) bool {
		return node["id"] == nodeID && studioIndexedNodeHasSource(node, index.SourceMediaID, index.SourceTakeID)
	}) {
		return "", nil, errStudioIndexedSourceStale
	}
	var media model.StudioMedia
	if err := db.Where("owner_id = ? AND media_id = ?", project.OwnerID, index.SourceMediaID).First(&media).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", nil, errStudioIndexedSourceStale
		}
		return "", nil, err
	}
	if media.Digest != index.SourceDigest || !strings.HasPrefix(media.MimeType, "video/") {
		return "", nil, errStudioIndexedSourceStale
	}
	return nodeID, &media, nil
}

// ValidateStudioIndexedBrollPlan runs inside ApplyStudioEditRecord's project
// transaction. Old ready plans also need their original evidence to be live;
// already-applied lawful B-roll is retained by the model's idempotent branch.
func ValidateStudioIndexedBrollPlan(tx *gorm.DB, project *model.StudioProject, record *model.StudioProductionRecord) error {
	var plan struct {
		Impact struct {
			Action string `json:"action"`
		} `json:"impact"`
		Request StudioBrollRequest `json:"request"`
	}
	if err := common.Unmarshal([]byte(record.Document), &plan); err != nil {
		return errors.New("edit plan document is invalid")
	}
	if plan.Impact.Action != "use_indexed_broll" && plan.Request.IndexID == "" {
		return nil
	}
	var source model.StudioProductionRecord
	if err := tx.Where("id = ? AND project_id = ? AND kind = ?", plan.Request.IndexID, project.ID, "media_index").First(&source).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errStudioIndexedSourceStale
		}
		return err
	}
	var index StudioMediaIndex
	var document map[string]any
	if common.Unmarshal([]byte(source.Document), &index) != nil || common.Unmarshal([]byte(project.Document), &document) != nil || !slices.ContainsFunc(index.Clips, func(clip StudioIndexedClip) bool { return clip.ID == plan.Request.EntryID }) {
		return errStudioIndexedSourceStale
	}
	_, _, err := studioIndexedMediaSource(tx, project, document, &index)
	return err
}

// This finite vocabulary is disclosed dictionary expansion, not an embedding
// model or a claim that arbitrary Chinese and English phrases are equivalent.
var studioMediaConcepts = [][]string{
	{"coffee", "咖啡"}, {"rain", "rainy", "下雨", "雨天", "雨"}, {"street", "streets", "街道", "街景", "街头"},
	{"close-up", "closeup", "close up", "特写"}, {"person", "people", "人物", "人像"}, {"walking", "walk", "行走", "走路"},
	{"running", "run", "奔跑", "跑步"}, {"dancing", "dance", "跳舞", "舞蹈"}, {"night", "夜晚", "夜景"},
	{"daylight", "白天", "日光"}, {"sunset", "日落", "夕阳"}, {"forest", "woods", "森林", "树林"},
	{"ocean", "sea", "海洋", "大海"}, {"beach", "海滩", "沙滩"}, {"mountain", "mountains", "山峰", "山脉"},
	{"city", "urban", "城市", "都市"}, {"car", "cars", "汽车", "轿车"}, {"food", "食物", "美食"},
	{"product", "商品", "产品"}, {"cat", "cats", "猫"}, {"dog", "dogs", "狗"},
}

func studioMediaNormalized(value string) string {
	return strings.Join(strings.Fields(strings.ToLower(strings.Map(func(char rune) rune {
		if unicode.IsLetter(char) || unicode.IsDigit(char) || char == '-' {
			return char
		}
		return ' '
	}, value))), " ")
}

func studioMediaTermContains(text, term string) bool {
	if strings.IndexFunc(term, func(char rune) bool { return char > unicode.MaxASCII }) >= 0 {
		return strings.Contains(text, term)
	}
	return strings.Contains(" "+text+" ", " "+term+" ")
}

func studioMediaQueryGroups(query string) [][]string {
	remaining := studioMediaNormalized(query)
	groups := [][]string{}
	for _, concept := range studioMediaConcepts {
		matched := false
		for _, alias := range concept {
			matched = matched || studioMediaTermContains(remaining, alias)
		}
		if !matched {
			continue
		}
		groups = append(groups, concept)
		// Long aliases first avoid leaving fragments of a recognized word.
		aliases := slices.Clone(concept)
		slices.SortFunc(aliases, func(a, b string) int { return len(b) - len(a) })
		for _, alias := range aliases {
			if strings.IndexFunc(alias, func(char rune) bool { return char > unicode.MaxASCII }) >= 0 {
				remaining = strings.ReplaceAll(remaining, alias, " ")
			} else {
				remaining = strings.TrimSpace(strings.ReplaceAll(" "+remaining+" ", " "+alias+" ", " "))
			}
		}
	}
	for _, word := range strings.Fields(remaining) {
		if !slices.Contains([]string{"a", "an", "the", "of", "in", "on", "at", "with", "and", "to", "for", "的", "在", "里", "与", "和", "上", "中", "及"}, word) {
			groups = append(groups, []string{word})
		}
	}
	return groups
}

// Only a successful server workflow's immutable relay receipt can create an
// index. Editable canvas text and client-supplied labels are not model evidence.
func IndexStudioMediaAnalysis(ctx context.Context, actorID int, projectID, jobID string) (*model.StudioProductionRecord, error) {
	project, _, err := model.StudioProjectAccess(model.DB, actorID, projectID, true)
	if err != nil {
		return nil, err
	}
	var job model.StudioWorkflowJob
	if !StudioIDPattern.MatchString(jobID) || model.DB.Where("id = ? AND project_id = ? AND kind = ? AND status = ?", jobID, project.ID, "analyze", "succeeded").First(&job).Error != nil {
		return nil, errors.New("select a completed visual analysis from this project")
	}
	var plan StudioWorkflowPlan
	var progress StudioWorkflowProgress
	var document map[string]any
	if common.Unmarshal([]byte(job.Plan), &plan) != nil || common.Unmarshal([]byte(job.Result), &progress) != nil || common.Unmarshal([]byte(project.Document), &document) != nil || plan.Operation == nil || plan.Operation.Edit == nil || progress.ResponseMediaID == "" {
		return nil, errors.New("the completed analysis has no immutable model receipt")
	}
	op := plan.Operation
	if !StudioMediaReferences(document)[op.MediaID] {
		return nil, errors.New("analysis source was removed from this project")
	}
	media, err := GetStudioMedia(project.OwnerID, op.MediaID)
	if err != nil || !strings.HasPrefix(media.MimeType, "video/") {
		return nil, errors.New("visual analysis source is unavailable")
	}
	path, err := StudioMediaPath(media)
	if err != nil {
		return nil, err
	}
	probe, err := ProbeStudioMedia(ctx, path)
	if err != nil || !probe.HasVideo || op.Edit.Start < 0 || op.Edit.End <= op.Edit.Start || op.Edit.End > probe.Duration+.001 {
		return nil, errors.New("analysis interval differs from the actual source video")
	}
	source, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	hash := sha256.New()
	_, err = io.Copy(hash, io.LimitReader(source, StudioMaxMediaBytes+1))
	source.Close()
	if err != nil || hex.EncodeToString(hash.Sum(nil)) != media.Digest {
		return nil, errors.New("visual source no longer matches its immutable digest")
	}
	receipt, err := GetStudioMedia(project.OwnerID, progress.ResponseMediaID)
	if err != nil || receipt.Size > 2<<20 {
		return nil, errors.New("model analysis receipt is unavailable or exceeds its limit")
	}
	response, err := LoadStudioRelayReceipt(project.OwnerID, receipt.MediaID)
	if err != nil {
		return nil, err
	}
	actual := sha256.Sum256(response.Body)
	if hex.EncodeToString(actual[:]) != receipt.Digest {
		return nil, errors.New("model analysis receipt digest changed")
	}
	var parsed struct {
		Model   string `json:"model"`
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if common.Unmarshal(response.Body, &parsed) != nil || len(parsed.Choices) == 0 {
		return nil, errors.New("model receipt contains no visual description")
	}
	text := strings.TrimSpace(parsed.Choices[0].Message.Content)
	text = strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(strings.TrimPrefix(text, "```json"), "```"), "```"))
	var analysis StudioReferenceAnalysis
	if len(text) > 30000 || common.Unmarshal([]byte(text), &analysis) != nil || len(analysis.Shots) == 0 || len(analysis.Shots) > 12 {
		return nil, errors.New("model receipt needs valid, bounded visual shot descriptions")
	}
	index := StudioMediaIndex{Kind: "media_index", SourceMediaID: media.MediaID, SourceDigest: media.Digest, SourceTakeID: op.TakeID, SourceDuration: probe.Duration, JobID: job.ID, ReceiptMediaID: receipt.MediaID, ReceiptDigest: receipt.Digest, Model: op.Model, ModelVersion: parsed.Model, Clips: []StudioIndexedClip{}, Limitations: []string{"Descriptions and time intervals are proposals from sampled visual model evidence; review the actual video before using a clip.", "Search ranks description terms with a finite Chinese/English dictionary; no vector semantic similarity is claimed.", "The provider model identifier is recorded; unreported model weight versions remain unknown."}}
	index.SourceNodeID, err = studioReferenceIndexSourceNode(&plan, index.SourceMediaID, index.SourceTakeID)
	if err != nil {
		return nil, err
	}
	if _, _, err := studioIndexedMediaSource(model.DB, project, document, &index); err != nil {
		return nil, err
	}
	for number, shot := range analysis.Shots {
		if math.IsNaN(shot.Start) || math.IsNaN(shot.End) || math.IsInf(shot.Start, 0) || math.IsInf(shot.End, 0) || shot.Start < op.Edit.Start || shot.End > op.Edit.End+.001 || shot.End <= shot.Start || len(shot.Title) > 200 || len(shot.Text) > 10000 || len(shot.Camera) > 2000 {
			return nil, errors.New("model shot timestamps or descriptions exceed the exact source interval")
		}
		description := strings.TrimSpace(shot.Title + "\n" + shot.Text + "\n" + shot.Camera)
		if description == "" {
			continue
		}
		tags := []string{}
		for _, concept := range studioMediaConcepts {
			for _, alias := range concept {
				if studioMediaTermContains(studioMediaNormalized(description), alias) {
					tags = append(tags, concept[0])
					break
				}
			}
		}
		index.Clips = append(index.Clips, StudioIndexedClip{ID: fmt.Sprintf("%s-%d", studioAnalysisID(job.ID)[:24], number), Start: shot.Start, End: shot.End, Title: shot.Title, Description: description, Tags: tags, ReviewRequired: true})
	}
	if len(index.Clips) == 0 {
		return nil, errors.New("model receipt contains no usable visual descriptions")
	}
	indexID := studioAnalysisID("media-index:" + project.ID + ":" + job.ID)
	if existing, err := model.ReadStudioProductionRecord(actorID, indexID, true); err == nil {
		var prior StudioMediaIndex
		if existing.ProjectID != project.ID || existing.Kind != "media_index" || common.Unmarshal([]byte(existing.Document), &prior) != nil || prior.JobID != index.JobID || prior.SourceMediaID != index.SourceMediaID || prior.SourceTakeID != index.SourceTakeID || prior.SourceDigest != index.SourceDigest || prior.ReceiptMediaID != index.ReceiptMediaID || prior.ReceiptDigest != index.ReceiptDigest || prior.SourceNodeID != "" && prior.SourceNodeID != index.SourceNodeID {
			return nil, model.ErrStudioRevision
		}
		return existing, nil
	}
	return SaveStudioProductionRecord(actorID, project.ID, indexID, "media_index", job.Revision, index)
}

func SearchStudioIndexedMedia(actorID int, projectID, query string, limit, offset int) (StudioMediaSearchResponse, error) {
	result := StudioMediaSearchResponse{Hits: []StudioMediaSearchHit{}, Ranking: "description_terms_with_disclosed_bilingual_dictionary", Limitations: []string{"Results are sampled model descriptions, not guaranteed object detection.", "All query concepts must match the description or the finite bilingual vocabulary; no embedding model is used.", "Only current project sources are searchable; removed sources and changed digests are excluded."}}
	project, _, err := model.StudioProjectAccess(model.DB, actorID, projectID, false)
	if err != nil {
		return result, err
	}
	if len([]rune(query)) > 200 || limit < 1 || limit > 50 || offset < 0 || offset > 10000 {
		return result, errors.New("search needs at most 200 characters and a bounded result page")
	}
	var document map[string]any
	if common.Unmarshal([]byte(project.Document), &document) != nil {
		return result, errors.New("project document is invalid")
	}
	var records []model.StudioProductionRecord
	if err := model.DB.Where("project_id = ? AND kind = ?", project.ID, "media_index").Order("created_at DESC, id DESC").Limit(501).Find(&records).Error; err != nil {
		return result, err
	}
	if len(records) > 500 {
		result.Truncated = true
		records = records[:500]
	}
	groups := studioMediaQueryGroups(query)
	if strings.TrimSpace(query) != "" && len(groups) == 0 {
		return result, errors.New("enter content words such as rainy street or coffee close-up")
	}
	seen := map[string]bool{}
	hits := []StudioMediaSearchHit{}
	for _, record := range records {
		var index StudioMediaIndex
		if len(record.Document) > 256<<10 || common.Unmarshal([]byte(record.Document), &index) != nil {
			result.StaleRecords++
			continue
		}
		nodeID, _, err := studioIndexedMediaSource(model.DB, project, document, &index)
		if errors.Is(err, errStudioIndexedSourceStale) {
			result.StaleRecords++
			continue
		}
		if err != nil {
			return result, err
		}
		result.IndexedRecords++
		for _, clip := range index.Clips {
			identity := fmt.Sprintf("%s:%.6f:%.6f", index.SourceDigest, clip.Start, clip.End)
			if seen[identity] {
				continue
			}
			seen[identity] = true
			normalized := studioMediaNormalized(clip.Description)
			matched := []string{}
			for _, group := range groups {
				for _, term := range group {
					if studioMediaTermContains(normalized, term) {
						matched = append(matched, term)
						break
					}
				}
			}
			if len(matched) != len(groups) {
				continue
			}
			score := len(matched) * 2
			if query != "" && strings.Contains(normalized, studioMediaNormalized(query)) {
				score += 4
			}
			hits = append(hits, StudioMediaSearchHit{StudioIndexedClip: clip, IndexID: record.ID, SourceMediaID: index.SourceMediaID, SourceDigest: index.SourceDigest, SourceTakeID: index.SourceTakeID, SourceDuration: index.SourceDuration, NodeID: nodeID, Model: index.Model, ReceiptMediaID: index.ReceiptMediaID, Score: score, Matched: matched})
		}
	}
	slices.SortStableFunc(hits, func(a, b StudioMediaSearchHit) int {
		if a.Score != b.Score {
			return b.Score - a.Score
		}
		if a.IndexID != b.IndexID {
			return strings.Compare(a.IndexID, b.IndexID)
		}
		return strings.Compare(a.ID, b.ID)
	})
	result.Total = len(hits)
	end := min(len(hits), offset+limit)
	result.Hits = hits[min(offset, len(hits)):end]
	if end < len(hits) {
		result.NextOffset = &end
	}
	return result, nil
}

type StudioBrollRequest struct {
	RequestID       string `json:"request_id"`
	Revision        int64  `json:"revision"`
	IndexID         string `json:"index_id"`
	EntryID         string `json:"entry_id"`
	ReplaceClipID   string `json:"replace_clip_id,omitempty"`
	ReviewConfirmed bool   `json:"review_confirmed"`
}

// The candidate is previewed first; only ApplyStudioEditRecord changes a film.
// Replacements keep program duration and extract original clip audio when needed.
func PrepareStudioBrollPlan(ctx context.Context, actorID int, projectID string, request StudioBrollRequest) (*model.StudioProductionRecord, error) {
	if !StudioIDPattern.MatchString(request.RequestID) || request.Revision < 1 || !request.ReviewConfirmed {
		return nil, errors.New("preview the actual source interval and confirm it before preparing B-roll")
	}
	project, _, err := model.StudioProjectAccess(model.DB, actorID, projectID, true)
	if err != nil {
		return nil, err
	}
	var existingPlan *model.StudioProductionRecord
	if old, err := model.ReadStudioProductionRecord(actorID, request.RequestID, true); err == nil {
		var saved struct {
			Request StudioBrollRequest `json:"request"`
		}
		if old.ProjectID != projectID || old.Kind != "edit_plan" || common.Unmarshal([]byte(old.Document), &saved) != nil || saved.Request != request {
			return nil, model.ErrStudioRevision
		}
		if old.State == "applied" {
			return old, nil
		}
		existingPlan = old
	}
	if project.Revision != request.Revision {
		return nil, model.ErrStudioRevision
	}
	record, err := model.ReadStudioProductionRecord(actorID, request.IndexID, false)
	if err != nil || record.ProjectID != projectID || record.Kind != "media_index" {
		return nil, model.ErrStudioAccess
	}
	var index StudioMediaIndex
	var document map[string]any
	if common.Unmarshal([]byte(record.Document), &index) != nil || common.Unmarshal([]byte(project.Document), &document) != nil {
		return nil, errStudioIndexedSourceStale
	}
	sourceNodeID, _, err := studioIndexedMediaSource(model.DB, project, document, &index)
	if err != nil {
		return nil, err
	}
	if existingPlan != nil {
		return existingPlan, nil
	}
	var candidate *StudioIndexedClip
	for i := range index.Clips {
		if index.Clips[i].ID == request.EntryID {
			candidate = &index.Clips[i]
			break
		}
	}
	if candidate == nil {
		return nil, errors.New("indexed interval is unavailable")
	}
	media, err := GetStudioMedia(project.OwnerID, index.SourceMediaID)
	if err != nil || media.Digest != index.SourceDigest {
		return nil, errors.New("indexed source digest changed")
	}
	path, err := StudioMediaPath(media)
	if err != nil {
		return nil, err
	}
	probe, err := ProbeStudioMedia(ctx, path)
	if err != nil || !probe.HasVideo || candidate.End > probe.Duration+.001 {
		return nil, errors.New("indexed interval exceeds its actual source")
	}
	production, clips := studioTimelineDocument(document)
	if len(studioObjects(document, "nodes")) >= 500 || len(clips) >= 100 && request.ReplaceClipID == "" {
		return nil, errors.New("project reached the node or timeline limit")
	}
	nodeID := "broll-" + studioAnalysisID(request.RequestID)[:40]
	takeID := "take-" + studioAnalysisID(request.RequestID + ":take")[:40]
	clipID := "clip-" + studioAnalysisID(request.RequestID + ":clip")[:40]
	nodes, _ := document["nodes"].([]any)
	snapshot, err := common.Marshal(map[string]any{"index_id": record.ID, "receipt_media_id": index.ReceiptMediaID, "source_digest": index.SourceDigest, "source_take_id": index.SourceTakeID, "start": candidate.Start, "end": candidate.End})
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	nodes = append(nodes, map[string]any{"id": nodeID, "type": "studio", "position": map[string]any{"x": float64(len(nodes)%3) * 340, "y": float64(len(nodes)/3) * 300}, "data": map[string]any{"kind": "video", "title": candidate.Title, "prompt": candidate.Description, "status": "completed", "sourceMode": "upload", "seconds": probe.Duration, "mediaId": media.MediaID, "selectedTakeId": takeID, "derivedFrom": map[string]any{"nodeId": sourceNodeID, "takeId": index.SourceTakeID, "mediaId": media.MediaID, "action": "media_search"}, "takes": []any{map[string]any{"id": takeID, "createdAt": now, "sourceMode": "upload", "prompt": candidate.Description, "status": "completed", "mediaId": media.MediaID, "requestSnapshot": string(snapshot)}}}})
	document["nodes"] = nodes
	clip := map[string]any{"id": clipID, "nodeId": nodeID, "takeId": takeID, "trimStart": candidate.Start, "trimEnd": candidate.End, "speed": 1.0, "volume": 1.0, "muted": true, "caption": "", "captionOffset": 0.0, "captionDuration": 0.0, "fadeIn": 0.0, "fadeOut": 0.0}
	refs := []map[string]any{{"media_id": media.MediaID, "digest": media.Digest, "take_id": takeID, "analysis_id": record.ID, "source_node_id": sourceNodeID, "source_take_id": index.SourceTakeID}}
	programStart := 0.0
	replaced := request.ReplaceClipID == ""
	for i, old := range clips {
		oldMedia, data, err := studioClipSource(project.OwnerID, document, old)
		if err != nil {
			return nil, err
		}
		oldPath, err := StudioMediaPath(oldMedia)
		if err != nil {
			return nil, err
		}
		oldProbe, err := ProbeStudioMedia(ctx, oldPath)
		if err != nil {
			return nil, err
		}
		start := studioDocumentNumber(old["trimStart"], 0)
		end := studioDocumentNumber(old["trimEnd"], oldProbe.Duration)
		speed := studioDocumentNumber(old["speed"], 1)
		if speed < .25 || speed > 4 || end <= start || end > oldProbe.Duration+.001 {
			return nil, errors.New("existing timeline source duration is invalid")
		}
		if old["id"] != request.ReplaceClipID {
			programStart += (end - start) / speed
			continue
		}
		if data["locked"] == true {
			return nil, errors.New("the target clip is locked")
		}
		if candidate.End-candidate.Start+.001 < (end-start)/speed {
			return nil, errors.New("candidate interval is too short; choose a longer source instead of stretching a frame")
		}
		for key, value := range old {
			clip[key] = value
		}
		clip["nodeId"], clip["takeId"], clip["trimStart"], clip["trimEnd"], clip["speed"], clip["muted"] = nodeID, takeID, candidate.Start, candidate.Start+(end-start)/speed, 1.0, true
		if oldProbe.HasAudio && old["muted"] != true && studioDocumentNumber(old["volume"], 1) > 0 {
			tracks, _ := production["audioTracks"].([]any)
			if len(tracks) >= 100 {
				return nil, errors.New("audio track limit prevents preserving the original dialogue")
			}
			work, err := os.MkdirTemp("", "studio-broll-audio-*")
			if err != nil {
				return nil, err
			}
			defer os.RemoveAll(work)
			output := filepath.Join(work, "dialogue.wav")
			filters := []string{}
			tempo := speed
			for tempo > 2 {
				filters = append(filters, "atempo=2")
				tempo /= 2
			}
			for tempo < .5 {
				filters = append(filters, "atempo=0.5")
				tempo *= 2
			}
			filters = append(filters, fmt.Sprintf("atempo=%g", tempo), fmt.Sprintf("volume=%g", studioDocumentNumber(old["volume"], 1)))
			if fade := studioDocumentNumber(old["fadeIn"], 0); fade > 0 {
				filters = append(filters, fmt.Sprintf("afade=t=in:d=%g", fade))
			}
			if fade := studioDocumentNumber(old["fadeOut"], 0); fade > 0 {
				filters = append(filters, fmt.Sprintf("afade=t=out:st=%g:d=%g", max(0, (end-start)/speed-fade), fade))
			}
			if err := exec.CommandContext(ctx, studioFFmpegBinary(false), "-nostdin", "-v", "error", "-y", "-ss", fmt.Sprint(start), "-t", fmt.Sprint(end-start), "-i", oldPath, "-vn", "-af", strings.Join(filters, ","), "-ar", "22050", "-ac", "2", "-c:a", "pcm_s16le", output).Run(); err != nil {
				return nil, errors.New("original dialogue could not be preserved; replacement was not applied")
			}
			file, err := os.Open(output)
			if err != nil {
				return nil, err
			}
			audio, err := SaveStudioMedia(project.OwnerID, studioAnalysisID(request.RequestID+":preserved-audio"), "audio/wav", file)
			file.Close()
			if err != nil {
				return nil, err
			}
			if err := LinkStudioProjectMedia(projectID, audio.MediaID); err != nil {
				return nil, err
			}
			production["audioTracks"] = append(tracks, map[string]any{"id": "audio-" + studioAnalysisID(request.RequestID)[:40], "mediaId": audio.MediaID, "start": 0.0, "offset": programStart, "duration": (end - start) / speed, "volume": 1.0})
			refs = append(refs, map[string]any{"media_id": audio.MediaID, "digest": audio.Digest, "purpose": "preserved_original_dialogue"})
		}
		clips[i] = clip
		if reframes, ok := production["reframes"].(map[string]any); ok {
			delete(reframes, request.ReplaceClipID)
		}
		replaced = true
		break
	}
	if !replaced {
		return nil, errors.New("replacement target is unavailable")
	}
	if request.ReplaceClipID == "" {
		clips = append(clips, clip)
	}
	values := make([]any, len(clips))
	for i, value := range clips {
		values[i] = value
	}
	production["timeline"], production["timelineEdited"] = values, true
	document["updatedAt"] = now
	plans, _ := production["appliedEditPlans"].([]any)
	if len(plans) >= 100 {
		plans = plans[len(plans)-99:]
	}
	production["appliedEditPlans"] = append(plans, request.RequestID)
	raw, err := common.Marshal(document)
	if err != nil {
		return nil, err
	}
	if _, err := ValidateStudioDocument(projectID, raw); err != nil {
		return nil, err
	}
	return SaveStudioProductionRecord(actorID, projectID, request.RequestID, "edit_plan", request.Revision, map[string]any{"request": request, "next_document": document, "impact": map[string]any{"action": "use_indexed_broll", "source_start": candidate.Start, "source_end": clip["trimEnd"], "replace_clip_id": request.ReplaceClipID, "preserve_original_media": true, "preserve_dialogue": true, "music_policy": "keep_project_time"}, "source_refs": refs})
}
