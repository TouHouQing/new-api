/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
package service

import (
	"bytes"
	"fmt"
	"image"
	"image/png"
	"os"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"gorm.io/gorm/schema"
)

func studioCampaignFixture(t *testing.T) StudioCampaignRequest {
	t.Helper()
	var imageBytes bytes.Buffer
	require.NoError(t, png.Encode(&imageBytes, image.NewRGBA(image.Rect(0, 0, 2, 2))))
	_, err := SaveStudioMedia(1, "standard", "image/png", bytes.NewReader(imageBytes.Bytes()))
	require.NoError(t, err)
	source := `{"id":"master","title":"Master","nodes":[{"id":"hook","type":"studio","position":{"x":0,"y":0},"data":{"kind":"video","title":"Hook","prompt":"Original hook","model":"wan","seconds":5}},{"id":"benefit","type":"studio","position":{"x":0,"y":300},"data":{"kind":"video","title":"Benefit","prompt":"Original benefit","model":"wan","seconds":5}},{"id":"reference","type":"studio","position":{"x":0,"y":600},"data":{"kind":"image","title":"Reference","prompt":"Shared reference","mediaId":"standard","status":"completed"}}],"edges":[],"production":{"documentVersion":2,"reviews":[],"continuityReviews":[]},"createdAt":"2026-10-18","updatedAt":"2026-10-18"}`
	_, err = model.SaveStudioProject(1, "master", "Master", 0, source)
	require.NoError(t, err)
	return StudioCampaignRequest{ID: "experiment", Title: "Opening and benefit", ProjectID: "master", ProjectRevision: 1, TotalBudget: 400, SampleVariantID: "v1", Axes: []StudioCampaignAxis{
		{ID: "hook", Label: "Hook", Kind: "hook", Path: "/nodes/0/data/prompt", Values: []StudioCampaignValue{{ID: "a", Label: "Question", Value: "What makes this lantern different?"}, {ID: "b", Label: "Surprise", Value: "A lantern lights the entire room."}}},
		{ID: "benefit", Label: "Benefit", Kind: "benefit", Path: "/nodes/1/data/prompt", Values: []StudioCampaignValue{{ID: "a", Label: "Portable", Value: "Carry the light outdoors."}, {ID: "b", Label: "Comfort", Value: "A soft comfortable light fills the room."}}},
	}, Variants: []StudioCampaignVariant{
		{ID: "v1", Values: map[string]string{"hook": "a", "benefit": "a"}, Budget: 100}, {ID: "v2", Values: map[string]string{"hook": "a", "benefit": "b"}, Budget: 100},
		{ID: "v3", Values: map[string]string{"hook": "b", "benefit": "a"}, Budget: 100}, {ID: "v4", Values: map[string]string{"hook": "b", "benefit": "b"}, Budget: 100},
	}}
}

func TestStudioCampaignFourVariantsPinMasterAndReuseMedia(t *testing.T) {
	studioProductionFixture(t)
	input := studioCampaignFixture(t)
	source, _, err := model.StudioProjectAccess(model.DB, 1, "master", false)
	require.NoError(t, err)
	campaign, err := CreateStudioCampaign(1, input)
	require.NoError(t, err)
	require.Len(t, campaign.Variants, 4)
	require.EqualValues(t, 1, campaign.SourceRevision)
	for _, variant := range campaign.Variants {
		require.ElementsMatch(t, []string{"hook", "benefit"}, variant.ChangedNodeIDs)
		child, _, err := model.StudioProjectAccess(model.DB, 1, variant.ProjectID, false)
		require.NoError(t, err)
		require.Contains(t, string(child.Document), `"mediaId":"standard"`)
		require.True(t, StudioProjectHasMedia(child.ID, "standard"))
		require.NotContains(t, string(child.Document), "Original hook")
	}
	after, _, err := model.StudioProjectAccess(model.DB, 1, "master", false)
	require.NoError(t, err)
	require.Equal(t, source.Document, after.Document)
	require.EqualValues(t, 1, after.Revision)
	again, err := CreateStudioCampaign(1, input)
	require.NoError(t, err)
	require.Equal(t, campaign.ID, again.ID)
	var projects, jobs, tokens int64
	require.NoError(t, model.DB.Model(&model.StudioProject{}).Count(&projects).Error)
	require.EqualValues(t, 5, projects)
	require.NoError(t, model.DB.Model(&model.StudioWorkflowJob{}).Count(&jobs).Error)
	require.Zero(t, jobs)
	require.NoError(t, model.DB.Model(&model.Token{}).Count(&tokens).Error)
	require.Zero(t, tokens)
}

