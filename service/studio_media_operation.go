package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"math"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/google/uuid"
)

// References are project-owned media IDs. Only the server resolves provider
// references, so a canvas cannot choose an arbitrary worker URL or credential.
func ValidateStudioMediaOperation(ownerID int, document map[string]any, operation *StudioMediaOperation) error {
	if operation == nil || !StudioIDPattern.MatchString(operation.NodeID) || len(operation.Model) == 0 || len(operation.Model) > 200 || len(operation.Group) > 100 || len(operation.Language) > 40 || len(operation.VoiceID) > 100 || len(operation.Prompt) > 30000 || len(operation.ReferenceMediaIDs) > 12 || math.IsNaN(operation.Seconds) || math.IsInf(operation.Seconds, 0) || operation.Seconds <= 0 || operation.Seconds > relaycommon.MaxTaskDurationSeconds {
		return errors.New("invalid production media configuration")
	}
	kind := "audio"
	if operation.Action == "music" && operation.Model == "studio-music" && operation.Seconds > 30 {
		return errors.New("local music drafts support at most thirty seconds")
	}
	switch operation.Action {
	case "music", "sound_effects", "voice_clone", "voice_speech", "audio_separate", "audio_translate":
	case "lip_sync", "video_remove", "video_replace", "video_depth":
		kind = "video"
	case "image_bg_remove", "image_upscale", "image_outpaint", "image_layers", "image_grid", "image_to_3d":
		kind = "image"
	default:
		return errors.New("unsupported production media operation")
	}
	if options := operation.Options; options != nil {
		if len(options.PanelPrompts) > 16 || options.RedoPanel < 0 || options.RedoPanel > 16 || len(options.BackgroundPrompt) > 2000 {
			return errors.New("invalid image repair plan")
		}
		for _, prompt := range options.PanelPrompts {
			if strings.TrimSpace(prompt) == "" || len(prompt) > 3000 {
				return errors.New("describe every panel in the shot plan")
			}
		}
		if len(options.PanelPrompts) > 0 || options.RedoPanel > 0 {
			rows, columns := options.Rows, options.Columns
			if rows == 0 {
				rows = 2
			}
			if columns == 0 {
				columns = 2
			}
			if operation.Action != "image_grid" || len(options.PanelPrompts) != rows*columns || options.RedoPanel > rows*columns {
				return errors.New("panel plan must match the grid dimensions")
			}
		}
		if options.OutpaintMode != "" && (operation.Action != "image_outpaint" || !slices.Contains([]string{"strict", "natural"}, options.OutpaintMode)) {
			return errors.New("invalid outpaint mode")
		}
		if options.MaskSource != "" && (operation.Action != "image_layers" || !slices.Contains([]string{"automatic", "second_reference"}, options.MaskSource)) {
			return errors.New("invalid layer removal mask")
		}
		if options.RepairStart != nil || options.RepairEnd != nil {
			maximum := 30.0
			if operation.Action == "audio_separate" {
				maximum = 600
			}
			if !slices.Contains([]string{"music", "audio_separate"}, operation.Action) || operation.Action == "music" && options.MusicMode != "song" || options.RepairStart == nil || options.RepairEnd == nil || math.IsNaN(*options.RepairStart) || math.IsInf(*options.RepairStart, 0) || math.IsNaN(*options.RepairEnd) || math.IsInf(*options.RepairEnd, 0) || *options.RepairStart < 0 || *options.RepairEnd <= *options.RepairStart || *options.RepairEnd > maximum || *options.RepairEnd-*options.RepairStart > operation.Seconds+.001 {
				return errors.New("song repair requires a valid interval within the generation duration")
			}
		}
		if options.CandidateStart != nil || options.CandidateEnd != nil || operation.Action == "audio_separate" && options.RepairEnd != nil {
			if operation.Action != "audio_separate" || options.RepairEnd == nil || options.CandidateStart == nil || options.CandidateEnd == nil || math.IsNaN(*options.CandidateStart) || math.IsInf(*options.CandidateStart, 0) || math.IsNaN(*options.CandidateEnd) || math.IsInf(*options.CandidateEnd, 0) || *options.CandidateStart < 0 || *options.CandidateEnd <= *options.CandidateStart || *options.CandidateEnd > 600 {
				return errors.New("select valid original and candidate audio intervals")
			}
		}

		if options.MusicMode != "" || options.Lyrics != "" || options.BPM != 0 || options.Seed != nil {
			if operation.Action != "music" || !slices.Contains([]string{"", "instrumental", "song"}, options.MusicMode) || len([]rune(options.Lyrics)) > 3000 || options.BPM != 0 && (options.BPM < 30 || options.BPM > 240) || options.Seed != nil && (*options.Seed < 0 || *options.Seed > 2147483647) {
				return errors.New("invalid music mode, lyrics, tempo or seed")
			}
			if options.MusicMode == "song" && strings.TrimSpace(options.Lyrics) == "" || options.MusicMode != "song" && options.Lyrics != "" {
				return errors.New("lyrics are required for song mode and must be empty for instrumental mode")
			}
			if options.MusicMode == "song" && StudioSongDuration(options.Lyrics) > 30 {
				return errors.New("split lyrics into shorter sections for the thirty-second local song limit")
			}
		}
		if options.Width < 0 || options.Width > 2048 || options.Height < 0 || options.Height > 2048 || options.Scale < 0 || options.Scale > 4 || options.Rows < 0 || options.Rows > 4 || options.Columns < 0 || options.Columns > 4 || len(options.Translation) > 3000 || len(options.Negative) > 3000 {
			return errors.New("invalid image tool dimensions or translation length")
		}
		for _, value := range []float64{options.Speed, options.Pitch, options.Pause, options.Expression} {
			if math.IsNaN(value) || math.IsInf(value, 0) {
				return errors.New("invalid voice expression")
			}
		}
		if options.Speed != 0 && (options.Speed < .5 || options.Speed > 2) || options.Pitch < -12 || options.Pitch > 12 || options.Pause < 0 || options.Pause > 3 || options.Expression < 0 || options.Expression > 2 {
			return errors.New("voice expression exceeds the supported range")
		}
	}
	found := false
	for _, node := range studioObjects(document, "nodes") {
		if node["id"] != operation.NodeID {
			continue
		}
		data, _ := node["data"].(map[string]any)
		takes, _ := data["takes"].([]any)
		if data["kind"] != kind || data["purpose"] == "assembly" || data["locked"] == true || len(takes) >= 100 {
			return errors.New("select a compatible audio or video node with available Take capacity")
		}
		found = true
	}
	if !found {
		return errors.New("production media node is unavailable")
	}
	refs := StudioMediaReferences(document)
	audio, video, image := false, false, false
	videoCount := 0
	seen := map[string]bool{}
	for _, id := range operation.ReferenceMediaIDs {
		if !StudioIDPattern.MatchString(id) || !refs[id] || seen[id] {
			return errors.New("media reference is unavailable, duplicated or outside this project")
		}
		seen[id] = true
		media, err := GetStudioMedia(ownerID, id)
		if err != nil {
			return err
		}
		if strings.HasPrefix(media.MimeType, "video/") && operation.Action == "video_depth" {
			videoCount++
			path, err := StudioMediaPath(media)
			if err != nil {
				return err
			}
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			probe, err := ProbeStudioMedia(ctx, path)
			cancel()
			if err != nil || !probe.HasVideo || probe.Duration < 1 {
				return errors.New("Reading source video duration. Choose one decodable video.")
			}
			if operation.Seconds > probe.Duration {
				return errors.New("Requested duration exceeds the source video. Use its valid duration.")
			}
		}
		audio = audio || strings.HasPrefix(media.MimeType, "audio/")
		video = video || strings.HasPrefix(media.MimeType, "video/")
		image = image || strings.HasPrefix(media.MimeType, "image/")
		if !strings.HasPrefix(media.MimeType, "audio/") && !strings.HasPrefix(media.MimeType, "video/") && !strings.HasPrefix(media.MimeType, "image/") {
			return errors.New("unsupported reference media type")
		}
	}
	if operation.Options != nil {
		options := operation.Options
		requiredImages := 1
		if options.MaskSource == "second_reference" || options.RedoPanel > 0 {
			requiredImages = 2
		}
		if requiredImages == 2 {
			if len(operation.ReferenceMediaIDs) != 2 {
				return errors.New("choose the source image and the mask or original grid, in that order")
			}
			for _, id := range operation.ReferenceMediaIDs {
				media, err := GetStudioMedia(ownerID, id)
				if err != nil || !strings.HasPrefix(media.MimeType, "image/") {
					return errors.New("image repair references must be stored images")
				}
			}
		}
		if options.RepairEnd != nil {
			expected := 1
			if operation.Action == "audio_separate" {
				expected = 2
			}
			if !audio || len(operation.ReferenceMediaIDs) != expected {
				return errors.New("song repair requires one stored original song")
			}
			media, err := GetStudioMedia(ownerID, operation.ReferenceMediaIDs[0])
			if err != nil {
				return err
			}
			if !strings.HasPrefix(media.MimeType, "audio/") {
				return errors.New("choose the original song first and the candidate audio second")
			}
			path, err := StudioMediaPath(media)
			if err != nil {
				return err
			}
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			probe, err := ProbeStudioMedia(ctx, path)
			cancel()
			if err != nil || !probe.HasAudio || *options.RepairEnd > probe.Duration {
				return errors.New("song repair interval exceeds the source audio")
			}
			if expected == 2 {
				candidate, err := GetStudioMedia(ownerID, operation.ReferenceMediaIDs[1])
				if err != nil || !strings.HasPrefix(candidate.MimeType, "audio/") {
					return errors.New("choose the original song first and the candidate audio second")
				}
				candidatePath, err := StudioMediaPath(candidate)
				if err != nil {
					return err
				}
				ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
				candidateProbe, err := ProbeStudioMedia(ctx, candidatePath)
				cancel()
				if err != nil || !candidateProbe.HasAudio || *options.CandidateEnd > candidateProbe.Duration || operation.Seconds+.001 < probe.Duration+candidateProbe.Duration {
					return errors.New("candidate interval or processing duration exceeds available audio")
				}
			}
		}
	}

	if strings.HasPrefix(operation.Action, "image_") && operation.Action != "image_grid" && !image {
		return errors.New("this image tool requires a stored image reference")
	}
	if (operation.Action == "audio_separate" || operation.Action == "audio_translate") && !audio {
		return errors.New("this audio tool requires a stored audio reference")
	}
	if operation.Action == "audio_translate" && strings.TrimSpace(operation.Language) == "" {
		return errors.New("translated dubbing requires a target language")
	}
	if operation.Action == "voice_clone" && (!audio || !operation.ConfirmVoiceRights) {
		return errors.New("voice cloning requires audio and confirmation of voice permission")
	}
	if operation.Action == "video_remove" || operation.Action == "video_replace" {
		edit := operation.Edit
		if !video || edit == nil || math.IsNaN(edit.Start) || math.IsNaN(edit.End) || math.IsInf(edit.Start, 0) || math.IsInf(edit.End, 0) || edit.Start < 0 || edit.End <= edit.Start || edit.End > 3600 || edit.End-edit.Start > 30 || edit.X < 0 || edit.Y < 0 || edit.Width < 2 || edit.Height < 2 || edit.X > 8192 || edit.Y > 8192 || edit.Width > 8192 || edit.Height > 8192 {
			return errors.New("select a stored video, object region and interval of at most thirty seconds")
		}
		if operation.Action == "video_replace" && strings.TrimSpace(operation.Prompt) == "" {
			return errors.New("describe the replacement object")
		}
	}
	if operation.Action == "lip_sync" && (!audio || !video) {
		return errors.New("lip sync requires audio and video references")
	}
	if operation.Action == "video_depth" && (videoCount != 1 || !video || operation.Seconds < 1 || operation.Seconds > 30) {
		return errors.New("depth reference requires a stored video and one to thirty seconds")
	}
	if operation.Action == "voice_speech" && strings.TrimSpace(operation.VoiceID) == "" {
		return errors.New("voice synthesis requires a selected voice ID")
	}
	if (operation.Action == "voice_speech" || operation.Action == "audio_translate") && operation.VoiceID != "" && operation.VoiceID != "default" && operation.VoiceID != "alloy" {
		allowed := false
		for _, node := range studioObjects(document, "nodes") {
			data, _ := node["data"].(map[string]any)
			for _, take := range studioObjects(data, "takes") {
				if take["voice"] == operation.VoiceID && take["status"] == "completed" {
					allowed = true
				}
			}
		}
		if !allowed {
			return errors.New("selected voice is not available in this project")
		}
	}
	if operation.DialogueCueID != "" {
		production, _ := document["production"].(map[string]any)
		found := false
		for _, cue := range studioObjects(production, "dialogueCues") {
			if cue["id"] == operation.DialogueCueID && cue["text"] == operation.Prompt {
				found = true
			}
		}
		if !found || operation.Action != "voice_speech" {
			return errors.New("dialogue cue must match the selected voice speech text")
		}
	}
	return nil
}

