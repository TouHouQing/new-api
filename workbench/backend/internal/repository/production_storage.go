package repository

import (
	"yingce/backend/internal/model"
)

// Production documents share the existing structured-data quota. Byte length
// uses the database's binary/string byte function, including migration history.
func (r *Repository) productionStructuredBytes(userID string) (int64, error) {
	var total int64
	for _, table := range []struct {
		model   any
		columns []string
	}{
		{&model.Project{}, []string{"creative_brief_json"}},
		{&model.ProjectShotPlanRecord{}, []string{"payload_json", "title", "request_id"}},
		{&model.ProjectTimeline{}, []string{"payload_json"}},
		{&model.ProjectCut{}, []string{"payload_json", "metadata_json"}},
		{&model.ProjectCutApplyReceipt{}, []string{"result_json"}},
		{&model.ProjectReview{}, []string{"title", "source_json"}},
		{&model.ProjectReviewComment{}, []string{"message", "author_name", "resolution_note"}},
		{&model.ProjectReviewReceipt{}, []string{"result_json"}},
		{&model.ProjectReviewShare{}, []string{"token_cipher"}},
		{&model.ProjectTranscriptRevision{}, []string{"document_json"}},
		{&model.ProjectMediaAnalysis{}, []string{"source_json", "evidence_json"}},
		{&model.ProjectMediaAnalysisRevision{}, []string{"document_json"}},
		{&model.ProjectReferenceAdoption{}, []string{"result_json"}},
		{&model.ProductionImport{}, []string{"source_document_json", "resource_refs_json", "report_json", "identity_map_json"}},
	} {
		if !r.db.Migrator().HasTable(table.model) {
			continue
		}
		expression := ""
		for _, column := range table.columns {
			if expression != "" {
				expression += " + "
			}
			if r.Dialect() != "sqlite" {
				expression += "octet_length(COALESCE(" + column + ", ''))"
			} else {
				expression += "length(CAST(COALESCE(" + column + ", '') AS BLOB))"
			}
		}
		var bytes int64
		if err := r.db.Model(table.model).Where("user_id = ?", userID).Select("COALESCE(SUM(" + expression + "), 0)").Scan(&bytes).Error; err != nil {
			return 0, err
		}
		total += bytes
	}
	if r.db.Migrator().HasTable(&model.ShotRevision{}) && r.db.Migrator().HasColumn(&model.ShotRevision{}, "NarrativeJSON") && r.db.Migrator().HasColumn(&model.ShotRevision{}, "ReferenceStatesJSON") {
		expression := "length(CAST(COALESCE(shot_revisions.narrative_json, '') AS BLOB)) + length(CAST(COALESCE(shot_revisions.reference_states_json, '') AS BLOB))"
		if r.Dialect() != "sqlite" {
			expression = "octet_length(COALESCE(shot_revisions.narrative_json, '')) + octet_length(COALESCE(shot_revisions.reference_states_json, ''))"
		}
		var bytes int64
		if err := r.db.Table("shot_revisions").Joins("JOIN shots ON shots.id = shot_revisions.shot_id").Joins("JOIN projects ON projects.id = shots.project_id").Where("projects.user_id = ?", userID).Select("COALESCE(SUM(" + expression + "), 0)").Scan(&bytes).Error; err != nil {
			return 0, err
		}
		total += bytes
	}
	// Only the indexed layer-delivery subset participates in this structured
	// quota path; ordinary task histories remain outside canvas write scans.
	if r.db.Migrator().HasTable(&model.Task{}) && r.db.Migrator().HasColumn(&model.Task{}, "image_layer_delivery_json") {
		expression := "length(CAST(COALESCE(image_layer_delivery_status, '') AS BLOB)) + length(CAST(COALESCE(image_layer_delivery_json, '') AS BLOB))"
		if r.Dialect() != "sqlite" {
			expression = "octet_length(COALESCE(image_layer_delivery_status, '')) + octet_length(COALESCE(image_layer_delivery_json, ''))"
		}
		var bytes int64
		if err := r.db.Model(&model.Task{}).Where("user_id = ? AND image_layer_delivery_status IN ?", userID, []string{"pending", "applied", "detached"}).Select("COALESCE(SUM(" + expression + "), 0)").Scan(&bytes).Error; err != nil {
			return 0, err
		}
		total += bytes
	}
	return total, nil
}
