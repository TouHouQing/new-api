package app

import (
	"bytes"
	"compress/zlib"
	"context"
	"encoding/binary"
	"encoding/json"
	"hash/crc32"
	"image"
	"image/color"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/database"
	"yingce/backend/internal/imageops"
	"yingce/backend/internal/model"
)

func seedImageOperationSource(t *testing.T, s *Service, db *gorm.DB) (*model.Resource, []byte) {
	t.Helper()
	if err := db.FirstOrCreate(&model.User{ID: "image-user", Username: "image-user", Role: model.UserRoleUser}, "id = ?", "image-user").Error; err != nil {
		t.Fatal(err)
	}
	picture := image.NewNRGBA(image.Rect(0, 0, 31, 23))
	for y := 0; y < 23; y++ {
		for x := 0; x < 31; x++ {
			picture.SetNRGBA(x, y, color.NRGBA{uint8(x * 7), uint8(y * 9), uint8(x + y), uint8((x*19 + y*37) % 256)})
		}
	}
	var buffer bytes.Buffer
	if err := png.Encode(&buffer, picture); err != nil {
		t.Fatal(err)
	}
	resource, _, err := s.storeResource("image-user", "image", "original.png", "image/png", int64(buffer.Len()), 31, 23, 0, bytes.NewReader(buffer.Bytes()), nil, false)
	if err != nil {
		t.Fatal(err)
	}
	return resource, buffer.Bytes()
}

func imageOperationTestRequest(resourceID string) ImageOperationCreateRequest {
	return ImageOperationCreateRequest{RequestID: "image-operation-fixture-1", ResourceID: resourceID, Recipe: imageops.Recipe{Operation: "split", Split: &imageops.Split{Rows: 2, Columns: 3, HorizontalLines: []float64{0.37}, VerticalLines: []float64{0.23, 0.71}}}}
}

func runImageOperationTask(t *testing.T, s *Service, id string) *model.Task {
	t.Helper()
	task, err := s.repo.ClaimNextTask("image-fixture-worker", time.Minute)
	if err != nil || task == nil || task.ID != id {
		t.Fatalf("claim %v: %v", task, err)
	}
	if err := s.taskWorker().processClaimedTask(task, nil); err != nil {
		t.Fatal(err)
	}
	completed, err := s.repo.Task(id)
	if err != nil {
		t.Fatal(err)
	}
	return completed
}

func TestImageOperationUsesNativeQueueAssetsVersionsAndStableRetry(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	verifyImageOperationNativeContracts(t, s, db)
}

func TestImageOperationNativeQueueKeeps16BitPixelsProfileAndOriginal(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	seedImageOperationSource(t, s, db)
	picture := image.NewNRGBA64(image.Rect(0, 0, 31, 23))
	for y := 0; y < 23; y++ {
		for x := 0; x < 31; x++ {
			picture.SetNRGBA64(x, y, color.NRGBA64{uint16(x*1001 + 17), uint16(y*1013 + 3), uint16(x + y*57 + 19), uint16((x + y) % 3)})
		}
	}
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, picture); err != nil {
		t.Fatal(err)
	}
	profile, err := os.ReadFile("../imageops/testdata/srgb.icc")
	if err != nil {
		t.Fatal(err)
	}
	var compressed bytes.Buffer
	writer := zlib.NewWriter(&compressed)
	if _, err := writer.Write(profile); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	body := append([]byte("ICC profile\x00\x00"), compressed.Bytes()...)
	chunk := make([]byte, 12+len(body))
	binary.BigEndian.PutUint32(chunk, uint32(len(body)))
	copy(chunk[4:], "iCCP")
	copy(chunk[8:], body)
	binary.BigEndian.PutUint32(chunk[len(chunk)-4:], crc32.ChecksumIEEE(chunk[4:len(chunk)-4]))
	raw := append(append(append([]byte{}, encoded.Bytes()[:33]...), chunk...), encoded.Bytes()[33:]...)
	resource, _, err := s.storeResource("image-user", "image", "16-bit-original.png", "image/png", int64(len(raw)), 31, 23, 0, bytes.NewReader(raw), nil, false)
	if err != nil {
		t.Fatal(err)
	}
	request := imageOperationTestRequest(resource.ID)
	task, err := s.CreateImageOperationTask("image-user", request)
	if err != nil {
		t.Fatal(err)
	}
	finished := runImageOperationTask(t, s, task.ID)
	if finished.Status != model.TaskStatusSucceeded || finished.BillingOrderID != "" {
		t.Fatal("CPU task failed or billed", finished.Error)
	}
	var result struct {
		Images []struct {
			ResourceID string         `json:"resourceId"`
			Piece      imageops.Piece `json:"piece"`
		} `json:"images"`
	}
	if err := json.Unmarshal([]byte(finished.ResultJSON), &result); err != nil || len(result.Images) != 6 {
		t.Fatal("missing concrete outputs", err)
	}
	for _, output := range result.Images {
		_, reader, err := s.OpenResource("image-user", output.ResourceID)
		if err != nil {
			t.Fatal(err)
		}
		data, err := io.ReadAll(reader)
		reader.Close()
		if err != nil || data[24] != 16 || !bytes.Contains(data, chunk) {
			t.Fatal("derived precision or original ICC lost", err)
		}
		decoded, err := png.Decode(bytes.NewReader(data))
		if err != nil {
			t.Fatal(err)
		}
		for y := 0; y < output.Piece.Height; y++ {
			for x := 0; x < output.Piece.Width; x++ {
				got := color.NRGBA64Model.Convert(decoded.At(x, y)).(color.NRGBA64)
				if got != picture.NRGBA64At(output.Piece.X+x, output.Piece.Y+y) {
					t.Fatal("native output changed original 16-bit sample")
				}
			}
		}
	}
	_, reader, err := s.OpenResource("image-user", resource.ID)
	if err != nil {
		t.Fatal(err)
	}
	actual, err := io.ReadAll(reader)
	reader.Close()
	if err != nil || !bytes.Equal(actual, raw) {
		t.Fatal("original media changed", err)
	}
}

