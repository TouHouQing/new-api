package service

import (
	"bytes"
	"context"
	"encoding/binary"
	"fmt"
	"math"
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
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"gorm.io/gorm/schema"
)

func studioMediaIndexFixture(t *testing.T) (*model.StudioProject, *model.StudioWorkflowJob) {
	t.Helper()
	project, media, document := studioInspectVideoFixture(t)
	document["createdAt"], document["updatedAt"] = "2026-10-18T00:00:00Z", "2026-10-18T00:00:00Z"
	for _, node := range studioObjects(document, "nodes") {
		node["type"], node["position"] = "studio", map[string]any{"x": 0, "y": 0}
		data := node["data"].(map[string]any)
		data["title"], data["prompt"] = "Source", ""
		for _, take := range studioObjects(data, "takes") {
			take["createdAt"], take["prompt"] = "2026-10-18T00:00:00Z", ""
		}
	}
	valid, err := common.Marshal(document)
	require.NoError(t, err)
	project, err = model.SaveStudioProject(1, project.ID, project.Title, project.Revision, string(valid))
	require.NoError(t, err)
	analysis := StudioReferenceAnalysis{Summary: "Reference", Shots: []StudioReferenceAnalysisShot{{Title: "Rainy street", Text: "A rainy street in the city", Start: 0, End: 1}, {Title: "Coffee close-up", Text: "Close-up of coffee in a white cup", Start: 1, End: 3}}}
	content, err := common.Marshal(analysis)
	require.NoError(t, err)
	response, err := common.Marshal(map[string]any{"model": "fixture-vision-v1", "choices": []any{map[string]any{"message": map[string]any{"content": string(content)}}}})
	require.NoError(t, err)
	receipt, err := SaveStudioMedia(1, "index-receipt", "application/json", bytes.NewReader(response))
	require.NoError(t, err)
	plan, err := common.Marshal(StudioWorkflowPlan{Document: document, Operation: &StudioMediaOperation{MediaID: media.MediaID, TakeID: "take-1", Model: "fixture-vision", Edit: &StudioMediaEdit{Start: 0, End: 3}}})
	require.NoError(t, err)
	result, err := common.Marshal(StudioWorkflowProgress{ResponseMediaID: receipt.MediaID, Take: map[string]any{"outputText": "User edited this into a mountain, not model evidence"}})
	require.NoError(t, err)
	job := &model.StudioWorkflowJob{ID: "index-analysis-job", RequestID: "index-analysis-request", ProjectID: project.ID, UserID: 1, Kind: "analyze", Status: "succeeded", Revision: project.Revision, Plan: model.StudioDocument(plan), Result: model.StudioDocument(result)}
	require.NoError(t, model.DB.Create(job).Error)
	return project, job
}

func TestStudioMediaIndexUsesImmutableReceiptAndDisclosedBilingualSearch(t *testing.T) {
	project, job := studioMediaIndexFixture(t)
	record, err := IndexStudioMediaAnalysis(t.Context(), 1, project.ID, job.ID)
	require.NoError(t, err)
	duplicate, err := IndexStudioMediaAnalysis(t.Context(), 1, project.ID, job.ID)
	require.NoError(t, err)
	assert.Equal(t, record.ID, duplicate.ID)
	for _, query := range []string{"下雨的街道", "rainy street"} {
		result, err := SearchStudioIndexedMedia(1, project.ID, query, 20, 0)
		require.NoError(t, err)
		require.Len(t, result.Hits, 1)
		assert.Equal(t, "Rainy street", result.Hits[0].Title)
		assert.Equal(t, 0.0, result.Hits[0].Start)
		assert.Equal(t, 1.0, result.Hits[0].End)
		assert.NotEmpty(t, result.Hits[0].ReceiptMediaID)
		assert.Equal(t, "description_terms_with_disclosed_bilingual_dictionary", result.Ranking)
	}
	coffee, err := SearchStudioIndexedMedia(1, project.ID, "咖啡特写", 20, 0)
	require.NoError(t, err)
	require.Len(t, coffee.Hits, 1)
	assert.Equal(t, "take-1", coffee.Hits[0].SourceTakeID)
	for _, query := range []string{"mountain", "下雨的咖啡", "cartoon", "中国商品"} {
		result, err := SearchStudioIndexedMedia(1, project.ID, query, 20, 0)
		require.NoError(t, err)
		assert.Empty(t, result.Hits, query)
	}
	page, err := SearchStudioIndexedMedia(1, project.ID, "", 1, 0)
	require.NoError(t, err)
	assert.Equal(t, 2, page.Total)
	require.NotNil(t, page.NextOffset)
	assert.Equal(t, 1, *page.NextOffset)
	_, err = SearchStudioIndexedMedia(2, project.ID, "coffee", 20, 0)
	require.ErrorIs(t, err, model.ErrStudioAccess)
	other, err := model.SaveStudioProject(1, "other-project", "Other", 0, `{"id":"other-project","title":"Other","nodes":[],"edges":[]}`)
	require.NoError(t, err)
	_, err = IndexStudioMediaAnalysis(t.Context(), 1, other.ID, job.ID)
	require.ErrorContains(t, err, "from this project")
	_, err = model.SaveStudioProject(1, project.ID, project.Title, project.Revision, `{"id":"inspect-project","title":"Analysis","nodes":[],"edges":[]}`)
	require.NoError(t, err)
	stale, err := SearchStudioIndexedMedia(1, project.ID, "rain", 20, 0)
	require.NoError(t, err)
	assert.Empty(t, stale.Hits)
	assert.Equal(t, 1, stale.StaleRecords)
}

