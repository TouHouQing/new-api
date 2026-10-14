package controller

import (
	"bytes"
	"fmt"
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"gorm.io/gorm/schema"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"testing"
	"time"
)

// Real database engines exercise the added funding lookup and username invite.
func TestStudioNoviceDatabaseMatrix(t *testing.T) {
	for _, engine := range []struct {
		name, dsn string
		dialect   func(string) gorm.Dialector
	}{
		{"sqlite", ":memory:", func(s string) gorm.Dialector { return sqlite.Open(s) }},
		{"mysql", os.Getenv("STUDIO_TEST_MYSQL_DSN"), func(s string) gorm.Dialector { return mysql.Open(s) }},
		{"postgres", os.Getenv("STUDIO_TEST_POSTGRES_DSN"), func(s string) gorm.Dialector { return postgres.Open(s) }},
	} {
		t.Run(engine.name, func(t *testing.T) {
			if engine.dsn == "" {
				t.Skip("dedicated database not configured")
			}
			db, err := gorm.Open(engine.dialect(engine.dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent), NamingStrategy: schema.NamingStrategy{TablePrefix: fmt.Sprintf("novice_%d_", time.Now().UnixNano())}})
			require.NoError(t, err)
			old := model.DB
			model.DB = db
			tables := []any{&model.User{}, &model.UserSubscription{}, &model.StudioProject{}, &model.StudioProjectVersion{}, &model.StudioProjectMember{}, &model.StudioWorkflowJob{}, &model.Token{}}
			t.Cleanup(func() {
				model.DB = old
				for i := len(tables) - 1; i >= 0; i-- {
					require.NoError(t, db.Migrator().DropTable(tables[i]))
				}
				sqlDB, _ := db.DB()
				sqlDB.Close()
			})
			require.NoError(t, db.AutoMigrate(tables...))
			require.NoError(t, db.Create(&model.User{Id: 1, Username: "owner", AffCode: "novice-owner", Quota: 0, Role: common.RoleCommonUser, Status: common.UserStatusEnabled}).Error)
			require.NoError(t, db.Create(&model.User{Id: 2, Username: "colleague", AffCode: "novice-colleague", DisplayName: "Creative partner", Password: "private-password", Quota: 100, Role: common.RoleCommonUser, Status: common.UserStatusEnabled}).Error)
			quota, funded, err := service.StudioGenerationFunding(1)
			require.NoError(t, err)
			require.Zero(t, quota)
			require.False(t, funded)
			_, funded, err = service.StudioGenerationFunding(2)
			require.NoError(t, err)
			require.True(t, funded)
			film, err := model.SaveStudioProject(1, "film", "Film", 0, `{"id":"film","title":"Film","nodes":[],"edges":[]}`)
			require.NoError(t, err)
			_, err = service.QueueStudioWorkflow(1, film.ID, "credit-request", "generate", film.Revision, 1000, []string{"text"}, nil)
			require.ErrorIs(t, err, service.ErrStudioGenerationCredit)
			var count int64
			require.NoError(t, db.Model(&model.StudioWorkflowJob{}).Count(&count).Error)
			require.Zero(t, count)
			require.NoError(t, db.Model(&model.Token{}).Count(&count).Error)
			require.Zero(t, count)
			budgetToken := model.Token{UserId: 1, Key: "private-budget-key", Name: "workflow budget", UsedQuota: 12345, RemainQuota: 37655}
			require.NoError(t, db.Create(&budgetToken).Error)
			payload := studioJobPayload(&model.StudioWorkflowJob{ID: "usage", UserID: 1, TokenID: budgetToken.Id, Kind: "generate", Status: "uncertain", Budget: 50000, Plan: "{}", Result: "{}"})
			require.Equal(t, 12345, payload["used_quota"])
			require.Equal(t, false, payload["settlement_final"])
			encoded, e := common.Marshal(payload)
			require.NoError(t, e)
			require.NotContains(t, string(encoded), "private-budget-key")
			router := gin.New()
			router.Use(func(c *gin.Context) { id, _ := strconv.Atoi(c.GetHeader("X-Test-Actor")); c.Set("id", id) })
			router.Any("/projects/:project_id/members", StudioProjectMembers)
			call := func(actor int, method string, body any) *httptest.ResponseRecorder {
				raw, e := common.Marshal(body)
				require.NoError(t, e)
				req := httptest.NewRequest(method, "/projects/film/members", bytes.NewReader(raw))
				req.Header.Set("X-Test-Actor", strconv.Itoa(actor))
				w := httptest.NewRecorder()
				router.ServeHTTP(w, req)
				return w
			}
			require.Equal(t, http.StatusOK, call(1, http.MethodPut, map[string]any{"username": "colleague", "role": "viewer"}).Code)
			response := call(1, http.MethodGet, nil)
			require.Equal(t, http.StatusOK, response.Code)
			require.Contains(t, response.Body.String(), "Creative partner")
			require.Contains(t, response.Body.String(), "colleague")
			require.NotContains(t, response.Body.String(), "private-password")
			for _, actor := range []int{2, 9} {
				for _, name := range []string{"colleague", "unknown"} {
					require.Equal(t, http.StatusNotFound, call(actor, http.MethodPut, map[string]any{"username": name, "role": "editor"}).Code)
				}
			}
			require.Equal(t, http.StatusOK, call(1, http.MethodDelete, map[string]any{"username": "colleague"}).Code)
			require.NoError(t, db.Model(&model.StudioProjectMember{}).Count(&count).Error)
			require.Zero(t, count)
			snapshot := `{"id":"checkpoint","title":"Original","createdAt":"2026-10-09T00:00:00Z","updatedAt":"2026-10-09T00:00:00Z","nodes":[],"edges":[]}`
			_, err = model.SaveStudioProject(1, "checkpoint", "Original", 0, snapshot)
			require.NoError(t, err)
			later := `{"id":"checkpoint","title":"Later","createdAt":"2026-10-09T00:00:00Z","updatedAt":"2026-10-09T00:00:00Z","nodes":[],"edges":[],"production":{"milestones":[{"revision":1,"title":"Before editing","createdAt":"2026-10-09T00:00:00Z"}]}}`
			_, err = model.SaveStudioProject(1, "checkpoint", "Later", 1, later)
			require.NoError(t, err)
			router.POST("/projects/:project_id/restore", RestoreStudioProjectVersion)
			request := httptest.NewRequest(http.MethodPost, "/projects/checkpoint/restore", bytes.NewBufferString(`{"revision":1,"expected_revision":2}`))
			request.Header.Set("X-Test-Actor", "1")
			restoredResponse := httptest.NewRecorder()
			router.ServeHTTP(restoredResponse, request)
			require.Equal(t, http.StatusOK, restoredResponse.Code, restoredResponse.Body.String())
			restored, _, err := model.StudioProjectAccess(db, 1, "checkpoint", false)
			require.NoError(t, err)
			require.Equal(t, "Original", restored.Title)
			require.Contains(t, restored.Document, "Before editing")
		})
	}
}
