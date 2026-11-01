package app

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/assets"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
	"yingce/backend/internal/repository"
)

func configureRealAnalysisWorker(t *testing.T) (string, string) {
	t.Helper()
	base, secret := os.Getenv("CANVAS_TEST_MEDIA_ANALYSIS_URL"), os.Getenv("CANVAS_TEST_MEDIA_ANALYSIS_SECRET_FILE")
	if base == "" || secret == "" {
		t.Skip("explicit installed CPU worker is not configured")
	}
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	t.Setenv(mediaAnalysisWorkerURLEnv, base)
	t.Setenv(mediaAnalysisWorkerSecretEnv, secret)
	return base, secret
}

func seedAnalysisAudio(t *testing.T, s *Service, db *gorm.DB) (*model.Resource, []byte) {
	t.Helper()
	user := model.User{ID: "analysis-user", Username: "analysis-user", Role: model.UserRoleUser, Status: model.UserStatusActive}
	if err := db.FirstOrCreate(&user, "id = ?", user.ID).Error; err != nil {
		t.Fatal(err)
	}
	project := model.Project{ID: "analysis-project", UserID: user.ID, Name: "真实CPU分析", AspectRatio: "16:9", Status: model.ProjectStatusActive, Revision: 1}
	if err := db.FirstOrCreate(&project, "id = ?", project.ID).Error; err != nil {
		t.Fatal(err)
	}
	const rate = 22050
	raw := make([]byte, 44+rate*2*6)
	copy(raw, "RIFF")
	binary.LittleEndian.PutUint32(raw[4:], uint32(len(raw)-8))
	copy(raw[8:], "WAVEfmt ")
	binary.LittleEndian.PutUint32(raw[16:], 16)
	binary.LittleEndian.PutUint16(raw[20:], 1)
	binary.LittleEndian.PutUint16(raw[22:], 1)
	binary.LittleEndian.PutUint32(raw[24:], rate)
	binary.LittleEndian.PutUint32(raw[28:], rate*2)
	binary.LittleEndian.PutUint16(raw[32:], 2)
	binary.LittleEndian.PutUint16(raw[34:], 16)
	copy(raw[36:], "data")
	binary.LittleEndian.PutUint32(raw[40:], uint32(len(raw)-44))
	resource, _, err := s.storeResource(user.ID, "audio", "silence-ground-truth.wav", "audio/wav", int64(len(raw)), 0, 0, 0, bytes.NewReader(raw), nil, false)
	if err != nil {
		t.Fatal(err)
	}
	return resource, raw
}

func claimAnalysisTask(t *testing.T, s *Service, id string) *model.Task {
	t.Helper()
	task, err := s.repo.ClaimNextTask("native-analysis-test-worker", time.Minute)
	if err != nil || task == nil || task.ID != id {
		t.Fatal("native analysis claim failed", err)
	}
	return task
}

func TestMediaAnalysisRealNativeQueueVersionsAndReplay(t *testing.T) {
	configureRealAnalysisWorker(t)
	s, db := newMediaRecoveryTestService(t)
	verifyRealAnalysisLifecycle(t, s, db)
}

