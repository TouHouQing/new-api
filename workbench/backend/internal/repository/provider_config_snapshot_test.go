package repository

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"yingce/backend/internal/model"
)

func TestProviderConfigSnapshotCASPreservesFirstSubmissionAndRejectsLateFreeze(t *testing.T) {
	for _, driver := range []string{"sqlite", "postgres"} {
		t.Run(driver, func(t *testing.T) {
			config := &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)}
			var dialect gorm.Dialector = sqlite.Open(filepath.Join(t.TempDir(), "snapshot.db"))
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
				schema := fmt.Sprintf("provider_snapshot_%d", time.Now().UnixNano())
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
			if driver == "sqlite" {
				conn, _ := db.DB()
				conn.SetMaxOpenConns(1)
			}
			if err := db.AutoMigrate(&model.RouteAttempt{}); err != nil {
				t.Fatal(err)
			}
			repo := New(db)
			attempt := model.RouteAttempt{ID: "snapshot", TaskID: "task", RouteRun: 1, AttemptNumber: 1, DispatchState: "not_sent"}
			if err := repo.CreateRouteAttempt(&attempt); err != nil {
				t.Fatal(err)
			}
			var wg sync.WaitGroup
			results := make(chan string, 8)
			for index := 0; index < 8; index++ {
				wg.Add(1)
				go func(index int) {
					defer wg.Done()
					value, err := repo.FreezeRouteAttemptProviderConfig(attempt.ID, fmt.Sprintf("cipher-%d", index))
					if err != nil {
						t.Error(err)
						return
					}
					results <- value
				}(index)
			}
			wg.Wait()
			close(results)
			winner := ""
			for value := range results {
				if winner == "" {
					winner = value
				}
				if value != winner {
					t.Fatal("concurrent workers used different configs")
				}
			}
			if winner == "" {
				t.Fatal("no config captured")
			}
			// A status writer loaded before freezing still holds an empty cipher.
			attempt.DispatchState, attempt.ProviderRequestID = "accepted", "original-receipt"
			if err := repo.SaveRouteAttempt(&attempt); err != nil {
				t.Fatal(err)
			}
			stored, err := repo.LatestRouteAttempt("task")
			if err != nil || stored.ProviderConfigCipher != winner || stored.ProviderRequestID != "original-receipt" {
				t.Fatal("stale status save erased config or receipt", err)
			}
			other := model.RouteAttempt{ID: "legacy", TaskID: "legacy-task", RouteRun: 1, AttemptNumber: 1, DispatchState: "accepted"}
			if err := repo.CreateRouteAttempt(&other); err != nil {
				t.Fatal(err)
			}
			if _, err := repo.FreezeRouteAttemptProviderConfig(other.ID, "new-current-config"); err == nil {
				t.Fatal("fabricated original config AFTER submission")
			}
		})
	}
}
