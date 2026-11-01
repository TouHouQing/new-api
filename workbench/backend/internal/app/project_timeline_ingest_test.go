package app

import (
	"encoding/json"
	"testing"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
)

func TestTimelineEditsResourceOwnershipImmutableAppendAndReplay(t *testing.T) {
	s, db := legacyImportService(t)
	const pid = "canvas-resource-ingest"
	if err := db.Create(&model.Project{ID: pid, UserID: "owner", Name: "画布统一剪辑", Revision: 1, Status: model.ProjectStatusActive}).Error; err != nil {
		t.Fatal(err)
	}
	for _, row := range []model.Resource{
		{ID: "owned-original", UserID: "owner", Kind: "media", Status: model.ResourceStatusReady, MimeType: "video/mp4", Width: 640, Height: 384, DurationMs: 5000, ETag: "original-etag"},
		{ID: "other-original", UserID: "other", Kind: "media", Status: model.ResourceStatusReady, MimeType: "video/mp4", DurationMs: 5000},
		{ID: "pending-original", UserID: "owner", Kind: "media", Status: model.ResourceStatusPending, MimeType: "video/mp4", DurationMs: 5000},
	} {
		if err := db.Create(&row).Error; err != nil {
			t.Fatal(err)
		}
	}
	current, err := s.GetProjectTimeline("owner", pid)
	if err != nil {
		t.Fatal(err)
	}
	input := TimelineEditRequest{RequestID: "canvas-resource-ingest-request-0001", ExpectedRevision: current.Revision, Commands: []production.TimelineEditCommand{{Op: "addResource", ResourceID: "owned-original"}}}
	for _, resource := range []string{"other-original", "pending-original", "missing"} {
		bad := input
		bad.Commands = []production.TimelineEditCommand{{Op: "addResource", ResourceID: resource}}
		if _, err := s.PreviewTimelineEdits("owner", pid, bad); err == nil {
			t.Fatal("unavailable resource accepted", resource)
		}
	}
	plan, err := s.PreviewTimelineEdits("owner", pid, input)
	if err != nil {
		t.Fatal(err)
	}
	var cuts int64
	db.Model(&model.ProjectCut{}).Where("project_id = ?", pid).Count(&cuts)
	if cuts != 0 {
		t.Fatal("preview wrote cuts")
	}
	input.PreviewToken = plan.PreviewToken
	result, err := s.ApplyTimelineEdits("owner", pid, input)
	if err != nil {
		t.Fatal(err)
	}
	if result.AppliedRevision != current.Revision+1 || len(result.Plan.Changes) != 1 || result.Plan.Changes[0].Action != "add" {
		t.Fatal("wrong append receipt", result)
	}
	after, err := s.GetProjectTimeline("owner", pid)
	if err != nil {
		t.Fatal(err)
	}
	var timeline struct {
		Clips []struct {
			ID          string                            `json:"id"`
			DirectMedia struct{ StorageKey, ETag string } `json:"directMedia"`
		}
	}
	json.Unmarshal(after.Timeline, &timeline)
	if len(timeline.Clips) != 1 || timeline.Clips[0].DirectMedia.StorageKey != "resource:owned-original" || timeline.Clips[0].DirectMedia.ETag != "original-etag" {
		t.Fatalf("wrong immutable resource: %s", after.Timeline)
	}
	replay, err := s.ApplyTimelineEdits("owner", pid, input)
	if err != nil || !replay.Replayed {
		t.Fatal("lost reply replay failed", err)
	}
	afterReplay, _ := s.GetProjectTimeline("owner", pid)
	if string(afterReplay.Timeline) != string(after.Timeline) || afterReplay.Revision != after.Revision {
		t.Fatal("replay duplicated append")
	}
	db.Model(&model.ProjectCut{}).Where("project_id = ?", pid).Count(&cuts)
	if cuts != 2 {
		t.Fatal("snapshots not atomic", cuts)
	}
}
