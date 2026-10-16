package service

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"image"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func studioProductionFixture(t *testing.T, seedOwner ...bool) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "studio.db")), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.UserSubscription{}, &model.StudioProject{}, &model.StudioProjectVersion{}, &model.StudioProjectMember{}, &model.StudioMedia{}, &model.StudioProjectMediaLink{}, &model.StudioWorkflowJob{}, &model.StudioWorkflowCharge{}, &model.StudioWorkflowEvent{}, &model.StudioAttempt{}, &model.Token{}, &model.Task{}))
	if len(seedOwner) == 0 || seedOwner[0] {
		require.NoError(t, db.Create(&model.User{Id: 1, Username: "studio-test-owner", Quota: 10_000_000, Role: common.RoleCommonUser, Status: common.UserStatusEnabled}).Error)
	}
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	original, relay := model.DB, StudioWorkflowRelay
	model.DB = db
	t.Cleanup(func() { model.DB, StudioWorkflowRelay = original, relay; sqlDB.Close() })
	t.Setenv("STUDIO_STORAGE_DIR", t.TempDir())
	t.Setenv("TASK_ARTIFACT_STORE_MODE", "upstream")
}

func TestStudioSongDurationIncludesLastLineAndRejectsOverpackedLyrics(t *testing.T) {
	require.Equal(t, 15, StudioSongDuration("Hello my friend\nWe walk together\nHere in the sunlight\nFriends forever"))
	require.Equal(t, 16, StudioSongDuration("小狐狸走过森林\n蓝色灯笼照亮家园"))
	require.Greater(t, StudioSongDuration(strings.Repeat("We walk together\n", 50)), 30)
}

func TestStudioStoppedWorkflowReleasesWorkerAndRetainsUpstreamReceipt(t *testing.T) {
	for _, status := range []string{"paused", "cancelled"} {
		t.Run(status, func(t *testing.T) {
			studioProductionFixture(t)
			job := model.StudioWorkflowJob{ID: "stopped", UserID: 1, ProjectID: "film", RequestID: "job-request", Kind: "generate", Status: status, Plan: "{}", Result: `{"task_id":"in-flight","completed":["image"]}`}
			require.NoError(t, model.DB.Create(&job).Error)
			task := model.Task{TaskID: "in-flight", UserId: 1, Status: model.TaskStatusInProgress}
			require.NoError(t, model.DB.Create(&task).Error)
			ctx, cancel := context.WithTimeout(context.Background(), time.Second)
			defer cancel()
			require.ErrorIs(t, waitStudioTask(ctx, &job, task.TaskID), context.Canceled)
			require.NoError(t, model.DB.First(&task, "task_id = ?", task.TaskID).Error)
			assert.EqualValues(t, model.TaskStatusInProgress, task.Status)
			require.NoError(t, model.DB.First(&job, "id = ?", job.ID).Error)
			assert.Equal(t, status, job.Status)
			assert.Contains(t, string(job.Result), "in-flight")
			assert.Contains(t, string(job.Result), "image")
		})
	}
}

func TestStudioZeroCreditRejectsGenerationWithoutCreatingJobOrToken(t *testing.T) {
	studioProductionFixture(t)
	require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", 1).Update("quota", 0).Error)
	project, err := model.SaveStudioProject(1, "no-credit", "Film", 0, `{"id":"no-credit","title":"Film","nodes":[{"id":"text","data":{"kind":"text","model":"qwen3.5:9b","prompt":"Hello"}}],"edges":[]}`)
	require.NoError(t, err)
	job, err := QueueStudioWorkflow(1, project.ID, "no-credit-request", "generate", project.Revision, 1000, []string{"text"}, nil)
	require.ErrorIs(t, err, ErrStudioGenerationCredit)
	assert.Nil(t, job)
	var jobs, tokens int64
	require.NoError(t, model.DB.Model(&model.StudioWorkflowJob{}).Count(&jobs).Error)
	require.NoError(t, model.DB.Model(&model.Token{}).Count(&tokens).Error)
	assert.Zero(t, jobs)
	assert.Zero(t, tokens)
	free, err := QueueStudioWorkflow(1, project.ID, "free-quality-request", "quality", project.Revision, 0, nil, nil)
	require.NoError(t, err)
	assert.NotNil(t, free)
}

func TestStudioSongPlanValidatesLyricsAndRetainsZeroSeed(t *testing.T) {
	studioProductionFixture(t)
	document := map[string]any{"nodes": []any{map[string]any{"id": "music-node", "data": map[string]any{"kind": "audio"}}}}
	seed := int64(0)
	valid := StudioMediaOperation{NodeID: "music-node", Action: "music", Model: "studio-music", Seconds: 30, Prompt: "Original song", Options: &StudioToolOptions{MusicMode: "song", Lyrics: "星光落在肩上", BPM: 100, Seed: &seed}}
	require.NoError(t, ValidateStudioMediaOperation(1, document, &valid))
	raw, err := common.Marshal(valid.Options)
	require.NoError(t, err)
	assert.Contains(t, string(raw), `"seed":0`)
	for _, options := range []StudioToolOptions{{MusicMode: "song"}, {MusicMode: "instrumental", Lyrics: "words"}, {MusicMode: "song", Lyrics: "words", BPM: 241}} {
		invalid := valid
		invalid.Options = &options
		assert.Error(t, ValidateStudioMediaOperation(1, document, &invalid))
	}
}

func TestStudioMediaToolsRejectGenericGenerationBeforeDependencies(t *testing.T) {
	studioProductionFixture(t)
	document := `{"id":"tool-film","title":"Film","nodes":[{"id":"reference","data":{"kind":"image","model":"flux.2-klein-4b"}},{"id":"music","data":{"kind":"audio","model":"studio-music"}}],"edges":[{"id":"ref","source":"reference","target":"music"}]}`
	project, err := model.SaveStudioProject(1, "tool-film", "Film", 0, document)
	require.NoError(t, err)
	job, err := QueueStudioWorkflow(1, project.ID, "generic-music", "generate", project.Revision, 100, []string{"music"}, nil)
	require.ErrorContains(t, err, "reopen the media production tool")
	assert.Nil(t, job)
	var count int64
	require.NoError(t, model.DB.Model(&model.StudioWorkflowJob{}).Count(&count).Error)
	assert.Zero(t, count)
}

func TestStudioRejectedAudioBlocksDeliveryButAllowsPreviewAndReplacement(t *testing.T) {
	document := map[string]any{"nodes": []any{map[string]any{"id": "clip", "data": map[string]any{"kind": "video"}}}, "shots": []any{map[string]any{"id": "shot", "videoNodeId": "clip"}}, "production": map[string]any{"dialogueCues": []any{map[string]any{"shotId": "shot", "audioMediaId": "rejected"}}, "reviews": []any{map[string]any{"mediaId": "rejected", "status": "retake"}}}}
	for _, plan := range []*StudioRenderPlan{
		{Package: true, Audio: []StudioRenderAudio{{MediaID: "rejected"}}},
		{RequireApproved: true, Clips: []StudioRenderClip{{NodeID: "clip", VoiceoverMediaID: "rejected"}}},
		{Package: true, Clips: []StudioRenderClip{{NodeID: "clip"}}},
	} {
		require.ErrorContains(t, ValidateStudioDeliveryAudioReviews(document, plan), "rejected audio")
	}
	require.NoError(t, ValidateStudioDeliveryAudioReviews(document, &StudioRenderPlan{Audio: []StudioRenderAudio{{MediaID: "rejected"}}}))
	require.NoError(t, ValidateStudioDeliveryAudioReviews(document, &StudioRenderPlan{Package: true, Audio: []StudioRenderAudio{{MediaID: "replacement"}}}))
	production := document["production"].(map[string]any)
	production["reviews"] = append(production["reviews"].([]any), map[string]any{"mediaId": "rejected", "status": "approved"})
	require.NoError(t, ValidateStudioDeliveryAudioReviews(document, &StudioRenderPlan{Package: true, Audio: []StudioRenderAudio{{MediaID: "rejected"}}}))
}

