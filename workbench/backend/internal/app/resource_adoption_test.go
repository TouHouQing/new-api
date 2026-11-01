package app

import (
	"encoding/json"
	"errors"
	"gorm.io/gorm"
	"net/http"
	"sync"
	"testing"
	"time"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
)

func TestResourceAdoptionAtomicNativeAssetVersionAndUndo(t *testing.T) {
	for _, driver := range []string{"sqlite", "postgres"} {
		t.Run(driver, func(t *testing.T) {
			var s *Service
			var db *gorm.DB
			if driver == "postgres" {
				s, db = newProjectNameConflictPostgresService(t)
				s.dataDir = t.TempDir()
				if err := database.MigrateSchema(db); err != nil {
					t.Fatal(err)
				}
			} else {
				s, db = newMediaRecoveryTestService(t)
			}
			resource, _ := seedImageOperationSource(t, s, db)
			if err := db.Model(&model.Resource{}).Where("id = ?", resource.ID).Updates(map[string]any{"width": 0, "height": 0}).Error; err != nil {
				t.Fatal(err)
			}
			project, err := s.CreateProject("image-user", CreateProjectRequest{Name: "采用素材的项目"})
			if err != nil {
				t.Fatal(err)
			}
			document := model.CanvasProject{ID: "resource-adoption-canvas", UserID: "image-user", ProjectID: project.ID, Title: "素材采用", PayloadJSON: `{"id":"resource-adoption-canvas","title":"素材采用","nodes":[],"connections":[]}`}
			if err := s.repo.UpsertCanvasProject(&document); err != nil {
				t.Fatal(err)
			}
			req := ResourceAdoptionRequest{RequestID: "resource-adoption-fixture-1234", ResourceID: resource.ID, Title: "原始图片", X: 120, Y: 80}
			first, err := s.AdoptResource("image-user", document.ID, req)
			if err != nil {
				t.Fatal(err)
			}
			if first.Replayed || first.AssetVersionID == "" || first.NodeID == "" {
				t.Fatalf("incomplete native result: %+v", first)
			}
			again, err := s.AdoptResource("image-user", document.ID, req)
			if err != nil || !again.Replayed || again.AssetVersionID != first.AssetVersionID {
				t.Fatal("retry duplicated adoption", err)
			}
			changed := req
			changed.X++
			_, err = s.AdoptResource("image-user", document.ID, changed)
			requireProjectCreationStatus(t, err, http.StatusConflict)
			stored, err := s.repo.CanvasProjectForUser("image-user", document.ID)
			if err != nil {
				t.Fatal(err)
			}
			var payload struct {
				Nodes []map[string]any `json:"nodes"`
			}
			if err := json.Unmarshal([]byte(stored.PayloadJSON), &payload); err != nil || len(payload.Nodes) != 1 {
				t.Fatal("one native node missing", err)
			}
			metadata := payload.Nodes[0]["metadata"].(map[string]any)
			if metadata["assetId"] != first.AssetID || metadata["assetVersionId"] != first.AssetVersionID || metadata["storageKey"] != "resource:"+resource.ID {
				t.Fatal("native references differ")
			}
			if metadata["naturalWidth"] != float64(31) || metadata["naturalHeight"] != float64(23) {
				t.Fatal("headless upload dimensions were not inspected from original bytes")
			}
			for _, table := range []any{&model.Asset{}, &model.AssetVersion{}, &model.AssetRepresentation{}, &model.ProjectAssetLink{}} {
				var count int64
				if err := db.Model(table).Count(&count).Error; err != nil || count != 1 {
					t.Fatalf("registration count=%d: %v", count, err)
				}
			}
			if linked, err := s.repo.ProjectAssetLinked(project.ID, first.AssetID); err != nil || !linked {
				t.Fatal("asset missing from native project", err)
			}
			if err := s.canvasDomain().ValidateCanvasMediaAssets("image-user", []byte(stored.PayloadJSON)); err != nil {
				t.Fatal("native asset guard rejected registration", err)
			}
			// A later native edit/undo must remain authoritative when the old
			// uncertain request is replayed. Versions and original bytes remain.
			stored.PayloadJSON = document.PayloadJSON
			if err := s.repo.UpsertCanvasProject(stored); err != nil {
				t.Fatal(err)
			}
			if replay, err := s.AdoptResource("image-user", document.ID, req); err != nil || !replay.Replayed {
				t.Fatal("replay after undo failed", err)
			}
			after, _ := s.repo.CanvasProjectForUser("image-user", document.ID)
			if after.PayloadJSON != document.PayloadJSON {
				t.Fatal("replay overwrote later undo")
			}
			// A second original of another kind has no synthetic TaskID. The
			// native task-role uniqueness index must allow both registrations.
			audio := model.Resource{ID: newID(), UserID: "image-user", Kind: "audio", Status: model.ResourceStatusReady, MimeType: "audio/wav", Size: 128, DurationMs: 2500, CreatedAt: time.Now(), UpdatedAt: time.Now()}
			if err := db.Create(&audio).Error; err != nil {
				t.Fatal(err)
			}
			audioReq := ResourceAdoptionRequest{RequestID: "resource-adoption-audio-1234", ResourceID: audio.ID, Title: "原音频"}
			if _, err := s.AdoptResource("image-user", document.ID, audioReq); err != nil {
				t.Fatal("independent media role conflict", err)
			}
			var jobs int64
			if err := db.Model(&model.Task{}).Count(&jobs).Error; err != nil || jobs != 0 {
				t.Fatal("adoption created synthetic model/task", err)
			}
			if driver == "postgres" {
				var group sync.WaitGroup
				results, failures := make(chan string, 4), make(chan error, 4)
				concurrent := req
				concurrent.RequestID = "cross-worker-adoption-1234"
				for range 4 {
					group.Add(1)
					go func() {
						defer group.Done()
						worker := &Service{repo: s.repo, dataDir: s.dataDir}
						adopted, err := worker.AdoptResource("image-user", document.ID, concurrent)
						if err != nil {
							failures <- err
						} else {
							results <- adopted.AssetVersionID
						}
					}()
				}
				group.Wait()
				close(results)
				close(failures)
				for err := range failures {
					t.Fatal(err)
				}
				versions := map[string]bool{}
				for id := range results {
					versions[id] = true
				}
				if len(versions) != 1 {
					t.Fatalf("concurrent workers created %d versions", len(versions))
				}
				var registered int64
				if err := db.Model(&model.Asset{}).Count(&registered).Error; err != nil || registered != 2 {
					t.Fatalf("concurrent registration count=%d: %v", registered, err)
				}
			}
		})
	}
}

