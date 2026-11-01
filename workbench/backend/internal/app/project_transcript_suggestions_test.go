package app

import (
	"testing"
	"yingce/backend/internal/production"
)

func TestTranscriptSuggestionsRespectOwnershipAndSpecificSavedVersion(t *testing.T) {
	svc, db := legacyImportService(t)
	project, view, _ := seedTranscriptCutService(t, svc, db)
	original, err := svc.GetProjectTranscriptSuggestions("owner", project, view.Transcript.ID, view.CurrentVersion.ID)
	if err != nil || original.Method != "review_rules" || original.Suggestions == nil || len(original.Suggestions) != 0 {
		t.Fatalf("invalid initial hints: %+v %v", original, err)
	}
	text := view.Document.Segments[0].Text
	expected := view.Transcript.Revision
	updated, err := svc.UpdateProjectTranscript("owner", project, view.Transcript.ID, ProjectTranscriptWriteRequest{ExpectedRevision: &expected, Changes: []production.TranscriptCorrection{{ID: "s-000002", Text: &text}}})
	if err != nil {
		t.Fatal(err)
	}
	current, err := svc.GetProjectTranscriptSuggestions("owner", project, view.Transcript.ID, "")
	if err != nil || current.RevisionID != updated.CurrentVersion.ID || len(current.Suggestions) != 1 || current.Suggestions[0].Kind != "repeat" {
		t.Fatalf("new version not checked: %+v %v", current, err)
	}
	old, err := svc.GetProjectTranscriptSuggestions("owner", project, view.Transcript.ID, view.CurrentVersion.ID)
	if err != nil || len(old.Suggestions) != 0 {
		t.Fatal("immutable old hints changed")
	}
	for _, request := range [][3]string{{"other", project, view.CurrentVersion.ID}, {"owner", "other-project", view.CurrentVersion.ID}, {"owner", project, "foreign-version"}} {
		if _, err := svc.GetProjectTranscriptSuggestions(request[0], request[1], view.Transcript.ID, request[2]); err == nil {
			t.Fatal("foreign transcript or version exposed")
		}
	}
}
