package service

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func TestStudioStorageWriteProbeRejectsReadOnlyStoreBeforeQueueingInference(t *testing.T) {
	studioProductionFixture(t)
	writes := 0
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPut {
			writes++
			w.WriteHeader(507)
			return
		}
		w.WriteHeader(200)
	}))
	defer remote.Close()
	t.Setenv("TASK_ARTIFACT_STORE_MODE", "s3")
	t.Setenv("TASK_ARTIFACT_STORE_S3_ENDPOINT", remote.URL)
	t.Setenv("TASK_ARTIFACT_STORE_S3_BUCKET", "fixture")
	t.Setenv("TASK_ARTIFACT_STORE_S3_REGION", "us-east-1")
	t.Setenv("TASK_ARTIFACT_STORE_S3_ACCESS_KEY", "fixture-access")
	t.Setenv("TASK_ARTIFACT_STORE_S3_SECRET_KEY", "fixture-secret")
	require.False(t, StudioStorageWritable())
	require.False(t, StudioStorageWritable())
	require.Equal(t, 1, writes, "readiness failures must be cached, not repeatedly write garbage")
	var jobs int64
	raw, err := common.Marshal(map[string]any{"id": "storage-blocked", "title": "Owned", "nodes": []any{map[string]any{"id": "image", "type": "studio", "position": map[string]any{"x": 0, "y": 0}, "data": map[string]any{"kind": "image", "title": "Image", "prompt": "A fox", "model": "flux.2-klein-4b"}}}, "edges": []any{}})
	require.NoError(t, err)
	require.NoError(t, model.DB.Create(&model.StudioProject{ID: "storage-blocked", OwnerID: 1, Revision: 1, Document: model.StudioDocument(raw)}).Error)
	_, err = QueueScheduledStudioWorkflow(1, "storage-blocked", "storage-request", "generate", 1, 100, 0, []string{"image"}, nil, nil)
	require.EqualError(t, err, StudioStorageUnavailable)
	require.NoError(t, model.DB.Model(&model.StudioWorkflowJob{}).Count(&jobs).Error)
	require.Zero(t, jobs)
}

func TestStudioStorageFailureRetainsPrivateReceiptAndResumeDoesNotRegenerate(t *testing.T) {
	studioProductionFixture(t)
	ready := false
	writes := 0
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPut {
			writes++
			if !ready {
				w.WriteHeader(503)
				return
			}
		}
		w.WriteHeader(200)
	}))
	defer remote.Close()
	t.Setenv("TASK_ARTIFACT_STORE_MODE", "s3")
	t.Setenv("TASK_ARTIFACT_STORE_S3_ENDPOINT", remote.URL)
	t.Setenv("TASK_ARTIFACT_STORE_S3_BUCKET", "fixture")
	t.Setenv("TASK_ARTIFACT_STORE_S3_REGION", "us-east-1")
	t.Setenv("TASK_ARTIFACT_STORE_S3_ACCESS_KEY", "fixture-access")
	t.Setenv("TASK_ARTIFACT_STORE_S3_SECRET_KEY", "fixture-secret")
	raw, err := common.Marshal(map[string]any{"id": "receipt-recovery", "title": "Owned", "nodes": []any{}, "edges": []any{}})
	require.NoError(t, err)
	require.NoError(t, model.DB.Create(&model.StudioProject{ID: "receipt-recovery", OwnerID: 1, Revision: 1, Document: model.StudioDocument(raw)}).Error)
	body := []byte(`{"created":1,"data":[{"b64_json":"actual-model-response"}]}`)
	_, err = SaveStudioMedia(1, "receipt-owned-request", "application/json", bytes.NewReader(body))
	require.Error(t, err)
	retained, err := GetStudioMedia(1, "receipt-owned-request")
	require.NoError(t, err)
	file, err := StudioMediaPath(retained)
	require.NoError(t, err)
	cached, err := os.ReadFile(file)
	require.NoError(t, err)
	require.Equal(t, body, cached)
	progress := StudioWorkflowProgress{RequestID: "owned-request"}
	job := model.StudioWorkflowJob{UserID: 1, ProjectID: "receipt-recovery"}
	require.NoError(t, ReconcileStudioRelayReceipt(&job, &progress))
	require.Equal(t, "responded", progress.Phase)
	require.Equal(t, "receipt-owned-request", progress.ResponseMediaID)
	require.Error(t, ReconcileStudioRelayReceipt(&model.StudioWorkflowJob{UserID: 2, ProjectID: job.ProjectID}, &StudioWorkflowProgress{RequestID: "owned-request"}))
	ready = true
	response, err := LoadStudioRelayReceipt(1, progress.ResponseMediaID)
	require.NoError(t, err)
	require.Equal(t, body, response.Body)
	require.Equal(t, 2, writes, "resume uploads the retained response without invoking a model")
	var record model.StudioMedia
	require.NoError(t, model.DB.Where("owner_id = ? AND media_id = ?", 1, progress.ResponseMediaID).First(&record).Error)
	require.True(t, strings.HasPrefix(record.ObjectKey, "s3://"))
}
