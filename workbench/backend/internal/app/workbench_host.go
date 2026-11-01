package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"yingce/backend/internal/model"
)

// WorkbenchHost keeps account, model access and payments in the embedding
// application. Identity is supplied in process; no HTTP header grants access.
type WorkbenchHost interface {
	User(context.Context, string) (WorkbenchHostUser, error)
	Models(context.Context, string) ([]WorkbenchHostModel, error)
	Balance(context.Context, string) (int64, error)
	Relay(context.Context, WorkbenchRelay) (*http.Response, error)
	Billing(context.Context, string, string, int) (WorkbenchHostBilling, error)
}

type WorkbenchHostUser struct {
	ID, DisplayName string
	Admin           bool
}

type WorkbenchHostGroup struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	Description string `json:"description,omitempty"`
}

// A host can expose selectable groups even when a group has no models for the
// current capability. Group permissions remain owned by the host.
type WorkbenchGroupHost interface {
	Groups(context.Context, string) ([]WorkbenchHostGroup, error)
}

type WorkbenchHostModel struct {
	Key, Name, Capability, Protocol, PriceLabel string
	Group                                       string
	SpendingCapMicrocredits                     int64
	CapabilityConfig                            map[string]any
	BillingMode                                 string
	UnitPrice, InputPrice, OutputPrice          int64
}

type WorkbenchRelay struct {
	UserID, TaskID, ProjectID string
	ModelKey                  string
	Attempt                   int
	BudgetMicrocredits        int64
	Request                   *http.Request
}

type WorkbenchHostBilling struct {
	ReservedMicrocredits, ChargedMicrocredits int64
	Final, Uncertain                          bool
}

type workbenchIdentityKey struct{}

// WithWorkbenchIdentity is called only after the host has validated its live
// session. A client-controlled string header is never accepted as identity.
func WithWorkbenchIdentity(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, workbenchIdentityKey{}, id)
}

func (s *Service) ConfigureWorkbenchHost(host WorkbenchHost) error {
	if host == nil {
		return errors.New("workbench host is required")
	}
	if s.host != nil {
		return errors.New("workbench host is already configured")
	}
	s.host = host
	s.taskBillingCoordinator = newTaskBillingCoordinator(&workbenchBillingRepository{Repository: s.repo, svc: s})
	return nil
}

func (s *Service) WorkbenchHosted() bool { return s.host != nil }

func (s *Service) workbenchOwnerAvailable(userID string) error {
	if s.host == nil {
		return nil
	}
	if !strings.HasPrefix(userID, "newapi:") {
		return NotFound("资源不可用")
	}
	id := strings.TrimPrefix(userID, "newapi:")
	user, err := s.host.User(context.Background(), id)
	if err != nil || user.ID != id {
		return NotFound("资源不可用")
	}
	return nil
}

func (s *Service) WorkbenchCurrentUser(ctx context.Context) (*model.User, error) {
	id, _ := ctx.Value(workbenchIdentityKey{}).(string)
	if s.host == nil || id == "" || len(id) > 24 || strings.ContainsAny(id, "/:\\ \t\r\n") {
		return nil, Unauthorized("请使用 New API 账户登录")
	}
	actor, err := s.host.User(ctx, id)
	if err != nil || actor.ID != id {
		return nil, Unauthorized("New API 登录已失效，请重新登录")
	}
	role := model.UserRoleUser
	if actor.Admin {
		role = model.UserRoleAdmin
	}
	return s.repo.SyncWorkbenchUser("newapi:"+id, truncateRunes(actor.DisplayName, 80), role)
}

func (s *Service) ValidateWorkbenchTask(userID, taskID string) error {
	return s.validateWorkbenchTaskLease(userID, taskID, false)
}

func (s *Service) ValidateWorkbenchTaskRead(userID, taskID string) error {
	return s.validateWorkbenchTaskLease(userID, taskID, true)
}

func (s *Service) validateWorkbenchTaskLease(userID, taskID string, recoveryRead bool) error {
	task, err := s.repo.Task(taskID)
	if err != nil || task.UserID != "newapi:"+userID || task.LeaseOwner == "" || task.LeaseExpiresAt == nil || !task.LeaseExpiresAt.After(time.Now()) {
		return Unauthorized("工作台任务执行权限已失效")
	}
	manualRecovery := recoveryRead && task.Status == model.TaskStatusFailed && task.ProviderRequestID != "" && strings.HasPrefix(task.LeaseOwner, "manual-recovery:")
	if task.Status != model.TaskStatusRunning && !manualRecovery {
		return Unauthorized("工作台任务执行权限已失效")
	}
	return nil
}

