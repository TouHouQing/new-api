/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
*/
package service

import (
	"context"
	"errors"
	"fmt"
	"math"
	"os/exec"
	"slices"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

type StudioSceneBoundary struct {
	Time          float64  `json:"time"`
	OriginalTime  *float64 `json:"original_time,omitempty"`
	RequestedTime *float64 `json:"requested_time,omitempty"`
	Origin        string   `json:"origin,omitempty"`
	Reason        string   `json:"reason,omitempty"`
}

type StudioSceneEvidence struct {
	Kind          string                `json:"kind"`
	ParentID      string                `json:"parent_id,omitempty"`
	RequestDigest string                `json:"request_digest,omitempty"`
	Chunks        []map[string]any      `json:"chunks,omitempty"`
	SourceTakeID  string                `json:"source_take_id,omitempty"`
	Start         float64               `json:"start"`
	End           float64               `json:"end"`
	Cuts          []StudioSceneBoundary `json:"cuts"`
	Removed       []float64             `json:"removed_measured_cuts,omitempty"`
}

type StudioSceneCorrectionRequest struct {
	RequestID       string                `json:"request_id"`
	AnalysisID      string                `json:"analysis_id"`
	Cuts            []StudioSceneBoundary `json:"cuts"`
	ReviewConfirmed bool                  `json:"review_confirmed"`
}

type StudioSceneDraftShot struct {
	SceneIndex  int    `json:"scene_index"`
	Title       string `json:"title"`
	Text        string `json:"text"`
	ImagePrompt string `json:"image_prompt"`
	VideoPrompt string `json:"video_prompt"`
	Camera      string `json:"camera"`
	Dialogue    string `json:"dialogue"`
}

type StudioSceneAdaptationRequest struct {
	RequestID       string                 `json:"request_id"`
	Revision        int64                  `json:"revision"`
	AnalysisID      string                 `json:"analysis_id"`
	CorrectionID    string                 `json:"correction_id,omitempty"`
	Subject         string                 `json:"subject"`
	Brand           string                 `json:"brand,omitempty"`
	Goal            string                 `json:"goal,omitempty"`
	Title           string                 `json:"title"`
	Shots           []StudioSceneDraftShot `json:"shots"`
	ReviewConfirmed bool                   `json:"review_confirmed"`
	ReplaceDraft    bool                   `json:"replace_draft"`
}

func studioSceneFinite(value float64) bool { return !math.IsNaN(value) && !math.IsInf(value, 0) }

func ReadStudioSceneEvidence(actorID int, projectID, id string) (*model.StudioProductionRecord, StudioSceneEvidence, map[string]any, error) {
	record, result, err := ReadStudioAnalysisResult(actorID, id)
	if err != nil || record.ProjectID != projectID {
		return nil, StudioSceneEvidence{}, nil, model.ErrStudioAccess
	}
	raw, err := common.Marshal(result["analysis"])
	var evidence StudioSceneEvidence
	if err != nil || common.Unmarshal(raw, &evidence) != nil || !slices.Contains([]string{"scene_detect", "scene_correction"}, evidence.Kind) || !studioSceneFinite(evidence.Start) || !studioSceneFinite(evidence.End) || evidence.Start < 0 || evidence.End <= evidence.Start || evidence.End > 3600 || len(evidence.Cuts) > 10000 {
		return nil, evidence, nil, errors.New("choose a complete measured scene-cut analysis")
	}
	// Chunk receipts are resumable work, not a completed whole-interval result.
	if evidence.Kind == "scene_detect" && (evidence.RequestDigest == "" || len(evidence.Chunks) == 0) || evidence.Kind == "scene_correction" && evidence.ParentID == "" {
		return nil, evidence, nil, errors.New("choose the completed scene analysis rather than a chunk receipt")
	}
	previous := evidence.Start
	for _, cut := range evidence.Cuts {
		// A detector may report the last frame at exactly the requested end.
		// It is an interval edge, not an additional empty scene.
		if !studioSceneFinite(cut.Time) || cut.Time <= previous || cut.Time > evidence.End {
			return nil, evidence, nil, errors.New("scene-cut analysis has invalid source presentation times")
		}
		previous = cut.Time
	}
	return record, evidence, result, nil
}

func studioSceneSource(ctx context.Context, actorID int, projectID string, evidence StudioSceneEvidence, result map[string]any) (*model.StudioProject, map[string]any, string, error) {
	project, _, err := model.StudioProjectAccess(model.DB, actorID, projectID, true)
	if err != nil {
		return nil, nil, "", err
	}
	var document map[string]any
	mediaID, _ := result["source_media_id"].(string)
	if common.Unmarshal([]byte(project.Document), &document) != nil || !StudioMediaReferences(document)[mediaID] {
		return nil, nil, "", errors.New("the analyzed source is no longer part of this project")
	}
	op := &StudioMediaOperation{Action: "scene_detect", MediaID: mediaID, TakeID: evidence.SourceTakeID, Inspect: &StudioInspectOptions{Start: evidence.Start, End: evidence.End}}
	if err := ValidateStudioInspect(project.OwnerID, document, op); err != nil {
		return nil, nil, "", err
	}
	media, err := GetStudioMedia(project.OwnerID, mediaID)
	if err != nil || media.Digest != result["source_digest"] {
		return nil, nil, "", errors.New("scene-study source digest changed")
	}
	path, err := StudioMediaPath(media)
	if err != nil {
		return nil, nil, "", err
	}
	digest, err := studioPublicationFileDigest(path)
	if err != nil || digest != media.Digest {
		return nil, nil, "", errors.New("scene-study source bytes no longer match their immutable digest")
	}
	return project, document, path, nil
}

// Manual edits snap to actual presentation times, not average frame-rate math.
// Probe only bounded windows around changed cuts; long films are not decoded again.
func studioSceneSnapTimes(ctx context.Context, path string, targets []float64) ([]float64, error) {
	if len(targets) == 0 {
		return nil, nil
	}
	if len(targets) > 100 {
		return nil, errors.New("correct at most one hundred new or moved boundaries in one revision")
	}
	intervals := []string{}
	for _, target := range targets {
		intervals = append(intervals, fmt.Sprintf("%.6f%%%.6f", max(0, target-.5), target+.5))
	}
	command := exec.CommandContext(ctx, studioFFmpegBinary(true), "-v", "error", "-select_streams", "v:0", "-read_intervals", strings.Join(intervals, ","), "-show_frames", "-show_entries", "frame=best_effort_timestamp_time", "-of", "json", path)
	output := &studioInspectBoundedOutput{}
	command.Stdout = output
	if err := command.Run(); err != nil {
		return nil, errors.New("could not read source frame presentation times for manual boundaries")
	}
	var frames struct {
		Frames []struct {
			Time string `json:"best_effort_timestamp_time"`
		} `json:"frames"`
	}
	if common.Unmarshal(output.Bytes(), &frames) != nil || len(frames.Frames) == 0 {
		return nil, errors.New("source has no decodable frame presentation times")
	}
	values := make([]float64, len(targets))
	for i, target := range targets {
		distance := math.Inf(1)
		for _, frame := range frames.Frames {
			value, err := strconv.ParseFloat(frame.Time, 64)
			if err == nil && studioSceneFinite(value) && math.Abs(value-target) < distance {
				values[i], distance = value, math.Abs(value-target)
			}
		}
		if math.IsInf(distance, 0) || distance > .5 {
			return nil, errors.New("manual boundary is too far from an actual decoded source frame")
		}
	}
	return values, nil
}

func SaveStudioSceneCorrection(ctx context.Context, actorID int, projectID string, request StudioSceneCorrectionRequest) (*model.StudioProductionRecord, error) {
	if !StudioIDPattern.MatchString(request.RequestID) || !request.ReviewConfirmed || len(request.Cuts) > 10000 {
		return nil, errors.New("review bounded scene cuts before saving corrections")
	}
	_, original, result, err := ReadStudioSceneEvidence(actorID, projectID, request.AnalysisID)
	if err != nil {
		return nil, err
	}
	if original.Kind != "scene_detect" {
		return nil, errors.New("corrections must retain the original measured scene analysis as parent")
	}
	project, _, path, err := studioSceneSource(ctx, actorID, projectID, original, result)
	if err != nil {
		return nil, err
	}
	payload := StudioSceneEvidence{Kind: "scene_correction", ParentID: request.AnalysisID, SourceTakeID: original.SourceTakeID, Start: original.Start, End: original.End, Cuts: []StudioSceneBoundary{}}
	used := map[float64]bool{}
	targets, changed := []float64{}, []int{}
	previous := original.Start
	for i, cut := range request.Cuts {
		if !studioSceneFinite(cut.Time) || cut.Time <= previous || cut.Time >= original.End || len([]rune(cut.Reason)) > 200 {
			return nil, errors.New("cut times must increase strictly inside the measured source interval")
		}
		previous = cut.Time
		cut.Origin, cut.RequestedTime = "human_reviewed_source_pts", nil
		if cut.OriginalTime != nil {
			if !studioSceneFinite(*cut.OriginalTime) || used[*cut.OriginalTime] || !slices.ContainsFunc(original.Cuts, func(item StudioSceneBoundary) bool { return math.Abs(item.Time-*cut.OriginalTime) < 1e-7 }) {
				return nil, errors.New("a corrected boundary references an unknown or duplicate measured cut")
			}
			used[*cut.OriginalTime] = true
			for _, measured := range original.Cuts {
				if math.Abs(measured.Time-*cut.OriginalTime) < 1e-7 {
					value := measured.Time
					cut.OriginalTime = &value
					used[value] = true
					break
				}
			}
			if math.Abs(cut.Time-*cut.OriginalTime) < 1e-7 {
				cut.Origin = "measured_source_pts"
			}
		}
		if cut.Origin != "measured_source_pts" {
			targets, changed = append(targets, cut.Time), append(changed, i)
			value := cut.Time
			cut.RequestedTime = &value
		}
		payload.Cuts = append(payload.Cuts, cut)
	}
	snapped, err := studioSceneSnapTimes(ctx, path, targets)
	if err != nil {
		return nil, err
	}
	for i, index := range changed {
		payload.Cuts[index].Time = snapped[i]
	}
	previous = original.Start
	for _, cut := range payload.Cuts {
		if cut.Time <= previous || cut.Time >= original.End {
			return nil, errors.New("corrected boundaries collapse on the same source frame; merge them or choose another frame")
		}
		previous = cut.Time
	}
	for _, cut := range original.Cuts {
		if !used[cut.Time] && cut.Time < original.End {
			payload.Removed = append(payload.Removed, cut.Time)
		}
	}
	return SaveStudioAnalysisResult(actorID, project, request.RequestID, result["source_media_id"].(string), payload, []string{"Human-reviewed merge, split and boundary edits retain the original measured analysis. Manual times are snapped to actual source presentation timestamps.", "Scene differences do not establish action, dialogue, brand, identity or semantic scene meaning."})
}

func studioSceneRanges(evidence StudioSceneEvidence) []StudioSourceRange {
	ranges := []StudioSourceRange{}
	start := evidence.Start
	for _, cut := range evidence.Cuts {
		if cut.Time < evidence.End {
			ranges = append(ranges, StudioSourceRange{Start: start, End: cut.Time})
			start = cut.Time
		}
	}
	return append(ranges, StudioSourceRange{Start: start, End: evidence.End})
}

func PrepareStudioSceneAdaptation(ctx context.Context, actorID int, projectID string, request StudioSceneAdaptationRequest) (*model.StudioProductionRecord, error) {
	if !StudioIDPattern.MatchString(request.RequestID) || request.Revision < 1 || !request.ReviewConfirmed || strings.TrimSpace(request.Subject) == "" || len([]rune(request.Subject)) > 2000 || len([]rune(request.Brand)) > 200 || len([]rune(request.Goal)) > 2000 || strings.TrimSpace(request.Title) == "" || len([]rune(request.Title)) > 200 || len(request.Shots) < 1 || len(request.Shots) > 100 {
		return nil, errors.New("provide your own subject, title and one to one hundred reviewed storyboard shots")
	}
	project, _, err := model.StudioProjectAccess(model.DB, actorID, projectID, true)
	if err != nil {
		return nil, err
	}
	if old, readErr := model.ReadStudioProductionRecord(actorID, request.RequestID, true); readErr == nil {
		var saved struct {
			Request StudioSceneAdaptationRequest `json:"request"`
		}
		expected, _ := common.Marshal(request)
		if old.ProjectID != projectID || old.Kind != "edit_plan" || common.Unmarshal([]byte(old.Document), &saved) != nil {
			return nil, model.ErrStudioRevision
		}
		actual, _ := common.Marshal(saved.Request)
		if string(expected) != string(actual) {
			return nil, model.ErrStudioRevision
		}
		return old, nil
	}
	if project.Revision != request.Revision {
		return nil, model.ErrStudioRevision
	}
	_, evidence, result, err := ReadStudioSceneEvidence(actorID, projectID, request.AnalysisID)
	if err != nil {
		return nil, err
	}
	if evidence.Kind != "scene_detect" {
		return nil, errors.New("choose the original measured analysis")
	}
	if request.CorrectionID != "" {
		_, corrected, correctedResult, err := ReadStudioSceneEvidence(actorID, projectID, request.CorrectionID)
		if err != nil {
			return nil, err
		}
		if corrected.ParentID != request.AnalysisID || correctedResult["source_media_id"] != result["source_media_id"] || correctedResult["source_digest"] != result["source_digest"] || corrected.Start != evidence.Start || corrected.End != evidence.End {
			return nil, errors.New("scene correction belongs to a different original source interval")
		}
		evidence = corrected
	}
	_, document, _, err := studioSceneSource(ctx, actorID, projectID, evidence, result)
	if err != nil {
		return nil, err
	}
	production, _ := document["production"].(map[string]any)
	if production == nil {
		production = map[string]any{"documentVersion": 2}
		document["production"] = production
	}
	if previous, _ := production["screenplayDraft"].(string); previous != "" && !request.ReplaceDraft {
		return nil, errors.New("a screenplay draft already exists; confirm replacing that draft before preparing an adaptation")
	}
	ranges := studioSceneRanges(evidence)
	shots, comparisons := []any{}, []any{}
	previousIndex, total := -1, 0.0
	for _, shot := range request.Shots {
		if shot.SceneIndex <= previousIndex || shot.SceneIndex >= len(ranges) || strings.TrimSpace(shot.Title) == "" || len([]rune(shot.Title)) > 200 || strings.TrimSpace(shot.Text) == "" || strings.TrimSpace(shot.ImagePrompt) == "" || strings.TrimSpace(shot.VideoPrompt) == "" || len([]rune(shot.Text)) > 30000 || len([]rune(shot.ImagePrompt)) > 30000 || len([]rune(shot.VideoPrompt)) > 30000 || len([]rune(shot.Camera)) > 2000 || len([]rune(shot.Dialogue)) > 30000 {
			return nil, errors.New("select ordered distinct source intervals and write your own bounded action and image/video prompts for every adapted shot")
		}
		previousIndex = shot.SceneIndex
		interval := ranges[shot.SceneIndex]
		total += interval.End - interval.Start
		shots = append(shots, map[string]any{"id": fmt.Sprintf("adapt-%s-%d", studioAnalysisID(request.RequestID)[:16], shot.SceneIndex), "title": shot.Title, "text": shot.Text, "imagePrompt": shot.ImagePrompt, "videoPrompt": shot.VideoPrompt, "camera": shot.Camera, "dialogue": shot.Dialogue, "shotType": "", "characterIds": []any{}, "propIds": []any{}})
		comparisons = append(comparisons, map[string]any{"shot_index": len(shots) - 1, "scene_index": shot.SceneIndex, "source_start": interval.Start, "source_end": interval.End, "original_seconds": interval.End - interval.Start})
	}
	target := max(len(shots), int(math.Round(total)))
	if target > 3600 {
		return nil, errors.New("adapted storyboard exceeds one hour")
	}
	// The established storyboard uses integer seconds. Allocate its exact total
	// proportionally; keep unrounded source PTS separately in the edit receipt.
	durations, fractions, allocated := make([]int, len(shots)), make([]float64, len(shots)), 0
	for i, item := range comparisons {
		weight := float64(target) * item.(map[string]any)["original_seconds"].(float64) / total
		durations[i], fractions[i] = max(1, int(math.Floor(weight))), weight-math.Floor(weight)
		allocated += durations[i]
	}
	for allocated > target {
		largest := slices.Index(durations, slices.Max(durations))
		durations[largest]--
		allocated--
	}
	order := make([]int, len(shots))
	for i := range order {
		order[i] = i
	}
	slices.SortStableFunc(order, func(i, j int) int {
		if fractions[i] > fractions[j] {
			return -1
		}
		if fractions[i] < fractions[j] {
			return 1
		}
		return 0
	})
	for i := 0; i < target-allocated; i++ {
		durations[order[i]]++
	}
	for i := range shots {
		shots[i].(map[string]any)["seconds"] = durations[i]
		comparisons[i].(map[string]any)["draft_seconds"] = durations[i]
	}
	brief := request.Subject
	if request.Brand != "" {
		brief += "\nBrand: " + request.Brand
	}
	if request.Goal != "" {
		brief += "\nGoal: " + request.Goal
	}
	draft := map[string]any{"title": request.Title, "brief": brief, "characters": []any{}, "scenes": []any{}, "props": []any{}, "shots": shots}
	draftJSON, err := common.Marshal(draft)
	if err != nil || len(draftJSON) > 1000000 {
		return nil, errors.New("adapted storyboard draft exceeds its size limit")
	}
	production["screenplayDraft"] = string(draftJSON)
	guide, _ := production["guide"].(map[string]any)
	if guide == nil {
		guide = map[string]any{"goal": "story"}
	}
	guide["step"] = "shots"
	production["guide"] = guide
	raw, err := common.Marshal(document)
	if err != nil {
		return nil, err
	}
	if _, err := ValidateStudioDocument(projectID, raw); err != nil {
		return nil, err
	}
	return SaveStudioProductionRecord(actorID, projectID, request.RequestID, "edit_plan", request.Revision, map[string]any{"request": request, "analysis_id": request.AnalysisID, "correction_id": request.CorrectionID, "next_document": document, "impact": map[string]any{"action": "adapt_scene_structure", "subject": request.Subject, "brand": request.Brand, "shots": comparisons, "duration": target, "replaces_existing_draft": request.ReplaceDraft, "preserve_original_media": true, "limitations": []string{"Only measured shot order and relative duration were used. Actions, camera choices and dialogue are user-authored; CPU analysis does not establish their meaning.", "Source PTS remain exact in this receipt. Editable storyboard durations use integer seconds and are allocated proportionally.", "This saves an independent editable draft in the same project; no generation, timeline edit or model charge is performed."}}, "source_refs": []any{map[string]any{"media_id": result["source_media_id"], "digest": result["source_digest"], "take_id": evidence.SourceTakeID, "start": evidence.Start, "end": evidence.End}}})
}
