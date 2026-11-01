package app

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"

	"yingce/backend/internal/model"
	"yingce/backend/internal/protocol"
)

type providerConfigSnapshot struct {
	Version             int            `json:"version"`
	TaskID              string         `json:"taskId"`
	UserID              string         `json:"userId"`
	AttemptID           string         `json:"attemptId"`
	RouteRun            int            `json:"routeRun"`
	CreatedAt           time.Time      `json:"createdAt"`
	Mode                string         `json:"mode"`
	ProtocolVersion     string         `json:"protocolVersion,omitempty"`
	ProxyURL            string         `json:"proxyUrl,omitempty"`
	TrustedLocalChannel bool           `json:"trustedLocalChannel"`
	Config              providerConfig `json:"config"`
}

type providerAttemptContext struct{}

func (s *Service) decodeProviderConfigSnapshot(task *model.Task, attempt *model.RouteAttempt) (*providerConfigSnapshot, error) {
	if task == nil || attempt == nil || attempt.ProviderConfigCipher == "" {
		return nil, errors.New("任务没有原始模型执行配置")
	}
	if !strings.HasPrefix(attempt.ProviderConfigCipher, encryptedSettingPrefix) {
		return nil, errors.New("任务执行配置未通过加密校验")
	}
	plain, err := s.decryptSettingSecret(attempt.ProviderConfigCipher)
	if err != nil {
		return nil, errors.New("无法验证原始模型执行配置，请核对后端设置密钥")
	}
	var snapshot providerConfigSnapshot
	if len(plain) > 384*1024 || json.Unmarshal([]byte(plain), &snapshot) != nil {
		return nil, errors.New("原始模型执行配置格式无效")
	}
	if snapshot.Version != 1 || snapshot.TaskID != task.ID || snapshot.UserID != task.UserID || snapshot.AttemptID != attempt.ID || snapshot.RouteRun != attempt.RouteRun || snapshot.RouteRun != task.RouteRun || attempt.TaskID != task.ID {
		return nil, errors.New("模型执行配置与本次任务身份不一致")
	}
	if protocol.IsLocal(snapshot.Config.InterfaceType) != snapshot.TrustedLocalChannel {
		return nil, errors.New("本地模型配置缺少原始系统渠道授权")
	}
	if snapshot.ProtocolVersion != "" {
		adapter, ok := s.protocolRegistry().Resolve(snapshot.Config.InterfaceType)
		if !ok || adapter.Metadata().Version != snapshot.ProtocolVersion {
			return nil, errors.New("原任务的模型协议版本已变更，请核对原回执后恢复")
		}
	}
	snapshot.Config.trustedLocalChannel = snapshot.TrustedLocalChannel
	snapshot.Config.frozenExecutionConfig = true
	snapshot.Config.frozenProxyURL = snapshot.ProxyURL
	return &snapshot, nil
}

func (s *Service) captureRouteAttemptProviderConfig(attempt *model.RouteAttempt) error {
	task, err := s.repo.Task(attempt.TaskID)
	if err != nil {
		return err
	}
	if !taskUsesProviderConfigSnapshot(task) {
		return nil
	}
	if attempt.ProviderConfigCipher != "" {
		_, err = s.decodeProviderConfigSnapshot(task, attempt)
		return err
	}
	raw, err := s.decryptTaskInputJSON(task.InputJSON)
	if err != nil {
		return err
	}
	var input canvasGenerationInput
	if err = json.Unmarshal([]byte(raw), &input); err != nil {
		return err
	}
	config, err := s.resolveProviderConfig(input.Config)
	if err != nil {
		return err
	}
	if config.ChannelID != "" {
		item, readErr := s.repo.ChannelModelByKey(config.ChannelID, providerChannelModelKey(config))
		if readErr != nil {
			return readErr
		}
		config.CapabilityConfig, err = normalizedChannelModelCapability(item, s.protocolRegistry())
		if err != nil {
			return err
		}
	}
	snapshot := providerConfigSnapshot{Version: 1, TaskID: task.ID, UserID: task.UserID, AttemptID: attempt.ID, RouteRun: attempt.RouteRun, CreatedAt: time.Now().UTC(), Mode: input.Mode, TrustedLocalChannel: config.trustedLocalChannel, Config: config}
	snapshot.ProxyURL = config.frozenProxyURL
	if adapter, ok := s.protocolRegistry().Resolve(config.InterfaceType); ok {
		snapshot.ProtocolVersion = adapter.Metadata().Version
	}
	encoded, err := json.Marshal(snapshot)
	if err != nil {
		return err
	}
	if len(encoded) > 384*1024 {
		return errors.New("模型执行配置超过保存上限，尚未提交推理")
	}
	cipher, err := s.encryptSettingSecret(string(encoded))
	if err != nil {
		return err
	}
	attempt.ProviderConfigCipher, err = s.repo.FreezeRouteAttemptProviderConfig(attempt.ID, cipher)
	if err != nil {
		return err
	}
	_, err = s.decodeProviderConfigSnapshot(task, attempt)
	return err
}

