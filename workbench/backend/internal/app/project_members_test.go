package app

import (
	"errors"
	"testing"

	"gorm.io/gorm"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
)

func reviewMemberFixture(t *testing.T, postgres bool) (*Service, *gorm.DB, string) {
	t.Helper()
	var s *Service
	var db *gorm.DB
	if postgres {
		base, pg := newProjectNameConflictPostgresService(t)
		db = pg
		if err := database.MigrateSchema(db); err != nil {
			t.Fatal(err)
		}
		connection, _ := db.DB()
		t.Cleanup(func() { connection.Close() })
		s = New(base.repo, t.TempDir())
		t.Cleanup(func() { s.Close() })
	} else {
		s, db = legacyImportService(t)
	}
	for _, id := range []string{"owner", "other", "stranger"} {
		user := model.User{ID: id, Username: id, Email: id + "@example.invalid", Status: model.UserStatusActive, Role: model.UserRoleUser}
		if err := db.Where("id = ?", id).FirstOrCreate(&user).Error; err != nil {
			t.Fatal(err)
		}
	}
	pid := "native-review-project"
	if err := db.Create(&model.Project{ID: pid, UserID: "owner", Revision: 1, Status: model.ProjectStatusActive, AspectRatio: "16:9"}).Error; err != nil {
		t.Fatal(err)
	}
	return s, db, pid
}

func verifyProjectMemberRevocation(t *testing.T, s *Service, db *gorm.DB, pid string) {
	t.Helper()
	active := true
	request := ProjectMemberRequest{RequestID: "review-member-grant-0001", MemberUserID: "other", Role: "viewer", Active: &active}
	noState := request
	noState.Active = nil
	if _, err := s.SaveProjectMember("owner", pid, noState); err == nil {
		t.Fatal("implicit activation state was accepted")
	}
	if _, err := s.SaveProjectMember("stranger", pid, request); err == nil {
		t.Fatal("stranger granted a project role")
	}
	self := request
	self.MemberUserID = "owner"
	if _, err := s.SaveProjectMember("owner", pid, self); err == nil {
		t.Fatal("owner was demoted through a member record")
	}
	invalid := request
	invalid.Role = "owner"
	if _, err := s.SaveProjectMember("owner", pid, invalid); err == nil {
		t.Fatal("member could become owner")
	}
	result, err := s.SaveProjectMember("owner", pid, request)
	if err != nil || result.Member == nil || !result.Member.Active || result.Member.Revision != 1 {
		t.Fatal("explicit grant failed", result, err)
	}
	project, role, err := s.projectReviewAccess("other", pid)
	if err != nil || role != "viewer" || project.UserID != "owner" {
		t.Fatal("viewer access failed", role, err)
	}
	if err := requireReviewWrite(project, role, false); err == nil {
		t.Fatal("viewer could write feedback")
	}
	if _, err := s.ListProjectMembers("other", pid); err == nil {
		t.Fatal("viewer could enumerate project membership")
	}
	upgrade := request
	upgrade.RequestID = "review-member-upgrade-0001"
	upgrade.ExpectedRevision = 1
	upgrade.Role = "reviewer"
	if _, err = s.SaveProjectMember("owner", pid, upgrade); err != nil {
		t.Fatal(err)
	}
	old, err := s.SaveProjectMember("owner", pid, request)
	if err != nil || !old.Replayed || old.Member.Revision != 1 {
		t.Fatal("unknown reply was not replayed", old, err)
	}
	project, role, err = s.projectReviewAccess("other", pid)
	if err != nil || role != "reviewer" {
		t.Fatal("replay overwrote later grant", role, err)
	}
	if err = requireReviewWrite(project, role, false); err != nil {
		t.Fatal("reviewer cannot comment", err)
	}
	if err = requireReviewWrite(project, role, true); err == nil {
		t.Fatal("reviewer can manage owner permissions")
	}
	revoke := upgrade
	revoke.RequestID = "review-member-revoke-0001"
	revoke.ExpectedRevision = 2
	disabled := false
	revoke.Active = &disabled
	if _, err = s.SaveProjectMember("owner", pid, revoke); err != nil {
		t.Fatal(err)
	}
	if _, _, err = s.projectReviewAccess("other", pid); err == nil {
		t.Fatal("revoked member retained access")
	}
	if _, err = s.SaveProjectMember("owner", pid, request); err != nil {
		t.Fatal("receipt recovery failed", err)
	}
	if _, _, err = s.projectReviewAccess("other", pid); err == nil {
		t.Fatal("old receipt reactivated revoked access")
	}
	changed := request
	changed.Role = "editor"
	if _, err = s.SaveProjectMember("owner", pid, changed); err == nil {
		t.Fatal("one request id changed its meaning")
	}
	var receipts int64
	db.Model(&model.ProjectReviewReceipt{}).Where("project_id = ?", pid).Count(&receipts)
	if receipts != 3 {
		t.Fatal("duplicate or missing receipts", receipts)
	}
	if err = db.Model(&model.User{}).Where("id = ?", "owner").UpdateColumn("status", model.UserStatusDisabled).Error; err != nil {
		t.Fatal(err)
	}
	if _, _, err = s.projectReviewAccess("owner", pid); err == nil {
		t.Fatal("disabled owner retained service-level review access")
	}
}

func TestProjectReviewMembersExplicitGrantsRevocationAndReceiptRecovery(t *testing.T) {
	s, db, pid := reviewMemberFixture(t, false)
	verifyProjectMemberRevocation(t, s, db, pid)
}
func TestProjectReviewMembersPostgresExplicitGrantsRevocationAndReceiptRecovery(t *testing.T) {
	s, db, pid := reviewMemberFixture(t, true)
	verifyProjectMemberRevocation(t, s, db, pid)
}
func TestProjectReviewMembersPostgresConcurrentGrantHasOneCommit(t *testing.T) {
	s, db, pid := reviewMemberFixture(t, true)
	other := New(s.repo, t.TempDir())
	t.Cleanup(func() { other.Close() })
	active := true
	requests := []ProjectMemberRequest{{RequestID: "parallel-member-one-0001", MemberUserID: "other", Role: "reviewer", Active: &active}, {RequestID: "parallel-member-two-0001", MemberUserID: "other", Role: "viewer", Active: &active}}
	results := make(chan error, 2)
	start := make(chan struct{})
	for index, svc := range []*Service{s, other} {
		go func(index int, svc *Service) {
			<-start
			_, err := svc.SaveProjectMember("owner", pid, requests[index])
			results <- err
		}(index, svc)
	}
	close(start)
	successes, conflicts := 0, 0
	for range 2 {
		err := <-results
		if err == nil {
			successes++
			continue
		}
		var issue *AppError
		if errors.As(err, &issue) && issue.Status == 409 {
			conflicts++
		} else {
			t.Fatal("concurrent grant returned an unclassified failure", err)
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatal("concurrent grants changed access twice", successes, conflicts)
	}
	var count int64
	db.Model(&model.ProjectMember{}).Where("project_id = ?", pid).Count(&count)
	if count != 1 {
		t.Fatal("duplicate grants", count)
	}
	db.Model(&model.ProjectReviewReceipt{}).Where("project_id = ?", pid).Count(&count)
	if count != 1 {
		t.Fatal("partial or duplicate receipt", count)
	}
}
