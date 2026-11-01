package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
	"yingce/backend/internal/repository"
)

// The deletion controller has the storage lock while an edit is still reading
// its preview. It removes an unreferenced source before the editor can acquire
// that lock. Committing a new reference after that point must be rejected.
func TestTimelineEditsRejectSourceRemovedWhileWaitingForStorageLock(t *testing.T) {
	for _, driver := range []string{"sqlite", "postgres"} {
		t.Run(driver, func(t *testing.T) {
			s, db := headlessMediaService(t, driver)
			resource, _ := seedImageOperationSource(t, s, db)
			project, err := s.CreateProject("image-user", CreateProjectRequest{Name: "并发删除与剪辑保存"})
			if err != nil {
				t.Fatal(err)
			}
			baseline, err := s.SaveProjectTimeline("image-user", project.ID, SaveProjectTimelineRequest{Timeline: json.RawMessage(`{"version":2,"tracks":[],"clips":[],"durationMs":0}`)})
			if err != nil {
				t.Fatal(err)
			}
			input := TimelineEditRequest{RequestID: "source-deleted-before-edit-commit-0001", ExpectedRevision: baseline.Revision, Commands: []production.TimelineEditCommand{{Op: "addResource", ResourceID: resource.ID}}}
			plan, err := s.PreviewTimelineEdits("image-user", project.ID, input)
			if err != nil {
				t.Fatal(err)
			}
			input.PreviewToken = plan.PreviewToken
			var observedSource atomic.Bool
			ready := make(chan struct{})
			var once sync.Once
			const callback = "source-removal-after-native-edit-preview"
			if err := db.Callback().Query().After("gorm:query").Register(callback, func(tx *gorm.DB) {
				if row, ok := tx.Statement.Dest.(*model.Resource); ok && row.ID == resource.ID && row.Status == model.ResourceStatusReady {
					observedSource.Store(true)
				}
				if row, ok := tx.Statement.Dest.(*model.ProjectTimeline); ok && row.ProjectID == project.ID && observedSource.Load() {
					once.Do(func() { close(ready) })
				}
			}); err != nil {
				t.Fatal(err)
			}
			defer db.Callback().Query().Remove(callback)
			s.storageMu.Lock()
			locked := true
			done := make(chan error, 1)
			defer func() {
				if locked {
					s.storageMu.Unlock()
				}
			}()
			go func() { _, e := s.ApplyTimelineEdits("image-user", project.ID, input); done <- e }()
			select {
			case <-ready:
			case <-time.After(10 * time.Second):
				s.storageMu.Unlock()
				locked = false
				select {
				case <-done:
				case <-time.After(10 * time.Second):
				}
				t.Fatal("edit did not reach the observed source/working-cut boundary")
			}
			if err := s.repo.DeleteDetachedResources([]model.Resource{*resource}, nil); err != nil {
				s.storageMu.Unlock()
				locked = false
				<-done
				t.Fatal(err)
			}
			if _, removed := s.repo.ResourceForUser("image-user", resource.ID); !errors.Is(removed, gorm.ErrRecordNotFound) {
				s.storageMu.Unlock()
				locked = false
				<-done
				t.Fatal("test source was not actually removed", removed)
			}
			s.storageMu.Unlock()
			locked = false
			select {
			case err = <-done:
			case <-time.After(10 * time.Second):
				t.Fatal("edit did not finish after storage lock release")
			}
			if err == nil {
				t.Fatal("native edit committed a new reference after its source was removed")
			}
			var conflict *AppError
			if !errors.As(err, &conflict) || conflict.Status != 409 || conflict.Reason != "timeline_resource_changed" {
				t.Fatal("source removal did not return an actionable conflict", err)
			}
			current, e := s.GetProjectTimeline("image-user", project.ID)
			if e != nil || current.Revision != baseline.Revision || string(current.Timeline) != string(baseline.Timeline) {
				t.Fatal("rejected edit changed working timeline", e)
			}
			var count int64
			db.Model(&model.ProjectCut{}).Where("project_id = ?", project.ID).Count(&count)
			if count != 0 {
				t.Fatal("rejected edit saved partial cuts", count)
			}
		})
	}
}

