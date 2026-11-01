package app

import (
	"bytes"
	"errors"
	"testing"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
)

func reviewWithParticipants(t *testing.T, s *Service, db *gorm.DB, pid string) ProjectReviewView {
	t.Helper()
	target, _, _ := reviewImageFixture(t, s, db, pid)
	created, err := s.CreateProjectReview("owner", pid, ProjectReviewCreateRequest{RequestID: "comment-review-create-0001", Title: "固定角色审片", Target: target})
	if err != nil {
		t.Fatal(err)
	}
	active := true
	for _, member := range []struct{ id, role string }{{"other", "reviewer"}, {"stranger", "viewer"}} {
		if _, err = s.SaveProjectMember("owner", pid, ProjectMemberRequest{RequestID: "comment-member-" + member.id + "-0001", MemberUserID: member.id, Role: member.role, Active: &active}); err != nil {
			t.Fatal(err)
		}
	}
	view, err := s.GetProjectReview("owner", pid, created.Review.ID)
	if err != nil {
		t.Fatal(err)
	}
	return view
}

func verifyReviewCommentWorkflow(t *testing.T, s *Service, db *gorm.DB, pid string) {
	t.Helper()
	view := reviewWithParticipants(t, s, db, pid)
	rid := view.Review.ID
	input := ProjectReviewCommentRequest{RequestID: "native-review-comment-0001", TargetSHA256: view.Review.TargetSHA256, Message: "角色脸部需要保持一致", Blocking: true}
	if _, err := s.AddProjectReviewComment("stranger", pid, rid, input); err == nil {
		t.Fatal("viewer could comment")
	}
	wrong := input
	wrong.TargetSHA256 = "incorrect"
	if _, err := s.AddProjectReviewComment("other", pid, rid, wrong); err == nil {
		t.Fatal("unbound comment accepted")
	}
	created, err := s.AddProjectReviewComment("other", pid, rid, input)
	if err != nil {
		t.Fatal(err)
	}
	comment := created.Comment
	live, err := s.GetProjectReview("owner", pid, rid)
	if err != nil || live.Review.Revision != 2 || live.Review.Status != "changes_requested" || live.OpenIssues != 1 {
		t.Fatal("feedback did not enter the review state", live, err)
	}
	approve := "approved"
	approveInput := ProjectReviewStateRequest{RequestID: "review-denied-approval-0001", ExpectedRevision: live.Review.Revision, Status: &approve}
	if _, err = s.SetProjectReviewState("other", pid, rid, approveInput); err == nil {
		t.Fatal("unresolved issue was approved")
	}
	text := "替别人改写的意见"
	if _, err = s.PatchProjectReviewComment("owner", pid, rid, comment.ID, ProjectReviewCommentPatch{RequestID: "deny-author-edit-0001", ExpectedRevision: 1, TargetSHA256: view.Review.TargetSHA256, Message: &text}); err == nil {
		t.Fatal("owner could replace another person's words")
	}
	viewer := "stranger"
	if _, err = s.PatchProjectReviewComment("owner", pid, rid, comment.ID, ProjectReviewCommentPatch{RequestID: "deny-viewer-assignment-0001", ExpectedRevision: 1, TargetSHA256: view.Review.TargetSHA256, AssignedUserID: &viewer}); err == nil {
		t.Fatal("viewer could receive a rework assignment")
	}
	owner := "owner"
	assigned, err := s.PatchProjectReviewComment("owner", pid, rid, comment.ID, ProjectReviewCommentPatch{RequestID: "review-assign-owner-0001", ExpectedRevision: 1, TargetSHA256: view.Review.TargetSHA256, AssignedUserID: &owner})
	if err != nil || assigned.Comment.AssignedUserID != "owner" {
		t.Fatal("assignment", assigned, err)
	}
	resolved := true
	patch := ProjectReviewCommentPatch{RequestID: "review-issue-resolution-0001", ExpectedRevision: assigned.Comment.Revision, TargetSHA256: view.Review.TargetSHA256, Resolved: &resolved, ResolutionKind: "acknowledged"}
	if _, err = s.PatchProjectReviewComment("other", pid, rid, comment.ID, patch); err == nil {
		t.Fatal("blocking issue was marked only as read")
	}
	patch.ResolutionKind = "dismissed"
	patch.ResolutionNote = "已逐帧检查，当前角色外观符合设定，维持这一版"
	changed, err := s.PatchProjectReviewComment("other", pid, rid, comment.ID, patch)
	if err != nil || !changed.Comment.Resolved || changed.BeforeComment.Resolved {
		t.Fatal("explicit disposition and before record", changed, err)
	}
	live, err = s.GetProjectReview("owner", pid, rid)
	if err != nil || live.OpenIssues != 0 || live.Review.Status != "changes_requested" {
		t.Fatal("resolution falsely approved media", live, err)
	}
	approveInput.RequestID = "review-confirm-approval-0001"
	approveInput.ExpectedRevision = live.Review.Revision
	accepted, err := s.SetProjectReviewState("other", pid, rid, approveInput)
	if err != nil || accepted.Review.Status != "approved" {
		t.Fatal("explicit reviewer approval", accepted, err)
	}
	next := input
	next.RequestID = "native-review-comment-0002"
	next.Message = "还有一个需要修改的问题"
	if _, err = s.AddProjectReviewComment("other", pid, rid, next); err != nil {
		t.Fatal(err)
	}
	old, err := s.SetProjectReviewState("other", pid, rid, approveInput)
	if err != nil || !old.Replayed {
		t.Fatal("old approval receipt", old, err)
	}
	live, err = s.GetProjectReview("owner", pid, rid)
	if err != nil || live.Review.Status != "changes_requested" || live.OpenIssues != 1 {
		t.Fatal("old approval replay erased later feedback", live, err)
	}
	replay, err := s.AddProjectReviewComment("other", pid, rid, input)
	if err != nil || !replay.Replayed || replay.Comment.ID != comment.ID {
		t.Fatal("comment response recovery duplicated feedback", replay, err)
	}
	page, err := s.ListProjectReviewComments("stranger", pid, rid, "", 20)
	if err != nil || len(page.Comments) != 2 {
		t.Fatal("read-only feedback list", page, err)
	}
	if _, err = s.PatchProjectReviewComment("other", pid, rid, comment.ID, ProjectReviewCommentPatch{RequestID: "review-stale-edit-0001", ExpectedRevision: 1, TargetSHA256: view.Review.TargetSHA256, Message: &text}); err == nil {
		t.Fatal("stale edit overwrote assignment and disposition")
	}
}

