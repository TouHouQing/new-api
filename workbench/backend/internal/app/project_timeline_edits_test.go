package app

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"sync"
	"testing"

	"gorm.io/gorm"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
)

func TestTimelineEditsAtomicSnapshotsReceiptsAndRecovery(t *testing.T) {
	s, db := legacyImportService(t)
	verifyNativeTimelineEdits(t, s, db)
}
func TestTimelineEditsPostgresAtomicSnapshotsReceiptsAndRecovery(t *testing.T) {
	base, db := newProjectNameConflictPostgresService(t)
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	connection, _ := db.DB()
	t.Cleanup(func() { connection.Close() })
	s := New(base.repo, t.TempDir())
	t.Cleanup(func() { s.Close() })
	for _, id := range []string{"owner", "other"} {
		if err := db.Create(&model.User{ID: id, Username: id, Email: id + "@example.invalid", Role: model.UserRoleUser, Status: model.UserStatusActive}).Error; err != nil {
			t.Fatal(err)
		}
	}
	verifyNativeTimelineEdits(t, s, db)
}
func verifyNativeTimelineEdits(t *testing.T, s *Service, db *gorm.DB) {
	t.Helper()
	pid := "native-edit-project"
	if err := db.Create(&model.Project{ID: pid, UserID: "owner", Name: "声音联动", Revision: 1, Status: model.ProjectStatusActive}).Error; err != nil {
		t.Fatal(err)
	}
	for _, row := range []model.Resource{{ID: "edit-video", Kind: "video", DurationMs: 10000, MimeType: "video/mp4"}, {ID: "edit-voice", Kind: "audio", DurationMs: 10000, MimeType: "audio/wav"}, {ID: "edit-music", Kind: "audio", DurationMs: 12000, MimeType: "audio/wav"}} {
		row.UserID = "owner"
		row.Status = model.ResourceStatusReady
		if err := db.Create(&row).Error; err != nil {
			t.Fatal(err)
		}
	}
	raw, err := os.ReadFile("../production/testdata/audio_links.golden.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Base json.RawMessage `json:"base"`
	}
	json.Unmarshal(raw, &fixture)
	var body map[string]any
	decoder := json.NewDecoder(bytes.NewReader(fixture.Base))
	decoder.UseNumber()
	decoder.Decode(&body)
	for _, row := range body["clips"].([]any) {
		clip := row.(map[string]any)
		kind := clip["kind"].(string)
		resource := "edit-video"
		if kind == "subtitle" {
			continue
		}
		if kind == "audio" {
			resource = "edit-voice"
			if clip["id"] == "music" {
				resource = "edit-music"
			}
		}
		clip["directMedia"] = map[string]any{"id": resource, "kind": kind, "storageKey": "resource:" + resource}
	}
	initial, _ := json.Marshal(body)
	current, err := s.SaveProjectTimeline("owner", pid, SaveProjectTimelineRequest{Timeline: initial})
	if err != nil {
		t.Fatal(err)
	}
	start := int64(3000)
	request := TimelineEditRequest{RequestID: "native-edit-request-0001", ExpectedRevision: current.Revision, Commands: []production.TimelineEditCommand{{Op: "moveClip", ID: "video", StartMs: &start}}}
	plan, err := s.PreviewTimelineEdits("owner", pid, request)
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.Changes) != 2 || plan.Before.SHA256 != cutSummary(current.Timeline).SHA256 || plan.After.SHA256 == plan.Before.SHA256 {
		t.Fatal("incorrect preview impact", plan)
	}
	assertCounts := func(cuts, receipts int64) {
		t.Helper()
		var count int64
		db.Model(&model.ProjectCut{}).Where("project_id = ?", pid).Count(&count)
		if count != cuts {
			t.Fatalf("snapshot count %d want %d", count, cuts)
		}
		db.Model(&model.ProjectCutApplyReceipt{}).Where("project_id = ?", pid).Count(&count)
		if count != receipts {
			t.Fatalf("receipt count %d want %d", count, receipts)
		}
	}
	assertCounts(0, 0)
	if _, err := s.PreviewTimelineEdits("other", pid, request); err == nil {
		t.Fatal("foreign preview allowed")
	}
	if _, err := s.ApplyTimelineEdits("other", pid, request); err == nil {
		t.Fatal("foreign edit allowed")
	}
	if _, err := s.ApplyTimelineEdits("owner", pid, request); err == nil {
		t.Fatal("apply without explicit preview allowed")
	}
	assertCounts(0, 0)
	request.PreviewToken = plan.PreviewToken
	first, err := s.ApplyTimelineEdits("owner", pid, request)
	if err != nil || first.Replayed || first.AppliedRevision != current.Revision+1 {
		t.Fatal("apply", err, first)
	}
	assertCounts(2, 1)
	beforeCut, err := s.GetProjectCut("owner", pid, plan.BackupCutID)
	if err != nil || beforeCut.Cut.TimelineSHA256 != plan.Before.SHA256 {
		t.Fatal("before snapshot", err)
	}
	afterCut, err := s.GetProjectCut("owner", pid, plan.CutID)
	if err != nil || afterCut.Cut.TimelineSHA256 != plan.After.SHA256 || string(afterCut.Timeline) != string(plan.Timeline) {
		t.Fatal("after snapshot", err)
	}
	if _, err := s.ReadTimelineEditResult("other", pid, request.RequestID); err == nil {
		t.Fatal("foreign receipt allowed")
	}
	current, err = s.GetProjectTimeline("owner", pid)
	if err != nil || cutSummary(current.Timeline).SHA256 != plan.After.SHA256 {
		t.Fatal("working cut", err)
	}
	json.Unmarshal(current.Timeline, &body)
	body["clips"].([]any)[2].(map[string]any)["title"] = "随后人工修改的旁白"
	later, _ := json.Marshal(body)
	current, err = s.SaveProjectTimeline("owner", pid, SaveProjectTimelineRequest{ExpectedRevision: current.Revision, Timeline: later})
	if err != nil {
		t.Fatal(err)
	}
	replayed, err := s.ApplyTimelineEdits("owner", pid, request)
	if err != nil || !replayed.Replayed || replayed.AppliedRevision != first.AppliedRevision {
		t.Fatal("unknown response recovery", err)
	}
	retained, _ := s.GetProjectTimeline("owner", pid)
	if retained.Revision != current.Revision || !strings.Contains(string(retained.Timeline), "随后人工修改") {
		t.Fatal("replay overwrote later editing")
	}
	changed := request
	nextStart := int64(3500)
	changed.Commands = []production.TimelineEditCommand{{Op: "moveClip", ID: "video", StartMs: &nextStart}}
	if _, err := s.ApplyTimelineEdits("owner", pid, changed); err == nil {
		t.Fatal("same request ID accepted different commands")
	}
	assertCounts(2, 1)
	// A normal fixed-cut load has its own intent signature in the shared
	// receipt table. The edit endpoint must not misread that receipt as an edit.
	load := ProjectCutApplyRequest{RequestID: "native-manual-load-0001", ExpectedRevision: current.Revision, TimelineSHA256: afterCut.Cut.TimelineSHA256}
	loadPlan, err := s.PreviewProjectCutApply("owner", pid, afterCut.Cut.ID, load)
	if err != nil {
		t.Fatal(err)
	}
	load.PreviewToken = loadPlan.PreviewToken
	if _, err := s.ApplyProjectCut("owner", pid, afterCut.Cut.ID, load); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ReadTimelineEditResult("owner", pid, load.RequestID); err == nil {
		t.Fatal("fixed-cut load was misrepresented as a native edit")
	}
	assertCounts(3, 2)
	current, _ = s.GetProjectTimeline("owner", pid)
	rollbackStart := int64(2000)
	rollback := TimelineEditRequest{RequestID: "native-edit-rollback-0001", ExpectedRevision: current.Revision, Commands: []production.TimelineEditCommand{{Op: "moveClip", ID: "video", StartMs: &rollbackStart}}}
	rollbackPlan, err := s.PreviewTimelineEdits("owner", pid, rollback)
	if err != nil {
		t.Fatal(err)
	}
	rollback.PreviewToken = rollbackPlan.PreviewToken
	callback := "native-edit-intentional-receipt-failure"
	db.Callback().Create().Before("gorm:create").Register(callback, func(tx *gorm.DB) {
		if _, ok := tx.Statement.Dest.(*model.ProjectCutApplyReceipt); ok {
			tx.AddError(errors.New("intentional receipt failure"))
		}
	})
	_, failure := s.ApplyTimelineEdits("owner", pid, rollback)
	db.Callback().Create().Remove(callback)
	if failure == nil {
		t.Fatal("injected final write failure not observed")
	}
	assertCounts(3, 2)
	afterFailure, _ := s.GetProjectTimeline("owner", pid)
	if afterFailure.Revision != current.Revision || string(afterFailure.Timeline) != string(current.Timeline) {
		t.Fatal("failed edit left partial timeline or snapshots")
	}
	if _, err := s.ApplyTimelineEdits("owner", pid, rollback); err != nil {
		t.Fatal("same uncommitted intent cannot retry", err)
	}
	assertCounts(5, 3)
	// Two prepared requests compete for one revision. Exactly one may commit.
	current, _ = s.GetProjectTimeline("owner", pid)
	starts := []int64{2400, 2600}
	requests := []TimelineEditRequest{}
	for index, id := range []string{"native-race-request-0001", "native-race-request-0002"} {
		next := TimelineEditRequest{RequestID: id, ExpectedRevision: current.Revision, Commands: []production.TimelineEditCommand{{Op: "moveClip", ID: "video", StartMs: &starts[index]}}}
		preview, err := s.PreviewTimelineEdits("owner", pid, next)
		if err != nil {
			t.Fatal(err)
		}
		next.PreviewToken = preview.PreviewToken
		requests = append(requests, next)
	}
	results := make(chan error, 2)
	var wait sync.WaitGroup
	for _, next := range requests {
		wait.Add(1)
		go func(request TimelineEditRequest) {
			defer wait.Done()
			_, err := s.ApplyTimelineEdits("owner", pid, request)
			results <- err
		}(next)
	}
	wait.Wait()
	close(results)
	success := 0
	for err := range results {
		if err == nil {
			success++
		}
	}
	if success != 1 {
		t.Fatalf("concurrent edits committed %d times", success)
	}
	assertCounts(7, 4)
	var tasks int64
	db.Model(&model.Task{}).Count(&tasks)
	if tasks != 0 {
		t.Fatal("native editing unexpectedly queued model tasks")
	}
}
