package router

import (
	"bytes"
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"math"
	"mime"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"yingce/backend/pkg/integration"
)

var workbenchRuntime *integration.Runtime
var workbenchDatabase *gorm.DB

type workbenchRelayGrant struct {
	userID int
	taskID string
}
type workbenchRelayGrantKey struct{}
type newAPIWorkbenchHost struct{}

func InitializeWorkbench() error {
	if os.Getenv("WORKBENCH_ENABLED") == "false" {
		return nil
	}
	dir := os.Getenv("WORKBENCH_DATA_DIR")
	if dir == "" {
		dir = "workbench-data"
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	driver, dsn := os.Getenv("WORKBENCH_DATABASE_DRIVER"), os.Getenv("WORKBENCH_DATABASE_DSN")
	var dialector gorm.Dialector
	switch driver {
	case "", "sqlite":
		if dsn == "" {
			dsn = filepath.Join(dir, "workbench.db") + "?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)"
		}
		dialector = sqlite.Open(dsn)
	case "mysql":
		if dsn == "" {
			return errors.New("WORKBENCH_DATABASE_DSN is required for MySQL")
		}
		dialector = mysql.Open(dsn)
	case "postgres", "postgresql":
		if dsn == "" {
			return errors.New("WORKBENCH_DATABASE_DSN is required for PostgreSQL")
		}
		dialector = postgres.Open(dsn)
	default:
		return errors.New("unsupported workbench database driver")
	}
	db, err := gorm.Open(dialector, &gorm.Config{})
	if err != nil {
		return err
	}
	if err := validateWorkbenchDatabaseIsolation(model.DB, db); err != nil {
		if connection, e := db.DB(); e == nil {
			_ = connection.Close()
		}
		return err
	}
	runtime, err := integration.Open(integration.Config{DB: db, DataDir: dir, Host: newAPIWorkbenchHost{}})
	if err != nil {
		sqlDB, _ := db.DB()
		if sqlDB != nil {
			_ = sqlDB.Close()
		}
		return err
	}
	workbenchRuntime = runtime
	workbenchDatabase = db
	runtime.Start()
	return nil
}

func ShutdownWorkbench(ctx context.Context) error {
	if workbenchRuntime == nil {
		return nil
	}
	err := workbenchRuntime.Close(ctx)
	if workbenchDatabase != nil {
		db, e := workbenchDatabase.DB()
		if e == nil {
			err = errors.Join(err, db.Close())
		} else {
			err = errors.Join(err, e)
		}
	}
	return err
}

func SetWorkbenchRouter(engine *gin.Engine, assets WebAssets) {
	group := engine.Group("/api/workbench")
	group.Use(middleware.RouteTag("api"), middleware.StudioBridgeOriginGuard(), middleware.DisableCache(), func(c *gin.Context) {
		path := c.Param("path")
		publicRead := (c.Request.Method == http.MethodGet || c.Request.Method == http.MethodHead) && strings.HasPrefix(path, "/public/")
		guestReview := strings.HasPrefix(path, "/review-shares/")
		if publicRead || guestReview {
			if workbenchRuntime == nil {
				c.AbortWithStatus(http.StatusServiceUnavailable)
				return
			}
			workbenchRuntime.Serve(c.Writer, c.Request, "")
			c.Abort()
			return
		}
		c.Next()
	}, workbenchReadSession(), middleware.UserAuth())
	group.Any("/*path", func(c *gin.Context) {
		identity, ok := middleware.GetSessionAuthIdentity(c)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"code": 401, "msg": "Please sign in to New API"})
			return
		}
		if c.Request.Method == http.MethodPost && c.Param("path") == "/host-session" {
			token, valid := strings.CutPrefix(c.GetHeader("Authorization"), "Bearer ")
			if !valid || token == "" {
				c.AbortWithStatus(http.StatusUnauthorized)
				return
			}
			http.SetCookie(c.Writer, &http.Cookie{Name: "new_api_workbench_read", Value: token, Path: "/api/workbench", HttpOnly: true, Secure: common.SessionCookieSecure, SameSite: http.SameSiteStrictMode, MaxAge: 300})
			c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{"ok": true}, "msg": ""})
			return
		}
		if c.Request.Method == http.MethodGet && c.Param("path") == "/host-profile" {
			user, err := model.GetUserById(identity.UserID, false)
			if err != nil || user.Status != common.UserStatusEnabled {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"code": 401, "msg": "Please sign in to New API"})
				return
			}
			role := "user"
			if user.Role >= common.RoleAdminUser {
				role = "admin"
			}
			c.JSON(http.StatusOK, gin.H{"code": 0, "msg": "", "data": gin.H{
				"user":        gin.H{"id": "newapi:" + strconv.Itoa(user.Id), "username": user.Username, "displayName": user.DisplayName, "email": user.Email, "userGroup": user.Group, "role": role, "status": "active"},
				"hasPassword": false, "emailEnabled": false, "linuxdoEnabled": false, "accountSettingsURL": "/profile",
			}})
			return
		}
		if c.Request.Method == http.MethodGet && strings.HasPrefix(c.Param("path"), "/inspirations/") {
			serveWorkbenchInspiration(c, assets.BuildFS)
			return
		}
		if workbenchRuntime == nil {
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"code": 503, "msg": "Workbench is unavailable"})
			return
		}
		workbenchRuntime.Serve(c.Writer, c.Request, strconv.Itoa(identity.UserID))
	})
	// Agents use an explicitly provisioned New API personal access token. This
	// endpoint never creates a model API key or accepts the browser read cookie.
	agent := engine.Group("/api/workbench-agent")
	agent.Use(middleware.RouteTag("api"), middleware.UserAuth(), middleware.StudioBridgeOriginGuard(), middleware.DisableCache())
	agent.Any("/*path", func(c *gin.Context) {
		if workbenchRuntime == nil {
			c.AbortWithStatus(http.StatusServiceUnavailable)
			return
		}
		id := c.GetInt("id")
		if id <= 0 {
			c.AbortWithStatus(http.StatusUnauthorized)
			return
		}
		request := c.Request.Clone(c.Request.Context())
		request.URL.Path = "/api/workbench" + c.Param("path")
		request.URL.RawPath = ""
		workbenchRuntime.Serve(c.Writer, request, strconv.Itoa(id))
	})
	build, err := fs.Sub(assets.BuildFS, "web/dist/workbench")
	if err != nil {
		return
	}
	engine.GET("/workbench", func(c *gin.Context) { c.Redirect(http.StatusTemporaryRedirect, "/workbench/") })
	engine.GET("/workbench/*path", func(c *gin.Context) {
		if workbenchRuntime == nil {
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"code": 503, "msg": "THQ Video 工作台暂不可用，请联系管理员"})
			return
		}
		path := strings.TrimPrefix(c.Param("path"), "/")
		if path == "" {
			path = "index.html"
		}
		if !fs.ValidPath(path) {
			c.AbortWithStatus(http.StatusNotFound)
			return
		}
		file, err := build.Open(path)
		if err != nil {
			if strings.Contains(filepath.Base(path), ".") {
				c.AbortWithStatus(http.StatusNotFound)
				return
			}
			path = "index.html"
			file, err = build.Open(path)
		}
		if err != nil {
			c.AbortWithStatus(http.StatusServiceUnavailable)
			return
		}
		defer file.Close()
		info, err := file.Stat()
		if err != nil || info.IsDir() {
			c.AbortWithStatus(http.StatusNotFound)
			return
		}
		if path == "index.html" || path == "auth-bridge.js" {
			c.Header("Cache-Control", "no-store")
		} else {
			c.Header("Cache-Control", "public, max-age=3600")
		}
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("Referrer-Policy", "no-referrer")
		c.Header("Content-Type", mime.TypeByExtension(filepath.Ext(path)))
		_, _ = io.Copy(c.Writer, file)
	})
}

