// SPDX-License-Identifier: AGPL-3.0-or-later
// Legacy transcript contract: Copyright (C) 2023-2026 QuantumNous.
package production

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"strings"
	"time"

	"yingce/backend/internal/model"
)

type LegacyProjectionData struct {
	Artifacts      map[string][]byte
	ResourceSHA256 map[string]string
	Preflight      bool
	// A prior immutable v8 receipt/cut proves planning was already converted.
	// Later converter upgrades must not recreate archived or edited chapters.
	PreviousPlanning *LegacyProjectionReport
	Canvas           *model.CanvasProject
}
type LegacyTranscriptProjection struct {
	Transcripts   []model.ProjectTranscript
	Versions      []model.ProjectTranscriptRevision
	TranscriptIDs map[string]string `json:"transcriptIds"`
	VersionIDs    map[string]string `json:"versionIds"`
	PreservedOnly []string          `json:"preservedOnly"`
	Warnings      []string          `json:"warnings"`
}

func legacyNativeID(parts ...string) string {
	raw, _ := json.Marshal(parts)
	digest := sha256.Sum256(raw)
	return hex.EncodeToString(digest[:16])
}

// Only named transcript artifacts are decoded, within aggregate memory bounds.
// Archive inspection already verified every declared file SHA and media alias.
func (bundle *LegacyBundle) ProjectionData(paths map[string]string) (LegacyProjectionData, error) {
	result := LegacyProjectionData{Artifacts: map[string][]byte{}, ResourceSHA256: map[string]string{}}
	for _, entry := range bundle.Inspection.Resources {
		if id := paths[entry.Path]; id != "" {
			result.ResourceSHA256[id] = entry.SHA256
		}
	}
	var total int64
	for _, value := range listValue(objectValue(bundle.Manifest.Project["production"])["analysisRefs"]) {
		ref := objectValue(value)
		if stringValue(ref, "kind") != "transcript" && legacyEditableAnalysisKind(stringValue(ref, "kind")) == "" {
			continue
		}
		oldID := stringValue(ref, "artifactMediaId")
		file := bundle.Inspection.MediaAliases[oldID]
		target := paths[file]
		if file == "" || target == "" {
			return result, fmt.Errorf("%w: missing transcript artifact", ErrLegacyBundle)
		}
		if _, ok := result.Artifacts[target]; ok {
			continue
		}
		reader, err := bundle.OpenMedia(file)
		if err != nil {
			return result, err
		}
		raw, err := io.ReadAll(io.LimitReader(reader, MaxLegacyDocumentBytes+1))
		reader.Close()
		if err != nil {
			return result, err
		}
		total += int64(len(raw))
		if len(raw) > MaxLegacyDocumentBytes || total > 64<<20 {
			return result, fmt.Errorf("%w: transcript artifacts exceed decode limit", ErrLegacyBundle)
		}
		result.Artifacts[target] = raw
	}
	return result, nil
}

type legacyTranscriptArtifact struct {
	ref      map[string]any
	document TranscriptDocument
	parent   string
	index    int
}