func TestStudioLocalVideoPreflightRejectsBeforeDependencyGeneration(t *testing.T) {
	studioProductionFixture(t)
	for index, input := range []struct {
		seconds         float64
		metadata, patch string
	}{{15, "", ""}, {5, "", `{"duration":11}`}, {5, `{"frames":8}`, ""}, {5, `{"fps":25}`, ""}, {5, "", `{"metadata":{"fps":true}}`}, {5, "", `{"metadata":{"width":65}}`}} {
		document := map[string]any{"id": "local-video", "title": "Film", "nodes": []any{map[string]any{"id": "image", "data": map[string]any{"kind": "image", "model": "flux.2-klein-4b"}}, map[string]any{"id": "video", "data": map[string]any{"kind": "video", "model": "wan2.2-ti2v-5b", "seconds": input.seconds, "metadataJson": input.metadata, "payloadPatchJson": input.patch}}}, "edges": []any{map[string]any{"id": "ref", "source": "image", "target": "video"}}}
		raw, err := common.Marshal(document)
		require.NoError(t, err)
		project, err := model.SaveStudioProject(1, "local-video", "Film", int64(index), string(raw))
		require.NoError(t, err)
		job, err := QueueStudioWorkflow(1, project.ID, fmt.Sprintf("invalid-%d", index), "generate", project.Revision, 100, []string{"video"}, nil)
		require.Error(t, err)
		assert.Nil(t, job)
		var jobs int64
		require.NoError(t, model.DB.Model(&model.StudioWorkflowJob{}).Count(&jobs).Error)
		assert.Zero(t, jobs, "invalid downstream settings must not queue an upstream image request")
	}
}

func TestStudioVaceLimitsRejectBeforeDependencyGeneration(t *testing.T) {
	studioProductionFixture(t)
	for index, data := range []map[string]any{
		{"seconds": float64(31)},
		{"seconds": float64(12)},
		{"metadataJson": `{"frames":485}`},
		{"payloadPatchJson": `{"metadata":{"width":320}}`},
		{"resolution": "720p"},
	} {
		data["kind"], data["model"] = "video", "wan2.1-vace-1.3b"
		document := map[string]any{"id": "vace-video", "title": "Film", "nodes": []any{map[string]any{"id": "image", "data": map[string]any{"kind": "image", "model": "flux.2-klein-4b"}}, map[string]any{"id": "video", "data": data}}, "edges": []any{map[string]any{"id": "ref", "source": "image", "target": "video"}}}
		raw, err := common.Marshal(document)
		require.NoError(t, err)
		project, err := model.SaveStudioProject(1, "vace-video", "Film", int64(index), string(raw))
		require.NoError(t, err)
		job, err := QueueStudioWorkflow(1, project.ID, fmt.Sprintf("invalid-vace-%d", index), "generate", project.Revision, 100, []string{"video"}, nil)
		require.Error(t, err)
		assert.Nil(t, job)
	}
}

func TestStudioSharedGPUVideoDimensionsAndNativeVaceDuration(t *testing.T) {
	for _, modelName := range []string{"wan2.2-ti2v-5b", "wan2.1-vace-1.3b"} {
		data := map[string]any{"kind": "video", "model": modelName, "resolution": "384x224", "seconds": float64(10)}
		require.NoError(t, validateStudioLocalVideoConfiguration(data))
		if modelName == "wan2.1-vace-1.3b" {
			data["seconds"] = float64(30)
			data["metadataJson"] = `{"frames":481,"fps":16}`
			require.NoError(t, validateStudioLocalVideoConfiguration(data))
		}
	}
}

func TestStudioLocalReferenceCombinations(t *testing.T) {
	for _, entry := range []struct {
		model, role, parentKind string
		allowed                 bool
	}{
		{"wan2.2-ti2v-5b", "first_frame", "image", true},
		{"wan2.2-ti2v-5b", "last_frame", "image", false},
		{"wan2.2-ti2v-5b", "reference_video", "video", false},
		{"wan2.1-vace-1.3b", "last_frame", "image", true},
		{"wan2.1-vace-1.3b", "reference_image", "image", true},
		{"wan2.1-vace-1.3b", "reference_video", "video", true},
		{"wan2.1-vace-1.3b", "first_frame", "video", false},
		{"wan2.1-vace-1.3b", "reference_video", "image", false},
		{"wan2.1-vace-1.3b", "native_extend", "video", false},
		{"wan2.1-vace-1.3b", "unknown_slot", "image", false},
	} {
		document := map[string]any{"nodes": []any{map[string]any{"id": "source", "data": map[string]any{"kind": entry.parentKind}}}, "edges": []any{map[string]any{"source": "source", "target": "target", "targetHandle": entry.role}}}
		err := validateStudioLocalVideoConnections(document, "target", map[string]any{"kind": "video", "model": entry.model})
		if entry.allowed {
			require.NoError(t, err)
		} else {
			require.Error(t, err)
		}
	}
}

func TestStudioReferenceAnalysisRejectsForeignMediaAndScreenplayOverwrite(t *testing.T) {
	studioProductionFixture(t)
	_, err := SaveStudioMedia(1, "reference", "video/mp4", strings.NewReader("validation fixture"))
	require.NoError(t, err)
	data := map[string]any{"kind": "text", "purpose": "note", "derivedFrom": map[string]any{"mediaId": "reference", "action": "analyze"}}
	document := map[string]any{"nodes": []any{map[string]any{"id": "analysis", "data": data}}}
	op := &StudioMediaOperation{NodeID: "analysis", MediaID: "reference", Model: "qwen3.5:9b", Samples: 3, Dimensions: []string{"shots"}, Edit: &StudioMediaEdit{Start: 0, End: 3}}
	assert.NoError(t, ValidateStudioReferenceAnalysis(1, document, op))
	assert.Error(t, ValidateStudioReferenceAnalysis(2, document, op))
	document["shots"] = []any{map[string]any{"textNodeId": "analysis"}}
	assert.ErrorContains(t, ValidateStudioReferenceAnalysis(1, document, op), "overwrite")
	delete(document, "shots")
	data["purpose"] = "script"
	assert.Error(t, ValidateStudioReferenceAnalysis(1, document, op))
	data["purpose"] = "note"
	op.Edit.End = 61
	assert.Error(t, ValidateStudioReferenceAnalysis(1, document, op))
	op.Edit.End = 3
	op.Samples = 9
	assert.Error(t, ValidateStudioReferenceAnalysis(1, document, op))
}