func TestImageOperationCancelledWhileWaitingForMemoryNeverDecodesOrPublishes(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	resource, _ := seedImageOperationSource(t, s, db)
	task, err := s.CreateImageOperationTask("image-user", imageOperationTestRequest(resource.ID))
	if err != nil {
		t.Fatal(err)
	}
	claimed, err := s.repo.ClaimNextTask("memory-wait-fixture", time.Minute)
	if err != nil || claimed == nil {
		t.Fatal("cannot claim task", err)
	}
	if err := imageOperationMemory.Acquire(context.Background(), imageOperationMemoryBudget); err != nil {
		t.Fatal(err)
	}
	defer imageOperationMemory.Release(imageOperationMemoryBudget)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- s.taskWorker().processImageOperation(claimed, ctx) }()
	if _, err := s.taskLifecycle().cancelTask(context.Background(), "image-user", task.ID); err != nil {
		t.Fatal(err)
	}
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("memory admission ignored cancellation")
	}
	latest, err := s.repo.Task(task.ID)
	if err != nil || latest.Status != model.TaskStatusCancelled || latest.MediaRecoveryJSON != "" {
		t.Fatal("cancelled wait created a checkpoint", err)
	}
	var count int64
	if err := db.Model(&model.Asset{}).Count(&count).Error; err != nil || count != 0 {
		t.Fatal("cancelled wait published assets", err)
	}
}

func TestImageOperationPostgresNativeQueueAssetsAndConcurrentSubmission(t *testing.T) {
	s, db := newProjectNameConflictPostgresService(t)
	s.dataDir = t.TempDir()
	s.activeCancels = map[string]context.CancelFunc{}
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	verifyImageOperationNativeContracts(t, s, db)
	resource, _ := seedImageOperationSource(t, s, db)
	req := imageOperationTestRequest(resource.ID)
	req.RequestID = "concurrent-image-operation-fixture"
	var wg sync.WaitGroup
	ids := make(chan string, 4)
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			task, err := s.CreateImageOperationTask("image-user", req)
			if err != nil {
				t.Error(err)
				return
			}
			ids <- task.ID
		}()
	}
	wg.Wait()
	close(ids)
	first := ""
	for id := range ids {
		if first == "" {
			first = id
		}
		if id != first {
			t.Error("concurrent replay created another task")
		}
	}
	var count int64
	if err := db.Model(&model.Task{}).Where("id = ?", first).Count(&count).Error; err != nil || count != 1 {
		t.Fatal("concurrent task identity not unique", err)
	}
}