func TestProjectTimelineAndCutTransactionsRejectUnavailableSources(t *testing.T) {
	for _, driver := range []string{"sqlite", "postgres"} {
		t.Run(driver, func(t *testing.T) {
			s, db := headlessMediaService(t, driver)
			resource, _ := seedImageOperationSource(t, s, db)
			project, err := s.CreateProject("image-user", CreateProjectRequest{Name: "资源归属原子检查"})
			if err != nil {
				t.Fatal(err)
			}
			baseline, err := s.repo.SaveProjectTimeline("image-user", project.ID, `{"version":2,"tracks":[],"clips":[],"durationMs":0}`, 0)
			if err != nil {
				t.Fatal(err)
			}
			payload := fmt.Sprintf(`{"clips":[{"directMedia":{"storageKey":"resource:%s"}}]}`, resource.ID)
			for _, state := range []string{"pending", "foreign", "removed"} {
				t.Run(state, func(t *testing.T) {
					if state == "removed" {
						if err := db.Delete(resource).Error; err != nil {
							t.Fatal(err)
						}
					} else {
						owner, status := "image-user", "pending"
						if state == "foreign" {
							owner, status = "other-user", "ready"
						}
						if err := db.Model(resource).Updates(map[string]any{"user_id": owner, "status": status}).Error; err != nil {
							t.Fatal(err)
						}
					}
					cut := model.ProjectCut{ID: "reject-cut", UserID: "image-user", ProjectID: project.ID, RequestID: "reject-cut", PayloadJSON: payload}
					backup := model.ProjectCut{ID: "reject-backup", UserID: "image-user", ProjectID: project.ID, RequestID: "reject-backup", PayloadJSON: baseline.PayloadJSON}
					receipt := model.ProjectCutApplyReceipt{ID: "reject-receipt", UserID: "image-user", ProjectID: project.ID, RequestID: "reject-receipt"}
					checks := []func() error{
						func() error {
							_, e := s.repo.SaveProjectTimeline("image-user", project.ID, payload, baseline.Revision)
							return e
						},
						func() error { return s.repo.CreateProjectCut(&cut, baseline.Revision, nil, nil) },
						func() error { return s.repo.ApplyTimelineEditCut(&cut, baseline.Revision, &backup, &receipt) },
						func() error { return s.repo.ApplyProjectCut(&cut, baseline.Revision, &backup, &receipt) },
					}
					for i, check := range checks {
						if e := check(); !errors.Is(e, repository.ErrTimelineResourceChanged) {
							t.Fatalf("write %d allowed %s source: %v", i, state, e)
						}
					}
					current, e := s.repo.ProjectTimeline("image-user", project.ID)
					if e != nil || current.Revision != baseline.Revision || current.PayloadJSON != baseline.PayloadJSON {
						t.Fatal("rejected transaction changed working cut", e)
					}
					for _, table := range []any{&model.ProjectCut{}, &model.ProjectCutApplyReceipt{}} {
						var count int64
						if e := db.Model(table).Where("project_id = ?", project.ID).Count(&count).Error; e != nil || count != 0 {
							t.Fatal("rejected transaction left partial records", count, e)
						}
					}
				})
			}
		})
	}
}

func TestProjectTimelineResourceCleanupProtectsNativeDocuments(t *testing.T) {
	for _, driver := range []string{"sqlite", "postgres"} {
		t.Run(driver, func(t *testing.T) {
			s, db := headlessMediaService(t, driver)
			resource, _ := seedImageOperationSource(t, s, db)
			project, err := s.CreateProject("image-user", CreateProjectRequest{Name: "原生引用清理保护"})
			if err != nil {
				t.Fatal(err)
			}
			payload := fmt.Sprintf(`{"clips":[{"directMedia":{"storageKey":"resource:%s"}}]}`, resource.ID)
			idOnly := fmt.Sprintf(`{"clips":[{"captionOrigin":{"source":{"resourceId":"%s"}}}]}`, resource.ID)
			for _, record := range []any{
				&model.ProjectTimeline{UserID: "image-user", ProjectID: project.ID, PayloadJSON: payload, Revision: 1},
				&model.ProjectCut{ID: "cleanup-cut", UserID: "image-user", ProjectID: project.ID, RequestID: "cleanup-cut", PayloadJSON: payload},
				&model.ProjectCut{ID: "cleanup-archived-cut", UserID: "image-user", ProjectID: project.ID, RequestID: "cleanup-archived-cut", PayloadJSON: payload, Archived: true},
				&model.ProjectCut{ID: "cleanup-id-only", UserID: "image-user", ProjectID: project.ID, RequestID: "cleanup-id-only", PayloadJSON: idOnly},
				&model.ProjectCut{ID: "cleanup-metadata", UserID: "image-user", ProjectID: project.ID, RequestID: "cleanup-metadata", PayloadJSON: `{}`, MetadataJSON: idOnly},
				&model.ProjectTranscript{ID: "cleanup-transcript", UserID: "image-user", ProjectID: project.ID, ResourceID: resource.ID},
				&model.ProjectMediaAnalysis{ID: "cleanup-analysis", UserID: "image-user", ProjectID: project.ID, ResourceID: resource.ID},
			} {
				if err := db.Create(record).Error; err != nil {
					t.Fatal(err)
				}
				if err := s.repo.DeleteDetachedResources([]model.Resource{*resource}, nil); !errors.Is(err, repository.ErrResourceCleanupStillReferenced) {
					t.Fatalf("cleanup ignored %T: %v", record, err)
				}
				if _, err := s.repo.ResourceForUser("image-user", resource.ID); err != nil {
					t.Fatal("protected source was removed", err)
				}
				if err := db.Delete(record).Error; err != nil {
					t.Fatal(err)
				}
			}
			if err := s.repo.DeleteDetachedResources([]model.Resource{*resource}, nil); err != nil {
				t.Fatal("unreferenced resource was not releasable", err)
			}
		})
	}
}