func TestStudioSubtitleQualityRejectsUnreadableLayoutAndOutOfFilmTiming(t *testing.T) {
	assert.Empty(t, StudioSubtitleFindings("1\n00:00:00,000 --> 00:00:01,000\nHello\n", 2, 1920, 1080))
	findings := StudioSubtitleFindings("1\n00:00:00,000 --> 00:00:04,000\n"+strings.Repeat("字幕", 40)+"\n", 2, 1920, 1080)
	require.Len(t, findings, 2)
	assert.Equal(t, "subtitle_time_out_of_range", findings[0]["code"])
	assert.Equal(t, "subtitle_layout_overflow", findings[1]["code"])
}

func TestStudioImagePromptKeepsDialogueAndInternalAssetIDsOutOfPixels(t *testing.T) {
	node := map[string]any{"id": "frame", "data": map[string]any{"kind": "image", "model": "flux.2-klein-4b", "prompt": "Portrait"}}
	document := map[string]any{"nodes": []any{node}, "shots": []any{map[string]any{"id": "shot-internal-uuid", "imageNodeId": "frame", "dialogue": "spoken dialogue must not become pixels"}}, "assets": []any{map[string]any{"id": "hero-internal-uuid", "kind": "character", "title": "Mira", "prompt": "Blue jacket"}}, "production": map[string]any{"continuityStates": []any{map[string]any{"shotId": "shot-internal-uuid", "assetId": "hero-internal-uuid", "wardrobe": "Red scarf", "emotion": "Calm"}}}}
	raw, err := studioNodeRequest(t.Context(), 1, document, node)
	require.NoError(t, err)
	var request map[string]any
	require.NoError(t, common.Unmarshal(raw, &request))
	assert.NotContains(t, request["prompt"], "spoken dialogue must not become pixels")
	assert.NotContains(t, request["prompt"], "shot-internal-uuid")
	assert.NotContains(t, request["prompt"], "hero-internal-uuid")
	assert.Contains(t, request["prompt"], "Red scarf")
}

func studioCompleteTestDocument(t *testing.T, document map[string]any) {
	t.Helper()
	document["createdAt"], document["updatedAt"] = "2026-10-04T00:00:00Z", "2026-10-04T00:00:00Z"
	for _, node := range studioObjects(document, "nodes") {
		node["type"], node["position"] = "studio", map[string]any{"x": 0, "y": 0}
		data, _ := node["data"].(map[string]any)
		data["title"] = node["id"]
	}
}

func TestStudioWorkflowBudgetIdempotencyAndRecovery(t *testing.T) {
	studioProductionFixture(t)
	document := map[string]any{"id": "film", "title": "Film", "nodes": []any{map[string]any{"id": "script", "data": map[string]any{"kind": "text", "prompt": "A film", "model": "mock-text"}}, map[string]any{"id": "shot", "data": map[string]any{"kind": "text", "prompt": "A shot", "model": "mock-text"}}}, "edges": []any{map[string]any{"id": "edge", "source": "script", "target": "shot", "sourceHandle": "scene", "targetHandle": "brief"}}}
	studioCompleteTestDocument(t, document)
	raw, err := common.Marshal(document)
	require.NoError(t, err)
	project, err := model.SaveStudioProject(1, "film", "Film", 0, string(raw))
	require.NoError(t, err)
	_, err = QueueStudioWorkflow(1, "film", "no-budget", "generate", project.Revision, 0, []string{"shot"}, nil)
	require.Error(t, err)
	job, err := QueueStudioWorkflow(1, "film", "run-one", "generate", project.Revision, 25000, []string{"shot"}, nil)
	require.NoError(t, err)
	repeated, err := QueueStudioWorkflow(1, "film", "run-one", "generate", project.Revision, 25000, []string{"shot"}, nil)
	require.NoError(t, err)
	assert.Equal(t, job.ID, repeated.ID)
	_, err = QueueStudioWorkflow(1, "film", "run-one", "generate", project.Revision, 25001, []string{"shot"}, nil)
	require.Error(t, err)
	assert.Zero(t, job.TokenID)
	var tokens int64
	require.NoError(t, model.DB.Model(&model.Token{}).Count(&tokens).Error)
	assert.Zero(t, tokens)
	assert.EqualValues(t, 25000, job.Budget)
	calls := 0
	StudioWorkflowRelay = func(_ context.Context, _ *model.StudioWorkflowJob, kind string, body []byte) (StudioRelayResponse, error) {
		calls++
		assert.Equal(t, "text", kind)
		if calls == 2 {
			assert.Contains(t, string(body), "result-one")
		}
		text := "result-one"
		if calls == 2 {
			text = "result-two"
		}
		response, err := common.Marshal(map[string]any{"choices": []any{map[string]any{"message": map[string]string{"content": text}}}})
		require.NoError(t, err)
		return StudioRelayResponse{Status: 200, ContentType: "application/json", Body: response}, nil
	}
	RunStudioWorkflowsOnce(t.Context(), "test-worker")
	require.NoError(t, model.DB.First(job, "id = ?", job.ID).Error)
	assert.Equal(t, "succeeded", job.Status)
	assert.Equal(t, 2, calls)
	project, _, err = model.StudioProjectAccess(model.DB, 1, "film", false)
	require.NoError(t, err)
	repeated, err = QueueStudioWorkflow(1, "film", "run-one", "generate", 1, 25000, []string{"shot"}, nil)
	require.NoError(t, err)
	assert.Equal(t, job.ID, repeated.ID)
	assert.Contains(t, string(project.Document), "result-two")
	// Restart after result collection: publishing the journal must not call upstream.
	var plan StudioWorkflowPlan
	require.NoError(t, common.Unmarshal([]byte(job.Plan), &plan))
	progress := StudioWorkflowProgress{NodeID: "script", RequestID: "collected-request", Phase: "collected", Take: map[string]any{"id": "collected-request", "createdAt": time.Now().UTC().Format(time.RFC3339), "prompt": "A film", "model": "mock-text", "status": "completed", "outputText": "recovered"}}
	progressRaw, err := common.Marshal(progress)
	require.NoError(t, err)
	require.NoError(t, model.DB.Model(job).Updates(map[string]any{"status": "queued", "result": model.StudioDocument(progressRaw)}).Error)
	RunStudioWorkflowsOnce(t.Context(), "replacement-worker")
	require.NoError(t, model.DB.First(job, "id = ?", job.ID).Error)
	assert.Equal(t, "succeeded", job.Status)
	// The second node has a completed result in the live project, but the frozen
	// plan intentionally regenerates it; only the collected first node is free.
	assert.Equal(t, 3, calls)
}

