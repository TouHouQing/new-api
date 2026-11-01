package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"gorm.io/gorm"
	"yingce/backend/internal/model"
)

// Authoring documents only. Runtime configuration, credentials, billing,
// memberships, sessions and bearer share links never enter a delivery package.
type ProjectDeliverySnapshot struct {
	Project   model.Project              `json:"project"`
	Documents map[string]json.RawMessage `json:"documents"`
}

func (r *Repository) ProjectDeliverySnapshot(ctx context.Context, owner, projectID string) (ProjectDeliverySnapshot, error) {
	result := ProjectDeliverySnapshot{Documents: map[string]json.RawMessage{}}
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("id = ? AND user_id = ?", projectID, owner).First(&result.Project).Error; err != nil {
			return err
		}
		save := func(name string, value any) error {
			b, err := json.Marshal(value)
			if err == nil {
				result.Documents[name] = b
			}
			return err
		}
		query := func(name string, dest any, where string, args ...any) error {
			if err := tx.Where(where, args...).Order("id").Find(dest).Error; err != nil {
				return err
			}
			return save(name, dest)
		}
		var units []model.ProjectUnit
		if err := query("units", &units, "project_id = ?", projectID); err != nil {
			return err
		}
		var canvases []model.CanvasProject
		if err := query("canvases", &canvases, "project_id = ? AND user_id = ?", projectID, owner); err != nil {
			return err
		}
		canvasIDs := []string{}
		canvasDocs := []map[string]any{}
		for _, row := range canvases {
			canvasIDs = append(canvasIDs, row.ID)
			canvasDocs = append(canvasDocs, map[string]any{"canvas": row, "document": json.RawMessage(row.PayloadJSON)})
		}
		if err := save("canvases", canvasDocs); err != nil {
			return err
		}
		var history []model.CanvasSnapshot
		if err := tx.Where("canvas_id IN ? AND user_id = ?", canvasIDs, owner).Order("canvas_id, revision").Find(&history).Error; err != nil {
			return err
		}
		histories := []map[string]any{}
		for _, row := range history {
			histories = append(histories, map[string]any{"snapshot": row, "document": json.RawMessage(row.PayloadJSON)})
		}
		if err := save("canvasHistory", histories); err != nil {
			return err
		}
		var links []model.CanvasUnitLink
		if err := query("canvasUnitLinks", &links, "project_id = ?", projectID); err != nil {
			return err
		}
		var shots []model.Shot
		if err := query("shots", &shots, "project_id = ?", projectID); err != nil {
			return err
		}
		shotIDs := []string{}
		for _, row := range shots {
			shotIDs = append(shotIDs, row.ID)
		}
		var revisions []model.ShotRevision
		if err := query("shotRevisions", &revisions, "shot_id IN ?", shotIDs); err != nil {
			return err
		}
		var artifacts []model.ShotArtifact
		if err := query("shotArtifacts", &artifacts, "shot_id IN ?", shotIDs); err != nil {
			return err
		}
		var refs []model.ShotAssetReference
		if err := query("shotReferences", &refs, "shot_id IN ?", shotIDs); err != nil {
			return err
		}
		var assetLinks []model.ProjectAssetLink
		if err := query("projectAssetLinks", &assetLinks, "project_id = ?", projectID); err != nil {
			return err
		}
		assetIDs := []string{}
		for _, row := range assetLinks {
			assetIDs = append(assetIDs, row.AssetID)
		}
		var assets []model.Asset
		if err := query("assets", &assets, "id IN ? AND user_id = ?", assetIDs, owner); err != nil {
			return err
		}
		var versions []model.AssetVersion
		if err := query("assetVersions", &versions, "asset_id IN ?", assetIDs); err != nil {
			return err
		}
		versionIDs := []string{}
		for _, row := range versions {
			versionIDs = append(versionIDs, row.ID)
		}
		var representations []model.AssetRepresentation
		if err := query("assetRepresentations", &representations, "asset_version_id IN ?", versionIDs); err != nil {
			return err
		}
		var folders []model.ProjectAssetFolder
		if err := query("assetFolders", &folders, "project_id = ?", projectID); err != nil {
			return err
		}
		var candidates []model.ProjectAssetCandidate
		if err := query("assetCandidates", &candidates, "project_id = ?", projectID); err != nil {
			return err
		}
		var workflows []model.WorkflowInstance
		if err := query("workflows", &workflows, "project_id = ?", projectID); err != nil {
			return err
		}
		workflowIDs := []string{}
		for _, row := range workflows {
			workflowIDs = append(workflowIDs, row.ID)
		}
		var steps []model.WorkflowStepInstance
		if err := query("workflowSteps", &steps, "workflow_instance_id IN ?", workflowIDs); err != nil {
			return err
		}
		var timeline model.ProjectTimeline
		if err := tx.Where("project_id = ? AND user_id = ?", projectID, owner).First(&timeline).Error; err == nil {
			if err := save("timeline", map[string]any{"revision": timeline.Revision, "timeline": json.RawMessage(timeline.PayloadJSON)}); err != nil {
				return err
			}
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		var cuts []model.ProjectCut
		if err := tx.Where("project_id = ? AND user_id = ?", projectID, owner).Order("id").Find(&cuts).Error; err != nil {
			return err
		}
		cutDocs := []map[string]any{}
		for _, row := range cuts {
			cutDocs = append(cutDocs, map[string]any{"cut": row, "timeline": json.RawMessage(row.PayloadJSON), "metadata": json.RawMessage(nonemptyDeliveryJSON(row.MetadataJSON))})
		}
		if err := save("cuts", cutDocs); err != nil {
			return err
		}
		var transcripts []model.ProjectTranscript
		if err := query("transcripts", &transcripts, "project_id = ? AND user_id = ?", projectID, owner); err != nil {
			return err
		}
		transcriptIDs := []string{}
		for _, row := range transcripts {
			transcriptIDs = append(transcriptIDs, row.ID)
		}
		var textVersions []model.ProjectTranscriptRevision
		if err := tx.Where("transcript_id IN ? AND user_id = ?", transcriptIDs, owner).Order("transcript_id, version").Find(&textVersions).Error; err != nil {
			return err
		}
		texts := []map[string]any{}
		for _, row := range textVersions {
			texts = append(texts, map[string]any{"revision": row, "document": json.RawMessage(row.DocumentJSON)})
		}
		if err := save("transcriptHistory", texts); err != nil {
			return err
		}
		var analyses []model.ProjectMediaAnalysis
		if err := tx.Where("project_id = ? AND user_id = ?", projectID, owner).Order("id").Find(&analyses).Error; err != nil {
			return err
		}
		analysisIDs := []string{}
		analysisDocs := []map[string]any{}
		for _, row := range analyses {
			analysisIDs = append(analysisIDs, row.ID)
			analysisDocs = append(analysisDocs, map[string]any{"analysis": row, "source": json.RawMessage(nonemptyDeliveryJSON(row.SourceJSON)), "evidence": json.RawMessage(nonemptyDeliveryJSON(row.EvidenceJSON))})
		}
		if err := save("analyses", analysisDocs); err != nil {
			return err
		}
		var analysisVersions []model.ProjectMediaAnalysisRevision
		if err := tx.Where("analysis_id IN ? AND user_id = ?", analysisIDs, owner).Order("analysis_id, version").Find(&analysisVersions).Error; err != nil {
			return err
		}
		analysisHistory := []map[string]any{}
		for _, row := range analysisVersions {
			analysisHistory = append(analysisHistory, map[string]any{"revision": row, "document": json.RawMessage(row.DocumentJSON)})
		}
		if err := save("analysisHistory", analysisHistory); err != nil {
			return err
		}
		var reviews []model.ProjectReview
		if err := query("reviews", &reviews, "project_id = ?", projectID); err != nil {
			return err
		}
		var comments []model.ProjectReviewComment
		if err := query("reviewComments", &comments, "project_id = ?", projectID); err != nil {
			return err
		}
		reviewDocs := []map[string]any{}
		for _, row := range reviews {
			reviewDocs = append(reviewDocs, map[string]any{"review": row, "source": json.RawMessage(nonemptyDeliveryJSON(row.SourceJSON))})
		}
		if err := save("reviews", reviewDocs); err != nil {
			return err
		}
		var plans []model.ProjectShotPlanRecord
		if err := tx.Where("project_id = ?", projectID).Order("id").Find(&plans).Error; err != nil {
			return err
		}
		planDocs := []map[string]any{}
		for _, row := range plans {
			planDocs = append(planDocs, map[string]any{"record": row, "document": json.RawMessage(row.PayloadJSON)})
		}
		if err := save("shotPlans", planDocs); err != nil {
			return err
		}
		var tasks []model.Task
		scope := append([]string{projectID}, canvasIDs...)
		if err := tx.Select("id, project_id, type, operation, model, prompt, status, result_json, created_at, updated_at").Where("user_id = ? AND project_id IN ?", owner, scope).Order("id").Find(&tasks).Error; err != nil {
			return err
		}
		return save("taskHistory", tasks)
	}, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	return result, err
}

func nonemptyDeliveryJSON(value string) string {
	if value == "" {
		return "{}"
	}
	return value
}