func TestMediaAnalysisRealVideoWindowAndDoubleSpeedMarkerMapping(t *testing.T) {
	configureRealAnalysisWorker(t)
	s, db := newMediaRecoveryTestService(t)
	seedAnalysisAudio(t, s, db)
	path := filepath.Join(t.TempDir(), "three-known-cuts.mp4")
	command := exec.Command("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=320x180:r=24:d=1", "-f", "lavfi", "-i", "color=c=blue:s=320x180:r=24:d=1", "-f", "lavfi", "-i", "color=c=green:s=320x180:r=24:d=1", "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0[out]", "-map", "[out]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-threads", "1", path)
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("actual FFmpeg fixture: %v %s", err, output)
	}
	bytesOnDisk, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	resource, _, err := s.storeResource("analysis-user", "video", "three-known-cuts.mp4", "video/mp4", int64(len(bytesOnDisk)), 320, 180, 3000, bytes.NewReader(bytesOnDisk), nil, false)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(map[string]any{"version": 2, "tracks": []any{map[string]any{"id": "v", "kind": "video"}}, "clips": []any{map[string]any{"id": "video-occurrence", "kind": "video", "nodeId": "v", "trackId": "v", "startMs": 5000, "durationMs": 1000, "sourceStartMs": 1000, "sourceDurationMs": 3000, "playbackRate": 2, "directMedia": map[string]any{"id": resource.ID, "kind": "video", "storageKey": "resource:" + resource.ID}}}})
	timeline, err := s.SaveProjectTimeline("analysis-user", "analysis-project", SaveProjectTimelineRequest{Timeline: raw})
	if err != nil {
		t.Fatal(err)
	}
	task, err := s.CreateMediaAnalysisTask(context.Background(), "analysis-user", MediaAnalysisCreateRequest{ProjectID: "analysis-project", ResourceID: resource.ID, SourceClipID: "video-occurrence", Kind: "reference_video", RequestID: "actual-video-cuts-window-rate-1"})
	if err != nil {
		t.Fatal(err)
	}
	claimed := claimAnalysisTask(t, s, task.ID)
	if err := s.taskWorker().processClaimedTask(claimed, nil); err != nil {
		t.Fatal(err)
	}
	finished, err := s.repo.Task(task.ID)
	if err != nil || finished.Status != model.TaskStatusSucceeded {
		t.Fatal("actual video analysis failed", err, finished.Error)
	}
	var result struct {
		AnalysisID string `json:"analysisId"`
	}
	_ = json.Unmarshal([]byte(finished.ResultJSON), &result)
	view, err := s.GetProjectMediaAnalysis("analysis-user", "analysis-project", result.AnalysisID, "")
	if err != nil {
		t.Fatal(err)
	}
	if view.Source.StartMs != 1000 || view.Source.EndMs != 3000 || len(view.Document.Sections) != 2 || view.Document.Sections[1].StartMs != 2000 {
		t.Fatalf("actual source cuts changed: %+v %+v", view.Source, view.Document.Sections)
	}
	doc := view.Document
	doc.Sections[1].Approved = true
	version := view.Analysis.Revision
	saved, err := s.SaveProjectMediaAnalysis("analysis-user", "analysis-project", view.Analysis.ID, ProjectMediaAnalysisWriteRequest{RequestID: "actual-video-cut-confirmation-1", ExpectedRevision: &version, Document: &doc})
	if err != nil {
		t.Fatal(err)
	}
	preview, err := s.PreviewProjectMediaAnalysisMarkers("analysis-user", "analysis-project", view.Analysis.ID, MediaAnalysisMarkerRequest{ExpectedTimelineRevision: &timeline.Revision, AnalysisRevisionID: saved.AppliedVersion.ID, SourceClipID: "video-occurrence"})
	if err != nil || len(preview.Added) != 1 || preview.Added[0].TimeMs != 5500 {
		t.Fatal("actual cut did not map to 2x occurrence", err, preview.Added)
	}
	_, stream, err := s.OpenResource("analysis-user", resource.ID)
	if err != nil {
		t.Fatal(err)
	}
	actual, err := io.ReadAll(stream)
	stream.Close()
	if err != nil || !bytes.Equal(actual, bytesOnDisk) {
		t.Fatal("source video modified", err)
	}
}

func TestMediaAnalysisRealPostgresQueueAndCorrectionCAS(t *testing.T) {
	configureRealAnalysisWorker(t)
	s, db := newProjectNameConflictPostgresService(t)
	s.dataDir = t.TempDir()
	s.activeCancels = map[string]context.CancelFunc{}
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	verifyRealAnalysisLifecycle(t, s, db)
}

