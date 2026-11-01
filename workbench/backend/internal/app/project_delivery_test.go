package app

import (
	"archive/zip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"gorm.io/gorm"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
)

func verifyProjectDelivery(t *testing.T, s *Service, db *gorm.DB) {
	t.Helper()
	resource, sourceBytes := seedImageOperationSource(t, s, db)
	if err := db.Model(&model.User{}).Where("id = ?", "image-user").Update("status", model.UserStatusActive).Error; err != nil {
		t.Fatal(err)
	}
	p, err := s.CreateProject("image-user", CreateProjectRequest{Name: "完整素材交付", IdempotencyKey: "delivery-native-test-create", Type: "short-drama", AspectRatio: "16:9", CreativeBrief: &model.ProjectCreativeBrief{Version: 1, Goal: "product", KeyMessage: "保留完整脚本与原画", TargetDurationMs: 4000}, Starter: &ProjectStarterRequest{Entry: "upload", ResourceID: resource.ID}})
	if err != nil {
		t.Fatal("create project with uploaded source", err)
	}
	clip := map[string]any{"id": "original-occurrence", "kind": "image", "title": "原始校准图", "trackId": "visual", "startMs": 1000, "durationMs": 2000, "sourceStartMs": 0, "sourceDurationMs": 8000, "playbackRate": 2, "directMedia": map[string]any{"id": resource.ID, "storageKey": "resource:" + resource.ID}}
	timeline, _ := json.Marshal(map[string]any{"version": 2, "output": map[string]any{"width": 640, "height": 360, "fps": 24}, "tracks": []any{map[string]any{"id": "visual", "kind": "video", "label": "原画", "order": 0}, map[string]any{"id": "subtitle", "kind": "subtitle", "label": "字幕", "order": 1}}, "clips": []any{clip, map[string]any{"id": "caption", "kind": "subtitle", "trackId": "subtitle", "startMs": 1000, "durationMs": 2000, "text": "完整脚本与实际原画"}}})
	if err := db.Create(&model.ProjectTimeline{ProjectID: p.ID, UserID: "image-user", Revision: 1, PayloadJSON: string(timeline)}).Error; err != nil {
		t.Fatal(err)
	}
	current, err := s.ReadProjectDeliverySource(context.Background(), "image-user", p.ID)
	if err != nil {
		t.Fatal("read native delivery snapshot", err)
	}
	archive, err := s.ExportProjectDelivery(context.Background(), "image-user", p.ID, current.SHA256)
	if err != nil {
		t.Fatal("export original source archive", err)
	}
	info, _ := archive.Stat()
	reader, err := zip.NewReader(archive, info.Size())
	if err != nil {
		t.Fatal(err)
	}
	entries := map[string][]byte{}
	for _, entry := range reader.File {
		stream, err := entry.Open()
		if err != nil {
			t.Fatal(err)
		}
		bytes, err := io.ReadAll(stream)
		stream.Close()
		if err != nil {
			t.Fatal(err)
		}
		entries[entry.Name] = bytes
	}
	if len(entries["project.json"]) == 0 || len(entries["exchange/working.otio"]) == 0 || !strings.Contains(string(entries["exchange/working.srt"]), "00:00:01,000 --> 00:00:03,000") {
		t.Fatal("missing editable documents or clocks", entries)
	}
	if string(entries["media/"+resource.ID+".png"]) != string(sourceBytes) {
		t.Fatal("original source changed")
	}
	var manifest struct {
		DocumentSHA256 string          `json:"documentSHA256"`
		Media          []deliveryMedia `json:"media"`
	}
	if err := json.Unmarshal(entries["manifest.json"], &manifest); err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(entries["project.json"])
	if manifest.DocumentSHA256 != hex.EncodeToString(digest[:]) || len(manifest.Media) != 1 {
		t.Fatal("manifest does not cover source", manifest)
	}
	var otio map[string]any
	if err := json.Unmarshal(entries["exchange/working.otio"], &otio); err != nil {
		t.Fatal(err)
	}
	tracks := otio["tracks"].(map[string]any)["children"].([]any)
	children := tracks[0].(map[string]any)["children"].([]any)
	if len(children) != 2 || children[1].(map[string]any)["effects"].([]any)[0].(map[string]any)["time_scalar"] != float64(2) {
		t.Fatal("source clock/speed not retained", otio)
	}
	item := children[1].(map[string]any)
	duration := item["source_range"].(map[string]any)["duration"].(map[string]any)["value"]
	if duration != float64(2000) || item["metadata"].(map[string]any)["sourceConsumedMs"] != float64(4000) {
		t.Fatal("OTIO program clock was multiplied by source rate", item)
	}
	if deliverySourceHash([]byte("snapshot")) == sha256.Sum256([]byte("snapshot")) {
		t.Fatal("converter repair would reuse old package identity")
	}
	name := archive.Name()
	if err := archive.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(name); !os.IsNotExist(err) {
		t.Fatal("export left temporary ZIP")
	}
	saved, err := s.CreateProjectDelivery(context.Background(), "image-user", p.ID, ProjectDeliveryRequest{SourceSHA256: current.SHA256})
	if err != nil {
		t.Fatal("persist immutable package", err)
	}
	if saved.ResourceID == "" || saved.SHA256 == "" {
		t.Fatal("missing owned delivery resource")
	}
	if err := db.Model(&model.Project{}).Where("id = ?", p.ID).Updates(map[string]any{"name": "后续编辑保留", "revision": p.Revision + 1}).Error; err != nil {
		t.Fatal(err)
	}
	replay, err := s.CreateProjectDelivery(context.Background(), "image-user", p.ID, ProjectDeliveryRequest{SourceSHA256: current.SHA256})
	if err != nil || replay != saved {
		t.Fatal("old package replay changed source or duplicated ZIP", replay, err)
	}
	if _, err := s.ExportProjectDelivery(context.Background(), "image-user", p.ID, current.SHA256); err == nil {
		t.Fatal("changed source accepted as old package")
	}
	if _, err := s.CreateProjectDelivery(context.Background(), "foreign-user", p.ID, ProjectDeliveryRequest{SourceSHA256: current.SHA256}); err == nil {
		t.Fatal("foreign project exported")
	}
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := s.ExportProjectDelivery(cancelled, "image-user", p.ID); err == nil {
		t.Fatal("cancelled package accepted")
	}
	if err := db.Model(&model.ProjectTimeline{}).Where("project_id = ?", p.ID).Update("payload_json", strings.ReplaceAll(string(timeline), resource.ID, "missing-owned-resource")).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := s.ExportProjectDelivery(context.Background(), "image-user", p.ID); err == nil {
		t.Fatal("missing source silently omitted")
	}
	files, err := os.ReadDir(filepath.Join(s.dataDir, "delivery-tmp"))
	if err != nil || len(files) != 0 {
		t.Fatal("failed package left disk garbage", files, err)
	}
}

func TestProjectDeliverySqliteOriginalSourcesReplayAndInterchange(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	verifyProjectDelivery(t, s, db)
}
func TestProjectDeliveryPostgresOriginalSourcesReplayAndInterchange(t *testing.T) {
	s, db := newProjectNameConflictPostgresService(t)
	s.dataDir = t.TempDir()
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	verifyProjectDelivery(t, s, db)
}
func TestProjectDeliveryNestedCredentialRedaction(t *testing.T) {
	document := map[string]any{"prompt": "用户的原始创作正文", "payloadJson": `{"apiKey":"private-sentinel","nodes":[{"metadata":{"authorization":"Bearer private-sentinel","storageKey":"resource:original"}}]}`, "url": "https://example.invalid/video?token=private-sentinel&clip=1"}
	raw, _ := json.Marshal(cleanDeliveryDocument(document))
	if strings.Contains(string(raw), "private-sentinel") || !strings.Contains(string(raw), "用户的原始创作正文") || !strings.Contains(string(raw), "resource:original") {
		t.Fatal("credential leak or authoring corruption", string(raw))
	}
}
