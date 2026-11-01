package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"yingce/backend/internal/protocol"
)

// The embedded workbench uses THQ's /v1/videos contract. Standalone OpenAI
// channels retain their shipped adapter and Sora's multipart/result contract.
func isWorkbenchVideoConfig(ctx context.Context, config providerConfig) bool {
	metadata, _ := ctx.Value(providerAnalyticsKey{}).(providerAnalyticsContext)
	return metadata.Service.isWorkbenchVideoConfig(config)
}

func (s *Service) isWorkbenchVideoConfig(config providerConfig) bool {
	return s != nil && s.host != nil && config.ChannelID == "newapi-video" && config.InterfaceType == "newapi" && config.BaseURL == "http://newapi.workbench.invalid/v1"
}

type workbenchVideoAdapter struct{ protocol.Adapter }

func (a workbenchVideoAdapter) Metadata() protocol.Metadata {
	info := a.Adapter.Metadata()
	info.DetachedPolling = true
	// THQ does not document an idempotent create or a lookup by client key.
	info.IdempotentCreate = false
	return info
}

func (a workbenchVideoAdapter) BuildCreate(_ context.Context, input protocol.RequestContext) (protocol.RequestSpec, error) {
	r := input.Request
	// Match the independently deployable native backend's duration validator;
	// the embedding New API relay also bounds seconds before billing.
	if r.Duration <= 0 || r.Duration > 3600 {
		return protocol.RequestSpec{}, errors.New("视频时长必须是 1–3600 之间的整数秒")
	}
	body := map[string]any{"model": r.Model, "prompt": r.Prompt, "seconds": strconv.Itoa(r.Duration)}
	if r.AspectRatio != "" {
		body["size"] = r.AspectRatio
	}
	if r.Resolution != "" {
		body["resolution"] = r.Resolution
	}
	spec := protocol.RequestSpec{Method: http.MethodPost, Path: "/v1/videos", ContentType: "application/json", Body: body}
	// A single owned/local image can travel as a file. Never drop additional
	// references or send data:/blob:/private resource paths in URL arrays.
	if len(r.Images) == 1 && len(r.Videos) == 0 && len(r.Audios) == 0 && !workbenchVideoMediaURL(r.Images[0].URL) {
		spec.ContentType = "multipart/form-data"
		spec.Files = []protocol.RequestFilePart{{Name: "input_reference", Filename: "input-reference.png", Reference: r.Images[0]}}
		return spec, nil
	}
	for _, group := range []struct {
		name  string
		items []protocol.MediaReference
	}{{"images", r.Images}, {"reference_videos", r.Videos}, {"reference_audios", r.Audios}} {
		if len(group.items) == 0 {
			continue
		}
		links := make([]string, 0, len(group.items))
		for _, media := range group.items {
			if !workbenchVideoMediaURL(media.URL) {
				return protocol.RequestSpec{}, fmt.Errorf("%s 需要可公开读取的 HTTPS 素材地址；本地存储请配置公网访问地址或对象存储", group.name)
			}
			links = append(links, media.URL)
		}
		body[group.name] = links
	}
	return spec, nil
}

func workbenchVideoMediaURL(raw string) bool {
	u, err := url.Parse(strings.TrimSpace(raw))
	return err == nil && u.Scheme == "https" && u.Hostname() != "" && u.User == nil
}

func (a workbenchVideoAdapter) ParseCreate(ctx context.Context, body []byte) (protocol.CreateResult, error) {
	result, err := a.Adapter.ParseCreate(ctx, body)
	if err == nil {
		result.Result = workbenchVideoResult(result.Result, body)
	}
	if err == nil && result.Status == protocol.StatusSucceeded && !protocolResultHasOutput("video", result.Result) {
		result.Status = protocol.StatusProcessing
	}
	return result, err
}

func (a workbenchVideoAdapter) ParsePoll(ctx context.Context, poll protocol.PollContext, body []byte) (protocol.PollResult, error) {
	result, err := a.Adapter.ParsePoll(ctx, poll, body)
	if err == nil {
		result.Result = workbenchVideoResult(result.Result, body)
	}
	if err == nil && result.Status == protocol.StatusSucceeded && !protocolResultHasOutput("video", result.Result) {
		// A completed task can publish its URL later. Continue reading the same
		// receipt; /content is not supported by THQ and create must not repeat.
		result.Status = protocol.StatusProcessing
	}
	return result, err
}

func workbenchVideoResult(result *protocol.Result, body []byte) *protocol.Result {
	if protocolResultHasOutput("video", result) {
		return result
	}
	var payload map[string]any
	if json.Unmarshal(body, &payload) != nil {
		return result
	}
	if link := newAPIVideoResultURL(payload); link != "" {
		if result == nil {
			result = &protocol.Result{}
		}
		result.Videos = []protocol.MediaReference{{URL: link, Kind: "video", Ephemeral: true}}
	}
	return result
}