func TestStudioBrollReplacementPreviewsThenKeepsDurationDialogueAndMusic(t *testing.T) {
	project, job := studioMediaIndexFixture(t)
	StudioWorkflowRelay = func(context.Context, *model.StudioWorkflowJob, string, []byte) (StudioRelayResponse, error) {
		t.Fatal("B-roll render must not call a model")
		return StudioRelayResponse{}, nil
	}
	indexRecord, err := IndexStudioMediaAnalysis(t.Context(), 1, project.ID, job.ID)
	require.NoError(t, err)
	var index StudioMediaIndex
	require.NoError(t, common.Unmarshal([]byte(indexRecord.Document), &index))
	filePath := filepath.Join(t.TempDir(), "voice-source.mp4")
	output, err := exec.Command(studioFFmpegBinary(false), "-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=96x64:rate=24:duration=4", "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=22050:duration=4", "-c:v", "libx264", "-c:a", "aac", "-pix_fmt", "yuv420p", filePath).CombinedOutput()
	require.NoError(t, err, string(output))
	file, err := os.Open(filePath)
	require.NoError(t, err)
	voice, err := SaveStudioMedia(1, "voice-source", "video/mp4", file)
	file.Close()
	require.NoError(t, err)
	var document map[string]any
	require.NoError(t, common.Unmarshal([]byte(project.Document), &document))
	document["nodes"] = append(document["nodes"].([]any), map[string]any{"id": "voice", "type": "studio", "position": map[string]any{"x": 0, "y": 300}, "data": map[string]any{"kind": "video", "title": "Dialogue", "prompt": "", "mediaId": voice.MediaID}})
	document["production"] = map[string]any{"documentVersion": 2, "timelineEdited": true, "timeline": []any{map[string]any{"id": "prefix", "nodeId": "video", "trimStart": 0.0, "trimEnd": 1.0, "speed": 1.0}, map[string]any{"id": "replace-me", "nodeId": "voice", "trimStart": 0.0, "trimEnd": 4.0, "speed": 2.0, "volume": .8, "caption": "Original words"}}, "audioTracks": []any{map[string]any{"id": "music", "mediaId": voice.MediaID, "start": 0.0, "offset": 0.0, "volume": .2}}, "reframes": map[string]any{"replace-me": map[string]any{"analysisId": "old-track", "sourceMediaId": voice.MediaID, "sourceDigest": voice.Digest, "width": 640, "height": 360}}}
	raw, err := common.Marshal(document)
	require.NoError(t, err)
	project, err = model.SaveStudioProject(1, project.ID, project.Title, project.Revision, string(raw))
	require.NoError(t, err)
	request := StudioBrollRequest{RequestID: "broll-plan", Revision: project.Revision, IndexID: indexRecord.ID, EntryID: index.Clips[1].ID, ReplaceClipID: "replace-me", ReviewConfirmed: true}
	tooShort := request
	tooShort.RequestID, tooShort.EntryID = "broll-too-short", index.Clips[0].ID
	_, err = PrepareStudioBrollPlan(t.Context(), 1, project.ID, tooShort)
	require.ErrorContains(t, err, "too short")
	plan, err := PrepareStudioBrollPlan(t.Context(), 1, project.ID, request)
	require.NoError(t, err)
	var unchanged model.StudioProject
	require.NoError(t, model.DB.First(&unchanged, "id = ?", project.ID).Error)
	assert.Equal(t, project.Document, unchanged.Document)
	assert.Equal(t, project.Revision, unchanged.Revision)
	var payload struct {
		Next map[string]any `json:"next_document"`
	}
	require.NoError(t, common.Unmarshal([]byte(plan.Document), &payload))
	production, clips := studioTimelineDocument(payload.Next)
	require.Len(t, clips, 2)
	assert.Equal(t, 1.0, clips[1]["trimStart"])
	assert.Equal(t, 3.0, clips[1]["trimEnd"])
	assert.Equal(t, 1.0, clips[1]["speed"])
	assert.Equal(t, "Original words", clips[1]["caption"])
	assert.Empty(t, production["reframes"])
	tracks := studioObjects(production, "audioTracks")
	require.Len(t, tracks, 2)
	assert.Equal(t, "music", tracks[0]["id"])
	assert.Equal(t, 0.0, tracks[1]["start"])
	assert.Equal(t, 1.0, tracks[1]["offset"])
	assert.Equal(t, 2.0, tracks[1]["duration"])
	preserved, err := GetStudioMedia(1, tracks[1]["mediaId"].(string))
	require.NoError(t, err)
	path, err := StudioMediaPath(preserved)
	require.NoError(t, err)
	probe, err := ProbeStudioMedia(context.Background(), path)
	require.NoError(t, err)
	assert.True(t, probe.HasAudio)
	assert.InDelta(t, 2, probe.Duration, .05)
	applied, _, err := model.ApplyStudioEditRecord(1, plan.ID, project.Revision, ValidateStudioIndexedBrollPlan)
	require.NoError(t, err)
	assert.Equal(t, project.Revision+1, applied.Revision)
	// Render the preserved-dialogue stem alone. The pre-existing music track is
	// intentionally excluded so it cannot hide a wrong dialogue onset.
	render := &StudioRenderPlan{Width: 96, Height: 64, FPS: 24, Fit: "letterbox", SkipDialogue: true}
	for _, clip := range clips {
		media, _, err := studioClipSource(1, payload.Next, clip)
		require.NoError(t, err)
		end := studioDocumentNumber(clip["trimEnd"], 0)
		takeID, _ := clip["takeId"].(string)
		render.Clips = append(render.Clips, StudioRenderClip{ClipID: clip["id"].(string), NodeID: clip["nodeId"].(string), TakeID: takeID, MediaID: media.MediaID, Start: studioDocumentNumber(clip["trimStart"], 0), End: &end, Speed: studioDocumentNumber(clip["speed"], 1), Muted: true})
	}
	length := studioDocumentNumber(tracks[1]["duration"], 0)
	render.Audio = []StudioRenderAudio{{MediaID: preserved.MediaID, Start: studioDocumentNumber(tracks[1]["start"], 0), Offset: studioDocumentNumber(tracks[1]["offset"], 0), Volume: 1, Duration: &length}}
	renderJob, err := QueueStudioWorkflow(1, project.ID, "broll-audio-onset", "render", applied.Revision, 0, nil, render)
	require.NoError(t, err)
	RunStudioWorkflowsOnce(t.Context(), "broll-renderer")
	require.NoError(t, model.DB.First(renderJob, "id = ?", renderJob.ID).Error)
	require.Equal(t, "succeeded", renderJob.Status, renderJob.Error)
	var result struct {
		MediaID string `json:"media_id"`
	}
	require.NoError(t, common.Unmarshal([]byte(renderJob.Result), &result))
	outputMedia, err := GetStudioMedia(1, result.MediaID)
	require.NoError(t, err)
	outputPath, err := StudioMediaPath(outputMedia)
	require.NoError(t, err)
	rms := func(start string) float64 {
		pcm, err := exec.Command(studioFFmpegBinary(false), "-v", "error", "-ss", start, "-t", "0.4", "-i", outputPath, "-vn", "-ac", "1", "-ar", "8000", "-f", "s16le", "pipe:1").Output()
		require.NoError(t, err)
		require.NotEmpty(t, pcm)
		power := 0.0
		for sample := range len(pcm) / 2 {
			value := float64(int16(binary.LittleEndian.Uint16(pcm[sample*2:])))
			power += value * value
		}
		return math.Sqrt(power / float64(len(pcm)/2))
	}
	assert.Less(t, rms("0.2"), 10.0, "dialogue must not start at program zero")
	assert.Greater(t, rms("1.2"), 100.0, "preserved dialogue must begin at program one second")
	again, err := PrepareStudioBrollPlan(t.Context(), 1, project.ID, request)
	require.NoError(t, err)
	assert.Equal(t, plan.ID, again.ID)
}

