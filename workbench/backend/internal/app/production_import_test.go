package app

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"image"
	"image/color"
	"image/png"
	"io"
	"os"
	"path/filepath"
	"testing"

	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"

	"gorm.io/gorm"
)

func legacyImportService(t *testing.T) (*Service, *gorm.DB) {
	t.Helper()
	dir := t.TempDir()
	db, err := database.Open(database.Config{Driver: "sqlite", DataDir: dir})
	if err != nil {
		t.Fatal(err)
	}
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { sqlDB.Close() })
	svc := New(repository.New(db), dir)
	t.Cleanup(func() { svc.Close() })
	for _, id := range []string{"owner", "other"} {
		if err := db.Create(&model.User{ID: id, Username: id, Email: id + "@example.invalid", Status: model.UserStatusActive, Role: model.UserRoleUser}).Error; err != nil {
			t.Fatal(err)
		}
	}
	return svc, db
}

func legacyImportArchive(t *testing.T) ([]byte, []byte) {
	t.Helper()
	var picture bytes.Buffer
	img := image.NewRGBA(image.Rect(0, 0, 4, 4))
	img.Set(0, 0, color.White)
	if err := png.Encode(&picture, img); err != nil {
		t.Fatal(err)
	}
	media := picture.Bytes()
	path := "media/0"
	manifest := map[string]any{"format": "newapi-studio-project-bundle", "version": 1, "project": map[string]any{"id": "old-project", "title": "原工程", "nodes": []any{map[string]any{"id": "image", "position": map[string]any{"x": 10, "y": 20}, "data": map[string]any{"kind": "image", "title": "原画", "prompt": "next draft", "mediaId": "old-media", "selectedTakeId": "take", "takes": []any{map[string]any{"id": "take", "status": "completed", "prompt": "original prompt"}}}}}, "production": map[string]any{"masterMediaId": "old-media"}}, "media": []any{map[string]any{"path": path, "type": "image/png", "size": len(media)}}, "nodeMedia": []any{path}, "takeMedia": []any{[]any{path}}, "documentMedia": map[string]string{"old-media": path}}
	// Multiple taskless representations must coexist; task_id must be NULL,
	// rather than an empty string shared by every imported primary image.
	manifest["project"].(map[string]any)["nodes"].([]any)[0].(map[string]any)["data"].(map[string]any)["takes"] = []any{
		map[string]any{"id": "take-first", "status": "completed", "prompt": "first prompt"},
		map[string]any{"id": "take", "status": "completed", "prompt": "selected prompt"},
	}
	manifest["takeMedia"] = []any{[]any{path, path}}
	var archive bytes.Buffer
	writer := zip.NewWriter(&archive)
	document, err := writer.Create("project.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.NewEncoder(document).Encode(manifest); err != nil {
		t.Fatal(err)
	}
	file, err := writer.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := file.Write(media); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return archive.Bytes(), media
}

func TestLegacyImportPersistsNativeProjectAndExactMediaWithoutCreatingTasks(t *testing.T) {
	s, db := legacyImportService(t)
	archive, expected := legacyImportArchive(t)
	inspection, err := s.InspectLegacyProject("owner", bytes.NewReader(archive), int64(len(archive)))
	if err != nil {
		t.Fatal(err)
	}
	first, err := s.ImportLegacyProject(context.Background(), "owner", bytes.NewReader(archive), int64(len(archive)), inspection.SourceFingerprint, "导入测试")
	if err != nil {
		t.Fatal(err)
	}
	second, err := s.ImportLegacyProject(context.Background(), "owner", bytes.NewReader(archive), int64(len(archive)), inspection.SourceFingerprint, "导入测试")
	if err != nil || !second.Reused || second.Receipt.ProjectID != first.Receipt.ProjectID {
		t.Fatalf("duplicate import: %+v %v", second, err)
	}
	var resource model.Resource
	if err := db.Where("user_id = ?", "owner").First(&resource).Error; err != nil {
		t.Fatal(err)
	}
	_, stream, err := s.OpenResource("owner", resource.ID)
	if err != nil {
		t.Fatal(err)
	}
	actual, err := io.ReadAll(stream)
	stream.Close()
	if err != nil || sha256.Sum256(actual) != sha256.Sum256(expected) {
		t.Fatal("media bytes changed")
	}
	if resource.Width != 4 || resource.Height != 4 {
		t.Fatalf("image dimensions not verified: %+v", resource)
	}
	if _, _, err := s.OpenResource("other", resource.ID); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("cross-owner media read: %v", err)
	}
	for _, check := range []struct {
		model any
		want  int64
	}{{&model.Project{}, 1}, {&model.CanvasProject{}, 1}, {&model.AssetVersion{}, 2}, {&model.AssetRepresentation{}, 2}, {&model.ProductionImport{}, 1}, {&model.Task{}, 0}} {
		var count int64
		if err := db.Model(check.model).Count(&count).Error; err != nil || count != check.want {
			t.Fatalf("%T count=%d want=%d error=%v", check.model, count, check.want, err)
		}
	}
	refs, err := s.repo.ResourceReferenceSnapshot("owner", "", []string{resource.ID})
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, document := range refs.Documents {
		if document.Kind == "工程迁移" {
			found = true
		}
	}
	if !found {
		t.Fatal("auxiliary receipt resources are not protected")
	}
	entries, err := os.ReadDir(filepath.Join(s.dataDir, "tmp", "production-imports"))
	if err != nil || len(entries) != 0 {
		t.Fatalf("spool leaked: %v %v", entries, err)
	}
}

func TestLegacyImportFailureRollsBackProjectAndAllowsRetry(t *testing.T) {
	s, db := legacyImportService(t)
	archive, _ := legacyImportArchive(t)
	inspection, err := s.InspectLegacyProject("owner", bytes.NewReader(archive), int64(len(archive)))
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.Project{ID: "occupied", UserID: "owner", Name: "occupied", Status: model.ProjectStatusActive}).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := s.ImportLegacyProject(context.Background(), "owner", bytes.NewReader(archive), int64(len(archive)), inspection.SourceFingerprint, "occupied"); err == nil {
		t.Fatal("name conflict accepted")
	}
	for _, table := range []any{&model.CanvasProject{}, &model.Asset{}, &model.ProductionImport{}} {
		var count int64
		if err := db.Model(table).Count(&count).Error; err != nil || count != 0 {
			t.Fatalf("partial transaction %T: %d %v", table, count, err)
		}
	}
	if _, err := s.ImportLegacyProject(context.Background(), "owner", bytes.NewReader(archive), int64(len(archive)), inspection.SourceFingerprint, "retry"); err != nil {
		t.Fatal(err)
	}
	var count int64
	if err := db.Model(&model.Resource{}).Count(&count).Error; err != nil || count != 1 {
		t.Fatalf("retry duplicated media: %d %v", count, err)
	}
}
