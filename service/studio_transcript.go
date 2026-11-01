package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

type StudioTranscriptSpan struct {
	ID         string   `json:"id"`
	Start      float64  `json:"start"`
	End        float64  `json:"end"`
	Text       string   `json:"text"`
	Speaker    string   `json:"speaker,omitempty"`
	Confidence *float64 `json:"confidence,omitempty"`
}

type StudioTranscript struct {
	Kind      string                 `json:"kind"`
	Text      string                 `json:"text"`
	Language  string                 `json:"language"`
	Duration  float64                `json:"duration"`
	Precision string                 `json:"precision"`
	Segments  []StudioTranscriptSpan `json:"segments"`
	Words     []StudioTranscriptSpan `json:"words"`
}

type StudioTranscriptCorrection struct {
	RequestID string `json:"request_id"`
	Segments  []struct {
		ID      string `json:"id"`
		Text    string `json:"text"`
		Speaker string `json:"speaker"`
	} `json:"segments"`
}

func CorrectStudioTranscript(actorID int, projectID, analysisID string, request StudioTranscriptCorrection) (*model.StudioProductionRecord, error) {
	project, _, err := model.StudioProjectAccess(model.DB, actorID, projectID, true)
	if err != nil {
		return nil, err
	}
	if !StudioIDPattern.MatchString(request.RequestID) || len(request.Segments) == 0 || len(request.Segments) > 10000 {
		return nil, errors.New("choose transcript sentences to correct")
	}
	record, data, err := ReadStudioAnalysisResult(actorID, analysisID)
	if err != nil {
		return nil, err
	}
	if record.ProjectID != projectID {
		return nil, model.ErrStudioAccess
	}
	analysis, _ := data["analysis"].(map[string]any)
	if analysis["kind"] != "transcript" {
		return nil, errors.New("choose a transcript result")
	}
	changes := map[string]struct{ Text, Speaker string }{}
	for _, change := range request.Segments {
		if len(change.Text) > 10000 || len(change.Speaker) > 200 || !StudioIDPattern.MatchString(change.ID) {
			return nil, errors.New("transcript correction exceeds its limit")
		}
		if _, present := changes[change.ID]; present {
			return nil, errors.New("duplicate sentence correction")
		}
		changes[change.ID] = struct{ Text, Speaker string }{change.Text, change.Speaker}
	}
	for _, span := range studioObjects(analysis, "segments") {
		id, _ := span["id"].(string)
		if change, ok := changes[id]; ok {
			span["text"], span["speaker"], span["human_corrected"] = change.Text, change.Speaker, true
			delete(changes, id)
		}
	}
	if len(changes) > 0 {
		return nil, errors.New("a transcript sentence is unavailable")
	}
	if analysis["original_asr_text"] == nil {
		analysis["original_asr_text"] = analysis["text"]
	}
	texts := []string{}
	for _, span := range studioObjects(analysis, "segments") {
		if text, ok := span["text"].(string); ok && strings.TrimSpace(text) != "" {
			texts = append(texts, strings.TrimSpace(text))
		}
	}
	analysis["text"] = strings.Join(texts, " ")
	analysis["manual_correction"] = map[string]any{"parent_analysis_id": analysisID, "actor_id": actorID, "segments": request.Segments}
	mediaID, _ := data["source_media_id"].(string)
	media, err := GetStudioMedia(project.OwnerID, mediaID)
	if err != nil || media.Digest != data["source_digest"] {
		return nil, errors.New("transcript source is unavailable or changed")
	}
	return SaveStudioAnalysisResult(actorID, project, request.RequestID, mediaID, analysis, []string{"Text and speaker labels were corrected by a person. Original word timing and ASR confidence are retained; changed text has sentence-level timing only."})
}

func studioAnalysisID(seed string) string {
	sum := sha256.Sum256([]byte(seed))
	return hex.EncodeToString(sum[:])
}

func ParseStudioTranscript(raw []byte, digest string) (*StudioTranscript, error) {
	// Providers use numeric segment IDs and may call word text "word".
	// Imported IDs never define our edit identity: source-bound IDs are rebuilt below.
	var payload map[string]any
	if len(raw) > StudioMaxDocumentBytes || common.Unmarshal(raw, &payload) != nil {
		return nil, errors.New("transcription returned invalid text or timestamps")
	}
	for _, key := range []string{"segments", "words"} {
		for _, span := range studioObjects(payload, key) {
			delete(span, "id")
			if key == "words" && span["text"] == nil {
				span["text"] = span["word"]
			}
		}
	}
	var err error
	raw, err = common.Marshal(payload)
	if err != nil {
		return nil, err
	}
	var result StudioTranscript
	if common.Unmarshal(raw, &result) != nil || len(result.Text) > 300000 || len(result.Segments) > 10000 || len(result.Words) > 100000 || len(result.Segments) == 0 {
		return nil, errors.New("transcription returned invalid text or timestamps")
	}
	result.Kind, result.Precision = "transcript", "segment"
	for kind, values := range map[string][]StudioTranscriptSpan{"segment": result.Segments, "word": result.Words} {
		previous := -1.0
		for index := range values {
			span := &values[index]
			if math.IsNaN(span.Start) || math.IsInf(span.Start, 0) || math.IsNaN(span.End) || math.IsInf(span.End, 0) || span.Start < 0 || span.Start < previous || span.End <= span.Start || span.End > 3600 || len(span.Text) > 10000 {
				return nil, errors.New("transcription returned invalid timestamps")
			}
			if span.Confidence != nil && (math.IsNaN(*span.Confidence) || math.IsInf(*span.Confidence, 0) || *span.Confidence < 0 || *span.Confidence > 1) {
				return nil, errors.New("transcription returned invalid confidence")
			}
			span.ID = studioAnalysisID(fmt.Sprintf("%s:%s:%d:%.6f:%.6f", digest, kind, index, span.Start, span.End))[:32]
			// ASR does not prove the identity of a speaker. Labels are a separate human correction.
			span.Speaker = ""
			previous = span.Start
			result.Duration = max(result.Duration, span.End)
		}
	}
	if math.IsNaN(result.Duration) || math.IsInf(result.Duration, 0) || result.Duration <= 0 || result.Duration > 3600 {
		return nil, errors.New("transcription duration exceeds its limit")
	}
	if len(result.Words) > 0 {
		result.Precision = "word"
	}
	return &result, nil
}