func verifyImageOperationNativeContracts(t *testing.T, s *Service, db *gorm.DB) {
	t.Helper()
	resource, original := seedImageOperationSource(t, s, db)
	req := imageOperationTestRequest(resource.ID)
	task, err := s.CreateImageOperationTask("image-user", req)
	if err != nil {
		t.Fatal(err)
	}
	replay, err := s.CreateImageOperationTask("image-user", req)
	if err != nil || replay.ID != task.ID {
		t.Fatalf("duplicate request %v", err)
	}
	changed := req
	changed.Recipe.Split = &imageops.Split{Rows: 3, Columns: 1}
	if _, err := s.CreateImageOperationTask("image-user", changed); err == nil {
		t.Fatal("same identity accepted changed recipe")
	}
	completed := runImageOperationTask(t, s, task.ID)
	if completed.Status != model.TaskStatusSucceeded || completed.BillingOrderID != "" || completed.MediaStage != "completed" {
		t.Fatalf("native CPU task failed: %s %s", completed.Status, completed.Error)
	}
	var result struct {
		Images []struct {
			ResourceID string `json:"resourceId"`
		}
		Operation imageOperationInput `json:"imageOperation"`
	}
	if err := json.Unmarshal([]byte(completed.ResultJSON), &result); err != nil || len(result.Images) != 6 {
		t.Fatal("missing six native outputs", err)
	}
	if result.Operation.Source.SHA256 == "" {
		t.Fatal("missing immutable source")
	}
	sourcePicture, err := png.Decode(bytes.NewReader(original))
	if err != nil {
		t.Fatal(err)
	}
	for index, item := range result.Images {
		_, reader, err := s.OpenResource("image-user", item.ResourceID)
		if err != nil {
			t.Fatal(err)
		}
		picture, err := png.Decode(reader)
		reader.Close()
		if err != nil {
			t.Fatal(err)
		}
		piece := result.Operation.Pieces[index]
		for y := 0; y < piece.Height; y++ {
			for x := 0; x < piece.Width; x++ {
				if color.NRGBAModel.Convert(picture.At(x, y)) != color.NRGBAModel.Convert(sourcePicture.At(piece.X+x, piece.Y+y)) {
					t.Fatal("output pixel changed")
				}
			}
		}
		asset, err := s.repo.AssetForUser("image-user", generationMediaAssetID(task.ID, index))
		if err != nil {
			t.Fatal(err)
		}
		version, err := s.repo.AssetVersion(asset.PrimaryVersionID)
		if err != nil || !strings.Contains(version.DefinitionJSON, result.Operation.Source.SHA256) {
			t.Fatal("missing derivation version", err)
		}
		refs := documentReferencedResourceIDs(version.DefinitionJSON, map[string]struct{}{resource.ID: {}})
		if _, found := refs[resource.ID]; !found {
			t.Fatal("source not protected by immutable version")
		}
	}
	if err := s.registerImageOperationAssets(*completed); err != nil {
		t.Fatal(err)
	}
	for _, table := range []struct {
		value any
		want  int64
	}{{&model.Task{}, 1}, {&model.Asset{}, 6}, {&model.AssetVersion{}, 6}, {&model.AssetRepresentation{}, 6}, {&model.BillingOrder{}, 0}} {
		var count int64
		if err := db.Model(table.value).Count(&count).Error; err != nil || count != table.want {
			t.Fatalf("unexpected records %T %d != %d (%v)", table.value, count, table.want, err)
		}
	}
	replay, err = s.CreateImageOperationTask("image-user", req)
	if err != nil || replay.ID != task.ID || replay.Status != model.TaskStatusSucceeded {
		t.Fatal("completed request resubmitted", err)
	}
	_, reader, err := s.OpenResource("image-user", resource.ID)
	if err != nil {
		t.Fatal(err)
	}
	saved, err := io.ReadAll(reader)
	reader.Close()
	if err != nil || !bytes.Equal(original, saved) {
		t.Fatal("original modified")
	}
	entries, err := os.ReadDir(filepath.Join(s.dataDir, "media-staging"))
	if err != nil || len(entries) != 0 {
		t.Fatal("staging not cleaned", err)
	}
}