func verifyRealAnalysisLifecycle(t *testing.T, s *Service, db *gorm.DB) {
	t.Helper()
	resource, original := seedAnalysisAudio(t, s, db)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	request := MediaAnalysisCreateRequest{RequestID: "real-native-analysis-lifecycle-1", ProjectID: "analysis-project", ResourceID: resource.ID, Kind: "audio_structure"}
	task, err := s.CreateMediaAnalysisTask(ctx, "analysis-user", request)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(task.InputJSON, "workerConfigCipher") {
		t.Fatal("private worker configuration exposed")
	}
	queuedRefs, err := s.repo.ResourceReferenceSnapshot("analysis-user", "", []string{resource.ID})
	if err != nil {
		t.Fatal(err)
	}
	queuedProtected := false
	for _, ref := range queuedRefs.Direct {
		if ref.ResourceID == resource.ID {
			queuedProtected = true
		}
	}
	for _, document := range queuedRefs.Documents {
		if document.Kind == "任务" && document.ID == task.ID && assets.DocumentReferences(document.PrimaryJSON, map[string]struct{}{resource.ID: {}}) {
			queuedProtected = true
		}
	}
	if !queuedProtected {
		t.Fatal("queued native analysis did not protect its original source")
	}
	replayed, err := s.CreateMediaAnalysisTask(ctx, "analysis-user", request)
	if err != nil || replayed.ID != task.ID {
		t.Fatal("task replay created another intent", err)
	}
	other := request
	other.Title = "changed intent"
	if _, err := s.CreateMediaAnalysisTask(ctx, "analysis-user", other); err == nil {
		t.Fatal("request reused with another intent")
	}
	// A queued task retains its encrypted approved worker even if live settings change.
	t.Setenv(mediaAnalysisWorkerURLEnv, "http://127.0.0.1:1")
	t.Setenv(mediaAnalysisWorkerSecretEnv, "missing-token-after-queue")
	claimed := claimAnalysisTask(t, s, task.ID)
	if err := s.taskWorker().processClaimedTask(claimed, nil); err != nil {
		t.Fatal(err)
	}
	finished, err := s.repo.Task(task.ID)
	if err != nil || finished.Status != model.TaskStatusSucceeded || finished.BillingOrderID != "" {
		t.Fatal("CPU analysis failed or billed", err, finished.Error)
	}
	var outcome struct {
		AnalysisID string `json:"analysisId"`
	}
	if err := json.Unmarshal([]byte(finished.ResultJSON), &outcome); err != nil || outcome.AnalysisID == "" {
		t.Fatal("missing native analysis", err)
	}
	view, err := s.GetProjectMediaAnalysis("analysis-user", "analysis-project", outcome.AnalysisID, "")
	if err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(original)
	if view.Source.SHA256 != hex.EncodeToString(digest[:]) || view.Source.DurationMs != 6000 || len(view.Document.Sections) != 1 || len(view.Document.Beats) != 0 || view.Document.Sections[0].Approved {
		t.Fatal("measured source/annotations mismatch")
	}
	var measured struct {
		Silent bool   `json:"silent"`
		Kind   string `json:"kind"`
	}
	if json.Unmarshal(view.Evidence, &measured) != nil || !measured.Silent || measured.Kind != "audio_structure" {
		t.Fatal("actual silence was not measured")
	}
	immutableEvidence := string(view.Evidence)
	version := view.Analysis.Revision
	doc := view.Document
	doc.Sections[0].Title = "人工确认静音参考"
	doc.Sections[0].Approved = true
	write := ProjectMediaAnalysisWriteRequest{RequestID: "real-analysis-edit-request-1", ExpectedRevision: &version, Document: &doc, Note: "人工核对"}
	saved, err := s.SaveProjectMediaAnalysis("analysis-user", "analysis-project", outcome.AnalysisID, write)
	if err != nil || saved.Replayed || saved.View.Analysis.Revision != 2 {
		t.Fatal("native correction failed", err)
	}
	verifyAnalysisMarkerAdoption(t, s, resource, saved.View)
	repeated, err := s.SaveProjectMediaAnalysis("analysis-user", "analysis-project", outcome.AnalysisID, write)
	if err != nil || !repeated.Replayed || repeated.AppliedVersion.ID != saved.AppliedVersion.ID {
		t.Fatal("lost-save-response replay created a revision", err)
	}
	changed := write
	changed.Note = "different request"
	if _, err := s.SaveProjectMediaAnalysis("analysis-user", "analysis-project", outcome.AnalysisID, changed); err == nil {
		t.Fatal("changed intent reused save key")
	}
	stale := write
	stale.RequestID = "real-analysis-stale-request-1"
	if _, err := s.SaveProjectMediaAnalysis("analysis-user", "analysis-project", outcome.AnalysisID, stale); err == nil {
		t.Fatal("stale correction was applied")
	}
	if _, err := s.GetProjectMediaAnalysis("foreign-user", "analysis-project", outcome.AnalysisID, ""); err == nil {
		t.Fatal("foreign user read analysis")
	}
	latest := saved.View.Analysis.Revision
	restored, err := s.SaveProjectMediaAnalysis("analysis-user", "analysis-project", outcome.AnalysisID, ProjectMediaAnalysisWriteRequest{RequestID: "real-analysis-restore-request-1", ExpectedRevision: &latest, RestoreRevisionID: view.CurrentVersion.ID})
	if err != nil || restored.View.Document.Sections[0].Approved || string(restored.View.Evidence) != immutableEvidence {
		t.Fatal("restoring annotations changed original evidence", err)
	}
	history, err := s.ProjectMediaAnalysisHistory("analysis-user", "analysis-project", outcome.AnalysisID, 0, 20)
	if err != nil || len(history.Versions) != 3 {
		t.Fatal("native correction history missing", err)
	}
	refs, err := s.repo.ResourceReferenceSnapshot("analysis-user", "", []string{resource.ID})
	if err != nil {
		t.Fatal(err)
	}
	protected := false
	for _, ref := range refs.Direct {
		if ref.Kind == "项目素材分析" && ref.ResourceID == resource.ID {
			protected = true
		}
	}
	if !protected {
		t.Fatal("analysis did not protect original media")
	}
	_, reader, err := s.OpenResource("analysis-user", resource.ID)
	if err != nil {
		t.Fatal(err)
	}
	actual, err := io.ReadAll(reader)
	reader.Close()
	if err != nil || !bytes.Equal(actual, original) {
		t.Fatal("original audio changed", err)
	}
}

