package service

import (
	"bytes"
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"image"
	"image/png"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestStudioTemplateVersionedBlueprintSurvivesMotherEdits(t *testing.T) {
	studioProductionFixture(t)
	require.NoError(t, model.DB.AutoMigrate(&model.StudioProductionRecord{}))
	source := `{"id":"source","title":"Coffee","nodes":[{"id":"video","type":"studio","position":{"x":0,"y":0},"data":{"kind":"video","title":"Coffee closeup","prompt":"Coffee on a wooden table","model":"wan","seconds":5,"metadataJson":"{}","status":"idle"}}],"edges":[],"production":{"creativeBrief":{"subject":"Coffee"}},"createdAt":"2026-10-18","updatedAt":"2026-10-18"}`
	project, err := model.SaveStudioProject(1, "source", "Coffee", 0, source)
	require.NoError(t, err)
	request := StudioTemplateSaveRequest{ID: "coffee-template", ProjectID: project.ID, ProjectRevision: 1, Name: "Coffee film", SourceLicense: "Own original", Inputs: []StudioTemplateInput{{ID: "subject", Label: "Subject", Kind: "text", Path: "/production/creativeBrief/subject"}}}
	request.Bindings = []StudioTemplateBinding{{Path: "/nodes/0/data/prompt", Pattern: "{{subject}} on a wooden table"}}
	definition, err := SaveStudioTemplate(1, request)
	require.NoError(t, err)
	assert.EqualValues(t, 1, definition.Version)
	assert.NotContains(t, string(mustStudioTemplateJSON(definition.Blueprint)), "metadataJson")
	_, err = SaveStudioTemplate(2, request)
	require.ErrorIs(t, err, model.ErrStudioAccess)
	instance, err := InstantiateStudioTemplate(1, definition.ID, StudioTemplateInstantiateRequest{ProjectID: "coffee-film", Title: "Tea film", Version: 1, Inputs: map[string]any{"subject": "Tea"}})
	require.NoError(t, err)
	assert.Contains(t, string(instance.Document), "Tea on a wooden table")
	assert.NotContains(t, string(instance.Document), "Coffee on a wooden table")
	expanded, err := InstantiateStudioTemplate(1, definition.ID, StudioTemplateInstantiateRequest{ProjectID: "expanded", Title: "Coffee shop film", Version: 1, Inputs: map[string]any{"subject": "Coffee shop"}})
	require.NoError(t, err)
	assert.Contains(t, string(expanded.Document), "Coffee shop on a wooden table")
	assert.NotContains(t, string(expanded.Document), "Coffee shop shop")
	assert.NotContains(t, string(instance.Document), "assembledMediaId")
	var output map[string]any
	require.NoError(t, common.Unmarshal([]byte(instance.Document), &output))
	origin := output["production"].(map[string]any)["templateOrigin"].(map[string]any)
	assert.EqualValues(t, 1, origin["version"])
	project, err = model.SaveStudioProject(1, "source", "New", 1, strings.ReplaceAll(source, "Coffee", "Juice"))
	require.NoError(t, err)
	request.ExpectedVersion = 1
	request.ProjectRevision = project.Revision
	latest, err := SaveStudioTemplate(1, request)
	require.NoError(t, err)
	assert.EqualValues(t, 2, latest.Version)
	pinned, err := ReadStudioTemplateDefinition(1, definition.ID, 1)
	require.NoError(t, err)
	assert.Contains(t, string(mustStudioTemplateJSON(pinned.Blueprint)), "Coffee on a wooden table")
	list, err := ListStudioTemplateDefinitions(1)
	require.NoError(t, err)
	require.Len(t, list, 1)
	assert.EqualValues(t, 2, list[0].Version)
	_, err = SaveStudioTemplate(1, request)
	require.ErrorIs(t, err, model.ErrStudioRevision)
	_, err = ReadStudioTemplateDefinition(2, definition.ID, 0)
	require.ErrorIs(t, err, model.ErrStudioAccess)
}

func TestStudioTemplateRequiresTypedOwnedMediaAndDoesNotCopyApprovals(t *testing.T) {
	studioProductionFixture(t)
	require.NoError(t, model.DB.AutoMigrate(&model.StudioProductionRecord{}))
	videoFile := filepath.Join(t.TempDir(), "sample.mp4")
	output, err := exec.Command(studioFFmpegBinary(false), "-f", "lavfi", "-i", "color=c=black:s=64x64:d=0.2", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", videoFile).CombinedOutput()
	require.NoError(t, err, string(output))
	videoBytes, err := os.ReadFile(videoFile)
	require.NoError(t, err)
	for _, media := range []model.StudioMedia{{OwnerID: 1, MediaID: "old", MimeType: "video/mp4"}, {OwnerID: 1, MediaID: "new", MimeType: "video/mp4"}, {OwnerID: 1, MediaID: "image", MimeType: "image/png"}, {OwnerID: 2, MediaID: "foreign", MimeType: "video/mp4"}} {
		content := videoBytes
		if media.MimeType == "image/png" {
			content = studioValidImageFixture(t, "png")
		}
		_, err := SaveStudioMedia(media.OwnerID, media.MediaID, media.MimeType, bytes.NewReader(content))
		require.NoError(t, err)
	}
	source := `{"id":"source","title":"Film","nodes":[{"id":"video","type":"studio","position":{"x":0,"y":0},"data":{"kind":"video","title":"Shot","prompt":"walk","mediaId":"old","outputUrl":"https://example.invalid/signed?token=secret","status":"completed"}}],"edges":[],"assembledMediaId":"old","production":{"reviews":[]},"createdAt":"2026-10-18","updatedAt":"2026-10-18"}`
	_, err = model.SaveStudioProject(1, "source", "Film", 0, source)
	require.NoError(t, err)
	definition, err := SaveStudioTemplate(1, StudioTemplateSaveRequest{ID: "template", ProjectID: "source", ProjectRevision: 1, Name: "Film", SourceLicense: "Own"})
	require.NoError(t, err)
	require.Len(t, definition.Slots, 1)
	assert.Equal(t, "old", definition.SampleMediaID)
	assert.NotContains(t, string(mustStudioTemplateJSON(definition.Blueprint)), "secret")
	input := StudioTemplateInstantiateRequest{ProjectID: "instance", Title: "New", Version: 1, Inputs: map[string]any{}}
	_, err = InstantiateStudioTemplate(1, "template", input)
	require.Error(t, err)
	input.Media = map[string]string{"old": "foreign"}
	_, err = InstantiateStudioTemplate(1, "template", input)
	require.Error(t, err)
	input.Media = map[string]string{"old": "image"}
	_, err = InstantiateStudioTemplate(1, "template", input)
	require.Error(t, err)
	input.Media = map[string]string{"old": "new"}
	instance, err := InstantiateStudioTemplate(1, "template", input)
	require.NoError(t, err)
	assert.Contains(t, string(instance.Document), `"mediaId":"new"`)
	assert.NotContains(t, string(instance.Document), "assembledMediaId")
	assert.True(t, StudioProjectHasMedia("instance", "new"))
	_, err = InstantiateStudioTemplate(1, "template", input)
	require.ErrorIs(t, err, model.ErrStudioRevision)
	require.NoError(t, model.DB.Create(&model.StudioProjectMember{ProjectID: "source", UserID: 2, Role: "editor"}).Error)
	_, err = SaveStudioTemplate(2, StudioTemplateSaveRequest{ID: "stolen", ProjectID: "source", ProjectRevision: 1, Name: "No"})
	require.ErrorIs(t, err, model.ErrStudioAccess)
}

func TestStudioTemplateLegacyImportDeduplicatesAndRejectsHiddenRoutes(t *testing.T) {
	studioProductionFixture(t)
	require.NoError(t, model.DB.AutoMigrate(&model.StudioProductionRecord{}))
	request := StudioTemplateSaveRequest{ID: "legacy", Name: "Old parameters", LegacyParameters: map[string]any{"model": "wan", "group": "default", "seconds": float64(5), "ratio": "16:9", "resolution": "640x384"}}
	definition, err := SaveStudioTemplate(1, request)
	require.NoError(t, err)
	assert.Equal(t, "parameters", definition.Kind)
	request.ID = "other-id"
	duplicate, err := SaveStudioTemplate(1, request)
	require.NoError(t, err)
	assert.Equal(t, definition.ID, duplicate.ID)
	request.LegacyParameters["apiKey"] = "do-not-copy"
	_, err = SaveStudioTemplate(1, request)
	require.Error(t, err)
	_, _, err = studioTemplateInputTarget(definition.Blueprint, "/nodes/0/data/model")
	require.Error(t, err)
}

func TestStudioTemplateBindingsInvalidateOnlyLiveDependentsAndKeepHistoricalSources(t *testing.T) {
	studioProductionFixture(t)
	require.NoError(t, model.DB.AutoMigrate(&model.StudioProductionRecord{}))
	var encoded bytes.Buffer
	require.NoError(t, png.Encode(&encoded, image.NewRGBA(image.Rect(0, 0, 8, 8))))
	for _, id := range []string{"old", "replacement"} {
		_, err := SaveStudioMedia(1, id, "image/png", bytes.NewReader(encoded.Bytes()))
		require.NoError(t, err)
	}
	source := `{"id":"source","title":"Film","nodes":[{"id":"image","type":"studio","position":{"x":0,"y":0},"data":{"kind":"image","title":"Old image","prompt":"A Coffee on a table","model":"flux","status":"completed","mediaId":"old","selectedTakeId":"original","takes":[{"id":"original","createdAt":"2026-10-18","prompt":"A Coffee on a table","status":"completed","mediaId":"old"}]}},{"id":"live","type":"studio","position":{"x":0,"y":0},"data":{"kind":"image","title":"Live","prompt":"Animate","model":"flux","status":"completed","mediaId":"old"}},{"id":"pinned","type":"studio","position":{"x":0,"y":0},"data":{"kind":"image","title":"Pinned","prompt":"Animate","model":"flux","status":"completed","mediaId":"old"}},{"id":"unrelated","type":"studio","position":{"x":0,"y":0},"data":{"kind":"image","title":"Unrelated","prompt":"Coffee unrelated","model":"flux","status":"completed","mediaId":"old"}}],"edges":[{"id":"live-edge","source":"image","target":"live"},{"id":"pinned-edge","source":"image","target":"pinned","data":{"sourceTakeId":"original"}}],"production":{"creativeBrief":{"subject":"Coffee"}},"createdAt":"2026-10-18","updatedAt":"2026-10-18"}`
	_, err := model.SaveStudioProject(1, "source", "Film", 0, source)
	require.NoError(t, err)
	request := StudioTemplateSaveRequest{ID: "bindings", ProjectID: "source", ProjectRevision: 1, Name: "Film", Inputs: []StudioTemplateInput{{ID: "subject", Label: "Subject", Kind: "text", Path: "/production/creativeBrief/subject"}}, Bindings: []StudioTemplateBinding{{Path: "/nodes/0/data/prompt", Pattern: "A {{subject}} on a table"}}}
	definition, err := SaveStudioTemplate(1, request)
	require.NoError(t, err)
	originalHistory := string(mustStudioTemplateJSON(studioObjects(studioObjects(definition.Blueprint, "nodes")[0]["data"].(map[string]any), "takes")))
	instance, err := InstantiateStudioTemplate(1, "bindings", StudioTemplateInstantiateRequest{ProjectID: "changed", Title: "Tea", Version: 1, Inputs: map[string]any{"subject": "Tea"}, ReuseOriginalMedia: true})
	require.NoError(t, err)
	var result map[string]any
	require.NoError(t, common.Unmarshal([]byte(instance.Document), &result))
	nodes := studioObjects(result, "nodes")
	active := nodes[0]["data"].(map[string]any)
	assert.Equal(t, "A Tea on a table", active["prompt"])
	assert.Nil(t, active["mediaId"])
	assert.Nil(t, active["selectedTakeId"])
	assert.Equal(t, "idle", active["status"])
	assert.Equal(t, originalHistory, string(mustStudioTemplateJSON(studioObjects(active, "takes"))))
	assert.Nil(t, nodes[1]["data"].(map[string]any)["mediaId"])
	assert.Equal(t, "old", nodes[2]["data"].(map[string]any)["mediaId"])
	assert.Equal(t, "Coffee unrelated", nodes[3]["data"].(map[string]any)["prompt"])
	assert.Equal(t, "old", nodes[3]["data"].(map[string]any)["mediaId"])
	var stored model.StudioProject
	require.NoError(t, model.DB.First(&stored, "id = ?", "source").Error)
	assert.JSONEq(t, source, string(stored.Document))

	// An explicit replacement becomes the active upload while the old immutable
	// Take (and every edge pinned to it) keeps its original media and wording.
	instance, err = InstantiateStudioTemplate(1, "bindings", StudioTemplateInstantiateRequest{ProjectID: "replacement-film", Title: "Replacement", Version: 1, Inputs: map[string]any{"subject": "Coffee"}, Media: map[string]string{"old": "replacement"}})
	require.NoError(t, err)
	require.NoError(t, common.Unmarshal([]byte(instance.Document), &result))
	active = studioObjects(result, "nodes")[0]["data"].(map[string]any)
	assert.Equal(t, "replacement", active["mediaId"])
	assert.Nil(t, active["selectedTakeId"])
	assert.Equal(t, originalHistory, string(mustStudioTemplateJSON(studioObjects(active, "takes"))))
}

func TestStudioTemplateBindingConfigurationFailsClosedAndNeverClaimsSemanticRewrite(t *testing.T) {
	document := map[string]any{"nodes": []any{map[string]any{"data": map[string]any{"prompt": "Ceramic blue mug", "title": "Mug", "takes": []any{map[string]any{"prompt": "Original"}}}}}, "production": map[string]any{"creativeBrief": map[string]any{"subject": "Blue travel mug"}}}
	base := StudioTemplateDefinition{Blueprint: document, Inputs: []StudioTemplateInput{{ID: "subject", Kind: "text", Path: "/production/creativeBrief/subject", Default: "Blue travel mug"}}}
	for name, binding := range map[string]StudioTemplateBinding{
		"unknown":           {Path: "/nodes/0/data/prompt", Pattern: "{{missing}}"},
		"history":           {Path: "/nodes/0/data/takes/0/prompt", Pattern: "{{subject}}"},
		"credentials":       {Path: "/nodes/0/data/requestSnapshot/prompt", Pattern: "{{subject}}"},
		"overlap":           {Path: "/production/creativeBrief/subject", Pattern: "{{subject}}"},
		"semantic mismatch": {Path: "/nodes/0/data/prompt", Pattern: "{{subject}}"},
		"unclosed":          {Path: "/nodes/0/data/prompt", Pattern: "{{subject}"},
		"oversize":          {Path: "/nodes/0/data/prompt", Pattern: strings.Repeat("x", 30001) + "{{subject}}"},
	} {
		t.Run(name, func(t *testing.T) {
			definition := base
			definition.Bindings = []StudioTemplateBinding{binding}
			require.Error(t, studioTemplateValidateBindings(&definition))
		})
	}
	for _, path := range []string{"/assets/0/versions/0/prompt", "/history/0/title", "/production/receipt/text", "/nodes/0/data/textDocument/blocks/0/text", "/production/shotNarrative/shot/information/extra", "/nodes/00/data/prompt"} {
		_, _, err := studioTemplateInputTarget(document, path)
		require.Error(t, err, path)
	}
	assert.Greater(t, studioTemplateTargetLimit("/assets/0/profile/wardrobe"), 0)
	assert.Greater(t, studioTemplateTargetLimit("/production/scenes/0/description"), 0)
	assert.Greater(t, studioTemplateTargetLimit("/production/shotNarrative/shot/information"), 0)
	assert.Greater(t, studioTemplateTargetLimit("/production/timeline/0/caption"), 0)
}

func TestStudioTemplateSixRecipeBindingsMatchExplicitCreativeTargets(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "docs", "studio", "evidence", "optimization-20261018", "samples", "strict-recipe-input-examples.json"))
	require.NoError(t, err)
	var examples struct {
		Samples []struct {
			ID       string                  `json:"id"`
			Inputs   []StudioTemplateInput   `json:"inputs"`
			Bindings []StudioTemplateBinding `json:"bindings"`
		} `json:"samples"`
	}
	require.NoError(t, common.Unmarshal(raw, &examples))
	require.Len(t, examples.Samples, 6)
	allowed := map[string]bool{"store": true, "product": true, "story": true, "explain": true, "presenter": true, "music": true}
	for _, sample := range examples.Samples {
		t.Run(sample.ID, func(t *testing.T) {
			require.True(t, allowed[sample.ID])
			blueprint, err := os.ReadFile(filepath.Join("..", "web", "public", "studio-examples", sample.ID, "project.json"))
			require.NoError(t, err)
			definition := StudioTemplateDefinition{Inputs: sample.Inputs, Bindings: sample.Bindings}
			require.NoError(t, common.Unmarshal(blueprint, &definition.Blueprint))
			for _, input := range sample.Inputs {
				parent, key, err := studioTemplateInputTarget(definition.Blueprint, input.Path)
				require.NoError(t, err)
				assert.Equal(t, input.Default, parent[key])
			}
			require.NoError(t, studioTemplateValidateBindings(&definition))
		})
	}
}

