package service

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

// Configuration contains credential references, never browser-provided tokens.
// Supply short-lived tokens through the deployment's private environment.
type StudioConnectorConfig struct {
	ID          string `json:"id"`
	Provider    string `json:"provider"`
	Label       string `json:"label"`
	OwnerID     int    `json:"owner_id"`
	BaseURL     string `json:"base_url,omitempty"`
	AccountID   string `json:"account_id,omitempty"`
	FolderID    string `json:"folder_id,omitempty"`
	TokenEnv    string `json:"token_env,omitempty"`
	UsernameEnv string `json:"username_env,omitempty"`
	PasswordEnv string `json:"password_env,omitempty"`
	ExpiresAt   int64  `json:"expires_at,omitempty"`
}

type StudioConnectorStatus struct {
	ID         string   `json:"id"`
	Provider   string   `json:"provider"`
	Label      string   `json:"label"`
	State      string   `json:"state"`
	Operations []string `json:"operations"`
}

type StudioConnectorTarget struct {
	ID        string `json:"id"`
	Provider  string `json:"provider"`
	BaseURL   string `json:"base_url"`
	AccountID string `json:"account_id"`
	FolderID  string `json:"folder_id"`
}

func studioConnectorTarget(config StudioConnectorConfig) StudioConnectorTarget {
	return StudioConnectorTarget{ID: config.ID, Provider: config.Provider, BaseURL: config.BaseURL, AccountID: config.AccountID, FolderID: config.FolderID}
}

type StudioConnectorResource struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Kind string `json:"kind"`
	Size int64  `json:"size"`
}

type StudioConnectorResources struct {
	Items  []StudioConnectorResource `json:"items"`
	Cursor string                    `json:"cursor"`
}

type studioConnectorHTTPError struct{ Status int }

func (value *studioConnectorHTTPError) Error() string {
	return fmt.Sprintf("connector returned HTTP %d; check its authorization and saved receipt", value.Status)
}

var studioConnectorOrigin = func(provider string) string {
	return map[string]string{"frameio": "https://api.frame.io", "feishu": "https://open.feishu.cn", "notion": "https://api.notion.com", "lark": "https://open.larksuite.com", "unsplash": "https://api.unsplash.com", "vimeo": "https://api.vimeo.com", "slack": "https://slack.com", "linear": "https://api.linear.app", "asana": "https://app.asana.com", "airtable": "https://api.airtable.com", "atlassian": "https://api.atlassian.com", "baidu": "https://pan.baidu.com", "hubspot": "https://api.hubapi.com", "descript": "https://descriptapi.com"}[provider]
}

var studioConnectorDefaultClient = newStudioConnectorHTTPClient()
var studioConnectorHTTPClient = func() *http.Client { return studioConnectorDefaultClient }
var studioConnectorEnvironment = regexp.MustCompile(`^STUDIO_CONNECTOR_[A-Z0-9_]{1,80}$`)

func newStudioConnectorHTTPClient() *http.Client {
	dialer := &net.Dialer{Timeout: 20 * time.Second, KeepAlive: 30 * time.Second}
	protected := &protectedFetchDialer{resolver: net.DefaultResolver, dialContext: dialer.DialContext, getProtection: func() (*common.SSRFProtection, bool, error) {
		return &common.SSRFProtection{AllowPrivateIp: false, DomainFilterMode: false, IpFilterMode: false, AllowedPorts: []int{443}}, true, nil
	}}
	return &http.Client{Timeout: 2 * time.Minute, Transport: &http.Transport{DialContext: protected.DialContext, TLSClientConfig: &tls.Config{MinVersion: tls.VersionTLS12}, TLSHandshakeTimeout: 15 * time.Second, ResponseHeaderTimeout: 30 * time.Second, IdleConnTimeout: 60 * time.Second, MaxIdleConns: 20}}
}

