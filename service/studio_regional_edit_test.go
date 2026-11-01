/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
package service

import (
	"context"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func studioRegionalEditFixtureDocument() map[string]any {
	clip := func(id string, start, end float64) map[string]any {
		return map[string]any{"id": id, "nodeId": "node", "takeId": "old-take", "sourceMediaId": "regional-edit-source", "sourceTitle": "Frozen source", "trimStart": start, "trimEnd": end, "speed": 1., "muted": true, "volume": 0., "caption": "clip caption", "captionOffset": 2., "captionDuration": 4., "fadeIn": 0., "fadeOut": 0.}
	}
	version := map[string]any{"id": "version-en", "episodeId": "episode", "title": "English", "language": "en", "region": "US", "width": 96, "height": 64, "fps": 12, "fit": "letterbox", "subtitles": "1\n00:00:02,000 --> 00:00:04,000\nFirst\n\n2\n00:00:10,000 --> 00:00:12,000\nSecond\n", "timeline": []any{clip("a", 0, 10), clip("b", 4, 6)}, "audioTracks": []any{map[string]any{"id": "voice", "mediaId": "audio", "start": 0., "offset": 0., "duration": 12., "speed": 1., "volume": 1.}, map[string]any{"id": "music", "mediaId": "music", "start": 0., "offset": 0., "duration": 12., "volume": .2, "anchorKind": "project"}, map[string]any{"id": "source-voice", "mediaId": "audio", "start": 0., "offset": 2., "duration": 4., "speed": 1., "volume": 1., "anchorKind": "source", "anchorClipId": "a", "anchorSourceStart": 2.}, map[string]any{"id": "clip-effect", "mediaId": "audio", "start": 0., "offset": .5, "duration": 2., "speed": 1., "volume": 1., "anchorKind": "clip", "anchorClipId": "a", "anchorSourceStart": .5}}, "motionGraphics": []any{map[string]any{"id": "title", "start": 2., "end": 10., "animation": "slide", "phaseOffset": 0., "phaseDuration": 8.}}}
	other, _ := studioRegionalClone(version)
	other["id"], other["language"] = "version-es", "es"
	return map[string]any{"id": "regional-edit-film", "title": "Frozen mother", "createdAt": "2026-10-19T00:00:00Z", "updatedAt": "2026-10-19T00:00:00Z", "nodes": []any{}, "edges": []any{}, "assets": []any{}, "captionsText": "Mother subtitles", "soundtrackMediaId": "mother-music", "soundtrackVolume": .3, "production": map[string]any{"documentVersion": 2, "timeline": []any{clip("mother", 0, 10)}, "audioTracks": []any{}, "motionGraphics": []any{}, "appliedEditPlans": []any{"mother-audit"}, "episodes": []any{map[string]any{"id": "episode", "title": "Episode", "synopsis": "", "shotIds": []any{}}}, "regionalVersions": []any{version, other}}}
}
func TestStudioRegionalClipEditRemapsClocksAndLeavesMotherAndOtherVersionExact(t *testing.T) {
	original := studioRegionalEditFixtureDocument()
	before, _ := common.Marshal(original)
	projected, err := studioRegionalEditDocument(original, "version-en")
	require.NoError(t, err)
	start, end, speed := 2., 8., 2.
	next, retained, _, err := studioCompileRegionalClipEdit(t.Context(), &model.StudioProject{OwnerID: 1}, projected, StudioEditRequest{RequestID: "regional-change", VersionID: "version-en", Action: "edit_clip", ClipID: "a", TrimStart: &start, TrimEnd: &end, Speed: &speed}, map[string]float64{"a": 10, "b": 10, "audio": 12, "music": 12})
	require.NoError(t, err)
	require.Equal(t, []StudioSourceRange{{0, 5}}, retained)
	p, clips := studioTimelineDocument(next)
	require.Equal(t, "a", clips[0]["id"])
	require.Equal(t, 0., clips[0]["captionOffset"])
	require.Equal(t, 2., clips[0]["captionDuration"])
	require.Contains(t, next["captionsText"], "00:00:00,000 --> 00:00:01,000")
	require.Contains(t, next["captionsText"], "00:00:03,000 --> 00:00:05,000")
	graphics := studioObjects(p, "motionGraphics")
	require.Len(t, graphics, 1)
	require.Equal(t, 3., graphics[0]["end"])
	require.Equal(t, 4., graphics[0]["phaseDuration"])
	tracks := studioObjects(p, "audioTracks")
	var voice, source, clip, music []map[string]any
	for _, v := range tracks {
		switch v["anchorKind"] {
		case "source":
			source = append(source, v)
		case "clip":
			clip = append(clip, v)
		case "project":
			music = append(music, v)
		default:
			voice = append(voice, v)
		}
	}
	require.Len(t, voice, 2)
	require.Equal(t, 2., voice[0]["start"])
	require.Equal(t, 6., voice[0]["duration"])
	require.Equal(t, 2., voice[0]["speed"])
	require.Equal(t, 3., voice[1]["offset"])
	require.Len(t, source, 1)
	require.Equal(t, 2., source[0]["speed"])
	require.Equal(t, 0., source[0]["offset"])
	require.Len(t, clip, 1)
	require.Equal(t, 1.5, clip[0]["start"])
	require.Equal(t, .5, clip[0]["duration"])
	require.Equal(t, 1., clip[0]["speed"])
	require.Equal(t, .2, music[0]["volume"])
	require.Equal(t, 0., music[0]["offset"])
	restored, err := studioRestoreRegionalEditDocument(original, next, "version-en")
	require.NoError(t, err)
	oldP, _ := original["production"].(map[string]any)
	newP, _ := restored["production"].(map[string]any)
	require.Equal(t, studioObjects(oldP, "regionalVersions")[1], studioObjects(newP, "regionalVersions")[1])
	for key, value := range original {
		if key != "production" {
			a, _ := common.Marshal(value)
			b, _ := common.Marshal(restored[key])
			require.JSONEq(t, string(a), string(b))
		}
	}
	for key, value := range oldP {
		if key != "regionalVersions" {
			a, _ := common.Marshal(value)
			b, _ := common.Marshal(newP[key])
			require.JSONEq(t, string(a), string(b))
		}
	}
	after, _ := common.Marshal(original)
	require.Equal(t, string(before), string(after), "input must remain immutable")
}
func TestStudioRegionalClipEditRejectsUnknownAndUnsafeInputs(t *testing.T) {
	original := studioRegionalEditFixtureDocument()
	_, err := studioRegionalEditDocument(original, "missing")
	require.Error(t, err)
	for _, value := range []float64{0, math.NaN(), math.Inf(1), .249, 4.001} {
		projected, _ := studioRegionalEditDocument(original, "version-en")
		_, _, _, err := studioCompileRegionalClipEdit(t.Context(), &model.StudioProject{}, projected, StudioEditRequest{RequestID: "invalid", ClipID: "a", Speed: &value}, map[string]float64{"a": 10, "b": 10, "audio": 12})
		require.Error(t, err)
	}
	for _, value := range []float64{-1, 11} {
		projected, _ := studioRegionalEditDocument(original, "version-en")
		_, _, _, err := studioCompileRegionalClipEdit(t.Context(), &model.StudioProject{}, projected, StudioEditRequest{RequestID: "invalid", ClipID: "a", TrimEnd: &value}, map[string]float64{"a": 10, "b": 10, "audio": 12})
		require.Error(t, err)
	}
}
func TestStudioRegionalSourceCutAlsoMapsLegacyVoices(t *testing.T) {
	original := studioRegionalEditFixtureDocument()
	projected, _ := studioRegionalEditDocument(original, "version-en")
	p, _ := projected["production"].(map[string]any)
	p["audioTracks"] = []any{studioObjects(p, "audioTracks")[0]}
	request := StudioEditRequest{RequestID: "cut", ClipID: "a", Ranges: []StudioSourceRange{{2, 4}}}
	durations := map[string]float64{"a": 10, "b": 10, "audio": 12}
	next, retained, err := CompileStudioTimelineCut(projected, request, durations)
	require.NoError(t, err)
	require.NoError(t, studioRegionalCutAudio(projected, next, retained, durations, request))
	changed, _ := next["production"].(map[string]any)
	audio := studioObjects(changed, "audioTracks")
	require.Len(t, audio, 3)
	require.Equal(t, 0., audio[0]["start"])
	require.Equal(t, 2., audio[1]["offset"])
	require.Equal(t, 4., audio[1]["start"])
	require.Equal(t, 8., audio[2]["offset"])
	require.Equal(t, 10., audio[2]["start"])
}

// One real CPU fixture covers pinned-source probing, stored Take selection,
// CAS/idempotency and actor isolation. It never invokes an inference relay.
func TestStudioRegionalEditPlanActualMediaCASAndTakeIsolation(t *testing.T) {
	if !StudioRenderAvailable() {
		t.Skip("requires CPU FFmpeg")
	}
	studioProductionFixture(t)
	StudioWorkflowRelay = func(context.Context, *model.StudioWorkflowJob, string, []byte) (StudioRelayResponse, error) {
		t.Fatal("regional edits must not run models")
		return StudioRelayResponse{}, nil
	}
	path := filepath.Join(t.TempDir(), "source.mp4")
	output, err := exec.Command(studioFFmpegBinary(false), "-v", "error", "-f", "lavfi", "-i", "color=blue:s=96x64:r=12:d=10", "-f", "lavfi", "-i", "sine=frequency=880:duration=10", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", path).CombinedOutput()
	require.NoError(t, err, string(output))
	otherPath := filepath.Join(filepath.Dir(path), "other.mp4")
	output, err = exec.Command(studioFFmpegBinary(false), "-v", "error", "-i", path, "-vf", "negate", "-c:v", "libx264", "-c:a", "copy", otherPath).CombinedOutput()
	require.NoError(t, err, string(output))
	for id, mediaPath := range map[string]string{"regional-edit-source": path, "regional-edit-take-two": otherPath} {
		f, err := os.Open(mediaPath)
		require.NoError(t, err)
		_, err = SaveStudioMedia(1, id, "video/mp4", f)
		require.NoError(t, err)
		require.NoError(t, f.Close())
	}
	document := studioRegionalEditFixtureDocument()
	delete(document, "soundtrackMediaId")
	document["captionsText"] = ""
	document["nodes"] = []any{map[string]any{"id": "node", "type": "studio", "position": map[string]any{"x": 0, "y": 0}, "data": map[string]any{"kind": "video", "title": "Original node", "status": "completed", "sourceMode": "upload", "mediaId": "regional-edit-source", "selectedTakeId": "old-take", "takes": []any{map[string]any{"id": "old-take", "mediaId": "regional-edit-source", "status": "completed", "sourceMode": "upload", "createdAt": "2026-10-19T00:00:00Z"}, map[string]any{"id": "new-take", "mediaId": "regional-edit-take-two", "status": "completed", "sourceMode": "upload", "createdAt": "2026-10-19T00:00:00Z"}}}}}
	p, _ := document["production"].(map[string]any)
	for _, c := range studioObjects(p, "timeline") {
		delete(c, "sourceMediaId")
		delete(c, "sourceTitle")
	}
	for _, v := range studioObjects(p, "regionalVersions") {
		v["audioTracks"] = []any{}
		v["motionGraphics"] = []any{}
		v["subtitles"] = ""
	}
	for _, n := range studioObjects(document, "nodes") {
		d, _ := n["data"].(map[string]any)
		d["prompt"] = "Owned CPU fixture"
		for _, take := range studioObjects(d, "takes") {
			take["prompt"] = "Owned CPU fixture"
		}
	}
	studioCompleteTestDocument(t, document)
	raw, err := common.Marshal(document)
	require.NoError(t, err)
	project, err := model.SaveStudioProject(1, "regional-edit-film", "Frozen mother", 0, string(raw))
	require.NoError(t, err)
	mismatched := map[string]any{"nodeId": "node", "takeId": "old-take", "sourceMediaId": "regional-edit-take-two"}
	_, _, err = studioEditClipSource(1, document, mismatched, "version-en")
	require.ErrorContains(t, err, "exact stored Take")
	// Reviewed manual tracking fixture belongs to this exact source/project.
	_, err = SaveStudioAnalysisResult(1, project, "regional-tracking", "regional-edit-source", StudioTracking{Kind: "subject_track", TargetAspect: 64. / 96., Points: []StudioTrackingPoint{{Time: 0, Crop: StudioInspectROI{X: 0, Y: 0, Width: 4. / 9., Height: 1}, Confidence: 1, Manual: true}, {Time: 10, Crop: StudioInspectROI{X: .2, Y: 0, Width: 4. / 9., Height: 1}, Confidence: 1, Manual: true}}}, []string{"Self-authored CPU regression keys, no algorithm-quality claim."})
	require.NoError(t, err)
	framed, err := PrepareStudioEditPlan(t.Context(), 1, project.ID, StudioEditRequest{RequestID: "regional-reframe", Revision: project.Revision, VersionID: "version-en", Action: "apply_reframe", ClipID: "a", AnalysisID: "regional-tracking", Width: 64, Height: 96, ReviewConfirmed: true})
	require.NoError(t, err)
	var framedDoc StudioEditPlanDocument
	require.NoError(t, common.Unmarshal([]byte(framed.Document), &framedDoc))
	framedP, _ := framedDoc.NextDocument["production"].(map[string]any)
	framedVersion := studioObjects(framedP, "regionalVersions")[0]
	require.Equal(t, 64., framedVersion["width"])
	require.Equal(t, 96., framedVersion["height"])
	require.NotEmpty(t, framedVersion["reframes"])
	require.Equal(t, document["production"].(map[string]any)["width"], framedP["width"])
	projected, _ := studioRegionalEditDocument(document, "version-en")
	projectedP, _ := projected["production"].(map[string]any)
	projectedP["audioTracks"] = []any{map[string]any{"id": "bound-voice", "mediaId": "regional-edit-source", "start": 0., "offset": 2., "duration": 2., "speed": 1., "volume": 1., "anchorKind": "source", "anchorClipId": "a", "anchorSourceStart": 2.}}
	_, _, _, err = studioCompileRegionalClipEdit(t.Context(), project, projected, StudioEditRequest{RequestID: "unsafe-take", ClipID: "a", TakeID: "new-take"}, map[string]float64{"a": 10, "b": 10, "regional-edit-source": 10})
	require.ErrorContains(t, err, "source-anchored")
	projectedP["audioTracks"] = []any{}
	projectedP["reframes"] = map[string]any{"a": map[string]any{"analysisId": "regional-tracking"}, "b": map[string]any{"analysisId": "other-track"}}
	swapped, _, _, err := studioCompileRegionalClipEdit(t.Context(), project, projected, StudioEditRequest{RequestID: "safe-take", ClipID: "a", TakeID: "new-take"}, map[string]float64{"a": 10, "b": 10})
	require.NoError(t, err)
	swappedP, _ := swapped["production"].(map[string]any)
	refs := swappedP["reframes"].(map[string]any)
	require.NotContains(t, refs, "a")
	require.Contains(t, refs, "b")
	speed := 2.
	request := StudioEditRequest{RequestID: "regional-edit-one", Revision: project.Revision, VersionID: "version-en", Action: "edit_clip", ClipID: "a", Speed: &speed, ReviewConfirmed: true}
	plan, err := PrepareStudioEditPlan(t.Context(), 1, project.ID, request)
	require.NoError(t, err)
	var planned StudioEditPlanDocument
	require.NoError(t, common.Unmarshal([]byte(plan.Document), &planned))
	require.Equal(t, "version-en", planned.Impact["version_id"])
	duplicate, err := PrepareStudioEditPlan(t.Context(), 1, project.ID, request)
	require.NoError(t, err)
	require.Equal(t, plan.ID, duplicate.ID)
	wrong := request
	wrong.VersionID = "version-es"
	_, err = PrepareStudioEditPlan(t.Context(), 1, project.ID, wrong)
	require.Error(t, err)
	_, err = PrepareStudioEditPlan(t.Context(), 2, project.ID, StudioEditRequest{RequestID: "outsider-regional", Revision: project.Revision, VersionID: "version-en", Action: "edit_clip", ClipID: "a", Speed: &speed, ReviewConfirmed: true})
	require.Error(t, err)
	stale := request
	stale.RequestID = "regional-stale"
	stalePlan, err := PrepareStudioEditPlan(t.Context(), 1, project.ID, stale)
	require.NoError(t, err)
	applied, receipt, err := model.ApplyStudioEditRecord(1, plan.ID, project.Revision, ValidateStudioIndexedBrollPlan)
	require.NoError(t, err)
	require.Equal(t, project.Revision+1, receipt.AppliedRevision)
	beforeReplay := string(applied.Document)
	again, _, err := model.ApplyStudioEditRecord(1, plan.ID, project.Revision, ValidateStudioIndexedBrollPlan)
	require.NoError(t, err)
	require.Equal(t, beforeReplay, string(again.Document))
	_, _, err = model.ApplyStudioEditRecord(1, stalePlan.ID, project.Revision, ValidateStudioIndexedBrollPlan)
	require.ErrorIs(t, err, model.ErrStudioRevision)
	var after map[string]any
	require.NoError(t, common.Unmarshal([]byte(applied.Document), &after))
	oldP, _ := document["production"].(map[string]any)
	newP, _ := after["production"].(map[string]any)
	for key, value := range oldP {
		if key != "regionalVersions" {
			a, _ := common.Marshal(value)
			b, _ := common.Marshal(newP[key])
			require.JSONEq(t, string(a), string(b))
		}
	}
	aNodes, _ := common.Marshal(document["nodes"])
	bNodes, _ := common.Marshal(after["nodes"])
	require.JSONEq(t, string(aNodes), string(bNodes))
	require.Equal(t, studioObjects(oldP, "regionalVersions")[1], studioObjects(newP, "regionalVersions")[1])
	takeRequest := StudioEditRequest{RequestID: "regional-new-take", Revision: applied.Revision, VersionID: "version-en", Action: "edit_clip", ClipID: "a", TakeID: "new-take", ReviewConfirmed: true}
	takePlan, err := PrepareStudioEditPlan(t.Context(), 1, project.ID, takeRequest)
	require.NoError(t, err)
	var takeDoc StudioEditPlanDocument
	require.NoError(t, common.Unmarshal([]byte(takePlan.Document), &takeDoc))
	takeP, _ := takeDoc.NextDocument["production"].(map[string]any)
	selected := studioObjects(takeP, "regionalVersions")[0]
	clip := studioObjects(selected, "timeline")[0]
	require.Equal(t, "new-take", clip["takeId"])
	require.Equal(t, "regional-edit-take-two", clip["sourceMediaId"])
	cNodes, _ := common.Marshal(takeDoc.NextDocument["nodes"])
	require.JSONEq(t, string(aNodes), string(cNodes))
	invalid := takeRequest
	invalid.RequestID = "regional-missing-take"
	invalid.TakeID = "missing"
	_, err = PrepareStudioEditPlan(t.Context(), 1, project.ID, invalid)
	require.Error(t, err)
	tooLong := 10.01
	bounded := takeRequest
	bounded.RequestID = "regional-actual-bounds"
	bounded.TakeID = ""
	bounded.TrimEnd = &tooLong
	_, err = PrepareStudioEditPlan(t.Context(), 1, project.ID, bounded)
	require.ErrorContains(t, err, "never clamped")
	lockedDoc, err := studioRegionalClone(after)
	require.NoError(t, err)
	lockedData, _ := studioObjects(lockedDoc, "nodes")[0]["data"].(map[string]any)
	lockedData["locked"] = true
	lockedRaw, _ := common.Marshal(lockedDoc)
	lockedProject, err := model.SaveStudioProject(1, project.ID, project.Title, applied.Revision, string(lockedRaw))
	require.NoError(t, err)
	lockedRequest := request
	lockedRequest.RequestID = "regional-locked"
	lockedRequest.Revision = lockedProject.Revision
	_, err = PrepareStudioEditPlan(t.Context(), 1, project.ID, lockedRequest)
	require.ErrorContains(t, err, "locked")
}

func TestStudioRegionalAudioRejectsAmbiguousAnchorsAndPreservesClipClock(t *testing.T) {
	document := studioRegionalEditFixtureDocument()
	projected, _ := studioRegionalEditDocument(document, "version-en")
	production, _ := projected["production"].(map[string]any)
	tracks := studioObjects(production, "audioTracks")
	speed := 2.
	production["audioTracks"] = []any{tracks[3]}
	next, _, _, err := studioCompileRegionalClipEdit(t.Context(), &model.StudioProject{}, projected, StudioEditRequest{RequestID: "speed-only", ClipID: "a", Speed: &speed}, map[string]float64{"a": 10, "b": 10, "audio": 12})
	require.NoError(t, err)
	p, _ := next["production"].(map[string]any)
	track := studioObjects(p, "audioTracks")[0]
	require.Equal(t, .5, track["offset"])
	require.Equal(t, .5, track["anchorSourceStart"])
	require.Equal(t, 1., track["speed"])
	require.Equal(t, 2., track["duration"])
	tracks[2]["offset"] = 3.
	production["audioTracks"] = []any{tracks[2]}
	_, _, _, err = studioCompileRegionalClipEdit(t.Context(), &model.StudioProject{}, projected, StudioEditRequest{RequestID: "bad-anchor", ClipID: "a", Speed: &speed}, map[string]float64{"a": 10, "b": 10, "audio": 12})
	require.ErrorContains(t, err, "disagree")
}
