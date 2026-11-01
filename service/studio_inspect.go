package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"math"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"os"
	"os/exec"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

// Inspect coordinates are normalized display coordinates, never CSS pixels.
type StudioInspectROI struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

type StudioInspectOptions struct {
	Start          float64           `json:"start"`
	End            float64           `json:"end"`
	SceneThreshold float64           `json:"scene_threshold,omitempty"`
	ROI            *StudioInspectROI `json:"roi,omitempty"`
	AnchorTime     *float64          `json:"anchor_time,omitempty"`
	TargetAspect   float64           `json:"target_aspect,omitempty"`
}

func ValidateStudioInspect(ownerID int, document map[string]any, operation *StudioMediaOperation) error {
	if operation == nil || operation.Inspect == nil || !StudioIDPattern.MatchString(operation.MediaID) || !StudioMediaReferences(document)[operation.MediaID] {
		return errors.New("select stored source media in this project and an analysis interval")
	}
	if !slices.Contains([]string{"scene_detect", "audio_structure", "subject_track"}, operation.Action) {
		return errors.New("unsupported production analysis action")
	}
	op := operation.Inspect
	finite := func(value float64) bool { return !math.IsNaN(value) && !math.IsInf(value, 0) }
	if !finite(op.Start) || !finite(op.End) || op.Start < 0 || op.End-op.Start < .05 || op.End > 3600 {
		return errors.New("analysis interval must be between 0.05 seconds and one hour")
	}
	if !finite(op.SceneThreshold) || op.SceneThreshold != 0 && (op.SceneThreshold < .01 || op.SceneThreshold > .9) {
		return errors.New("scene threshold must be between 0.01 and 0.9")
	}
	if operation.Action == "subject_track" {
		roi := op.ROI
		if op.End-op.Start > 120 || roi == nil || !finite(roi.X) || !finite(roi.Y) || !finite(roi.Width) || !finite(roi.Height) || roi.X < 0 || roi.Y < 0 || roi.Width <= 0 || roi.Height <= 0 || roi.X+roi.Width > 1 || roi.Y+roi.Height > 1 || !finite(op.TargetAspect) || op.TargetAspect != 0 && (op.TargetAspect < .25 || op.TargetAspect > 4) {
			return errors.New("tracking needs a normalized subject rectangle, target aspect 0.25 to 4 and at most 120 seconds")
		}
		if op.AnchorTime != nil && (!finite(*op.AnchorTime) || *op.AnchorTime < op.Start || *op.AnchorTime >= op.End) {
			return errors.New("tracking anchor must lie inside the selected source interval")
		}
	}
	media, err := GetStudioMedia(ownerID, operation.MediaID)
	if err != nil || media.Size < 1 || media.Size > StudioMaxMediaBytes || operation.Action != "audio_structure" && !strings.HasPrefix(media.MimeType, "video/") || operation.Action == "audio_structure" && !strings.HasPrefix(media.MimeType, "audio/") && !strings.HasPrefix(media.MimeType, "video/") {
		return errors.New("analysis requires an accessible stored audio or video source")
	}
	if operation.TakeID != "" {
		found := false
		for _, node := range studioObjects(document, "nodes") {
			data, _ := node["data"].(map[string]any)
			for _, take := range studioObjects(data, "takes") {
				found = found || take["id"] == operation.TakeID && take["mediaId"] == operation.MediaID && take["status"] == "completed"
			}
		}
		if !found {
			return errors.New("the exact source Take is not part of this project")
		}
	}
	path, err := StudioMediaPath(media)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	probe, err := ProbeStudioMedia(ctx, path)
	if err != nil || op.End > probe.Duration+.001 || operation.Action == "audio_structure" && !probe.HasAudio || operation.Action != "audio_structure" && !probe.HasVideo || probe.Width > 8192 || probe.Height > 8192 {
		return errors.New("analysis interval or media type does not match the actual decoded source")
	}
	if operation.Action != "scene_detect" {
		_, err = studioInspectWorkerEndpoint()
		return err
	}
	return nil
}

// Only the server config selects the worker. Literal private/loopback addresses
// prevent public endpoints, DNS rebinding, redirects and proxy-environment leaks.
func studioInspectWorkerEndpoint() (string, error) {
	u, err := url.Parse(os.Getenv("STUDIO_LOCAL_WORKER_URL"))
	if err != nil || u.Scheme != "http" || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "" && u.Path != "/" {
		return "", errors.New("configure a private STUDIO_LOCAL_WORKER_URL before local analysis")
	}
	host := u.Hostname()
	if host != "localhost" {
		address, err := netip.ParseAddr(host)
		if err != nil || !address.IsLoopback() && !address.IsPrivate() {
			return "", errors.New("analysis worker must use a literal private or loopback address")
		}
	}
	return strings.TrimSuffix(u.String(), "/") + "/production-analysis", nil
}

