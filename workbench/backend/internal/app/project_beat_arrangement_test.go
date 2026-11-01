package app

import (
	"encoding/json"
	"strings"
	"testing"

	"gorm.io/gorm"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
)

func verifyNativeBeatArrangement(t *testing.T, s *Service, db *gorm.DB) {
	t.Helper()
	source := production.MediaAnalysisSource{ResourceID: "beat-music", SHA256: strings.Repeat("a", 64), ETag: "music-etag", Bytes: 100, DurationMs: 6000, StartMs: 0, EndMs: 6000}
	doc := production.MediaAnalysisEdits{Version: 1, Beats: []production.AnalysisBeat{{ID: "b1", TimeMs: 2800, Approved: true}, {ID: "b2", TimeMs: 4200, Approved: true}}}
	encodedSource, _ := json.Marshal(source)
	encodedDoc, _ := json.Marshal(doc)
	for _, row := range []any{
		&model.Project{ID: "beat-project", UserID: "owner", Name: "歌曲剪辑", Revision: 1, Status: model.ProjectStatusActive},
		&model.Resource{ID: "beat-music", UserID: "owner", Kind: "audio", MimeType: "audio/wav", Status: model.ResourceStatusReady, Size: 100, ETag: "music-etag", DurationMs: 6000},
		&model.Resource{ID: "beat-video", UserID: "owner", Kind: "video", MimeType: "video/mp4", Status: model.ResourceStatusReady, DurationMs: 6000},
		&model.ProjectMediaAnalysis{ID: "beat-analysis", ProjectID: "beat-project", UserID: "owner", Kind: "audio_structure", SourceKind: "task", SourceKey: "fixture", ResourceID: "beat-music", SourceJSON: string(encodedSource), EvidenceJSON: `{}`, CurrentRevisionID: "beat-revision", Revision: 1},
		&model.ProjectMediaAnalysisRevision{ID: "beat-revision", AnalysisID: "beat-analysis", UserID: "owner", AuthorID: "owner", Version: 1, DocumentJSON: string(encodedDoc)},
	} {
		if err := db.Create(row).Error; err != nil {
			t.Fatal(err)
		}
	}
	raw := json.RawMessage(`{"version":2,"tracks":[{"id":"v","kind":"video"},{"id":"a","kind":"audio"}],"clips":[{"id":"first","kind":"video","trackId":"v","startMs":0,"durationMs":5000,"sourceDurationMs":6000,"directMedia":{"id":"beat-video","kind":"video","storageKey":"resource:beat-video"}},{"id":"second","kind":"video","trackId":"v","startMs":5000,"durationMs":5000,"sourceDurationMs":6000,"directMedia":{"id":"beat-video","kind":"video","storageKey":"resource:beat-video"}},{"id":"music","kind":"audio","trackId":"a","startMs":0,"durationMs":6000,"sourceDurationMs":6000,"directMedia":{"id":"beat-music","kind":"audio","storageKey":"resource:beat-music"}}]}`)
	current, err := s.SaveProjectTimeline("owner", "beat-project", SaveProjectTimelineRequest{Timeline: raw})
	if err != nil {
		t.Fatal(err)
	}
	request := TimelineEditRequest{RequestID: "native-beat-request-0001", ExpectedRevision: current.Revision, Commands: []production.TimelineEditCommand{{Op: "arrangeToBeats", AnalysisID: "beat-analysis", AnalysisRevisionID: "beat-revision", SourceClipID: "music", ClipIDs: []string{"first", "second"}}}}
	if _, err := s.PreviewTimelineEdits("other", "beat-project", request); err == nil {
		t.Fatal("foreign beat preview accepted")
	}
	plan, err := s.PreviewTimelineEdits("owner", "beat-project", request)
	if err != nil || len(plan.Changes) != 3 {
		t.Fatal("native beat preview missing visual/marker changes", err, plan.Changes)
	}
	request.PreviewToken = plan.PreviewToken
	// Source identity is checked again before the write.
	if err := db.Model(&model.Resource{}).Where("id = ?", "beat-music").Update("e_tag", "changed").Error; err != nil {
		t.Fatal(err)
	}
	if _, err := s.ApplyTimelineEdits("owner", "beat-project", request); err == nil {
		t.Fatal("changed music identity accepted")
	}
	if err := db.Model(&model.Resource{}).Where("id = ?", "beat-music").Update("e_tag", "music-etag").Error; err != nil {
		t.Fatal(err)
	}
	result, err := s.ApplyTimelineEdits("owner", "beat-project", request)
	if err != nil || result.Replayed || result.AppliedRevision != current.Revision+1 {
		t.Fatal(result, err)
	}
	before, err := s.GetProjectCut("owner", "beat-project", plan.BackupCutID)
	if err != nil || before.Cut.TimelineSHA256 != plan.Before.SHA256 {
		t.Fatal("edit-before version missing", err)
	}
	after, err := s.GetProjectCut("owner", "beat-project", plan.CutID)
	if err != nil || after.Cut.TimelineSHA256 != plan.After.SHA256 {
		t.Fatal("edit-after version missing", err)
	}
	// Explicit undo uses the original timeline; an old successful request must
	// only return its receipt, never reinsert beats or move clips again.
	undone, err := s.SaveProjectTimeline("owner", "beat-project", SaveProjectTimelineRequest{ExpectedRevision: result.AppliedRevision, Timeline: current.Timeline})
	if err != nil {
		t.Fatal(err)
	}
	replay, err := s.ApplyTimelineEdits("owner", "beat-project", request)
	if err != nil || !replay.Replayed {
		t.Fatal("original beat receipt was lost", err)
	}
	latest, err := s.GetProjectTimeline("owner", "beat-project")
	if err != nil || latest.Revision != undone.Revision || cutSummary(latest.Timeline).SHA256 != plan.Before.SHA256 {
		t.Fatal("old beat request overwrote undo", err)
	}
	request.Commands[0].ClipIDs = []string{"second", "first"}
	if _, err := s.ApplyTimelineEdits("owner", "beat-project", request); err == nil {
		t.Fatal("same request changed ordering")
	}
}
func TestProjectBeatArrangementSQLiteNativePreviewSnapshotsUndoReplay(t *testing.T) {
	s, db := legacyImportService(t)
	verifyNativeBeatArrangement(t, s, db)
}
func TestProjectBeatArrangementPostgresNativePreviewSnapshotsUndoReplay(t *testing.T) {
	base, db := newProjectNameConflictPostgresService(t)
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	conn, _ := db.DB()
	t.Cleanup(func() { _ = conn.Close() })
	s := New(base.repo, t.TempDir())
	t.Cleanup(func() { s.Close() })
	for _, id := range []string{"owner", "other"} {
		if err := db.Create(&model.User{ID: id, Username: id, Email: id + "@example.invalid", Role: model.UserRoleUser, Status: model.UserStatusActive}).Error; err != nil {
			t.Fatal(err)
		}
	}
	verifyNativeBeatArrangement(t, s, db)
}