func TestImageOperationLostTempAndRestartReusePersistedOutput(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	resource, _ := seedImageOperationSource(t, s, db)
	task, err := s.CreateImageOperationTask("image-user", imageOperationTestRequest(resource.ID))
	if err != nil {
		t.Fatal(err)
	}
	claimed, err := s.repo.ClaimNextTask("crashed-image-worker", time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	input, err := decodeImageOperationInput(claimed)
	if err != nil {
		t.Fatal(err)
	}
	data, err := s.readImageOperationSource("image-user", resource.ID)
	if err != nil {
		t.Fatal(err)
	}
	picture, err := imageops.Decode(context.Background(), data, input.Source)
	if err != nil {
		t.Fatal(err)
	}
	first, err := imageops.RenderPNG(context.Background(), picture, input.Pieces[0], "nearest")
	if err != nil {
		t.Fatal(err)
	}
	file, err := s.stageInlineMedia(first)
	if err != nil {
		t.Fatal(err)
	}
	firstResource, fallback, err := s.storeTaskMediaFile(claimed, 0, s.mediaTempPath(file), "image/png", "image", nil)
	if fallback != nil {
		t.Fatal(fallback)
	}
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(s.mediaTempPath(file)); err != nil {
		t.Fatal(err)
	}
	checkpoint := &mediaCheckpoint{Mode: "image", StartedAt: time.Now(), Items: make([]mediaCheckpointItem, len(input.Pieces))}
	for i := range checkpoint.Items {
		checkpoint.Items[i] = mediaCheckpointItem{MIMEType: "image/png", TempName: "result-expired-fixture"}
	}
	if err := s.saveMediaCheckpoint(claimed, checkpoint, "local_save"); err != nil {
		t.Fatal(err)
	}
	if err := s.repo.ReleaseTaskLease(claimed.ID, claimed.LeaseOwner); err != nil {
		t.Fatal(err)
	}
	restarted := &Service{repo: s.repo, dataDir: s.dataDir, activeCancels: map[string]context.CancelFunc{}}
	completed := runImageOperationTask(t, restarted, task.ID)
	if completed.Status != model.TaskStatusSucceeded {
		t.Fatalf("restart failed: %s", completed.Error)
	}
	if !strings.Contains(completed.ResultJSON, firstResource.ID) {
		t.Fatal("first output duplicated")
	}
	var count int64
	db.Model(&model.Resource{}).Count(&count)
	if count != 7 {
		t.Fatalf("duplicate resources after restart: %d", count)
	}
}

func TestImageOperationRejectsForeignSourceAndProject(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	resource, _ := seedImageOperationSource(t, s, db)
	req := imageOperationTestRequest(resource.ID)
	if _, err := s.CreateImageOperationTask("another-user", req); err == nil {
		t.Fatal("foreign source accepted")
	}
	req.ProjectID = "nonexistent-project"
	if _, err := s.CreateImageOperationTask("image-user", req); err == nil {
		t.Fatal("unowned project accepted")
	}
	var count int64
	db.Model(&model.Task{}).Count(&count)
	if count != 0 {
		t.Fatal("invalid task queued")
	}
}

func TestImageOperationCancellationNeverPublishesDerivedAssets(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	resource, _ := seedImageOperationSource(t, s, db)
	task, err := s.CreateImageOperationTask("image-user", imageOperationTestRequest(resource.ID))
	if err != nil {
		t.Fatal(err)
	}
	claimed, err := s.repo.ClaimNextTask("cancelled-image-worker", time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.taskLifecycle().cancelTask(context.Background(), "image-user", task.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.taskWorker().processClaimedTask(claimed, nil); err != nil {
		t.Fatal(err)
	}
	var count int64
	db.Model(&model.Asset{}).Count(&count)
	if count != 0 {
		t.Fatal("cancelled processing published assets")
	}
}

func TestImageOperationCancellationDuringFileSaveKeepsTerminalAndCleansStaging(t *testing.T) {
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	s, db := newMediaRecoveryTestService(t)
	resource, _ := seedImageOperationSource(t, s, db)
	task, err := s.CreateImageOperationTask("image-user", imageOperationTestRequest(resource.ID))
	if err != nil {
		t.Fatal(err)
	}
	var once sync.Once
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			t.Errorf("unexpected object method %s", r.Method)
			w.WriteHeader(400)
			return
		}
		_, _ = io.Copy(io.Discard, r.Body)
		once.Do(func() {
			if _, err := s.taskLifecycle().cancelTask(context.Background(), "image-user", task.ID); err != nil {
				t.Error(err)
			}
		})
		w.WriteHeader(200)
	}))
	defer server.Close()
	seedOSSEnabled(t, db, "image-user", server.URL)
	completed := runImageOperationTask(t, s, task.ID)
	if completed.Status != model.TaskStatusCancelled {
		t.Fatalf("cancelled task became %s", completed.Status)
	}
	var count int64
	db.Model(&model.Asset{}).Count(&count)
	if count != 0 {
		t.Fatal("cancel race published assets")
	}
	entries, err := os.ReadDir(filepath.Join(s.dataDir, "media-staging"))
	if err != nil || len(entries) != 0 {
		t.Fatal("cancelled staging was retained", err)
	}
	resumed, err := s.taskLifecycle().retryTask("image-user", task.ID)
	if err != nil || resumed.ID != task.ID {
		t.Fatal("cancelled CPU recipe could not resume", err)
	}
	completed = runImageOperationTask(t, s, task.ID)
	if completed.Status != model.TaskStatusSucceeded || completed.BillingOrderID != "" {
		t.Fatal("resumed CPU recipe failed", completed.Error)
	}
	db.Model(&model.Asset{}).Count(&count)
	if count != 6 {
		t.Fatalf("resumed recipe published %d assets", count)
	}
	db.Model(&model.Resource{}).Count(&count)
	if count != 7 {
		t.Fatalf("resumed recipe duplicated resources: %d", count)
	}
}
