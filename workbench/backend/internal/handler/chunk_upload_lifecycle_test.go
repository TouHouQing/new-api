package handler

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"yingce/backend/internal/auth"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
	"yingce/backend/internal/service"
)

func TestChunkUploadHeaderIdempotencyCancelOwnershipAndTemporaryCleanup(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := database.Open(database.Config{Driver: "sqlite", DSN: ":memory:"})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"upload-owner", "other-owner"} {
		for _, value := range []any{
			&model.User{ID: id, Username: id, Email: id + "@example.invalid", Status: model.UserStatusActive, Role: model.UserRoleUser},
			&model.AuthSession{ID: id, UserID: id, TokenHash: auth.HashToken("upload-test-token"), ExpiresAt: time.Now().Add(time.Hour)},
		} {
			if err := db.Create(value).Error; err != nil {
				t.Fatal(err)
			}
		}
	}
	repo := repository.New(db)
	svc := service.New(repo, t.TempDir())
	previous := runtimeService
	ConfigureRuntime(svc)
	t.Cleanup(func() { ConfigureRuntime(previous) })
	router := gin.New()
	RegisterChunkedUploadRoutes(router.Group("/api"), svc)
	call := func(method, route, body, user string, headers ...string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, route, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		for _, value := range headers {
			req.Header.Add("X-Idempotency-Key", value)
		}
		if user != "" {
			req.AddCookie(&http.Cookie{Name: service.SessionCookieName, Value: user + ".upload-test-token"})
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		return w
	}
	check := func(w *httptest.ResponseRecorder, status int) map[string]any {
		t.Helper()
		if w.Code != status {
			t.Fatalf("HTTP %d, want %d: %s", w.Code, status, w.Body.String())
		}
		var response struct{ Data map[string]any }
		if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
			t.Fatal(err)
		}
		return response.Data
	}
	start := func(body string, headers ...string) *chunkedUploadSession {
		t.Helper()
		data := check(call("POST", "/api/resources/uploads", body, "upload-owner", headers...), 200)
		session := takeChunkSession(data["uploadId"].(string))
		if session == nil {
			t.Fatal("accepted upload has no session")
		}
		t.Cleanup(func() {
			if remaining := takeChunkSession(session.ID); remaining != nil {
				remaining.mu.Lock()
				_ = dropChunkSession(remaining.ID)
				remaining.mu.Unlock()
			}
		})
		return session
	}
	const identity = "same-logical-upload-lifecycle"
	var resourceID string
	for attempt := 0; attempt < 2; attempt++ {
		session := start(`{"fileName":"payload.txt","kind":"file","size":7}`, identity)
		if session.IdempotencyKey != identity {
			t.Fatal("web upload identity header was dropped")
		}
		check(call("PUT", "/api/resources/uploads/"+session.ID+"/chunks/0", "payload", "upload-owner"), 200)
		data := check(call("POST", "/api/resources/uploads/"+session.ID+"/complete", "", "upload-owner"), 200)
		id := data["resource"].(map[string]any)["id"].(string)
		if attempt == 0 {
			resourceID = id
		} else if id != resourceID {
			t.Fatal("retry created a second ready resource")
		}
		if _, err := os.Stat(session.Dir); !os.IsNotExist(err) {
			t.Fatalf("merged temporary files remain after success: %v", err)
		}
	}
	var resource model.Resource
	if err := db.First(&resource, "id = ?", resourceID).Error; err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256([]byte(identity))
	if resource.UploadKey == nil || *resource.UploadKey != hex.EncodeToString(digest[:]) {
		t.Fatal("ready resource did not retain native upload identity")
	}
	check(call("POST", "/api/resources/uploads", `{"fileName":"payload.txt","size":7,"idempotencyKey":"body-other"}`, "upload-owner", identity), 400)
	check(call("POST", "/api/resources/uploads", `{"fileName":"payload.txt","size":7}`, "upload-owner", identity, "ambiguous"), 400)
	legacy := start(`{"fileName":"legacy.txt","size":7,"idempotencyKey":"body-only-identity"}`)
	if legacy.IdempotencyKey != "body-only-identity" {
		t.Fatal("body identity no longer works")
	}
	check(call("PUT", "/api/resources/uploads/"+legacy.ID+"/chunks/0", "payload", "upload-owner"), 200)
	check(call("DELETE", "/api/resources/uploads/"+legacy.ID, "", ""), 401)
	check(call("DELETE", "/api/resources/uploads/"+legacy.ID, "", "other-owner"), 404)
	if _, err := os.Stat(legacy.chunkPath(0)); err != nil {
		t.Fatal("another user removed the owner's chunk", err)
	}
	check(call("DELETE", "/api/resources/uploads/"+legacy.ID, "", "upload-owner"), 200)
	if _, err := os.Stat(legacy.Dir); !os.IsNotExist(err) {
		t.Fatalf("cancel left temporary files: %v", err)
	}
	check(call("DELETE", "/api/resources/uploads/"+legacy.ID, "", "upload-owner"), 404)
	var count int64
	if err := db.Model(&model.UploadReservation{}).Where("user_id = ?", "upload-owner").Count(&count).Error; err != nil || count != 0 {
		t.Fatalf("unreleased upload quota: %d, %v", count, err)
	}
	if err := db.Model(&model.Resource{}).Where("user_id = ?", "upload-owner").Count(&count).Error; err != nil || count != 1 {
		t.Fatalf("ready resources changed during cancel/retry: %d, %v", count, err)
	}
	if used, err := repo.DailyUploadBytes("upload-owner", time.Now().UTC().Format("2006-01-02")); err != nil || used != 7 {
		t.Fatalf("upload charged more than one payload: %d, %v", used, err)
	}
}

func TestChunkCleanupRejectsAnUnrelatedDirectory(t *testing.T) {
	directory := t.TempDir()
	file := filepath.Join(directory, "retain.txt")
	if err := os.WriteFile(file, []byte("retain"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := releaseChunkSessionFiles(&chunkedUploadSession{Dir: directory}); err == nil {
		t.Fatal("unrelated directory was accepted as a chunk session")
	}
	if value, err := os.ReadFile(file); err != nil || string(value) != "retain" {
		t.Fatal("unrelated files changed", err)
	}
}
