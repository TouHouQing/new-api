package controller

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

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

func TestStudioReviewShareExpiryRevocationFrozenMediaAndFeedback(t *testing.T) {
	db := studioReviewDatabase(t)
	var err error
	_, err = service.SaveStudioMedia(1, "shared", "video/mp4", strings.NewReader("shared-video"))
	require.NoError(t, err)
	_, err = service.SaveStudioMedia(1, "private", "video/mp4", strings.NewReader("private-video"))
	require.NoError(t, err)
	_, err = model.SaveStudioProject(1, "film", "Film", 0, `{"id":"film","title":"Film","nodes":[],"edges":[],"createdAt":"2026-10-04T00:00:00Z","updatedAt":"2026-10-04T00:00:00Z"}`)
	require.NoError(t, err)
	require.NoError(t, service.LinkStudioProjectMedia("film", "shared"))
	token := strings.Repeat("x", 43)
	digest := sha256.Sum256([]byte(token))
	share := model.StudioReviewShare{ID: "share", ProjectID: "film", CreatorID: 1, TokenHash: hex.EncodeToString(digest[:]), Revision: 1, MediaID: "shared", AllowComments: true, ExpiresAt: time.Now().Add(time.Hour)}
	require.NoError(t, db.Create(&share).Error)
	engine := gin.New()
	engine.GET("/review/:share_id", ReadStudioReviewShare)
	engine.GET("/review/:share_id/media/:media_id", ReadStudioReviewShare)
	engine.POST("/review/:share_id/comments", ReadStudioReviewShare)
	request := func(method, path, credential, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
		req.Header.Set("X-Studio-Review-Token", credential)
		rec := httptest.NewRecorder()
		engine.ServeHTTP(rec, req)
		return rec
	}
	assert.Equal(t, http.StatusNotFound, request("GET", "/review/share", "", "").Code)
	assert.Equal(t, http.StatusOK, request("GET", "/review/share", token, "").Code)
	assert.Equal(t, "shared-video", request("GET", "/review/share/media/shared", token, "").Body.String())
	assert.Equal(t, http.StatusNotFound, request("GET", "/review/share/media/private", token, "").Code)
	feedback := request("POST", "/review/share/comments", token, `{"name":"Client","message":"Fix the third shot","seconds":12}`)
	assert.Equal(t, http.StatusOK, feedback.Code)
	var parsed map[string]any
	require.NoError(t, common.Unmarshal(feedback.Body.Bytes(), &parsed))
	var comment model.StudioReviewComment
	require.NoError(t, db.First(&comment).Error)
	assert.Equal(t, int64(1), comment.Revision)
	assert.Equal(t, 12.0, comment.Seconds)
	assert.Zero(t, comment.AuthorID)
	require.NoError(t, db.Model(&share).Update("allow_comments", false).Error)
	assert.Equal(t, http.StatusBadRequest, request("POST", "/review/share/comments", token, `{"message":"Denied","seconds":1}`).Code)
	require.NoError(t, db.Model(&share).Update("expires_at", time.Now().Add(-time.Second)).Error)
	assert.Equal(t, http.StatusNotFound, request("GET", "/review/share", token, "").Code)
	require.NoError(t, db.Model(&share).Updates(map[string]any{"expires_at": time.Now().Add(time.Hour), "revoked_at": time.Now()}).Error)
	assert.Equal(t, http.StatusNotFound, request("GET", "/review/share", token, "").Code)
}

func TestStudioUncertainWorkflowCanOnlyBeAbandonedWithAcknowledgement(t *testing.T) {
	db := studioReviewDatabase(t)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.UserSubscription{}))
	require.NoError(t, db.Create(&model.User{Id: 1, Username: "workflow-owner", Quota: 1000, Status: common.UserStatusEnabled}).Error)
	_, err := model.SaveStudioProject(1, "film", "Film", 0, `{"id":"film","title":"Film","nodes":[],"edges":[]}`)
	require.NoError(t, err)
	job := model.StudioWorkflowJob{ID: "unresolved", UserID: 1, ProjectID: "film", RequestID: "request", Kind: "generate", Status: "uncertain", Budget: 123, Plan: "{}", Result: `{"phase":"submitting","request_id":"original-request"}`}
	require.NoError(t, db.Create(&job).Error)
	engine := gin.New()
	engine.Use(func(c *gin.Context) { c.Set("id", 1) })
	engine.POST("/jobs/:job_id/control", StudioWorkflowJob)
	call := func(body string) *httptest.ResponseRecorder {
		response := httptest.NewRecorder()
		engine.ServeHTTP(response, httptest.NewRequest("POST", "/jobs/unresolved/control", strings.NewReader(body)))
		return response
	}
	assert.Equal(t, http.StatusBadRequest, call(`{"action":"abandon"}`).Code)
	assert.Equal(t, http.StatusOK, call(`{"action":"abandon","acknowledge_uncertainty":true,"note":"Provider receipt checked; stop tracking this unresolved result"}`).Code)
	require.NoError(t, db.First(&job, "id = ?", job.ID).Error)
	assert.Equal(t, "cancelled", job.Status)
	assert.Equal(t, int64(123), job.Budget)
	assert.Contains(t, string(job.Result), "original-request")
	assert.Contains(t, job.Error, "stop tracking")
	require.NoError(t, db.AutoMigrate(&model.Token{}))
	paused := model.StudioWorkflowJob{ID: "paused", UserID: 1, ProjectID: "film", RequestID: "paused-request", Kind: "generate", Status: "paused", LeaseUntil: time.Now().Unix() - 1, Plan: "{}", Result: `{"phase":"preparing"}`}
	require.NoError(t, db.Create(&paused).Error)
	response := httptest.NewRecorder()
	engine.ServeHTTP(response, httptest.NewRequest("POST", "/jobs/paused/control", strings.NewReader(`{"action":"resume","confirm_generation":true}`)))
	assert.Equal(t, http.StatusOK, response.Code, "an expired lease from a stopped server cannot prevent resuming a paused workflow")
}

