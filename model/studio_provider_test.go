package model

import (
	"os"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestStudioProviderCredentialsAreScopedToTheUser(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			var dialector gorm.Dialector
			switch dialect {
			case "sqlite":
				dialector = sqlite.Open(":memory:")
			case "mysql":
				dsn := os.Getenv("TEST_MYSQL_DSN")
				if dsn == "" {
					t.Skip("TEST_MYSQL_DSN is not configured")
				}
				dialector = mysql.Open(dsn)
			case "postgres":
				dsn := os.Getenv("TEST_POSTGRES_DSN")
				if dsn == "" {
					t.Skip("TEST_POSTGRES_DSN is not configured")
				}
				dialector = postgres.Open(dsn)
			}
			db, err := gorm.Open(dialector, &gorm.Config{})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			t.Cleanup(func() { _ = sqlDB.Close() })
			require.NoError(t, db.AutoMigrate(&StudioProvider{}))
			require.NoError(t, db.AutoMigrate(&StudioProvider{}))
			previous := DB
			DB = db
			t.Cleanup(func() { DB = previous })

			require.NoError(t, UpsertStudioProvider(12, "text", "https://text.example/v1", "v1:encrypted-text"))
			require.NoError(t, UpsertStudioProvider(12, "image", "https://image.example/v1", "v1:encrypted-image"))
			stored, err := GetStudioProvider(12, "text")
			require.NoError(t, err)
			require.NotNil(t, stored)
			assert.Equal(t, "v1:encrypted-text", stored.EncryptedAPIKey)
			other, err := GetStudioProvider(13, "text")
			require.NoError(t, err)
			assert.Nil(t, other)

			require.NoError(t, UpsertStudioProvider(12, "text", "https://new.example/v1", "v1:replacement"))
			rows, err := ListStudioProviders(12)
			require.NoError(t, err)
			assert.Len(t, rows, 2)
			updated, err := GetStudioProvider(12, "text")
			require.NoError(t, err)
			assert.Equal(t, "https://new.example/v1", updated.BaseURL)
			assert.Equal(t, "v1:replacement", updated.EncryptedAPIKey)

			require.NoError(t, DeleteStudioProvider(12, "text"))
			deleted, err := GetStudioProvider(12, "text")
			require.NoError(t, err)
			assert.Nil(t, deleted)
			remaining, err := GetStudioProvider(12, "image")
			require.NoError(t, err)
			assert.NotNil(t, remaining)
			require.NoError(t, db.AutoMigrate(&StudioProvider{}))
			preserved, err := GetStudioProvider(12, "image")
			require.NoError(t, err)
			require.NotNil(t, preserved)
			assert.Equal(t, "v1:encrypted-image", preserved.EncryptedAPIKey)
		})
	}
}