func TestStudioBrollRejectsStaleExactEvidenceDespiteOtherMediaReferences(t *testing.T) {
	for _, change := range []string{"remove-take", "move-take-to-different-node", "digest-change", "legacy-index-without-node"} {
		t.Run(change, func(t *testing.T) {
			project, job := studioMediaIndexFixture(t)
			indexRecord, err := IndexStudioMediaAnalysis(t.Context(), 1, project.ID, job.ID)
			require.NoError(t, err)
			var index StudioMediaIndex
			require.NoError(t, common.Unmarshal([]byte(indexRecord.Document), &index))
			require.Equal(t, "video", index.SourceNodeID)
			if change == "legacy-index-without-node" {
				index.SourceNodeID = ""
				indexRecord, err = SaveStudioProductionRecord(1, project.ID, "legacy-index", "media_index", project.Revision, index)
				require.NoError(t, err)
			}
			request := StudioBrollRequest{RequestID: "valid-preview", Revision: project.Revision, IndexID: indexRecord.ID, EntryID: index.Clips[0].ID, ReviewConfirmed: true}
			validPlan, err := PrepareStudioBrollPlan(t.Context(), 1, project.ID, request)
			require.NoError(t, err)
			var legacyPayload map[string]any
			require.NoError(t, common.Unmarshal([]byte(validPlan.Document), &legacyPayload))
			var document map[string]any
			require.NoError(t, common.Unmarshal([]byte(project.Document), &document))
			// The media remains available in this project under a different Take.
			// It cannot substitute for the original model evidence's exact origin.
			document["nodes"] = append(document["nodes"].([]any), map[string]any{"id": "other-reference", "type": "studio", "position": map[string]any{"x": 300, "y": 0}, "data": map[string]any{"kind": "video", "title": "Other lawful use", "prompt": "", "mediaId": index.SourceMediaID, "selectedTakeId": "other-take", "takes": []any{map[string]any{"id": "other-take", "status": "completed", "mediaId": index.SourceMediaID, "createdAt": "2026-10-18T00:00:00Z", "prompt": ""}}}})
			for _, node := range studioObjects(document, "nodes") {
				if node["id"] != "video" {
					continue
				}
				if change == "move-take-to-different-node" {
					node["id"] = "copied-node-with-same-take-id"
				} else if change != "digest-change" {
					data := node["data"].(map[string]any)
					data["takes"], data["selectedTakeId"] = []any{}, ""
				}
			}
			if change == "digest-change" {
				require.NoError(t, model.DB.Model(&model.StudioMedia{}).Where("owner_id = ? AND media_id = ?", project.OwnerID, index.SourceMediaID).Update("digest", strings.Repeat("a", 64)).Error)
			}
			raw, err := common.Marshal(document)
			require.NoError(t, err)
			changed, err := model.SaveStudioProject(1, project.ID, project.Title, project.Revision, string(raw))
			require.NoError(t, err)
			search, err := SearchStudioIndexedMedia(1, project.ID, "rain", 20, 0)
			require.NoError(t, err)
			assert.Empty(t, search.Hits)
			assert.GreaterOrEqual(t, search.StaleRecords, 1)
			request.RequestID, request.Revision = "reject-stale-preview", changed.Revision
			_, err = PrepareStudioBrollPlan(t.Context(), 1, project.ID, request)
			require.ErrorIs(t, err, errStudioIndexedSourceStale)
			// Simulate an old server's already-persisted ready plan at the current
			// revision. Both its API apply and idempotent preview retry must fail.
			legacyPayload["request"] = request
			legacyPlan, err := SaveStudioProductionRecord(1, project.ID, request.RequestID, "edit_plan", changed.Revision, legacyPayload)
			require.NoError(t, err)
			_, err = PrepareStudioBrollPlan(t.Context(), 1, project.ID, request)
			require.ErrorIs(t, err, errStudioIndexedSourceStale)
			_, _, err = model.ApplyStudioEditRecord(1, legacyPlan.ID, changed.Revision, ValidateStudioIndexedBrollPlan)
			require.ErrorIs(t, err, errStudioIndexedSourceStale)
			var current model.StudioProject
			require.NoError(t, model.DB.First(&current, "id = ?", project.ID).Error)
			assert.Equal(t, changed.Document, current.Document)
			assert.Equal(t, changed.Revision, current.Revision)
			var persisted model.StudioProductionRecord
			require.NoError(t, model.DB.First(&persisted, "id = ?", legacyPlan.ID).Error)
			assert.Equal(t, "ready", persisted.State)
		})
	}
}