func verifyAnalysisMarkerAdoption(t *testing.T, s *Service, resource *model.Resource, view ProjectMediaAnalysisView) {
	t.Helper()
	raw, _ := json.Marshal(map[string]any{"version": 2, "tracks": []any{map[string]any{"id": "a", "kind": "audio"}}, "clips": []any{map[string]any{"id": "target", "kind": "audio", "trackId": "a", "nodeId": "audio", "startMs": 5000, "durationMs": 3000, "sourceStartMs": 0, "sourceDurationMs": 6000, "playbackRate": 2, "directMedia": map[string]any{"id": resource.ID, "kind": "audio", "storageKey": "resource:" + resource.ID}}}})
	baseline, err := s.SaveProjectTimeline("analysis-user", "analysis-project", SaveProjectTimelineRequest{ExpectedRevision: 0, Timeline: raw})
	if err != nil {
		t.Fatal("initial timeline save", err)
	}
	req := MediaAnalysisMarkerRequest{ExpectedTimelineRevision: &baseline.Revision, AnalysisRevisionID: view.CurrentVersion.ID, SourceClipID: "target"}
	preview, err := s.PreviewProjectMediaAnalysisMarkers("analysis-user", "analysis-project", view.Analysis.ID, req)
	if err != nil || len(preview.Added) != 1 || preview.Added[0].TimeMs != 5000 {
		t.Fatal("actual analysis marker plan", err, preview.Added)
	}
	if _, err := s.PreviewProjectMediaAnalysisMarkers("foreign-user", "analysis-project", view.Analysis.ID, req); err == nil {
		t.Fatal("foreign marker preview allowed")
	}
	apply := MediaAnalysisMarkerApplyRequest{MediaAnalysisMarkerRequest: req, PreviewToken: preview.PreviewToken}
	applied, err := s.ApplyProjectMediaAnalysisMarkers("analysis-user", "analysis-project", view.Analysis.ID, apply)
	if err != nil || applied.Revision != 2 {
		t.Fatal("native marker save", err)
	}
	if _, err := s.ApplyProjectMediaAnalysisMarkers("analysis-user", "analysis-project", view.Analysis.ID, apply); err == nil {
		t.Fatal("stale adoption replay applied twice")
	}
	var forged map[string]json.RawMessage
	_ = json.Unmarshal(applied.Timeline, &forged)
	var markers []production.TimelineProductionMarker
	_ = json.Unmarshal(forged["productionMarkers"], &markers)
	markers[0].Source.SourceTimeMs++
	forged["productionMarkers"], _ = json.Marshal(markers)
	invalid, _ := json.Marshal(forged)
	if _, err := s.SaveProjectTimeline("analysis-user", "analysis-project", SaveProjectTimelineRequest{ExpectedRevision: 2, Timeline: invalid}); err == nil {
		t.Fatal("forged measurement marker saved")
	}
	undone, err := s.SaveProjectTimeline("analysis-user", "analysis-project", SaveProjectTimelineRequest{ExpectedRevision: 2, Timeline: baseline.Timeline})
	if err != nil || undone.Revision != 3 {
		t.Fatal("native marker undo", err)
	}
	if _, err := s.ApplyProjectMediaAnalysisMarkers("analysis-user", "analysis-project", view.Analysis.ID, apply); err == nil {
		t.Fatal("old request reinserted undone marker")
	}
}

