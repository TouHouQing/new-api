package service

import (
	"context"
	"encoding/xml"
	"errors"
	"io"
	"mime"
	"net/http"
	"net/url"
	"path"
	"slices"
	"strings"
	"time"
)

func studioWebDAVResources(ctx context.Context, config StudioConnectorConfig, cursor string) (StudioConnectorResources, error) {
	result := StudioConnectorResources{Items: []StudioConnectorResource{}}
	resource := "/"
	if cursor != "" {
		value, err := studioConnectorResourcePath(cursor)
		if err != nil {
			return result, err
		}
		resource += value + "/"
	}
	// PROPFIND needs Depth:1; the request helper applies this fixed header.
	body := `<d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:getcontentlength/><d:getcontenttype/><d:resourcetype/></d:prop></d:propfind>`
	data, _, err := studioConnectorRequest(ctx, config, "PROPFIND", resource, "application/xml", strings.NewReader(body), 2<<20)
	if err != nil {
		return result, err
	}
	var document struct {
		Responses []struct {
			Href       string `xml:"href"`
			Properties []struct {
				Status string `xml:"status"`
				Prop   struct {
					Name     string `xml:"displayname"`
					Size     int64  `xml:"getcontentlength"`
					Type     string `xml:"getcontenttype"`
					Resource struct {
						Collections []struct{} `xml:"collection"`
					} `xml:"resourcetype"`
				} `xml:"prop"`
			} `xml:"propstat"`
		} `xml:"response"`
	}
	if err := xml.Unmarshal(data, &document); err != nil || len(document.Responses) > 2000 {
		return result, errors.New("WebDAV returned an invalid directory")
	}
	base, _ := url.Parse(strings.TrimRight(config.BaseURL, "/") + "/")
	for _, response := range document.Responses {
		link, err := url.Parse(response.Href)
		if err != nil {
			continue
		}
		if link.IsAbs() && (link.Host != base.Host || link.Scheme != base.Scheme) {
			continue
		}
		if !strings.HasPrefix(link.Path, base.Path) {
			continue
		}
		relative := strings.TrimSuffix(strings.TrimPrefix(link.Path, base.Path), "/")
		if relative == "" || relative == strings.TrimSuffix(cursor, "/") {
			continue
		}
		if _, err := studioConnectorResourcePath(relative); err != nil {
			continue
		}
		for _, property := range response.Properties {
			if !strings.Contains(property.Status, " 200 ") {
				continue
			}
			name := property.Prop.Name
			if name == "" {
				name = path.Base(relative)
			}
			kind := "file"
			if len(property.Prop.Resource.Collections) > 0 {
				kind = "folder"
			}
			result.Items = append(result.Items, StudioConnectorResource{ID: relative, Name: name, Kind: kind, Size: property.Prop.Size})
			break
		}
	}
	return result, nil
}

func studioConnectorDownload(ctx context.Context, rawURL string, redirectDomains ...string) ([]byte, string, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Scheme != "https" || parsed.Hostname() == "" || parsed.User != nil {
		return nil, "", errors.New("connector returned an invalid media URL")
	}
	request, err := http.NewRequestWithContext(ctx, "GET", rawURL, nil)
	if err != nil {
		return nil, "", errors.New("connector returned an invalid media URL")
	}
	client := *studioConnectorHTTPClient()
	client.Timeout = 2 * time.Minute
	client.CheckRedirect = func(next *http.Request, previous []*http.Request) error {
		if len(previous) >= 3 || next.URL.Scheme != "https" || next.URL.User != nil {
			return errors.New("media redirect was rejected")
		}
		if len(redirectDomains) > 0 {
			allowed := false
			for _, domain := range redirectDomains {
				allowed = allowed || next.URL.Hostname() == domain || strings.HasSuffix(next.URL.Hostname(), "."+domain)
			}
			if !allowed {
				return errors.New("credential-bearing media redirect left the provider")
			}
		}
		return nil
	}
	if len(redirectDomains) > 0 {
		request.Header.Set("User-Agent", "pan.baidu.com")
	}
	response, err := client.Do(request)
	if err != nil {
		return nil, "", errors.New("connector media download failed")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, "", errors.New("connector media is unavailable")
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, StudioMaxMediaBytes+1))
	if err != nil || int64(len(data)) > StudioMaxMediaBytes {
		return nil, "", errors.New("connector media exceeds the platform limit")
	}
	contentType, _, _ := mime.ParseMediaType(response.Header.Get("Content-Type"))
	return data, contentType, nil
}

