package service

import (
	"bytes"
	"context"
	"encoding/base64"
	"image"
	"image/color"
	"image/png"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func studioGenerationReferenceFixture(t *testing.T) (map[string]any, map[string]any, []byte) {
	t.Helper()
	studioProductionFixture(t)
	var pngData []byte
	for index, id := range []string{"ref-red", "ref-green", "ref-blue"} {
		frame := image.NewRGBA(image.Rect(0, 0, 8, 8))
		value := color.RGBA{A: 255}
		switch index {
		case 0:
			value.R = 255
		case 1:
			value.G = 255
		case 2:
			value.B = 255
		}
		for y := range 8 {
			for x := range 8 {
				frame.Set(x, y, value)
			}
		}
		var encoded bytes.Buffer
		require.NoError(t, png.Encode(&encoded, frame))
		pngData = append([]byte(nil), encoded.Bytes()...)
		_, err := SaveStudioMedia(1, id, "image/png", &encoded)
		require.NoError(t, err)
	}
	target := map[string]any{"id": "target", "data": map[string]any{"kind": "image", "model": "flux.2-klein-4b", "prompt": "Private creative instruction", "imageSize": "512x512", "assetIds": []any{"character", "scene"}, "assetVersionIds": map[string]any{"character": "character-old"}, "metadataJson": `{"assets":[{"id":"forged","mediaId":"private"}]}`}}
	document := map[string]any{"id": "reference-film", "title": "Reference film", "edges": []any{map[string]any{"id": "reference-edge", "source": "source", "target": "target", "data": map[string]any{"sourceTakeId": "source-old"}}}, "nodes": []any{map[string]any{"id": "source", "data": map[string]any{"kind": "image", "mediaId": "ref-green", "selectedTakeId": "source-new", "takes": []any{map[string]any{"id": "source-old", "status": "completed", "mediaId": "ref-red"}, map[string]any{"id": "source-new", "status": "completed", "mediaId": "ref-green"}}}}, target}, "assets": []any{map[string]any{"id": "character", "kind": "character", "title": "Character", "prompt": "Current character", "mediaId": "ref-green", "versions": []any{map[string]any{"id": "character-old", "prompt": "Frozen character", "mediaId": "ref-blue"}}}, map[string]any{"id": "scene", "kind": "location", "title": "Scene", "prompt": "Scene", "mediaId": "ref-green"}}}
	for _, node := range studioObjects(document, "nodes") {
		data := node["data"].(map[string]any)
		if data["prompt"] == nil {
			data["prompt"] = "Owned reference"
		}
		for _, take := range studioObjects(data, "takes") {
			take["createdAt"], take["prompt"] = "2026-10-18T00:00:00Z", "Owned reference"
		}
	}
	for _, asset := range studioObjects(document, "assets") {
		for _, version := range studioObjects(asset, "versions") {
			version["createdAt"] = "2026-10-18T00:00:00Z"
		}
	}
	return document, target, pngData
}

func TestStudioGenerationCapturesOnlyTrustedSubmittedReferences(t *testing.T) {
	document, target, _ := studioGenerationReferenceFixture(t)
	captured := &studioGenerationReferences{}
	body, err := studioNodeRequest(t.Context(), 1, document, target, captured)
	require.NoError(t, err)
	snapshot := studioGenerationParameterSnapshot(body, captured)
	for _, secret := range []string{"data:image", "https://", "authorization", "private-secret", "Private creative instruction", "forged"} {
		require.NotContains(t, snapshot, secret)
	}
	var value map[string]any
	require.NoError(t, common.Unmarshal([]byte(snapshot), &value))
	require.Equal(t, true, value["referencesKnown"])
	assets := studioObjects(value, "assets")
	require.Equal(t, []map[string]any{{"id": "character", "versionId": "character-old", "mediaId": "ref-blue"}, {"id": "scene", "mediaId": "ref-green"}}, assets)
	references := studioObjects(value, "references")
	require.Len(t, references, 3)
	require.Equal(t, "source-old", references[0]["sourceTakeId"])
	require.Equal(t, "ref-red", references[0]["mediaId"])
	require.Equal(t, "source", references[0]["sourceNodeId"])
	legacy := studioGenerationParameterSnapshot(body)
	require.NotContains(t, legacy, "assets")
	require.NotContains(t, legacy, "referencesKnown")
}

func TestStudioGenerationReferenceFilteringAfterModelAndRequestOverrides(t *testing.T) {
	document, target, _ := studioGenerationReferenceFixture(t)
	data := target["data"].(map[string]any)
	data["kind"], data["model"], data["seconds"] = "video", "wan2.2-ti2v-5b", 2.
	captured := &studioGenerationReferences{}
	body, err := studioNodeRequest(t.Context(), 1, document, target, captured)
	require.NoError(t, err)
	var snapshot map[string]any
	require.NoError(t, common.Unmarshal([]byte(studioGenerationParameterSnapshot(body, captured)), &snapshot))
	require.Equal(t, true, snapshot["referencesKnown"])
	require.Empty(t, studioObjects(snapshot, "assets"), "Wan first-frame-only excludes character/scene reference images")
	require.Equal(t, "source-old", studioObjects(snapshot, "references")[0]["sourceTakeId"])
	require.Equal(t, "first_frame", studioObjects(snapshot, "references")[0]["role"])
	require.Equal(t, true, snapshot["descriptionReferencesKnown"])
	require.Equal(t, []map[string]any{{"id": "character", "versionId": "character-old", "conditioning": "description-only"}, {"id": "scene", "conditioning": "description-only"}}, studioObjects(snapshot, "descriptionAssets"))
	for _, description := range studioObjects(snapshot, "descriptionAssets") {
		require.NotContains(t, description, "mediaId")
	}
	data["payloadPatchJson"] = `{"prompt":"discard asset descriptions"}`
	_, err = studioNodeRequest(t.Context(), 1, document, target, captured)
	require.ErrorContains(t, err, "unsupported video payload override", "a prompt override must not leave a false description receipt")
	delete(data, "payloadPatchJson")

	data["payloadPatchJson"] = `{"image":"https://private.invalid/image?key=secret","input_reference":"https://private.invalid/image?key=secret","metadata":{"content":[],"assets":[{"id":"forged","mediaId":"ref-blue"}]}}`
	body, err = studioNodeRequest(t.Context(), 1, document, target, captured)
	require.NoError(t, err)
	raw := studioGenerationParameterSnapshot(body, captured)
	snapshot = map[string]any{}
	require.NoError(t, common.Unmarshal([]byte(raw), &snapshot))
	require.Equal(t, false, snapshot["referencesKnown"])
	require.NotContains(t, snapshot, "assets")
	require.Empty(t, studioObjects(snapshot, "references"))
	require.NotContains(t, raw, "private.invalid")
	require.NotContains(t, raw, "secret")
	require.NotContains(t, raw, "forged")
	unsafeRole := []byte(`{"model":"generic-video","metadata":{"content":[{"role":"https://private.invalid/?key=secret","image_url":{"url":"known-private-reference"}}]}}`)
	unsafeCapture := &studioGenerationReferences{Kind: "video", Items: []studioGenerationReference{{URL: "known-private-reference", MediaID: "ref-red", SourceNodeID: "source"}}}
	unsafeSnapshot := studioGenerationParameterSnapshot(unsafeRole, unsafeCapture)
	require.NotContains(t, unsafeSnapshot, "private.invalid")
	require.NotContains(t, unsafeSnapshot, "secret")
	require.Contains(t, unsafeSnapshot, `"referencesKnown":false`)
	sharedFrame := []byte(`{"model":"generic-video","metadata":{"content":[{"role":"first_frame","image_url":{"url":"same-frame"}},{"role":"last_frame","image_url":{"url":"same-frame"}}]}}`)
	sharedCapture := &studioGenerationReferences{Kind: "video", Items: []studioGenerationReference{{URL: "same-frame", MediaID: "ref-red", SourceNodeID: "source", SourceTakeID: "source-old"}}}
	var sharedSnapshot map[string]any
	require.NoError(t, common.Unmarshal([]byte(studioGenerationParameterSnapshot(sharedFrame, sharedCapture)), &sharedSnapshot))
	require.Equal(t, true, sharedSnapshot["referencesKnown"])
	sharedReferences := studioObjects(sharedSnapshot, "references")
	require.Len(t, sharedReferences, 2)
	require.ElementsMatch(t, []any{"first_frame", "last_frame"}, []any{sharedReferences[0]["role"], sharedReferences[1]["role"]})

	delete(data, "payloadPatchJson")
	data["kind"], data["model"] = "image", "flux.2-klein-4b"
	data["reworkRegion"] = map[string]any{"sourceMediaId": "ref-red", "sourceNodeId": "source", "x": 0., "y": 0., "width": 4., "height": 4.}
	body, err = studioNodeRequest(t.Context(), 1, document, target, captured)
	require.NoError(t, err)
	snapshot = map[string]any{}
	require.NoError(t, common.Unmarshal([]byte(studioGenerationParameterSnapshot(body, captured)), &snapshot))
	require.Equal(t, false, snapshot["referencesKnown"], "new crop has no immutable reference ID; original full-image references must not be attributed to it")
	require.NotContains(t, snapshot, "assets")
	require.Empty(t, studioObjects(snapshot, "references"))
}

func TestStudioGenerationPersistsSubmissionReferencesBeforeRelayAndPreservesRecovery(t *testing.T) {
	for _, mode := range []string{"fresh", "recover-submitted", "recover-legacy"} {
		t.Run(mode, func(t *testing.T) {
			document, _, imageData := studioGenerationReferenceFixture(t)
			studioCompleteTestDocument(t, document)
			encoded, err := common.Marshal(document)
			require.NoError(t, err)
			if _, err := ValidateStudioDocument("reference-film", encoded); err != nil {
				var decoded any
				require.NoError(t, common.Unmarshal(encoded, &decoded))
				require.NoError(t, studioDocumentSchema.Validate(decoded))
				t.Fatal(err)
			}
			project, err := model.SaveStudioProject(1, "reference-film", "Reference film", 0, string(encoded))
			require.NoError(t, err)
			job, err := QueueStudioWorkflow(1, project.ID, "reference-request", "generate", project.Revision, 1000, []string{"target"}, nil)
			require.NoError(t, err)
			priorSnapshot := `{"model":"flux.2-klein-4b","assets":[{"id":"frozen-character","versionId":"frozen-version","mediaId":"frozen-media"}],"referencesKnown":true,"references":[]}`
			if mode != "fresh" {
				receipt, err := common.Marshal(map[string]any{"data": []any{map[string]any{"b64_json": base64.StdEncoding.EncodeToString(imageData)}}})
				require.NoError(t, err)
				_, err = SaveStudioMedia(1, "saved-image-receipt", "application/json", bytes.NewReader(receipt))
				require.NoError(t, err)
				progress := StudioWorkflowProgress{NodeID: "target", RequestID: "saved-request", Phase: "responded", ResponseMediaID: "saved-image-receipt"}
				if mode == "recover-submitted" {
					progress.SubmittedSnapshot = priorSnapshot
				}
				raw, err := common.Marshal(progress)
				require.NoError(t, err)
				require.NoError(t, model.DB.Model(job).Update("result", model.StudioDocument(raw)).Error)
			}
			calls := 0
			StudioWorkflowRelay = func(_ context.Context, running *model.StudioWorkflowJob, _ string, _ []byte) (StudioRelayResponse, error) {
				calls++
				require.Equal(t, "fresh", mode, "recovery must collect the existing receipt without submitting inference")
				var stored model.StudioWorkflowJob
				require.NoError(t, model.DB.First(&stored, "id = ?", running.ID).Error)
				var submitting StudioWorkflowProgress
				require.NoError(t, common.Unmarshal([]byte(stored.Result), &submitting))
				require.Equal(t, "submitting", submitting.Phase)
				require.Contains(t, submitting.SubmittedSnapshot, "character-old")
				require.Contains(t, submitting.SubmittedSnapshot, "source-old")
				require.NotContains(t, submitting.SubmittedSnapshot, "data:image")
				response, err := common.Marshal(map[string]any{"data": []any{map[string]any{"b64_json": base64.StdEncoding.EncodeToString(imageData)}}})
				require.NoError(t, err)
				return StudioRelayResponse{Status: 200, ContentType: "application/json", Body: response}, nil
			}
			RunStudioWorkflowsOnce(t.Context(), "reference-worker")
			require.NoError(t, model.DB.First(job, "id = ?", job.ID).Error)
			require.Equal(t, "succeeded", job.Status, job.Error)
			saved, _, err := model.StudioProjectAccess(model.DB, 1, project.ID, false)
			require.NoError(t, err)
			var actual map[string]any
			require.NoError(t, common.Unmarshal([]byte(saved.Document), &actual))
			takes := studioObjects(studioObjects(actual, "nodes")[1]["data"].(map[string]any), "takes")
			require.Len(t, takes, 1)
			snapshot, _ := takes[0]["requestSnapshot"].(string)
			switch mode {
			case "fresh":
				require.Equal(t, 1, calls)
				require.Contains(t, snapshot, "character-old")
			case "recover-submitted":
				require.Zero(t, calls)
				require.JSONEq(t, priorSnapshot, snapshot)
			case "recover-legacy":
				require.Zero(t, calls)
				require.NotContains(t, snapshot, "assets")
				require.NotContains(t, snapshot, "source-old")
			}
		})
	}
}

func TestStudioGenerationRangeRecordsExtractedFrameInsteadOfDiscardedReference(t *testing.T) {
	if !StudioRenderAvailable() {
		t.Skip("FFmpeg and FFprobe are unavailable")
	}
	document, target, _ := studioGenerationReferenceFixture(t)
	path := filepath.Join(t.TempDir(), "range.mp4")
	output, err := exec.CommandContext(t.Context(), studioFFmpegBinary(false), "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=64x64:r=12:d=1", "-c:v", "libx264", path).CombinedOutput()
	require.NoError(t, err, "%s", output)
	file, err := os.Open(path)
	require.NoError(t, err)
	_, err = SaveStudioMedia(1, "range-video", "video/mp4", file)
	require.NoError(t, file.Close())
	require.NoError(t, err)
	document["nodes"] = append(document["nodes"].([]any), map[string]any{"id": "original-video", "data": map[string]any{"kind": "video", "mediaId": "range-video", "takes": []any{map[string]any{"id": "range-take", "mediaId": "range-video", "status": "completed"}}}})
	data := target["data"].(map[string]any)
	data["kind"], data["model"], data["seconds"] = "video", "wan2.2-ti2v-5b", 2.
	data["reworkRange"] = map[string]any{"sourceNodeId": "original-video", "sourceMediaId": "range-video", "start": 0., "end": .5}
	data["derivedFrom"] = map[string]any{"takeId": "range-take", "mediaId": "range-video", "nodeId": "original-video", "action": "range"}
	captured := &studioGenerationReferences{}
	body, err := studioNodeRequest(t.Context(), 1, document, target, captured)
	require.NoError(t, err)
	var snapshot map[string]any
	raw := studioGenerationParameterSnapshot(body, captured)
	require.NoError(t, common.Unmarshal([]byte(raw), &snapshot))
	require.Equal(t, true, snapshot["referencesKnown"])
	require.Empty(t, studioObjects(snapshot, "assets"))
	references := studioObjects(snapshot, "references")
	require.Len(t, references, 1)
	require.Equal(t, "original-video", references[0]["sourceNodeId"])
	require.Equal(t, "range-take", references[0]["sourceTakeId"])
	require.Equal(t, "range-video", references[0]["sourceMediaId"])
	require.NotEqual(t, "range-video", references[0]["mediaId"])
	require.Equal(t, "first_frame", references[0]["role"])
	require.NotContains(t, raw, "ref-red", "original image edge is discarded by range first-frame conditioning")
	require.NotContains(t, raw, "data:image")
}

func TestStudioGenerationSnapshotKeepsOnlyActualNumericFrameSampling(t *testing.T) {
	var snapshot map[string]any
	raw := studioGenerationParameterSnapshot([]byte(`{"model":"wan2.2-ti2v-5b","metadata":{"fps":12.5,"frames":25,"headers":{"authorization":"secret"},"source_url":"https://private.invalid/token"}}`))
	require.NoError(t, common.Unmarshal([]byte(raw), &snapshot))
	require.Equal(t, 12.5, snapshot["fps"])
	require.Equal(t, 25., snapshot["frames"])
	require.NotContains(t, raw, "secret")
	require.NotContains(t, raw, "private")
	for _, metadata := range []string{`{"fps":"12","frames":"25"}`, `{"fps":0,"frames":0}`, `{"fps":-1,"frames":-1}`, `{"fps":241,"frames":1000001}`, `{"fps":true,"frames":false}`, `{"frames":25.5}`} {
		raw = studioGenerationParameterSnapshot([]byte(`{"metadata":` + metadata + `}`))
		require.NoError(t, common.Unmarshal([]byte(raw), &snapshot))
		require.NotContains(t, raw, `"fps"`, metadata)
		require.NotContains(t, raw, `"frames"`, metadata)
	}
}
