package service

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"slices"
	"sort"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

// These adapters read a configured source. They never execute an external AI,
// create a project, send a message, or silently advertise write capabilities.
var studioContextProviders = []string{"unsplash", "vimeo", "slack", "linear", "asana", "descript", "atlassian", "baidu", "airtable", "hubspot"}

func studioConnectorOperations(provider string) []string {
	if slices.Contains([]string{"unsplash", "vimeo", "baidu", "hubspot"}, provider) {
		return []string{"import_media", "import_context"}
	}
	if slices.Contains(studioContextProviders, provider) {
		return []string{"import_context"}
	}
	if provider == "webhook" {
		return []string{"notify_delivery"}
	}
	operations := []string{"import_media", "export_media"}
	if provider == "frameio" {
		operations = append(operations, "sync_review")
	}
	return operations
}

func studioConnectorContextPage(ctx context.Context, config StudioConnectorConfig, cursor string) (StudioConnectorResources, error) {
	result := StudioConnectorResources{Items: []StudioConnectorResource{}}
	add := func(id, name string) {
		if id != "" {
			result.Items = append(result.Items, StudioConnectorResource{ID: id, Name: name, Kind: "context"})
		}
	}
	switch config.Provider {
	case "unsplash":
		page := 1
		if cursor != "" {
			value, err := strconv.Atoi(cursor)
			if err != nil || value < 1 || value > 1000 {
				return result, errors.New("invalid photo page")
			}
			page = value
		}
		var response struct {
			Results    []struct{ ID, Description, AltDescription string }
			TotalPages int `json:"total_pages"`
		}
		query := url.Values{"query": {config.FolderID}, "page": {strconv.Itoa(page)}, "per_page": {"30"}}
		if err := studioConnectorJSON(ctx, config, "GET", "/search/photos?"+query.Encode(), nil, &response); err != nil {
			return result, err
		}
		for _, item := range response.Results {
			name := item.Description
			if name == "" {
				name = item.AltDescription
			}
			if name == "" {
				name = item.ID
			}
			add(item.ID, name)
		}
		if page < response.TotalPages {
			result.Cursor = strconv.Itoa(page + 1)
		}
	case "vimeo":
		page := "1"
		if cursor != "" {
			page = cursor
		}
		if value, err := strconv.Atoi(page); err != nil || value < 1 || value > 1000 {
			return result, errors.New("invalid video page")
		}
		var response struct {
			Data   []struct{ URI, Name string }
			Paging struct{ Next string }
		}
		resource := "/me/videos?" + url.Values{"per_page": {"100"}, "page": {page}}.Encode()
		if config.FolderID != "" {
			resource = "/me/projects/" + url.PathEscape(config.FolderID) + "/videos?" + url.Values{"per_page": {"100"}, "page": {page}}.Encode()
		}
		if err := studioConnectorJSON(ctx, config, "GET", resource, nil, &response); err != nil {
			return result, err
		}
		for _, item := range response.Data {
			add(strings.TrimPrefix(item.URI, "/videos/"), item.Name)
		}
		if response.Paging.Next != "" {
			next, err := url.Parse(response.Paging.Next)
			if err == nil {
				result.Cursor = next.Query().Get("page")
			}
		}
	case "slack":
		var response struct {
			OK               bool
			Messages         []struct{ TS, Text string }
			ResponseMetadata struct {
				NextCursor string `json:"next_cursor"`
			} `json:"response_metadata"`
		}
		resource := "/api/conversations.history?" + url.Values{"channel": {config.FolderID}, "limit": {"100"}, "cursor": {cursor}}.Encode()
		if err := studioConnectorJSON(ctx, config, "GET", resource, nil, &response); err != nil {
			return result, err
		}
		if !response.OK {
			return result, errors.New("Slack denied access to the configured conversation")
		}
		for _, item := range response.Messages {
			add(item.TS, item.Text)
		}
		result.Cursor = response.ResponseMetadata.NextCursor
	case "linear":
		var response struct {
			Data struct {
				Issues struct {
					Nodes    []struct{ ID, Title string }
					PageInfo struct {
						HasNextPage bool
						EndCursor   string
					}
				}
			}
			Errors []any
		}
		query := `query($team: ID!, $after: String) { issues(first: 100, after: $after, filter: {team: {id: {eq: $team}}}) { nodes { id title } pageInfo { hasNextPage endCursor } } }`
		var after any
		if cursor != "" {
			after = cursor
		}
		if err := studioConnectorJSON(ctx, config, "POST", "/graphql", map[string]any{"query": query, "variables": map[string]any{"team": config.FolderID, "after": after}}, &response); err != nil {
			return result, err
		}
		if len(response.Errors) > 0 {
			return result, errors.New("Linear could not read the configured team")
		}
		for _, item := range response.Data.Issues.Nodes {
			add(item.ID, item.Title)
		}
		if response.Data.Issues.PageInfo.HasNextPage {
			result.Cursor = response.Data.Issues.PageInfo.EndCursor
		}
	case "asana":
		var response struct {
			Data     []struct{ GID, Name string }
			NextPage *struct{ Offset string } `json:"next_page"`
		}
		resource := "/api/1.0/tasks?" + url.Values{"project": {config.FolderID}, "limit": {"100"}, "offset": {cursor}, "opt_fields": {"name"}}.Encode()
		if err := studioConnectorJSON(ctx, config, "GET", resource, nil, &response); err != nil {
			return result, err
		}
		for _, item := range response.Data {
			add(item.GID, item.Name)
		}
		if response.NextPage != nil {
			result.Cursor = response.NextPage.Offset
		}
	case "airtable":
		var response struct {
			Records []struct {
				ID     string
				Fields map[string]any
			}
			Offset string
		}
		resource := "/v0/" + url.PathEscape(config.AccountID) + "/" + url.PathEscape(config.FolderID) + "?" + url.Values{"pageSize": {"100"}, "offset": {cursor}}.Encode()
		if err := studioConnectorJSON(ctx, config, "GET", resource, nil, &response); err != nil {
			return result, err
		}
		for _, item := range response.Records {
			name := item.ID
			for _, key := range []string{"Name", "Title", "name", "title"} {
				if value, ok := item.Fields[key].(string); ok {
					name = value
					break
				}
			}
			add(item.ID, name)
		}
		result.Cursor = response.Offset
	case "atlassian":
		var response struct {
			Results []struct{ ID, Title string }
			Links   struct{ Next string } `json:"_links"`
		}
		resource := "/ex/confluence/" + url.PathEscape(config.AccountID) + "/wiki/api/v2/pages?" + url.Values{"space-id": {config.FolderID}, "limit": {"100"}, "cursor": {cursor}}.Encode()
		if err := studioConnectorJSON(ctx, config, "GET", resource, nil, &response); err != nil {
			return result, err
		}
		for _, item := range response.Results {
			add(item.ID, item.Title)
		}
		if response.Links.Next != "" {
			next, err := url.Parse(response.Links.Next)
			if err == nil {
				result.Cursor = next.Query().Get("cursor")
			}
		}
	case "baidu":
		page := "0"
		if cursor != "" {
			page = cursor
		}
		start, err := strconv.Atoi(page)
		if err != nil || start < 0 || start > 100000 {
			return result, errors.New("invalid drive offset")
		}
		var response struct {
			Errno int
			List  []struct {
				FSID           int64  `json:"fs_id"`
				ServerFilename string `json:"server_filename"`
				IsDir          int    `json:"isdir"`
			}
		}
		resource := "/rest/2.0/xpan/file?" + url.Values{"method": {"list"}, "dir": {"/" + strings.Trim(config.FolderID, "/")}, "start": {page}, "limit": {"100"}}.Encode()
		if err := studioConnectorJSON(ctx, config, "GET", resource, nil, &response); err != nil {
			return result, err
		}
		if response.Errno != 0 {
			return result, errors.New("Baidu Drive denied access to the configured directory")
		}
		for _, item := range response.List {
			if item.IsDir == 0 {
				add(strconv.FormatInt(item.FSID, 10), item.ServerFilename)
			}
		}
		if len(response.List) == 100 {
			result.Cursor = strconv.Itoa(start + 100)
		}
	case "hubspot":
		var response struct {
			Results []struct{ ID, Name, ParentFolderID string }
			Paging  struct{ Next struct{ After string } }
		}
		resource := "/files/2026-09/files/search?" + url.Values{"limit": {"100"}, "after": {cursor}}.Encode()
		if err := studioConnectorJSON(ctx, config, "GET", resource, nil, &response); err != nil {
			return result, err
		}
		for _, item := range response.Results {
			if config.FolderID == "" || item.ParentFolderID == config.FolderID {
				add(item.ID, item.Name)
			}
		}
		result.Cursor = response.Paging.Next.After
	case "descript":
		if cursor != "" {
			return result, nil
		}
		value, err := studioReadConnectorContext(ctx, config, config.FolderID)
		if err != nil {
			return result, err
		}
		add(config.FolderID, value.Title)
	default:
		return result, errors.New("this source does not support context import")
	}
	for index := range result.Items {
		item := &result.Items[index]
		if len([]rune(item.Name)) > 200 {
			item.Name = string([]rune(item.Name)[:200])
		}
	}
	return result, nil
}

