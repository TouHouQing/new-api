package service

import (
	"math"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func studioSceneReviewFixture(t *testing.T) (*model.StudioProject, string, StudioSceneEvidence) {
	t.Helper()
	project, _ := studioMediaIndexFixture(t)
	var document map[string]any
	require.NoError(t, common.Unmarshal([]byte(project.Document), &document))
	document["production"] = map[string]any{"guide": map[string]any{"step": "story", "goal": "product"}}
	raw, err := common.Marshal(document)
	require.NoError(t, err)
	project, err = model.SaveStudioProject(1, project.ID, project.Title, project.Revision, string(raw))
	require.NoError(t, err)
	mediaID := studioObjects(document, "nodes")[0]["data"].(map[string]any)["mediaId"].(string)
	job := &model.StudioWorkflowJob{ID: "scene-review-job", RequestID: "scene-review-request", Kind: "inspect", Status: "running", UserID: 1, ProjectID: project.ID, Revision: project.Revision, LeaseOwner: "worker", Result: "{}"}
	require.NoError(t, model.DB.Create(job).Error)
	require.NoError(t, RunStudioInspect(t.Context(), job, project, &StudioWorkflowPlan{Document: document, Operation: &StudioMediaOperation{Action: "scene_detect", MediaID: mediaID, TakeID: "take-1", Inspect: &StudioInspectOptions{Start: 0, End: 61}}}))
	var progress map[string]any
	require.NoError(t, common.Unmarshal([]byte(job.Result), &progress))
	id := progress["record_id"].(string)
	_, evidence, _, err := ReadStudioSceneEvidence(1, project.ID, id)
	require.NoError(t, err)
	require.Len(t, evidence.Cuts, 2)
	return project, id, evidence
}

func TestStudioSceneCorrectionRealPTSMergeSplitAndImmutableParent(t *testing.T) {
	project, id, evidence := studioSceneReviewFixture(t)
	first := evidence.Cuts[0].Time
	request := StudioSceneCorrectionRequest{RequestID: "scene-correction", AnalysisID: id, ReviewConfirmed: true, Cuts: []StudioSceneBoundary{{Time: first + .02, OriginalTime: &first, Reason: "review flash"}, {Time: 30.12, Reason: "split manually"}}}
	correction, err := SaveStudioSceneCorrection(t.Context(), 1, project.ID, request)
	require.NoError(t, err)
	_, reviewed, expanded, err := ReadStudioSceneEvidence(1, project.ID, correction.ID)
	require.NoError(t, err)
	assert.Equal(t, "scene_correction", reviewed.Kind)
	assert.Equal(t, id, reviewed.ParentID)
	require.Len(t, reviewed.Cuts, 2)
	assert.Equal(t, first, reviewed.Cuts[0].Time)
	assert.InDelta(t, 30.125, reviewed.Cuts[1].Time, 1e-6)
	assert.Equal(t, "human_reviewed_source_pts", reviewed.Cuts[0].Origin)
	assert.Equal(t, "take-1", reviewed.SourceTakeID)
	assert.Equal(t, []float64{60}, reviewed.Removed)
	assert.NotEmpty(t, expanded["source_digest"])
	_, original, _, err := ReadStudioSceneEvidence(1, project.ID, id)
	require.NoError(t, err)
	assert.Equal(t, evidence, original)
	retry, err := SaveStudioSceneCorrection(t.Context(), 1, project.ID, request)
	require.NoError(t, err)
	assert.Equal(t, correction.ID, retry.ID)
	var current model.StudioProject
	require.NoError(t, model.DB.First(&current, "id = ?", project.ID).Error)
	assert.Equal(t, project.Document, current.Document)
	assert.Equal(t, project.Revision, current.Revision)
	_, _, _, err = ReadStudioSceneEvidence(1, project.ID, studioInspectRecordID("scene-review-job", "chunk-0"))
	require.ErrorContains(t, err, "chunk receipt")
}

func TestStudioSceneCorrectionRejectsInvalidSourceAndBoundaries(t *testing.T) {
	project, id, evidence := studioSceneReviewFixture(t)
	for i, cuts := range [][]StudioSceneBoundary{{{Time: math.NaN()}}, {{Time: 0}}, {{Time: 61}}, {{Time: 30}, {Time: 20}}, {{Time: .1}, {Time: .101}}} {
		_, err := SaveStudioSceneCorrection(t.Context(), 1, project.ID, StudioSceneCorrectionRequest{RequestID: "invalid-correction-" + string(rune('a'+i)), AnalysisID: id, Cuts: cuts, ReviewConfirmed: true})
		require.Error(t, err)
	}
	unknown := 33.0
	_, err := SaveStudioSceneCorrection(t.Context(), 1, project.ID, StudioSceneCorrectionRequest{RequestID: "unknown-boundary", AnalysisID: id, Cuts: []StudioSceneBoundary{{Time: 33, OriginalTime: &unknown}}, ReviewConfirmed: true})
	require.ErrorContains(t, err, "unknown")
	_, err = SaveStudioSceneCorrection(t.Context(), 2, project.ID, StudioSceneCorrectionRequest{RequestID: "forbidden-boundary", AnalysisID: id, Cuts: evidence.Cuts, ReviewConfirmed: true})
	require.ErrorIs(t, err, model.ErrStudioAccess)
	_, _, _, err = ReadStudioSceneEvidence(1, "other-project", id)
	require.ErrorIs(t, err, model.ErrStudioAccess)
	_, err = model.SaveStudioProject(1, project.ID, project.Title, project.Revision, `{"id":"inspect-project","title":"Removed source","nodes":[],"edges":[]}`)
	require.NoError(t, err)
	_, err = SaveStudioSceneCorrection(t.Context(), 1, project.ID, StudioSceneCorrectionRequest{RequestID: "removed-source", AnalysisID: id, ReviewConfirmed: true})
	require.ErrorContains(t, err, "no longer part")
}

func TestStudioSceneAdaptationPreviewsIndependentDraftThenAppliesOnce(t *testing.T) {
	project, id, _ := studioSceneReviewFixture(t)
	request := StudioSceneAdaptationRequest{RequestID: "adapt-own-subject", Revision: project.Revision, AnalysisID: id, Subject: "Our handmade ceramic cups", Brand: "Own studio", Goal: "Show the glazing process", Title: "A cup of our own", ReviewConfirmed: true, Shots: []StudioSceneDraftShot{}}
	for i, text := range []string{"Our artisan introduces the unglazed cup", "Our artisan brushes blue glaze onto our cup", "Our own finished blue cup on the table"} {
		request.Shots = append(request.Shots, StudioSceneDraftShot{SceneIndex: i, Title: text, Text: text, ImagePrompt: text, VideoPrompt: text + ", gentle hand movement"})
	}
	plan, err := PrepareStudioSceneAdaptation(t.Context(), 1, project.ID, request)
	require.NoError(t, err)
	var payload struct {
		Next   map[string]any `json:"next_document"`
		Impact struct {
			Shots []struct {
				Start   float64 `json:"source_start"`
				End     float64 `json:"source_end"`
				Seconds int     `json:"draft_seconds"`
			} `json:"shots"`
		} `json:"impact"`
	}
	require.NoError(t, common.Unmarshal([]byte(plan.Document), &payload))
	require.Len(t, payload.Impact.Shots, 3)
	assert.Equal(t, 1.0, payload.Impact.Shots[1].Start)
	assert.Equal(t, 60.0, payload.Impact.Shots[1].End)
	assert.Equal(t, 59, payload.Impact.Shots[1].Seconds)
	var original map[string]any
	require.NoError(t, common.Unmarshal([]byte(project.Document), &original))
	assert.Equal(t, original["nodes"], payload.Next["nodes"])
	assert.Equal(t, original["edges"], payload.Next["edges"])
	assert.Equal(t, "product", payload.Next["production"].(map[string]any)["guide"].(map[string]any)["goal"])
	var draft struct {
		Title string `json:"title"`
		Brief string `json:"brief"`
		Shots []struct {
			Text    string `json:"text"`
			Seconds int    `json:"seconds"`
		} `json:"shots"`
	}
	require.NoError(t, common.Unmarshal([]byte(payload.Next["production"].(map[string]any)["screenplayDraft"].(string)), &draft))
	assert.Contains(t, draft.Brief, request.Subject)
	assert.Equal(t, request.Title, draft.Title)
	assert.Equal(t, request.Shots[0].Text, draft.Shots[0].Text)
	var current model.StudioProject
	require.NoError(t, model.DB.First(&current, "id = ?", project.ID).Error)
	assert.Equal(t, project.Document, current.Document, "preparation must not alter the project")
	conflict := request
	conflict.RequestID, conflict.Revision = "stale-adaptation", project.Revision+1
	_, err = PrepareStudioSceneAdaptation(t.Context(), 1, project.ID, conflict)
	require.ErrorIs(t, err, model.ErrStudioRevision)
	applied, _, err := model.ApplyStudioEditRecord(1, plan.ID, project.Revision)
	require.NoError(t, err)
	assert.Equal(t, project.Revision+1, applied.Revision)
	retry, err := PrepareStudioSceneAdaptation(t.Context(), 1, project.ID, request)
	require.NoError(t, err)
	assert.Equal(t, plan.ID, retry.ID)
	again, _, err := model.ApplyStudioEditRecord(1, plan.ID, project.Revision)
	require.NoError(t, err)
	assert.Equal(t, applied.Revision, again.Revision)
	request.RequestID, request.Revision = "replace-existing-draft", applied.Revision
	_, err = PrepareStudioSceneAdaptation(t.Context(), 1, project.ID, request)
	require.ErrorContains(t, err, "draft already exists")
	request.ReplaceDraft = true
	_, err = PrepareStudioSceneAdaptation(t.Context(), 1, project.ID, request)
	require.NoError(t, err)
}
