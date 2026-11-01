package app

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
	"unicode/utf8"

	"yingce/backend/internal/outbound"
	"yingce/backend/internal/production"
)

const mediaAnalysisWorkerURLEnv = "CANVAS_MEDIA_ANALYSIS_BASE_URL"
const mediaAnalysisWorkerSecretEnv = "CANVAS_MEDIA_ANALYSIS_SECRET_FILE"

type mediaAnalysisWorkerSnapshot struct {
	BaseURL       string `json:"baseUrl"`
	Token         string `json:"token"`
	EngineVersion int    `json:"engineVersion"`
	EngineSHA256  string `json:"engineSha256"`
}

type MediaAnalysisCapabilities struct {
	Available              bool     `json:"available"`
	EngineVersion          int      `json:"engineVersion"`
	Actions                []string `json:"actions"`
	Reason                 string   `json:"reason,omitempty"`
	MaxSourceBytes         int64    `json:"maxSourceBytes"`
	MaxIntervalMs          int64    `json:"maxIntervalMs"`
	MaxTrackingIntervalMs  int64    `json:"maxTrackingIntervalMs"`
	MaxReferenceIntervalMs int64    `json:"maxReferenceIntervalMs"`
}

func validateMediaAnalysisWorkerURL(base string) error {
	parsed, err := outbound.ValidateCustomRelayURL(base)
	if err != nil {
		return err
	}
	if parsed.RawQuery != "" || parsed.Fragment != "" || (parsed.Path != "" && parsed.Path != "/") {
		return errors.New("素材分析服务地址须为独立服务根地址")
	}
	return nil
}

func (s *Service) configuredMediaAnalysisWorker(ctx context.Context) (mediaAnalysisWorkerSnapshot, error) {
	var result mediaAnalysisWorkerSnapshot
	result.BaseURL = strings.TrimRight(strings.TrimSpace(os.Getenv(mediaAnalysisWorkerURLEnv)), "/")
	if result.BaseURL == "" {
		return result, errors.New("尚未配置本地素材分析服务")
	}
	if err := validateMediaAnalysisWorkerURL(result.BaseURL); err != nil {
		return result, errors.New("素材分析服务地址配置无效")
	}
	path := strings.TrimSpace(os.Getenv(mediaAnalysisWorkerSecretEnv))
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() || info.Size() < 32 || info.Size() > 256 {
		return result, errors.New("素材分析服务认证尚未配置")
	}
	secret, err := os.ReadFile(path)
	if err != nil {
		return result, errors.New("无法读取素材分析服务认证配置")
	}
	result.Token = strings.TrimSpace(string(secret))
	if !utf8.ValidString(result.Token) || len(result.Token) < 32 || len(result.Token) > 128 || strings.ContainsAny(result.Token, "\r\n\x00") {
		return result, errors.New("素材分析服务认证配置无效")
	}
	response, err := mediaAnalysisWorkerRequest(ctx, result, "GET", "/health", nil, 5*time.Second)
	if err != nil {
		return result, err
	}
	var health struct {
		Status        string   `json:"status"`
		EngineVersion int      `json:"engineVersion"`
		EngineSHA256  string   `json:"engineSHA256"`
		Actions       []string `json:"actions"`
		ModelCalls    bool     `json:"modelCalls"`
	}
	if json.Unmarshal(response, &health) != nil || health.Status != "ok" || health.EngineVersion != production.MediaAnalysisEngineVersion || !isSHA256String(health.EngineSHA256) || health.ModelCalls {
		return result, errors.New("本地素材分析服务版本或依赖不可用")
	}
	expected := map[string]bool{"reference_video": false, "audio_structure": false, "subject_track": false}
	for _, action := range health.Actions {
		if _, ok := expected[action]; ok {
			expected[action] = true
		}
	}
	for _, ready := range expected {
		if !ready {
			return result, errors.New("本地素材分析服务缺少需要的测量能力")
		}
	}
	result.EngineVersion, result.EngineSHA256 = health.EngineVersion, health.EngineSHA256
	payload, _ := json.Marshal(map[string]any{"engineVersion": result.EngineVersion, "engineSHA256": result.EngineSHA256})
	if _, err := mediaAnalysisWorkerRequest(ctx, result, "POST", "/v1/verify", payload, 5*time.Second); err != nil {
		return result, err
	}
	return result, nil
}

func (s *Service) GetMediaAnalysisCapabilities(ctx context.Context) MediaAnalysisCapabilities {
	result := MediaAnalysisCapabilities{Actions: []string{}, EngineVersion: production.MediaAnalysisEngineVersion, MaxSourceBytes: 1 << 30, MaxIntervalMs: 60000, MaxTrackingIntervalMs: 120000, MaxReferenceIntervalMs: 1800000}
	if _, err := s.configuredMediaAnalysisWorker(ctx); err != nil {
		result.Reason = err.Error()
		return result
	}
	result.Available = true
	result.Actions = []string{"reference_video", "audio_structure", "subject_track"}
	return result
}

