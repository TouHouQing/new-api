package handler

import (
	"net/http"
	"net/http/httptest"
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

func TestImageOperationHTTPRejectsUnauthenticatedForeignAndAmbiguousWrites(t *testing.T) {
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
	for _, item := range []any{
		&model.User{ID: "image-owner", Username: "image-owner", Email: "image-owner@example.invalid", Role: model.UserRoleUser, Status: model.UserStatusActive},
		&model.AuthSession{ID: "image-session", UserID: "image-owner", TokenHash: auth.HashToken("image-test-token"), ExpiresAt: time.Now().Add(time.Hour)},
		&model.Resource{ID: "foreign-image", UserID: "foreign-owner", Kind: "image", Status: model.ResourceStatusReady, MimeType: "image/png", Size: 10},
	} {
		if err := db.Create(item).Error; err != nil {
			t.Fatal(err)
		}
	}
	svc := service.New(repository.New(db), t.TempDir())
	previous := runtimeService
	ConfigureRuntime(svc)
	t.Cleanup(func() { ConfigureRuntime(previous) })
	router := gin.New()
	RegisterTaskRoutes(router.Group("/api"), svc)
	base := `{"requestId":"image-operation-test-request","resourceId":"foreign-image","recipe":{"operation":"split","split":{"rows":1,"columns":2}}}`
	for _, tc := range []struct {
		name, body string
		auth       bool
		status     int
	}{
		{"login required", base, false, 401},
		{"foreign resource", base, true, 404},
		{"unknown fields", strings.Replace(base, `"rows":1`, `"rows":1,"baseUrl":"http://127.0.0.1"`, 1), true, 400},
		{"trailing document", base + ` {}`, true, 400},
		{"invalid idempotency", strings.Replace(base, "image-operation-test-request", "short", 1), true, 400},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/images/operations", strings.NewReader(tc.body))
			req.Header.Set("Content-Type", "application/json")
			if tc.auth {
				req.AddCookie(&http.Cookie{Name: service.SessionCookieName, Value: "image-session.image-test-token"})
			}
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)
			if w.Code != tc.status {
				t.Fatalf("status %d != %d: %s", w.Code, tc.status, w.Body.String())
			}
		})
	}
	var count int64
	for _, tc := range []struct {
		auth   bool
		body   string
		status int
	}{
		{false, `{"requestId":"image-apply-test-request"}`, 401},
		{true, `{"requestId":"image-apply-test-request"}`, 404},
		{true, `{"requestId":"image-apply-test-request","canvasId":"unowned-target"}`, 400},
		{true, `{"requestId":"image-apply-test-request"} {}`, 400},
	} {
		req := httptest.NewRequest(http.MethodPost, "/api/images/operations/missing-or-foreign-task/apply", strings.NewReader(tc.body))
		req.Header.Set("Content-Type", "application/json")
		if tc.auth {
			req.AddCookie(&http.Cookie{Name: service.SessionCookieName, Value: "image-session.image-test-token"})
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		if w.Code != tc.status {
			t.Fatalf("apply auth=%v status %d != %d: %s", tc.auth, w.Code, tc.status, w.Body.String())
		}
	}
	for _, tc := range []struct {
		method, path, body string
		auth               bool
		status             int
	}{
		{"GET", "/api/images/foreign-image/alpha-bounds", "", false, 401},
		{"GET", "/api/images/foreign-image/alpha-bounds", "", true, 404},
		{"GET", "/api/canvas-projects/not-owned-canvas/image-layer-plans?sourceNodeId=image&resourceId=foreign-image", "", false, 401},
		{"GET", "/api/canvas-projects/not-owned-canvas/image-layer-plans?sourceNodeId=image&resourceId=foreign-image", "", true, 404},
		{"GET", "/api/canvas-projects/not-owned-canvas/image-layer-plans?sourceNodeId=image&resourceId=foreign-image&limit=invalid", "", true, 400},
		{"POST", "/api/canvas-projects/not-owned-canvas/image-layer-workflows", `{}`, false, 401},
		{"POST", "/api/canvas-projects/not-owned-canvas/image-layer-workflows", `{"apiKey":"forbidden"}`, true, 400},
		{"POST", "/api/canvas-projects/not-owned-canvas/image-layer-workflows", `{} {}`, true, 400},
		{"POST", "/api/canvas-projects/not-owned-canvas/image-layer-workflows", `{"requestId":"native-workflow-http-request","sourceNodeId":"image","resourceId":"foreign-image","expectedSourceSha256":"` + strings.Repeat("a", 64) + `","maxCredits":0,"layers":[{"name":"底图","method":"source"},{"name":"对象","method":"generate","generation":{"model":"test","prompt":"test"}}]}`, true, 404},
		{"POST", "/api/canvas-projects/not-owned-canvas/image-layer-groups/group/materials", `{"requestId":"native-materials-http-request","sourceGroupSha256":"` + strings.Repeat("a", 64) + `"}`, false, 401},
		{"POST", "/api/canvas-projects/not-owned-canvas/image-layer-groups/group/materials", `{"requestId":"native-materials-http-request","sourceGroupSha256":"` + strings.Repeat("a", 64) + `"}`, true, 404},
		{"POST", "/api/canvas-projects/not-owned-canvas/image-layer-groups/group/materials", `{"requestId":"native-materials-http-request","sourceGroupSha256":"` + strings.Repeat("a", 64) + `","resourceId":"foreign-image"}`, true, 400},
		{"POST", "/api/canvas-projects/not-owned-canvas/image-layer-groups/group/materials", `{} {}`, true, 400},
	} {
		req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
		req.Header.Set("Content-Type", "application/json")
		if tc.auth {
			req.AddCookie(&http.Cookie{Name: service.SessionCookieName, Value: "image-session.image-test-token"})
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		if w.Code != tc.status {
			t.Fatalf("%s %s status %d != %d: %s", tc.method, tc.path, w.Code, tc.status, w.Body.String())
		}
	}
	if err := db.Model(&model.Task{}).Count(&count).Error; err != nil || count != 0 {
		t.Fatal("rejected writes created tasks", err)
	}
}
