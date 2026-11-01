package app

import "strings"

func (s *Service) withTaskCanvasContexts(userID string, summaries []TaskSummary) ([]TaskSummary, error) {
	ids := make([]string, 0, len(summaries))
	seen := make(map[string]bool)
	for _, summary := range summaries {
		if summary.ProjectID != "" && !seen[summary.ProjectID] {
			seen[summary.ProjectID] = true
			ids = append(ids, summary.ProjectID)
		}
	}
	labels, err := s.repo.CanvasProjectLabelsForUser(userID, ids)
	if err != nil {
		return nil, err
	}
	for index := range summaries {
		summary := &summaries[index]
		if label, found := labels[summary.ProjectID]; found {
			summary.CanvasContext = &TaskCanvasContext{Status: "available", Title: label.Title, ProjectID: label.ProjectID}
		} else if summary.ProjectID != "" && (strings.HasPrefix(summary.Type, "canvas_") || summary.Type == "image_operation") {
			// A missing owned row also covers revoked/foreign access; it does not
			// prove that somebody deleted the canvas.
			summary.CanvasContext = &TaskCanvasContext{Status: "unavailable"}
		}
	}
	return summaries, nil
}
