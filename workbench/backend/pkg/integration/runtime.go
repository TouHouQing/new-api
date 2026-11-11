// Package integration embeds the Yingce workbench without exposing its internal
// packages or running a second HTTP listener.
package integration

import (
	"context"
	"errors"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"yingce/backend/internal/app"
	"yingce/backend/internal/database"
	"yingce/backend/internal/handler"
	"yingce/backend/internal/kernel"
	"yingce/backend/internal/repository"
)

type Host = app.WorkbenchHost
type User = app.WorkbenchHostUser
type Model = app.WorkbenchHostModel
type Group = app.WorkbenchHostGroup
type Relay = app.WorkbenchRelay
type Billing = app.WorkbenchHostBilling

type Config struct {
	DB      *gorm.DB
	DataDir string
	Host    Host
}

type Runtime struct {
	svc    *app.Service
	engine *gin.Engine
}

// OpenDatabase shares the standalone server's dialect, connection settings,
// long-text storage and index migrations with the embedded workbench.
// Hosts using a pure-Go SQLite driver may instead supply their own connection.
func OpenDatabase(driver, dsn string) (*gorm.DB, error) {
	return database.Open(database.Config{Driver: driver, DSN: dsn})
}

// Open requires a dedicated database, never the host's account database. The
// caller owns its connection and must call Close before closing that database.
func Open(config Config) (*Runtime, error) {
	if config.DB == nil || config.Host == nil || strings.TrimSpace(config.DataDir) == "" {
		return nil, errors.New("workbench requires a database, data directory and host")
	}
	if err := os.MkdirAll(config.DataDir, 0o700); err != nil {
		return nil, err
	}
	if err := database.ConfigurePool(config.DB); err != nil {
		return nil, err
	}
	if err := database.MigrateSchema(config.DB); err != nil {
		return nil, err
	}
	if err := kernel.ConfigureAPIMount("/api/workbench"); err != nil {
		return nil, err
	}
	svc := app.New(repository.New(config.DB), config.DataDir)
	if err := svc.ConfigureWorkbenchHost(config.Host); err != nil {
		svc.Close()
		return nil, err
	}
	for _, seed := range []func() error{svc.ValidateRuntime, svc.EnsureDefaultUserGroup, svc.EnsureDefaultPromptTemplates, svc.EnsureBuiltinProjectWorkflowTemplate, svc.EnsureBuiltinSkills, svc.EnsureSkillPackages, svc.EnsureBuiltinTools, svc.EnsureBuiltinWorkbenchCatalog} {
		if err := seed(); err != nil {
			svc.Close()
			return nil, err
		}
	}
	if err := svc.ConfigureHostedFeatures(); err != nil {
		svc.Close()
		return nil, err
	}
	engine := gin.New()
	engine.Use(gin.Recovery(), handler.RequestCorrelationMiddleware())
	handler.ConfigureRuntime(svc)
	handler.RegisterCanvasAPI(engine.Group("/api"), svc)
	engine.NoRoute(handler.SystemProxyNoRouteHandler(svc))
	return &Runtime{svc: svc, engine: engine}, nil
}

func (r *Runtime) Start() { r.svc.StartWorker(); r.svc.StartWorkbenchBillingReconciliation() }
func (r *Runtime) Close(ctx context.Context) error {
	err := r.svc.StopWorker(ctx)
	r.svc.Close()
	return err
}

// Serve authenticates using the live host identity supplied in process. Native
// login/account/payment mutations stay unavailable in hosted mode.
func (r *Runtime) Serve(w http.ResponseWriter, request *http.Request, userID string) {
	path, valid := strings.CutPrefix(request.URL.Path, "/api/workbench")
	if !valid || !strings.HasPrefix(path, "/") {
		http.NotFound(w, request)
		return
	}
	if (strings.HasPrefix(path, "/auth/") && path != "/auth/session") || strings.HasPrefix(path, "/admin") || strings.HasPrefix(path, "/payments") || strings.HasPrefix(path, "/referral") || (request.Method != http.MethodGet && strings.HasPrefix(path, "/wallet")) {
		http.Error(w, "Manage accounts, channels and payments in New API", http.StatusForbidden)
		return
	}
	request = request.Clone(app.WithWorkbenchIdentity(request.Context(), userID))
	request.URL.Path = "/api" + path
	request.URL.RawPath = ""
	r.engine.ServeHTTP(w, request)
}

// ValidateTask fences the host's private relay against stale, cancelled and
// foreign tasks. Browser headers cannot supply this proof.
func (r *Runtime) ValidateTask(userID, taskID string) error {
	return r.svc.ValidateWorkbenchTask(userID, taskID)
}

// ValidateTaskRead also permits an owned, leased recovery to query its original
// provider receipt. It never grants permission to submit another generation.
func (r *Runtime) ValidateTaskRead(userID, taskID string) error {
	return r.svc.ValidateWorkbenchTaskRead(userID, taskID)
}