func studioReviewDatabase(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "review.db")), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.StudioProject{}, &model.StudioProjectMember{}, &model.StudioProjectVersion{}, &model.StudioMedia{}, &model.StudioProjectMediaLink{}, &model.StudioReviewComment{}, &model.StudioReviewShare{}, &model.StudioWorkflowJob{}, &model.StudioWorkflowEvent{}))
	previous := model.DB
	model.DB = db
	t.Cleanup(func() { model.DB = previous; sqlDB, _ := db.DB(); sqlDB.Close() })
	t.Setenv("STUDIO_STORAGE_DIR", t.TempDir())
	t.Setenv("TASK_ARTIFACT_STORE_MODE", "upstream")
	return db
}

func TestStudioResumeRetriesOnlyConfirmedFailedTask(t *testing.T) {
	for _, taskStatus := range []model.TaskStatus{model.TaskStatusFailure, model.TaskStatusSuccess, model.TaskStatusInProgress} {
		t.Run(string(taskStatus), func(t *testing.T) {
			db := studioReviewDatabase(t)
			require.NoError(t, db.AutoMigrate(&model.User{}, &model.Task{}, &model.StudioWorkflowCharge{}))
			require.NoError(t, db.Create(&model.User{Id: 1, Username: "retry-owner", Quota: 1000, Status: common.UserStatusEnabled}).Error)
			_, err := model.SaveStudioProject(1, "film", "Film", 0, "{}")
			require.NoError(t, err)
			job := model.StudioWorkflowJob{ID: "retry", UserID: 1, ProjectID: "film", RequestID: "workflow-request", Kind: "generate", Status: "failed", Budget: 1000, Plan: "{}", Result: `{"phase":"waiting","node_id":"video","task_id":"upstream","request_id":"video-request","response_media_id":"receipt","completed":["text","image"],"outputs":{"image":{"mediaId":"saved-image"}}}`}
			require.NoError(t, db.Create(&job).Error)
			require.NoError(t, db.Create(&model.Task{TaskID: "upstream", UserId: 1, Status: taskStatus}).Error)
			engine := gin.New()
			engine.Use(func(c *gin.Context) { c.Set("id", 1) })
			engine.POST("/jobs/:job_id/control", StudioWorkflowJob)
			response := httptest.NewRecorder()
			engine.ServeHTTP(response, httptest.NewRequest("POST", "/jobs/retry/control", strings.NewReader(`{"action":"resume","confirm_generation":true}`)))
			require.Equal(t, http.StatusOK, response.Code, response.Body.String())
			require.NoError(t, db.First(&job, "id = ?", job.ID).Error)
			var progress service.StudioWorkflowProgress
			require.NoError(t, common.Unmarshal([]byte(job.Result), &progress))
			assert.Equal(t, "queued", job.Status)
			assert.Equal(t, int64(1000), job.Budget)
			assert.Equal(t, []string{"text", "image"}, progress.Completed)
			assert.Equal(t, "saved-image", progress.Outputs["image"]["mediaId"])
			if taskStatus == model.TaskStatusFailure {
				assert.Empty(t, progress.TaskID)
				assert.Empty(t, progress.RequestID)
				assert.Empty(t, progress.ResponseMediaID)
				assert.Equal(t, "preparing", progress.Phase)
			} else {
				assert.Equal(t, "upstream", progress.TaskID, "existing results and active submissions must never be regenerated")
			}
		})
	}
}

func TestStudioCompletionCursorDoesNotRepeatAcrossTimezonesOrLoseSameTimeJobs(t *testing.T) {
	db := studioReviewDatabase(t)
	_, err := model.SaveStudioProject(1, "film", "Film", 0, "{}")
	require.NoError(t, err)
	timestamp := time.Date(2026, 10, 4, 12, 0, 0, 0, time.FixedZone("CST", 8*3600))
	job := model.StudioWorkflowJob{ID: "done", ProjectID: "film", UserID: 1, RequestID: "first", Status: "succeeded", Kind: "render", Result: "{}", UpdatedAt: timestamp}
	require.NoError(t, db.Create(&job).Error)
	engine := gin.New()
	engine.Use(func(c *gin.Context) { c.Set("id", 1) })
	engine.GET("/projects/:project_id/events", StudioProjectEvents)
	read := func(after string) (string, []model.StudioWorkflowEvent) {
		request := httptest.NewRequest("GET", "/projects/film/events?after="+after, nil)
		response := httptest.NewRecorder()
		engine.ServeHTTP(response, request)
		require.Equal(t, http.StatusOK, response.Code)
		var result struct {
			Data struct {
				Cursor string                      `json:"cursor"`
				Events []model.StudioWorkflowEvent `json:"events"`
			} `json:"data"`
		}
		require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
		return result.Data.Cursor, result.Data.Events
	}
	cursor, events := read("")
	require.Len(t, events, 1)
	assert.Equal(t, "done", events[0].JobID)
	same, events := read(cursor)
	assert.Empty(t, events)
	assert.Equal(t, cursor, same)
	job.ID, job.RequestID, job.Status = "another", "second", "failed"
	require.NoError(t, db.Create(&job).Error)
	newer, events := read(cursor)
	require.Len(t, events, 1)
	assert.Equal(t, "another", events[0].JobID)
	assert.NotEqual(t, cursor, newer)
	_, events = read(newer)
	assert.Empty(t, events)
}
