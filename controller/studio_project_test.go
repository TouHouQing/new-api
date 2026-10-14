package controller

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func TestStudioProjectReviewAndMediaPermissions(t *testing.T) {
	for _, kind := range []string{"video", "image", "audio"} {
		t.Run(kind, func(t *testing.T) { testStudioProjectReviewAndMediaPermissions(t, kind) })
	}
}

func testStudioProjectReviewAndMediaPermissions(t *testing.T, kind string) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "studio.db")), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.StudioProject{}, &model.StudioProjectVersion{}, &model.StudioProjectMember{}, &model.StudioMedia{}, &model.StudioProjectMediaLink{}))
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	original := model.DB
	model.DB = db
	t.Cleanup(func() { model.DB = original; sqlDB.Close() })
	t.Setenv("STUDIO_STORAGE_DIR", t.TempDir())
	t.Setenv("TASK_ARTIFACT_STORE_MODE", "upstream")
	mime := map[string]string{"video": "video/mp4", "image": "image/png", "audio": "audio/wav"}[kind]
	_, err = service.SaveStudioMedia(1, "clip", mime, strings.NewReader("video-bytes"))
	require.NoError(t, err)
	_, err = service.SaveStudioMedia(1, "private", "video/mp4", strings.NewReader("private-bytes"))
	require.NoError(t, err)
	require.NoError(t, service.LinkStudioProjectMedia("film", "clip"))
	document := `{"id":"film","title":"Film","createdAt":"2026-10-03T00:00:00Z","updatedAt":"2026-10-03T00:00:00Z","nodes":[{"id":"video","type":"studio","position":{"x":0,"y":0},"data":{"kind":"video","title":"Video","prompt":"","mediaId":"clip","selectedTakeId":"take","takes":[{"id":"take","createdAt":"2026-10-03T00:00:00Z","prompt":"","status":"completed","mediaId":"clip"}]}}],"edges":[]}`
	document = strings.Replace(document, `"kind":"video"`, `"kind":"`+kind+`"`, 1)
	_, err = model.SaveStudioProject(1, "film", "Film", 0, document)
	require.NoError(t, err)
	require.NoError(t, db.Create(&model.StudioProjectMember{ProjectID: "film", UserID: 2, Role: "reviewer"}).Error)
	require.NoError(t, db.Create(&model.StudioProjectMember{ProjectID: "film", UserID: 3, Role: "viewer"}).Error)
	require.NoError(t, db.Create(&model.StudioProjectMember{ProjectID: "film", UserID: 4, Role: "editor"}).Error)
	engine := gin.New()
	// Authentication has separate middleware tests; this fixture isolates the
	// handlers' server-side project permissions with explicit actor identities.
	engine.Use(func(c *gin.Context) {
		id, err := strconv.Atoi(c.GetHeader("X-Test-Actor"))
		if err != nil {
			c.AbortWithStatus(401)
			return
		}
		c.Set("id", id)
	})
	engine.GET("/projects", ListStudioProjects)
	engine.POST("/projects/:project_id/review", ReviewStudioProjectTake)
	engine.PUT("/projects/:project_id", PutStudioProject)
	engine.GET("/media/:media_id", StudioProjectMedia)
	engine.PUT("/media/:media_id", StudioProjectMedia)
	engine.POST("/sessions/:session_id/commands", QueueStudioBridgeCommand)
	request := func(actor int, method, path string, body any) *httptest.ResponseRecorder {
		raw, err := common.Marshal(body)
		require.NoError(t, err)
		req := httptest.NewRequest(method, path, bytes.NewReader(raw))
		req.Header.Set("X-Test-Actor", strconv.Itoa(actor))
		req.Header.Set("Content-Type", "application/json")
		writer := httptest.NewRecorder()
		engine.ServeHTTP(writer, req)
		return writer
	}
	for _, actor := range []int{1, 3} {
		summary := request(actor, http.MethodGet, "/projects?summary=true&offset=0&limit=1", nil)
		require.Equal(t, http.StatusOK, summary.Code)
		var page struct {
			Data struct {
				Projects []map[string]any `json:"projects"`
				Total    int              `json:"total"`
			} `json:"data"`
		}
		require.NoError(t, common.Unmarshal(summary.Body.Bytes(), &page))
		require.Len(t, page.Data.Projects, 1)
		assert.Equal(t, "film", page.Data.Projects[0]["id"])
		assert.NotContains(t, page.Data.Projects[0], "document")
		assert.Equal(t, 1, page.Data.Total)
	}
	denied := request(9, http.MethodGet, "/projects?summary=true", nil)
	assert.NotContains(t, denied.Body.String(), `"id":"film"`)
	assert.Equal(t, http.StatusBadRequest, request(1, http.MethodGet, "/projects?summary=true&limit=101", nil).Code)
	assert.Contains(t, request(1, http.MethodGet, "/projects", nil).Body.String(), `"document"`)

	decision := map[string]any{"revision": 1, "node_id": "video", "take_id": "take", "status": "approved", "note": "Reviewed"}
	assert.Equal(t, http.StatusNotFound, request(3, http.MethodPost, "/projects/film/review", decision).Code)
	assert.Equal(t, http.StatusNotFound, request(9, http.MethodPost, "/projects/film/review", decision).Code)
	approved := request(2, http.MethodPost, "/projects/film/review", decision)
	require.Equal(t, http.StatusOK, approved.Code, approved.Body.String())
	project, _, err := model.StudioProjectAccess(db, 1, "film", false)
	require.NoError(t, err)
	assert.Equal(t, int64(2), project.Revision)
	var version model.StudioProjectVersion
	require.NoError(t, db.Where("project_id = ? AND revision = ?", "film", 2).First(&version).Error)
	assert.Equal(t, 2, version.AuthorID)
	var saved map[string]any
	require.NoError(t, common.Unmarshal([]byte(project.Document), &saved))
	assert.Equal(t, http.StatusNotFound, request(2, http.MethodPut, "/projects/film", map[string]any{"revision": 2, "document": saved}).Code)
	production := saved["production"].(map[string]any)
	production["reviews"] = []any{}
	assert.Equal(t, http.StatusBadRequest, request(4, http.MethodPut, "/projects/film", map[string]any{"revision": 2, "document": saved}).Code)
	assert.Equal(t, http.StatusConflict, request(2, http.MethodPost, "/projects/film/review", decision).Code)
	assert.Equal(t, http.StatusNotFound, request(3, http.MethodGet, "/media/private?project_id=film", nil).Code)
	assert.Equal(t, http.StatusNotFound, request(4, http.MethodPut, "/media/private?project_id=film", nil).Code)
	req := httptest.NewRequest(http.MethodGet, "/media/clip?project_id=film", nil)
	req.Header.Set("X-Test-Actor", "3")
	req.Header.Set("Range", "bytes=0-4")
	writer := httptest.NewRecorder()
	engine.ServeHTTP(writer, req)
	assert.Equal(t, http.StatusPartialContent, writer.Code)
	assert.Equal(t, "video", writer.Body.String())
	assert.Equal(t, "bytes 0-4/11", writer.Header().Get("Content-Range"))
	previousBridge := service.DefaultStudioBridge
	service.DefaultStudioBridge = service.NewStudioBridge()
	t.Cleanup(func() { service.DefaultStudioBridge = previousBridge })
	bridge, err := service.DefaultStudioBridge.Open(4, "browser", service.StudioBridgeOpen{ProjectID: "film", Title: "Film", Revision: 1, Snapshot: []byte(`{"contractVersion":1,"project":{"id":"film","nodes":[],"edges":[]}}`), Permissions: service.StudioBridgePermissions{AllowEdits: true}})
	require.NoError(t, err)
	command := map[string]any{"requestId": "6af14864-b566-4f2e-833e-7b64fd6e2fc1", "kind": "edit", "expectedRevision": 1, "operations": []any{map[string]any{"op": "move_nodes", "nodes": []any{map[string]any{"id": "video", "position": map[string]any{"x": 10, "y": 10}}}}}}
	assert.Equal(t, http.StatusAccepted, request(4, http.MethodPost, "/sessions/"+bridge.ID+"/commands", command).Code)
	require.NoError(t, db.Model(&model.StudioProjectMember{}).Where("project_id = ? AND user_id = ?", "film", 4).Update("role", "viewer").Error)
	command["requestId"] = "2392091d-386b-4a2b-8019-9edbcf981145"
	response := request(4, http.MethodPost, "/sessions/"+bridge.ID+"/commands", command)
	assert.Equal(t, http.StatusForbidden, response.Code)
}
