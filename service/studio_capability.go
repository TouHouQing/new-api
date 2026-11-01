package service

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
)

// This endpoint is configured by the operator; the browser cannot choose it.
func StudioCapabilityProfiles(ctx context.Context) (map[string]any, error) {
	u, err := url.Parse(os.Getenv("STUDIO_LOCAL_MODEL_URL"))
	if err != nil || u.Scheme != "http" || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "" && u.Path != "/" {
		return nil, errors.New("local capability checks are not configured")
	}
	if u.Hostname() != "localhost" {
		address, err := netip.ParseAddr(u.Hostname())
		if err != nil || !address.IsLoopback() && !address.IsPrivate() {
			return nil, errors.New("capability checks require a private model worker")
		}
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimSuffix(u.String(), "/")+"/studio-local/v1/capabilities", nil)
	if err != nil {
		return nil, err
	}
	client := &http.Client{Timeout: 25 * time.Second, Transport: &http.Transport{Proxy: nil, DialContext: (&net.Dialer{Timeout: 5 * time.Second}).DialContext}, CheckRedirect: func(*http.Request, []*http.Request) error { return errors.New("capability redirects are not allowed") }}
	response, err := client.Do(request)
	if err != nil {
		return nil, errors.New("the local model worker is unavailable")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, errors.New("local capability checks failed")
	}
	raw, err := io.ReadAll(io.LimitReader(response.Body, 2<<20+1))
	if err != nil || len(raw) > 2<<20 {
		return nil, errors.New("capability response exceeds its limit")
	}
	var result map[string]any
	if common.Unmarshal(raw, &result) != nil || result["inferenceStarted"] != false {
		return nil, errors.New("invalid read-only capability response")
	}
	if _, ok := result["profiles"].([]any); !ok {
		return nil, errors.New("invalid capability profiles")
	}
	return result, nil
}

func StudioRuntimeCapabilitySnapshot(ctx context.Context, document map[string]any, nodeIDs []string) (map[string]string, error) {
	configured := strings.Split(os.Getenv("STUDIO_LOCAL_CAPABILITY_MODELS"), ",")
	selected := map[string]string{}
	for _, node := range studioObjects(document, "nodes") {
		id, _ := node["id"].(string)
		for _, candidate := range nodeIDs {
			if candidate == id {
				data, _ := node["data"].(map[string]any)
				name, _ := data["model"].(string)
				for _, local := range configured {
					if local != "" && local == name {
						selected[name], _ = data["kind"].(string)
					}
				}
			}
		}
	}
	if len(selected) == 0 {
		return nil, nil
	}
	result, err := StudioCapabilityProfiles(ctx)
	if err != nil {
		return nil, err
	}
	snapshots := map[string]string{}
	for _, value := range result["profiles"].([]any) {
		entry, _ := value.(map[string]any)
		name, _ := entry["modelId"].(string)
		if action, ok := selected[name]; ok && entry["action"] == action {
			if entry["support"] != "supported" || entry["readiness"] != "ready" {
				return nil, errors.New("the configured model is missing a required workflow, weight or running service")
			}
			snapshots[name], _ = entry["configurationDigest"].(string)
		}
	}
	if len(snapshots) != len(selected) {
		return nil, errors.New("a configured local model has no verified runtime configuration")
	}
	return snapshots, nil
}
