package service

import (
	"context"
	_ "embed"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

type StudioSongSection struct {
	Start float64 `json:"start"`
	End   float64 `json:"end"`
	Label string  `json:"label"`
}
type StudioBeatEvidence struct {
	Kind     string              `json:"kind"`
	ParentID string              `json:"parent_id,omitempty"`
	Start    float64             `json:"start"`
	End      float64             `json:"end"`
	Beats    []float64           `json:"beat_times"`
	Sections []StudioSongSection `json:"sections"`
}
type StudioBeatCorrectionRequest struct {
	RequestID       string              `json:"request_id"`
	AnalysisID      string              `json:"analysis_id"`
	Beats           []float64           `json:"beat_times"`
	Sections        []StudioSongSection `json:"sections"`
	ReviewConfirmed bool                `json:"review_confirmed"`
}
type StudioBeatPlanRequest struct {
	RequestID         string  `json:"request_id"`
	Revision          int64   `json:"revision"`
	AnalysisID        string  `json:"analysis_id"`
	CorrectionID      string  `json:"correction_id,omitempty"`
	Pace              string  `json:"pace"`
	Direction         string  `json:"direction"`
	Start             float64 `json:"start"`
	End               float64 `json:"end"`
	ReviewConfirmed   bool    `json:"review_confirmed"`
	LyricsFollowMusic bool    `json:"lyrics_follow_music"`
}

func ReadStudioBeatEvidence(actorID int, projectID, analysisID string) (*model.StudioProductionRecord, StudioBeatEvidence, map[string]any, error) {
	record, result, err := ReadStudioAnalysisResult(actorID, analysisID)
	if err != nil || record.ProjectID != projectID {
		return nil, StudioBeatEvidence{}, nil, model.ErrStudioAccess
	}
	analysis, _ := result["analysis"].(map[string]any)
	raw, err := common.Marshal(analysis)
	if err != nil {
		return nil, StudioBeatEvidence{}, nil, err
	}
	var evidence StudioBeatEvidence
	if common.Unmarshal(raw, &evidence) != nil || !slices.Contains([]string{"audio_structure", "beat_correction"}, evidence.Kind) || math.IsNaN(evidence.Start) || math.IsNaN(evidence.End) || math.IsInf(evidence.Start, 0) || math.IsInf(evidence.End, 0) || evidence.Start < 0 || evidence.End <= evidence.Start || evidence.End > 3600 {
		return nil, evidence, nil, errors.New("choose a measured audio-structure analysis")
	}
	return record, evidence, result, nil
}

func SaveStudioBeatCorrection(actorID int, projectID string, request StudioBeatCorrectionRequest) (*model.StudioProductionRecord, error) {
	project, _, err := model.StudioProjectAccess(model.DB, actorID, projectID, true)
	if err != nil {
		return nil, err
	}
	if !StudioIDPattern.MatchString(request.RequestID) || !request.ReviewConfirmed || len(request.Beats) < 2 || len(request.Beats) > 20000 || len(request.Sections) > 1000 {
		return nil, errors.New("review at least two bounded beats before saving a correction")
	}
	_, original, result, err := ReadStudioBeatEvidence(actorID, projectID, request.AnalysisID)
	if err != nil {
		return nil, err
	}
	previous := -1.0
	for _, beat := range request.Beats {
		if math.IsNaN(beat) || math.IsInf(beat, 0) || beat < original.Start || beat > original.End || beat <= previous {
			return nil, errors.New("corrected beats must be increasing finite source times inside the original interval")
		}
		previous = beat
	}
	previous = original.Start
	for _, section := range request.Sections {
		if math.IsNaN(section.Start) || math.IsNaN(section.End) || math.IsInf(section.Start, 0) || math.IsInf(section.End, 0) || section.Start < previous || section.End <= section.Start || section.End > original.End || strings.TrimSpace(section.Label) == "" || len([]rune(section.Label)) > 100 {
			return nil, errors.New("song sections need ordered source intervals and short human labels")
		}
		previous = section.End
	}
	mediaID, _ := result["source_media_id"].(string)
	payload := StudioBeatEvidence{Kind: "beat_correction", ParentID: request.AnalysisID, Start: original.Start, End: original.End, Beats: request.Beats, Sections: request.Sections}
	return SaveStudioAnalysisResult(actorID, project, request.RequestID, mediaID, payload, []string{"Human-corrected beat and section evidence; original measured analysis remains immutable.", "Section labels are provided by the user, not inferred proof of musical form."})
}

type studioEditorialSource struct {
	Clip          map[string]any
	Media         *model.StudioMedia
	Probe         StudioMediaProbe
	Data          map[string]any
	OriginalStart float64
	Start         float64
	End           float64
	Speed         float64
	Cursor        float64
	Protected     bool
	KeepBoundary  bool
}

// A previous beat edit can leave several adjacent fragments of one exact Take.
// Join only plain, contiguous fragments before choosing the replacement song's
// cuts. Unknown clip fields and source-bound effects keep their boundaries.
func studioEditorialRecutSources(sources []studioEditorialSource) []studioEditorialSource {
	plain := func(source studioEditorialSource) bool {
		if source.Protected || source.KeepBoundary || source.Data["locked"] == true || source.Clip["locked"] == true || source.Media == nil || source.Media.MediaID == "" || source.Media.Digest == "" || source.Clip["nodeId"] == nil || source.Clip["nodeId"] == "" || source.Clip["takeId"] == nil || source.Clip["takeId"] == "" || source.Cursor != source.Start || source.Speed <= 0 {
			return false
		}
		caption, _ := source.Clip["caption"].(string)
		if strings.TrimSpace(caption) != "" || studioDocumentNumber(source.Clip["fadeIn"], 0) != 0 || studioDocumentNumber(source.Clip["fadeOut"], 0) != 0 {
			return false
		}
		for key := range source.Clip {
			switch key {
			case "id", "nodeId", "takeId", "trimStart", "trimEnd", "speed", "volume", "muted", "caption", "captionOffset", "captionDuration", "fadeIn", "fadeOut":
			default:
				return false
			}
		}
		return true
	}
	result := make([]studioEditorialSource, 0, len(sources))
	for _, source := range sources {
		if len(result) > 0 {
			previous := &result[len(result)-1]
			if plain(*previous) && plain(source) && previous.Media.MediaID == source.Media.MediaID && previous.Media.Digest == source.Media.Digest && previous.Clip["nodeId"] == source.Clip["nodeId"] && previous.Clip["takeId"] == source.Clip["takeId"] && previous.Speed == source.Speed && studioDocumentNumber(previous.Clip["volume"], 1) == studioDocumentNumber(source.Clip["volume"], 1) && (previous.Clip["muted"] == true) == (source.Clip["muted"] == true) && math.Abs(previous.End-source.Start) < .0000001 && math.Abs(previous.OriginalStart+(previous.End-previous.Start)/previous.Speed-source.OriginalStart) < .0000001 {
				clip := make(map[string]any, len(previous.Clip))
				for key, value := range previous.Clip {
					clip[key] = value
				}
				clip["trimEnd"] = source.End
				previous.Clip, previous.End = clip, source.End
				continue
			}
		}
		result = append(result, source)
	}
	return result
}

// CompileStudioBeatTimeline consumes each selected source frame at most once.
// Locked clips and dialogue occupy fixed program windows; cuts in free windows
// are chosen from reviewed beat times and quantized to the same output grid.
func CompileStudioBeatTimeline(request StudioBeatPlanRequest, evidence StudioBeatEvidence, sources []studioEditorialSource, fps int) ([]any, []StudioSourceRange, []map[string]any, []string, error) {
	if fps < 12 || fps > 60 || len(sources) == 0 {
		return nil, nil, nil, nil, errors.New("choose available source clips and a supported output frame rate")
	}
	sources = studioEditorialRecutSources(sources)
	total := math.Floor((request.End-request.Start)*float64(fps)+1e-6) / float64(fps)
	if total < .1 {
		return nil, nil, nil, nil, errors.New("music interval is shorter than the output grid")
	}
	beats := []float64{}
	for _, sourceTime := range evidence.Beats {
		value := math.Floor((sourceTime-request.Start)*float64(fps)+1e-6) / float64(fps)
		if value > 0 && value < total && (len(beats) == 0 || value > beats[len(beats)-1]) {
			beats = append(beats, value)
		}
	}
	if len(beats) < 2 {
		return nil, nil, nil, nil, errors.New("review at least two musical beats inside the requested interval")
	}
	desired := map[string]float64{"slow": 6, "normal": 3, "tight": 1.5}[request.Pace]
	if desired == 0 {
		return nil, nil, nil, nil, errors.New("choose slow, normal or tight pacing")
	}
	output, retained, cuts, warnings := []any{}, []StudioSourceRange{}, []map[string]any{}, []string{}
	program := 0.0
	sequence := 0
	appendPart := func(source *studioEditorialSource, length float64, protected bool) error {
		if length <= 0 || source.Cursor+length*source.Speed > source.End+1e-6 {
			return errors.New("source footage cannot cover the selected musical interval")
		}
		part := map[string]any{}
		for key, value := range source.Clip {
			part[key] = value
		}
		if !protected {
			part["id"] = "beat-" + studioAnalysisID(fmt.Sprintf("%s:%d", request.RequestID, sequence))[:40]
		}
		part["trimStart"], part["trimEnd"] = source.Cursor, source.Cursor+length*source.Speed
		if source.Cursor > source.Start+.000001 {
			part["fadeIn"] = 0.0
		}
		if source.Cursor+length*source.Speed < source.End-.000001 {
			part["fadeOut"] = 0.0
		}
		captionStart := studioDocumentNumber(source.Clip["captionOffset"], 0)
		captionEnd := (source.End - source.Start) / source.Speed
		if duration := studioDocumentNumber(source.Clip["captionDuration"], 0); duration > 0 {
			captionEnd = min(captionEnd, captionStart+duration)
		}
		partStart := (source.Cursor - source.Start) / source.Speed
		partEnd := partStart + length
		if captionEnd <= partStart || captionStart >= partEnd {
			part["caption"], part["captionDuration"] = "", 0.0
		} else {
			part["captionOffset"], part["captionDuration"] = max(0, captionStart-partStart), min(partEnd, captionEnd)-max(partStart, captionStart)
		}
		oldStart := source.OriginalStart + (source.Cursor-source.Start)/source.Speed
		retained = append(retained, StudioSourceRange{oldStart, oldStart + length})
		output = append(output, part)
		source.Cursor += length * source.Speed
		program += length
		sequence++
		if len(output) > 100 {
			return errors.New("beat editing would exceed one hundred timeline clips")
		}
		if program < total-1e-6 {
			nearest := math.Inf(1)
			for _, beat := range evidence.Beats {
				nearest = min(nearest, math.Abs(program-(beat-request.Start)))
			}
			cuts = append(cuts, map[string]any{"time": program, "nearest_beat_distance": nearest, "protected": protected})
			if protected && nearest > 1/float64(fps)+1e-6 {
				warnings = append(warnings, "A protected dialogue or locked boundary remains off the musical grid.")
			}
		}
		return nil
	}
	fill := func(pool []studioEditorialSource, end float64) error {
		if end < program-1e-6 {
			return errors.New("protected clips overlap the requested music interval")
		}
		capacity := 0.0
		for _, source := range pool {
			capacity += (source.End - source.Cursor) / source.Speed
		}
		if capacity+1e-6 < end-program {
			return errors.New("not enough source footage before a protected clip; add footage or shorten the music interval")
		}
		last := -1
		for program < end-1e-6 {
			chosen := -1
			for step := 1; step <= len(pool); step++ {
				i := (last + step) % len(pool)
				if request.Direction == "narrative" {
					i = step - 1
				}
				if (pool[i].End-pool[i].Cursor)/pool[i].Speed < 1/float64(fps)-1e-6 {
					continue
				}
				if request.Direction == "narrative" {
					chosen = i
					break
				}
				chosen = i
				break
			}
			if chosen < 0 {
				return errors.New("source footage ends before the music; no frames were repeated")
			}
			source := &pool[chosen]
			available := (source.End - source.Cursor) / source.Speed
			maximum := min(end, program+available)
			target := program + desired
			for _, section := range evidence.Sections {
				if request.Start+program >= section.Start && request.Start+program < section.End && (strings.Contains(strings.ToLower(section.Label), "chorus") || strings.Contains(section.Label, "高潮") || strings.Contains(section.Label, "副歌")) {
					target = program + max(1, desired*.75)
				}
			}
			endpoint := -1.0
			distance := math.Inf(1)
			for _, beat := range beats {
				if beat <= program+.499 || beat > maximum+1e-6 {
					continue
				}
				remainder := available - (beat - program)
				if remainder > 1e-6 && remainder < .75 {
					continue
				}
				if value := math.Abs(beat - target); value < distance {
					endpoint, distance = beat, value
				}
			}
			if maximum >= end-1e-6 && (endpoint < 0 || end-program <= desired+.5) {
				endpoint = end
			}
			if endpoint < 0 {
				return errors.New("available footage cannot reach another confirmed beat; add source footage or correct the grid")
			}
			if err := appendPart(source, endpoint-program, false); err != nil {
				return err
			}
			last = chosen
		}
		return nil
	}
	pool := []studioEditorialSource{}
	for i := range sources {
		source := sources[i]
		if !source.Protected {
			pool = append(pool, source)
			continue
		}
		length := (source.End - source.Start) / source.Speed
		if source.OriginalStart+length > total+1e-6 {
			return nil, nil, nil, nil, errors.New("the requested music interval would cut a protected dialogue or locked clip")
		}
		if err := fill(pool, source.OriginalStart); err != nil {
			return nil, nil, nil, nil, err
		}
		if len(cuts) > 0 && math.Abs(studioDocumentNumber(cuts[len(cuts)-1]["time"], -1)-program) < .000001 {
			cuts[len(cuts)-1]["protected"] = true
			if studioDocumentNumber(cuts[len(cuts)-1]["nearest_beat_distance"], 0) > 1/float64(fps)+1e-6 {
				warnings = append(warnings, "A protected dialogue or locked boundary remains off the musical grid.")
			}
		}
		pool = nil
		if err := appendPart(&source, length, true); err != nil {
			return nil, nil, nil, nil, err
		}
	}
	if err := fill(pool, total); err != nil {
		return nil, nil, nil, nil, err
	}
	if len(output) < 2 {
		warnings = append(warnings, "Only one source shot is available; pacing variety needs more footage.")
	}
	if len(sources) > 0 {
		allProtected := true
		for _, source := range sources {
			allProtected = allProtected && source.Protected
		}
		if allProtected {
			warnings = append(warnings, "All clips are protected; this draft preserves the existing cut rhythm.")
		}
	}
	return output, retained, cuts, slices.Compact(warnings), nil
}

func PrepareStudioBeatPlan(ctx context.Context, actorID int, projectID string, request StudioBeatPlanRequest) (*model.StudioProductionRecord, error) {
	if !StudioIDPattern.MatchString(request.RequestID) || request.Revision < 1 || !request.ReviewConfirmed || !slices.Contains([]string{"slow", "normal", "tight"}, request.Pace) || !slices.Contains([]string{"narrative", "concept", "performance"}, request.Direction) || math.IsNaN(request.Start) || math.IsNaN(request.End) || math.IsInf(request.Start, 0) || math.IsInf(request.End, 0) || request.Start < 0 || request.End <= request.Start || request.End > 3600 {
		return nil, errors.New("review the song interval and choose a visual direction before preparing a beat plan")
	}
	project, _, err := model.StudioProjectAccess(model.DB, actorID, projectID, true)
	if err != nil {
		return nil, err
	}
	if old, err := model.ReadStudioProductionRecord(actorID, request.RequestID, true); err == nil {
		var saved struct {
			Request StudioBeatPlanRequest `json:"request"`
		}
		if old.ProjectID != projectID || old.Kind != "edit_plan" || common.Unmarshal([]byte(old.Document), &saved) != nil || saved.Request != request {
			return nil, model.ErrStudioRevision
		}
		return old, nil
	}
	if project.Revision != request.Revision {
		return nil, model.ErrStudioRevision
	}
	_, original, originalResult, err := ReadStudioBeatEvidence(actorID, projectID, request.AnalysisID)
	if err != nil {
		return nil, err
	}
	evidence := original
	if request.CorrectionID != "" {
		_, corrected, correctedResult, err := ReadStudioBeatEvidence(actorID, projectID, request.CorrectionID)
		if err != nil {
			return nil, err
		}
		if corrected.ParentID != request.AnalysisID || correctedResult["source_digest"] != originalResult["source_digest"] {
			return nil, errors.New("beat correction belongs to a different source analysis")
		}
		evidence = corrected
	}
	if request.Start < evidence.Start || request.End > evidence.End {
		return nil, errors.New("requested music interval is outside the measured source analysis")
	}
	mediaID, _ := originalResult["source_media_id"].(string)
	music, err := GetStudioMedia(project.OwnerID, mediaID)
	if err != nil || music.Digest != originalResult["source_digest"] {
		return nil, errors.New("the original analyzed music is unavailable or changed")
	}
	musicPath, err := StudioMediaPath(music)
	if err != nil {
		return nil, err
	}
	musicProbe, err := ProbeStudioMedia(ctx, musicPath)
	if err != nil || !musicProbe.HasAudio || request.End > musicProbe.Duration+.001 {
		return nil, errors.New("music interval exceeds the actual source audio")
	}
	var document map[string]any
	if common.Unmarshal([]byte(project.Document), &document) != nil || !StudioMediaReferences(document)[mediaID] {
		return nil, errors.New("the measured music is no longer part of this project")
	}
	production, clips := studioTimelineDocument(document)
	masterTrack, previousSongStart, err := studioBeatMusicInterval(document, production, mediaID, request)
	if err != nil {
		return nil, err
	}
	if mix, ok := production["audioMix"].(map[string]any); ok {
		ids, _ := mix["musicMediaIds"].([]any)
		if !slices.ContainsFunc(ids, func(value any) bool { return value == mediaID }) {
			if len(ids) >= 100 {
				return nil, errors.New("the music mix has no room for the selected master song")
			}
			mix["musicMediaIds"] = append(ids, mediaID)
		}
	}
	fps := int(studioDocumentNumber(production["fps"], 30))
	sources := []studioEditorialSource{}
	refs := []map[string]any{{"media_id": music.MediaID, "digest": music.Digest, "purpose": "fixed_master_music"}}
	program := 0.0
	for _, clip := range clips {
		media, data, err := studioClipSource(project.OwnerID, document, clip)
		if err != nil {
			return nil, err
		}
		path, err := StudioMediaPath(media)
		if err != nil {
			return nil, err
		}
		probe, err := ProbeStudioMedia(ctx, path)
		if err != nil || !probe.HasVideo {
			return nil, errors.New("beat editing needs playable video sources")
		}
		start, end, speed := studioDocumentNumber(clip["trimStart"], 0), studioDocumentNumber(clip["trimEnd"], probe.Duration), studioDocumentNumber(clip["speed"], 1)
		if start < 0 || end <= start || end > probe.Duration+.001 || speed < .25 || speed > 4 {
			return nil, errors.New("timeline clip exceeds its actual source range")
		}
		protected := data["locked"] == true || clip["locked"] == true || document["voiceoverMediaId"] != nil && document["voiceoverMediaId"] != "" || probe.HasAudio && clip["muted"] != true && studioDocumentNumber(clip["volume"], 1) > 0
		for _, shot := range studioObjects(document, "shots") {
			if shot["videoNodeId"] == clip["nodeId"] || shot["id"] == clip["id"] {
				dialogue, _ := shot["dialogue"].(string)
				protected = protected || shot["locked"] == true || strings.TrimSpace(dialogue) != "" || shot["shotVoiceoverMediaId"] != nil && shot["shotVoiceoverMediaId"] != ""
				for _, cue := range studioObjects(production, "dialogueCues") {
					protected = protected || cue["shotId"] == shot["id"] && cue["audioMediaId"] != nil && cue["audioMediaId"] != ""
				}
			}
		}
		for _, track := range studioObjects(production, "audioTracks") {
			if track["id"] == masterTrack {
				continue
			}
			a := studioDocumentNumber(track["offset"], 0)
			b := a + studioDocumentNumber(track["duration"], 3600)/studioDocumentNumber(track["speed"], 1)
			protected = protected || track["anchorClipId"] == clip["id"] || a < program+(end-start)/speed && b > program
		}
		keepBoundary := false
		if reframes, ok := production["reframes"].(map[string]any); ok {
			_, keepBoundary = reframes[fmt.Sprint(clip["id"])]
		}
		for _, graphic := range studioObjects(production, "motionGraphics") {
			keepBoundary = keepBoundary || studioDocumentNumber(graphic["start"], 0) < program+(end-start)/speed && studioDocumentNumber(graphic["end"], 3600) > program
		}
		// Pin exact media even when a canvas node had no existing completed Take.
		if take, _ := clip["takeId"].(string); take == "" {
			existingID := ""
			for _, take := range studioObjects(data, "takes") {
				if take["mediaId"] == media.MediaID && take["status"] == "completed" {
					existingID, _ = take["id"].(string)
					break
				}
			}
			if existingID != "" {
				clip["takeId"] = existingID
			} else {
				id := "pin-" + studioAnalysisID(request.RequestID + ":" + fmt.Sprint(clip["nodeId"]) + ":" + media.Digest)[:40]
				takes, _ := data["takes"].([]any)
				if len(takes) >= 100 {
					return nil, errors.New("archive unused source versions before preparing a beat plan")
				}
				data["takes"] = append(takes, map[string]any{"id": id, "createdAt": time.Now().UTC().Format(time.RFC3339Nano), "sourceMode": "upload", "prompt": "Pinned source for reviewed beat edit", "status": "completed", "mediaId": media.MediaID})
				clip["takeId"] = id
			}
		}
		sources = append(sources, studioEditorialSource{Clip: clip, Media: media, Probe: probe, Data: data, OriginalStart: program, Start: start, End: end, Speed: speed, Cursor: start, Protected: protected, KeepBoundary: keepBoundary})
		refs = append(refs, map[string]any{"media_id": media.MediaID, "digest": media.Digest, "take_id": clip["takeId"], "clip_id": clip["id"], "start": start, "end": end})
		program += (end - start) / speed
	}
	next, retained, cuts, warnings, err := CompileStudioBeatTimeline(request, evidence, sources, fps)
	if err != nil {
		return nil, err
	}
	production["timeline"], production["timelineEdited"], production["documentVersion"] = next, true, StudioDocumentVersion
	if captions, _ := document["captionsText"].(string); captions != "" {
		mapping := retained
		if request.LyricsFollowMusic {
			mapping = []StudioSourceRange{{request.Start, request.End}}
			if mapping[0].Start < 0 {
				return nil, errors.New("lyrics need an existing music offset before alignment")
			}
		}
		captionOffset := studioDocumentNumber(document["captionOffsetSeconds"], 0)
		if request.LyricsFollowMusic {
			captionOffset += previousSongStart
		}
		document["captionsText"], err = studioEditSubtitles(captions, captionOffset, mapping)
		if err != nil {
			return nil, err
		}
		document["captionOffsetSeconds"] = 0.0
	}
	graphics := []any{}
	for _, graphic := range studioObjects(production, "motionGraphics") {
		for i, span := range studioMapRetainedRange(studioDocumentNumber(graphic["start"], 0), studioDocumentNumber(graphic["end"], 0), retained) {
			part := map[string]any{}
			for key, value := range graphic {
				part[key] = value
			}
			part["start"], part["end"] = span.Start, span.End
			if i > 0 {
				part["id"] = "graphic-" + studioAnalysisID(request.RequestID + fmt.Sprint(graphic["id"]) + fmt.Sprint(i))[:40]
			}
			graphics = append(graphics, part)
		}
	}
	if len(graphics) > 50 {
		return nil, errors.New("beat editing would exceed the graphic limit")
	}
	if production["motionGraphics"] != nil {
		production["motionGraphics"] = graphics
	}
	oldReframes, _ := production["reframes"].(map[string]any)
	if oldReframes != nil {
		nextReframes := map[string]any{}
		for i, part := range next {
			for _, source := range sources {
				if retained[i].Start >= source.OriginalStart-.000001 && retained[i].Start < source.OriginalStart+(source.End-source.Start)/source.Speed-.000001 {
					if ref, exists := oldReframes[fmt.Sprint(source.Clip["id"])]; exists {
						nextReframes[fmt.Sprint(part.(map[string]any)["id"])] = ref
					}
					break
				}
			}
		}
		production["reframes"] = nextReframes
	}
	mvPlan := map[string]any{"recordId": request.RequestID, "direction": request.Direction, "analysisId": request.AnalysisID, "musicMediaId": music.MediaID, "musicDigest": music.Digest, "start": request.Start, "end": request.End}
	if request.CorrectionID != "" {
		mvPlan["correctionId"] = request.CorrectionID
	}
	production["musicVideoPlan"] = mvPlan
	plans, _ := production["appliedEditPlans"].([]any)
	if len(plans) >= 100 {
		plans = plans[len(plans)-99:]
	}
	production["appliedEditPlans"] = append(plans, request.RequestID)
	document["updatedAt"] = time.Now().UTC().Format(time.RFC3339Nano)
	raw, err := common.Marshal(document)
	if err != nil {
		return nil, err
	}
	if _, err := ValidateStudioDocument(projectID, raw); err != nil {
		return nil, err
	}
	return SaveStudioProductionRecord(actorID, projectID, request.RequestID, "edit_plan", request.Revision, map[string]any{"request": request, "next_document": document, "impact": map[string]any{"action": "beat_edit", "pace": request.Pace, "direction": request.Direction, "duration": math.Floor((request.End-request.Start)*float64(fps)) / float64(fps), "cuts": cuts, "warnings": warnings, "music_media_id": music.MediaID, "music_digest": music.Digest, "original_music_preserved": true, "performance_note": "Existing performance footage only; lip-sync and VACE generation use their separately supported media-production paths."}, "source_refs": refs, "analysis_id": request.AnalysisID, "correction_id": request.CorrectionID})
}

//go:embed resources/studio_editorial.py
var studioEditorialExporter []byte

// Conformed clips preserve the renderer's retiming, framing and visual effects.
// Raw sources, chosen Take IDs and edit ranges remain in the same package.
func studioEditorialPackage(ctx context.Context, project *model.StudioProject, plan *StudioRenderPlan, result map[string]any, workdir string) ([]string, error) {
	var document map[string]any
	if err := common.Unmarshal([]byte(project.Document), &document); err != nil {
		return nil, err
	}
	durations, ok := result["clip_durations"].([]float64)
	if !ok || len(durations) != len(plan.Clips) {
		return nil, errors.New("editorial export needs matching rendered clip durations")
	}
	title := func(nodeID, mediaID string) string {
		for _, node := range studioObjects(document, "nodes") {
			data, _ := node["data"].(map[string]any)
			if node["id"] == nodeID || data["mediaId"] == mediaID {
				if name, ok := data["title"].(string); ok && name != "" {
					return name
				}
			}
		}
		return mediaID
	}
	if err := os.MkdirAll(filepath.Join(workdir, "editorial"), 0700); err != nil {
		return nil, err
	}
	entries := []string{"timeline.xml", "timeline.fcpxml", "timeline.otio", "editorial-plan.json", "relink_media.py", "EDITORIAL_README.txt"}
	editorialFPS := studioEditorialFrameRate(plan.FPS)
	clips, audio := []map[string]any{}, []map[string]any{}
	total := 0.0
	for index, clip := range plan.Clips {
		source, err := os.Open(filepath.Join(workdir, fmt.Sprintf("clip-%03d.mp4", index)))
		if err != nil {
			return nil, err
		}
		name := fmt.Sprintf("editorial/clip-%03d.mp4", index)
		output, err := os.Create(filepath.Join(workdir, filepath.FromSlash(name)))
		if err != nil {
			source.Close()
			return nil, err
		}
		_, copyErr := io.Copy(output, source)
		source.Close()
		closeErr := output.Close()
		if copyErr != nil || closeErr != nil {
			return nil, errors.New("editorial clip copy failed")
		}
		frames := int64(math.Round((total+durations[index])*float64(editorialFPS))) - int64(math.Round(total*float64(editorialFPS)))
		if frames <= 0 {
			return nil, errors.New("editorial clip is shorter than one output frame")
		}
		if editorialFPS != plan.FPS {
			conformed := fmt.Sprintf("editorial/conformed-%03d.mp4", index)
			filter := fmt.Sprintf("fps=%d,tpad=stop_mode=clone:stop_duration=%g", editorialFPS, 1.0/float64(editorialFPS))
			if err := runStudioFFmpeg(ctx, workdir, []string{"-nostdin", "-y", "-v", "error", "-i", name, "-vf", filter, "-frames:v", fmt.Sprint(frames), "-t", fmt.Sprint(float64(frames) / float64(editorialFPS)), "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", conformed}); err != nil {
				return nil, err
			}
			if err := os.Rename(filepath.Join(workdir, filepath.FromSlash(conformed)), filepath.Join(workdir, filepath.FromSlash(name))); err != nil {
				return nil, err
			}
		}
		clips = append(clips, map[string]any{"name": title(clip.NodeID, clip.MediaID), "path": name, "frames": frames, "source": clip})
		entries = append(entries, name)
		total += durations[index]
	}
	tracks, _ := result["audio"].([]StudioRenderAudio)
	for index, track := range tracks {
		if track.Offset >= total {
			continue
		}
		media, err := GetStudioMedia(project.OwnerID, track.MediaID)
		if err != nil {
			return nil, err
		}
		path, err := StudioMediaPath(media)
		if err != nil {
			return nil, err
		}
		probe, err := ProbeStudioMedia(ctx, path)
		if err != nil || !probe.HasAudio {
			return nil, errors.New("editorial audio could not be decoded")
		}
		duration := min(probe.Duration-track.Start, total-track.Offset)
		if track.Duration != nil {
			duration = min(duration, *track.Duration)
		}
		frames := int64(math.Round(duration * float64(editorialFPS)))
		if frames <= 0 {
			continue
		}
		name := fmt.Sprintf("editorial/audio-%03d.wav", index)
		filter := fmt.Sprintf("asetpts=PTS-STARTPTS,volume=%g,apad,atrim=duration=%g", track.Volume, float64(frames)/float64(editorialFPS))
		if err := runStudioFFmpeg(ctx, workdir, []string{"-nostdin", "-y", "-v", "error", "-ss", fmt.Sprint(track.Start), "-i", path, "-af", filter, "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", name}); err != nil {
			return nil, err
		}
		audio = append(audio, map[string]any{"name": title("", track.MediaID), "path": name, "frames": frames, "offset_frames": int64(math.Round(track.Offset * float64(editorialFPS))), "source": track})
		entries = append(entries, name)
	}
	configuration, err := common.Marshal(map[string]any{"title": project.Title, "project_id": project.ID, "revision": result["revision"], "fps": editorialFPS, "render_fps": plan.FPS, "width": plan.Width, "height": plan.Height, "clips": clips, "audio": audio})
	if err != nil {
		return nil, err
	}
	if err := os.WriteFile(filepath.Join(workdir, "editorial-plan.json"), configuration, 0600); err != nil {
		return nil, err
	}
	if err := os.WriteFile(filepath.Join(workdir, "editorial_export.py"), studioEditorialExporter, 0600); err != nil {
		return nil, err
	}
	python := os.Getenv("STUDIO_EDITORIAL_PYTHON")
	if python == "" {
		python = "/opt/studio-editorial/bin/python"
	}
	command := exec.CommandContext(ctx, python, filepath.Join(workdir, "editorial_export.py"), filepath.Join(workdir, "editorial-plan.json"), workdir)
	command.Dir = workdir
	if output, err := command.CombinedOutput(); err != nil {
		common.SysError("Studio editorial export failed: " + string(output))
		return nil, errors.New("editorial exporter is unavailable or rejected the timeline; verify the configured OpenTimelineIO runtime")
	}
	if err := os.WriteFile(filepath.Join(workdir, "relink_media.py"), []byte(studioEditorialRelinker), 0600); err != nil {
		return nil, err
	}
	readme := "专业剪辑包 / Editorial package\n\n解压后运行 python relink_media.py，将工程素材路径改为当前解压目录。\nImport timeline.xml in an editor supporting Final Cut 7 XML, timeline.fcpxml in Final Cut Pro, or timeline.otio in an OpenTimelineIO-compatible editor.\n\neditorial/ contains individually editable, conformed clips and separate audio tracks. Retiming, crop, fades, per-clip captions and watermark are baked into the conformed clips; audio trim and gain are baked into separate WAV files. Global/dialogue subtitles remain in subtitles.srt and the reference video.mp4.\nOriginal immutable media and source Take/edit metadata remain in media/, project.json and editorial-plan.json. Use those originals for further changes to baked effects. Import subtitles.srt as an external caption track where supported; avoid doubling captions already visible in conformed clips.\nSoftware versions differ; the package uses interchange formats, not a proprietary native project file.\n"
	if editorialFPS != plan.FPS {
		readme += fmt.Sprintf("\n原成片保留 %d fps；专业剪辑工程与独立剪辑素材使用兼容的 %d fps。剪辑点按工程帧网格取整，原片帧率与编辑范围仍在 manifest、project.json 和 editorial-plan.json 中。\nThe film retains %d fps. Interchange timelines and conformed clips use %d fps. Cuts are rounded to the interchange frame grid; original frame rate and edit decisions remain in the package metadata.\n", plan.FPS, editorialFPS, plan.FPS, editorialFPS)
	}
	if err := os.WriteFile(filepath.Join(workdir, "EDITORIAL_README.txt"), []byte(readme), 0600); err != nil {
		return nil, err
	}
	return entries, nil
}

// Non-SMPTE film rates (including native model video at 16fps) require a
// supported interchange timebase. Prefer an exact multiple to preserve cuts.
func studioEditorialFrameRate(rate int) int {
	for _, supported := range []int{24, 25, 30, 50, 60} {
		if supported == rate {
			return rate
		}
	}
	for _, supported := range []int{24, 25, 30, 50, 60} {
		if rate > 0 && supported%rate == 0 {
			return supported
		}
	}
	return 60
}

const studioEditorialRelinker = `"""Relink only packaged timeline media; no network or project code executes."""
import json
from pathlib import Path
from urllib.parse import unquote, urlparse
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parent
def linked(value):
    parsed = urlparse(value)
    relative = unquote(parsed.path).lstrip('/') if parsed.scheme else value
    # Exported file URLs may have the producer's directory before editorial/.
    if 'editorial/' in relative:
        relative = 'editorial/' + relative.split('editorial/', 1)[1]
    target = (root / relative).resolve()
    if root not in target.parents or not target.is_file():
        raise ValueError('Missing or outside-package editorial media: ' + relative)
    return target.as_uri()
for filename in ['timeline.xml', 'timeline.fcpxml']:
    tree = ET.parse(root / filename)
    for element in tree.iter():
        if element.tag == 'pathurl' and element.text:
            element.text = linked(element.text)
        if element.get('src'):
            element.set('src', linked(element.get('src')))
    tree.write(root / filename, encoding='utf-8', xml_declaration=True)
path = root / 'timeline.otio'
document = json.loads(path.read_text(encoding='utf-8'))
def visit(value):
    if isinstance(value, dict):
        if value.get('OTIO_SCHEMA', '').startswith('ExternalReference.'):
            value['target_url'] = linked(value['target_url'])
        for child in value.values():
            visit(child)
    elif isinstance(value, list):
        for child in value:
            visit(child)
visit(document)
path.write_text(json.dumps(document, ensure_ascii=False, indent=2), encoding='utf-8')
print('Editorial media relinked to:', root)
`