func TestStudioAppliedBrollRemainsAfterOriginalTakeRemoval(t *testing.T) {
	project, job := studioMediaIndexFixture(t)
	indexRecord, err := IndexStudioMediaAnalysis(t.Context(), 1, project.ID, job.ID)
	require.NoError(t, err)
	var index StudioMediaIndex
	require.NoError(t, common.Unmarshal([]byte(indexRecord.Document), &index))
	request := StudioBrollRequest{RequestID: "lawful-broll", Revision: project.Revision, IndexID: indexRecord.ID, EntryID: index.Clips[0].ID, ReviewConfirmed: true}
	plan, err := PrepareStudioBrollPlan(t.Context(), 1, project.ID, request)
	require.NoError(t, err)
	applied, _, err := model.ApplyStudioEditRecord(1, plan.ID, project.Revision, ValidateStudioIndexedBrollPlan)
	require.NoError(t, err)
	var document map[string]any
	require.NoError(t, common.Unmarshal([]byte(applied.Document), &document))
	for _, node := range studioObjects(document, "nodes") {
		if node["id"] == index.SourceNodeID {
			data := node["data"].(map[string]any)
			data["takes"], data["selectedTakeId"] = []any{}, ""
		}
	}
	raw, err := common.Marshal(document)
	require.NoError(t, err)
	changed, err := model.SaveStudioProject(1, project.ID, project.Title, applied.Revision, string(raw))
	require.NoError(t, err)
	search, err := SearchStudioIndexedMedia(1, project.ID, "rain", 20, 0)
	require.NoError(t, err)
	assert.Empty(t, search.Hits)
	replayed, receipt, err := model.ApplyStudioEditRecord(1, plan.ID, project.Revision, ValidateStudioIndexedBrollPlan)
	require.NoError(t, err)
	assert.Equal(t, "applied", receipt.State)
	assert.Equal(t, changed.Document, replayed.Document)
	assert.Equal(t, changed.Revision, replayed.Revision)
	_, clips := studioTimelineDocument(document)
	require.Len(t, clips, 2)
	assert.NotEqual(t, "video", clips[1]["nodeId"], "previously applied B-roll remains an independent lawful source")
}

