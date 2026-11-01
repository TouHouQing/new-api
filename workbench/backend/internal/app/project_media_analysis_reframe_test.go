package app

import (
	"encoding/json"
	"strings"
	"testing"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
)

func TestReframeNativeCASProvenanceUndoAndOtherOccurrence(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	resource, _ := seedAnalysisAudio(t, s, db)
	// Persistence/adoption contract fixture; actual decoded video is tested
	// independently by TestReframeActualPortraitLandscapeSpeedAndIndependentOccurrence.
	if err := db.Model(resource).Updates(map[string]any{"kind": "video", "mime_type": "video/mp4", "width": 320, "height": 180}).Error; err != nil {
		t.Fatal(err)
	}
	source := production.MediaAnalysisSource{DisplayGeometryVersion: 1, ResourceID: resource.ID, ETag: resource.ETag, SHA256: strings.Repeat("a", 64), Bytes: resource.Size, DurationMs: 6000, StartMs: 1000, EndMs: 3000, Width: 320, Height: 180}
	edits := production.MediaAnalysisEdits{Version: 1, Tracking: []production.AnalysisTrackingPoint{{ID: "point:0", TimeMs: 1000, ROI: production.AnalysisRectangle{X: 0, Y: 0, Width: .1, Height: .1}, Crop: production.AnalysisRectangle{X: 0, Y: 0, Width: .5, Height: 1}, Reviewed: true}, {ID: "point:1", TimeMs: 2875, ROI: production.AnalysisRectangle{X: .5, Y: 0, Width: .1, Height: .1}, Crop: production.AnalysisRectangle{X: .5, Y: 0, Width: .5, Height: 1}, Reviewed: true, Manual: true}}}
	encodedSource, _ := json.Marshal(source)
	encodedEdits, _ := json.Marshal(edits)
	row := model.ProjectMediaAnalysis{ID: "reframe-analysis", UserID: "analysis-user", ProjectID: "analysis-project", Kind: "subject_track", SourceKind: "task", SourceKey: "reframe-fixture", ResourceID: resource.ID, SourceJSON: string(encodedSource), EvidenceJSON: `{"points":[{"confidence":1},{"confidence":0,"review_required":true}]}`, CurrentRevisionID: "reframe-revision", Revision: 1}
	version := model.ProjectMediaAnalysisRevision{ID: "reframe-revision", AnalysisID: row.ID, UserID: row.UserID, AuthorID: row.UserID, RequestID: "reframe-initial-request", RequestSHA256: strings.Repeat("b", 64), Version: 1, DocumentJSON: string(encodedEdits)}
	if _, err := s.repo.CreateProjectMediaAnalysis(&row, &version); err != nil {
		t.Fatal(err)
	}
	media := map[string]any{"id": resource.ID, "kind": "video", "storageKey": "resource:" + resource.ID}
	raw, _ := json.Marshal(map[string]any{"version": 2, "tracks": []any{map[string]any{"id": "v", "kind": "video"}}, "clips": []any{map[string]any{"id": "target", "kind": "video", "trackId": "v", "nodeId": "v", "startMs": 0, "durationMs": 1000, "sourceStartMs": 1000, "playbackRate": 2, "directMedia": media}, map[string]any{"id": "independent", "kind": "video", "trackId": "v", "nodeId": "v", "startMs": 2000, "durationMs": 1000, "directMedia": media}}})
	before, err := s.SaveProjectTimeline(row.UserID, row.ProjectID, SaveProjectTimelineRequest{Timeline: raw, ExpectedRevision: 0})
	if err != nil {
		t.Fatal(err)
	}
	req := MediaAnalysisMarkerRequest{ExpectedTimelineRevision: &before.Revision, AnalysisRevisionID: version.ID, SourceClipID: "target"}
	if _, err := s.PreviewProjectMediaAnalysisReframe("foreign", row.ProjectID, row.ID, req); err == nil {
		t.Fatal("foreign preview allowed")
	}
	preview, err := s.PreviewProjectMediaAnalysisReframe(row.UserID, row.ProjectID, row.ID, req)
	if err != nil {
		t.Fatal(err)
	}
	applied, err := s.ApplyProjectMediaAnalysisReframe(row.UserID, row.ProjectID, row.ID, MediaAnalysisMarkerApplyRequest{MediaAnalysisMarkerRequest: req, PreviewToken: preview.PreviewToken})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.ApplyProjectMediaAnalysisReframe(row.UserID, row.ProjectID, row.ID, MediaAnalysisMarkerApplyRequest{MediaAnalysisMarkerRequest: req, PreviewToken: preview.PreviewToken}); err == nil {
		t.Fatal("stale reframe replay allowed")
	}
	var doc struct {
		Clips []struct {
			ID      string
			Reframe *production.TimelineReframe
		}
	}
	_ = json.Unmarshal(applied.Timeline, &doc)
	if doc.Clips[0].Reframe == nil || doc.Clips[1].Reframe != nil {
		t.Fatal("changed another occurrence")
	}
	// Native undo restores the original document; old plans cannot reinsert.
	undo, err := s.SaveProjectTimeline(row.UserID, row.ProjectID, SaveProjectTimelineRequest{ExpectedRevision: applied.Revision, Timeline: before.Timeline})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.ApplyProjectMediaAnalysisReframe(row.UserID, row.ProjectID, row.ID, MediaAnalysisMarkerApplyRequest{MediaAnalysisMarkerRequest: req, PreviewToken: preview.PreviewToken}); err == nil {
		t.Fatal("reinserted crop after undo")
	}
	// Server rejects forged coordinates even with an owned real revision ID.
	var altered map[string]any
	_ = json.Unmarshal(preview.Timeline, &altered)
	altered["clips"].([]any)[0].(map[string]any)["reframe"].(map[string]any)["width"] = .4
	forged, _ := json.Marshal(altered)
	if _, err := s.SaveProjectTimeline(row.UserID, row.ProjectID, SaveProjectTimelineRequest{ExpectedRevision: undo.Revision, Timeline: forged}); err == nil {
		t.Fatal("forged analysis crop accepted")
	}
	if _, err := s.SaveProjectTimeline(row.UserID, row.ProjectID, SaveProjectTimelineRequest{ExpectedRevision: undo.Revision, Timeline: preview.Timeline}); err != nil {
		t.Fatal("redo lost fixed revision", err)
	}
}
