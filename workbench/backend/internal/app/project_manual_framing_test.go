package app

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"gorm.io/gorm"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
)

func TestManualFramingActualNoWorkerReplayHistoryAndAdoption(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	verifyManualFramingLifecycle(t, s, db)
}

func TestManualFramingActualPostgresNoWorkerReplayHistoryAndAdoption(t *testing.T) {
	s, db := newProjectNameConflictPostgresService(t)
	s.dataDir = t.TempDir()
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	verifyManualFramingLifecycle(t, s, db)
}

func verifyManualFramingLifecycle(t *testing.T, s *Service, db *gorm.DB) {
	t.Helper()
	if os.Getenv("CANVAS_TEST_REAL_FFMPEG") != "1" {
		t.Skip("explicit installed FFmpeg required")
	}
	// Flat colour has no usable tracking features. No CPU worker is configured.
	t.Setenv(mediaAnalysisWorkerURLEnv, "http://127.0.0.1:1")
	t.Setenv(mediaAnalysisWorkerSecretEnv, filepath.Join(t.TempDir(), "no-worker-token"))
	seedAnalysisAudio(t, s, db)
	file := filepath.Join(t.TempDir(), "featureless.mp4")
	if out, err := exec.Command("ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=blue:s=320x180:r=8:d=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-threads", "1", file).CombinedOutput(); err != nil {
		t.Fatalf("actual featureless video: %v %s", err, out)
	}
	original, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	resource, _, err := s.storeResource("analysis-user", "video", "featureless.mp4", "video/mp4", int64(len(original)), 320, 180, 3000, bytes.NewReader(original), nil, false)
	if err != nil {
		t.Fatal(err)
	}
	media := map[string]any{"id": resource.ID, "kind": "video", "storageKey": "resource:" + resource.ID}
	raw, _ := json.Marshal(map[string]any{"version": 2, "tracks": []any{map[string]any{"id": "v", "kind": "video"}}, "clips": []any{
		map[string]any{"id": "target", "kind": "video", "nodeId": "v", "trackId": "v", "startMs": 0, "durationMs": 1000, "sourceStartMs": 500, "playbackRate": 2, "directMedia": media},
		map[string]any{"id": "independent", "kind": "video", "nodeId": "v", "trackId": "v", "startMs": 1100, "durationMs": 1000, "directMedia": media},
	}})
	timeline, err := s.SaveProjectTimeline("analysis-user", "analysis-project", SaveProjectTimelineRequest{Timeline: raw})
	if err != nil {
		t.Fatal(err)
	}
	req := ProjectManualFramingRequest{RequestID: "manual-framing-actual-stable-1", ResourceID: resource.ID, SourceClipID: "target", ExpectedTimelineRevision: &timeline.Revision, TargetAspect: 9.0 / 16}
	ctx := context.Background()
	if _, err := s.CreateProjectManualFraming(ctx, "foreign-user", "analysis-project", req); err == nil {
		t.Fatal("foreign user created framing")
	}
	for _, mutate := range []func(*ProjectManualFramingRequest){
		func(r *ProjectManualFramingRequest) { r.ExpectedTimelineRevision = nil },
		func(r *ProjectManualFramingRequest) { stale := int64(7); r.ExpectedTimelineRevision = &stale },
		func(r *ProjectManualFramingRequest) { outside := int64(0); r.StartMs = &outside },
		func(r *ProjectManualFramingRequest) { outside := int64(2600); r.EndMs = &outside },
		func(r *ProjectManualFramingRequest) { r.ResourceID = "foreign-resource" },
	} {
		bad := req
		mutate(&bad)
		if _, err := s.CreateProjectManualFraming(ctx, "analysis-user", "analysis-project", bad); err == nil {
			t.Fatal("accepted missing/stale/source-mismatched manual intent")
		}
	}
	created, err := s.CreateProjectManualFraming(ctx, "analysis-user", "analysis-project", req)
	if err != nil {
		t.Fatal(err)
	}
	view := created.View
	digest := sha256.Sum256(original)
	if created.Replayed || view.Analysis.SourceKind != "manual_framing" || view.Analysis.SourceTaskID != "" || view.Source.SHA256 != hex.EncodeToString(digest[:]) || view.Source.StartMs != 500 || view.Source.EndMs != 2500 || view.Source.DisplayGeometryVersion != 1 || len(view.Document.Tracking) != 2 {
		t.Fatalf("manual draft lost source or fabricated task: %+v", view)
	}
	var tasks int64
	if err := db.Model(&model.Task{}).Count(&tasks).Error; err != nil || tasks != 0 {
		t.Fatal("manual framing started a task", err, tasks)
	}
	adoption := MediaAnalysisMarkerRequest{ExpectedTimelineRevision: &timeline.Revision, AnalysisRevisionID: view.CurrentVersion.ID, SourceClipID: "target"}
	if _, err := s.PreviewProjectMediaAnalysisReframe("analysis-user", "analysis-project", view.Analysis.ID, adoption); err == nil {
		t.Fatal("unreviewed manual proposal adopted")
	}
	doc := view.Document
	for i := range doc.Tracking {
		doc.Tracking[i].Manual, doc.Tracking[i].Reviewed = true, true
	}
	middle := doc.Tracking[0]
	middle.ID, middle.TimeMs, middle.Crop.X = "manual:middle", 1500, .1
	doc.Tracking = append(doc.Tracking, middle)
	saved, err := s.SaveProjectMediaAnalysis("analysis-user", "analysis-project", view.Analysis.ID, ProjectMediaAnalysisWriteRequest{RequestID: "manual-reviewed-keyframes-1", ExpectedRevision: &view.Analysis.Revision, Document: &doc})
	if err != nil {
		t.Fatal(err)
	}
	adoption.AnalysisRevisionID = saved.AppliedVersion.ID
	preview, err := s.PreviewProjectMediaAnalysisReframe("analysis-user", "analysis-project", view.Analysis.ID, adoption)
	if err != nil || len(preview.Reframe.Keys) != 3 {
		t.Fatal("reviewed nonlinear manual keys unavailable", err, preview.Reframe)
	}
	applied, err := s.ApplyProjectMediaAnalysisReframe("analysis-user", "analysis-project", view.Analysis.ID, MediaAnalysisMarkerApplyRequest{MediaAnalysisMarkerRequest: adoption, PreviewToken: preview.PreviewToken})
	if err != nil {
		t.Fatal(err)
	}
	var after struct {
		Clips []struct {
			ID      string
			Reframe *production.TimelineReframe
		}
	}
	if json.Unmarshal(applied.Timeline, &after) != nil || after.Clips[0].Reframe == nil || after.Clips[1].Reframe != nil {
		t.Fatal("manual crop changed independent occurrence")
	}
	// Lost creation response followed by corrections/timeline changes returns
	// the existing current draft, never resets it to the proposed endpoints.
	replayed, err := s.CreateProjectManualFraming(ctx, "analysis-user", "analysis-project", req)
	if err != nil || !replayed.Replayed || replayed.View.CurrentVersion.ID != saved.AppliedVersion.ID || !bytes.Equal(replayed.View.Evidence, view.Evidence) {
		t.Fatal("creation replay lost later corrections or evidence", err)
	}
	other := req
	other.TargetAspect = 1
	_, err = s.CreateProjectManualFraming(ctx, "analysis-user", "analysis-project", other)
	var failure *AppError
	if !errors.As(err, &failure) || failure.Reason != "manual_framing_request_conflict" {
		t.Fatal("reused request with different intent accepted", err)
	}
	history, err := s.ProjectMediaAnalysisHistory("analysis-user", "analysis-project", view.Analysis.ID, 0, 20)
	if err != nil || len(history.Versions) != 2 {
		t.Fatal("duplicate draft/history created", err)
	}
	initial, err := s.GetProjectMediaAnalysis("analysis-user", "analysis-project", view.Analysis.ID, view.CurrentVersion.ID)
	if err != nil || initial.Document.Tracking[0].Reviewed || initial.Document.Tracking[0].Manual {
		t.Fatal("initial unreviewed version rewritten", err)
	}
	_, stream, err := s.OpenResource("analysis-user", resource.ID)
	if err != nil {
		t.Fatal(err)
	}
	got, err := io.ReadAll(stream)
	stream.Close()
	if err != nil || !bytes.Equal(got, original) {
		t.Fatal("manual crop modified original", err)
	}
	policy := defaultRuntimePolicy()
	policy.Resource.StructuredDataMB = 1
	if _, err := s.UpdateRuntimePolicySetting(&model.User{ID: "quota-admin", Role: model.UserRoleAdmin}, policy); err != nil {
		t.Fatal(err)
	}
	filler := model.Asset{ID: "manual-quota-filler", UserID: "analysis-user", Kind: "text", Category: model.AssetCategoryMaterial, Status: model.AssetVersionStatusConfirmed, Title: "quota", PayloadJSON: `{"text":"` + strings.Repeat("x", int(megabytes(1))) + `"}`}
	if err := db.Create(&filler).Error; err != nil {
		t.Fatal(err)
	}
	newRequest := req
	newRequest.RequestID, newRequest.ExpectedTimelineRevision = "manual-over-quota-request-1", &applied.Revision
	if _, err := s.CreateProjectManualFraming(ctx, "analysis-user", "analysis-project", newRequest); err == nil {
		t.Fatal("manual draft bypassed native document quota")
	}
	var records int64
	if err := db.Model(&model.ProjectMediaAnalysis{}).Count(&records).Error; err != nil || records != 1 {
		t.Fatal("quota failure left draft/receipt", err, records)
	}
	if replayed, err := s.CreateProjectManualFraming(ctx, "analysis-user", "analysis-project", req); err != nil || !replayed.Replayed {
		t.Fatal("existing creation receipt blocked by later quota", err)
	}
}