func TestStudioBrollSourceDatabaseMatrix(t *testing.T) {
	for _, database := range []struct {
		name, dsn string
		dialect   func(string) gorm.Dialector
	}{
		{"sqlite", ":memory:", func(dsn string) gorm.Dialector { return sqlite.Open(dsn) }},
		{"mysql", os.Getenv("STUDIO_TEST_MYSQL_DSN"), func(dsn string) gorm.Dialector { return mysql.Open(dsn) }},
		{"postgres", os.Getenv("STUDIO_TEST_POSTGRES_DSN"), func(dsn string) gorm.Dialector { return postgres.Open(dsn) }},
	} {
		t.Run(database.name, func(t *testing.T) {
			if database.dsn == "" {
				if os.Getenv("STUDIO_MATRIX_REQUIRED") == "1" {
					t.Fatal("dedicated matrix database is required")
				}
				t.Skip("dedicated matrix database is not configured")
			}
			db, err := gorm.Open(database.dialect(database.dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent), NamingStrategy: schema.NamingStrategy{TablePrefix: fmt.Sprintf("broll_verify_%d_", time.Now().UnixNano())}})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			sqlDB.SetMaxOpenConns(1)
			original := model.DB
			model.DB = db
			models := []any{&model.StudioProject{}, &model.StudioProjectVersion{}, &model.StudioProjectMember{}, &model.StudioMedia{}, &model.StudioProductionRecord{}}
			t.Cleanup(func() {
				model.DB = original
				for i := len(models) - 1; i >= 0; i-- {
					assert.NoError(t, db.Migrator().DropTable(models[i]))
				}
				sqlDB.Close()
			})
			versionSQL := "SELECT version()"
			if database.name == "sqlite" {
				versionSQL = "SELECT sqlite_version()"
			}
			var version string
			require.NoError(t, db.Raw(versionSQL).Scan(&version).Error)
			t.Logf("Engine: %s %s", database.name, version)
			for range 2 {
				require.NoError(t, db.AutoMigrate(models...))
			}
			// Database-only fixtures exercise the exact-source reads and atomic
			// commit/rollback; actual file decoding is tested above with FFmpeg.
			digest := strings.Repeat("a", 64)
			require.NoError(t, db.Create(&model.StudioMedia{OwnerID: 1, MediaID: "source-media", MimeType: "video/mp4", Digest: digest, Size: 100}).Error)
			document := map[string]any{"id": "film", "title": "Film", "edges": []any{}, "nodes": []any{map[string]any{"id": "source", "data": map[string]any{"kind": "video", "mediaId": "source-media", "takes": []any{map[string]any{"id": "source-take", "mediaId": "source-media", "status": "completed"}}}}, map[string]any{"id": "other-use", "data": map[string]any{"kind": "video", "mediaId": "source-media", "takes": []any{map[string]any{"id": "other-take", "mediaId": "source-media", "status": "completed"}}}}}}
			raw, err := common.Marshal(document)
			require.NoError(t, err)
			project, err := model.SaveStudioProject(1, "film", "Film", 0, string(raw))
			require.NoError(t, err)
			index := StudioMediaIndex{Kind: "media_index", SourceNodeID: "source", SourceTakeID: "source-take", SourceMediaID: "source-media", SourceDigest: digest, Clips: []StudioIndexedClip{{ID: "entry", Start: 0, End: 1}}}
			indexRecord, err := SaveStudioProductionRecord(1, project.ID, "index", "media_index", project.Revision, index)
			require.NoError(t, err)
			request := StudioBrollRequest{RequestID: "valid-plan", Revision: project.Revision, IndexID: indexRecord.ID, EntryID: "entry", ReviewConfirmed: true}
			payload := map[string]any{"request": request, "impact": map[string]any{"action": "use_indexed_broll"}, "next_document": document}
			plan, err := SaveStudioProductionRecord(1, project.ID, request.RequestID, "edit_plan", project.Revision, payload)
			require.NoError(t, err)
			for range 2 {
				require.NoError(t, db.AutoMigrate(models...))
			}
			_, _, err = model.ApplyStudioEditRecord(2, plan.ID, project.Revision, ValidateStudioIndexedBrollPlan)
			require.ErrorIs(t, err, model.ErrStudioAccess)
			applied, _, err := model.ApplyStudioEditRecord(1, plan.ID, project.Revision, ValidateStudioIndexedBrollPlan)
			require.NoError(t, err)
			source := studioObjects(document, "nodes")[0]["data"].(map[string]any)
			source["takes"] = []any{}
			raw, err = common.Marshal(document)
			require.NoError(t, err)
			changed, err := model.SaveStudioProject(1, project.ID, project.Title, applied.Revision, string(raw))
			require.NoError(t, err)
			search, err := SearchStudioIndexedMedia(1, project.ID, "", 20, 0)
			require.NoError(t, err)
			assert.Empty(t, search.Hits)
			assert.Equal(t, 1, search.StaleRecords)
			request.RequestID, request.Revision = "legacy-stale-plan", changed.Revision
			_, err = PrepareStudioBrollPlan(t.Context(), 1, project.ID, request)
			require.ErrorIs(t, err, errStudioIndexedSourceStale)
			payload["request"] = request
			legacy, err := SaveStudioProductionRecord(1, project.ID, request.RequestID, "edit_plan", changed.Revision, payload)
			require.NoError(t, err)
			_, _, err = model.ApplyStudioEditRecord(1, legacy.ID, changed.Revision, ValidateStudioIndexedBrollPlan)
			require.ErrorIs(t, err, errStudioIndexedSourceStale)
			var current model.StudioProject
			require.NoError(t, db.First(&current, "id = ?", project.ID).Error)
			assert.Equal(t, changed.Revision, current.Revision)
			assert.Equal(t, changed.Document, current.Document)
			var persisted model.StudioProductionRecord
			require.NoError(t, db.First(&persisted, "id = ?", legacy.ID).Error)
			assert.Equal(t, "ready", persisted.State)
			replayed, _, err := model.ApplyStudioEditRecord(1, plan.ID, project.Revision, ValidateStudioIndexedBrollPlan)
			require.NoError(t, err)
			assert.Equal(t, changed.Revision, replayed.Revision)
		})
	}
}