// History is grouped only by explicit same-source parent links. Independent
// recognitions of one file remain independent editable native transcripts.
func ProjectLegacyTranscripts(document map[string]any, resources map[string]model.Resource, data LegacyProjectionData, userID, projectID, importID string, now time.Time) (LegacyTranscriptProjection, error) {
	result := LegacyTranscriptProjection{Transcripts: []model.ProjectTranscript{}, Versions: []model.ProjectTranscriptRevision{}, TranscriptIDs: map[string]string{}, VersionIDs: map[string]string{}, PreservedOnly: []string{}, Warnings: []string{}}
	artifacts := map[string]legacyTranscriptArtifact{}
	order := []string{}
	for index, value := range listValue(objectValue(document["production"])["analysisRefs"]) {
		ref := objectValue(value)
		if stringValue(ref, "kind") != "transcript" {
			continue
		}
		id := stringValue(ref, "id")
		path := fmt.Sprintf("production.analysisRefs[%d].transcript", index)
		if id == "" || len(id) > 128 {
			return result, ErrLegacyBundle
		}
		if _, exists := artifacts[id]; exists {
			return result, fmt.Errorf("%w: duplicate transcript identity", ErrLegacyBundle)
		}
		sourceID := stringValue(ref, "sourceMediaId")
		source, ok := resources[sourceID]
		digest := stringValue(ref, "sourceDigest")
		if !ok || len(digest) != 64 || data.ResourceSHA256[sourceID] != digest {
			return result, fmt.Errorf("%w: transcript source digest mismatch", ErrLegacyBundle)
		}
		raw, ok := data.Artifacts[stringValue(ref, "artifactMediaId")]
		if !ok {
			result.PreservedOnly = append(result.PreservedOnly, path)
			result.Warnings = append(result.Warnings, "旧文字稿缺少可解析的原始分析，已保留来源文件，尚未转为可编辑文字稿")
			continue
		}
		parsed, parent, err := parseLegacyTranscript(raw, source.DurationMs, data.Preflight)
		if err != nil {
			result.PreservedOnly = append(result.PreservedOnly, path)
			result.Warnings = append(result.Warnings, "旧文字稿的时间或内容不能安全映射，原始文件已保留，未生成或猜测识别结果")
			continue
		}
		artifacts[id] = legacyTranscriptArtifact{ref: ref, document: parsed, parent: parent, index: index}
		order = append(order, id)
	}
	states := map[string]int{}
	roots := map[string]string{}
	sorted := []string{}
	var visit func(string) (string, error)
	visit = func(id string) (string, error) {
		if states[id] == 1 {
			return "", fmt.Errorf("%w: transcript correction cycle", ErrLegacyBundle)
		}
		if states[id] == 2 {
			return roots[id], nil
		}
		states[id] = 1
		part := artifacts[id]
		root := id
		if parent, exists := artifacts[part.parent]; exists {
			if stringValue(parent.ref, "sourceMediaId") != stringValue(part.ref, "sourceMediaId") || stringValue(parent.ref, "sourceDigest") != stringValue(part.ref, "sourceDigest") {
				return "", fmt.Errorf("%w: correction changes source identity", ErrLegacyBundle)
			}
			var err error
			root, err = visit(part.parent)
			if err != nil {
				return "", err
			}
		} else if part.parent != "" {
			result.Warnings = appendUnique(result.Warnings, "旧文字稿的父分析未包含在工程中；已保留当前校正版和原始分析文件，不将其标记为初始识别。")
		}
		states[id] = 2
		roots[id] = root
		sorted = append(sorted, id)
		return root, nil
	}
	for _, id := range order {
		if _, err := visit(id); err != nil {
			return result, err
		}
	}
	rowIndexes := map[string]int{}
	for _, id := range sorted {
		part := artifacts[id]
		root := roots[id]
		source := resources[stringValue(part.ref, "sourceMediaId")]
		tid := legacyNativeID("legacy-transcript-v1", importID, root)
		rid := legacyNativeID("legacy-transcript-revision-v1", importID, id)
		rowIndex, exists := rowIndexes[root]
		if !exists {
			rowIndex = len(result.Transcripts)
			rowIndexes[root] = rowIndex
			sourceDuration := source.DurationMs
			if data.Preflight && sourceDuration == 0 {
				for _, segment := range part.document.Segments {
					if segment.EndMs > sourceDuration {
						sourceDuration = segment.EndMs
					}
				}
			}
			result.Transcripts = append(result.Transcripts, model.ProjectTranscript{ID: tid, UserID: userID, ProjectID: projectID, SourceKind: "legacy_import", SourceKey: legacyNativeID("legacy-transcript-source-v1", importID, root), SourceImportID: importID, SourceLegacyID: root, ResourceID: source.ID, Title: fmt.Sprintf("导入文字稿 %d", len(result.Transcripts)+1), SourceETag: source.ETag, SourceBytes: source.Size, SourceDurationMs: sourceDuration, CreatedAt: now, UpdatedAt: now})
		}
		row := &result.Transcripts[rowIndex]
		row.Revision++
		row.CurrentRevisionID = rid
		raw, err := json.Marshal(part.document)
		if err != nil {
			return result, err
		}
		created := now
		if parsed, err := time.Parse(time.RFC3339Nano, stringValue(part.ref, "createdAt")); err == nil {
			created = parsed
		}
		note := "导入旧分析 " + id
		if part.parent != "" {
			note += "；父版本关联保留于迁移记录"
		}
		result.Versions = append(result.Versions, model.ProjectTranscriptRevision{ID: rid, TranscriptID: tid, Version: row.Revision, UserID: userID, AuthorID: userID, DocumentJSON: string(raw), Note: note, CreatedAt: created})
		result.TranscriptIDs[id] = tid
		result.VersionIDs[id] = rid
	}
	return result, nil
}