// Extensionless API URLs keep public catalogs out of reverse proxies' static
// file rules. Only the five bundled catalogs may be read through this route.
func serveWorkbenchInspiration(c *gin.Context, assets fs.FS) {
	name := strings.TrimPrefix(c.Param("path"), "/inspirations/")
	if !slices.Contains([]string{"manifest", "seedance", "haohaoxue", "youmind", "gallery-pool"}, name) {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	data, err := fs.ReadFile(assets, "web/dist/workbench/inspirations/"+name+".json")
	if err != nil {
		c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"code": 503, "msg": "灵感资源缺失，请重新构建并部署工作台"})
		return
	}
	c.Header("X-Content-Type-Options", "nosniff")
	c.Data(http.StatusOK, "application/json; charset=utf-8", data)
}

// Media elements cannot send an Authorization header. A short lived HttpOnly
// copy of the current dashboard session permits reads only, with live session
// validation still performed by UserAuth on every request. Mutations always
// require the bearer header; a cookie never authorizes a write.
func workbenchReadSession() gin.HandlerFunc {
	return func(c *gin.Context) {
		if strings.EqualFold(c.GetHeader("Sec-Fetch-Site"), "cross-site") {
			c.AbortWithStatus(http.StatusForbidden)
			return
		}
		if c.GetHeader("Authorization") == "" && (c.Request.Method == http.MethodGet || c.Request.Method == http.MethodHead) {
			if token, err := c.Cookie("new_api_workbench_read"); err == nil && token != "" {
				c.Request.Header.Set("Authorization", "Bearer "+token)
			}
		}
		c.Next()
	}
}

