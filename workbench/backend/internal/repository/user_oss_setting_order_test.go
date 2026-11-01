package repository

import (
	"fmt"
	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"net/url"
	"os"
	"path/filepath"
	"testing"
	"time"
	"yingce/backend/internal/model"
)

func TestUserOSSHistoryUsesMonotonicCreationOrder(t *testing.T) {
	for _, driver := range []string{"sqlite", "postgres"} {
		t.Run(driver, func(t *testing.T) {
			fixed := time.Date(2026, 10, 24, 0, 0, 0, 0, time.UTC)
			config := &gorm.Config{Logger: logger.Default.LogMode(logger.Silent), NowFunc: func() time.Time { return fixed }}
			var dialect gorm.Dialector = sqlite.Open(filepath.Join(t.TempDir(), "settings.db"))
			if driver == "postgres" {
				dsn := os.Getenv("CANVAS_TEST_POSTGRES_DSN")
				if dsn == "" {
					t.Skip("isolated PostgreSQL not configured")
				}
				admin, err := gorm.Open(postgres.Open(dsn), config)
				if err != nil {
					t.Fatal(err)
				}
				closeTestDatabase(t, admin)
				schema := fmt.Sprintf("oss_order_%d", time.Now().UnixNano())
				if err := admin.Exec("CREATE SCHEMA " + schema).Error; err != nil {
					t.Fatal(err)
				}
				t.Cleanup(func() {
					if err := admin.Exec("DROP SCHEMA " + schema + " CASCADE").Error; err != nil {
						t.Error(err)
					}
				})
				parsed, err := url.Parse(dsn)
				if err != nil {
					t.Fatal(err)
				}
				query := parsed.Query()
				query.Set("search_path", schema)
				parsed.RawQuery = query.Encode()
				dialect = postgres.Open(parsed.String())
			}
			db, err := gorm.Open(dialect, config)
			if err != nil {
				t.Fatal(err)
			}
			closeTestDatabase(t, db)
			if err := db.AutoMigrate(&model.UserOSSSetting{}); err != nil {
				t.Fatal(err)
			}
			repo := New(db)
			first := model.UserOSSSetting{ID: "z-first", UserID: "user", ValueJSON: `{"version":1}`}
			second := model.UserOSSSetting{ID: "a-second", UserID: "user", ValueJSON: `{"version":2}`}
			other := model.UserOSSSetting{ID: "other", UserID: "other-user"}
			for _, item := range []*model.UserOSSSetting{&first, &second, &other} {
				if err := repo.CreateUserOSSSetting(item); err != nil {
					t.Fatal(err)
				}
			}
			latest, err := repo.LatestUserOSSSetting("user")
			if err != nil || latest.ID != second.ID || !second.CreatedAt.After(first.CreatedAt) {
				t.Fatal("latest update was lost on a clock tie", latest, err)
			}
			if !other.CreatedAt.Equal(first.CreatedAt) {
				t.Fatal("one user's history affected another's timestamp")
			}
			historical, err := repo.UserOSSSettingForUser("user", first.ID)
			if err != nil || historical.ValueJSON != first.ValueJSON || !historical.CreatedAt.Equal(first.CreatedAt) {
				t.Fatal("historical settings changed", err)
			}
		})
	}
}
