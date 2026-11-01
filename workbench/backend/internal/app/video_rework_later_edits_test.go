package app

import (
	"context"
	"encoding/json"
	"reflect"
	"testing"
	"yingce/backend/internal/production"
)

func verifyWholeSourceVideoReworkLaterEdits(t *testing.T, s *Service, taskID, derivedID, originalID string) {
	t.Helper()
	edit := func(name string, commands ...production.TimelineEditCommand) {
		t.Helper()
		current, err := s.GetProjectTimeline("video-user", "video-project")
		if err != nil {
			t.Fatal(err)
		}
		request := TimelineEditRequest{RequestID: name, ExpectedRevision: current.Revision, Commands: commands}
		preview, err := s.PreviewTimelineEdits("video-user", "video-project", request)
		if err != nil {
			t.Fatal(err)
		}
		request.PreviewToken = preview.PreviewToken
		if _, err := s.ApplyTimelineEdits("video-user", "video-project", request); err != nil {
			t.Fatal(err)
		}
	}
	edit("readopt-for-followup-edits-01", production.TimelineEditCommand{Op: "applyVideoRepair", ID: "first-use", RepairTaskID: taskID})
	current, err := s.GetProjectTimeline("video-user", "video-project")
	if err != nil {
		t.Fatal(err)
	}
	var forged map[string]any
	json.Unmarshal(current.Timeline, &forged)
	forged["clips"].([]any)[0].(map[string]any)["videoReworkOrigin"].(map[string]any)["sourceResourceIds"] = []string{"unrelated-analysis-source"}
	bad, _ := json.Marshal(forged)
	if _, err := s.SaveProjectTimeline("video-user", "video-project", SaveProjectTimelineRequest{Timeline: bad, ExpectedRevision: current.Revision}); err == nil {
		t.Fatal("forged native source clock aliases accepted")
	}
	draft, err := s.CreateProjectManualFraming(context.Background(), "video-user", "video-project", ProjectManualFramingRequest{RequestID: "later-repair-framing-draft", ResourceID: derivedID, SourceClipID: "first-use", ExpectedTimelineRevision: &current.Revision, TargetAspect: .5})
	if err != nil {
		t.Fatal(err)
	}
	doc := draft.View.Document
	for i := range doc.Tracking {
		doc.Tracking[i].Manual = true
		doc.Tracking[i].Reviewed = true
		doc.Tracking[i].Crop.X = .1
		doc.Tracking[i].ROI = doc.Tracking[i].Crop
	}
	saved, err := s.SaveProjectMediaAnalysis("video-user", "video-project", draft.View.Analysis.ID, ProjectMediaAnalysisWriteRequest{RequestID: "review-later-repair-framing", ExpectedRevision: &draft.View.Analysis.Revision, Document: &doc})
	if err != nil {
		t.Fatal(err)
	}
	frameRequest := MediaAnalysisMarkerRequest{ExpectedTimelineRevision: &current.Revision, AnalysisRevisionID: saved.AppliedVersion.ID, SourceClipID: "first-use"}
	framePreview, err := s.PreviewProjectMediaAnalysisReframe("video-user", "video-project", draft.View.Analysis.ID, frameRequest)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.ApplyProjectMediaAnalysisReframe("video-user", "video-project", draft.View.Analysis.ID, MediaAnalysisMarkerApplyRequest{MediaAnalysisMarkerRequest: frameRequest, PreviewToken: framePreview.PreviewToken}); err != nil {
		t.Fatal(err)
	}
	split, position, rate := int64(1000), int64(6000), .5
	rightID := "first-use:split:1000"
	edit("later-split-move-speed-01", production.TimelineEditCommand{Op: "splitClip", ID: "first-use", SplitAtMs: &split}, production.TimelineEditCommand{Op: "moveClip", ID: rightID, StartMs: &position}, production.TimelineEditCommand{Op: "setClipPlaybackRate", ID: rightID, PlaybackRate: &rate})
	current, err = s.GetProjectTimeline("video-user", "video-project")
	if err != nil {
		t.Fatal(err)
	}
	before, hash, err := production.ReadVideoReworkClip(current.Timeline, rightID)
	if err != nil {
		t.Fatal(err)
	}
	edit("undo-only-later-right-fragment", production.TimelineEditCommand{Op: "removeVideoRepair", ID: rightID, RepairTaskID: taskID, ExpectedClipSHA256: hash})
	final, err := s.GetProjectTimeline("video-user", "video-project")
	if err != nil {
		t.Fatal(err)
	}
	after, _, err := production.ReadVideoReworkClip(final.Timeline, rightID)
	if err != nil {
		t.Fatal(err)
	}
	var left, right map[string]any
	json.Unmarshal(before, &left)
	json.Unmarshal(after, &right)
	for _, key := range []string{"id", "startMs", "durationMs", "sourceStartMs", "playbackRate", "fadeInMs", "fadeOutMs", "volume", "trackId"} {
		if !reflect.DeepEqual(left[key], right[key]) {
			t.Fatalf("undo lost later %s", key)
		}
	}
	if right["directMedia"].(map[string]any)["storageKey"] != "resource:"+originalID || right["videoReworkOrigin"] != nil {
		t.Fatal("undo did not restore this fragment's original identity")
	}
	var frame struct {
		Reframe production.TimelineReframe `json:"reframe"`
	}
	json.Unmarshal(after, &frame)
	if frame.Reframe.ResourceID != originalID || frame.Reframe.Keys[0].X != .1 {
		t.Fatal("undo lost later reviewed crop")
	}
	view, err := s.GetProjectMediaAnalysis("video-user", "video-project", frame.Reframe.AnalysisID, frame.Reframe.RevisionID)
	if err != nil || view.Analysis.SourceKind != "video_rework_undo" {
		t.Fatalf("restored crop lacks native provenance: %v", err)
	}
	retained, _, err := production.ReadVideoReworkClip(final.Timeline, "first-use")
	if err != nil {
		t.Fatal(err)
	}
	var retainedClip map[string]any
	json.Unmarshal(retained, &retainedClip)
	if retainedClip["directMedia"].(map[string]any)["storageKey"] != "resource:"+derivedID {
		t.Fatal("undo changed other split fragment")
	}
}