func TestResourceAdoptionRejectsForeignAndRollsBackAllRows(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	resource, _ := seedImageOperationSource(t, s, db)
	document := model.CanvasProject{ID: "owned-adoption-canvas", UserID: "image-user", Title: "原画布", PayloadJSON: `{"id":"owned-adoption-canvas","title":"原画布","nodes":[],"connections":[]}`}
	if err := s.repo.UpsertCanvasProject(&document); err != nil {
		t.Fatal(err)
	}
	foreign := model.Resource{ID: newID(), UserID: "another-user", Kind: "image", Status: model.ResourceStatusReady}
	if err := db.Create(&foreign).Error; err != nil {
		t.Fatal(err)
	}
	req := ResourceAdoptionRequest{RequestID: "adoption-failure-intent-1234", ResourceID: foreign.ID}
	_, err := s.AdoptResource("image-user", document.ID, req)
	requireProjectCreationStatus(t, err, http.StatusNotFound)
	req.ResourceID = resource.ID
	_, err = s.AdoptResource("another-user", document.ID, req)
	requireProjectCreationStatus(t, err, http.StatusNotFound)
	if err := db.Callback().Create().Before("gorm:create").Register("test:reject-resource-node", func(tx *gorm.DB) {
		if tx.Statement.Table == "canvas_mutation_receipts" {
			tx.AddError(errors.New("controlled canvas write failure"))
		}
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.AdoptResource("image-user", document.ID, req); err == nil {
		t.Fatal("failed canvas write was accepted")
	}
	for _, table := range []any{&model.Asset{}, &model.AssetVersion{}, &model.AssetRepresentation{}, &model.CanvasMutationReceipt{}} {
		var count int64
		if err := db.Model(table).Count(&count).Error; err != nil || count != 0 {
			t.Fatalf("partial registration count=%d: %v", count, err)
		}
	}
	if err := db.Callback().Create().Remove("test:reject-resource-node"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.AdoptResource("image-user", document.ID, req); err != nil {
		t.Fatal("recovery after atomic failure failed", err)
	}
}