func TestStudioCampaignBudgetScopeAndMasterRevisionAreValidatedBeforeCreation(t *testing.T) {
	studioProductionFixture(t)
	input := studioCampaignFixture(t)
	input.Variants[3].Budget = 101
	_, err := CreateStudioCampaign(1, input)
	require.Error(t, err)
	input.Variants[3].Budget = 100
	input.Axes[0].Path = "/nodes/0/data/model"
	_, err = CreateStudioCampaign(1, input)
	require.Error(t, err)
	input.Axes[0].Path = "/nodes/0/data/prompt"
	input.ProjectRevision = 2
	_, err = CreateStudioCampaign(1, input)
	require.ErrorIs(t, err, model.ErrStudioRevision)
	var count int64
	require.NoError(t, model.DB.Model(&model.StudioProject{}).Count(&count).Error)
	require.EqualValues(t, 1, count)
}

func TestStudioCampaignAtomicRollbackLeavesNoPartialVariantProjects(t *testing.T) {
	studioProductionFixture(t)
	input := studioCampaignFixture(t)
	_, err := model.SaveStudioProject(1, "experiment_v4", "Existing", 0, `{"id":"experiment_v4","title":"Existing","nodes":[],"edges":[]}`)
	require.NoError(t, err)
	_, err = CreateStudioCampaign(1, input)
	require.Error(t, err)
	var count int64
	require.NoError(t, model.DB.Model(&model.StudioProject{}).Where("id IN ?", []string{"experiment_v1", "experiment_v2", "experiment_v3"}).Count(&count).Error)
	require.Zero(t, count)
	require.NoError(t, model.DB.Model(&model.StudioProductionRecord{}).Where("id = ?", "experiment").Count(&count).Error)
	require.Zero(t, count)
}

func TestStudioCampaignRequiresSuccessfulSampleAndReusesTheSameBilledWorkflow(t *testing.T) {
	studioProductionFixture(t)
	input := studioCampaignFixture(t)
	_, err := CreateStudioCampaign(1, input)
	require.NoError(t, err)
	_, err = SubmitStudioCampaignVariant(1, input.ID, "v1", false)
	require.Error(t, err)
	_, err = SubmitStudioCampaignVariant(1, input.ID, "v2", true)
	require.Error(t, err)
	sample, err := SubmitStudioCampaignVariant(1, input.ID, "v1", true)
	require.NoError(t, err)
	require.EqualValues(t, 100, sample.Budget)
	_, err = ApproveStudioCampaignSample(1, input.ID, 2)
	require.Error(t, err)
	require.NoError(t, model.DB.Model(sample).Update("status", "succeeded").Error)
	campaign, err := ReadStudioCampaign(1, input.ID)
	require.NoError(t, err)
	campaign, err = ApproveStudioCampaignSample(1, input.ID, campaign.Revision)
	require.NoError(t, err)
	for _, variant := range campaign.Variants {
		job, err := SubmitStudioCampaignVariant(1, input.ID, variant.ID, true)
		require.NoError(t, err)
		require.EqualValues(t, 100, job.Budget)
	}
	require.NoError(t, model.DB.Model(sample).Update("status", "failed").Error)
	replayed, err := SubmitStudioCampaignVariant(1, input.ID, "v1", true)
	require.NoError(t, err)
	require.Equal(t, sample.ID, replayed.ID)
	require.Equal(t, "failed", replayed.Status)
	var count int64
	require.NoError(t, model.DB.Model(&model.StudioWorkflowJob{}).Count(&count).Error)
	require.EqualValues(t, 4, count)
	user, err := model.GetUserById(1, false)
	require.NoError(t, err)
	require.Equal(t, 10_000_000, user.Quota, "queuing uses the existing workflow billing path; campaign creation adds no second debit")
}

