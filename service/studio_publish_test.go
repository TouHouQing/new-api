package service

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"image"
	_ "image/jpeg"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func studioPublicationFixture(t *testing.T) StudioPublicationRequest {
	t.Helper()
	studioProductionFixture(t)
	require.NoError(t, model.DB.AutoMigrate(&model.StudioProductionRecord{}))
	video := filepath.Join(t.TempDir(), "finished.mp4")
	output, err := exec.Command(studioFFmpegBinary(false), "-f", "lavfi", "-i", "color=c=blue:s=64x64:d=0.2", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", video).CombinedOutput()
	require.NoError(t, err, string(output))
	file, err := os.Open(video)
	require.NoError(t, err)
	_, err = SaveStudioMedia(1, "finished-video", "video/mp4", file)
	file.Close()
	require.NoError(t, err)
	_, err = model.SaveStudioProject(1, "film", "Film", 0, `{"id":"film","title":"Film","nodes":[{"id":"finished","type":"studio","position":{"x":0,"y":0},"data":{"kind":"video","title":"Finished","prompt":"Final","mediaId":"finished-video","status":"completed"}}],"edges":[],"createdAt":"2026-10-18","updatedAt":"2026-10-18"}`)
	require.NoError(t, err)
	require.NoError(t, LinkStudioProjectMedia("film", "finished-video"))
	result, err := common.Marshal(map[string]any{"media_id": "finished-video", "subtitles": "1\n00:00:00,000 --> 00:00:00,200\nHello\n", "duration": 0.2})
	require.NoError(t, err)
	require.NoError(t, model.DB.Create(&model.StudioWorkflowJob{ID: "rendered", ProjectID: "film", UserID: 1, RequestID: "rendered", Kind: "render", Status: "succeeded", Revision: 1, Result: model.StudioDocument(result), Plan: "{}"}).Error)
	kids, synthetic := false, true
	return StudioPublicationRequest{ID: "publication-test", ProjectRevision: 1, RenderJobID: "rendered", Platform: "douyin", Title: "A real finished film", Visibility: "private", CaptionLanguage: "en", MadeForKids: &kids, SyntheticMedia: &synthetic}
}
func runStudioPublicationTestJob(t *testing.T, job *model.StudioWorkflowJob) error {
	t.Helper()
	project, _, err := model.StudioProjectAccess(model.DB, job.UserID, job.ProjectID, false)
	require.NoError(t, err)
	var plan StudioWorkflowPlan
	require.NoError(t, common.Unmarshal([]byte(job.Plan), &plan))
	return RunStudioPublish(t.Context(), job, project, &plan)
}
func TestStudioPublicationBuildsFourRealPackagesWithoutCredentials(t *testing.T) {
	request := studioPublicationFixture(t)
	publication, err := CreateStudioPublication(1, "film", request)
	require.NoError(t, err)
	assert.Equal(t, "verification_blocked", publication.Verification)
	_, err = CreateStudioPublication(2, "film", request)
	require.ErrorIs(t, err, model.ErrStudioAccess)
	job, err := QueueStudioPublication(1, "film", publication.ID, "package", "ignored-stable-id")
	require.NoError(t, err)
	assert.Zero(t, job.Budget)
	assert.Zero(t, job.TokenID)
	require.NoError(t, runStudioPublicationTestJob(t, job))
	publication, _, err = ReadStudioPublication(1, "film", publication.ID)
	require.NoError(t, err)
	require.Len(t, publication.Packages, 4)
	assert.Equal(t, "packages_ready", publication.State)
	assert.Equal(t, "verification_blocked", publication.Verification)
	storage, err := StudioStorageRoot()
	require.NoError(t, err)
	workdirs, err := os.ReadDir(filepath.Join(storage, "cache", "work"))
	require.NoError(t, err)
	require.Len(t, workdirs, 1)
	manifestBytes, err := os.ReadFile(filepath.Join(storage, "cache", "work", workdirs[0].Name(), studioCacheManifestName))
	require.NoError(t, err)
	var cacheOwnership StudioCacheOwnership
	require.NoError(t, common.Unmarshal(manifestBytes, &cacheOwnership))
	assert.Equal(t, "publication-packages", cacheOwnership.Purpose)
	assert.Equal(t, "succeeded", cacheOwnership.State)
	assert.Equal(t, job.ID, cacheOwnership.JobID)
	assert.InDelta(t, time.Now().Add(StudioCacheRetentionPolicy().SuccessAge).Unix(), cacheOwnership.ExpiresAt, 3)
	dimensions := map[string][2]int{"youtube": {1280, 720}, "douyin": {720, 1280}, "xiaohongshu": {720, 960}, "bilibili": {1280, 720}}
	for platform, id := range publication.Packages {
		media, err := GetStudioMedia(1, id)
		require.NoError(t, err)
		path, err := StudioMediaPath(media)
		require.NoError(t, err)
		archive, err := zip.OpenReader(path)
		require.NoError(t, err)
		entries := map[string][]byte{}
		for _, entry := range archive.File {
			reader, err := entry.Open()
			require.NoError(t, err)
			content, err := io.ReadAll(reader)
			reader.Close()
			require.NoError(t, err)
			entries[entry.Name] = content
		}
		archive.Close()
		require.Len(t, entries, 7)
		assert.Contains(t, string(entries["subtitles.srt"]), "Hello")
		var manifest map[string]any
		require.NoError(t, common.Unmarshal(entries["manifest.json"], &manifest))
		assert.Equal(t, false, manifest["direct_publish_verified"])
		assert.Equal(t, publication.SourceDigest, manifest["source_sha256"])
		checksum := sha256.Sum256(entries["film.mp4"])
		assert.Equal(t, hex.EncodeToString(checksum[:]), manifest["video_sha256"])
		frame, _, err := image.DecodeConfig(bytes.NewReader(entries["cover.jpg"]))
		require.NoError(t, err)
		assert.Equal(t, dimensions[platform][0], frame.Width)
		assert.Equal(t, dimensions[platform][1], frame.Height)
		output := filepath.Join(t.TempDir(), platform+".mp4")
		require.NoError(t, os.WriteFile(output, entries["film.mp4"], 0600))
		probe, err := ProbeStudioMedia(t.Context(), output)
		require.NoError(t, err)
		assert.Equal(t, frame.Width, probe.Width)
		assert.Equal(t, frame.Height, probe.Height)
	}
	_, err = ConfirmStudioPublication(1, "film", publication.ID, publication.Fingerprint, true)
	require.Error(t, err)
}

type studioPublicationRoundTripper func(*http.Request) (*http.Response, error)

func (call studioPublicationRoundTripper) RoundTrip(request *http.Request) (*http.Response, error) {
	return call(request)
}
func TestStudioPublicationResumesLostFinalResponseWithoutDuplicatingUploadAndKeepsMissingMetricsUnknown(t *testing.T) {
	request := studioPublicationFixture(t)
	request.Platform = "youtube"
	request.ConnectorID = "youtube-account"
	t.Setenv("STUDIO_CONNECTOR_PUBLISH_TEST", "private-test-token")
	configs, _ := common.Marshal([]StudioConnectorConfig{{ID: "youtube-account", Provider: "youtube", OwnerID: 1, Label: "Own YouTube", AccountID: "channel-one", TokenEnv: "STUDIO_CONNECTOR_PUBLISH_TEST", ExpiresAt: time.Now().Add(time.Hour).Unix()}})
	t.Setenv("STUDIO_CONNECTORS_JSON", string(configs))
	original := studioConnectorHTTPClient
	t.Cleanup(func() { studioConnectorHTTPClient = original })
	starts, uploads, queries := 0, 0, 0
	studioConnectorHTTPClient = func() *http.Client {
		return &http.Client{Transport: studioPublicationRoundTripper(func(call *http.Request) (*http.Response, error) {
			assert.Equal(t, "www.googleapis.com", call.URL.Host)
			assert.Equal(t, "Bearer private-test-token", call.Header.Get("Authorization"))
			status, body := 200, `{}`
			headers := http.Header{}
			switch {
			case strings.Contains(call.URL.Path, "/channels"):
				body = `{"items":[{"id":"channel-one"}]}`
			case call.Method == "POST" && call.URL.Path == "/upload/youtube/v3/videos":
				starts++
				data, readErr := io.ReadAll(call.Body)
				require.NoError(t, readErr)
				var metadata map[string]any
				require.NoError(t, common.Unmarshal(data, &metadata))
				assert.NotContains(t, metadata["snippet"], "tags")
				assert.Equal(t, false, metadata["status"].(map[string]any)["selfDeclaredMadeForKids"])
				assert.Equal(t, true, metadata["status"].(map[string]any)["containsSyntheticMedia"])
				headers.Set("Location", "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=private-upload-session")
			case call.Method == "PUT" && strings.HasPrefix(call.Header.Get("Content-Range"), "bytes */"):
				queries++
				status = 201
				body = `{"id":"remote-one"}`
			case call.Method == "PUT":
				uploads++
				_, err := io.ReadAll(call.Body)
				require.NoError(t, err)
				return nil, errors.New("connection lost after all video bytes arrived")
			case strings.Contains(call.URL.Path, "/thumbnails/set"):
			case call.Method == "POST" && strings.Contains(call.URL.Path, "/captions"):
				body = `{"id":"caption-one"}`
			case call.URL.Path == "/youtube/v3/videos":
				body = `{"items":[{"id":"remote-one","snippet":{"channelId":"channel-one"},"status":{"uploadStatus":"processed","privacyStatus":"private"},"statistics":{"viewCount":"17","commentCount":"0"}}]}`
			default:
				t.Fatalf("unexpected provider call: %s %s", call.Method, call.URL.Path)
			}
			return &http.Response{StatusCode: status, Header: headers, Body: io.NopCloser(strings.NewReader(body)), Request: call}, nil
		})}
	}
	publication, err := CreateStudioPublication(1, "film", request)
	require.NoError(t, err)
	_, err = QueueStudioPublication(1, "film", publication.ID, "publish", "ignored")
	require.Error(t, err)
	_, err = ConfirmStudioPublication(1, "film", publication.ID, "wrong", true)
	require.Error(t, err)
	publication, err = ConfirmStudioPublication(1, "film", publication.ID, publication.Fingerprint, true)
	require.NoError(t, err)
	job, err := QueueStudioPublication(1, "film", publication.ID, "publish", "ignored")
	require.NoError(t, err)
	require.Error(t, runStudioPublicationTestJob(t, job))
	current, _, err := ReadStudioPublication(1, "film", publication.ID)
	require.NoError(t, err)
	assert.Equal(t, "uncertain", current.State)
	publicJSON, err := common.Marshal(current)
	require.NoError(t, err)
	assert.NotContains(t, string(publicJSON), "private-test-token")
	assert.NotContains(t, string(publicJSON), "private-upload-session")
	job, err = QueueStudioPublication(1, "film", publication.ID, "publish", "ignored")
	require.NoError(t, err)
	require.NoError(t, runStudioPublicationTestJob(t, job))
	assert.Equal(t, 1, starts)
	assert.Equal(t, 1, uploads)
	assert.Equal(t, 1, queries)
	metrics, err := QueueStudioPublication(1, "film", publication.ID, "metrics", "fetch-real-shape-metrics")
	require.NoError(t, err)
	require.NoError(t, runStudioPublicationTestJob(t, metrics))
	current, _, err = ReadStudioPublication(1, "film", publication.ID)
	require.NoError(t, err)
	assert.Equal(t, "uploaded_private", current.State)
	require.NotNil(t, current.Metrics)
	require.NotNil(t, current.Metrics.Views)
	assert.Equal(t, "17", *current.Metrics.Views)
	assert.Nil(t, current.Metrics.Likes)
	require.NotNil(t, current.Metrics.Comments)
	assert.Equal(t, "0", *current.Metrics.Comments)
	t.Setenv("STUDIO_CONNECTOR_PUBLISH_TEST", "")
	_, err = QueueStudioPublication(1, "film", publication.ID, "status", "expired")
	require.Error(t, err)
}
func TestStudioPublicationCancellationAndOfficialOriginGuards(t *testing.T) {
	request := studioPublicationFixture(t)
	publication, err := CreateStudioPublication(1, "film", request)
	require.NoError(t, err)
	job, err := QueueStudioPublication(1, "film", publication.ID, "package", "ignored")
	require.NoError(t, err)
	publication, err = CancelStudioPublication(1, "film", publication.ID)
	require.NoError(t, err)
	assert.Equal(t, "cancelled", publication.State)
	require.NoError(t, model.DB.First(job, "id = ?", job.ID).Error)
	assert.Equal(t, "cancelled", job.Status)
	for _, endpoint := range []string{"http://www.googleapis.com/youtube/v3/videos", "https://attacker.invalid/upload/youtube/v3/videos", "https://www.googleapis.com@attacker.invalid/youtube/v3/videos", "https://127.0.0.1/youtube/v3/videos", "https://www.googleapis.com:8443/youtube/v3/videos"} {
		assert.Error(t, studioYouTubeEndpoint(endpoint))
	}
	assert.NoError(t, studioYouTubeEndpoint("https://www.googleapis.com/upload/youtube/v3/videos?upload_id=private"))
	_, err = studioYouTubeUploadedOffset("bytes=0-999", 10)
	require.Error(t, err)
}

func TestStudioPublicationScheduledCancellationUsesDurableQueueEvenWithoutPublicJobCheckpoint(t *testing.T) {
	request := studioPublicationFixture(t)
	request.Platform = "youtube"
	request.ConnectorID = "youtube-account"
	request.ID = strings.Repeat("s", 80)
	request.ScheduleAt = time.Now().Add(time.Hour).Unix()
	t.Setenv("STUDIO_CONNECTOR_PUBLISH_TEST", "private-test-token")
	configs, err := common.Marshal([]StudioConnectorConfig{{ID: "youtube-account", Provider: "youtube", OwnerID: 1, Label: "Own YouTube", AccountID: "channel-one", TokenEnv: "STUDIO_CONNECTOR_PUBLISH_TEST", ExpiresAt: time.Now().Add(2 * time.Hour).Unix()}})
	require.NoError(t, err)
	t.Setenv("STUDIO_CONNECTORS_JSON", string(configs))
	original := studioConnectorHTTPClient
	t.Cleanup(func() { studioConnectorHTTPClient = original })
	studioConnectorHTTPClient = func() *http.Client {
		t.Fatal("preparing, confirming and cancelling a scheduled publication must not call the external provider")
		return nil
	}
	publication, err := CreateStudioPublication(1, "film", request)
	require.NoError(t, err)
	publication, err = ConfirmStudioPublication(1, "film", publication.ID, publication.Fingerprint, true)
	require.NoError(t, err)
	job, err := QueueStudioPublication(1, "film", publication.ID, "publish", "ignored")
	require.NoError(t, err)
	assert.Equal(t, request.ScheduleAt, job.RunAfter)
	assert.LessOrEqual(t, len(job.RequestID), 128)
	assert.Zero(t, job.Budget)
	publication, record, err := ReadStudioPublication(1, "film", publication.ID)
	require.NoError(t, err)
	assert.Equal(t, "scheduled", publication.State)
	// Simulate losing the response before a caller has a job checkpoint. The
	// durable queue, rather than the UI's remembered IDs, remains authoritative.
	publication.Jobs = map[string]string{}
	require.NoError(t, saveStudioPublication(record, publication))
	publication, err = CancelStudioPublication(1, "film", publication.ID)
	require.NoError(t, err)
	assert.Equal(t, "cancelled", publication.State)
	assert.Empty(t, publication.ConfirmedFingerprint)
	_, err = ConfirmStudioPublication(1, "film", publication.ID, publication.Fingerprint, true)
	require.ErrorContains(t, err, "stopped or missed its schedule")
	require.NoError(t, model.DB.First(job, "id = ?", job.ID).Error)
	assert.Equal(t, "cancelled", job.Status)
}

func TestStudioPublicationRejectsModifiedSourceBytesBeforeBuildingDeliveryArtifacts(t *testing.T) {
	request := studioPublicationFixture(t)
	publication, err := CreateStudioPublication(1, "film", request)
	require.NoError(t, err)
	job, err := QueueStudioPublication(1, "film", publication.ID, "package", "ignored")
	require.NoError(t, err)
	media, err := GetStudioMedia(1, publication.MediaID)
	require.NoError(t, err)
	path, err := StudioMediaPath(media)
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(path, []byte("changed outside the media API"), 0600))
	require.ErrorContains(t, runStudioPublicationTestJob(t, job), "differ from the frozen publication")
	publication, _, err = ReadStudioPublication(1, "film", publication.ID)
	require.NoError(t, err)
	assert.Empty(t, publication.Packages)
}