func TestProjectReviewCommentsAssignmentsApprovalAndUnknownReplyRecovery(t *testing.T) {
	s, db, pid := reviewMemberFixture(t, false)
	verifyReviewCommentWorkflow(t, s, db, pid)
}
func TestProjectReviewCommentsPostgresAssignmentsApprovalAndUnknownReplyRecovery(t *testing.T) {
	s, db, pid := reviewMemberFixture(t, true)
	verifyReviewCommentWorkflow(t, s, db, pid)
}

func TestProjectReviewFixRequiresChangedMediaAndApprovalOfTheNewRound(t *testing.T) {
	s, db, pid := reviewMemberFixture(t, false)
	view := reviewWithParticipants(t, s, db, pid)
	comment, err := s.AddProjectReviewComment("other", pid, view.Review.ID, ProjectReviewCommentRequest{RequestID: "rework-comment-0001", TargetSHA256: view.Review.TargetSHA256, Message: "更换角色参考图", Blocking: true})
	if err != nil {
		t.Fatal(err)
	}
	target := ProjectReviewTargetRequest{Kind: "asset", AssetVersionID: view.Source.AssetVersionID, RepresentationID: view.Source.RepresentationID}
	unchanged, err := s.CreateProjectReview("owner", pid, ProjectReviewCreateRequest{RequestID: "rework-unchanged-0001", Title: "同原片复审", ParentReviewID: view.Review.ID, Target: target})
	if err != nil {
		t.Fatal(err)
	}
	done := true
	patch := ProjectReviewCommentPatch{RequestID: "rework-fixed-0001", ExpectedRevision: comment.Comment.Revision, TargetSHA256: view.Review.TargetSHA256, Resolved: &done, ResolutionKind: "fixed", ResolutionReviewID: unchanged.Review.ID}
	if _, err = s.PatchProjectReviewComment("owner", pid, view.Review.ID, comment.Comment.ID, patch); err == nil {
		t.Fatal("unchanged bytes were claimed as a repaired version")
	}
	// The second valid PNG changes actual source bytes while preserving an
	// explicit native version/representation; no generation model is involved.
	_, pngBytes := legacyImportArchive(t)
	resource, err := s.UploadResourceFile("owner", "repaired-reference.png", int64(len(pngBytes)), "image", 4, 4, 0, bytes.NewReader(pngBytes))
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	version := model.AssetVersion{ID: "review-character-v2", AssetID: view.Source.AssetID, Version: 2, Status: model.AssetVersionStatusReview, DefinitionJSON: `{}`, CreatedAt: now, UpdatedAt: now}
	representation := model.AssetRepresentation{ID: "review-representation-v2", AssetVersionID: version.ID, ResourceID: resource.ID, MediaType: "image", Role: "primary", CreatedAt: now}
	if err = db.Create(&version).Error; err != nil {
		t.Fatal(err)
	}
	if err = db.Omit("TaskID").Create(&representation).Error; err != nil {
		t.Fatal(err)
	}
	fixed, err := s.CreateProjectReview("owner", pid, ProjectReviewCreateRequest{RequestID: "rework-changed-0001", Title: "修复版本复审", ParentReviewID: view.Review.ID, Target: ProjectReviewTargetRequest{Kind: "asset", AssetVersionID: version.ID, RepresentationID: representation.ID}})
	if err != nil {
		t.Fatal(err)
	}
	patch.ResolutionReviewID = fixed.Review.ID
	result, err := s.PatchProjectReviewComment("owner", pid, view.Review.ID, comment.Comment.ID, patch)
	if err != nil || result.Comment.ResolutionReviewID != fixed.Review.ID {
		t.Fatal("repair version did not link to feedback", result, err)
	}
	old, err := s.GetProjectReview("owner", pid, view.Review.ID)
	if err != nil || old.OpenIssues != 0 || old.CanDecide {
		t.Fatal("old round did not point to re-review", old, err)
	}
	approved := "approved"
	if _, err = s.SetProjectReviewState("other", pid, old.Review.ID, ProjectReviewStateRequest{RequestID: "rework-deny-old-approval-0001", ExpectedRevision: old.Review.Revision, Status: &approved}); err == nil {
		t.Fatal("old original was approved after a fix in a different file")
	}
	current, err := s.GetProjectReview("owner", pid, fixed.Review.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.SetProjectReviewState("other", pid, fixed.Review.ID, ProjectReviewStateRequest{RequestID: "rework-new-approval-0001", ExpectedRevision: current.Review.Revision, Status: &approved}); err != nil {
		t.Fatal("new round cannot be approved explicitly", err)
	}
}

func TestProjectReviewCommentsPostgresConcurrentAppendAndApprovalCannotLoseAnIssue(t *testing.T) {
	s, db, pid := reviewMemberFixture(t, true)
	view := reviewWithParticipants(t, s, db, pid)
	second := New(s.repo, t.TempDir())
	t.Cleanup(func() { second.Close() })
	inputs := []ProjectReviewCommentRequest{{RequestID: "parallel-comment-one-0001", TargetSHA256: view.Review.TargetSHA256, Message: "第一个问题", Blocking: true}, {RequestID: "parallel-comment-two-0001", TargetSHA256: view.Review.TargetSHA256, Message: "第二个问题", Blocking: true}}
	output := make(chan error, 2)
	start := make(chan struct{})
	for index, svc := range []*Service{s, second} {
		go func(index int, svc *Service) {
			<-start
			_, err := svc.AddProjectReviewComment("other", pid, view.Review.ID, inputs[index])
			output <- err
		}(index, svc)
	}
	close(start)
	for range 2 {
		if err := <-output; err != nil {
			t.Fatal("concurrent append lost feedback", err)
		}
	}
	live, err := s.GetProjectReview("owner", pid, view.Review.ID)
	if err != nil || live.OpenIssues != 2 || live.Review.Revision != 3 {
		t.Fatal("concurrent append count", live, err)
	}
	approved := "approved"
	_, err = s.SetProjectReviewState("owner", pid, view.Review.ID, ProjectReviewStateRequest{RequestID: "parallel-deny-approval-0001", ExpectedRevision: live.Review.Revision, Status: &approved})
	var problem *AppError
	if !errors.As(err, &problem) || problem.Reason != "project_review_open_issues" {
		t.Fatal("concurrent issues were approvable", err)
	}
}
