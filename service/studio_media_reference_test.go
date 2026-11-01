package service

import (
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"gorm.io/gorm/schema"
)

func TestStudioActiveDraftMediaReferences(t *testing.T) {
	document := map[string]any{
		"production": map[string]any{
			"mediaDraft":    map[string]any{"reference_media_ids": []any{"voice", "frame"}},
			"mediaDrafts":   []any{map[string]any{"reference_media_ids": []any{"voice", "depth"}}},
			"assistantPlan": map[string]any{"operation": map[string]any{"media_id": "source"}},
		},
		"nodes": []any{map[string]any{"data": map[string]any{"mediaId": "frame", "takes": []any{map[string]any{"requestSnapshot": `{"media_id":"historical","reference_media_ids":["inactive"]}`}}}}},
	}
	assert.Equal(t, map[string]bool{"voice": true, "frame": true, "depth": true, "source": true}, StudioMediaReferences(document))
}

func TestStudioDraftReferenceDatabaseMatrix(t *testing.T) {
	databases := []struct {
		name, dsn string
		open      func(string) gorm.Dialector
	}{
		{"sqlite", ":memory:", func(dsn string) gorm.Dialector { return sqlite.Open(dsn) }},
		{"mysql", os.Getenv("STUDIO_TEST_MYSQL_DSN"), func(dsn string) gorm.Dialector { return mysql.Open(dsn) }},
		{"postgres", os.Getenv("STUDIO_TEST_POSTGRES_DSN"), func(dsn string) gorm.Dialector { return postgres.Open(dsn) }},
	}
	for _, database := range databases {
		t.Run(database.name, func(t *testing.T) {
			if database.dsn == "" {
				t.Skip("dedicated database DSN is not configured")
			}
			prefix := fmt.Sprintf("studio_ref_verify_%d_", time.Now().UnixNano())
			db, err := gorm.Open(database.open(database.dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent), NamingStrategy: schema.NamingStrategy{TablePrefix: prefix}})
			require.NoError(t, err)
			connection, err := db.DB()
			require.NoError(t, err)
			connection.SetMaxOpenConns(1)
			if database.name == "postgres" {
				require.NoError(t, db.Exec(`CREATE SCHEMA "`+prefix+`"`).Error)
				require.NoError(t, db.Exec(`SET search_path TO "`+prefix+`"`).Error)
			}
			original := model.DB
			model.DB = db
			t.Cleanup(func() {
				assert.NoError(t, db.Migrator().DropTable(&model.StudioProjectMediaLink{}))
				if database.name == "postgres" {
					assert.NoError(t, db.Exec(`DROP SCHEMA "`+prefix+`" CASCADE`).Error)
				}
				model.DB = original
				connection.Close()
			})
			versionSQL := "SELECT version()"
			if database.name == "sqlite" {
				versionSQL = "SELECT sqlite_version()"
			}
			var version string
			require.NoError(t, db.Raw(versionSQL).Scan(&version).Error)
			t.Logf("Engine: %s %s", database.name, version)
			for range 2 {
				require.NoError(t, db.AutoMigrate(&model.StudioProjectMediaLink{}))
			}
			refs := StudioMediaReferences(map[string]any{"production": map[string]any{"mediaDraft": map[string]any{"reference_media_ids": []any{"same-source", "draft-only"}}, "mediaDrafts": []any{map[string]any{"reference_media_ids": []any{"same-source"}}}}})
			require.Len(t, refs, 2)
			for range 2 {
				for id := range refs {
					require.NoError(t, LinkStudioProjectMedia("owned-project", id))
				}
			}
			var count int64
			require.NoError(t, db.Model(&model.StudioProjectMediaLink{}).Count(&count).Error)
			assert.Equal(t, int64(2), count)
			assert.True(t, StudioProjectHasMedia("owned-project", "draft-only"))
			assert.False(t, StudioProjectHasMedia("another-project", "draft-only"))
			assert.False(t, StudioProjectHasMedia("owned-project", strings.Repeat("x", 128)))
		})
	}
}