func studioConnectorConfigs(ownerID int) ([]StudioConnectorConfig, error) {
	raw := os.Getenv("STUDIO_CONNECTORS_JSON")
	if raw == "" {
		return []StudioConnectorConfig{}, nil
	}
	if len(raw) > 65536 {
		return nil, errors.New("connector configuration is too large")
	}
	var values []StudioConnectorConfig
	if err := common.Unmarshal([]byte(raw), &values); err != nil || len(values) > 50 {
		return nil, errors.New("connector configuration is invalid")
	}
	selected := []StudioConnectorConfig{}
	seen := map[string]bool{}
	for _, value := range values {
		if !StudioIDPattern.MatchString(value.ID) || seen[value.ID] || value.OwnerID < 1 || strings.TrimSpace(value.Label) == "" || len([]rune(value.Label)) > 200 || !slices.Contains(append([]string{"frameio", "feishu", "lark", "notion", "webdav", "webhook"}, studioContextProviders...), value.Provider) {
			return nil, errors.New("connector configuration is invalid")
		}
		seen[value.ID] = true
		for _, reference := range []string{value.TokenEnv, value.UsernameEnv, value.PasswordEnv} {
			if reference != "" && !studioConnectorEnvironment.MatchString(reference) {
				return nil, errors.New("connector credential reference is invalid")
			}
		}
		if value.Provider == "webdav" || value.Provider == "webhook" {
			endpoint, err := url.Parse(value.BaseURL)
			if err != nil || endpoint.Scheme != "https" || endpoint.Hostname() == "" || endpoint.User != nil || endpoint.RawQuery != "" || endpoint.Fragment != "" {
				return nil, errors.New("connector endpoints require a configured HTTPS origin without URL credentials")
			}
		} else if value.BaseURL != "" {
			return nil, errors.New("provider API origins cannot be overridden")
		}
		if value.OwnerID == ownerID {
			selected = append(selected, value)
		}
	}
	return selected, nil
}

func studioConnectorReady(config StudioConnectorConfig) bool {
	if config.ExpiresAt > 0 && config.ExpiresAt <= time.Now().Unix() {
		return false
	}
	if config.Provider == "webdav" {
		return config.UsernameEnv != "" && os.Getenv(config.UsernameEnv) != "" && config.PasswordEnv != "" && os.Getenv(config.PasswordEnv) != ""
	}
	return config.TokenEnv != "" && os.Getenv(config.TokenEnv) != ""
}

func StudioConnectorStatuses(ownerID int) ([]StudioConnectorStatus, error) {
	configs, err := studioConnectorConfigs(ownerID)
	if err != nil {
		return nil, err
	}
	values := []StudioConnectorStatus{}
	for _, config := range configs {
		state := "configured"
		if !studioConnectorReady(config) {
			state = "credentials_unavailable"
		}
		operations := studioConnectorOperations(config.Provider)
		values = append(values, StudioConnectorStatus{ID: config.ID, Provider: config.Provider, Label: config.Label, State: state, Operations: operations})
	}
	return values, nil
}

func studioConnectorConfig(ownerID int, id string) (StudioConnectorConfig, error) {
	configs, err := studioConnectorConfigs(ownerID)
	if err != nil {
		return StudioConnectorConfig{}, err
	}
	for _, config := range configs {
		if config.ID == id {
			if !studioConnectorReady(config) {
				return config, errors.New("connector credentials are missing or expired")
			}
			return config, nil
		}
	}
	return StudioConnectorConfig{}, errors.New("connector is not configured for this account")
}