func studioConnectorFile(ctx context.Context, config StudioConnectorConfig, remoteID string) ([]byte, string, string, error) {
	resource, err := studioConnectorResourcePath(remoteID)
	if err != nil {
		return nil, "", "", err
	}
	name, contentType := "", ""
	var data []byte
	switch config.Provider {
	case "unsplash", "vimeo", "baidu", "hubspot":
		return studioConnectorSourceMedia(ctx, config, remoteID)
	case "webdav":
		var headers http.Header
		data, headers, err = studioConnectorRequest(ctx, config, "GET", "/"+resource, "", nil, StudioMaxMediaBytes)
		contentType, _, _ = mime.ParseMediaType(headers.Get("Content-Type"))
		name = path.Base(remoteID)
	case "feishu", "lark":
		var headers http.Header
		data, headers, err = studioConnectorRequest(ctx, config, "GET", "/open-apis/drive/v1/files/"+url.PathEscape(remoteID)+"/download", "", nil, StudioMaxMediaBytes)
		var status *studioConnectorHTTPError
		if errors.As(err, &status) && status.Status >= 300 && status.Status < 400 && headers.Get("Location") != "" {
			data, contentType, err = studioConnectorDownload(ctx, headers.Get("Location"))
		} else {
			contentType, _, _ = mime.ParseMediaType(headers.Get("Content-Type"))
		}
		_, values, _ := mime.ParseMediaType(headers.Get("Content-Disposition"))
		name = values["filename"]
	case "frameio":
		var response struct {
			Data struct {
				Name       string
				MediaType  string `json:"media_type"`
				MediaLinks struct {
					Original struct {
						DownloadURL string `json:"download_url"`
					} `json:"original"`
				} `json:"media_links"`
			}
		}
		err = studioConnectorJSON(ctx, config, "GET", "/v4/accounts/"+url.PathEscape(config.AccountID)+"/files/"+url.PathEscape(remoteID)+"?include=media_links.original", nil, &response)
		if err != nil {
			return nil, "", "", err
		}
		name, contentType = response.Data.Name, response.Data.MediaType
		data, _, err = studioConnectorDownload(ctx, response.Data.MediaLinks.Original.DownloadURL)
	case "notion":
		var response map[string]any
		err = studioConnectorJSON(ctx, config, "GET", "/v1/blocks/"+url.PathEscape(remoteID), nil, &response)
		if err != nil {
			return nil, "", "", err
		}
		kind, _ := response["type"].(string)
		if !slices.Contains([]string{"image", "video", "audio", "file"}, kind) {
			return nil, "", "", errors.New("choose a media block from the configured Notion page")
		}
		value, _ := response[kind].(map[string]any)
		typeName, _ := value["type"].(string)
		file, _ := value[typeName].(map[string]any)
		link, _ := file["url"].(string)
		name, _ = value["name"].(string)
		data, contentType, err = studioConnectorDownload(ctx, link)
	default:
		return nil, "", "", errors.New("this connection does not import media")
	}
	if err != nil {
		return nil, "", "", err
	}
	if contentType == "" || contentType == "application/octet-stream" {
		contentType, _, _ = mime.ParseMediaType(mime.TypeByExtension(path.Ext(name)))
	}
	if contentType == "" {
		contentType = http.DetectContentType(data)
	}
	if name == "" {
		name = remoteID
	}
	return data, contentType, name, nil
}

func studioConnectorImport(ctx context.Context, config StudioConnectorConfig, remoteID string) ([]byte, string, string, error) {
	data, contentType, name, err := studioConnectorFile(ctx, config, remoteID)
	if err != nil {
		return nil, "", "", err
	}
	if !(strings.HasPrefix(contentType, "image/") || strings.HasPrefix(contentType, "audio/") || strings.HasPrefix(contentType, "video/")) || contentType == "image/svg+xml" {
		return nil, "", "", errors.New("choose a supported raster image, audio or video file")
	}
	return data, contentType, name, nil
}