func TestStudioTemplateChangedProfileKeepsExplicitNewReferenceAndFixedOriginalVersions(t *testing.T) {
	var document map[string]any
	require.NoError(t, common.Unmarshal([]byte(`{"assets":[{"id":"hero","prompt":"Hero","profile":{"wardrobe":"blue coat"},"mediaId":"new-reference","versions":[{"id":"fixed","profile":{"wardrobe":"red coat"},"mediaId":"old-reference"}]}],"nodes":[{"id":"live","data":{"kind":"image","model":"flux","mediaId":"old-output","assetIds":["hero"]}},{"id":"fixed","data":{"kind":"image","model":"flux","mediaId":"old-output","assetIds":["hero"],"assetVersionIds":{"hero":"fixed"}}},{"id":"continuity-fixed","data":{"kind":"video","model":"wan","mediaId":"old-output"}}],"shots":[{"id":"shot","videoNodeId":"continuity-fixed"}],"production":{"continuityStates":[{"shotId":"shot","assetId":"hero","versionId":"fixed"}]}}`), &document))
	versions := string(mustStudioTemplateJSON(studioObjects(document, "assets")[0]["versions"]))
	studioTemplateInvalidateChanged(document, []string{"/assets/0/profile/wardrobe"}, nil, map[string]bool{"hero": true})
	assert.Equal(t, "new-reference", studioObjects(document, "assets")[0]["mediaId"])
	assert.Equal(t, versions, string(mustStudioTemplateJSON(studioObjects(document, "assets")[0]["versions"])))
	nodes := studioObjects(document, "nodes")
	assert.Nil(t, nodes[0]["data"].(map[string]any)["mediaId"])
	assert.Equal(t, "old-output", nodes[1]["data"].(map[string]any)["mediaId"])
	assert.Equal(t, "old-output", nodes[2]["data"].(map[string]any)["mediaId"])
	studioTemplateInvalidateChanged(document, []string{"/assets/0/profile/wardrobe"}, nil, nil)
	assert.Nil(t, studioObjects(document, "assets")[0]["mediaId"])
}