// Credentials stay on the fixed provider origin. Redirects are never followed
// with credentials, and downloadable media uses a separate unauthenticated call.
func studioConnectorRequest(ctx context.Context, config StudioConnectorConfig, method, resource, contentType string, body io.Reader, limit int64) ([]byte, http.Header, error) {
	origin := studioConnectorOrigin(config.Provider)
	if origin == "" {
		origin = config.BaseURL
	}
	endpoint := strings.TrimRight(origin, "/") + resource
	if config.Provider == "baidu" {
		parsed, err := url.Parse(endpoint)
		if err != nil {
			return nil, nil, errors.New("invalid drive request")
		}
		query := parsed.Query()
		query.Set("access_token", os.Getenv(config.TokenEnv))
		parsed.RawQuery = query.Encode()
		endpoint = parsed.String()
	}
	parsed, err := url.Parse(endpoint)
	if err != nil || parsed.Scheme != "https" || parsed.User != nil {
		return nil, nil, errors.New("invalid connector request")
	}
	request, err := http.NewRequestWithContext(ctx, method, endpoint, body)
	if err != nil {
		return nil, nil, errors.New("invalid connector request")
	}
	if contentType != "" {
		request.Header.Set("Content-Type", contentType)
	}
	if method == "PROPFIND" {
		request.Header.Set("Depth", "1")
	}
	if config.Provider == "webdav" {
		request.SetBasicAuth(os.Getenv(config.UsernameEnv), os.Getenv(config.PasswordEnv))
	} else if config.Provider == "unsplash" {
		request.Header.Set("Authorization", "Client-ID "+os.Getenv(config.TokenEnv))
	} else if config.Provider != "webhook" && config.Provider != "baidu" {
		request.Header.Set("Authorization", "Bearer "+os.Getenv(config.TokenEnv))
	}
	if config.Provider == "webhook" && method == "POST" {
		data, err := io.ReadAll(io.LimitReader(body, 65537))
		if err != nil || len(data) > 65536 {
			return nil, nil, errors.New("delivery notification exceeds the limit")
		}
		request.Body = io.NopCloser(bytes.NewReader(data))
		request.ContentLength = int64(len(data))
		var event struct {
			EventID   string `json:"event_id"`
			Timestamp int64  `json:"timestamp"`
		}
		if common.Unmarshal(data, &event) != nil || !StudioIDPattern.MatchString(event.EventID) {
			return nil, nil, errors.New("delivery notification needs a stable event ID")
		}
		signature := hmac.New(sha256.New, []byte(os.Getenv(config.TokenEnv)))
		signature.Write(data)
		request.Header.Set("X-Studio-Signature", "sha256="+hex.EncodeToString(signature.Sum(nil)))
		request.Header.Set("X-Studio-Event-ID", event.EventID)
	}
	if config.Provider == "webhook" && method == "GET" {
		eventID := parsed.Query().Get("event_id")
		if !StudioIDPattern.MatchString(eventID) {
			return nil, nil, errors.New("notification lookup requires a saved event ID")
		}
		timestamp := strconv.FormatInt(time.Now().Unix(), 10)
		signature := hmac.New(sha256.New, []byte(os.Getenv(config.TokenEnv)))
		signature.Write([]byte("GET\n" + eventID + "\n" + timestamp))
		request.Header.Set("X-Studio-Signature", "sha256="+hex.EncodeToString(signature.Sum(nil)))
		request.Header.Set("X-Studio-Event-ID", eventID)
		request.Header.Set("X-Studio-Timestamp", timestamp)
	}
	if config.Provider == "notion" {
		request.Header.Set("Notion-Version", "2025-09-03")
	}
	base := studioConnectorHTTPClient()
	client := *base
	client.Timeout = 2 * time.Minute
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	response, err := client.Do(request)
	if err != nil {
		return nil, nil, errors.New("connector request could not complete; inspect the saved receipt before retrying a write")
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, response.Header.Clone(), &studioConnectorHTTPError{Status: response.StatusCode}
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, limit+1))
	if err != nil || int64(len(data)) > limit {
		return nil, nil, errors.New("connector response exceeds the supported limit")
	}
	return data, response.Header.Clone(), nil
}