var studioLyricWords = regexp.MustCompile(`[\p{Han}]|[\p{L}]+`)
var studioLyricHeading = regexp.MustCompile(`^\s*\[[^\]]+\]\s*$`)

// StudioSongDuration is a conservative planning estimate, not an alignment guarantee.
func StudioSongDuration(lyrics string) int {
	seconds := 4.0
	for _, line := range strings.Split(lyrics, "\n") {
		if strings.TrimSpace(line) != "" && !studioLyricHeading.MatchString(line) {
			seconds += .75 + float64(len(studioLyricWords.FindAllString(line, -1)))*.65
		}
	}
	return max(8, int(math.Ceil(seconds)))
}

func RunStudioMediaOperation(ctx context.Context, job *model.StudioWorkflowJob, project *model.StudioProject, operation *StudioMediaOperation) error {
	if operation == nil {
		return errors.New("production media configuration is missing")
	}
	var progress StudioWorkflowProgress
	if err := common.Unmarshal([]byte(job.Result), &progress); err != nil {
		return err
	}
	if progress.Take != nil {
		if err := publishStudioWorkflowTake(job, operation.NodeID, progress.Take); err != nil {
			return err
		}
		if err := publishStudioDialogueAudio(job, operation, progress.Take); err != nil {
			return err
		}
		progress.Phase = "completed"
		return studioSaveProgress(job, progress, 100)
	}
	if progress.TaskID == "" {
		progress.RequestID, progress.NodeID, progress.Phase = uuid.NewString(), operation.NodeID, "preparing"
		if err := studioSaveProgress(job, progress, 0); err != nil {
			return err
		}
		references := []map[string]string{}
		for _, id := range operation.ReferenceMediaIDs {
			media, err := GetStudioMedia(project.OwnerID, id)
			if err != nil {
				return err
			}
			url, err := StudioMediaProviderReference(project.OwnerID, id)
			if err != nil {
				return err
			}
			references = append(references, map[string]string{"type": strings.SplitN(media.MimeType, "/", 2)[0], "url": url})
		}
		request, err := common.Marshal(map[string]any{"model": operation.Model, "studio_group": operation.Group, "operation": operation.Action, "prompt": operation.Prompt, "seconds": operation.Seconds, "language": operation.Language, "voice_id": operation.VoiceID, "confirm_voice_rights": operation.ConfirmVoiceRights, "references": references, "options": operation.Options, "edit": operation.Edit})
		if err != nil {
			return err
		}
		progress.Phase = "submitting"
		if err := studioSaveProgress(job, progress, 5); err != nil {
			return err
		}
		response, err := StudioWorkflowRelay(ctx, job, "production-media", request)
		if err != nil || !response.SafeToRetry && (response.Status >= 500 || response.Status == 408) {
			model.DB.Model(job).Where("lease_owner = ?", job.LeaseOwner).Update("status", "uncertain")
			return errors.New("media submission response is uncertain; reconcile the task before resuming")
		}
		if response.Status < 200 || response.Status >= 300 {
			progress.Phase = "rejected"
			if err := studioSaveProgress(job, progress, 5); err != nil {
				return err
			}
			return fmt.Errorf("media submission returned HTTP %d", response.Status)
		}
		var parsed struct {
			ID     string `json:"id"`
			TaskID string `json:"task_id"`
		}
		if err := common.Unmarshal(response.Body, &parsed); err != nil {
			return err
		}
		progress.TaskID = parsed.TaskID
		if progress.TaskID == "" {
			progress.TaskID = parsed.ID
		}
		if !StudioIDPattern.MatchString(progress.TaskID) {
			return errors.New("media submission returned no usable task ID")
		}
		progress.Phase = "waiting"
		if err := studioSaveProgress(job, progress, 10); err != nil {
			return err
		}
	}
	if err := waitStudioTask(ctx, job, progress.TaskID); err != nil {
		return err
	}
	response, err := StudioWorkflowRelay(ctx, job, "artifact:"+progress.TaskID, nil)
	if err != nil || response.Status != 200 {
		return errors.New("completed media could not be stored; resume collection using the saved task ID")
	}
	wantType := "audio/"
	if operation.Action == "lip_sync" || operation.Action == "video_remove" || operation.Action == "video_replace" || operation.Action == "video_depth" {
		wantType = "video/"
	}
	if strings.HasPrefix(operation.Action, "image_") {
		wantType = "image/"
	}
	if !strings.HasPrefix(response.ContentType, wantType) {
		return errors.New("media worker returned an incompatible content type")
	}
	media, err := SaveStudioMedia(project.OwnerID, progress.RequestID, response.ContentType, bytes.NewReader(response.Body))
	if err != nil {
		return err
	}
	if err := LinkStudioProjectMedia(project.ID, media.MediaID); err != nil {
		return err
	}
	snapshot, err := common.Marshal(operation)
	if err != nil {
		return err
	}
	take := map[string]any{"id": progress.RequestID, "createdAt": time.Now().UTC().Format(time.RFC3339Nano), "status": "completed", "model": operation.Model, "prompt": operation.Prompt, "mediaId": media.MediaID, "taskId": progress.TaskID, "requestSnapshot": string(snapshot)}
	// Collect all artifacts under the original task receipt. Deterministic media
	// IDs make interrupted collection resumable without generating or charging again.
	if task, exists, err := model.GetByTaskId(job.UserID, progress.TaskID); err == nil && exists {
		var result struct {
			Translation string `json:"translation"`
			Artifacts   []struct {
				Key      string `json:"key"`
				Type     string `json:"type"`
				MimeType string `json:"mime_type"`
			} `json:"artifacts"`
		}
		if len(task.Data) > 0 {
			if err := common.Unmarshal(task.Data, &result); err != nil {
				return err
			}
		}
		if len(result.Artifacts) > 20 {
			return errors.New("worker returned too many tool artifacts")
		}
		auxiliary := []map[string]any{}
		seen := map[string]bool{}
		for _, artifact := range result.Artifacts {
			if artifact.Key == "output" {
				continue
			}
			if !StudioIDPattern.MatchString(artifact.Key) || seen[artifact.Key] {
				return errors.New("invalid or duplicate tool artifact key")
			}
			seen[artifact.Key] = true
			response, err := StudioWorkflowRelay(ctx, job, "artifact:"+progress.TaskID+":"+artifact.Key, nil)
			if err != nil || response.Status != 200 || response.ContentType != artifact.MimeType {
				return errors.New("tool artifact could not be collected; resume the saved task")
			}
			id := uuid.NewSHA1(uuid.NameSpaceOID, []byte(progress.RequestID+":"+artifact.Key)).String()
			stored, err := SaveStudioMedia(project.OwnerID, id, response.ContentType, bytes.NewReader(response.Body))
			if err != nil {
				return err
			}
			if err := LinkStudioProjectMedia(project.ID, id); err != nil {
				return err
			}
			auxiliary = append(auxiliary, map[string]any{"role": artifact.Key, "mediaId": stored.MediaID, "mimeType": stored.MimeType})
		}
		if len(auxiliary) > 0 {
			take["auxiliary"] = auxiliary
		}
		if result.Translation != "" && len(result.Translation) <= 3000 {
			take["outputText"] = result.Translation
		}
	}
	if operation.Action == "voice_speech" && operation.VoiceID != "" {
		take["voice"] = operation.VoiceID
	}
	if operation.Action == "voice_clone" {
		if task, exists, err := model.GetByTaskId(job.UserID, progress.TaskID); err == nil && exists {
			var result struct {
				VoiceID string `json:"voice_id"`
			}
			if common.Unmarshal(task.Data, &result) == nil && len(result.VoiceID) > 0 && len(result.VoiceID) <= 100 {
				take["voice"] = result.VoiceID
			}
		}
	}
	progress.Take, progress.Phase, progress.MediaID = take, "collected", media.MediaID
	if err := studioSaveProgress(job, progress, 90); err != nil {
		return err
	}
	if err := publishStudioWorkflowTake(job, operation.NodeID, take); err != nil {
		return err
	}
	if err := publishStudioDialogueAudio(job, operation, take); err != nil {
		return err
	}
	progress.Phase = "completed"
	return studioSaveProgress(job, progress, 100)
}

