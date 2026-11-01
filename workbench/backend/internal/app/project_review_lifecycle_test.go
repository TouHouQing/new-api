package app

import (
	"strings"
	"testing"
	"yingce/backend/internal/model"
)

func TestProjectReviewLifecycleDeletesOnlyAuthorizedProjectRecordsAndRetainsMedia(t *testing.T) {
	for _, postgres := range []bool{false, true} {
		name := "sqlite"
		if postgres {
			name = "postgres"
		}
		t.Run(name, func(t *testing.T) {
			s, db, pid := reviewMemberFixture(t, postgres)
			view := reviewWithParticipants(t, s, db, pid)
			share, err := s.CreateProjectReviewShare("owner", pid, view.Review.ID, ProjectReviewShareRequest{RequestID: "lifecycle-review-share-0001", AllowComments: true, ExpiresDays: 1})
			if err != nil {
				t.Fatal(err)
			}
			link, err := s.ReviewShareWriteLink("owner", pid, share)
			if err != nil {
				t.Fatal(err)
			}
			token := strings.Split(link.URL, "#token=")[1]
			if _, err = s.AddProjectReviewComment("other", pid, view.Review.ID, ProjectReviewCommentRequest{RequestID: "lifecycle-review-comment-0001", TargetSHA256: view.Review.TargetSHA256, Message: "保留原始意见", Blocking: true}); err != nil {
				t.Fatal(err)
			}
			if err = s.DeleteProject("other", pid); err == nil {
				t.Fatal("review role deleted owner project")
			}
			if _, err = s.PublicProjectReview(share.Share.ID, token); err != nil {
				t.Fatal("denied deletion damaged share", err)
			}
			if err = s.DeleteProject("owner", pid); err != nil {
				t.Fatal(err)
			}
			for _, table := range []any{&model.ProjectMember{}, &model.ProjectReview{}, &model.ProjectReviewComment{}, &model.ProjectReviewShare{}, &model.ProjectReviewReceipt{}} {
				var count int64
				if err = db.Model(table).Where("project_id = ?", pid).Count(&count).Error; err != nil || count != 0 {
					t.Fatal("orphaned project review data", count, err)
				}
			}
			if _, err = s.PublicProjectReview(share.Share.ID, token); err == nil {
				t.Fatal("deleted project remained shareable")
			}
			if _, err = s.ReadProjectReview("other", view.Review.ID); err == nil {
				t.Fatal("deleted review remained accessible")
			}
			if _, err = s.repo.ResourceForUser("owner", view.Review.ResourceID); err != nil {
				t.Fatal("project deletion removed independent original media", err)
			}
		})
	}
}
