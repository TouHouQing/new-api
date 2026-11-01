package app

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"errors"
	"io"
	"os"
	"testing"

	"gorm.io/gorm"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
)

func headlessMediaService(t *testing.T, driver string) (*Service, *gorm.DB) {
	t.Helper()
	if driver == "postgres" {
		s, db := newProjectNameConflictPostgresService(t)
		s.dataDir = t.TempDir()
		if err := database.MigrateSchema(db); err != nil {
			t.Fatal(err)
		}
		return s, db
	}
	return newMediaRecoveryTestService(t)
}

func TestTimelineEditsHeadlessImageInspectsOriginalCachesMetadataAndKeepsBytes(t *testing.T) {
	for _, driver := range []string{"sqlite", "postgres"} {
		t.Run(driver, func(t *testing.T) {
			s, db := headlessMediaService(t, driver)
			resource, original := seedImageOperationSource(t, s, db)
			if err := db.Model(&model.Resource{}).Where("id = ?", resource.ID).Updates(map[string]any{"width": 0, "height": 0}).Error; err != nil {
				t.Fatal(err)
			}
			project, err := s.CreateProject("image-user", CreateProjectRequest{Name: "无浏览器上传直接剪辑"})
			if err != nil {
				t.Fatal(err)
			}
			current, err := s.GetProjectTimeline("image-user", project.ID)
			if err != nil {
				t.Fatal(err)
			}
			input := TimelineEditRequest{RequestID: "headless-image-native-ingest-0001", ExpectedRevision: current.Revision, Commands: []production.TimelineEditCommand{{Op: "addResource", ResourceID: resource.ID, Media: &production.TimelineEditMedia{Kind: "video", Width: 9999, Height: 9999, DurationMs: 999999}}}}
			plan, err := s.PreviewTimelineEdits("image-user", project.ID, input)
			if err != nil {
				t.Fatal(err)
			}
			var timeline struct {
				Clips []struct {
					Kind        string
					DirectMedia struct {
						Width, Height int
						StorageKey    string
					} `json:"directMedia"`
				}
			}
			if json.Unmarshal(plan.Timeline, &timeline) != nil || len(timeline.Clips) != 1 || timeline.Clips[0].Kind != "image" || timeline.Clips[0].DirectMedia.Width != 31 || timeline.Clips[0].DirectMedia.Height != 23 || timeline.Clips[0].DirectMedia.StorageKey != "resource:"+resource.ID {
				t.Fatalf("inspected identity missing: %s", plan.Timeline)
			}
			cached, err := s.repo.ResourceForUser("image-user", resource.ID)
			if err != nil || cached.Width != 31 || cached.Height != 23 {
				t.Fatal("metadata not cached", err)
			}
			again, err := s.PreviewTimelineEdits("image-user", project.ID, input)
			if err != nil || again.PreviewToken != plan.PreviewToken {
				t.Fatal("same exact inspection changed preview", err)
			}
			reread, _ := s.repo.ResourceForUser("image-user", resource.ID)
			if !cached.UpdatedAt.Equal(reread.UpdatedAt) {
				t.Fatal("ready metadata was probed/saved again")
			}
			var count int64
			db.Model(&model.ProjectCut{}).Where("project_id = ?", project.ID).Count(&count)
			if count != 0 {
				t.Fatal("metadata preview wrote creative cuts")
			}
			_, stream, err := s.OpenResource("image-user", resource.ID)
			if err != nil {
				t.Fatal(err)
			}
			after, err := io.ReadAll(stream)
			stream.Close()
			if err != nil || !bytes.Equal(after, original) {
				t.Fatal("inspection changed original bytes", err)
			}
			input.PreviewToken = plan.PreviewToken
			if _, err := s.ApplyTimelineEdits("image-user", project.ID, input); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestTimelineEditsHeadlessAudioReadsDurationBeforeAppend(t *testing.T) {
	if os.Getenv("CANVAS_TEST_REAL_FFMPEG") != "1" {
		t.Skip("explicit actual FFprobe environment required")
	}
	s, db := headlessMediaService(t, "sqlite")
	seedImageOperationSource(t, s, db)
	var wav bytes.Buffer
	wav.WriteString("RIFF")
	binary.Write(&wav, binary.LittleEndian, uint32(36+24000))
	wav.WriteString("WAVEfmt ")
	binary.Write(&wav, binary.LittleEndian, uint32(16))
	binary.Write(&wav, binary.LittleEndian, uint16(1))
	binary.Write(&wav, binary.LittleEndian, uint16(1))
	binary.Write(&wav, binary.LittleEndian, uint32(24000))
	binary.Write(&wav, binary.LittleEndian, uint32(48000))
	binary.Write(&wav, binary.LittleEndian, uint16(2))
	binary.Write(&wav, binary.LittleEndian, uint16(16))
	wav.WriteString("data")
	binary.Write(&wav, binary.LittleEndian, uint32(24000))
	wav.Write(make([]byte, 24000))
	resource, _, err := s.storeResource("image-user", "audio", "headless.wav", "audio/wav", int64(wav.Len()), 0, 0, 0, bytes.NewReader(wav.Bytes()), nil, false)
	if err != nil {
		t.Fatal(err)
	}
	project, err := s.CreateProject("image-user", CreateProjectRequest{Name: "声音直接加入剪辑"})
	if err != nil {
		t.Fatal(err)
	}
	current, _ := s.GetProjectTimeline("image-user", project.ID)
	input := TimelineEditRequest{RequestID: "headless-audio-native-ingest-0001", ExpectedRevision: current.Revision, Commands: []production.TimelineEditCommand{{Op: "addResource", ResourceID: resource.ID}}}
	plan, err := s.PreviewTimelineEdits("image-user", project.ID, input)
	if err != nil {
		t.Fatal(err)
	}
	metadata, err := s.repo.ResourceForUser("image-user", resource.ID)
	if err != nil || metadata.DurationMs != 500 {
		t.Fatal("actual WAV duration unavailable", metadata, err)
	}
	var timeline struct {
		Clips []struct{ DurationMs, SourceDurationMs int64 }
	}
	json.Unmarshal(plan.Timeline, &timeline)
	if len(timeline.Clips) != 1 || timeline.Clips[0].DurationMs != 500 || timeline.Clips[0].SourceDurationMs != 500 {
		t.Fatalf("fake or missing duration: %s", plan.Timeline)
	}
}

func TestResourceAdoptionMetadataCannotOverwriteChangedStorageOrReviveDeleted(t *testing.T) {
	for _, driver := range []string{"sqlite", "postgres"} {
		t.Run(driver, func(t *testing.T) {
			s, db := headlessMediaService(t, driver)
			resource, _ := seedImageOperationSource(t, s, db)
			if err := db.Model(&model.Resource{}).Where("id = ?", resource.ID).Updates(map[string]any{"width": 0, "height": 0, "object_key": resource.ObjectKey + "-changed"}).Error; err != nil {
				t.Fatal(err)
			}
			if _, err := s.repo.SaveInspectedResourceMetadata(resource, 31, 23, 0); !errors.Is(err, gorm.ErrRecordNotFound) {
				t.Fatal("changed storage accepted", err)
			}
			unchanged, _ := s.repo.ResourceForUser("image-user", resource.ID)
			if unchanged.Width != 0 || unchanged.Height != 0 {
				t.Fatal("stale probe overwrote changed file")
			}
			if err := db.Model(&model.Resource{}).Where("id = ?", resource.ID).Updates(map[string]any{"object_key": resource.ObjectKey, "status": model.ResourceStatusPending}).Error; err != nil {
				t.Fatal(err)
			}
			if _, err := s.repo.SaveInspectedResourceMetadata(resource, 31, 23, 0); !errors.Is(err, gorm.ErrRecordNotFound) {
				t.Fatal("non-ready resource revived", err)
			}
			unchanged, _ = s.repo.ResourceForUser("image-user", resource.ID)
			if unchanged.Status != model.ResourceStatusPending || unchanged.Width != 0 {
				t.Fatal("failed probe changed resource state")
			}
		})
	}
}
