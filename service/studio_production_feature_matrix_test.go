package service

import (
	"bytes"
	"fmt"
	"image"
	"image/png"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	mysqldriver "github.com/go-sql-driver/mysql"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"gorm.io/gorm/schema"
)

// External engines are restricted to the dedicated acceptance container hosts.
// Run with STUDIO_MATRIX_REQUIRED=1 to make missing engine configuration fail.
func TestStudioProductionFeatureDatabaseMatrix(t *testing.T) {
	for _, engine := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(engine, func(t *testing.T) {
			var dialect gorm.Dialector
			switch engine {
			case "sqlite":
				dialect = sqlite.Open(filepath.Join(t.TempDir(), "features.db"))
			case "mysql":
				dsn := os.Getenv("STUDIO_TEST_MYSQL_DSN")
				if dsn == "" {
					if os.Getenv("STUDIO_MATRIX_REQUIRED") == "1" {
						t.Fatal("dedicated acceptance MySQL DSN is required")
					}
					t.Skip("dedicated acceptance MySQL is not configured")
				}
				config, err := mysqldriver.ParseDSN(dsn)
				if err != nil || config.Net != "tcp" || !strings.HasPrefix(config.Addr, "studio-acceptance-mysql:") || config.DBName == "" || config.DBName == "mysql" || config.DBName == "information_schema" || config.DBName == "performance_schema" || config.DBName == "sys" {
					t.Fatal("feature matrix refuses any MySQL host outside the dedicated acceptance container")
				}
				dialect = mysql.Open(dsn)
			case "postgres":
				dsn := os.Getenv("STUDIO_TEST_POSTGRES_DSN")
				if dsn == "" {
					if os.Getenv("STUDIO_MATRIX_REQUIRED") == "1" {
						t.Fatal("dedicated acceptance PostgreSQL DSN is required")
					}
					t.Skip("dedicated acceptance PostgreSQL is not configured")
				}
				config, err := pgx.ParseConfig(dsn)
				if err != nil || config.Host != "studio-acceptance-postgres" || config.Database == "" || config.Database == "postgres" || config.Database == "template0" || config.Database == "template1" {
					t.Fatal("feature matrix refuses any PostgreSQL host outside the dedicated acceptance container")
				}
				dialect = postgres.Open(dsn)
			}
			prefix := "sf_" + strings.ReplaceAll(uuid.NewString(), "-", "")[:12] + "_"
			db, err := gorm.Open(dialect, &gorm.Config{Logger: logger.Default.LogMode(logger.Silent), NamingStrategy: schema.NamingStrategy{TablePrefix: prefix}})
			if err != nil {
				t.Fatal("dedicated acceptance database connection failed; credentials are omitted")
			}
			sqlDB, err := db.DB()
			require.NoError(t, err)
			sqlDB.SetMaxOpenConns(1)
			models := []any{&model.StudioWorkflowCharge{}, &model.StudioWorkflowEvent{}, &model.StudioWorkflowJob{}, &model.StudioProductionRecord{}, &model.StudioProjectMediaLink{}, &model.StudioMedia{}, &model.StudioProjectMember{}, &model.StudioProjectVersion{}, &model.StudioProject{}, &model.Task{}, &model.Token{}, &model.User{}}
			if engine == "postgres" {
				require.NoError(t, db.Exec(`CREATE SCHEMA "`+prefix+`"`).Error)
				require.NoError(t, db.Exec(`SET search_path TO "`+prefix+`"`).Error)
			}
			original, oldType := model.DB, common.MainDatabaseType()
			model.DB = db
			common.SetMainDatabaseType(common.DatabaseType(engine))
			t.Cleanup(func() {
				model.DB = original
				common.SetMainDatabaseType(oldType)
				if engine == "postgres" {
					assert.NoError(t, db.Exec(`DROP SCHEMA "`+prefix+`" CASCADE`).Error)
				} else {
					for _, item := range models {
						assert.NoError(t, db.Migrator().DropTable(item))
					}
				}
				assert.NoError(t, sqlDB.Close())
			})
			for range 2 {
				require.NoError(t, db.AutoMigrate(models...))
			}
			var version string
			query := "SELECT version()"
			if engine == "sqlite" {
				query = "SELECT sqlite_version()"
			}
			require.NoError(t, db.Raw(query).Scan(&version).Error)
			t.Logf("isolated engine: %s %s", engine, version)
			t.Setenv("STUDIO_STORAGE_DIR", t.TempDir())
			t.Setenv("TASK_ARTIFACT_STORE_MODE", "upstream")
			for _, user := range []model.User{{Id: 1, Username: "matrix-owner", AffCode: "matrix-owner", Status: common.UserStatusEnabled}, {Id: 2, Username: "matrix-reviewer", AffCode: "matrix-reviewer", Status: common.UserStatusEnabled}} {
				require.NoError(t, db.Create(&user).Error)
			}
			exerciseStudioProductionFeatures(t, db)
			for range 2 {
				require.NoError(t, db.AutoMigrate(models...))
			}
			definition, err := ReadStudioTemplateDefinition(1, "template", 1)
			require.NoError(t, err)
			assert.EqualValues(t, 1, definition.Version)
			snapshot, err := ReadStudioCollaborationSnapshot(1, "source")
			require.NoError(t, err)
			require.Len(t, snapshot.Assignments, 1)
			assert.Equal(t, "closed", snapshot.Assignments[0].State)
			publication, _, err := ReadStudioPublication(1, "source", "release")
			require.NoError(t, err)
			assert.Equal(t, "cancelled", publication.State)
			assert.Len(t, publication.Packages, 4)
		})
	}
}