func TestStudioAssistantRequestUsesStructuredWorkflowPlanWithoutChangingOrdinaryText(t *testing.T) {
	document := map[string]any{"nodes": []any{}, "edges": []any{}}
	node := map[string]any{"id": "plan", "data": map[string]any{"kind": "text", "model": "qwen3.5:9b", "prompt": "Plan a depth extraction", "assistantPlan": true}}
	raw, err := studioNodeRequest(t.Context(), 1, document, node)
	require.NoError(t, err)
	var request map[string]any
	require.NoError(t, common.Unmarshal(raw, &request))
	format := request["response_format"].(map[string]any)
	assert.Equal(t, "json_schema", format["type"])
	assert.Equal(t, "studio_production_plan", format["json_schema"].(map[string]any)["name"])
	assert.Equal(t, float64(32768), request["context_length"])
	messages := request["messages"].([]any)
	assert.Contains(t, messages[0].(map[string]any)["content"], "workflowActions")
	delete(node["data"].(map[string]any), "assistantPlan")
	raw, err = studioNodeRequest(t.Context(), 1, document, node)
	require.NoError(t, err)
	request = map[string]any{}
	require.NoError(t, common.Unmarshal(raw, &request))
	assert.NotContains(t, request, "response_format")
}

func TestStudioFrozenConfigurationRejectsChangedTimedFramesAndLayerEdits(t *testing.T) {
	for _, key := range []string{"videoKeyframes", "imageLayers"} {
		t.Run(key, func(t *testing.T) {
			kind := "video"
			if key == "imageLayers" {
				kind = "image"
			}
			frozen := map[string]any{"nodes": []any{map[string]any{"id": "output", "data": map[string]any{"kind": kind, "prompt": "Original", "model": "local"}}}}
			raw, err := common.Marshal(frozen)
			require.NoError(t, err)
			var current map[string]any
			require.NoError(t, common.Unmarshal(raw, &current))
			data := studioObjects(current, "nodes")[0]["data"].(map[string]any)
			if key == "videoKeyframes" {
				data[key] = []any{map[string]any{"time": .5, "mediaId": "new-reference"}}
			} else {
				data[key] = map[string]any{"version": 1, "width": 128, "height": 128, "layers": []any{map[string]any{"id": "caption", "kind": "text", "text": "Human edit"}}}
			}
			assert.False(t, studioWorkflowConfigurationMatches(frozen, current, "output"), "an old generation must stay a candidate when the author changes this setting")
		})
	}
}