func (newAPIWorkbenchHost) User(_ context.Context, id string) (integration.User, error) {
	n, err := strconv.Atoi(id)
	if err != nil || n <= 0 {
		return integration.User{}, errors.New("invalid host user")
	}
	user, err := model.GetUserCache(n)
	if err != nil || user.Status != common.UserStatusEnabled {
		return integration.User{}, errors.New("host account unavailable")
	}
	return integration.User{ID: id, DisplayName: user.Username, Admin: user.Role >= common.RoleAdminUser}, nil
}

func workbenchModelKey(name, capability string) string {
	digest := sha256.Sum256([]byte(capability + "\x00" + name))
	return fmt.Sprintf("%s%x", capability[:1], digest[:12])
}

func workbenchGroupModelKey(name, capability, group string) string {
	if group == "default" {
		return workbenchModelKey(name, capability)
	}
	return workbenchModelKey(group+"\x00"+name, capability)
}

func (newAPIWorkbenchHost) Groups(ctx context.Context, id string) ([]integration.Group, error) {
	if _, err := (newAPIWorkbenchHost{}).User(ctx, id); err != nil {
		return nil, err
	}
	n, _ := strconv.Atoi(id)
	user, err := model.GetUserCache(n)
	if err != nil {
		return nil, err
	}
	usable := service.GetUserUsableGroups(user.Group)
	groups := make([]string, 0, len(usable))
	for group := range usable {
		if service.IsUserSelectableGroup(user.Group, group) {
			groups = append(groups, group)
		}
	}
	slices.Sort(groups)
	items := make([]integration.Group, 0, len(groups))
	for _, group := range groups {
		items = append(items, integration.Group{ID: group, Label: group, Description: usable[group]})
	}
	return items, nil
}