func exerciseStudioProductionFeatures(t *testing.T, db *gorm.DB) {
	t.Helper()
	var encoded bytes.Buffer
	require.NoError(t, png.Encode(&encoded, image.NewRGBA(image.Rect(0, 0, 8, 8))))
	for _, id := range []string{"original", "replacement"} {
		_, err := SaveStudioMedia(1, id, "image/png", bytes.NewReader(encoded.Bytes()))
		require.NoError(t, err)
	}
	source := `{"id":"source","title":"Coffee","nodes":[{"id":"shot","type":"studio","position":{"x":0,"y":0},"data":{"kind":"image","title":"Coffee closeup","prompt":"Coffee on a table","status":"completed","mediaId":"original","selectedTakeId":"first","takes":[{"id":"first","prompt":"Coffee on a table","createdAt":"2026-10-18","status":"completed","mediaId":"original"}]}}],"edges":[],"production":{"creativeBrief":{"subject":"Coffee"}},"createdAt":"2026-10-18","updatedAt":"2026-10-18"}`
	project, err := model.SaveStudioProject(1, "source", "Coffee", 0, source)
	require.NoError(t, err)
	require.NoError(t, LinkStudioProjectMedia("source", "original"))
	require.NoError(t, LinkStudioProjectMedia("source", "replacement"))
	request := StudioTemplateSaveRequest{ID: "template", ProjectID: "source", ProjectRevision: 1, Name: "Own film", SourceLicense: "Own test fixture", Inputs: []StudioTemplateInput{{ID: "subject", Kind: "text", Label: "Subject", Path: "/production/creativeBrief/subject"}}}
	definition, err := SaveStudioTemplate(1, request)
	require.NoError(t, err)
	_, err = ReadStudioTemplateDefinition(2, "template", 1)
	require.ErrorIs(t, err, model.ErrStudioAccess)
	instance, err := InstantiateStudioTemplate(1, definition.ID, StudioTemplateInstantiateRequest{ProjectID: "instance", Title: "Tea film", Version: 1, Inputs: map[string]any{"subject": "Tea"}, Media: map[string]string{"original": "replacement"}})
	require.NoError(t, err)
	assert.Contains(t, string(instance.Document), `"subject":"Tea"`)
	assert.Contains(t, string(instance.Document), `"prompt":"Coffee on a table"`)
	assert.Contains(t, string(instance.Document), `"mediaId":"replacement"`)
	assert.True(t, StudioProjectHasMedia(instance.ID, "replacement"))
	project, err = model.SaveStudioProject(1, "source", "Juice", 1, strings.ReplaceAll(source, "Coffee", "Juice"))
	require.NoError(t, err)
	request.ExpectedVersion, request.ProjectRevision = 1, 2
	definition, err = SaveStudioTemplate(1, request)
	require.NoError(t, err)
	assert.EqualValues(t, 2, definition.Version)
	_, err = SaveStudioTemplate(1, request)
	require.ErrorIs(t, err, model.ErrStudioRevision)
	// A different connection/query sees the pinned instance, not the updated mother.
	var persisted model.StudioProject
	require.NoError(t, db.First(&persisted, "id = ?", "instance").Error)
	assert.Contains(t, string(persisted.Document), `"subject":"Tea"`)
	assert.Contains(t, string(persisted.Document), `"prompt":"Coffee on a table"`)
	request.ExpectedVersion = 2
	request.Bindings = []StudioTemplateBinding{{Path: "/nodes/0/data/prompt", Pattern: "{{subject}} on a table"}}
	definition, err = SaveStudioTemplate(1, request)
	require.NoError(t, err)
	assert.EqualValues(t, 3, definition.Version)
	linked, err := InstantiateStudioTemplate(1, definition.ID, StudioTemplateInstantiateRequest{ProjectID: "linked-instance", Title: "New subject needs new media", Version: 3, Inputs: map[string]any{"subject": "Tea"}, ReuseOriginalMedia: true})
	require.NoError(t, err)
	var linkedDocument map[string]any
	require.NoError(t, common.Unmarshal([]byte(linked.Document), &linkedDocument))
	linkedNode := studioObjects(linkedDocument, "nodes")[0]["data"].(map[string]any)
	assert.Equal(t, "Tea on a table", linkedNode["prompt"])
	assert.Nil(t, linkedNode["mediaId"])
	assert.Nil(t, linkedNode["selectedTakeId"])
	assert.Equal(t, "Juice on a table", studioObjects(linkedNode, "takes")[0]["prompt"])
	assert.Equal(t, "original", studioObjects(linkedNode, "takes")[0]["mediaId"])
	require.NoError(t, db.Create(&model.StudioProjectMember{ProjectID: "source", UserID: 2, Role: "reviewer"}).Error)
	_, err = HeartbeatStudioPresence(2, "source", StudioPresenceRequest{SessionID: "matrix-browser", NodeID: "shot", View: "review"})
	require.NoError(t, err)
	assignment, err := SaveStudioReviewAssignment(1, "source", "assignment", StudioReviewAssignmentRequest{OperationID: "create", Operation: "create", Title: "Check original", AssigneeID: 2, Priority: "normal", ProjectRevision: 2, NodeID: "shot", TakeID: "first", MediaID: "original"})
	require.NoError(t, err)
	reply := StudioReviewAssignmentRequest{OperationID: "reply", Operation: "reply", ExpectedVersion: 1, Note: "Please adjust the light"}
	assignment, err = SaveStudioReviewAssignment(2, "source", assignment.ID, reply)
	require.NoError(t, err)
	replay, err := SaveStudioReviewAssignment(2, "source", assignment.ID, reply)
	require.NoError(t, err)
	assert.EqualValues(t, 2, replay.Version)
	assert.Len(t, replay.Events, 2)
	_, err = SaveStudioReviewAssignment(1, "source", assignment.ID, StudioReviewAssignmentRequest{OperationID: "stale", Operation: "status", ExpectedVersion: 1, State: "closed", Note: "old"})
	require.ErrorIs(t, err, model.ErrStudioRevision)
	var document map[string]any
	require.NoError(t, common.Unmarshal([]byte(project.Document), &document))
	data := studioObjects(document, "nodes")[0]["data"].(map[string]any)
	data["mediaId"], data["selectedTakeId"] = "replacement", "second"
	data["takes"] = append(data["takes"].([]any), map[string]any{"id": "second", "prompt": "corrected", "status": "completed", "mediaId": "replacement", "createdAt": "2026-10-18"})
	raw, err := common.Marshal(document)
	require.NoError(t, err)
	project, err = model.SaveStudioProject(1, "source", "Juice", 2, string(raw))
	require.NoError(t, err)
	snapshot, err := ReadStudioCollaborationSnapshot(2, "source")
	require.NoError(t, err)
	require.True(t, snapshot.Assignments[0].Stale)
	assignment, err = SaveStudioReviewAssignment(1, "source", assignment.ID, StudioReviewAssignmentRequest{OperationID: "revision", Operation: "revise", ExpectedVersion: 2, ProjectRevision: 3, NodeID: "shot", TakeID: "second", MediaID: "replacement"})
	require.NoError(t, err)
	assert.Equal(t, "original", assignment.Target.MediaID)
	require.NotNil(t, assignment.RevisionTarget)
	assert.Equal(t, "replacement", assignment.RevisionTarget.MediaID)
	for index, state := range []string{"approved", "closed"} {
		assignment, err = SaveStudioReviewAssignment(2, "source", assignment.ID, StudioReviewAssignmentRequest{OperationID: fmt.Sprintf("finish-%d", index), Operation: "status", ExpectedVersion: assignment.Version, State: state})
		require.NoError(t, err)
	}
	require.NoError(t, db.Delete(&model.StudioProjectMember{}, "project_id = ? AND user_id = ?", "source", 2).Error)
	_, err = HeartbeatStudioPresence(2, "source", StudioPresenceRequest{SessionID: "matrix-browser", NodeID: "shot"})
	require.ErrorIs(t, err, model.ErrStudioAccess)
	video := filepath.Join(t.TempDir(), "finished.mp4")
	output, err := exec.Command(studioFFmpegBinary(false), "-f", "lavfi", "-i", "color=c=blue:s=64x64:d=0.2", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", video).CombinedOutput()
	require.NoError(t, err, string(output))
	file, err := os.Open(video)
	require.NoError(t, err)
	_, err = SaveStudioMedia(1, "finished", "video/mp4", file)
	file.Close()
	require.NoError(t, err)
	require.NoError(t, LinkStudioProjectMedia("source", "finished"))
	require.NoError(t, db.Create(&model.StudioWorkflowJob{ID: "rendered", ProjectID: "source", UserID: 1, RequestID: "rendered", Kind: "render", Status: "succeeded", Revision: 3, Plan: "{}", Result: `{"media_id":"finished","subtitles":"1\n00:00:00,000 --> 00:00:00,200\nReal fixture\n"}`}).Error)
	t.Setenv("STUDIO_CONNECTOR_MATRIX_ACCOUNT_FIXTURE", "isolated-protocol-fixture")
	configs, err := common.Marshal([]StudioConnectorConfig{{ID: "youtube-fixture", Provider: "youtube", OwnerID: 1, AccountID: "channel-fixture", Label: "Isolated fixture", TokenEnv: "STUDIO_CONNECTOR_MATRIX_ACCOUNT_FIXTURE", ExpiresAt: time.Now().Add(2 * time.Hour).Unix()}})
	require.NoError(t, err)
	t.Setenv("STUDIO_CONNECTORS_JSON", string(configs))
	originalClient := studioConnectorHTTPClient
	t.Cleanup(func() { studioConnectorHTTPClient = originalClient })
	studioConnectorHTTPClient = func() *http.Client { t.Fatal("database matrix must not call any external provider"); return nil }
	kids, synthetic := false, true
	publication, err := CreateStudioPublication(1, "source", StudioPublicationRequest{ID: "release", ProjectRevision: 3, RenderJobID: "rendered", Platform: "youtube", ConnectorID: "youtube-fixture", Title: "Fixture film", Visibility: "private", ScheduleAt: time.Now().Add(time.Hour).Unix(), MadeForKids: &kids, SyntheticMedia: &synthetic})
	require.NoError(t, err)
	publication, err = ConfirmStudioPublication(1, "source", publication.ID, publication.Fingerprint, true)
	require.NoError(t, err)
	queued, err := QueueStudioPublication(1, "source", publication.ID, "publish", "stable")
	require.NoError(t, err)
	assert.Equal(t, publication.ScheduleAt, queued.RunAfter)
	assert.Zero(t, queued.Budget)
	assert.Zero(t, queued.TokenID)
	packageJob, err := QueueStudioPublication(1, "source", publication.ID, "package", "stable-package")
	require.NoError(t, err)
	require.NoError(t, runStudioPublicationTestJob(t, packageJob))
	publication, _, err = ReadStudioPublication(1, "source", publication.ID)
	require.NoError(t, err)
	assert.Equal(t, "scheduled", publication.State)
	assert.Equal(t, "packages_ready", publication.PackageState)
	assert.Len(t, publication.Packages, 4)
	publication, err = CancelStudioPublication(1, "source", publication.ID)
	require.NoError(t, err)
	assert.Equal(t, "cancelled", publication.State)
	require.NoError(t, db.First(queued, "id = ?", queued.ID).Error)
	assert.Equal(t, "cancelled", queued.Status)
	assert.Equal(t, "verification_blocked", publication.Verification)
	// Older nullable receipt columns are absent data, not malformed JSON. The
	// graph must still protect every persistent publication artifact.
	legacy := &model.StudioWorkflowJob{ID: "legacy-null-receipt", ProjectID: "source", UserID: 1, RequestID: "legacy-null-receipt", Kind: "quality", Status: "failed", Plan: "{}", Result: "{}"}
	require.NoError(t, db.Create(legacy).Error)
	require.NoError(t, db.Model(legacy).Update("result", nil).Error)
	refs, err := CollectStudioRetentionReferences(t.Context(), db)
	require.NoError(t, err)
	for _, id := range publication.Packages {
		assert.True(t, refs.MediaIDs[id])
	}
}
