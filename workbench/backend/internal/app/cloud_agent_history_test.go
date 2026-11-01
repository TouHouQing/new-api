package app

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	"yingce/backend/internal/model"
)

func TestCloudAgentHistoryOwnedPaginationAndRestore(t *testing.T) {
	for _, postgres := range []bool{false, true} {
		t.Run(fmt.Sprint(postgres), func(t *testing.T) {
			s, db, run, _ := agentImageOperationFixture(t, "auto", postgres)
			now := time.Now().UTC().Add(time.Hour).Truncate(time.Microsecond)
			for i := 0; i < 35; i++ {
				id := fmt.Sprintf("history-%03d", i)
				if err := db.Create(&model.Task{ID: id, UserID: "user", ProjectID: "agent-canvas", Operation: cloudAgentOperation}).Error; err != nil {
					t.Fatal(err)
				}
				if err := db.Create(&model.CloudAgentExecution{ID: id, UserID: "user", CanvasID: "agent-canvas", Title: id, StateJSON: `{"private":"must-not-leak"}`, CreatedAt: now, UpdatedAt: now, Status: "completed"}).Error; err != nil {
					t.Fatal(err)
				}
			}
			for _, entry := range []model.CloudAgentExecution{
				{ID: "foreign-history", UserID: "other", CanvasID: "agent-canvas", CreatedAt: now.Add(time.Minute)},
				{ID: "other-canvas-history", UserID: "user", CanvasID: "other-canvas", CreatedAt: now.Add(time.Minute)},
				{ID: "orphan-history", UserID: "user", CanvasID: "agent-canvas", CreatedAt: now.Add(time.Minute)},
			} {
				if entry.ID != "orphan-history" {
					if err := db.Create(&model.Task{ID: entry.ID, UserID: entry.UserID, ProjectID: entry.CanvasID, Operation: cloudAgentOperation}).Error; err != nil {
						t.Fatal(err)
					}
				}
				if err := db.Create(&entry).Error; err != nil {
					t.Fatal(err)
				}
			}
			seen := map[string]bool{}
			cursor := ""
			for {
				page, err := s.CloudAgentHistory("user", CloudAgentHistoryRequest{CanvasID: "agent-canvas", Cursor: cursor, Limit: 7})
				if err != nil {
					t.Fatal(err)
				}
				raw, _ := json.Marshal(page)
				if strings.Contains(string(raw), "must-not-leak") || strings.Contains(string(raw), "StateJSON") {
					t.Fatal("history exposed state")
				}
				for _, item := range page.Items {
					if seen[item.ID] || item.CanvasID != "agent-canvas" {
						t.Fatal("pagination overlap or foreign canvas")
					}
					seen[item.ID] = true
				}
				if !page.HasMore {
					break
				}
				if page.NextCursor == "" || page.NextCursor == cursor {
					t.Fatal("cursor did not advance")
				}
				cursor = page.NextCursor
			}
			if len(seen) != 36 || !seen[run.ID] || seen["orphan-history"] || seen["foreign-history"] {
				t.Fatal("history ownership/count mismatch", len(seen))
			}
			if _, err := s.CloudAgentHistory("other", CloudAgentHistoryRequest{CanvasID: "agent-canvas", Limit: 7}); err == nil {
				t.Fatal("foreign canvas listed")
			}
			for _, req := range []CloudAgentHistoryRequest{{CanvasID: "agent-canvas", Limit: 0}, {CanvasID: "agent-canvas", Limit: 51}, {CanvasID: "agent-canvas", Limit: 7, Cursor: "bad-cursor"}} {
				if _, err := s.CloudAgentHistory("user", req); err == nil {
					t.Fatal("invalid pagination accepted")
				}
			}
			restored, err := s.RestoreCloudAgentRun("user", run.ID)
			if err != nil || restored.Run.ID != run.ID || restored.Prompt != "分析剧情" {
				t.Fatal("original request not restored", err)
			}
			if _, err := s.RestoreCloudAgentRun("other", run.ID); err == nil {
				t.Fatal("foreign run restored")
			}
		})
	}
}