func publishStudioDialogueAudio(job *model.StudioWorkflowJob, operation *StudioMediaOperation, take map[string]any) error {
	if operation.DialogueCueID == "" {
		return nil
	}
	mediaID, _ := take["mediaId"].(string)
	project, _, err := model.StudioProjectAccess(model.DB, job.UserID, job.ProjectID, true)
	if err != nil {
		return err
	}
	media, err := GetStudioMedia(project.OwnerID, mediaID)
	if err != nil {
		return err
	}
	path, err := StudioMediaPath(media)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	probe, err := ProbeStudioMedia(ctx, path)
	if err != nil || !probe.HasAudio || probe.Duration <= 0 || probe.Duration > 3600 {
		return errors.New("dialogue audio must have a valid duration")
	}
	for range 5 {
		project, _, err = model.StudioProjectAccess(model.DB, job.UserID, job.ProjectID, true)
		if err != nil {
			return err
		}
		var document map[string]any
		if err := common.Unmarshal([]byte(project.Document), &document); err != nil {
			return err
		}
		production, _ := document["production"].(map[string]any)
		for _, cue := range studioObjects(production, "dialogueCues") {
			if cue["id"] != operation.DialogueCueID {
				continue
			}
			if cue["text"] != operation.Prompt || cue["audioMediaId"] == mediaID {
				return nil
			}
			cue["audioMediaId"], cue["duration"] = mediaID, probe.Duration
		}
		raw, err := common.Marshal(document)
		if err != nil {
			return err
		}
		_, err = model.SaveStudioProject(job.UserID, project.ID, project.Title, project.Revision, string(raw))
		if errors.Is(err, model.ErrStudioRevision) {
			continue
		}
		return err
	}
	return model.ErrStudioRevision
}