func isSHA256String(value string) bool {
	if len(value) != 64 {
		return false
	}
	decoded, err := hex.DecodeString(value)
	return err == nil && len(decoded) == sha256.Size && strings.ToLower(value) == value
}

var errMediaAnalysisWorkerBusy = errors.New("素材分析服务繁忙，请稍后沿用原任务重试")

func mediaAnalysisWorkerRequest(ctx context.Context, snapshot mediaAnalysisWorkerSnapshot, method, path string, body []byte, timeout time.Duration) ([]byte, error) {
	if err := validateMediaAnalysisWorkerURL(snapshot.BaseURL); err != nil {
		return nil, errors.New("保存的素材分析服务配置不再有效")
	}
	if path != "/health" && path != "/v1/verify" && path != "/v1/analyze" {
		return nil, errors.New("素材分析服务请求无效")
	}
	request, err := http.NewRequestWithContext(ctx, method, snapshot.BaseURL+path, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	if method == http.MethodPost {
		var nonce [16]byte
		if _, err := rand.Read(nonce[:]); err != nil {
			return nil, err
		}
		stamp := fmt.Sprintf("%d", time.Now().Unix())
		identity := hex.EncodeToString(nonce[:])
		digest := sha256.Sum256(body)
		message := method + "\n" + path + "\n" + stamp + "\n" + identity + "\n" + hex.EncodeToString(digest[:])
		mac := hmac.New(sha256.New, []byte(snapshot.Token))
		_, _ = mac.Write([]byte(message))
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("X-Yingce-Analysis-Time", stamp)
		request.Header.Set("X-Yingce-Analysis-Nonce", identity)
		request.Header.Set("X-Yingce-Analysis-Signature", hex.EncodeToString(mac.Sum(nil)))
	}
	client := outbound.OutboundHTTPClient(timeout)
	// Internal source media and HMAC headers go directly to the pinned worker.
	if transport, ok := client.Transport.(*http.Transport); ok {
		direct := transport.Clone()
		direct.Proxy = nil
		client.Transport = direct
	} else {
		return nil, errors.New("本地素材分析传输不可用")
	}
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	defer client.CloseIdleConnections()
	response, err := client.Do(request)
	if err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, errors.New("本地素材分析服务暂时无法连接，请保留原任务重试")
	}
	defer response.Body.Close()
	payload, err := io.ReadAll(io.LimitReader(response.Body, 2<<20+1))
	if err != nil || len(payload) > 2<<20 {
		return nil, errors.New("素材分析响应不完整或超过限制")
	}
	switch response.StatusCode {
	case http.StatusOK:
		return payload, nil
	case http.StatusUnauthorized:
		return nil, errors.New("素材分析服务认证配置不一致，请联系管理员检查")
	case http.StatusServiceUnavailable:
		return nil, errMediaAnalysisWorkerBusy
	case http.StatusConflict:
		return nil, errors.New("素材分析服务版本已变化，请新建分析；原始结果和素材保留")
	case http.StatusUnprocessableEntity:
		return nil, errors.New("当前区间或主体框不适合分析，请缩短区间或重新选择主体")
	default:
		return nil, errors.New("本地素材分析未完成，原始素材保留")
	}
}

func (s *Service) pinMediaAnalysisWorker(ctx context.Context) (string, error) {
	worker, err := s.configuredMediaAnalysisWorker(ctx)
	if err != nil {
		return "", err
	}
	payload, err := json.Marshal(worker)
	if err != nil {
		return "", err
	}
	return s.encryptSettingSecret(string(payload))
}

func (s *Service) restoreMediaAnalysisWorker(cipher string) (mediaAnalysisWorkerSnapshot, error) {
	var snapshot mediaAnalysisWorkerSnapshot
	payload, err := s.decryptSettingSecret(cipher)
	if err != nil || json.Unmarshal([]byte(payload), &snapshot) != nil || snapshot.EngineVersion != production.MediaAnalysisEngineVersion || !isSHA256String(snapshot.EngineSHA256) || len(snapshot.Token) < 32 || len(snapshot.Token) > 128 {
		return snapshot, errors.New("无法恢复任务固定的素材分析服务配置")
	}
	if err := validateMediaAnalysisWorkerURL(snapshot.BaseURL); err != nil {
		return snapshot, errors.New("任务固定的素材分析地址不再可用")
	}
	return snapshot, nil
}
