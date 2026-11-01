package app

import "yingce/backend/internal/production"

type ProjectTranscriptSuggestions struct {
	TranscriptID string                            `json:"transcriptId"`
	RevisionID   string                            `json:"revisionId"`
	Method       string                            `json:"method"`
	Suggestions  []production.TranscriptSuggestion `json:"suggestions"`
}

func (s *Service) GetProjectTranscriptSuggestions(userID, projectID, id, revisionID string) (ProjectTranscriptSuggestions, error) {
	var view ProjectTranscriptView
	var err error
	if len(revisionID) > 80 {
		return ProjectTranscriptSuggestions{}, BadAuthRequest("文字稿版本无效")
	}
	if revisionID == "" {
		view, err = s.GetProjectTranscript(userID, projectID, id)
	} else {
		view, err = s.GetProjectTranscriptVersion(userID, projectID, id, revisionID)
	}
	if err != nil {
		return ProjectTranscriptSuggestions{}, err
	}
	hints, err := production.SuggestTranscript(view.Document)
	if err != nil {
		return ProjectTranscriptSuggestions{}, err
	}
	return ProjectTranscriptSuggestions{TranscriptID: id, RevisionID: view.CurrentVersion.ID, Method: "review_rules", Suggestions: hints}, nil
}
