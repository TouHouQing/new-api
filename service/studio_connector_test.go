package service

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestStudioConnectorTLSFileTransfersPermissionsAndRecovery(t *testing.T) {
	studioProductionFixture(t, false)
	require.NoError(t, model.DB.AutoMigrate(&model.User{}, &model.StudioReviewComment{}))
	require.NoError(t, model.DB.Create(&model.User{Id: 1, Username: "connector-owner", Status: common.UserStatusEnabled}).Error)
	imageData := image.NewRGBA(image.Rect(0, 0, 32, 32))
	imageData.SetRGBA(10, 10, color.RGBA{10, 240, 20, 255})
	var imageBytes bytes.Buffer
	require.NoError(t, png.Encode(&imageBytes, imageData))
	source := append([]byte{}, imageBytes.Bytes()...)
	_, err := SaveStudioMedia(1, "connector-source", "image/png", bytes.NewReader(source))
	require.NoError(t, err)
	files := map[string][]byte{"input.png": source}
	parts := map[string]map[int][]byte{}
	creates := map[string]int{}
	notifications := map[string]string{}
	var api *httptest.Server
	api = httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		resource := request.URL.Path
		if strings.HasPrefix(resource, "/signed/") {
			assert.Empty(t, request.Header.Get("Authorization"), "provider bearer tokens must not reach signed storage URLs")
			files["frameio"] = mustReadConnectorTestBody(t, request.Body)
			writer.WriteHeader(200)
			return
		}
		if resource == "/original" {
			assert.Empty(t, request.Header.Get("Authorization"))
			writer.Header().Set("Content-Type", "image/png")
			writer.Write(source)
			return
		}
		if strings.HasPrefix(resource, "/dav/") {
			username, password, ok := request.BasicAuth()
			assert.True(t, ok)
			assert.Equal(t, "test-owner", username)
			assert.Equal(t, "private-test-password", password)
			name := strings.TrimPrefix(resource, "/dav/")
			switch request.Method {
			case "GET":
				data, exists := files[name]
				if !exists {
					writer.WriteHeader(404)
					return
				}
				writer.Header().Set("Content-Type", "image/png")
				writer.Write(data)
			case "PUT":
				files[name] = mustReadConnectorTestBody(t, request.Body)
				writer.WriteHeader(201)
			case "PROPFIND":
				assert.Equal(t, "1", request.Header.Get("Depth"))
				writer.Header().Set("Content-Type", "application/xml")
				writer.WriteHeader(207)
				fmt.Fprint(writer, `<d:multistatus xmlns:d="DAV:"><d:response><d:href>/dav/input.png</d:href><d:propstat><d:status>HTTP/1.1 200 OK</d:status><d:prop><d:displayname>Garden reference</d:displayname><d:getcontentlength>100</d:getcontentlength></d:prop></d:propstat></d:response></d:multistatus>`)
			}
			return
		}
		if resource == "/notify" {
			assert.Empty(t, request.Header.Get("Authorization"), "shared signing keys must not be transmitted")
			if request.Method == "GET" {
				id, timestamp := request.URL.Query().Get("event_id"), request.Header.Get("X-Studio-Timestamp")
				signature := hmac.New(sha256.New, []byte("private-test-token"))
				signature.Write([]byte("GET\n" + id + "\n" + timestamp))
				assert.Equal(t, "sha256="+hex.EncodeToString(signature.Sum(nil)), request.Header.Get("X-Studio-Signature"))
				response, _ := common.Marshal(map[string]any{"event_id": id, "sha256": notifications[id], "state": "received"})
				writer.Write(response)
				return
			}
			body := mustReadConnectorTestBody(t, request.Body)
			signature := hmac.New(sha256.New, []byte("private-test-token"))
			signature.Write(body)
			assert.Equal(t, "sha256="+hex.EncodeToString(signature.Sum(nil)), request.Header.Get("X-Studio-Signature"))
			var event struct {
				ID        string `json:"event_id"`
				Timestamp int64  `json:"timestamp"`
				Digest    string `json:"sha256"`
			}
			require.NoError(t, common.Unmarshal(body, &event))
			assert.InDelta(t, time.Now().Unix(), event.Timestamp, 5)
			notifications[event.ID] = event.Digest
			response, _ := common.Marshal(map[string]any{"event_id": event.ID})
			writer.Write(response)
			creates["notification"]++
			return
		}
		assert.Equal(t, "Bearer private-test-token", request.Header.Get("Authorization"))
		switch {
		case resource == "/v4/accounts/account/files/frame-upload":
			response, _ := common.Marshal(map[string]any{"data": map[string]any{"name": "film.png", "media_type": "image/png", "media_links": map[string]any{"original": map[string]any{"download_url": api.URL + "/original"}}}})
			writer.Write(response)
		case resource == "/open-apis/drive/v1/files/feishu-file/download":
			writer.Header().Set("Location", api.URL+"/original")
			writer.WriteHeader(302)
		case resource == "/v1/blocks/notion-block":
			response, _ := common.Marshal(map[string]any{"type": "image", "image": map[string]any{"type": "file", "file": map[string]any{"url": api.URL + "/original"}}})
			writer.Write(response)
		case strings.HasSuffix(resource, "/children") && request.Method == "GET":
			fmt.Fprint(writer, `{"data":[{"id":"remote-file","name":"Garden reference","type":"file","file_size":100}],"links":{}}`)
		case strings.HasSuffix(resource, "/files/local_upload"):
			creates["frameio"]++
			var body struct {
				Data struct {
					Name string
					Size int64 `json:"file_size"`
				}
			}
			require.NoError(t, common.DecodeJson(request.Body, &body))
			assert.Equal(t, int64(len(source)), body.Data.Size)
			response, _ := common.Marshal(map[string]any{"data": map[string]any{"id": "frame-upload", "upload_urls": []any{map[string]any{"url": api.URL + "/signed/part", "size": len(source)}}}})
			writer.Write(response)
		case resource == "/open-apis/drive/v1/files/upload_prepare":
			creates["feishu"]++
			parts["feishu"] = map[int][]byte{}
			fmt.Fprintf(writer, `{"code":0,"data":{"upload_id":"feishu-upload","block_size":%d,"block_num":1}}`, len(source))
		case resource == "/open-apis/drive/v1/files/upload_part":
			require.NoError(t, request.ParseMultipartForm(1<<20))
			assert.Equal(t, "0", request.FormValue("seq"))
			assert.Equal(t, "feishu-upload", request.FormValue("upload_id"))
			file, _, err := request.FormFile("file")
			require.NoError(t, err)
			parts["feishu"][0] = mustReadConnectorTestBody(t, file)
			file.Close()
			fmt.Fprint(writer, `{"code":0}`)
		case resource == "/open-apis/drive/v1/files/upload_finish":
			files["feishu"] = parts["feishu"][0]
			fmt.Fprint(writer, `{"code":0,"data":{"file_token":"feishu-file"}}`)
		case resource == "/v1/file_uploads":
			creates["notion"]++
			var body map[string]any
			require.NoError(t, common.DecodeJson(request.Body, &body))
			assert.Equal(t, "single_part", body["mode"])
			assert.Equal(t, "2025-09-03", request.Header.Get("Notion-Version"))
			fmt.Fprint(writer, `{"id":"notion-upload"}`)
		case resource == "/v1/file_uploads/notion-upload/send":
			require.NoError(t, request.ParseMultipartForm(1<<20))
			assert.Empty(t, request.FormValue("part_number"))
			file, _, err := request.FormFile("file")
			require.NoError(t, err)
			files["notion"] = mustReadConnectorTestBody(t, file)
			file.Close()
			fmt.Fprint(writer, `{"id":"notion-upload","status":"uploaded"}`)
		case resource == "/v1/blocks/folder/children" && request.Method == "PATCH":
			var body map[string]any
			require.NoError(t, common.DecodeJson(request.Body, &body))
			assert.Contains(t, stringMustConnectorTestJSON(t, body), `"file_upload":{"id":"notion-upload"}`)
			fmt.Fprint(writer, `{"results":[{"id":"notion-block"}]}`)
		default:
			writer.WriteHeader(404)
		}
	}))
	defer api.Close()
	originalOrigin, originalClient := studioConnectorOrigin, studioConnectorHTTPClient
	studioConnectorOrigin = func(provider string) string {
		if provider == "webdav" || provider == "webhook" {
			return ""
		}
		return api.URL
	}
	studioConnectorHTTPClient = api.Client
	t.Cleanup(func() { studioConnectorOrigin, studioConnectorHTTPClient = originalOrigin, originalClient })
	t.Setenv("STUDIO_CONNECTOR_TEST_TOKEN", "private-test-token")
	t.Setenv("STUDIO_CONNECTOR_TEST_USER", "test-owner")
	t.Setenv("STUDIO_CONNECTOR_TEST_PASSWORD", "private-test-password")
	configs := []StudioConnectorConfig{}
	for _, provider := range []string{"frameio", "feishu", "lark", "notion", "webdav", "webhook"} {
		config := StudioConnectorConfig{ID: provider, Provider: provider, Label: provider, OwnerID: 1, AccountID: "account", FolderID: "folder", TokenEnv: "STUDIO_CONNECTOR_TEST_TOKEN"}
		if provider == "webdav" {
			config.BaseURL, config.UsernameEnv, config.PasswordEnv = api.URL+"/dav", "STUDIO_CONNECTOR_TEST_USER", "STUDIO_CONNECTOR_TEST_PASSWORD"
		}
		if provider == "webhook" {
			config.BaseURL = api.URL + "/notify"
		}
		configs = append(configs, config)
	}
	raw, err := common.Marshal(configs)
	require.NoError(t, err)
	t.Setenv("STUDIO_CONNECTORS_JSON", string(raw))
	document := map[string]any{"id": "connector-project", "title": "Connected film", "nodes": []any{map[string]any{"id": "source", "data": map[string]any{"kind": "image", "prompt": "", "mediaId": "connector-source"}}, map[string]any{"id": "import", "data": map[string]any{"kind": "image", "prompt": ""}}}, "edges": []any{}}
	studioCompleteTestDocument(t, document)
	raw, err = common.Marshal(document)
	require.NoError(t, err)
	project, err := model.SaveStudioProject(1, "connector-project", "Connected film", 0, string(raw))
	require.NoError(t, err)
	StudioWorkflowRelay = func(context.Context, *model.StudioWorkflowJob, string, []byte) (StudioRelayResponse, error) {
		t.Fatal("external file transfer must not call a generation model")
		return StudioRelayResponse{}, nil
	}
	for _, config := range configs {
		op := &StudioMediaOperation{ConnectorID: config.ID, Action: "export_media", MediaID: "connector-source"}
		if config.Provider == "webhook" {
			op.Action = "notify_delivery"
		}
		assert.Error(t, ValidateStudioConnectorOperation(1, project, document, op), "external writes require separate affirmative confirmation")
		op.ConfirmExternalWrite = true
		assert.Error(t, ValidateStudioConnectorOperation(2, project, document, op), "another account must never use the owner's credential")
		job, err := QueueStudioWorkflow(1, project.ID, "export-"+config.ID, "connector", project.Revision, 0, nil, nil, op)
		require.NoError(t, err)
		RunStudioWorkflowsOnce(t.Context(), "connector-fixture")
		require.NoError(t, model.DB.First(job, "id = ?", job.ID).Error)
		require.Equal(t, "succeeded", job.Status, job.Error)
		assert.NotContains(t, string(job.Result), "private-test-token")
		assert.NotContains(t, string(job.Result), "/signed/")
		if config.Provider != "webdav" && config.Provider != "webhook" {
			key := config.Provider
			if key == "lark" {
				key = "feishu"
			}
			assert.Equal(t, source, files[key])
		}
		creationKey := config.Provider
		if config.Provider == "lark" {
			creationKey = "feishu"
		}
		if config.Provider == "webhook" {
			creationKey = "notification"
		}
		before := creates[creationKey]
		var plan StudioWorkflowPlan
		require.NoError(t, common.Unmarshal([]byte(job.Plan), &plan))
		require.NoError(t, RunStudioConnector(t.Context(), job, project, &plan))
		assert.Equal(t, before, creates[creationKey], "collecting an existing result must not create another external file or notification")
		receipt, err := studioConnectorReadReceipt(job.ID)
		require.NoError(t, err)
		remoteID := receipt.RemoteID
		receipt.Stage = "creating"
		if config.Provider == "notion" {
			receipt.Stage = "attaching"
		}
		if config.Provider == "webhook" {
			receipt.Stage = "sending"
		}
		require.NoError(t, studioConnectorSaveReceipt(job.ID, receipt))
		require.NoError(t, model.DB.Model(job).Updates(map[string]any{"status": "uncertain", "lease_owner": "", "lease_until": 0}).Error)
		job.Status, job.LeaseUntil = "uncertain", 0
		if config.Provider == "webdav" {
			files[remoteID] = []byte("a different file")
			require.Error(t, ReconcileStudioConnector(t.Context(), job, remoteID), "a similarly named file is not proof of delivery")
			files[remoteID] = source
		}
		require.NoError(t, ReconcileStudioConnector(t.Context(), job, remoteID))
		assert.Equal(t, "succeeded", job.Status)
		assert.Contains(t, string(job.Result), `"reconciled":true`)
		assert.Equal(t, before, creates[creationKey], "reconciliation must only read the existing result")
	}
	resources, err := ListStudioConnectorResources(t.Context(), 1, "webdav", "")
	require.NoError(t, err)
	require.Len(t, resources.Items, 1)
	assert.Equal(t, "Garden reference", resources.Items[0].Name)
	importJob, err := QueueStudioWorkflow(1, project.ID, "import-dav", "connector", project.Revision, 0, nil, nil, &StudioMediaOperation{ConnectorID: "webdav", Action: "import_media", NodeID: "import", ExternalResourceID: "input.png"})
	require.NoError(t, err)
	RunStudioWorkflowsOnce(t.Context(), "connector-importer")
	require.NoError(t, model.DB.First(importJob, "id = ?", importJob.ID).Error)
	require.Equal(t, "succeeded", importJob.Status, importJob.Error)
	current, _, err := model.StudioProjectAccess(model.DB, 1, project.ID, true)
	require.NoError(t, err)
	var saved map[string]any
	require.NoError(t, common.Unmarshal([]byte(current.Document), &saved))
	for _, node := range studioObjects(saved, "nodes") {
		if node["id"] == "import" {
			assert.Equal(t, "connector-import-"+importJob.ID, node["data"].(map[string]any)["mediaId"])
		}
	}
	job := &model.StudioWorkflowJob{ID: "uncertain-file", UserID: 1, ProjectID: project.ID, Kind: "connector", Status: "running"}
	require.NoError(t, model.DB.Create(job).Error)
	media, err := GetStudioMedia(1, "connector-source")
	require.NoError(t, err)
	require.NoError(t, studioConnectorSaveReceipt(job.ID, &studioConnectorReceipt{Stage: "creating", SourceDigest: media.Digest, Provider: "frameio"}))
	count := creates["frameio"]
	_, err = studioConnectorUpload(t.Context(), job, configs[0], media, "do-not-repeat.png")
	require.Error(t, err)
	assert.Equal(t, count, creates["frameio"])
	statuses, err := StudioConnectorStatuses(2)
	require.NoError(t, err)
	assert.Empty(t, statuses)
	assert.NoError(t, model.DB.Model(job).Update("status", "running").Error)
	configs[0].ExpiresAt = time.Now().Add(-time.Minute).Unix()
	raw, err = common.Marshal(configs)
	require.NoError(t, err)
	t.Setenv("STUDIO_CONNECTORS_JSON", string(raw))
	_, err = studioConnectorConfig(1, "frameio")
	assert.Error(t, err)
}

