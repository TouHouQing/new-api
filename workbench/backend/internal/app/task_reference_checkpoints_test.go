package app

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"sync/atomic"
	"testing"

	"yingce/backend/internal/model"
)

func TestLongReferenceActualCheckpointsResumeWithoutRepeatingCompletedWindows(t *testing.T) {
	actual, _ := configureRealAnalysisWorker(t)
	if os.Getenv("CANVAS_TEST_REAL_FFMPEG") != "1" {
		t.Skip("explicit installed FFmpeg required")
	}
	s, db := newMediaRecoveryTestService(t)
	seedAnalysisAudio(t, s, db)
	file := filepath.Join(t.TempDir(), "known-66-second-reference.mp4")
	if output, err := exec.Command("ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=black:s=160x90:r=8:d=20", "-f", "lavfi", "-i", "color=white:s=160x90:r=8:d=30", "-f", "lavfi", "-i", "color=black:s=160x90:r=8:d=16", "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0[out]", "-map", "[out]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-threads", "1", file).CombinedOutput(); err != nil {
		t.Fatalf("actual long reference fixture: %v %s", err, output)
	}
	original, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	resource, _, err := s.storeResource("analysis-user", "video", "reference-66-seconds.mp4", "video/mp4", int64(len(original)), 160, 90, 66000, bytes.NewReader(original), nil, false)
	if err != nil {
		t.Fatal(err)
	}
	var calls atomic.Int32
	var taskID string
	var cancelled atomic.Bool
	// The measurements are real. A transport seam cancels the native task
	// exactly when its second interval is requested, after checkpoint1 commits.
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/analyze" && calls.Add(1) == 2 {
			if _, err := s.CancelTask(context.Background(), "analysis-user", taskID); err != nil {
				t.Error(err)
			} else {
				cancelled.Store(true)
			}
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		request, err := http.NewRequestWithContext(r.Context(), r.Method, actual+r.URL.RequestURI(), r.Body)
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
			w.WriteHeader(502)
			return
		}
		defer response.Body.Close()
		w.WriteHeader(response.StatusCode)
		_, _ = io.Copy(w, response.Body)
	}))
	defer proxy.Close()
	t.Setenv(mediaAnalysisWorkerURLEnv, proxy.URL)
	request := MediaAnalysisCreateRequest{RequestID: "long-reference-actual-resume-1", ProjectID: "analysis-project", ResourceID: resource.ID, Kind: "reference_video", LongReference: true}
	task, err := s.CreateMediaAnalysisTask(context.Background(), "analysis-user", request)
	if err != nil {
		t.Fatal(err)
	}
	taskID = task.ID
	claimed := claimAnalysisTask(t, s, task.ID)
	if err := s.taskWorker().processClaimedTask(claimed, nil); err != nil {
		t.Fatal(err)
	}
	interrupted, err := s.repo.Task(task.ID)
	if err != nil || interrupted.Status != model.TaskStatusCancelled || !cancelled.Load() {
		t.Fatal("native cancellation did not interrupt checkpoint sequence", err, interrupted)
	}
	var checkpoints int64
	if err := db.Model(&model.ProjectMediaAnalysis{}).Where("source_kind = ?", "reference_checkpoint").Count(&checkpoints).Error; err != nil || checkpoints != 1 {
		t.Fatal("completed first interval not checkpointed", err, checkpoints)
	}
	page, err := s.ListProjectMediaAnalyses("analysis-user", "analysis-project", "", "", "", true, 20)
	if err != nil || len(page.Analyses) != 0 {
		t.Fatal("internal checkpoints leaked into user archive", err, page)
	}
	firstID := mediaAnalysisID("reference-window-v1", task.ID, "0")
	first, err := s.GetProjectMediaAnalysis("analysis-user", "analysis-project", firstID, "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.SaveProjectMediaAnalysis("analysis-user", "analysis-project", firstID, ProjectMediaAnalysisWriteRequest{RequestID: "should-not-mutate-checkpoint", ExpectedRevision: &first.Analysis.Revision, Document: &first.Document}); err == nil {
		t.Fatal("internal checkpoint editable")
	}
	retried, err := s.RetryTask("analysis-user", task.ID)
	if err != nil || retried.ID != task.ID {
		t.Fatal("native same-task recovery unavailable", err)
	}
	claimed = claimAnalysisTask(t, s, task.ID)
	if err := s.taskWorker().processClaimedTask(claimed, nil); err != nil {
		t.Fatal(err)
	}
	done, err := s.repo.Task(task.ID)
	if err != nil || done.Status != model.TaskStatusSucceeded {
		t.Fatal("long reference did not complete", err, done.Error)
	}
	if calls.Load() != 3 {
		t.Fatal("repeated a completed interval or skipped remaining measurement", calls.Load())
	}
	var result struct {
		AnalysisID string `json:"analysisId"`
	}
	if json.Unmarshal([]byte(done.ResultJSON), &result) != nil {
		t.Fatal("missing final analysis")
	}
	view, err := s.GetProjectMediaAnalysis("analysis-user", "analysis-project", result.AnalysisID, "")
	if err != nil {
		t.Fatal(err)
	}
	if !view.Source.Windowed || view.Source.EndMs != 66000 || len(view.Document.Sections) != 3 || view.Document.Sections[1].StartMs != 20000 || view.Document.Sections[2].StartMs != 50000 {
		t.Fatal("lost actual cuts or inserted artificial55s seam", view.Source, view.Document.Sections)
	}
	for _, section := range view.Document.Sections {
		if section.Approved {
			t.Fatal("automatically approved reference measurement")
		}
	}
	page, err = s.ListProjectMediaAnalyses("analysis-user", "analysis-project", "", "", "", false, 20)
	if err != nil || len(page.Analyses) != 1 || page.Analyses[0].ID != view.Analysis.ID {
		t.Fatal("native list lacks unique aggregate", err, page)
	}
	digest := sha256.Sum256(original)
	if view.Source.SHA256 != hex.EncodeToString(digest[:]) {
		t.Fatal("source identity changed")
	}
	_, stream, err := s.OpenResource("analysis-user", resource.ID)
	if err != nil {
		t.Fatal(err)
	}
	actualBytes, err := io.ReadAll(stream)
	stream.Close()
	if err != nil || !bytes.Equal(actualBytes, original) {
		t.Fatal("long analysis changed original", err)
	}
}
