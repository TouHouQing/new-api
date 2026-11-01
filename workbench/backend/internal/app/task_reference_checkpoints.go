package app

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
)

func (w *taskWorkerCoordinator) measureReferenceWindows(ctx context.Context, task *model.Task, input mediaAnalysisTaskInput, worker mediaAnalysisWorkerSnapshot, file string) ([]byte, production.MediaAnalysisEdits, error) {
	var empty production.MediaAnalysisEdits
	plan, err := production.ReferenceWindows(input.Source)
	if err != nil {
		return nil, empty, err
	}
	parts := make([]production.MediaAnalysisEdits, 0, len(plan))
	provenance := make([]map[string]any, 0, len(plan))
	for _, window := range plan {
		if err := ctx.Err(); err != nil {
			return nil, empty, err
		}
		part := input
		part.Source.Windowed = false
		part.Source.StartMs = window.StartMs
		part.Source.EndMs = window.EndMs
		id := mediaAnalysisID("reference-window-v1", task.ID, strconv.Itoa(window.Index))
		revisionID := mediaAnalysisID("reference-window-initial-version-v1", id)
		signature := mediaAnalysisDigest([]any{"reference-windows-v1-55s-overlap500ms", input.RequestSHA256, window, worker.EngineSHA256})
		fixedSource, _ := json.Marshal(part.Source)
		row, lookupErr := w.service.repo.ProjectMediaAnalysis(task.UserID, task.ProjectID, id)
		var evidence []byte
		var edits production.MediaAnalysisEdits
		if lookupErr == nil {
			initial, err := w.service.repo.ProjectMediaAnalysisRevision(task.UserID, id, revisionID)
			if err != nil || row.SourceKind != "reference_checkpoint" || row.SourceTaskID != task.ID || row.ResourceID != input.Source.ResourceID || row.SourceJSON != string(fixedSource) || row.CurrentRevisionID != revisionID || row.Revision != 1 || !row.Archived || initial.RequestSHA256 != signature {
				return nil, empty, errors.New("已保存检查点与本次固定来源或算法不一致，未覆盖原结果")
			}
			evidence = []byte(row.EvidenceJSON)
			var measurement production.MediaAnalysisMeasurement
			var engine struct {
				EngineSHA256 string `json:"engine_sha256"`
			}
			if json.Unmarshal(evidence, &measurement) != nil || json.Unmarshal(evidence, &engine) != nil || engine.EngineSHA256 != worker.EngineSHA256 {
				return nil, empty, errors.New("检查点原始证据不完整")
			}
			edits, err = production.InitialMediaAnalysisEdits(part.Source, "reference_video", evidence, measurement.InputDigest)
			if err != nil {
				return nil, empty, errors.New("检查点未通过固定区间核对")
			}
			var saved production.MediaAnalysisEdits
			if json.Unmarshal([]byte(initial.DocumentJSON), &saved) != nil || mediaAnalysisDigest(saved) != mediaAnalysisDigest(edits) {
				return nil, empty, errors.New("检查点初始版本与原始测量不一致")
			}
		} else if errors.Is(lookupErr, gorm.ErrRecordNotFound) {
			if err := w.progress(task, fmt.Sprintf("分析参考片检查点 %d/%d", window.Index+1, len(plan)), 10+window.Index*75/len(plan)); err != nil {
				return nil, empty, err
			}
			evidence, edits, err = measureMediaAnalysisInterval(ctx, part, worker, file)
			if err != nil {
				return nil, empty, err
			}
			document, _ := json.Marshal(edits)
			now := time.Now()
			row = &model.ProjectMediaAnalysis{ID: id, UserID: task.UserID, ProjectID: task.ProjectID, Kind: "reference_video", SourceKind: "reference_checkpoint", SourceKey: id, SourceTaskID: task.ID, ResourceID: input.Source.ResourceID, Title: fmt.Sprintf("参考片检查点 %d/%d", window.Index+1, len(plan)), SourceJSON: string(fixedSource), EvidenceJSON: string(evidence), CurrentRevisionID: revisionID, Revision: 1, Archived: true, CreatedAt: now, UpdatedAt: now}
			initial := model.ProjectMediaAnalysisRevision{ID: revisionID, AnalysisID: id, UserID: task.UserID, AuthorID: task.UserID, Version: 1, RequestID: "checkpoint:" + id, RequestSHA256: signature, DocumentJSON: string(document), Note: "区间原始测量，只由任务管理", CreatedAt: now}
			w.service.storageMu.Lock()
			err = w.service.validateProductionDocumentStorage(task.UserID, int64(len(fixedSource)+len(evidence)+len(document)))
			if err == nil {
				err = w.service.repo.SaveReferenceAnalysisCheckpoint(task, row, &initial, fmt.Sprintf("已保存参考片检查点 %d/%d", window.Index+1, len(plan)), 10+(window.Index+1)*75/len(plan))
			}
			w.service.storageMu.Unlock()
			if err != nil {
				return nil, empty, err
			}
		} else {
			return nil, empty, lookupErr
		}
		parts = append(parts, edits)
		provenance = append(provenance, map[string]any{"analysisId": id, "revisionId": revisionID, "window": window, "evidenceSha256": fmt.Sprintf("%x", sha256.Sum256(evidence))})
	}
	merged, err := production.MergeReferenceWindows(input.Source, parts)
	if err != nil {
		return nil, empty, err
	}
	evidence, _ := json.Marshal(map[string]any{"kind": "reference_video", "method": "checkpointed-frame-change-v1", "engine_version": worker.EngineVersion, "engine_sha256": worker.EngineSHA256, "source_sha256": input.Source.SHA256, "duration": float64(input.Source.EndMs-input.Source.StartMs) / 1000, "checkpoints": provenance, "semantic_understanding": false})
	return evidence, merged, nil
}