func (newAPIWorkbenchHost) Models(ctx context.Context, id string) ([]integration.Model, error) {
	groups, err := (newAPIWorkbenchHost{}).Groups(ctx, id)
	if err != nil {
		return nil, err
	}
	n, _ := strconv.Atoi(id)
	user, err := model.GetUserCache(n)
	if err != nil {
		return nil, err
	}
	prices := make(map[string]model.Pricing)
	for _, price := range model.GetPricing() {
		prices[price.ModelName] = price
	}
	groupIDs := make([]string, 0, len(groups))
	for _, group := range groups {
		groupIDs = append(groupIDs, group.ID)
	}
	descriptions, err := model.GetModelDescriptions(service.GetGroupsEnabledModels(groupIDs))
	if err != nil {
		return nil, err
	}
	items := make([]integration.Model, 0)
	profiles, profileErr := workbenchLocalProfiles(ctx)
	localModels := make(map[string]bool)
	for _, name := range strings.Split(os.Getenv("STUDIO_LOCAL_CAPABILITY_MODELS"), ",") {
		if name = strings.TrimSpace(name); name != "" {
			localModels[name] = true
		}
	}
	for _, profile := range profiles {
		localModels[profile.ModelID] = true
	}
	for _, selectedGroup := range groups {
		group := selectedGroup.ID
		for _, name := range service.GetGroupsEnabledModels([]string{group}) {
			price, exists := prices[name]
			if !exists {
				// Pricing metadata may be hidden while channel access is enabled.
				// Match New API's group model list without treating a missing price as free.
				price = model.Pricing{ModelName: name, SupportedEndpointTypes: model.GetModelSupportEndpointTypes(name)}
				var configured bool
				price.ModelPrice, configured = ratio_setting.GetModelPrice(name, false)
				if configured {
					price.QuotaType, exists = 1, true
				} else {
					price.ModelRatio, exists, _ = ratio_setting.GetModelRatio(name)
				}
				price.BillingMode = billing_setting.GetBillingMode(name)
				price.BillingExpr, _ = billing_setting.GetBillingExpr(name)
			}
			local := localModels[name]
			if local && profileErr != nil {
				continue
			}
			capabilities := workbenchGenerationCapabilities(price, profiles, local)
			for _, capability := range capabilities {
				protocol := map[string]string{"text": "chat-completion", "image": "openai-image", "video": "newapi", "audio": "openai-audio"}[capability]
				if capability == "text" && workbenchResponsesOnly(price) {
					protocol = "openai-response"
				}
				contract, err := workbenchCapabilityContract(name, capability, protocol, profiles, local)
				if err != nil {
					continue
				}
				label := "按 New API 实际用量结算"
				ratio := service.GetUserGroupRatio(user.Group, group)
				if price.BillingMode == "expression" || price.BillingExpr != "" {
					label = "按 New API 模型计费规则结算"
				} else if exists && price.QuotaType == 1 {
					label = fmt.Sprintf("$%.6g / 次，由 New API 结算", price.ModelPrice*ratio)
				} else if exists && capability == "text" {
					label = fmt.Sprintf("输入 $%.6g / 百万 Token，由 New API 结算", price.ModelRatio*2*ratio)
				}
				cap := int64(5_000_000)
				knownFree := strings.TrimSpace(price.BillingExpr) == "0" || (exists && price.BillingExpr == "" && price.BillingMode != "expression" && ((price.QuotaType == 1 && price.ModelPrice == 0) || (price.QuotaType == 0 && price.ModelRatio == 0)))
				if knownFree {
					cap = 0
					label += "；当前模型价格为零"
				} else {
					label += "；单次费用上限 $5"
				}
				items = append(items, integration.Model{Key: workbenchGroupModelKey(name, capability, group), Group: group, Name: name, Description: descriptions[name], Capability: capability, Protocol: protocol, PriceLabel: label, SpendingCapMicrocredits: cap, CapabilityConfig: contract})
			}
		}
	}
	return items, nil
}

func workbenchMicrocredits(quota int64) (int64, error) {
	if quota < 0 || common.QuotaPerUnit <= 0 || math.IsInf(common.QuotaPerUnit, 0) || math.IsNaN(common.QuotaPerUnit) {
		return 0, errors.New("invalid quota conversion")
	}
	amount := decimal.NewFromInt(quota).Mul(decimal.NewFromInt(1_000_000)).Div(decimal.NewFromFloat(common.QuotaPerUnit)).Ceil()
	if amount.GreaterThan(decimal.NewFromInt(math.MaxInt64)) {
		return 0, errors.New("quota conversion overflow")
	}
	return amount.IntPart(), nil
}

func (newAPIWorkbenchHost) Balance(_ context.Context, id string) (int64, error) {
	n, err := strconv.Atoi(id)
	if err != nil {
		return 0, err
	}
	quota, err := model.GetUserQuota(n, false)
	if err != nil {
		return 0, err
	}
	return workbenchMicrocredits(int64(quota))
}