func studioConnectorJSON(ctx context.Context, config StudioConnectorConfig, method, resource string, value any, output any) error {
	var body io.Reader
	if value != nil {
		encoded, err := common.Marshal(value)
		if err != nil {
			return err
		}
		body = bytes.NewReader(encoded)
	}
	data, _, err := studioConnectorRequest(ctx, config, method, resource, "application/json", body, 2<<20)
	if err != nil {
		return err
	}
	if config.Provider == "feishu" || config.Provider == "lark" {
		var status struct {
			Code int `json:"code"`
		}
		if common.Unmarshal(data, &status) != nil || status.Code != 0 {
			return errors.New("Feishu rejected the connector request; check account scope and resource permissions")
		}
	}
	if output == nil {
		return nil
	}
	if err := common.Unmarshal(data, output); err != nil {
		return errors.New("connector returned an invalid response")
	}
	return nil
}

func studioConnectorResourcePath(resource string) (string, error) {
	decoded, err := url.PathUnescape(resource)
	if err != nil || decoded == "" || len(decoded) > 1000 || strings.HasPrefix(decoded, "/") || strings.ContainsAny(decoded, "\\\x00\r\n?#%") {
		return "", errors.New("select a valid connector resource")
	}
	for segment := range strings.SplitSeq(decoded, "/") {
		if segment == ".." || segment == "." || segment == "" {
			return "", errors.New("connector resource must remain within its configured folder")
		}
	}
	parts := strings.Split(decoded, "/")
	for index := range parts {
		parts[index] = url.PathEscape(parts[index])
	}
	return strings.Join(parts, "/"), nil
}

func ListStudioConnectorResources(ctx context.Context, ownerID int, id, cursor string) (StudioConnectorResources, error) {
	config, err := studioConnectorConfig(ownerID, id)
	if err != nil {
		return StudioConnectorResources{}, err
	}
	if len(cursor) > 2000 {
		return StudioConnectorResources{}, errors.New("connector cursor is too large")
	}
	result := StudioConnectorResources{Items: []StudioConnectorResource{}}
	if slices.Contains(studioContextProviders, config.Provider) {
		return studioConnectorContextPage(ctx, config, cursor)
	}
	switch config.Provider {
	case "frameio":
		var response struct {
			Data []struct {
				ID, Name, Type string
				FileSize       int64 `json:"file_size"`
			}
			Links struct {
				Next string `json:"next"`
			}
			Cursor     string `json:"cursor"`
			Pagination struct {
				NextCursor string `json:"next_cursor"`
			}
		}
		query := url.Values{"page_size": {"100"}}
		if cursor != "" {
			query.Set("after", cursor)
		}
		resource := "/v4/accounts/" + url.PathEscape(config.AccountID) + "/folders/" + url.PathEscape(config.FolderID) + "/children?" + query.Encode()
		if err := studioConnectorJSON(ctx, config, "GET", resource, nil, &response); err != nil {
			return result, err
		}
		for _, item := range response.Data {
			result.Items = append(result.Items, StudioConnectorResource{ID: item.ID, Name: item.Name, Kind: item.Type, Size: item.FileSize})
		}
		if response.Links.Next != "" {
			parsed, _ := url.Parse(response.Links.Next)
			if parsed != nil {
				result.Cursor = parsed.Query().Get("after")
			}
		}
		if result.Cursor == "" {
			result.Cursor = response.Pagination.NextCursor
		}
	case "feishu", "lark":
		var response struct {
			Data struct {
				Files         []struct{ Token, Name, Type string }
				NextPageToken string `json:"next_page_token"`
				HasMore       bool   `json:"has_more"`
			}
		}
		query := url.Values{"folder_token": {config.FolderID}, "page_size": {"100"}}
		if cursor != "" {
			query.Set("page_token", cursor)
		}
		if err := studioConnectorJSON(ctx, config, "GET", "/open-apis/drive/v1/files?"+query.Encode(), nil, &response); err != nil {
			return result, err
		}
		for _, item := range response.Data.Files {
			result.Items = append(result.Items, StudioConnectorResource{ID: item.Token, Name: item.Name, Kind: item.Type})
		}
		if response.Data.HasMore {
			result.Cursor = response.Data.NextPageToken
		}
	case "notion":
		var response struct {
			Results    []map[string]any
			NextCursor string `json:"next_cursor"`
		}
		query := url.Values{"page_size": {"100"}}
		if cursor != "" {
			query.Set("start_cursor", cursor)
		}
		if err := studioConnectorJSON(ctx, config, "GET", "/v1/blocks/"+url.PathEscape(config.FolderID)+"/children?"+query.Encode(), nil, &response); err != nil {
			return result, err
		}
		for _, item := range response.Results {
			kind, _ := item["type"].(string)
			remoteID, _ := item["id"].(string)
			if !slices.Contains([]string{"image", "video", "audio", "file"}, kind) {
				continue
			}
			properties, _ := item[kind].(map[string]any)
			name, _ := properties["name"].(string)
			if name == "" {
				name = kind
			}
			result.Items = append(result.Items, StudioConnectorResource{ID: remoteID, Name: name, Kind: kind})
		}
		result.Cursor = response.NextCursor
	case "webdav":
		return studioWebDAVResources(ctx, config, cursor)
	default:
		return result, errors.New("delivery notifications do not expose source files")
	}
	return result, nil
}

