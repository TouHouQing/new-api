package app

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"testing"
	"time"

	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

func TestResourceCleanupRejectsChangedCandidatesWithoutOutboxOrSourceLoss(t *testing.T) {
	for _, driver := range []string{"sqlite", "postgres"} {
		t.Run(driver, func(t *testing.T) {
			s, db := headlessMediaService(t, driver)
			original, raw := seedImageOperationSource(t, s, db)
			cases := []struct {
				name, field string
				value       any
				pending     bool
			}{
				{"upload-completed", "status", model.ResourceStatusReady, true},
				{"owner", "user_id", "another-owner", false},
				{"provider", "provider", "changed-provider", false},
				{"endpoint", "endpoint", "https://changed.invalid", false},
				{"bucket", "bucket", "changed-bucket", false},
				{"storage-setting", "storage_setting_id", "another-setting", false},
				{"object", "object_key", "changed/original.png", false},
				{"etag", "e_tag", "changed-etag", false},
				{"size", "size", original.Size + 1, false},
				{"mime", "mime_type", "image/webp", false},
				{"kind", "kind", "video", false},
				{"recent-touch", "updated_at", time.Now().Add(time.Second), false},
			}
			for index, test := range cases {
				t.Run(test.name, func(t *testing.T) {
					candidate := *original
					candidate.ID = fmt.Sprintf("cleanup-snapshot-%02d", index)
					candidate.UploadKey = nil
					if test.pending {
						candidate.Status = model.ResourceStatusPending
					}
					if err := db.Create(&candidate).Error; err != nil {
						t.Fatal(err)
					}
					before, err := s.repo.ResourceForUser("image-user", candidate.ID)
					if err != nil {
						t.Fatal(err)
					}
					updates := map[string]any{"updated_at": before.UpdatedAt}
					updates[test.field] = test.value
					if err := db.Model(&model.Resource{}).Where("id = ?", candidate.ID).Updates(updates).Error; err != nil {
						t.Fatal(err)
					}
					job := model.ResourceDeletionJob{ID: fmt.Sprintf("cleanup-snapshot-job-%02d", index), UserID: "image-user", ResourceID: candidate.ID, ObjectKey: before.ObjectKey, Provider: before.Provider}
					if err := s.repo.DeleteDetachedResources([]model.Resource{*before}, []model.ResourceDeletionJob{job}); !errors.Is(err, repository.ErrResourceCleanupSetChanged) {
						t.Fatal("stale snapshot removed changed candidate", err)
					}
					var count int64
					if err := db.Model(&model.Resource{}).Where("id = ?", candidate.ID).Count(&count).Error; err != nil || count != 1 {
						t.Fatal("changed resource lost", count, err)
					}
					if err := db.Model(&model.ResourceDeletionJob{}).Where("id = ?", job.ID).Count(&count).Error; err != nil || count != 0 {
						t.Fatal("stale physical deletion was enqueued", count, err)
					}
					if err := db.Delete(&candidate).Error; err != nil {
						t.Fatal(err)
					}
				})
			}
			_, file, err := s.OpenResource("image-user", original.ID)
			if err != nil {
				t.Fatal(err)
			}
			after, err := io.ReadAll(file)
			file.Close()
			if err != nil || !bytes.Equal(raw, after) {
				t.Fatal("rejected cleanup changed original file", err)
			}
		})
	}
}