func (s *Service) workbenchModels(ctx context.Context, userID string) ([]WorkbenchHostModel, error) {
	if s.host == nil || !strings.HasPrefix(userID, "newapi:") {
		return nil, Unauthorized("请使用 New API 账户登录")
	}
	items, err := s.host.Models(ctx, strings.TrimPrefix(userID, "newapi:"))
	if err != nil {
		return nil, err
	}
	for i := range items {
		item := &items[i]
		if item.Key == "" || len(item.Key) > 120 || strings.ContainsAny(item.Key, "/\\ \r\n") {
			return nil, errors.New("invalid host model key")
		}
		profile := DefaultModelCapabilityConfigForModel(item.Protocol, item.Name)
		if item.CapabilityConfig != nil {
			raw, e := json.Marshal(item.CapabilityConfig)
			if e != nil {
				return nil, e
			}
			if e = json.Unmarshal(raw, profile); e != nil {
				return nil, e
			}
		}
		profile, e := NormalizeModelCapabilityConfigForModel(item.Capability, item.Protocol, item.Name, profile, s.protocolRegistry())
		if e != nil {
			return nil, fmt.Errorf("host model %s: %w", item.Name, e)
		}
		raw, e := json.Marshal(profile)
		if e != nil {
			return nil, e
		}
		if item.SpendingCapMicrocredits < 0 || item.SpendingCapMicrocredits > 5*CreditScale {
			return nil, errors.New("invalid host model spending cap")
		}
		if e = s.repo.SyncWorkbenchModel(item.Key, truncateRunes(item.Name, 160), item.Capability, item.Protocol, string(raw), item.SpendingCapMicrocredits); e != nil {
			return nil, e
		}
	}
	return items, nil
}

func (s *Service) requireWorkbenchModel(ctx context.Context, userID, channelID, key string) error {
	items, err := s.workbenchModels(ctx, userID)
	if err != nil {
		return err
	}
	for _, item := range items {
		if item.Key == key && channelID == "newapi-"+item.Capability {
			return nil
		}
	}
	return InvalidModelSelection("当前账户无权使用此 New API 模型，或模型已停用")
}

// relayWorkbench is only reachable through the reserved in-process origin and
// an owned, database-claimed task; it never makes an HTTP request to that host.
func (s *Service) relayWorkbench(request *http.Request) (*http.Response, error) {
	metadata, ok := request.Context().Value(providerAnalyticsKey{}).(providerAnalyticsContext)
	if !ok || metadata.Service != s || metadata.TaskID == "" {
		return nil, Unauthorized("缺少工作台任务执行上下文")
	}
	userID := strings.TrimPrefix(metadata.UserID, "newapi:")
	validate := s.ValidateWorkbenchTask
	if request.Method == http.MethodGet {
		validate = s.ValidateWorkbenchTaskRead
	}
	if err := validate(userID, metadata.TaskID); err != nil {
		return nil, err
	}
	task, err := s.repo.Task(metadata.TaskID)
	if err != nil {
		return nil, err
	}
	budget := task.AuthorizedChargeMicrocredits
	if budget < 0 {
		return nil, BadAuthRequest("生成费用上限无效")
	}
	return s.host.Relay(request.Context(), WorkbenchRelay{UserID: userID, TaskID: task.ID, ProjectID: task.ProjectID, ModelKey: metadata.Model, Attempt: task.RouteRun, BudgetMicrocredits: budget, Request: request})
}

func (s *Service) ConfigureHostedFeatures() error {
	if s.host == nil {
		return errors.New("host is not configured")
	}
	features, err := s.FeatureAvailability()
	if err != nil {
		return err
	}
	features.CustomChannelsEnabled = false
	features.FrontendModelsEnabled = false
	features.ImageWorkbenchEnabled = true
	features.VideoWorkbenchEnabled = true
	actor := model.User{ID: "newapi:system", Role: model.UserRoleAdmin, Status: model.UserStatusActive}
	_, err = s.UpdateFeatureAvailability(&actor, features.FeatureAvailability)
	return err
}
