package service

import (
	"context"
	"errors"
	"net/url"
	"os"
	"strconv"
	"strings"
)

func studioConnectorSourceMedia(ctx context.Context, config StudioConnectorConfig, id string) ([]byte, string, string, error) {
	if _, err := studioConnectorResourcePath(id); err != nil {
		return nil, "", "", err
	}
	link, name := "", id
	switch config.Provider {
	case "unsplash":
		var photo struct {
			ID, Description string
			User            struct{ Name string }
		}
		if err := studioConnectorJSON(ctx, config, "GET", "/photos/"+url.PathEscape(id), nil, &photo); err != nil {
			return nil, "", "", err
		}
		if photo.ID != id {
			return nil, "", "", errors.New("photo source identity differs")
		}
		var download struct{ URL string }
		if err := studioConnectorJSON(ctx, config, "GET", "/photos/"+url.PathEscape(id)+"/download", nil, &download); err != nil {
			return nil, "", "", err
		}
		link, name = download.URL, "Unsplash photo by "+photo.User.Name+" · "+photo.Description+" · "+id+".jpg"
	case "vimeo":
		var video struct {
			URI, Name string
			User      struct{ URI string }
			Download  []struct{ Link, Type string }
		}
		resource := "/videos/" + url.PathEscape(id)
		if config.FolderID != "" {
			resource = "/me/projects/" + url.PathEscape(config.FolderID) + "/videos/" + url.PathEscape(id)
		}
		if err := studioConnectorJSON(ctx, config, "GET", resource, nil, &video); err != nil {
			return nil, "", "", err
		}
		if video.URI != "/videos/"+id {
			return nil, "", "", errors.New("video source identity differs")
		}
		if config.FolderID == "" {
			var owner struct{ URI string }
			if err := studioConnectorJSON(ctx, config, "GET", "/me", nil, &owner); err != nil {
				return nil, "", "", err
			}
			if video.User.URI == "" || video.User.URI != owner.URI {
				return nil, "", "", errors.New("video is outside the authorized library")
			}
		}
		for _, file := range video.Download {
			if file.Type == "video/mp4" {
				link = file.Link
				break
			}
		}
		if link == "" {
			return nil, "", "", errors.New("Vimeo has not granted a downloadable MP4 for this video")
		}
		name = video.Name + ".mp4"
	case "hubspot":
		var metadata struct{ ID, Name, Extension, ParentFolderID string }
		resource := "/files/2026-09/files/" + url.PathEscape(id)
		if err := studioConnectorJSON(ctx, config, "GET", resource, nil, &metadata); err != nil {
			return nil, "", "", err
		}
		if metadata.ID != id || config.FolderID != "" && metadata.ParentFolderID != config.FolderID {
			return nil, "", "", errors.New("source is outside the configured file folder")
		}
		var signed struct{ URL string }
		if err := studioConnectorJSON(ctx, config, "GET", resource+"/signed-url", nil, &signed); err != nil {
			return nil, "", "", err
		}
		link, name = signed.URL, metadata.Name+"."+metadata.Extension
	case "baidu":
		number, err := strconv.ParseInt(id, 10, 64)
		if err != nil || number < 1 {
			return nil, "", "", errors.New("invalid drive file identity")
		}
		var response struct {
			Errno int
			List  []struct {
				FSID           int64 `json:"fs_id"`
				Path, Dlink    string
				ServerFilename string `json:"server_filename"`
			}
		}
		resource := "/rest/2.0/xpan/multimedia?" + url.Values{"method": {"filemetas"}, "fsids": {"[" + id + "]"}, "dlink": {"1"}}.Encode()
		if err := studioConnectorJSON(ctx, config, "GET", resource, nil, &response); err != nil {
			return nil, "", "", err
		}
		if response.Errno != 0 || len(response.List) != 1 || response.List[0].FSID != number {
			return nil, "", "", errors.New("drive file is unavailable")
		}
		file := response.List[0]
		root := "/" + strings.Trim(config.FolderID, "/")
		if root != "/" && !strings.HasPrefix(file.Path, root+"/") {
			return nil, "", "", errors.New("file is outside the configured drive directory")
		}
		parsed, err := url.Parse(file.Dlink)
		origin, _ := url.Parse(studioConnectorOrigin(config.Provider))
		if err != nil || parsed.Scheme != "https" || parsed.User != nil || origin == nil || !(parsed.Host == origin.Host || strings.HasSuffix(parsed.Hostname(), ".baidupcs.com") || strings.HasSuffix(parsed.Hostname(), ".pcs.baidu.com")) {
			return nil, "", "", errors.New("drive returned an unsupported secure download host")
		}
		query := parsed.Query()
		query.Set("access_token", os.Getenv(config.TokenEnv))
		parsed.RawQuery = query.Encode()
		data, mime, err := studioConnectorDownload(ctx, parsed.String(), "pan.baidu.com", "baidupcs.com", "pcs.baidu.com", origin.Hostname())
		return data, mime, file.ServerFilename, err
	default:
		return nil, "", "", errors.New("this source imports context rather than media files")
	}
	data, mime, err := studioConnectorDownload(ctx, link)
	return data, mime, name, err
}