func TestProjectCutCommitLocksSourceUntilCleanupCanSeeNewReference(t *testing.T) {
	s, db := headlessMediaService(t, "postgres")
	resource, _ := seedImageOperationSource(t, s, db)
	project, err := s.CreateProject("image-user", CreateProjectRequest{Name: "跨进程素材保护"})
	if err != nil {
		t.Fatal(err)
	}
	payload := fmt.Sprintf(`{"clips":[{"directMedia":{"storageKey":"resource:%s"}}]}`, resource.ID)
	cut := model.ProjectCut{ID: "pending-native-cut", UserID: "image-user", ProjectID: project.ID, RequestID: "pending-native-cut", PayloadJSON: payload}
	written, release := make(chan struct{}), make(chan struct{})
	var once sync.Once
	unblock := func() { once.Do(func() { close(release) }) }
	defer unblock()
	writeDone := make(chan error, 1)
	go func() {
		writeDone <- s.repo.CreateProjectCut(&cut, 0, nil, func(*repository.Repository) error {
			close(written)
			select {
			case <-release:
				return nil
			case <-time.After(15 * time.Second):
				return errors.New("test writer release timed out")
			}
		})
	}()
	select {
	case <-written:
	case <-time.After(10 * time.Second):
		t.Fatal("writer did not persist its pending cut")
	}
	pidReady := make(chan int, 1)
	cleanupDone := make(chan error, 1)
	go func() {
		cleanupDone <- db.Connection(func(connection *gorm.DB) error {
			var pid int
			if err := connection.Raw("SELECT pg_backend_pid()").Scan(&pid).Error; err != nil {
				return err
			}
			pidReady <- pid
			return repository.New(connection).DeleteDetachedResources([]model.Resource{*resource}, nil)
		})
	}()
	var pid int
	select {
	case pid = <-pidReady:
	case <-time.After(10 * time.Second):
		t.Fatal("cleanup did not obtain independent database connection")
	}
	deadline, locked := time.Now().Add(10*time.Second), false
	for time.Now().Before(deadline) {
		if err := db.Raw("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid = ? AND wait_event_type = 'Lock')", pid).Scan(&locked).Error; err != nil {
			t.Fatal(err)
		}
		if locked {
			break
		}
		select {
		case err := <-cleanupDone:
			t.Fatal("cleanup completed before the reference committed", err)
		case <-time.After(20 * time.Millisecond):
		}
	}
	if !locked {
		t.Fatal("independent cleanup did not wait for the actual resource row lock")
	}
	unblock()
	if err := <-writeDone; err != nil {
		t.Fatal("writer failed", err)
	}
	select {
	case err := <-cleanupDone:
		if !errors.Is(err, repository.ErrResourceCleanupStillReferenced) {
			t.Fatal("cleanup ignored newly committed native cut", err)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("cleanup did not finish after writer committed")
	}
	if _, err := s.repo.ResourceForUser("image-user", resource.ID); err != nil {
		t.Fatal("writer's source was removed", err)
	}
}