func studioInspectWorker(ctx context.Context, action string, media []byte, options map[string]any) (map[string]any, error) {
	endpoint, err := studioInspectWorkerEndpoint()
	if err != nil {
		return nil, err
	}
	if len(media) == 0 || len(media) > 24<<20 {
		return nil, errors.New("decoded analysis interval exceeds 24 MiB")
	}
	body, err := common.Marshal(map[string]any{"action": action, "media": base64.StdEncoding.EncodeToString(media), "options": options})
	if err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Content-Type", "application/json")
	transport := &http.Transport{DialContext: (&net.Dialer{Timeout: 10 * time.Second}).DialContext, ResponseHeaderTimeout: 5 * time.Minute}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: 6 * time.Minute, CheckRedirect: func(*http.Request, []*http.Request) error {
		return errors.New("analysis worker redirects are forbidden")
	}}
	response, err := client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, (2<<20)+1))
	if err != nil || len(raw) > 2<<20 {
		return nil, errors.New("analysis worker response exceeds its limit")
	}
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("local production analysis failed with HTTP %d: %s", response.StatusCode, string(raw[:min(len(raw), 1500)]))
	}
	var result map[string]any
	if common.Unmarshal(raw, &result) != nil || result["kind"] != action {
		return nil, errors.New("local analysis returned an incompatible result")
	}
	return result, nil
}

type studioInspectBoundedOutput struct{ bytes.Buffer }

func (b *studioInspectBoundedOutput) Write(value []byte) (int, error) {
	if b.Len()+len(value) > 4<<20 {
		return 0, errors.New("scene analysis output exceeds its limit")
	}
	return b.Buffer.Write(value)
}

// Scene scores inspect every decoded frame. showinfo reports the selected
// source frame PTS, including VFR input; no sampled-image guess defines a cut.
func studioInspectSceneChunk(ctx context.Context, path string, start, end, threshold float64) (map[string]any, error) {
	if threshold == 0 {
		threshold = .3
	}
	var output studioInspectBoundedOutput
	command := exec.CommandContext(ctx, studioFFmpegBinary(false), "-nostdin", "-nostats", "-v", "info", "-copyts", "-start_at_zero", "-ss", fmt.Sprint(max(0, start-.5)), "-i", path, "-to", fmt.Sprint(end+.5), "-an", "-vf", fmt.Sprintf("select='gt(scene,%g)',showinfo", threshold), "-fps_mode", "vfr", "-f", "null", "-")
	command.Stderr = &output
	if err := command.Run(); err != nil {
		return nil, errors.New("FFmpeg could not measure scene differences")
	}
	pattern := regexp.MustCompile(`pts_time:([-+0-9.eE]+)`)
	cuts := []any{}
	for _, match := range pattern.FindAllStringSubmatch(output.String(), -1) {
		seconds, err := strconv.ParseFloat(match[1], 64)
		if err == nil && seconds > start+1e-7 && seconds <= end+1e-7 {
			cuts = append(cuts, map[string]any{"time": seconds, "review_required": true, "kind": "scene_difference_candidate"})
		}
	}
	return map[string]any{"kind": "scene_detect", "start": start, "end": end, "cuts": cuts, "threshold": threshold, "method": "FFmpeg per-frame scene difference + source presentation timestamps", "review_required": true}, nil
}

func studioInspectRecordID(jobID, suffix string) string {
	digest := sha256.Sum256([]byte(jobID + ":" + suffix))
	return "analysis-" + hex.EncodeToString(digest[:])
}

func saveStudioInspectProgress(job *model.StudioWorkflowJob, value map[string]any, percent int) error {
	raw, err := common.Marshal(value)
	if err != nil {
		return err
	}
	updated := model.DB.Model(&model.StudioWorkflowJob{}).Where("id = ? AND lease_owner = ?", job.ID, job.LeaseOwner).Updates(map[string]any{"result": model.StudioDocument(raw), "progress": percent})
	if updated.Error != nil {
		return updated.Error
	}
	if updated.RowsAffected != 1 {
		return errors.New("analysis workflow lease was lost")
	}
	job.Result = model.StudioDocument(raw)
	return nil
}