func TestStudioScheduledWorkflowDoesNotRunEarlyOrRepeatAfterRestart(t *testing.T) {
	studioProductionFixture(t)
	document := map[string]any{"id": "scheduled-film", "title": "Film", "nodes": []any{map[string]any{"id": "script", "data": map[string]any{"kind": "text", "prompt": "Frozen original", "model": "mock-text"}}}, "edges": []any{}}
	studioCompleteTestDocument(t, document)
	raw, err := common.Marshal(document)
	require.NoError(t, err)
	project, err := model.SaveStudioProject(1, "scheduled-film", "Film", 0, string(raw))
	require.NoError(t, err)
	due := time.Now().Add(time.Hour).Unix()
	job, err := QueueScheduledStudioWorkflow(1, project.ID, "scheduled-request", "generate", project.Revision, 25000, due, []string{"script"}, nil, nil)
	require.NoError(t, err)
	repeated, err := QueueScheduledStudioWorkflow(1, project.ID, "scheduled-request", "generate", project.Revision, 25000, due, []string{"script"}, nil, nil)
	require.NoError(t, err)
	assert.Equal(t, job.ID, repeated.ID)
	_, err = QueueScheduledStudioWorkflow(1, project.ID, "scheduled-request", "generate", project.Revision, 25000, due+1, []string{"script"}, nil, nil)
	require.Error(t, err)
	_, err = QueueScheduledStudioWorkflow(1, project.ID, "invalid-time", "generate", project.Revision, 25000, time.Now().Add(8*24*time.Hour).Unix(), []string{"script"}, nil, nil)
	require.Error(t, err)
	calls := 0
	StudioWorkflowRelay = func(_ context.Context, _ *model.StudioWorkflowJob, _ string, body []byte) (StudioRelayResponse, error) {
		calls++
		assert.Contains(t, string(body), "Frozen original")
		return StudioRelayResponse{Status: 200, ContentType: "application/json", Body: []byte(`{"choices":[{"message":{"content":"Actual queued output"}}]}`)}, nil
	}
	RunStudioWorkflowsOnce(t.Context(), "before-time")
	assert.Zero(t, calls)
	require.NoError(t, model.DB.First(job, "id = ?", job.ID).Error)
	assert.Equal(t, "queued", job.Status)
	// Reopen the real SQLite file: no in-memory scheduler state is required.
	sqlDB, err := model.DB.DB()
	require.NoError(t, err)
	var files []struct{ Name, File string }
	require.NoError(t, model.DB.Raw("PRAGMA database_list").Scan(&files).Error)
	require.NoError(t, sqlDB.Close())
	reopened, err := gorm.Open(sqlite.Open(files[0].File), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	require.NoError(t, err)
	model.DB = reopened
	reopenedSQL, err := reopened.DB()
	require.NoError(t, err)
	t.Cleanup(func() { reopenedSQL.Close() })
	require.NoError(t, model.DB.Model(job).Update("run_after", time.Now().Unix()-1).Error)
	RunStudioWorkflowsOnce(t.Context(), "after-restart")
	require.NoError(t, model.DB.First(job, "id = ?", job.ID).Error)
	assert.Equal(t, "succeeded", job.Status, job.Error)
	assert.Equal(t, 1, calls)
	RunStudioWorkflowsOnce(t.Context(), "second-worker")
	assert.Equal(t, 1, calls)
}

func TestStudioShotSceneAndPropInputsPreserveConcurrentCreativeEdits(t *testing.T) {
	studioProductionFixture(t)
	pixel, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==")
	require.NoError(t, err)
	_, err = SaveStudioMedia(1, "vase-image", "image/png", bytes.NewReader(pixel))
	require.NoError(t, err)
	node := map[string]any{"id": "frame", "position": map[string]any{"x": 0}, "data": map[string]any{"kind": "image", "model": "mock-image", "prompt": "A shot", "metadataJson": `{"seed":0,"width":512,"height":512}`}}
	document := map[string]any{"nodes": []any{node}, "edges": []any{}, "shots": []any{map[string]any{"id": "shot", "imageNodeId": "frame", "camera": "Close-up", "dialogue": "Hello"}}, "production": map[string]any{
		"scenes":        []any{map[string]any{"id": "scene", "title": "Garden", "description": "Warm morning light", "shotIds": []any{"shot"}}},
		"props":         []any{map[string]any{"id": "vase", "title": "Vase", "description": "A blue vase", "mediaIds": []any{"vase-image"}}},
		"assetBindings": map[string]any{"shot": []any{"vase"}},
	}}
	request, err := studioNodeRequest(t.Context(), 1, document, node)
	require.NoError(t, err)
	var body map[string]any
	require.NoError(t, common.Unmarshal(request, &body))
	assert.Contains(t, body["prompt"], "Warm morning light")
	assert.Contains(t, body["prompt"], "A blue vase")
	assert.Contains(t, body["prompt"], "Close-up")
	assert.NotContains(t, body["prompt"], "Hello")
	assert.Len(t, body["images"], 1)
	assert.Contains(t, body["images"].([]any)[0], "data:image/png;base64,")
	assert.Equal(t, float64(0), body["metadata"].(map[string]any)["seed"])
	frozen, err := common.Marshal(document)
	require.NoError(t, err)
	for _, edit := range []string{"position", "camera", "scene", "prop"} {
		var current map[string]any
		require.NoError(t, common.Unmarshal(frozen, &current))
		switch edit {
		case "position":
			studioObjects(current, "nodes")[0]["position"] = map[string]any{"x": 400}
		case "camera":
			studioObjects(current, "shots")[0]["camera"] = "Wide shot"
		case "scene":
			studioObjects(current["production"].(map[string]any), "scenes")[0]["description"] = "Night rain"
		case "prop":
			studioObjects(current["production"].(map[string]any), "props")[0]["description"] = "A red vase"
		}
		assert.Equal(t, edit == "position", studioWorkflowConfigurationMatches(document, current, "frame"), edit)
	}
	document["assets"] = []any{map[string]any{"id": "scene", "prompt": "Current scene", "versions": []any{}}}
	node["data"].(map[string]any)["assetIds"] = []any{"scene"}
	node["data"].(map[string]any)["assetVersionIds"] = map[string]any{"scene": "missing-version"}
	_, err = studioNodeRequest(t.Context(), 1, document, node)
	require.ErrorContains(t, err, "pinned asset version is unavailable")
}

func TestStudioExplicitGenerationCreatesAnotherTakeFromACompletedNode(t *testing.T) {
	studioProductionFixture(t)
	document := map[string]any{"id": "variants", "title": "Variants", "nodes": []any{map[string]any{"id": "text", "data": map[string]any{"kind": "text", "model": "mock-text", "prompt": "A shot", "status": "completed", "outputText": "Previous"}}}, "edges": []any{}}
	studioCompleteTestDocument(t, document)
	raw, err := common.Marshal(document)
	require.NoError(t, err)
	project, err := model.SaveStudioProject(1, "variants", "Variants", 0, string(raw))
	require.NoError(t, err)
	job, err := QueueStudioWorkflow(1, project.ID, "new-variant", "generate", project.Revision, 1000, []string{"text"}, nil)
	require.NoError(t, err)
	calls := 0
	StudioWorkflowRelay = func(context.Context, *model.StudioWorkflowJob, string, []byte) (StudioRelayResponse, error) {
		calls++
		return StudioRelayResponse{Status: 200, ContentType: "application/json", Body: []byte(`{"choices":[{"message":{"content":"New variant"}}]}`)}, nil
	}
	RunStudioWorkflowsOnce(t.Context(), "variant-worker")
	require.NoError(t, model.DB.First(job, "id = ?", job.ID).Error)
	assert.Equal(t, "succeeded", job.Status, job.Error)
	assert.Equal(t, 1, calls)
	project, _, err = model.StudioProjectAccess(model.DB, 1, project.ID, false)
	require.NoError(t, err)
	assert.Contains(t, string(project.Document), "New variant")
	RunStudioWorkflowsOnce(t.Context(), "another-worker")
	assert.Equal(t, 1, calls, "the completed workflow must not submit the variant twice")
}

func TestStudioOwnGeneratedReferencesDoNotHideTargetTake(t *testing.T) {
	for _, edit := range []bool{false, true} {
		t.Run(fmt.Sprint("concurrent-edit-", edit), func(t *testing.T) {
			studioProductionFixture(t)
			document := map[string]any{"id": "reference-film", "title": "References", "nodes": []any{
				map[string]any{"id": "portrait", "data": map[string]any{"kind": "image", "model": "mock-image", "prompt": "Portrait", "linkedAssetId": "person"}},
				map[string]any{"id": "frame", "data": map[string]any{"kind": "image", "model": "mock-image", "prompt": "A shot", "assetIds": []any{"person"}}},
			}, "edges": []any{}, "assets": []any{map[string]any{"id": "person", "kind": "character", "title": "Person", "prompt": "Portrait"}}}
			studioCompleteTestDocument(t, document)
			raw, err := common.Marshal(document)
			require.NoError(t, err)
			project, err := model.SaveStudioProject(1, "reference-film", "References", 0, string(raw))
			require.NoError(t, err)
			job, err := QueueStudioWorkflow(1, project.ID, "make-frame", "generate", project.Revision, 1000, []string{"frame"}, nil)
			require.NoError(t, err)
			var pixel bytes.Buffer
			require.NoError(t, png.Encode(&pixel, image.NewRGBA(image.Rect(0, 0, 8, 8))))
			calls := 0
			StudioWorkflowRelay = func(context.Context, *model.StudioWorkflowJob, string, []byte) (StudioRelayResponse, error) {
				calls++
				if edit && calls == 2 {
					current, _, readErr := model.StudioProjectAccess(model.DB, 1, project.ID, true)
					require.NoError(t, readErr)
					var changed map[string]any
					require.NoError(t, common.Unmarshal([]byte(current.Document), &changed))
					studioObjects(changed, "nodes")[1]["data"].(map[string]any)["prompt"] = "A human revision"
					encoded, encodeErr := common.Marshal(changed)
					require.NoError(t, encodeErr)
					_, saveErr := model.SaveStudioProject(1, project.ID, project.Title, current.Revision, string(encoded))
					require.NoError(t, saveErr)
				}
				return StudioRelayResponse{Status: 200, ContentType: "application/json", Body: []byte(`{"data":[{"b64_json":"` + base64.StdEncoding.EncodeToString(pixel.Bytes()) + `"}]}`)}, nil
			}
			RunStudioWorkflowsOnce(t.Context(), "reference-worker")
			require.NoError(t, model.DB.First(job, "id = ?", job.ID).Error)
			require.Equal(t, "succeeded", job.Status, job.Error)
			require.Equal(t, 2, calls)
			current, _, err := model.StudioProjectAccess(model.DB, 1, project.ID, false)
			require.NoError(t, err)
			var restored map[string]any
			require.NoError(t, common.Unmarshal([]byte(current.Document), &restored))
			frame := studioObjects(restored, "nodes")[1]["data"].(map[string]any)
			require.Len(t, studioObjects(frame, "takes"), 1)
			if edit {
				assert.Equal(t, "A human revision", frame["prompt"])
				assert.Nil(t, frame["selectedTakeId"], "concurrent human edits must keep the generated candidate unselected")
			} else {
				assert.NotEmpty(t, frame["selectedTakeId"], "the workflow's own new reference is not a human input change")
				assert.NotEmpty(t, frame["mediaId"])
			}
		})
	}
}

func TestStudioMediaCollectionResumeDoesNotSubmitAgain(t *testing.T) {
	studioProductionFixture(t)
	document := map[string]any{"id": "media-film", "title": "Media film", "nodes": []any{map[string]any{"id": "music", "data": map[string]any{"kind": "audio", "prompt": "Music", "model": "studio-music"}}}, "edges": []any{}}
	studioCompleteTestDocument(t, document)
	raw, err := common.Marshal(document)
	require.NoError(t, err)
	project, err := model.SaveStudioProject(1, "media-film", "Media film", 0, string(raw))
	require.NoError(t, err)
	operation := &StudioMediaOperation{NodeID: "music", Model: "studio-music", Action: "music", Prompt: "Music", Seconds: 2}
	job, err := QueueStudioWorkflow(1, project.ID, "music-request", "media", project.Revision, 1000, nil, nil, operation)
	require.NoError(t, err)
	submissions, downloads := 0, 0
	StudioWorkflowRelay = func(_ context.Context, _ *model.StudioWorkflowJob, kind string, _ []byte) (StudioRelayResponse, error) {
		if kind == "production-media" {
			submissions++
			require.NoError(t, model.DB.Create(&model.Task{TaskID: "music-task", UserId: 1, Status: model.TaskStatusSuccess}).Error)
			return StudioRelayResponse{Status: 200, ContentType: "application/json", Body: []byte(`{"task_id":"music-task"}`)}, nil
		}
		assert.Equal(t, "artifact:music-task", kind)
		downloads++
		if downloads == 1 {
			return StudioRelayResponse{Status: 503}, nil
		}
		return StudioRelayResponse{Status: 200, ContentType: "audio/mpeg", Body: []byte("offline-audio")}, nil
	}
	RunStudioWorkflowsOnce(t.Context(), "first-worker")
	require.NoError(t, model.DB.First(job, "id = ?", job.ID).Error)
	assert.Equal(t, "failed", job.Status)
	require.NoError(t, model.DB.Model(job).Update("status", "queued").Error)
	RunStudioWorkflowsOnce(t.Context(), "second-worker")
	require.NoError(t, model.DB.First(job, "id = ?", job.ID).Error)
	assert.Equal(t, "succeeded", job.Status)
	assert.Equal(t, 1, submissions)
	assert.Equal(t, 2, downloads)
	project, _, err = model.StudioProjectAccess(model.DB, 1, project.ID, false)
	require.NoError(t, err)
	assert.Contains(t, string(project.Document), "music-task")
}

func TestStudioVideoDepthCollectionPublishesVideoTake(t *testing.T) {
	require.True(t, StudioRenderAvailable(), "the depth preflight regression requires real FFmpeg")
	studioProductionFixture(t)
	sourcePath := filepath.Join(t.TempDir(), "source.mp4")
	command := exec.CommandContext(t.Context(), studioFFmpegBinary(false), "-nostdin", "-v", "error", "-f", "lavfi", "-i", "color=blue:s=64x64:r=16:d=1.5625", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", sourcePath)
	output, err := command.CombinedOutput()
	require.NoError(t, err, string(output))
	source, err := os.ReadFile(sourcePath)
	require.NoError(t, err)
	_, err = SaveStudioMedia(1, "depth-source", "video/mp4", bytes.NewReader(source))
	require.NoError(t, err)
	document := map[string]any{"id": "depth-film", "title": "Depth film", "nodes": []any{
		map[string]any{"id": "source", "data": map[string]any{"kind": "video", "prompt": "Source motion", "mediaId": "depth-source"}},
		map[string]any{"id": "depth", "data": map[string]any{"kind": "video", "prompt": "Extract depth", "model": "studio-video-depth"}},
	}, "edges": []any{}}
	studioCompleteTestDocument(t, document)
	raw, err := common.Marshal(document)
	require.NoError(t, err)
	project, err := model.SaveStudioProject(1, "depth-film", "Depth film", 0, string(raw))
	require.NoError(t, err)
	operation := &StudioMediaOperation{NodeID: "depth", Model: "studio-video-depth", Action: "video_depth", Seconds: 1, ReferenceMediaIDs: []string{"depth-source"}}
	operation.Seconds = 2
	_, err = QueueStudioWorkflow(1, project.ID, "extract-depth-too-long", "media", project.Revision, 1000, nil, nil, operation)
	require.ErrorContains(t, err, "Requested duration exceeds the source video")
	var rejectedJobs int64
	require.NoError(t, model.DB.Model(&model.StudioWorkflowJob{}).Where("request_id = ?", "extract-depth-too-long").Count(&rejectedJobs).Error)
	assert.Zero(t, rejectedJobs, "invalid intervals must be rejected before creating any inference job")
	operation.Seconds = 1
	job, err := QueueStudioWorkflow(1, project.ID, "extract-depth", "media", project.Revision, 1000, nil, nil, operation)
	require.NoError(t, err)
	StudioWorkflowRelay = func(_ context.Context, _ *model.StudioWorkflowJob, kind string, _ []byte) (StudioRelayResponse, error) {
		if kind == "production-media" {
			require.NoError(t, model.DB.Create(&model.Task{TaskID: "depth-task", UserId: 1, Status: model.TaskStatusSuccess}).Error)
			return StudioRelayResponse{Status: 200, ContentType: "application/json", Body: []byte(`{"task_id":"depth-task"}`)}, nil
		}
		return StudioRelayResponse{Status: 200, ContentType: "video/mp4", Body: []byte("fixture-depth-video")}, nil
	}
	RunStudioWorkflowsOnce(t.Context(), "depth-worker")
	require.NoError(t, model.DB.First(job, "id = ?", job.ID).Error)
	assert.Equal(t, "succeeded", job.Status, job.Error)
	saved, _, err := model.StudioProjectAccess(model.DB, 1, project.ID, false)
	require.NoError(t, err)
	assert.Contains(t, string(saved.Document), "depth-task")
}

func TestStudioSubtitleOffsetsPreserveDialogueArrows(t *testing.T) {
	raw := "1\n00:00:01,000 --> 00:00:02,500\nA --> B\n"
	shifted, err := ShiftStudioSubtitles(raw, .25)
	require.NoError(t, err)
	assert.Equal(t, "1\n00:00:01,250 --> 00:00:02,750\nA --> B\n", shifted)
	_, err = ShiftStudioSubtitles("1\n00:99:00,000 --> 01:00:00,000\nText", 0)
	require.Error(t, err)
	_, err = ShiftStudioSubtitles("1\nbad --> timing\nText", 0)
	require.Error(t, err)
}

func TestStudioPrevisExportsFramesAndAnimaticWithoutModels(t *testing.T) {
	studioProductionFixture(t)
	if !StudioRenderAvailable() {
		t.Skip("FFmpeg and FFprobe are required for animatic verification")
	}
	document := map[string]any{"id": "stage-film", "title": "Stage film", "nodes": []any{map[string]any{"id": "frame", "data": map[string]any{"kind": "image", "prompt": ""}}, map[string]any{"id": "animation", "data": map[string]any{"kind": "video", "prompt": ""}}}, "edges": []any{}, "production": map[string]any{"previs": map[string]any{"duration": 1, "camera": map[string]any{"yaw": 20, "endYaw": 40, "pitch": 20, "distance": 10, "fov": 50}, "actors": []any{map[string]any{"id": "actor", "title": "Actor", "x": -1, "z": 0, "endX": 1, "endZ": 0, "yaw": 0, "pose": "walk", "color": "#8ab4f8"}}, "props": []any{}}}}
	studioCompleteTestDocument(t, document)
	raw, err := common.Marshal(document)
	require.NoError(t, err)
	project, err := model.SaveStudioProject(1, "stage-film", "Stage film", 0, string(raw))
	require.NoError(t, err)
	StudioWorkflowRelay = func(context.Context, *model.StudioWorkflowJob, string, []byte) (StudioRelayResponse, error) {
		t.Fatal("previsualization must not call a model")
		return StudioRelayResponse{}, nil
	}
	for _, item := range []struct{ node, action, mime string }{{"frame", "previs_frame", "image/png"}, {"animation", "previs_animation", "video/mp4"}} {
		project, _, err = model.StudioProjectAccess(model.DB, 1, project.ID, false)
		require.NoError(t, err)
		job, err := QueueStudioWorkflow(1, project.ID, item.node+"-request", "previs", project.Revision, 0, nil, nil, &StudioMediaOperation{NodeID: item.node, Action: item.action})
		require.NoError(t, err)
		RunStudioWorkflowsOnce(t.Context(), "stage-worker")
		require.NoError(t, model.DB.First(job, "id = ?", job.ID).Error)
		require.Equal(t, "succeeded", job.Status, job.Error)
		media, err := GetStudioMedia(1, "previs-"+job.ID)
		require.NoError(t, err)
		assert.Equal(t, item.mime, media.MimeType)
		if item.node == "animation" {
			path, err := StudioMediaPath(media)
			require.NoError(t, err)
			probe, err := ProbeStudioMedia(t.Context(), path)
			require.NoError(t, err)
			assert.InDelta(t, 1, probe.Duration, .1)
			assert.True(t, probe.HasVideo)
		}
	}
}

func TestStudioPrivateObjectRecoveryAndProjectMediaIsolation(t *testing.T) {
	studioProductionFixture(t)
	objects := map[string][]byte{}
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		assert.True(t, strings.HasPrefix(request.Header.Get("Authorization"), "AWS4-HMAC-SHA256 "))
		switch request.Method {
		case "PUT":
			data, err := io.ReadAll(request.Body)
			require.NoError(t, err)
			objects[request.URL.Path] = data
			writer.WriteHeader(200)
		case "GET":
			data, exists := objects[request.URL.Path]
			if !exists {
				writer.WriteHeader(404)
				return
			}
			writer.Write(data)
		}
	}))
	defer server.Close()
	t.Setenv("TASK_ARTIFACT_STORE_MODE", "s3")
	t.Setenv("TASK_ARTIFACT_STORE_S3_ENDPOINT", server.URL)
	t.Setenv("TASK_ARTIFACT_STORE_S3_BUCKET", "studio-objects")
	t.Setenv("TASK_ARTIFACT_STORE_S3_REGION", "us-east-1")
	t.Setenv("TASK_ARTIFACT_STORE_S3_ACCESS_KEY", "local-test")
	t.Setenv("TASK_ARTIFACT_STORE_S3_SECRET_KEY", "local-test-secret")
	media, err := SaveStudioMedia(1, "private-one", "video/mp4", strings.NewReader("fixture-bytes"))
	require.NoError(t, err)
	assert.True(t, strings.HasPrefix(media.ObjectKey, "s3://studio-objects/"))
	_, err = SaveStudioMedia(1, "private-one", "video/mp4", strings.NewReader("changed"))
	require.Error(t, err)
	localPath, err := StudioMediaPath(media)
	require.NoError(t, err)
	require.NoError(t, os.Remove(localPath))
	restored, err := GetStudioMedia(1, "private-one")
	require.NoError(t, err)
	assert.Equal(t, media.Digest, restored.Digest)
	data, err := os.ReadFile(localPath)
	require.NoError(t, err)
	assert.Equal(t, "fixture-bytes", string(data))
	project, err := model.SaveStudioProject(1, "shared", "Shared", 0, `{"id":"shared","title":"Shared","nodes":[],"edges":[]}`)
	require.NoError(t, err)
	require.NoError(t, model.DB.Create(&model.StudioProjectMember{ProjectID: project.ID, UserID: 2, Role: "editor"}).Error)
	document := map[string]any{"mediaId": media.MediaID}
	assert.Error(t, ValidateStudioProjectMedia(2, project.ID, document))
	require.NoError(t, LinkStudioProjectMedia(project.ID, media.MediaID))
	assert.NoError(t, ValidateStudioProjectMedia(2, project.ID, document))
	assert.Error(t, ValidateStudioProjectMedia(3, project.ID, document))
	assert.False(t, StudioProjectHasMedia("another-project", media.MediaID))
}