func TestStudioContextAdaptersReadScopedSourcesAndPersistRecoverableTakes(t *testing.T) {
	studioProductionFixture(t, false)
	require.NoError(t, model.DB.AutoMigrate(&model.User{}))
	require.NoError(t, model.DB.Create(&model.User{Id: 1, Username: "context-owner", Status: common.UserStatusEnabled}).Error)
	var api *httptest.Server
	requests := map[string]int{}
	api = httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		parts := strings.SplitN(strings.TrimPrefix(request.URL.Path, "/"), "/", 2)
		provider := parts[0]
		requests[provider]++
		if provider == "unsplash" {
			assert.Equal(t, "Client-ID context-test-token", request.Header.Get("Authorization"))
		} else if provider == "baidu" {
			assert.Equal(t, "context-test-token", request.URL.Query().Get("access_token"))
			assert.Empty(t, request.Header.Get("Authorization"))
		} else {
			assert.Equal(t, "Bearer context-test-token", request.Header.Get("Authorization"))
		}
		writer.Header().Set("Content-Type", "application/json")
		resource := ""
		if len(parts) == 2 {
			resource = "/" + parts[1]
		}
		switch provider {
		case "unsplash":
			if resource == "/search/photos" {
				fmt.Fprint(writer, `{"results":[{"id":"photo","description":"Garden reference"}],"total_pages":1}`)
			} else {
				fmt.Fprint(writer, `{"id":"photo","description":"Garden reference","urls":{"full":"signed-url-must-not-leak"}}`)
			}
		case "vimeo":
			if strings.Contains(resource, "projects") {
				fmt.Fprint(writer, `{"data":[{"uri":"/videos/123","name":"Reference clip"}],"paging":{}}`)
			} else {
				fmt.Fprint(writer, `{"uri":"/videos/123","name":"Reference clip","description":"Original shot breakdown"}`)
			}
		case "slack":
			assert.Equal(t, "root", request.URL.Query().Get("channel"))
			fmt.Fprint(writer, `{"ok":true,"messages":[{"ts":"123.45","text":"Keep approved narration"}],"response_metadata":{}}`)
		case "linear":
			var body struct {
				Query     string
				Variables map[string]any
			}
			require.NoError(t, common.DecodeJson(request.Body, &body))
			assert.NotContains(t, body.Query, "mutation")
			if body.Variables["id"] != nil {
				fmt.Fprint(writer, `{"data":{"issue":{"id":"issue","title":"Film brief","description":"Use warm daylight","team":{"id":"root"}}}}`)
			} else {
				fmt.Fprint(writer, `{"data":{"issues":{"nodes":[{"id":"issue","title":"Film brief"}],"pageInfo":{"hasNextPage":false}}}}`)
			}
		case "asana":
			if resource == "/api/1.0/tasks" {
				fmt.Fprint(writer, `{"data":[{"gid":"task","name":"Film task"}],"next_page":null}`)
			} else {
				fmt.Fprint(writer, `{"data":{"name":"Film task","notes":"Retain dialogue","memberships":[{"project":{"gid":"root"}}]}}`)
			}
		case "airtable":
			if resource == "/v0/account/root" {
				fmt.Fprint(writer, `{"records":[{"id":"record","fields":{"Name":"Product brief"}}]}`)
			} else {
				fmt.Fprint(writer, `{"id":"record","fields":{"Name":"Product brief","Benefit":"Reusable packaging"}}`)
			}
		case "atlassian":
			if strings.HasSuffix(resource, "/pages") {
				fmt.Fprint(writer, `{"results":[{"id":"page","title":"Story notes"}],"_links":{}}`)
			} else {
				fmt.Fprint(writer, `{"id":"page","title":"Story notes","spaceId":"root","body":{"storage":{"value":"Original story notes"}}}`)
			}
		case "baidu":
			if request.URL.Query().Get("method") == "list" {
				fmt.Fprint(writer, `{"errno":0,"list":[{"fs_id":123,"server_filename":"reference.png","isdir":0}]}`)
			} else {
				fmt.Fprint(writer, `{"errno":0,"list":[{"fs_id":123,"server_filename":"reference.png","path":"/root/reference.png","size":100,"dlink":"signed-url-must-not-leak"}]}`)
			}
		case "hubspot":
			if strings.HasSuffix(resource, "/search") {
				fmt.Fprint(writer, `{"results":[{"id":"file","name":"Brand image","parentFolderId":"root"}],"paging":{}}`)
			} else {
				fmt.Fprint(writer, `{"id":"file","name":"Brand image","parentFolderId":"root","size":100,"url":"signed-url-must-not-leak"}`)
			}
		case "descript":
			assert.Equal(t, "GET", request.Method)
			assert.Equal(t, "/v1/projects/root", resource)
			fmt.Fprint(writer, `{"id":"root","name":"Existing edit","drive_id":"account","media_files":{"owned.mp4":{"type":"video","duration":8}},"compositions":[{"name":"Approved cut","duration":8}],"publishes":[]}`)
		default:
			writer.WriteHeader(404)
		}
	}))
	defer api.Close()
	originalOrigin, originalClient := studioConnectorOrigin, studioConnectorHTTPClient
	studioConnectorOrigin = func(provider string) string { return api.URL + "/" + provider }
	studioConnectorHTTPClient = api.Client
	t.Cleanup(func() { studioConnectorOrigin, studioConnectorHTTPClient = originalOrigin, originalClient })
	t.Setenv("STUDIO_CONNECTOR_CONTEXT_TOKEN", "context-test-token")
	configs := []StudioConnectorConfig{}
	for _, provider := range studioContextProviders {
		configs = append(configs, StudioConnectorConfig{ID: provider, Provider: provider, Label: provider, OwnerID: 1, AccountID: "account", FolderID: "root", TokenEnv: "STUDIO_CONNECTOR_CONTEXT_TOKEN"})
	}
	encoded, err := common.Marshal(configs)
	require.NoError(t, err)
	t.Setenv("STUDIO_CONNECTORS_JSON", string(encoded))
	StudioWorkflowRelay = func(context.Context, *model.StudioWorkflowJob, string, []byte) (StudioRelayResponse, error) {
		t.Fatal("context import must not call a generation model")
		return StudioRelayResponse{}, nil
	}
	for _, config := range configs {
		t.Run(config.Provider, func(t *testing.T) {
			sources, err := ListStudioConnectorResources(t.Context(), 1, config.ID, "")
			require.NoError(t, err)
			require.Len(t, sources.Items, 1)
			context, err := studioReadConnectorContext(t.Context(), config, sources.Items[0].ID)
			require.NoError(t, err)
			assert.NotEmpty(t, context.Title)
			assert.NotContains(t, context.Text, "context-test-token")
			assert.NotContains(t, context.Text, "signed-url-must-not-leak")
			document := map[string]any{"id": "context-" + config.ID, "title": "Context film", "nodes": []any{map[string]any{"id": "notes", "data": map[string]any{"kind": "text", "purpose": "note", "prompt": "Keep my manual draft"}}}, "edges": []any{}}
			studioCompleteTestDocument(t, document)
			raw, err := common.Marshal(document)
			require.NoError(t, err)
			project, err := model.SaveStudioProject(1, "context-"+config.ID, "Context film", 0, string(raw))
			require.NoError(t, err)
			operation := &StudioMediaOperation{ConnectorID: config.ID, Action: "import_context", NodeID: "notes", ExternalResourceID: sources.Items[0].ID}
			assert.Error(t, ValidateStudioConnectorOperation(2, project, document, operation))
			job, err := QueueStudioWorkflow(1, project.ID, "context-job-"+config.ID, "connector", project.Revision, 0, nil, nil, operation)
			require.NoError(t, err)
			RunStudioWorkflowsOnce(t.Context(), "context-importer")
			require.NoError(t, model.DB.First(job, "id = ?", job.ID).Error)
			require.Equal(t, "succeeded", job.Status, job.Error)
			current, _, err := model.StudioProjectAccess(model.DB, 1, project.ID, true)
			require.NoError(t, err)
			var saved map[string]any
			require.NoError(t, common.Unmarshal([]byte(current.Document), &saved))
			data := studioObjects(saved, "nodes")[0]["data"].(map[string]any)
			assert.Equal(t, "Keep my manual draft", data["prompt"])
			assert.Contains(t, fmt.Sprint(data["outputText"]), config.Provider)
			require.Len(t, studioObjects(data, "takes"), 1)
			count := requests[config.ID]
			var plan StudioWorkflowPlan
			require.NoError(t, common.Unmarshal([]byte(job.Plan), &plan))
			require.NoError(t, RunStudioConnector(t.Context(), job, current, &plan))
			assert.Equal(t, count, requests[config.ID], "recovery must use the saved context Take")
			readonly := slices.Contains([]string{"slack", "linear", "asana", "airtable", "atlassian", "descript"}, config.Provider)
			if readonly {
				operation.Action = "export_media"
				operation.ConfirmExternalWrite = true
				assert.ErrorContains(t, ValidateStudioConnectorOperation(1, project, document, operation), "does not support")
			}
		})
	}
}