func (newAPIWorkbenchHost) Billing(_ context.Context, id, taskID string, attempt int) (integration.Billing, error) {
	n, err := strconv.Atoi(id)
	if err != nil {
		return integration.Billing{}, err
	}
	var charges []model.StudioWorkflowCharge
	err = model.DB.Where("user_id = ? AND job_id = ?", n, fmt.Sprintf("wb:%s:%d", taskID, attempt)).Find(&charges).Error
	if err != nil {
		return integration.Billing{}, err
	}
	result := integration.Billing{Final: true}
	for _, charge := range charges {
		amount, err := workbenchMicrocredits(charge.Quota)
		if err != nil {
			return result, err
		}
		if charge.Final {
			result.ChargedMicrocredits += amount
		} else {
			result.ReservedMicrocredits += amount
			result.Final = false
		}
	}
	return result, nil
}

func (newAPIWorkbenchHost) Relay(ctx context.Context, call integration.Relay) (*http.Response, error) {
	n, err := strconv.Atoi(call.UserID)
	if err != nil || workbenchRuntime == nil || studioPrivateRelay == nil {
		return nil, errors.New("workbench relay unavailable")
	}
	validate := workbenchRuntime.ValidateTask
	if call.Request.Method == http.MethodGet {
		validate = workbenchRuntime.ValidateTaskRead
	}
	if err = validate(call.UserID, call.TaskID); err != nil {
		return nil, err
	}
	models, err := (newAPIWorkbenchHost{}).Models(ctx, call.UserID)
	if err != nil {
		return nil, err
	}
	var selected *integration.Model
	for i := range models {
		if models[i].Key == call.ModelKey {
			selected = &models[i]
			break
		}
	}
	if selected == nil && call.Request.Method == http.MethodPost {
		return nil, errors.New("model is no longer enabled for this account")
	}
	if call.BudgetMicrocredits < 0 || call.BudgetMicrocredits > 5_000_000 {
		return nil, errors.New("invalid workbench spending limit")
	}
	budget := decimal.NewFromInt(call.BudgetMicrocredits).Mul(decimal.NewFromFloat(common.QuotaPerUnit)).Div(decimal.NewFromInt(1_000_000)).Floor().IntPart()
	now := time.Now()
	jobID := fmt.Sprintf("wb:%s:%d", call.TaskID, call.Attempt)
	job := model.StudioWorkflowJob{ID: jobID, RequestID: jobID, UserID: n, ProjectID: "workbench:" + call.ProjectID, Kind: "workbench", Status: "running", Budget: budget, LeaseOwner: "workbench", LeaseUntil: now.Add(40 * time.Minute).Unix(), Plan: "{}", Result: "{}", CreatedAt: now, UpdatedAt: now}
	if err = model.DB.Clauses(clause.OnConflict{DoNothing: true}).Create(&job).Error; err != nil {
		return nil, err
	}
	var current model.StudioWorkflowJob
	if err = model.DB.Where("id = ? AND user_id = ? AND kind = ?", job.ID, n, "workbench").First(&current).Error; err != nil {
		return nil, err
	}
	if current.Budget != budget {
		return nil, errors.New("spending authorization changed")
	}
	if err = model.DB.Model(&current).Updates(map[string]any{"lease_owner": "workbench", "lease_until": job.LeaseUntil, "status": "running"}).Error; err != nil {
		return nil, err
	}
	request := call.Request.Clone(context.WithValue(context.WithValue(ctx, studioWorkerContextKey{}, &job), workbenchRelayGrantKey{}, workbenchRelayGrant{userID: n, taskID: call.TaskID}))
	request.URL = &url.URL{Path: call.Request.URL.Path, RawQuery: call.Request.URL.RawQuery}
	request.Host = "newapi.workbench.invalid"
	request.Header = make(http.Header)
	request.Header.Set("Content-Type", call.Request.Header.Get("Content-Type"))
	request.Header.Set("Accept", call.Request.Header.Get("Accept"))
	if selected != nil {
		request.Header.Set("X-Studio-Group", selected.Group)
	}
	if request.Method == http.MethodGet {
		parts := strings.Split(strings.Trim(request.URL.Path, "/"), "/")
		if len(parts) < 3 || parts[0] != "v1" || (parts[1] != "videos" && parts[1] != "tasks") {
			return nil, errors.New("unsupported workbench read")
		}
		owned, exists, err := model.GetByTaskId(n, parts[2])
		if err != nil || !exists || owned.PrivateData.StudioWorkflowID != job.ID {
			return nil, errors.New("generation receipt is not owned by this workbench task")
		}
	}
	requestID := uuid.NewSHA1(uuid.NameSpaceOID, []byte(job.ID+":"+request.Method+":"+request.URL.Path)).String()
	request.Header.Set("X-Studio-Request-ID", requestID)
	if request.Method == http.MethodPost {
		body, err := io.ReadAll(io.LimitReader(call.Request.Body, service.StudioMaxMediaBytes+1))
		if err != nil || int64(len(body)) > service.StudioMaxMediaBytes {
			return nil, errors.New("workbench request exceeds limit")
		}
		contentType := request.Header.Get("Content-Type")
		if strings.HasPrefix(contentType, "multipart/form-data") {
			_, params, err := mime.ParseMediaType(contentType)
			if err != nil {
				return nil, err
			}
			reader := multipart.NewReader(bytes.NewReader(body), params["boundary"])
			var buffer bytes.Buffer
			writer := multipart.NewWriter(&buffer)
			found := false
			for {
				part, err := reader.NextPart()
				if errors.Is(err, io.EOF) {
					break
				}
				if err != nil {
					return nil, err
				}
				field := part.FormName()
				target, err := writer.CreatePart(part.Header)
				if err != nil {
					return nil, err
				}
				if field == "model" {
					if found {
						return nil, errors.New("duplicate model field")
					}
					found = true
					_, err = io.WriteString(target, selected.Name)
				} else if field == "size" && selected.Capability == "video" {
					value, e := io.ReadAll(io.LimitReader(part, 128))
					if e != nil {
						return nil, e
					}
					size, e := workbenchVideoSize(ctx, selected.Name, string(value))
					if e != nil {
						return nil, e
					}
					_, err = io.WriteString(target, size)
				} else {
					_, err = io.Copy(target, part)
				}
				part.Close()
				if err != nil {
					return nil, err
				}
			}
			if !found {
				if err := writer.WriteField("model", selected.Name); err != nil {
					return nil, err
				}
			}
			if err := writer.Close(); err != nil {
				return nil, err
			}
			body = buffer.Bytes()
			request.Header.Set("Content-Type", writer.FormDataContentType())
		} else {
			var payload map[string]any
			if common.Unmarshal(body, &payload) != nil {
				return nil, errors.New("invalid model request")
			}
			payload["model"] = selected.Name
			if selected.Capability == "video" {
				if size, ok := payload["size"].(string); ok {
					payload["size"], err = workbenchVideoSize(ctx, selected.Name, size)
					if err != nil {
						return nil, err
					}
				}
			}
			body, err = common.Marshal(payload)
			if err != nil {
				return nil, err
			}
		}
		request.Body = io.NopCloser(bytes.NewReader(body))
		request.ContentLength = int64(len(body))
	}
	writer := &studioRelayRecorder{header: make(http.Header)}
	studioPrivateRelay.ServeHTTP(writer, request)
	if request.Method == http.MethodPost && writer.status >= 200 && writer.status < 300 {
		var receipt struct {
			ID string `json:"id"`
		}
		_ = common.Unmarshal(writer.body.Bytes(), &receipt)
		var task model.Task
		pending := receipt.ID != "" && model.DB.Where("user_id = ? AND task_id = ?", n, receipt.ID).First(&task).Error == nil && task.Status != model.TaskStatusSuccess && task.Status != model.TaskStatusFailure
		if !pending {
			var charge model.StudioWorkflowCharge
			if model.DB.Where("request_id = ? AND user_id = ?", requestID, n).First(&charge).Error == nil {
				if err = model.UpdateStudioWorkflowCharge(n, job.ID, requestID, charge.Quota, false, true); err != nil {
					return nil, err
				}
			}
		}
	}
	if err = ctx.Err(); err != nil {
		return nil, err
	}
	return &http.Response{StatusCode: writer.status, Header: writer.header, Body: io.NopCloser(bytes.NewReader(writer.body.Bytes())), ContentLength: int64(writer.body.Len())}, nil
}
