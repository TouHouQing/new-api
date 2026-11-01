package main

import (
	"testing"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
)

func TestIntroducedReviewTablesCopyImmutableSourcesAndRejectMissingClaimedSchema(t *testing.T) {
	withMigrationTargets(t, func(t *testing.T, target *gorm.DB) {
		source, err := gorm.Open(sqlite.Open("file:"+t.TempDir()+"/reviews.db"), &gorm.Config{})
		if err != nil {
			t.Fatal(err)
		}
		connection, _ := source.DB()
		t.Cleanup(func() { connection.Close() })
		for _, db := range []*gorm.DB{source, target} {
			if err = database.MigrateSchema(db); err != nil {
				t.Fatal(err)
			}
		}
		now := time.Now().UTC().Truncate(time.Microsecond)
		rows := []struct {
			value     any
			migration tableMigration
		}{
			{&model.ProjectMember{ID: "member", UserID: "owner", ProjectID: "project", MemberUserID: "collaborator", Role: "reviewer", Active: true, Revision: 3, CreatedAt: now, UpdatedAt: now}, migrateIntroducedTable[model.ProjectMember]("project_members", 68)},
			{&model.ProjectReview{ID: "review", UserID: "owner", ProjectID: "project", Title: "原片", TargetKind: "asset", TargetSHA256: "source-digest", SourceJSON: `{"version":1,"resourceId":"original"}`, ResourceID: "original", ResourceSHA256: "original-digest", ResourceKind: "image", Status: "in_review", Revision: 2, CreatedBy: "owner", CreatedAt: now, UpdatedAt: now}, migrateIntroducedTable[model.ProjectReview]("project_reviews", 68)},
			{&model.ProjectReviewComment{ID: "comment", UserID: "owner", ProjectID: "project", ReviewID: "review", AuthorUserID: "collaborator", AuthorName: "审片者", Message: "原片意见", Blocking: true, AssignedUserID: "owner", Revision: 1, CreatedAt: now, UpdatedAt: now}, migrateIntroducedTable[model.ProjectReviewComment]("project_review_comments", 68)},
			{&model.ProjectReviewShare{ID: "share", UserID: "owner", ProjectID: "project", ReviewID: "review", TokenHash: "hash-only", TokenCipher: "encrypted-fixture-not-a-credential", AllowComments: true, Active: true, Revision: 1, ExpiresAt: now.Add(time.Hour), CreatedAt: now, UpdatedAt: now}, migrateIntroducedTable[model.ProjectReviewShare]("project_review_shares", 68)},
			{&model.ProjectReviewReceipt{ID: "receipt", UserID: "owner", ProjectID: "project", ActorKey: "user:owner", RequestID: "original-review-operation", RequestSHA256: "request-digest", Kind: "review-create", ReviewID: "review", ResultJSON: `{"kind":"review-create","review":{"id":"review"}}`, CreatedAt: now}, migrateIntroducedTable[model.ProjectReviewReceipt]("project_review_receipts", 68)},
		}
		for _, row := range rows {
			if err = source.Create(row.value).Error; err != nil {
				t.Fatal(err)
			}
			if count, err := row.migration.run(source, target, true); err != nil || count != 1 {
				t.Fatal("copy review table", count, err)
			}
			if count, err := row.migration.run(source, target, false); err != nil || count != 1 {
				t.Fatal("verify review table", count, err)
			}
			if err = source.Migrator().DropTable(row.value); err != nil {
				t.Fatal(err)
			}
			if _, err = row.migration.run(source, target, false); err == nil {
				t.Fatal("missing claimed schema68 review table ignored")
			}
		}
		if err = source.Exec("DELETE FROM schema_migrations WHERE version >= 68").Error; err != nil {
			t.Fatal(err)
		}
		for _, row := range rows {
			if _, err = row.migration.run(source, target, false); err == nil {
				t.Fatal("old source accepted unexpected target review rows")
			}
			if err = target.Where("project_id = ?", "project").Delete(row.value).Error; err != nil {
				t.Fatal(err)
			}
			if count, err := row.migration.run(source, target, false); err != nil || count != 0 {
				t.Fatal("old schema67 empty table handling", count, err)
			}
		}
	})
}