func RunStudioInspect(ctx context.Context, job *model.StudioWorkflowJob, project *model.StudioProject, plan *StudioWorkflowPlan) error {
	if plan == nil || project == nil || job == nil {
		return errors.New("analysis workflow is incomplete")
	}
	pinned := *project
	pinned.Revision = job.Revision
	project = &pinned
	if err := ValidateStudioInspect(project.OwnerID, plan.Document, plan.Operation); err != nil {
		return err
	}
	op := plan.Operation
	media, err := GetStudioMedia(project.OwnerID, op.MediaID)
	if err != nil {
		return err
	}
	path, err := StudioMediaPath(media)
	if err != nil {
		return err
	}
	source, err := os.Open(path)
	if err != nil {
		return err
	}
	hash := sha256.New()
	_, err = io.Copy(hash, io.LimitReader(source, StudioMaxMediaBytes+1))
	source.Close()
	if err != nil || hex.EncodeToString(hash.Sum(nil)) != media.Digest {
		return errors.New("source bytes no longer match the immutable media digest")
	}
	snapshot, err := common.Marshal(op)
	if err != nil {
		return err
	}
	signature := sha256.Sum256(snapshot)
	requestDigest := hex.EncodeToString(signature[:])
	recordID := studioInspectRecordID(job.ID, "final")
	finish := func(record *model.StudioProductionRecord) error {
		_, expanded, err := ReadStudioAnalysisResult(job.UserID, record.ID)
		if err != nil {
			return err
		}
		analysis, _ := expanded["analysis"].(map[string]any)
		if expanded["source_digest"] != media.Digest || analysis["request_digest"] != requestDigest {
			return errors.New("saved analysis does not match this source and request")
		}
		var compact map[string]any
		if err := common.Unmarshal([]byte(record.Document), &compact); err != nil {
			return err
		}
		compact["phase"], compact["record_id"] = "completed", record.ID
		return saveStudioInspectProgress(job, compact, 100)
	}
	if record, err := model.ReadStudioProductionRecord(job.UserID, recordID, false); err == nil {
		return finish(record)
	}
	interval := *op.Inspect
	chunkSeconds := 60.0
	if op.Action == "subject_track" {
		chunkSeconds = 120
	}
	chunks := []any{}
	for start, index := interval.Start, 0; start < interval.End-1e-7; start, index = start+chunkSeconds, index+1 {
		if err := ctx.Err(); err != nil {
			return err
		}
		end := min(interval.End, start+chunkSeconds)
		chunkID := studioInspectRecordID(job.ID, fmt.Sprintf("chunk-%d", index))
		var analysis map[string]any
		resumed := false
		if record, readErr := model.ReadStudioProductionRecord(job.UserID, chunkID, false); readErr == nil {
			resumed = true
			_, saved, loadErr := ReadStudioAnalysisResult(job.UserID, record.ID)
			if loadErr != nil {
				return loadErr
			}
			analysis, _ = saved["analysis"].(map[string]any)
			if saved["source_digest"] != media.Digest || analysis["request_digest"] != requestDigest {
				return errors.New("saved analysis chunk differs from this request")
			}
		} else if op.Action == "scene_detect" {
			analysis, err = studioInspectSceneChunk(ctx, path, start, end, interval.SceneThreshold)
		} else {
			var work string
			work, err = CreateStudioCacheWorkdir("", project.OwnerID, job.ID, "production-analysis", true, nil)
			if err != nil {
				return err
			}
			func() {
				output := work + string(os.PathSeparator) + "input.wav"
				arguments := []string{"-nostdin", "-v", "error", "-y", "-ss", fmt.Sprint(start), "-t", fmt.Sprint(end - start), "-i", path}
				options := map[string]any{}
				if op.Action == "audio_structure" {
					arguments = append(arguments, "-vn", "-ac", "1", "-ar", "22050", "-c:a", "pcm_s16le")
				} else {
					output = work + string(os.PathSeparator) + "input.mp4"
					arguments = append(arguments, "-an", "-vf", "scale=w='min(480,iw)':h='min(480,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-fps_mode", "vfr", "-movflags", "+faststart")
					anchor := start
					if interval.AnchorTime != nil {
						anchor = *interval.AnchorTime
					}
					aspect := interval.TargetAspect
					if aspect == 0 {
						aspect = 9.0 / 16
					}
					options = map[string]any{"roi": interval.ROI, "anchor_time": anchor - start, "target_aspect": aspect}
				}
				arguments = append(arguments, output)
				if runErr := exec.CommandContext(ctx, studioFFmpegBinary(false), arguments...).Run(); runErr != nil {
					err = errors.New("source analysis interval could not be decoded")
					return
				}
				var data []byte
				file, openErr := os.Open(output)
				if openErr != nil {
					err = openErr
					return
				}
				data, err = io.ReadAll(io.LimitReader(file, (24<<20)+1))
				file.Close()
				if err != nil {
					return
				}
				analysis, err = studioInspectWorker(ctx, op.Action, data, options)
				if err == nil {
					analysis["start"], analysis["end"], analysis["source_time_offset"] = start, end, start
					if op.Action == "subject_track" {
						for _, point := range studioObjects(analysis, "points") {
							point["time"] = studioDocumentNumber(point["time"], 0) + start
						}
						analysis["anchor_time"] = studioDocumentNumber(analysis["anchor_time"], 0) + start
						analysis["coordinate_space"] = "normalized_display"
					} else {
						if beats, ok := analysis["beat_times"].([]any); ok {
							for i := range beats {
								beats[i] = studioDocumentNumber(beats[i], 0) + start
							}
						}
						for _, section := range studioObjects(analysis, "sections") {
							section["start"] = studioDocumentNumber(section["start"], 0) + start
							section["end"] = studioDocumentNumber(section["end"], 0) + start
						}
					}
				}
			}()
		}
		if err != nil {
			return err
		}
		analysis["request_digest"], analysis["source_take_id"] = requestDigest, op.TakeID
		if !resumed {
			if _, err := SaveStudioAnalysisResult(job.UserID, project, chunkID, media.MediaID, analysis, []string{"Analysis is a proposal; it never changes the project."}); err != nil {
				return err
			}
		}
		chunks = append(chunks, map[string]any{"record_id": chunkID, "start": start, "end": end, "analysis": analysis})
		if err := saveStudioInspectProgress(job, map[string]any{"phase": "analyzing", "kind": op.Action, "source_media_id": media.MediaID, "source_digest": media.Digest, "completed_chunks": len(chunks), "last_chunk_id": chunkID}, int(95*(end-interval.Start)/(interval.End-interval.Start))); err != nil {
			return err
		}
	}
	chunkReferences := []any{}
	for _, value := range chunks {
		chunk := value.(map[string]any)
		summary := map[string]any{"record_id": chunk["record_id"], "start": chunk["start"], "end": chunk["end"]}
		analysis := chunk["analysis"].(map[string]any)
		for _, field := range []string{"method", "tempo_bpm", "beat_onset_support", "silent"} {
			if value, exists := analysis[field]; exists {
				summary[field] = value
			}
		}
		chunkReferences = append(chunkReferences, summary)
	}
	result := map[string]any{"kind": op.Action, "start": interval.Start, "end": interval.End, "chunks": chunkReferences, "review_required": true, "request_digest": requestDigest, "source_take_id": op.TakeID}
	for _, field := range []string{"cuts", "beat_times", "sections", "points"} {
		values := []any{}
		for _, value := range chunks {
			chunk := value.(map[string]any)["analysis"].(map[string]any)
			if items, ok := chunk[field].([]any); ok {
				values = append(values, items...)
			}
		}
		if len(values) > 0 {
			result[field] = values
		}
	}
	required := map[string][]string{"scene_detect": {"cuts"}, "audio_structure": {"beat_times", "sections"}, "subject_track": {"points"}}
	for _, field := range required[op.Action] {
		if _, exists := result[field]; !exists {
			result[field] = []any{}
		}
	}
	limitations := []string{"Measured cut, beat and tracking candidates require human review before applying an edit.", "Chunk boundaries are processing boundaries, not guaranteed musical or narrative sections."}
	if op.Action == "subject_track" {
		result["coordinate_space"] = "normalized_display"
		aspect := interval.TargetAspect
		if aspect == 0 {
			aspect = 9.0 / 16
		}
		result["target_aspect"] = aspect
		result["anchor_time"] = interval.Start
		if interval.AnchorTime != nil {
			result["anchor_time"] = *interval.AnchorTime
		}
		limitations = append(limitations, "Tracking is translation-only, sampled at up to 8 Hz; low-texture subjects, scale changes and occlusions need manual correction.")
	}
	record, err := SaveStudioAnalysisResult(job.UserID, project, recordID, media.MediaID, result, limitations)
	if err != nil {
		return err
	}
	return finish(record)
}
