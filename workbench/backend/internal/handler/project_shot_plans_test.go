package handler

import (
	"encoding/json"
	"github.com/gin-gonic/gin"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
	"yingce/backend/internal/auth"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
	"yingce/backend/internal/service"
)

func TestProjectShotPlanHTTPHistoryRestoreOwnershipAndStrictIntentions(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := database.Open(database.Config{Driver: "sqlite", DSN: ":memory:"})
	if err != nil {
		t.Fatal(err)
	}
	conn, _ := db.DB()
	conn.SetMaxOpenConns(1)
	t.Cleanup(func() { conn.Close() })
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	for _, user := range []string{"owner", "foreign"} {
		for _, row := range []any{&model.User{ID: user, Username: user, Role: model.UserRoleUser, Status: model.UserStatusActive}, &model.AuthSession{ID: user + "-session", UserID: user, TokenHash: auth.HashToken("planning-test-token"), ExpiresAt: time.Now().Add(time.Hour)}} {
			if err := db.Create(row).Error; err != nil {
				t.Fatal(err)
			}
		}
	}
	if err := db.Create(&model.Project{ID: "project", UserID: "owner", Name: "HTTP分镜", Status: model.ProjectStatusActive, Revision: 1}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.ProjectUnit{ID: "unit", ProjectID: "project", Title: "第一章", Kind: model.ProjectUnitKindChapter}).Error; err != nil {
		t.Fatal(err)
	}
	svc := service.New(repository.New(db), t.TempDir())
	t.Cleanup(func() { svc.Close() })
	original, err := svc.CreateProjectShot("owner", "project", service.CreateProjectShotRequest{UnitID: "unit", Title: "原镜头", Description: "原始画面", DurationMs: 1800})
	if err != nil {
		t.Fatal(err)
	}
	router := gin.New()
	RegisterCanvasAPI(router.Group("/api"), svc)
	call := func(method, path string, body any, user string) (int, map[string]any) {
		raw, _ := json.Marshal(body)
		req := httptest.NewRequest(method, "/api"+path, strings.NewReader(string(raw)))
		req.Header.Set("Content-Type", "application/json")
		if user != "" {
			req.AddCookie(&http.Cookie{Name: service.SessionCookieName, Value: user + "-session.planning-test-token"})
		}
		out := httptest.NewRecorder()
		router.ServeHTTP(out, req)
		var response struct {
			Code int            `json:"code"`
			Data map[string]any `json:"data"`
		}
		if json.Unmarshal(out.Body.Bytes(), &response) != nil {
			t.Fatal("non-JSON native response")
		}
		if out.Code == 200 && response.Code != 0 {
			t.Fatal("successful HTTP with failed envelope")
		}
		return out.Code, response.Data
	}
	path := "/projects/project/units/unit"
	if status, _ := call("GET", path+"/shot-plan-source", nil, ""); status != 401 {
		t.Fatal("unauthenticated plan read", status)
	}
	if status, _ := call("GET", path+"/shot-plan-source", nil, "foreign"); status != 404 {
		t.Fatal("foreign plan read", status)
	}
	status, source := call("GET", path+"/shot-plan-source", nil, "owner")
	if status != 200 {
		t.Fatal("source read", status)
	}
	status, result := call("PUT", path+"/shots", map[string]any{"requestId": "phase50-http-replacement", "expectedSourceSha256": source["sha256"], "expectedShotIds": []string{original.ID}, "shots": []any{map[string]any{"title": "新镜头", "description": "新画面", "durationMs": 1800}}}, "owner")
	if status != 200 {
		t.Fatal("replacement", status)
	}
	recordID, ok := result["backupRecordId"].(string)
	if !ok || recordID == "" {
		t.Fatal("replacement lost history")
	}
	status, list := call("GET", path+"/shot-plans", nil, "owner")
	if status != 200 || list["total"] != float64(1) {
		t.Fatal("native history pagination", status)
	}
	status, version := call("GET", "/projects/project/shot-plans/"+recordID, nil, "owner")
	if status != 200 {
		t.Fatal("historical preview", status)
	}
	if revisions, ok := version["revisions"].([]any); !ok || len(revisions) != 1 {
		t.Fatal("historical prompt preview lost")
	}
	status, current := call("GET", path+"/shot-plan-source", nil, "owner")
	if status != 200 {
		t.Fatal(status)
	}
	newShot := result["shots"].([]any)[0].(map[string]any)
	restore := map[string]any{"requestId": "phase50-http-restore-original", "sourceSha256": version["record"].(map[string]any)["payloadSha256"], "expectedSourceSha256": current["sha256"], "expectedShotIds": []any{newShot["id"]}}
	for range 2 {
		status, result = call("POST", "/projects/project/shot-plans/"+recordID+"/restore", restore, "owner")
		if status != 200 || result["current"] != true {
			t.Fatal("restore/replay", status)
		}
	}
	for _, body := range []any{map[string]any{"expectedRevisionId": original.CurrentRevisionID, "unknown": "forged"}, map[string]any{"narrative": map[string]any{"purpose": "ending"}}} {
		if status, _ := call("PATCH", "/projects/project/shots/"+original.ID+"/intentions", body, "owner"); status != 400 {
			t.Fatal("invalid intentions accepted", status)
		}
	}
	if status, _ := call("DELETE", "/projects/project/shots/"+original.ID, nil, "owner"); status != 400 {
		t.Fatal("unconfirmed removal accepted", status)
	}
	if status, _ := call("DELETE", "/projects/project/shots/"+original.ID+"?requestId=stale-confirmed-removal-0001&expectedRevisionId=stale-version", nil, "owner"); status != 409 {
		t.Fatal("stale removal accepted", status)
	}
	var tasks int64
	db.Model(&model.Task{}).Count(&tasks)
	if tasks != 0 {
		t.Fatal("planning actions created model tasks")
	}
}