func TestStudioHeadlessStageRendersRealStoredGLBAndDepth(t *testing.T) {
	sourcePath := os.Getenv("STUDIO_TEST_REAL_GLB")
	if sourcePath == "" {
		t.Skip("set STUDIO_TEST_REAL_GLB to an actual model-generated embedded GLB")
	}
	require.NotEmpty(t, StudioPrevisBrowserPath())
	studioProductionFixture(t)
	source, err := os.Open(sourcePath)
	require.NoError(t, err)
	_, err = SaveStudioMedia(1, "real-mesh", "model/gltf-binary", source)
	source.Close()
	require.NoError(t, err)
	document := map[string]any{"id": "mesh-stage", "title": "Real mesh stage", "nodes": []any{map[string]any{"id": "frame", "data": map[string]any{"kind": "image", "prompt": "Stage reference"}}}, "edges": []any{}, "production": map[string]any{"previs": map[string]any{"duration": 1, "camera": map[string]any{"yaw": 20, "endYaw": 20, "pitch": 20, "distance": 5, "fov": 50}, "actors": []any{}, "props": []any{}, "advanced": map[string]any{"models": []any{map[string]any{"id": "cat", "title": "Generated cat", "modelMediaId": "real-mesh", "x": 0, "y": 1, "z": 0, "scale": 2, "animation": ""}}, "tracks": []any{}, "showPaths": false}}}}
	studioCompleteTestDocument(t, document)
	browser, err := OpenStudioPrevisBrowser(t.Context(), 1, document)
	require.NoError(t, err)
	defer browser.close()
	hashes := map[[32]byte]bool{}
	for _, mode := range []string{"color", "whitebox", "depth"} {
		data, err := browser.Frame(.5, mode)
		require.NoError(t, err)
		frame, err := png.Decode(bytes.NewReader(data))
		require.NoError(t, err)
		assert.Equal(t, image.Rect(0, 0, 640, 360), frame.Bounds())
		foreground := 0
		r0, g0, b0, _ := frame.At(0, 0).RGBA()
		for y := range 360 {
			for x := range 640 {
				r, g, b, _ := frame.At(x, y).RGBA()
				if r != r0 || g != g0 || b != b0 {
					foreground++
				}
			}
		}
		if mode == "depth" {
			maximum := uint32(0)
			for y := range 360 {
				for x := range 640 {
					r, _, _, _ := frame.At(x, y).RGBA()
					maximum = max(maximum, r)
				}
			}
			assert.Greater(t, maximum, uint32(32768), "linear camera depth must remain visible and useful as a model reference")
		}
		assert.Greater(t, foreground, 1000, mode+" must contain the actual stored model")
		hash := sha256.Sum256(data)
		assert.False(t, hashes[hash], "color, whitebox and depth must be distinct")
		hashes[hash] = true
		if proof := os.Getenv("STUDIO_TEST_STAGE_PROOF"); proof != "" {
			require.NoError(t, os.WriteFile(filepath.Join(proof, "real-cat-stage-"+mode+".png"), data, 0600))
		}
	}
	for _, dimensions := range [][2]int{{320, 180}, {180, 320}} {
		custom, err := OpenStudioPrevisBrowser(t.Context(), 1, document, &StudioToolOptions{Width: dimensions[0], Height: dimensions[1]})
		require.NoError(t, err)
		data, err := custom.Frame(.5, "color")
		custom.close()
		require.NoError(t, err)
		frame, err := png.Decode(bytes.NewReader(data))
		require.NoError(t, err)
		assert.Equal(t, image.Rect(0, 0, dimensions[0], dimensions[1]), frame.Bounds())
	}
	raw, err := common.Marshal(document)
	require.NoError(t, err)
	project, err := model.SaveStudioProject(1, "mesh-stage", "Real mesh stage", 0, string(raw))
	require.NoError(t, err)
	job, err := QueueStudioWorkflow(1, project.ID, "depth-job", "previs", project.Revision, 0, nil, nil, &StudioMediaOperation{Action: "previs_depth", NodeID: "frame", Seconds: .5})
	require.NoError(t, err)
	StudioWorkflowRelay = func(context.Context, *model.StudioWorkflowJob, string, []byte) (StudioRelayResponse, error) {
		t.Fatal("stage export must not call a model")
		return StudioRelayResponse{}, nil
	}
	RunStudioWorkflowsOnce(t.Context(), "stage-renderer")
	require.NoError(t, model.DB.First(job, "id = ?", job.ID).Error)
	assert.Equal(t, "succeeded", job.Status, job.Error)
}