func TestStudioSourceMediaAdaptersImportActualFilesAndProtectDownloadCredentials(t *testing.T) {
	studioProductionFixture(t)
	var picture bytes.Buffer
	require.NoError(t, png.Encode(&picture, image.NewRGBA(image.Rect(0, 0, 32, 32))))
	videoPath := filepath.Join(t.TempDir(), "reference.mp4")
	command := exec.Command(studioFFmpegBinary(false), "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=32x32:rate=16", "-t", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p", videoPath)
	output, err := command.CombinedOutput()
	require.NoError(t, err, string(output))
	video, err := os.ReadFile(videoPath)
	require.NoError(t, err)
	var api *httptest.Server
	downloads := map[string]int{}
	api = httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		parts := strings.SplitN(strings.TrimPrefix(request.URL.Path, "/"), "/", 2)
		provider := parts[0]
		resource := ""
		if len(parts) > 1 {
			resource = "/" + parts[1]
		}
		if resource == "/redirect" {
			writer.Header().Set("Location", "https://unexpected-provider.invalid/private-file")
			writer.WriteHeader(http.StatusFound)
			return
		}
		if resource == "/binary" {
			assert.Empty(t, request.Header.Get("Authorization"))
			if provider == "baidu" {
				assert.Equal(t, "media-test-token", request.URL.Query().Get("access_token"))
				assert.Equal(t, "pan.baidu.com", request.UserAgent())
			}
			downloads[provider]++
			if provider == "vimeo" {
				writer.Header().Set("Content-Type", "video/mp4")
				writer.Write(video)
			} else {
				writer.Header().Set("Content-Type", "image/png")
				writer.Write(picture.Bytes())
			}
			return
		}
		writer.Header().Set("Content-Type", "application/json")
		link := api.URL + "/" + provider + "/binary"
		switch provider {
		case "unsplash":
			if strings.HasSuffix(resource, "/download") {
				encoded, _ := common.Marshal(map[string]string{"url": link})
				writer.Write(encoded)
			} else {
				fmt.Fprint(writer, `{"id":"123","description":"Garden","user":{"name":"Test photographer"}}`)
			}
		case "vimeo":
			if resource == "/me" {
				fmt.Fprint(writer, `{"uri":"/users/owner"}`)
			} else {
				encoded, _ := common.Marshal(map[string]any{"uri": "/videos/123", "name": "Reference", "user": map[string]string{"uri": "/users/owner"}, "download": []any{map[string]string{"link": link, "type": "video/mp4"}}})
				writer.Write(encoded)
			}
		case "hubspot":
			if strings.HasSuffix(resource, "/signed-url") {
				encoded, _ := common.Marshal(map[string]string{"url": link})
				writer.Write(encoded)
			} else {
				fmt.Fprint(writer, `{"id":"123","name":"Reference","extension":"png","parentFolderId":"root"}`)
			}
		case "baidu":
			assert.Equal(t, "1", request.URL.Query().Get("dlink"))
			encoded, _ := common.Marshal(map[string]any{"errno": 0, "list": []any{map[string]any{"fs_id": 123, "path": "/root/reference.png", "server_filename": "reference.png", "dlink": link}}})
			writer.Write(encoded)
		default:
			writer.WriteHeader(404)
		}
	}))
	defer api.Close()
	originalOrigin, originalClient := studioConnectorOrigin, studioConnectorHTTPClient
	studioConnectorOrigin = func(provider string) string { return api.URL + "/" + provider }
	studioConnectorHTTPClient = api.Client
	t.Cleanup(func() { studioConnectorOrigin, studioConnectorHTTPClient = originalOrigin, originalClient })
	t.Setenv("STUDIO_CONNECTOR_MEDIA_TOKEN", "media-test-token")
	for _, provider := range []string{"unsplash", "vimeo", "baidu", "hubspot"} {
		config := StudioConnectorConfig{Provider: provider, TokenEnv: "STUDIO_CONNECTOR_MEDIA_TOKEN", FolderID: "root"}
		if provider == "vimeo" {
			config.FolderID = ""
		}
		data, mime, name, err := studioConnectorImport(t.Context(), config, "123")
		require.NoError(t, err, provider)
		assert.NotEmpty(t, name)
		assert.Equal(t, 1, downloads[provider])
		if provider == "vimeo" {
			assert.Equal(t, video, data)
			assert.Equal(t, "video/mp4", mime)
		} else {
			assert.Equal(t, picture.Bytes(), data)
			assert.Equal(t, "image/png", mime)
		}
	}
	_, _, err = studioConnectorDownload(t.Context(), api.URL+"/baidu/redirect?access_token=media-test-token", "127.0.0.1")
	require.Error(t, err, "credential-bearing redirects must remain within the provider")
}

