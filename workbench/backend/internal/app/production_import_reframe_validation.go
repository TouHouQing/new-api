package app

import (
	"encoding/json"
	"yingce/backend/internal/production"
	"yingce/backend/internal/repository"
)

// Preview may validate rows which will only exist inside the eventual import
// transaction. Ordinary timeline writes always resolve through the database.
func (s *Service) projectedLegacyReframeResolver(userID, projectID string, rows *repository.ProductionImportRows) projectReframeResolver {
	return func(analysisID, revisionID string) (ProjectMediaAnalysisView, error) {
		var view ProjectMediaAnalysisView
		for _, row := range rows.MediaAnalyses {
			if row.ID == analysisID && row.UserID == userID && row.ProjectID == projectID && row.Kind == "subject_track" {
				view.Analysis = row
				break
			}
		}
		if view.Analysis.ID == "" {
			return view, BadAuthRequest("待迁入的构图分析不属于当前项目")
		}
		for _, version := range rows.MediaAnalysisRevisions {
			if version.ID == revisionID && version.AnalysisID == analysisID && version.UserID == userID {
				view.CurrentVersion = version
				break
			}
		}
		if view.CurrentVersion.ID == "" || json.Unmarshal([]byte(view.Analysis.SourceJSON), &view.Source) != nil || json.Unmarshal([]byte(view.CurrentVersion.DocumentJSON), &view.Document) != nil {
			return view, BadAuthRequest("待迁入的构图校正版本无效")
		}
		if _, err := production.ValidateMediaAnalysisEdits(view.Source, "subject_track", view.Document); err != nil {
			return view, BadAuthRequest("待迁入的构图来源或校正无效")
		}
		view.Evidence = json.RawMessage(view.Analysis.EvidenceJSON)
		view.IsCurrent = view.CurrentVersion.ID == view.Analysis.CurrentRevisionID
		return view, nil
	}
}