func TestStudioCampaignRejectsOtherUsersAndChangedApprovedSamples(t *testing.T) {
	studioProductionFixture(t)
	input := studioCampaignFixture(t)
	_, err := CreateStudioCampaign(2, input)
	require.ErrorIs(t, err, model.ErrStudioAccess)
	_, err = CreateStudioCampaign(1, input)
	require.NoError(t, err)
	_, err = ReadStudioCampaign(2, input.ID)
	require.ErrorIs(t, err, model.ErrStudioAccess)
	job, err := SubmitStudioCampaignVariant(1, input.ID, "v1", true)
	require.NoError(t, err)
	require.NoError(t, model.DB.Model(job).Update("status", "succeeded").Error)
	campaign, err := ReadStudioCampaign(1, input.ID)
	require.NoError(t, err)
	_, err = ApproveStudioCampaignSample(1, input.ID, campaign.Revision)
	require.NoError(t, err)
	child, _, err := model.StudioProjectAccess(model.DB, 1, "experiment_v1", false)
	require.NoError(t, err)
	_, err = model.SaveStudioProject(1, child.ID, child.Title, child.Revision, string(child.Document))
	require.NoError(t, err)
	_, err = SubmitStudioCampaignVariant(1, input.ID, "v2", true)
	require.ErrorContains(t, err, "approved sample changed")
}

func TestStudioCampaignLanguageChangeDropsOriginalVoiceAndCaptions(t *testing.T) {
	source := map[string]any{"nodes": []any{map[string]any{"id": "video", "data": map[string]any{"kind": "video", "prompt": "Walk", "mediaId": "old"}}}, "edges": []any{}, "shots": []any{map[string]any{"id": "shot", "videoNodeId": "video", "dialogue": "Original", "shotCaptionText": "Original captions", "shotVoiceoverMediaId": "old-voice"}}, "captionsText": "Original global captions", "voiceoverMediaId": "old-voice", "production": map[string]any{"dialogueCues": []any{}, "audioTracks": []any{}, "timeline": []any{map[string]any{"nodeId": "video", "takeId": "old", "caption": "Original timeline captions"}}}}
	axes := []StudioCampaignAxis{{ID: "language", Kind: "language", Path: "/shots/0/dialogue", Values: []StudioCampaignValue{{ID: "en", Value: "Translated line"}}}}
	next, _, needsReview, err := studioCampaignVariantDocument(source, axes, StudioCampaignVariant{Values: map[string]string{"language": "en"}})
	require.NoError(t, err)
	require.True(t, needsReview)
	require.Equal(t, "Translated line", studioObjects(next, "shots")[0]["dialogue"])
	require.NotContains(t, next, "captionsText")
	require.NotContains(t, next, "voiceoverMediaId")
	require.NotContains(t, studioObjects(next, "shots")[0], "shotVoiceoverMediaId")
	require.NotContains(t, studioObjects(next, "shots")[0], "shotCaptionText")
	require.Equal(t, "Original", studioObjects(source, "shots")[0]["dialogue"])
}

func TestStudioCampaignLanguageChangeRetainsUnrelatedMusic(t *testing.T) {
	source := map[string]any{"nodes": []any{map[string]any{"id": "video", "data": map[string]any{"kind": "video", "prompt": "Walk"}}}, "edges": []any{}, "shots": []any{map[string]any{"id": "shot", "videoNodeId": "video", "dialogue": "Original", "shotVoiceoverMediaId": "old-voice"}}, "production": map[string]any{"audioTracks": []any{map[string]any{"id": "music", "mediaId": "keep-music"}, map[string]any{"id": "voice", "mediaId": "old-voice"}}}}
	axes := []StudioCampaignAxis{{ID: "language", Kind: "language", Path: "/shots/0/dialogue", Values: []StudioCampaignValue{{ID: "en", Value: "Translated"}}}}
	next, _, _, err := studioCampaignVariantDocument(source, axes, StudioCampaignVariant{Values: map[string]string{"language": "en"}})
	require.NoError(t, err)
	production := next["production"].(map[string]any)
	tracks := studioObjects(production, "audioTracks")
	require.Len(t, tracks, 1)
	require.Equal(t, "keep-music", tracks[0]["mediaId"])
}

func TestStudioCampaignCannotApproveAChangedSampleDraft(t *testing.T) {
	studioProductionFixture(t)
	input := studioCampaignFixture(t)
	_, err := CreateStudioCampaign(1, input)
	require.NoError(t, err)
	job, err := SubmitStudioCampaignVariant(1, input.ID, "v1", true)
	require.NoError(t, err)
	require.NoError(t, model.DB.Model(job).Update("status", "succeeded").Error)
	child, _, err := model.StudioProjectAccess(model.DB, 1, "experiment_v1", false)
	require.NoError(t, err)
	var document map[string]any
	require.NoError(t, common.Unmarshal([]byte(child.Document), &document))
	studioObjects(document, "nodes")[0]["data"].(map[string]any)["prompt"] = "Unmade new direction"
	raw, err := common.Marshal(document)
	require.NoError(t, err)
	_, err = model.SaveStudioProject(1, child.ID, child.Title, child.Revision, string(raw))
	require.NoError(t, err)
	campaign, err := ReadStudioCampaign(1, input.ID)
	require.NoError(t, err)
	_, err = ApproveStudioCampaignSample(1, input.ID, campaign.Revision)
	require.ErrorContains(t, err, "sample draft changed")
}