func TestStudioFFmpegDeliveryContainsPlayableMediaAndVersion(t *testing.T) {
	if !StudioRenderAvailable() {
		t.Skip("configure FFmpeg and FFprobe to run the media integration test")
	}
	studioProductionFixture(t)
	workdir := t.TempDir()
	fixture := filepath.Join(workdir, "fixture.mp4")
	command := exec.Command(studioFFmpegBinary(false), "-nostdin", "-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", fixture)
	output, err := command.CombinedOutput()
	require.NoError(t, err, string(output))
	file, err := os.Open(fixture)
	require.NoError(t, err)
	_, err = SaveStudioMedia(1, "source", "video/mp4", file)
	file.Close()
	require.NoError(t, err)
	frame, err := StudioLastFrame(t.Context(), 1, "source")
	require.NoError(t, err)
	assert.Equal(t, "image/png", frame.MimeType)
	secondFrame, err := StudioLastFrame(t.Context(), 1, "source")
	require.NoError(t, err)
	assert.Equal(t, frame.MediaID, secondFrame.MediaID)
	document := `{"id":"film","title":"Film","nodes":[{"id":"clip","data":{"kind":"video","mediaId":"source"}}],"edges":[],"shots":[{"id":"shot","videoNodeId":"clip","reviewStatus":"approved"}],"production":{"dialogueCues":[{"id":"line","shotId":"shot","audioMediaId":"source","offset":0,"duration":0.5,"text":"Hello"}],"reviews":[{"nodeId":"clip","takeId":"","mediaId":"source","status":"approved","reviewerId":1,"revision":1,"reviewedAt":"2026-10-04T00:00:00Z","note":""}]}}`
	project, err := model.SaveStudioProject(1, "film", "Film", 0, document)
	require.NoError(t, err)
	end := 1.5
	plan := &StudioRenderPlan{Width: 320, Height: 180, FPS: 24, Clips: []StudioRenderClip{{NodeID: "clip", MediaID: "source", Start: .25, End: &end, Speed: 1.25, Volume: .5, FadeIn: .1, FadeOut: .1, Caption: "片段字幕", CaptionOffset: .1, CaptionDuration: .5}}, RequireApproved: true, Package: true}
	for index, animation := range []string{"fade", "slide", "pulse", "bounce"} {
		plan.MotionGraphics = append(plan.MotionGraphics, StudioMotionGraphic{ID: fmt.Sprintf("title-%d", index), Text: "Motion title", Start: .1, End: .8, X: .2 * float64(index), Y: .1, FontSize: 16, Color: "#ffffff", Animation: animation, BPM: 120})
	}
	job, err := QueueStudioWorkflow(1, "film", "delivery", "render", project.Revision, 0, nil, plan)
	require.NoError(t, err)
	StudioWorkflowRelay = func(context.Context, *model.StudioWorkflowJob, string, []byte) (StudioRelayResponse, error) {
		t.Fatal("render must never call a model")
		return StudioRelayResponse{}, nil
	}
	RunStudioWorkflowsOnce(t.Context(), "renderer")
	require.NoError(t, model.DB.First(job, "id = ?", job.ID).Error)
	require.Equal(t, "succeeded", job.Status, job.Error)
	var result struct {
		MediaID   string              `json:"media_id"`
		PackageID string              `json:"package_media_id"`
		Revision  int64               `json:"revision"`
		Clips     []StudioRenderClip  `json:"clips"`
		Audio     []StudioRenderAudio `json:"audio"`
	}
	require.NoError(t, common.Unmarshal([]byte(job.Result), &result))
	assert.Equal(t, int64(1), result.Revision)
	require.Len(t, result.Clips, 1)
	assert.True(t, result.Clips[0].Muted, "separate dialogue replaces the embedded speech instead of doubling it")
	assert.Len(t, result.Audio, 1)
	assert.InDelta(t, .2, result.Audio[0].Start, .001, "a trimmed shot starts at the corresponding dialogue sample")
	media, err := GetStudioMedia(1, result.MediaID)
	require.NoError(t, err)
	mediaPath, err := StudioMediaPath(media)
	require.NoError(t, err)
	probe, err := ProbeStudioMedia(t.Context(), mediaPath)
	require.NoError(t, err)
	assert.True(t, probe.HasAudio && probe.HasVideo)
	assert.InDelta(t, 1, probe.Duration, .1)
	assert.Equal(t, 320, probe.Width)
	archive, err := GetStudioMedia(1, result.PackageID)
	require.NoError(t, err)
	archivePath, err := StudioMediaPath(archive)
	require.NoError(t, err)
	archiveBytes, err := os.ReadFile(archivePath)
	require.NoError(t, err)
	reader, err := zip.NewReader(bytes.NewReader(archiveBytes), int64(len(archiveBytes)))
	require.NoError(t, err)
	entries := map[string]bool{}
	for _, entry := range reader.File {
		entries[entry.Name] = true
		if entry.Name == "subtitles.srt" {
			stream, err := entry.Open()
			require.NoError(t, err)
			data, err := io.ReadAll(stream)
			stream.Close()
			require.NoError(t, err)
			assert.Contains(t, string(data), "片段字幕")
			assert.Contains(t, string(data), "Hello")
			assert.Contains(t, string(data), "00:00:00,100 --> 00:00:00,600")
		}
	}
	assert.True(t, entries["video.mp4"] && entries["project.json"] && entries["manifest.json"])
	assert.True(t, entries["media/source.mp4"], "source MP4 files must keep a familiar format extension in delivery packages")
	assert.True(t, entries["timeline.xml"], "professional delivery needs a Final Cut 7 XML timeline")
	assert.True(t, entries["timeline.fcpxml"], "professional delivery needs a Final Cut Pro XML timeline")
	assert.True(t, entries["timeline.otio"], "professional delivery needs an interoperable editorial timeline")
	assert.True(t, entries["relink_media.py"], "a portable editorial package must support relinking extracted source files")
}