type studioConnectorContextDocument struct{ Title, Text string }

func studioReadConnectorContext(ctx context.Context, config StudioConnectorConfig, id string) (studioConnectorContextDocument, error) {
	if _, err := studioConnectorResourcePath(id); err != nil {
		return studioConnectorContextDocument{}, err
	}
	response := map[string]any{}
	resource := ""
	switch config.Provider {
	case "unsplash":
		resource = "/photos/" + url.PathEscape(id)
	case "vimeo":
		resource = "/videos/" + url.PathEscape(id)
	case "slack":
		resource = "/api/conversations.history?" + url.Values{"channel": {config.FolderID}, "oldest": {id}, "latest": {id}, "inclusive": {"true"}, "limit": {"1"}}.Encode()
	case "linear":
		query := `query($id: String!) { issue(id: $id) { id title description team { id } } }`
		if err := studioConnectorJSON(ctx, config, "POST", "/graphql", map[string]any{"query": query, "variables": map[string]any{"id": id}}, &response); err != nil {
			return studioConnectorContextDocument{}, err
		}
		if errors, ok := response["errors"].([]any); ok && len(errors) > 0 {
			return studioConnectorContextDocument{}, fmt.Errorf("Linear denied access to the issue")
		}
		data, _ := response["data"].(map[string]any)
		response, _ = data["issue"].(map[string]any)
		team, _ := response["team"].(map[string]any)
		if team["id"] != config.FolderID {
			return studioConnectorContextDocument{}, fmt.Errorf("issue is outside the configured team")
		}
	case "asana":
		resource = "/api/1.0/tasks/" + url.PathEscape(id) + "?opt_fields=name,notes,memberships.project.gid"
	case "airtable":
		resource = "/v0/" + url.PathEscape(config.AccountID) + "/" + url.PathEscape(config.FolderID) + "/" + url.PathEscape(id)
	case "atlassian":
		resource = "/ex/confluence/" + url.PathEscape(config.AccountID) + "/wiki/api/v2/pages/" + url.PathEscape(id) + "?body-format=storage"
	case "baidu":
		resource = "/rest/2.0/xpan/multimedia?" + url.Values{"method": {"filemetas"}, "fsids": {"[" + id + "]"}}.Encode()
	case "hubspot":
		resource = "/files/2026-09/files/" + url.PathEscape(id)
	case "descript":
		if id != config.FolderID {
			return studioConnectorContextDocument{}, errors.New("project is outside the configured Descript source")
		}
		resource = "/v1/projects/" + url.PathEscape(id)
	default:
		return studioConnectorContextDocument{}, errors.New("unsupported context source")
	}
	if resource != "" {
		if err := studioConnectorJSON(ctx, config, "GET", resource, nil, &response); err != nil {
			return studioConnectorContextDocument{}, err
		}
	}
	if config.Provider == "slack" {
		if response["ok"] != true {
			return studioConnectorContextDocument{}, errors.New("Slack denied access to the message")
		}
		values := studioObjects(response, "messages")
		if len(values) != 1 || values[0]["ts"] != id {
			return studioConnectorContextDocument{}, errors.New("message is unavailable in the configured conversation")
		}
		response = values[0]
	}
	if config.Provider == "asana" {
		response, _ = response["data"].(map[string]any)
		belongs := false
		for _, membership := range studioObjects(response, "memberships") {
			project, _ := membership["project"].(map[string]any)
			belongs = belongs || project["gid"] == config.FolderID
		}
		if !belongs {
			return studioConnectorContextDocument{}, errors.New("task is outside the configured project")
		}
	}
	if config.Provider == "atlassian" && response["spaceId"] != config.FolderID {
		return studioConnectorContextDocument{}, errors.New("page is outside the configured space")
	}
	if config.Provider == "hubspot" && config.FolderID != "" && response["parentFolderId"] != config.FolderID {
		return studioConnectorContextDocument{}, errors.New("file is outside the configured folder")
	}
	if config.Provider == "baidu" {
		if response["errno"] != float64(0) {
			return studioConnectorContextDocument{}, errors.New("Baidu Drive rejected metadata access")
		}
		files := studioObjects(response, "list")
		if len(files) != 1 {
			return studioConnectorContextDocument{}, errors.New("drive file is unavailable")
		}
		response = files[0]
		path, _ := response["path"].(string)
		root := "/" + strings.Trim(config.FolderID, "/")
		if root != "/" && !strings.HasPrefix(path, root+"/") {
			return studioConnectorContextDocument{}, errors.New("file is outside the configured drive directory")
		}
	}
	if len(response) == 0 {
		return studioConnectorContextDocument{}, errors.New("source returned no readable context")
	}
	document := studioConnectorContextDocument{Title: id}
	for _, key := range []string{"title", "name", "project_name", "description", "server_filename"} {
		if value, ok := response[key].(string); ok && value != "" {
			document.Title = value
			break
		}
	}
	// Export only documented creative/context fields; never serialize auth
	// material, signed download links, or arbitrary provider response objects.
	safe := map[string]any{"source": config.Provider, "resource_id": id}
	for _, key := range []string{"title", "name", "project_name", "description", "alt_description", "notes", "text", "transcript", "fields", "body", "status", "server_filename", "path", "size", "duration", "media_files", "compositions"} {
		if value, ok := response[key]; ok {
			safe[key] = value
		}
	}
	if len(safe) <= 2 {
		return document, errors.New("source returned no readable creative fields")
	}
	encoded, err := common.Marshal(safe)
	if err != nil {
		return document, err
	}
	if len([]rune(string(encoded))) > 30000 {
		return document, errors.New("source context exceeds 30000 characters; select a smaller item")
	}
	lines := []string{document.Title, "Source: " + config.Label + " · " + id}
	keys := make([]string, 0, len(safe))
	for key := range safe {
		if key != "source" && key != "resource_id" {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	for _, key := range keys {
		if value, ok := safe[key].(string); ok {
			lines = append(lines, key+": "+value)
			continue
		}
		value, err := common.Marshal(safe[key])
		if err != nil {
			return document, err
		}
		lines = append(lines, key+": "+string(value))
	}
	document.Text = strings.Join(lines, "\n")
	if len([]rune(document.Text)) > 30000 {
		return document, errors.New("source context exceeds the readable draft limit")
	}
	return document, nil
}