func mustReadConnectorTestBody(t *testing.T, reader io.Reader) []byte {
	t.Helper()
	value, err := io.ReadAll(reader)
	require.NoError(t, err)
	return value
}
func stringMustConnectorTestJSON(t *testing.T, value any) string {
	t.Helper()
	data, err := common.Marshal(value)
	require.NoError(t, err)
	return string(data)
}

func TestStudioConnectorRejectsCredentialRedirectsAndTraversal(t *testing.T) {
	for _, value := range []string{"../file.mp4", "%2e%2e/file.mp4", "a/%2e%2e/file.mp4", "a\\file.mp4", "https://other.test/file.mp4"} {
		_, err := studioConnectorResourcePath(value)
		assert.Error(t, err)
	}
	stolen := 0
	other := httptest.NewTLSServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { stolen++ }))
	defer other.Close()
	redirect := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Location", other.URL)
		writer.WriteHeader(307)
	}))
	defer redirect.Close()
	originalOrigin, originalClient := studioConnectorOrigin, studioConnectorHTTPClient
	studioConnectorOrigin = func(string) string { return redirect.URL }
	studioConnectorHTTPClient = redirect.Client
	t.Cleanup(func() { studioConnectorOrigin, studioConnectorHTTPClient = originalOrigin, originalClient })
	t.Setenv("STUDIO_CONNECTOR_TEST_TOKEN", "private-test-token")
	_, _, err := studioConnectorRequest(t.Context(), StudioConnectorConfig{Provider: "frameio", TokenEnv: "STUDIO_CONNECTOR_TEST_TOKEN"}, "GET", "/", "", nil, 100)
	assert.Error(t, err)
	assert.Zero(t, stolen)
}