func SaveStudioAnalysisResult(actorID int, project *model.StudioProject, recordID, mediaID string, payload any, limitations []string) (*model.StudioProductionRecord, error) {
	media, err := GetStudioMedia(project.OwnerID, mediaID)
	if err != nil {
		return nil, err
	}
	raw, err := common.Marshal(payload)
	if err != nil || len(raw) > StudioMaxDocumentBytes {
		return nil, errors.New("analysis exceeds its artifact limit")
	}
	artifact, err := SaveStudioMedia(project.OwnerID, studioAnalysisID(recordID+":artifact"), "application/json", bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	if err := LinkStudioProjectMedia(project.ID, artifact.MediaID); err != nil {
		return nil, err
	}
	var summary map[string]any
	if common.Unmarshal(raw, &summary) != nil {
		return nil, errors.New("analysis must be an object")
	}
	return SaveStudioProductionRecord(actorID, project.ID, recordID, "analysis", project.Revision, map[string]any{
		"kind": summary["kind"], "source_media_id": mediaID, "source_digest": media.Digest,
		"analysis": map[string]any{"kind": summary["kind"], "artifact_media_id": artifact.MediaID, "artifact_digest": artifact.Digest}, "limitations": limitations,
	})
}

// Resolve through an already-authorized immutable record, never a caller URL.
func ReadStudioAnalysisResult(actorID int, id string) (*model.StudioProductionRecord, map[string]any, error) {
	record, err := model.ReadStudioProductionRecord(actorID, id, false)
	if err != nil || record.Kind != "analysis" {
		return nil, nil, model.ErrStudioAccess
	}
	var result map[string]any
	if err := common.Unmarshal([]byte(record.Document), &result); err != nil {
		return nil, nil, err
	}
	analysis, _ := result["analysis"].(map[string]any)
	artifactID, _ := analysis["artifact_media_id"].(string)
	if artifactID == "" {
		return record, result, nil
	}
	media, err := GetStudioMedia(record.OwnerID, artifactID)
	if err != nil || media.Digest != analysis["artifact_digest"] || media.Size > StudioMaxDocumentBytes {
		return nil, nil, errors.New("analysis artifact is unavailable or changed")
	}
	path, err := StudioMediaPath(media)
	if err != nil {
		return nil, nil, err
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, nil, err
	}
	defer file.Close()
	raw, err := io.ReadAll(io.LimitReader(file, StudioMaxDocumentBytes+1))
	analysis = nil
	if err != nil || len(raw) > StudioMaxDocumentBytes || common.Unmarshal(raw, &analysis) != nil {
		return nil, nil, errors.New("analysis artifact is invalid")
	}
	result["analysis"] = analysis
	return record, result, nil
}

func studioTranscriptionAudio(ctx context.Context, project *model.StudioProject, source *model.StudioMedia, jobID string) (*model.StudioMedia, error) {
	if strings.HasPrefix(source.MimeType, "audio/") {
		if source.Size > 20<<20 {
			return nil, errors.New("transcription audio exceeds 20 MiB")
		}
		return source, nil
	}
	if !strings.HasPrefix(source.MimeType, "video/") {
		return nil, errors.New("transcription requires audio or video")
	}
	path, err := StudioMediaPath(source)
	if err != nil {
		return nil, err
	}
	probe, err := ProbeStudioMedia(ctx, path)
	if err != nil {
		return nil, err
	}
	if !probe.HasAudio || probe.Duration <= 0 || probe.Duration > 3600 {
		return nil, errors.New("choose video with audio up to one hour")
	}
	dir, err := CreateStudioCacheWorkdir("", project.OwnerID, jobID, "transcript-extraction", true, nil)
	if err != nil {
		return nil, err
	}
	succeeded := false
	defer func() {
		state := "failed"
		if succeeded {
			state = "succeeded"
		}
		_ = UpdateStudioCacheWorkdir("", dir, state, time.Now().Unix(), StudioCacheRetentionPolicy())
	}()
	out := filepath.Join(dir, "source.mp3")
	if err := exec.CommandContext(ctx, studioFFmpegBinary(false), "-v", "error", "-i", path, "-vn", "-ar", "16000", "-ac", "1", "-b:a", "32k", "-y", out).Run(); err != nil {
		return nil, errors.New("could not extract video dialogue")
	}
	file, err := os.Open(out)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	media, err := SaveStudioMedia(project.OwnerID, studioAnalysisID(source.Digest+":asr-mp3-v1"), "audio/mpeg", file)
	if err != nil {
		return nil, err
	}
	if err := LinkStudioProjectMedia(project.ID, media.MediaID); err != nil {
		return nil, err
	}
	succeeded = true
	return media, nil
}