func parseLegacyTranscript(raw []byte, sourceDuration int64, preflight bool) (TranscriptDocument, string, error) {
	var source struct {
		Kind     string `json:"kind"`
		Language string `json:"language"`
		Segments []struct {
			ID         string   `json:"id"`
			Start      float64  `json:"start"`
			End        float64  `json:"end"`
			Text       string   `json:"text"`
			Speaker    string   `json:"speaker"`
			Confidence *float64 `json:"confidence"`
			Corrected  bool     `json:"human_corrected"`
		} `json:"segments"`
		Words []struct {
			ID         string   `json:"id"`
			Start      float64  `json:"start"`
			End        float64  `json:"end"`
			Text       string   `json:"text"`
			Speaker    string   `json:"speaker"`
			Confidence *float64 `json:"confidence"`
		} `json:"words"`
		Manual *struct {
			Parent string `json:"parent_analysis_id"`
		} `json:"manual_correction"`
	}
	if len(raw) == 0 || len(raw) > MaxLegacyDocumentBytes || json.Unmarshal(raw, &source) != nil || source.Kind != "transcript" {
		return TranscriptDocument{}, "", errors.New("invalid legacy transcript")
	}
	doc := TranscriptDocument{Version: 1, Language: strings.TrimSpace(source.Language), Precision: "segment", Segments: []TranscriptSpan{}}
	stamp := func(seconds float64) (int64, error) {
		if math.IsNaN(seconds) || math.IsInf(seconds, 0) || seconds < 0 || seconds > 86400 {
			return 0, errors.New("invalid transcript seconds")
		}
		return int64(math.Round(seconds * 1000)), nil
	}
	for _, span := range source.Segments {
		start, e1 := stamp(span.Start)
		end, e2 := stamp(span.End)
		if e1 != nil || e2 != nil || (!preflight && (sourceDuration <= 0 || end > sourceDuration)) {
			return doc, "", errors.New("transcript outside immutable source")
		}
		doc.Segments = append(doc.Segments, TranscriptSpan{ID: span.ID, StartMs: start, EndMs: end, Text: span.Text, Speaker: span.Speaker, Confidence: span.Confidence, Corrected: span.Corrected})
	}
	for _, span := range source.Words {
		start, e1 := stamp(span.Start)
		end, e2 := stamp(span.End)
		if e1 != nil || e2 != nil || (!preflight && (sourceDuration <= 0 || end > sourceDuration)) {
			return doc, "", errors.New("word outside immutable source")
		}
		doc.Words = append(doc.Words, TranscriptSpan{ID: span.ID, StartMs: start, EndMs: end, Text: span.Text, Speaker: span.Speaker, Confidence: span.Confidence})
	}
	parent := ""
	if len(doc.Words) > 0 {
		doc.Precision = "word"
	}
	if source.Manual != nil {
		parent = source.Manual.Parent
		doc.WordTextNeedsReview = len(doc.Words) > 0
	}
	if err := ValidateTranscript(doc); err != nil {
		return doc, parent, err
	}
	return doc, parent, nil
}
