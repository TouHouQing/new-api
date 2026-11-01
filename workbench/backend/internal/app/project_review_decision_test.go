package app

import "testing"

func TestProjectReviewChangeDecisionCreatesVisibleBlockingFeedbackAndReplaysOnce(t *testing.T) {
	s, db, pid := reviewMemberFixture(t, false)
	view := reviewWithParticipants(t, s, db, pid)
	status := "changes_requested"
	input := ProjectReviewStateRequest{RequestID: "review-decision-note-0001", ExpectedRevision: view.Review.Revision, Status: &status, Note: "人物表情需要自然，按这个要求重新检查"}
	result, err := s.SetProjectReviewState("other", pid, view.Review.ID, input)
	if err != nil || result.Comment == nil || !result.Comment.Blocking || result.Comment.Resolved {
		t.Fatal("change request lost actionable feedback", result, err)
	}
	page, err := s.ListProjectReviewComments("stranger", pid, view.Review.ID, "", 20)
	if err != nil || len(page.Comments) != 1 || page.Comments[0].Message != input.Note || page.Comments[0].AuthorUserID != "other" {
		t.Fatal("collaborators cannot read decision reason", page, err)
	}
	replayed, err := s.SetProjectReviewState("other", pid, view.Review.ID, input)
	if err != nil || !replayed.Replayed || replayed.Comment.ID != result.Comment.ID {
		t.Fatal("duplicate decision feedback", replayed, err)
	}
	live, err := s.GetProjectReview("owner", pid, view.Review.ID)
	if err != nil || live.OpenIssues != 1 {
		t.Fatal("decision failed to gate approval", live, err)
	}
	approved := "approved"
	if _, err = s.SetProjectReviewState("owner", pid, view.Review.ID, ProjectReviewStateRequest{RequestID: "review-decision-approve-0001", ExpectedRevision: live.Review.Revision, Status: &approved}); err == nil {
		t.Fatal("change request approved without handling feedback")
	}
}
