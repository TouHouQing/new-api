package app

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
)

// The color/sine clips are declared encoding fixtures, not model generation.
// Production browser acceptance separately uses the actual MuseTalk candidates.
func TestNativeVideoReworkActualRegionAudioQueueAndOccurrenceBoundUndo(t *testing.T) {
	verifyNativeVideoRework(t, false)
}

func TestNativeVideoReworkActualReviewedFramingFadeAndUndo(t *testing.T) {
	verifyNativeVideoRework(t, true)
}

func verifyNativeVideoRework(t *testing.T, framed bool) {
	verifyNativeVideoReworkVersion(t, framed, 1)
}

func TestNativeVideoReworkWholeSourceActualOccurrenceAndUndo(t *testing.T) {
	verifyNativeVideoReworkVersion(t, false, 2)
}
func TestNativeVideoReworkWholeSourceActualReviewedCropAndUndo(t *testing.T) {
	verifyNativeVideoReworkVersion(t, true, 2)
}

func verifyNativeVideoReworkVersion(t *testing.T, framed bool, version int) {
	t.Helper()
	if os.Getenv("CANVAS_TEST_REAL_FFMPEG") != "1" {
		t.Skip("set CANVAS_TEST_REAL_FFMPEG=1 for actual video composition")
	}
	s, db := newMediaRecoveryTestService(t)
	if err := db.Create(&model.User{ID: "video-user", Username: "video-user", Role: model.UserRoleUser, Status: model.UserStatusActive}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.Project{ID: "video-project", UserID: "video-user", Name: "视频修复验证", Status: model.ProjectStatusActive, Revision: 1}).Error; err != nil {
		t.Fatal(err)
	}
	ffmpeg, err := renderFfmpegBinary()
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	directory := t.TempDir()
	run := func(args ...string) []byte {
		t.Helper()
		output, err := exec.CommandContext(ctx, ffmpeg, args...).CombinedOutput()
		if err != nil {
			t.Fatalf("Declared fixture encoding failed: %v %s", err, output)
		}
		return output
	}
	store := func(name, mime string, width, height int, duration int64) *model.Resource {
		t.Helper()
		file, err := os.Open(filepath.Join(directory, name))
		if err != nil {
			t.Fatal(err)
		}
		defer file.Close()
		stat, _ := file.Stat()
		resource, _, err := s.storeResource("video-user", "media", name, mime, stat.Size(), width, height, duration, file, nil, false)
		if err != nil {
			t.Fatal(err)
		}
		return resource
	}
	for _, fixture := range []struct{ name, color, hz string }{{"original.mp4", "red", "600"}, {"candidate.mp4", "blue", "1100"}} {
		run("-v", "error", "-y", "-f", "lavfi", "-i", "color=c="+fixture.color+":s=64x64:r=24:d=2", "-f", "lavfi", "-i", "sine=frequency="+fixture.hz+":sample_rate=48000:duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-movflags", "+faststart", filepath.Join(directory, fixture.name))
	}
	run("-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=300:sample_rate=16000:duration=5", filepath.Join(directory, "voice.wav"))
	original, candidate, voice := store("original.mp4", "video/mp4", 64, 64, 2000), store("candidate.mp4", "video/mp4", 64, 64, 2000), store("voice.wav", "audio/wav", 0, 0, 5000)
	media := func(resource *model.Resource, kind string) map[string]any {
		return map[string]any{"id": resource.ID, "kind": kind, "storageKey": "resource:" + resource.ID}
	}
	clips := []any{
		map[string]any{"id": "first-use", "kind": "video", "trackId": "video", "startMs": 0, "durationMs": 2000, "sourceStartMs": 0, "sourceDurationMs": 2000, "playbackRate": 1, "volume": .7, "directMedia": media(original, "video")},
		map[string]any{"id": "second-use", "kind": "video", "trackId": "video", "startMs": 3000, "durationMs": 2000, "sourceStartMs": 0, "sourceDurationMs": 2000, "playbackRate": .5, "directMedia": media(original, "video")},
		map[string]any{"id": "independent-voice", "kind": "audio", "trackId": "audio", "startMs": 0, "durationMs": 5000, "sourceStartMs": 0, "sourceDurationMs": 5000, "volume": .2, "directMedia": media(voice, "audio")},
		map[string]any{"id": "independent-caption", "kind": "subtitle", "trackId": "subtitles", "startMs": 600, "durationMs": 800, "text": "原字幕保留"},
	}
	raw, _ := json.Marshal(map[string]any{"version": 2, "tracks": []any{map[string]any{"id": "video", "kind": "video", "order": 0}, map[string]any{"id": "audio", "kind": "audio", "order": 1}, map[string]any{"id": "subtitles", "kind": "subtitle", "order": 2}}, "clips": clips, "durationMs": 5000})
	initial, err := s.SaveProjectTimeline("video-user", "video-project", SaveProjectTimelineRequest{Timeline: raw})
	if err != nil {
		t.Fatal(err)
	}
	if framed {
		clips[0].(map[string]any)["fadeInMs"], clips[0].(map[string]any)["fadeOutMs"] = 1000, 1000
		raw, _ = json.Marshal(map[string]any{"version": 2, "tracks": []any{map[string]any{"id": "video", "kind": "video", "order": 0}, map[string]any{"id": "audio", "kind": "audio", "order": 1}, map[string]any{"id": "subtitles", "kind": "subtitle", "order": 2}}, "clips": clips, "durationMs": 5000})
		revision := initial.Revision
		initial, err = s.SaveProjectTimeline("video-user", "video-project", SaveProjectTimelineRequest{Timeline: raw, ExpectedRevision: revision})
		if err != nil {
			t.Fatal(err)
		}
		created, err := s.CreateProjectManualFraming(ctx, "video-user", "video-project", ProjectManualFramingRequest{RequestID: "video-rework-framing-original", ResourceID: original.ID, SourceClipID: "first-use", ExpectedTimelineRevision: &initial.Revision, TargetAspect: .5})
		if err != nil {
			t.Fatal(err)
		}
		view := created.View
		document := view.Document
		for i := range document.Tracking {
			document.Tracking[i].Manual, document.Tracking[i].Reviewed = true, true
		}
		saved, err := s.SaveProjectMediaAnalysis("video-user", "video-project", view.Analysis.ID, ProjectMediaAnalysisWriteRequest{RequestID: "video-rework-framing-review", ExpectedRevision: &view.Analysis.Revision, Document: &document})
		if err != nil {
			t.Fatal(err)
		}
		adopt := MediaAnalysisMarkerRequest{ExpectedTimelineRevision: &initial.Revision, AnalysisRevisionID: saved.AppliedVersion.ID, SourceClipID: "first-use"}
		preview, err := s.PreviewProjectMediaAnalysisReframe("video-user", "video-project", view.Analysis.ID, adopt)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = s.ApplyProjectMediaAnalysisReframe("video-user", "video-project", view.Analysis.ID, MediaAnalysisMarkerApplyRequest{MediaAnalysisMarkerRequest: adopt, PreviewToken: preview.PreviewToken}); err != nil {
			t.Fatal(err)
		}
		initial, err = s.GetProjectTimeline("video-user", "video-project")
		if err != nil {
			t.Fatal(err)
		}
	}
	source, err := s.ReadVideoReworkSource("video-user", "video-project", "first-use")
	if err != nil || source.Media.Width != 64 || source.Media.DurationMs != 2000 || !source.HasAudio {
		t.Fatalf("Original bytes were not inspected: %+v %v", source, err)
	}
	selected, err := s.ReadVideoReworkMedia("video-user", "video-project", candidate.ID)
	if err != nil || !selected.HasAudio {
		t.Fatal(err)
	}
	request := VideoReworkCreateRequest{RequestID: "actual-video-rework-fixture-01", ExpectedRevision: initial.Revision, Edit: production.VideoReworkRequest{ClipID: "first-use", ClipSHA256: source.ClipSHA256, SourceResourceID: original.ID, SourceSHA256: source.Media.SHA256, SourceStartMs: 500, SourceEndMs: 1500, CandidateResourceID: candidate.ID, CandidateSHA256: selected.Media.SHA256, CandidateStartMs: 250, Audio: "original", Region: &production.VideoReworkRegion{X: 17, Y: 15, Width: 31, Height: 33}}}
	var task *model.Task
	if version == 2 {
		task, err = s.CreateVideoReworkTask("video-user", "video-project", request)
	} else {
		task, err = s.createVideoReworkTaskWithVersion("video-user", "video-project", request, 1)
	}
	if err != nil {
		t.Fatal(err)
	}
	replayed, err := s.CreateVideoReworkTask("video-user", "video-project", request)
	if err != nil || replayed.ID != task.ID {
		t.Fatal("Creation replay submitted another composition", err)
	}
	if _, err := s.CreateVideoReworkTask("other", "video-project", request); err == nil {
		t.Fatal("Another user admitted a native repair")
	}
	changed := request
	changed.Edit.Audio = "candidate"
	if _, err := s.CreateVideoReworkTask("video-user", "video-project", changed); err == nil {
		t.Fatal("Idempotency key admitted changed audio")
	}
	completed := runImageOperationTask(t, s, task.ID)
	if completed.Status != model.TaskStatusSucceeded {
		t.Fatalf("Actual region composition failed: %s %s", completed.Status, completed.Error)
	}
	var result struct {
		Video struct {
			ResourceID     string `json:"resourceId"`
			AssetVersionID string `json:"assetVersionId"`
		} `json:"video"`
	}
	if json.Unmarshal([]byte(completed.ResultJSON), &result) != nil || result.Video.ResourceID == "" || result.Video.AssetVersionID == "" {
		t.Fatal("Derived video lacks native fixed resource/version", completed.ResultJSON)
	}
	_, reader, err := s.OpenResource("video-user", result.Video.ResourceID)
	if err != nil {
		t.Fatal(err)
	}
	data, err := io.ReadAll(reader)
	reader.Close()
	if err != nil {
		t.Fatal(err)
	}
	outputPath := filepath.Join(directory, "saved.mp4")
	if err := os.WriteFile(outputPath, data, 0600); err != nil {
		t.Fatal(err)
	}
	decode := func(args ...string) []byte {
		t.Helper()
		output, err := exec.CommandContext(ctx, ffmpeg, args...).Output()
		if err != nil {
			t.Fatal(err)
		}
		return output
	}
	frameTime := "0.3"
	if version == 2 {
		frameTime = "0.8"
	}
	pixels := decode("-v", "error", "-ss", frameTime, "-i", outputPath, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1")
	minimum, maximum := byte(220), byte(255)
	if framed && version == 1 {
		minimum, maximum = 180, 215
	}
	if len(pixels) != 64*64*3 || pixels[(2*64+2)*3] < minimum || pixels[(2*64+2)*3] > maximum || pixels[(2*64+2)*3+2] > 30 || pixels[(32*64+32)*3+2] < minimum || pixels[(32*64+32)*3+2] > maximum || pixels[(32*64+32)*3] > 30 {
		t.Fatal("Region composition changed the original outside the patch or failed to use candidate pixels")
	}
	pcm := decode("-v", "error", "-i", outputPath, "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "pipe:1")
	energy := func(hz float64) float64 {
		var x, y float64
		for i := 800; i < len(pcm)/4-800; i++ {
			value := float64(math.Float32frombits(binary.LittleEndian.Uint32(pcm[i*4:])))
			angle := 2 * math.Pi * hz * float64(i) / 16000
			x += value * math.Sin(angle)
			y += value * math.Cos(angle)
		}
		return math.Hypot(x, y)
	}
	if len(pcm) < 16000*4 || energy(600) < 20*energy(1100) {
		t.Fatal("Selecting original audio used the candidate dialogue or truncated the interval")
	}
	apply := TimelineEditRequest{RequestID: "apply-real-video-rework-01", ExpectedRevision: initial.Revision, Commands: []production.TimelineEditCommand{{Op: "applyVideoRepair", ID: "first-use", RepairTaskID: task.ID}}}
	preview, err := s.PreviewTimelineEdits("video-user", "video-project", apply)
	wantedAction := "add"
	if version == 2 {
		wantedAction = "change"
	}
	if err != nil || len(preview.Changes) != 1 || preview.Changes[0].Action != wantedAction {
		t.Fatalf("Adoption did not preserve other occurrences/voices/captions: %+v %v", preview, err)
	}
	apply.PreviewToken = preview.PreviewToken
	applied, err := s.ApplyTimelineEdits("video-user", "video-project", apply)
	if err != nil {
		t.Fatal(err)
	}
	if replay, err := s.ApplyTimelineEdits("video-user", "video-project", apply); err != nil || !replay.Replayed || replay.AppliedRevision != applied.AppliedRevision {
		t.Fatal("Adoption replay duplicated or changed the working cut", err)
	}
	after, err := s.GetProjectTimeline("video-user", "video-project")
	if err != nil {
		t.Fatal(err)
	}
	var afterDocument map[string]any
	json.Unmarshal(after.Timeline, &afterDocument)
	var initialDocument map[string]any
	json.Unmarshal(initial.Timeline, &initialDocument)
	beforeClips, afterClips := initialDocument["clips"].([]any), afterDocument["clips"].([]any)
	if version == 1 && !reflect.DeepEqual(afterClips[:4], beforeClips) || version == 2 && (!reflect.DeepEqual(afterClips[1:], beforeClips[1:]) || !reflect.DeepEqual(afterDocument["tracks"], initialDocument["tracks"])) {
		t.Fatal("Adoption changed original clip, repeated use, voice or captions")
	}
	if framed {
		derivedIndex := 4
		if version == 2 {
			derivedIndex = 0
		}
		derived := afterClips[derivedIndex].(map[string]any)
		if derived["reframe"] == nil || version == 1 && (derived["fadeInMs"] != nil || derived["fadeOutMs"] != nil) || version == 2 && (derived["fadeInMs"] != float64(1000) || derived["fadeOutMs"] != float64(1000)) {
			t.Fatal("Derived occurrence lost native framing or applied the baked fade twice")
		}
		framingID, _ := videoReworkFramingIDs(task.ID)
		view, err := s.GetProjectMediaAnalysis("video-user", "video-project", framingID, "")
		expectedEnd := int64(1000)
		if version == 2 {
			expectedEnd = 2000
		}
		if err != nil || view.Analysis.SourceKind != "video_rework" || view.Source.ResourceID != result.Video.ResourceID || view.Source.StartMs != 0 || view.Source.EndMs != expectedEnd || len(view.Document.Tracking) < 2 {
			t.Fatalf("Derived framing not registered on the new source clock: %+v %v", view, err)
		}
	}
	undoID := "repair-clip:" + task.ID
	if version == 2 {
		undoID = "first-use"
	}
	_, digest, err := production.ReadVideoReworkClip(after.Timeline, undoID)
	if err != nil {
		t.Fatal(err)
	}
	undo := TimelineEditRequest{RequestID: "undo-real-video-rework-01", ExpectedRevision: after.Revision, Commands: []production.TimelineEditCommand{{Op: "removeVideoRepair", ID: undoID, RepairTaskID: task.ID, ExpectedClipSHA256: digest}}}
	undoPreview, err := s.PreviewTimelineEdits("video-user", "video-project", undo)
	if err != nil {
		t.Fatal(err)
	}
	undo.PreviewToken = undoPreview.PreviewToken
	if _, err := s.ApplyTimelineEdits("video-user", "video-project", undo); err != nil {
		t.Fatal(err)
	}
	final, err := s.GetProjectTimeline("video-user", "video-project")
	if err != nil || !bytes.Equal(final.Timeline, initial.Timeline) {
		t.Fatalf("Undo did not restore exact original native document: %v", err)
	}
	if replay, err := s.ReadVideoReworkTask("video-user", "video-project", request.RequestID); err != nil || replay.ID != task.ID || replay.Status != model.TaskStatusSucceeded {
		t.Fatal("Original repair receipt was lost after adoption/undo", err)
	}
	if version == 2 && framed {
		verifyWholeSourceVideoReworkLaterEdits(t, s, task.ID, result.Video.ResourceID, original.ID)
	}
}

func TestNativeVideoReworkActualFadeAudioAndAllVisibleIntervals(t *testing.T) {
	if os.Getenv("CANVAS_TEST_REAL_FFMPEG") != "1" {
		t.Skip("explicit FFmpeg required")
	}
	ffmpeg, err := renderFfmpegBinary()
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	directory := t.TempDir()
	original, candidate, finished := filepath.Join(directory, "original.mp4"), filepath.Join(directory, "candidate.mp4"), filepath.Join(directory, "finished.mp4")
	run := func(args ...string) []byte {
		t.Helper()
		command := exec.CommandContext(ctx, ffmpeg, args...)
		out, err := command.Output()
		if err != nil {
			t.Fatalf("actual fade encoding: %v", err)
		}
		return out
	}
	run("-v", "error", "-y", "-f", "lavfi", "-i", "color=white:s=64x64:r=24:d=4", "-f", "lavfi", "-i", "sine=frequency=600:sample_rate=48000:duration=4", "-c:v", "libx264", "-threads", "1", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", original)
	plan := production.VideoReworkPlan{Version: 1, Request: production.VideoReworkRequest{SourceStartMs: 1500, SourceEndMs: 2500, CandidateStartMs: 1500, Audio: "original"}, Source: production.VideoReworkMedia{Width: 64, Height: 64}, Candidate: production.VideoReworkMedia{Width: 64, Height: 64}, ProgramStartMs: 1500, ProgramEndMs: 2500, PlaybackRate: 1, OriginalFade: &production.VideoReworkFade{OffsetMs: 1500, DurationMs: 4000, FadeInMs: 2000, FadeOutMs: 2000}}
	args, err := buildVideoReworkFFmpegArgs(plan, original, original, candidate, 24, true, true)
	if err != nil {
		t.Fatal(err)
	}
	run(args...)
	before := renderClipFixture("original", "video", "base", 0, 4000, "resource:original")
	before.FadeInMs, before.FadeOutMs, before.Volume = 2000, 2000, .7
	patch := renderClipFixture("repair", "video", "patch", 1500, 1000, "resource:repair")
	patch.Volume = .7
	render := buildRenderPlan(renderProject{Version: 2, Output: &timelineRenderFormat{Width: 64, Height: 64, FPS: 24}, Tracks: []renderTrack{{ID: "base", Kind: "video", Order: 0}, {ID: "patch", Kind: "video", Order: -1}}, Clips: []renderClip{before, patch}})
	// As in the native worker, the validated output format is applied after
	// the occurrence layout is resolved; buildRenderPlan only resolves layout.
	render.Output = timelineRenderFormat{Width: 64, Height: 64, FPS: 24}
	if len(render.Segments) != 3 {
		t.Fatal("repair failed to retain two visible original intervals")
	}
	for index := range render.Segments {
		path := original
		if render.Segments[index].Clip.ID == "repair" {
			path = candidate
		}
		render.Segments[index].Source = &renderSource{Path: path, HasAudio: true}
	}
	run(buildRenderFFmpegArgs(render, finished)...)
	for _, at := range []float64{.25, 1.25, 1.75, 2.25, 2.75, 3.75} {
		pixels := run("-v", "error", "-ss", fmt.Sprintf("%.3f", at), "-i", finished, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1")
		if len(pixels) != 64*64*3 {
			t.Fatal("missing decoded fade frame")
		}
		var mean float64
		for _, value := range pixels {
			mean += float64(value)
		}
		mean /= float64(len(pixels))
		gain := math.Min(at/2, (4-at)/2)
		if math.Abs(mean-255*gain) > 10 {
			t.Fatalf("video fade reset at %.2fs: pixel %.2f expected %.2f", at, mean, 255*gain)
		}
		pcm := run("-v", "error", "-ss", fmt.Sprintf("%.3f", at-.02), "-t", "0.04", "-i", finished, "-vn", "-ar", "16000", "-ac", "1", "-f", "f32le", "pipe:1")
		var energy float64
		for i := 0; i+4 <= len(pcm); i += 4 {
			v := float64(math.Float32frombits(binary.LittleEndian.Uint32(pcm[i:])))
			energy += v * v
		}
		rms := math.Sqrt(energy / float64(len(pcm)/4))
		if math.Abs(rms-.0884*.7*gain) > .012 {
			t.Fatalf("audio envelope jumped at %.2fs: rms %.4f", at, rms)
		}
	}
}

func TestNativeVideoReworkRejectsGenericModelAdmissionAndSupportsLocalCancellation(t *testing.T) {
	if err := validateTaskType(model.TaskTypeVideoRework); err == nil {
		t.Fatal("Generic model API admitted a CPU repair without native source/clock validation")
	}
	s, db := legacyImportService(t)
	task := model.Task{ID: "owned-video-rework", UserID: "owner", Type: model.TaskTypeVideoRework, Provider: "local", Model: "ffmpeg", Status: model.TaskStatusRunning, Stage: "合成所选区域与时间"}
	if err := db.Create(&task).Error; err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	s.activeCancels[task.ID] = cancel
	result, err := s.CancelTask(context.Background(), "owner", task.ID)
	if err != nil || result.Status != model.TaskStatusCancelled || ctx.Err() != context.Canceled {
		t.Fatalf("Native CPU cancellation failed: %+v %v", result, err)
	}
	if taskExecutionTimeoutWithPolicy(model.TaskTypeVideoRework, RuntimeTaskPolicy{}) != 20*time.Minute || !taskTypeProducesStoredFile(model.TaskTypeVideoRework) {
		t.Fatal("CPU repair lost its bounded timeout or file-capacity admission")
	}
}
