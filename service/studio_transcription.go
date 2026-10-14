package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"math"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/google/uuid"
)

func StudioWorkflowNeedsGeneration(kind string) bool {
	return kind == "generate" || kind == "transcribe" || kind == "media" || kind == "analyze"
}

func studioSubtitleTime(seconds float64) string {
	milliseconds := int(math.Round(seconds * 1000))
	return fmt.Sprintf("%02d:%02d:%02d,%03d", milliseconds/3600000, milliseconds/60000%60, milliseconds/1000%60, milliseconds%1000)
}

func RunStudioTranscription(ctx context.Context, job *model.StudioWorkflowJob, project *model.StudioProject, operation *StudioMediaOperation) error {
	if operation == nil {
		return errors.New("transcription configuration is missing")
	}
	var progress StudioWorkflowProgress
	if err := common.Unmarshal([]byte(job.Result), &progress); err != nil {
		return err
	}
	if progress.Take == nil {
		var response StudioRelayResponse
		if progress.ResponseMediaID != "" {
			var err error
			response, err = LoadStudioRelayReceipt(project.OwnerID, progress.ResponseMediaID)
			if err != nil {
				return err
			}
		} else {
			progress.RequestID, progress.Phase = uuid.NewString(), "preparing"
			if err := studioSaveProgress(job, progress, 0); err != nil {
				return err
			}
			media, err := GetStudioMedia(project.OwnerID, operation.MediaID)
			if err != nil {
				return err
			}
			if media.Size > 20<<20 || !strings.HasPrefix(media.MimeType, "audio/") {
				return errors.New("transcription requires an audio file up to 20 MiB")
			}
			request, err := common.Marshal(map[string]any{"audio_media_id": operation.MediaID, "model": operation.Model, "studio_group": operation.Group, "language": operation.Language, "response_format": "verbose_json", "timestamp_granularities[]": "segment"})
			if err != nil {
				return err
			}
			progress.Phase = "submitting"
			if err := studioSaveProgress(job, progress, 10); err != nil {
				return err
			}
			response, err = StudioWorkflowRelay(ctx, job, "transcription", request)
			if err != nil || !response.SafeToRetry && (response.Status >= 500 || response.Status == 408) {
				model.DB.Model(job).Where("lease_owner = ?", job.LeaseOwner).Update("status", "uncertain")
				return errors.New("transcription response is uncertain; do not submit it again")
			}
			if response.Status < 200 || response.Status >= 300 {
				progress.Phase = "rejected"
				if err := studioSaveProgress(job, progress, 10); err != nil {
					return err
				}
				return fmt.Errorf("transcription returned HTTP %d", response.Status)
			}
			media, err = SaveStudioMedia(project.OwnerID, "receipt-"+progress.RequestID, response.ContentType, bytes.NewReader(response.Body))
			if err != nil {
				return err
			}
			progress.ResponseMediaID, progress.Phase = media.MediaID, "responded"
			if err := studioSaveProgress(job, progress, 20); err != nil {
				return err
			}
		}
		var parsed struct {
			Text     string `json:"text"`
			Segments []struct {
				Start float64 `json:"start"`
				End   float64 `json:"end"`
				Text  string  `json:"text"`
			} `json:"segments"`
		}
		if common.Unmarshal(response.Body, &parsed) != nil || len(parsed.Text) > 300000 || len(parsed.Segments) > 10000 {
			return errors.New("transcription returned invalid text or segments")
		}
		var subtitles strings.Builder
		for index, segment := range parsed.Segments {
			if math.IsNaN(segment.Start) || math.IsInf(segment.Start, 0) || math.IsNaN(segment.End) || math.IsInf(segment.End, 0) || segment.Start < 0 || segment.End <= segment.Start || segment.End > 3600 || len(segment.Text) > 10000 {
				return errors.New("transcription returned invalid timestamps")
			}
			fmt.Fprintf(&subtitles, "%d\n%s --> %s\n%s\n\n", index+1, studioSubtitleTime(segment.Start), studioSubtitleTime(segment.End), strings.TrimSpace(segment.Text))
		}
		if len(subtitles.String()) > 100000 {
			return errors.New("transcription subtitles exceed the project limit")
		}
		progress.Take, progress.Phase = map[string]any{"text": parsed.Text, "subtitles": subtitles.String(), "media_id": operation.MediaID}, "collected"
		if err := studioSaveProgress(job, progress, 90); err != nil {
			return err
		}
	}
	var frozen StudioWorkflowPlan
	if err := common.Unmarshal([]byte(job.Plan), &frozen); err != nil {
		return err
	}
	for range 5 {
		current, _, err := model.StudioProjectAccess(model.DB, job.UserID, job.ProjectID, true)
		if err != nil {
			return err
		}
		var doc map[string]any
		if err := common.Unmarshal([]byte(current.Document), &doc); err != nil {
			return err
		}
		if doc["captionsText"] != frozen.Document["captionsText"] {
			progress.Take["applied"] = false
			break
		}
		if progress.Take["subtitles"] == "" {
			progress.Take["applied"] = false
			break
		}
		doc["captionsText"] = progress.Take["subtitles"]
		raw, err := common.Marshal(doc)
		if err != nil {
			return err
		}
		if _, err := model.SaveStudioProject(job.UserID, project.ID, project.Title, current.Revision, string(raw)); errors.Is(err, model.ErrStudioRevision) {
			continue
		} else if err != nil {
			return err
		}
		progress.Take["applied"] = true
		break
	}
	progress.Phase = "completed"
	return studioSaveProgress(job, progress, 100)
}