func TestMediaAnalysisRealLateResultCannotPublishAfterCancelAndCanResume(t *testing.T) {
	base, _ := configureRealAnalysisWorker(t)
	s, db := newMediaRecoveryTestService(t)
	resource, _ := seedAnalysisAudio(t, s, db)
	ready, release := make(chan struct{}), make(chan struct{})
	var delay sync.Once
	defer func() {
		select {
		case <-release:
		default:
			close(release)
		}
	}()
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		request, err := http.NewRequestWithContext(r.Context(), r.Method, base+r.URL.Path, r.Body)
		if err != nil {
			t.Error(err)
			w.WriteHeader(500)
			return
		}
		request.Header = r.Header.Clone()
		request.ContentLength = r.ContentLength
		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Error(err)
			w.WriteHeader(500)
			return
		}
		defer response.Body.Close()
		data, err := io.ReadAll(response.Body)
		if err != nil {
			t.Error(err)
			w.WriteHeader(500)
			return
		}
		if r.URL.Path == "/v1/analyze" {
			delay.Do(func() { close(ready); <-release })
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(response.StatusCode)
		_, _ = w.Write(data)
	}))
	defer proxy.Close()
	t.Setenv(mediaAnalysisWorkerURLEnv, proxy.URL)
	request := MediaAnalysisCreateRequest{RequestID: "real-cancelled-analysis-request-1", ProjectID: "analysis-project", ResourceID: resource.ID, Kind: "audio_structure"}
	task, err := s.CreateMediaAnalysisTask(context.Background(), "analysis-user", request)
	if err != nil {
		t.Fatal(err)
	}
	claimed := claimAnalysisTask(t, s, task.ID)
	done := make(chan error, 1)
	go func() { done <- s.taskWorker().processMediaAnalysis(claimed, context.Background()) }()
	select {
	case <-ready:
	case <-time.After(60 * time.Second):
		t.Fatal("real CPU output did not arrive")
	}
	if _, err := s.taskLifecycle().cancelTask(context.Background(), "analysis-user", task.ID); err != nil {
		t.Fatal(err)
	}
	close(release)
	select {
	case err := <-done:
		if !errors.Is(err, repository.ErrTaskStateConflict) {
			t.Fatal("late result bypassed cancellation fence", err)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("late output did not terminate")
	}
	var count int64
	db.Model(&model.ProjectMediaAnalysis{}).Count(&count)
	if count != 0 {
		t.Fatal("cancelled analysis published records")
	}
	current, err := s.repo.Task(task.ID)
	if err != nil || current.Status != model.TaskStatusCancelled {
		t.Fatal("late output changed cancelled state", err)
	}
	if _, err := s.taskLifecycle().retryTask("analysis-user", task.ID); err != nil {
		t.Fatal("cancelled CPU analysis could not resume", err)
	}
	// Retry preserves the same encrypted proxy and genuine measured cache entry.
	claimed = claimAnalysisTask(t, s, task.ID)
	if err := s.taskWorker().processClaimedTask(claimed, nil); err != nil {
		t.Fatal(err)
	}
	current, err = s.repo.Task(task.ID)
	if err != nil || current.Status != model.TaskStatusSucceeded || current.BillingOrderID != "" {
		t.Fatal("CPU resume failed or billed", err)
	}
	db.Model(&model.ProjectMediaAnalysis{}).Count(&count)
	if count != 1 {
		t.Fatal("resume did not publish exactly one analysis")
	}
}