func TestStudioCampaignTranslatedDialogueRequiresNewVoiceAndMatchingSubtitles(t *testing.T) {
	campaign := &StudioCampaign{Axes: []StudioCampaignAxis{{ID: "language", Kind: "language", Path: "/shots/0/dialogue", Values: []StudioCampaignValue{{ID: "en", Value: "Translated"}}}}}
	variant := &StudioCampaignVariant{Values: map[string]string{"language": "en"}}
	document := map[string]any{"shots": []any{map[string]any{"id": "shot", "dialogue": "Translated"}}}
	require.False(t, studioCampaignDialogueReady(1, campaign, variant, document))
	studioObjects(document, "shots")[0]["shotCaptionText"] = "Translated"
	require.False(t, studioCampaignDialogueReady(1, campaign, variant, document), "translated text alone must not claim a new voice exists")
	campaign.Axes[0].Path = "/shots/0/shotCaptionText"
	require.True(t, studioCampaignDialogueReady(1, campaign, variant, document), "a declared subtitle-only variant does not require dubbed speech")
}

func TestStudioCampaignDatabaseMatrix(t *testing.T) {
	databases := []struct {
		name, dsn string
		dialect   func(string) gorm.Dialector
	}{
		{"sqlite", ":memory:", func(dsn string) gorm.Dialector { return sqlite.Open(dsn) }},
		{"mysql", os.Getenv("STUDIO_TEST_MYSQL_DSN"), func(dsn string) gorm.Dialector { return mysql.Open(dsn) }},
		{"postgres", os.Getenv("STUDIO_TEST_POSTGRES_DSN"), func(dsn string) gorm.Dialector { return postgres.Open(dsn) }},
	}
	for _, database := range databases {
		t.Run(database.name, func(t *testing.T) {
			if database.dsn == "" {
				t.Skip("dedicated database DSN is not configured")
			}
			db, err := gorm.Open(database.dialect(database.dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent), NamingStrategy: schema.NamingStrategy{TablePrefix: fmt.Sprintf("campaign_verify_%d_", time.Now().UnixNano())}})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			sqlDB.SetMaxOpenConns(1)
			previous := model.DB
			model.DB = db
			models := []any{&model.StudioProject{}, &model.StudioProjectVersion{}, &model.StudioProjectMember{}, &model.StudioMedia{}, &model.StudioProjectMediaLink{}, &model.StudioProductionRecord{}, &model.StudioWorkflowJob{}}
			t.Cleanup(func() {
				model.DB = previous
				for _, value := range models {
					require.NoError(t, db.Migrator().DropTable(value))
				}
				sqlDB.Close()
			})
			t.Setenv("STUDIO_STORAGE_DIR", t.TempDir())
			t.Setenv("TASK_ARTIFACT_STORE_MODE", "upstream")
			for range 2 {
				require.NoError(t, db.AutoMigrate(models...))
			}
			input := studioCampaignFixture(t)
			campaign, err := CreateStudioCampaign(1, input)
			require.NoError(t, err)
			require.Len(t, campaign.Variants, 4)
			for range 2 {
				require.NoError(t, db.AutoMigrate(models...))
			}
			again, err := CreateStudioCampaign(1, input)
			require.NoError(t, err)
			require.Equal(t, campaign.SourceDigest, again.SourceDigest)
			var count int64
			require.NoError(t, db.Model(&model.StudioProjectVersion{}).Count(&count).Error)
			require.EqualValues(t, 5, count)
			input.TotalBudget = 1
			_, err = CreateStudioCampaign(1, input)
			require.ErrorIs(t, err, model.ErrStudioRevision)
			_, _, err = model.StudioProjectAccess(db, 2, campaign.Variants[0].ProjectID, false)
			require.ErrorIs(t, err, model.ErrStudioAccess)
			var stored model.StudioProductionRecord
			require.NoError(t, db.First(&stored, "id = ?", campaign.ID).Error)
			var payload StudioCampaign
			require.NoError(t, common.Unmarshal([]byte(stored.Document), &payload))
			require.EqualValues(t, 400, payload.TotalBudget)
		})
	}
}