func (s *Service) resolveTaskProviderConfig(ctx context.Context, config providerConfig) (providerConfig, error) {
	attempt, _ := ctx.Value(providerAttemptContext{}).(*model.RouteAttempt)
	if attempt == nil {
		return s.resolveProviderConfig(config)
	}
	taskID := taskExecutionID(ctx)
	task, err := s.repo.Task(taskID)
	if err != nil {
		return providerConfig{}, err
	}
	if attempt.ProviderConfigCipher == "" {
		return s.savedTaskProviderConfig(task, config)
	}
	snapshot, err := s.decodeProviderConfigSnapshot(task, attempt)
	if err != nil {
		return providerConfig{}, err
	}
	return snapshot.Config, nil
}

func taskUsesProviderConfigSnapshot(task *model.Task) bool {
	return task != nil && (task.Type == "canvas_text" || task.Type == "canvas_image" || task.Type == "canvas_video" || task.Type == "canvas_audio" || strings.HasPrefix(task.Type, "video_"))
}

// Recovery never resolves a mutable channel reference. Older personal-provider
// tasks already persisted their literal credentials and URL in protected input;
// older managed tasks cannot prove which channel configuration was submitted.
func (s *Service) savedTaskProviderConfig(task *model.Task, original providerConfig) (providerConfig, error) {
	if task == nil {
		return providerConfig{}, errors.New("任务不存在")
	}
	var attempt *model.RouteAttempt
	err := gorm.ErrRecordNotFound
	if s != nil && s.repo != nil {
		attempt, err = s.repo.LatestRouteAttempt(task.ID)
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return providerConfig{}, err
	}
	if err == nil && attempt.RouteRun == task.RouteRun && attempt.ProviderConfigCipher != "" {
		snapshot, err := s.decodeProviderConfigSnapshot(task, attempt)
		if err != nil {
			return providerConfig{}, err
		}
		return snapshot.Config, nil
	}
	if original.ChannelID != "" || systemChannelIDFromBaseURL(original.BaseURL) != "" || protocol.IsLocal(original.InterfaceType) {
		return providerConfig{}, routeDispatchUncertainError{"历史任务缺少原始渠道配置，已停止向当前渠道发送旧回执；请人工核对原服务和结果"}
	}
	headers, err := NormalizeOutboundHeaders(original.Headers)
	if err != nil {
		return providerConfig{}, err
	}
	original.Headers = headers
	original.trustedLocalChannel = false
	original.frozenExecutionConfig = true
	return original, nil
}

func providerReceiptOnlyRecovery(ctx context.Context) bool {
	attempt, _ := ctx.Value(providerAttemptContext{}).(*model.RouteAttempt)
	return attempt != nil && attempt.ReceiptOnlyRecovery
}

type frozenProviderTransportKey struct{}
type frozenProviderTransport struct{ ProxyURL string }

func withFrozenProviderTransport(ctx context.Context, config providerConfig) context.Context {
	if !config.frozenExecutionConfig {
		return ctx
	}
	return context.WithValue(ctx, frozenProviderTransportKey{}, frozenProviderTransport{ProxyURL: config.frozenProxyURL})
}

func (s *Service) prepareRouteAttemptRecovery(task *model.Task, attempt *model.RouteAttempt) error {
	if !taskUsesProviderConfigSnapshot(task) {
		return nil
	}
	if attempt.ProviderConfigCipher == "" {
		if _, err := s.providerRecoveryInput(task); err != nil {
			return err
		}
		return nil
	}
	snapshot, err := s.decodeProviderConfigSnapshot(task, attempt)
	if err != nil {
		return routeDispatchUncertainError{err.Error()}
	}
	if task.ProviderRequestID != "" || attempt.ProviderRequestID != "" {
		return nil
	}
	if protocol.IsLocal(snapshot.Config.InterfaceType) {
		adapter, ok := s.protocolRegistry().Resolve(snapshot.Config.InterfaceType)
		if ok {
			_, createRecovery := adapter.(protocol.CreateRecoveryAdapter)
			_, agentRecovery := adapter.(protocol.AgentRecoveryAdapter)
			if createRecovery || agentRecovery {
				attempt.ReceiptOnlyRecovery = true
				return nil
			}
		}
	}
	return routeDispatchUncertainError{"原请求已提交但缺少可恢复的回执，已停止自动重发"}
}

func (s *Service) providerRecoveryInput(task *model.Task) (canvasGenerationInput, error) {
	raw, err := s.decryptTaskInputJSON(task.InputJSON)
	if err != nil {
		return canvasGenerationInput{}, err
	}
	var input canvasGenerationInput
	if err := json.Unmarshal([]byte(raw), &input); err != nil {
		return canvasGenerationInput{}, err
	}
	input.Config, err = s.savedTaskProviderConfig(task, input.Config)
	return input, err
}