func TestMediaAnalysisRealSourceChangeBeforeRegistrationNeverPublishes(t *testing.T) {
	base, _ := configureRealAnalysisWorker(t)
	s, db := newMediaRecoveryTestService(t)
	resource, _ := seedAnalysisAudio(t, s, db)
	var changed sync.Once
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		request, err := http.NewRequestWithContext(r.Context(), r.Method, base+r.URL.Path, r.Body)
		if err != nil {
			t.Error(err)
			w.WriteHeader(500)
			return
		}
		request.Header = r.Header.Clone()
		request.ContentLength = r.ContentLength
		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Error(err)
			w.WriteHeader(500)
			return
		}
		defer response.Body.Close()
		data, err := io.ReadAll(response.Body)
		if err != nil {
			t.Error(err)
			w.WriteHeader(500)
			return
		}
		if r.URL.Path == "/v1/analyze" && response.StatusCode == 200 {
			changed.Do(func() {
				if err := db.Model(&model.Resource{}).Where("id = ?", resource.ID).Update("e_tag", "source-changed-during-measurement").Error; err != nil {
					t.Error(err)
				}
			})
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(response.StatusCode)
		_, _ = w.Write(data)
	}))
	defer proxy.Close()
	t.Setenv(mediaAnalysisWorkerURLEnv, proxy.URL)
	task, err := s.CreateMediaAnalysisTask(context.Background(), "analysis-user", MediaAnalysisCreateRequest{RequestID: "actual-source-registration-fence-1", ProjectID: "analysis-project", ResourceID: resource.ID, Kind: "audio_structure"})
	if err != nil {
		t.Fatal(err)
	}
	claimed := claimAnalysisTask(t, s, task.ID)
	if err := s.taskWorker().processClaimedTask(claimed, nil); err == nil {
		t.Fatal("changed original registered an analysis result")
	}
	var count int64
	if err := db.Model(&model.ProjectMediaAnalysis{}).Where("source_task_id = ?", task.ID).Count(&count).Error; err != nil || count != 0 {
		t.Fatal("failed registration leaked analysis", err, count)
	}
	stored, err := s.repo.Task(task.ID)
	if err != nil || stored.Status == model.TaskStatusSucceeded || stored.BillingOrderID != "" {
		t.Fatal("failed registration published success or billing", err)
	}
}