func TestStudioFrameIOReviewUsesOneBasedFrameTimingAndExactTake(t *testing.T) {
	if !StudioRenderAvailable() {
		t.Skip("requires actual FFmpeg video")
	}
	studioProductionFixture(t)
	require.NoError(t, model.DB.AutoMigrate(&model.User{}, &model.StudioReviewComment{}))
	require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", 1).Updates(map[string]any{"username": "review-owner", "status": common.UserStatusEnabled}).Error)
	file := filepath.Join(t.TempDir(), "review.mp4")
	output, err := exec.Command(studioFFmpegBinary(false), "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:size=320x180:rate=24", "-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p", file).CombinedOutput()
	require.NoError(t, err, string(output))
	content, err := os.ReadFile(file)
	require.NoError(t, err)
	_, err = SaveStudioMedia(1, "review-source", "video/mp4", bytes.NewReader(content))
	require.NoError(t, err)
	var api *httptest.Server
	api = httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/original":
			assert.Empty(t, request.Header.Get("Authorization"))
			writer.Header().Set("Content-Type", "video/mp4")
			writer.Write(content)
		case "/v4/accounts/account/files/remote-file":
			response, _ := common.Marshal(map[string]any{"data": map[string]any{"name": "review.mp4", "media_type": "video/mp4", "media_links": map[string]any{"original": map[string]any{"download_url": api.URL + "/original"}}}})
			writer.Write(response)
		case "/v4/accounts/account/files/remote-file/comments":
			fmt.Fprint(writer, `{"data":[{"id":"comment-1","text":"Fix this frame","timestamp":25,"duration":12,"owner":{"name":"Reviewer"}}],"links":{}}`)
		default:
			writer.WriteHeader(404)
		}
	}))
	defer api.Close()
	originalOrigin, originalClient := studioConnectorOrigin, studioConnectorHTTPClient
	studioConnectorOrigin = func(string) string { return api.URL }
	studioConnectorHTTPClient = api.Client
	t.Cleanup(func() { studioConnectorOrigin, studioConnectorHTTPClient = originalOrigin, originalClient })
	t.Setenv("STUDIO_CONNECTOR_TEST_TOKEN", "private-test-token")
	config := StudioConnectorConfig{ID: "frameio", Provider: "frameio", OwnerID: 1, Label: "Review studio", AccountID: "account", FolderID: "folder", TokenEnv: "STUDIO_CONNECTOR_TEST_TOKEN"}
	raw, _ := common.Marshal([]StudioConnectorConfig{config})
	t.Setenv("STUDIO_CONNECTORS_JSON", string(raw))
	document := map[string]any{"id": "review-sync", "title": "Pinned review", "nodes": []any{map[string]any{"id": "clip", "data": map[string]any{"kind": "video", "title": "Shot", "prompt": "", "mediaId": "review-source", "takes": []any{map[string]any{"id": "take", "prompt": "", "createdAt": "", "status": "completed", "mediaId": "review-source"}}}}}, "edges": []any{}}
	studioCompleteTestDocument(t, document)
	raw, _ = common.Marshal(document)
	project, err := model.SaveStudioProject(1, "review-sync", "Pinned review", 0, string(raw))
	require.NoError(t, err)
	operation := &StudioMediaOperation{ConnectorID: config.ID, Action: "sync_review", NodeID: "clip", TakeID: "take", MediaID: "review-source", ExternalResourceID: "remote-file"}
	job, err := QueueStudioWorkflow(1, project.ID, "review-import", "connector", project.Revision, 0, nil, nil, operation)
	require.NoError(t, err)
	var plan StudioWorkflowPlan
	require.NoError(t, common.Unmarshal([]byte(job.Plan), &plan))
	require.NoError(t, RunStudioConnector(t.Context(), job, project, &plan))
	var comments []model.StudioReviewComment
	require.NoError(t, model.DB.Find(&comments).Error)
	require.Len(t, comments, 1)
	assert.InDelta(t, 1, comments[0].Seconds, .0001)
	assert.Equal(t, "take", comments[0].TakeID)
	assert.Contains(t, comments[0].Message, "0.500 seconds")
	second, err := QueueStudioWorkflow(1, project.ID, "review-import-second", "connector", project.Revision, 0, nil, nil, operation)
	require.NoError(t, err)
	require.NoError(t, RunStudioConnector(t.Context(), second, project, &plan))
	var count int64
	require.NoError(t, model.DB.Model(&model.StudioReviewComment{}).Count(&count).Error)
	assert.Equal(t, int64(1), count)
	content = []byte("different external bytes")
	third, err := QueueStudioWorkflow(1, project.ID, "review-import-third", "connector", project.Revision, 0, nil, nil, operation)
	require.NoError(t, err)
	assert.ErrorContains(t, RunStudioConnector(t.Context(), third, project, &plan), "differs")
	model.DB.Model(&model.User{}).Where("id = ?", 1).Update("status", common.UserStatusDisabled)
	assert.ErrorContains(t, RunStudioConnector(t.Context(), third, project, &plan), "account is unavailable")
}