func ValidateStudioConnectorOperation(userID int, project *model.StudioProject, document map[string]any, operation *StudioMediaOperation) error {
	if operation == nil || userID != project.OwnerID || !StudioIDPattern.MatchString(operation.ConnectorID) || len(operation.ExternalResourceID) > 1000 || !slices.Contains([]string{"import_media", "import_context", "export_media", "sync_review", "notify_delivery"}, operation.Action) {
		return errors.New("external connections require the project owner and a valid operation")
	}
	config, err := studioConnectorConfig(userID, operation.ConnectorID)
	if err != nil {
		return err
	}
	if !slices.Contains(studioConnectorOperations(config.Provider), operation.Action) {
		return errors.New("connection does not support this operation")
	}
	if operation.Action == "export_media" || operation.Action == "notify_delivery" {
		if !operation.ConfirmExternalWrite {
			return errors.New("confirm the external destination and exported material before sending")
		}
		if !StudioIDPattern.MatchString(operation.MediaID) {
			return errors.New("select a project-owned file to deliver")
		}
		var count int64
		if err := model.DB.Model(&model.StudioProjectMediaLink{}).Where("project_id = ? AND media_id = ?", project.ID, operation.MediaID).Count(&count).Error; err != nil {
			return err
		}
		if count != 1 && !StudioMediaReferences(document)[operation.MediaID] {
			return errors.New("external delivery source is outside this project")
		}
		if _, err := GetStudioMedia(project.OwnerID, operation.MediaID); err != nil {
			return err
		}
		if operation.Action == "notify_delivery" && config.Provider != "webhook" || operation.Action == "export_media" && config.Provider == "webhook" {
			return errors.New("select a connector supporting this delivery operation")
		}
		return nil
	}
	if config.Provider == "webhook" || operation.Action == "sync_review" && config.Provider != "frameio" {
		return errors.New("this connector does not support the selected operation")
	}
	if _, err := studioConnectorResourcePath(operation.ExternalResourceID); err != nil {
		return err
	}
	for _, node := range studioObjects(document, "nodes") {
		if node["id"] != operation.NodeID {
			continue
		}
		data, _ := node["data"].(map[string]any)
		if data["locked"] == true || data["purpose"] == "assembly" || (operation.Action == "import_context" && data["kind"] != "text" || operation.Action != "import_context" && !slices.Contains([]any{"image", "audio", "video"}, data["kind"])) {
			return errors.New("choose an unlocked media target for the connection")
		}
		if (operation.Action == "import_media" || operation.Action == "import_context") && len(studioObjects(data, "takes")) >= 100 {
			return errors.New("connector output node has reached its Take limit")
		}
		if operation.Action == "sync_review" {
			for _, take := range studioObjects(data, "takes") {
				if take["id"] == operation.TakeID && take["mediaId"] == operation.MediaID {
					return nil
				}
			}
			return errors.New("bind external review to an exact existing Take and media file")
		}
		return nil
	}
	return errors.New("connector output node is unavailable")
}
