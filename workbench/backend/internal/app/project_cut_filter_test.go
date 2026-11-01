package app

import (
	"fmt"
	"reflect"
	"testing"
	"time"

	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
)

func TestProjectCutFilteringPrecedesPaginationAndRetainsRecoveryHistory(t *testing.T) {
	for _, driver := range []string{"sqlite", "postgres"} {
		t.Run(driver, func(t *testing.T) {
			s, db := headlessMediaService(t, driver)
			seedImageOperationSource(t, s, db)
			project, err := s.CreateProject("image-user", CreateProjectRequest{Name: "清晰的剪辑版本列表"})
			if err != nil {
				t.Fatal(err)
			}
			clean, err := production.ValidateTimelineDocument([]byte(`{"version":2,"tracks":[],"clips":[],"durationMs":0}`))
			if err != nil {
				t.Fatal(err)
			}
			payload := string(clean)
			rows := []model.ProjectCut{}
			base := time.Unix(1_790_000_000, 0)
			for index := range 80 {
				key := []string{"timeline-edit-v1", "timeline-edit-before-v1", "project-cut-before-v1", ""}[index%4]
				id := fmt.Sprintf("automatic-cut-%03d", index)
				rows = append(rows, model.ProjectCut{ID: id, UserID: "image-user", ProjectID: project.ID, RequestID: "before-apply:" + id, Kind: "snapshot", SourceKey: key, Title: "自动恢复记录", PayloadJSON: payload, TimelineSHA256: cutSummary([]byte(payload)).SHA256, CreatedAt: base.Add(time.Duration(index) * time.Second)})
			}
			for index, kind := range []string{"master", "teaser", "snapshot", "master"} {
				id := fmt.Sprintf("saved-cut-%d", index)
				// Match an automatic record's title/source key, but keep a real
				// user snapshot visible and a master independent of that key.
				key := ""
				if index == 3 {
					key = "timeline-edit-v1"
				}
				rows = append(rows, model.ProjectCut{ID: id, UserID: "image-user", ProjectID: project.ID, RequestID: "manual-save:" + id, Kind: kind, SourceKey: key, Title: "编辑结果 · 自己保存", PayloadJSON: payload, TimelineSHA256: cutSummary([]byte(payload)).SHA256, CreatedAt: base.Add(time.Duration(index*25) * time.Second)})
			}
			rows = append(rows, model.ProjectCut{ID: "archived-master", UserID: "image-user", ProjectID: project.ID, RequestID: "manual-archived-master", Kind: "master", Archived: true, PayloadJSON: payload, TimelineSHA256: cutSummary([]byte(payload)).SHA256, CreatedAt: base.Add(90 * time.Second)})
			if err := db.Create(&rows).Error; err != nil {
				t.Fatal(err)
			}
			// Both historic NULL and new empty source keys classify identically.
			if err := db.Model(&model.ProjectCut{}).Where("id IN ?", []string{"automatic-cut-003", "saved-cut-2"}).Update("source_key", nil).Error; err != nil {
				t.Fatal(err)
			}
			var ids []string
			cursor := ""
			for range 4 {
				page, err := s.ListProjectCuts("image-user", project.ID, cursor, false, false, 2)
				if err != nil {
					t.Fatal(err)
				}
				for _, row := range page.Cuts {
					if row.IsAutomatic() {
						t.Fatal("automatic record passed saved-only filter", row.ID)
					}
					ids = append(ids, row.ID)
				}
				if page.NextCursor == "" {
					break
				}
				cursor = page.NextCursor
			}
			if !reflect.DeepEqual(ids, []string{"saved-cut-3", "saved-cut-2", "saved-cut-1", "saved-cut-0"}) {
				t.Fatal("saved versions hidden behind recovery pages", ids)
			}
			all, err := s.ListProjectCuts("image-user", project.ID, "", false, true, 100)
			if err != nil || len(all.Cuts) != 84 {
				t.Fatal("all-history filter lost records", len(all.Cuts), err)
			}
			archived, err := s.ListProjectCuts("image-user", project.ID, "", true, false, 20)
			if err != nil || len(archived.Cuts) != 1 || archived.Cuts[0].ID != "archived-master" {
				t.Fatal("archive filter mixed history", archived, err)
			}
			if _, err := s.ListProjectCuts("image-user", project.ID, "automatic-cut-003", false, false, 20); err == nil {
				t.Fatal("cursor from hidden filter accepted")
			}
			if _, err := s.ListProjectCuts("image-user", project.ID, "archived-master", false, false, 20); err == nil {
				t.Fatal("cursor from archive accepted")
			}
			if _, err := s.ListProjectCuts("other-user", project.ID, "", false, true, 20); err == nil {
				t.Fatal("foreign history readable")
			}
			if _, err := s.GetProjectCut("image-user", project.ID, "automatic-cut-003"); err != nil {
				t.Fatal("hidden recovery cannot be read directly", err)
			}
			var count int64
			if err := db.Model(&model.ProjectCut{}).Where("project_id = ?", project.ID).Count(&count).Error; err != nil || count != 85 {
				t.Fatal("filter changed saved history", count, err)
			}
		})
	}
}
