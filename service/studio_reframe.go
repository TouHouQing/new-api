package service

import (
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

type StudioTrackingPoint struct {
	Time           float64          `json:"time"`
	Crop           StudioInspectROI `json:"crop"`
	Confidence     float64          `json:"confidence"`
	ReviewRequired bool             `json:"review_required"`
	Manual         bool             `json:"manual,omitempty"`
}
type StudioTracking struct {
	Kind         string                `json:"kind"`
	TargetAspect float64               `json:"target_aspect"`
	Points       []StudioTrackingPoint `json:"points"`
}

func studioReadTracking(actorID int, projectID, analysisID, mediaID, digest string) (*StudioTracking, error) {
	record, data, err := ReadStudioAnalysisResult(actorID, analysisID)
	if err != nil {
		return nil, err
	}
	if record.ProjectID != projectID || data["source_media_id"] != mediaID || data["source_digest"] != digest {
		return nil, errors.New("tracking source differs from the exact clip")
	}
	raw, _ := common.Marshal(data["analysis"])
	var track StudioTracking
	if common.Unmarshal(raw, &track) != nil || track.Kind != "subject_track" || len(track.Points) < 2 || len(track.Points) > 20000 {
		return nil, errors.New("choose a valid subject trajectory")
	}
	previous := -1.0
	for _, point := range track.Points {
		if !studioFiniteNumber(point.Time) || point.Time <= previous || point.Time < 0 || point.Time > 3600 || point.ReviewRequired || !studioFiniteNumber(point.Confidence) || point.Confidence < .45 && !point.Manual || !studioValidCrop(point.Crop) {
			return nil, errors.New("the trajectory contains unreviewed, occluded or lost-subject frames; correct it before applying")
		}
		previous = point.Time
	}
	return &track, nil
}
func studioFiniteNumber(value float64) bool { return !math.IsNaN(value) && !math.IsInf(value, 0) }
func studioValidCrop(crop StudioInspectROI) bool {
	return studioFiniteNumber(crop.X) && studioFiniteNumber(crop.Y) && studioFiniteNumber(crop.Width) && studioFiniteNumber(crop.Height) && crop.X >= 0 && crop.Y >= 0 && crop.Width > 0 && crop.Height > 0 && crop.X+crop.Width <= 1.00001 && crop.Y+crop.Height <= 1.00001
}

type StudioTrackingCorrection struct {
	RequestID string `json:"request_id"`
	Confirmed bool   `json:"confirmed"`
	Keys      []struct {
		Time float64 `json:"time"`
		X    float64 `json:"x"`
		Y    float64 `json:"y"`
	} `json:"keys"`
}

func CorrectStudioTracking(actorID int, projectID, analysisID string, request StudioTrackingCorrection) (*model.StudioProductionRecord, error) {
	project, _, err := model.StudioProjectAccess(model.DB, actorID, projectID, true)
	if err != nil {
		return nil, err
	}
	if !StudioIDPattern.MatchString(request.RequestID) || !request.Confirmed || len(request.Keys) < 2 || len(request.Keys) > 100 {
		return nil, errors.New("confirm two to one hundred manual source-time crop keys")
	}
	record, data, err := ReadStudioAnalysisResult(actorID, analysisID)
	if err != nil {
		return nil, err
	}
	if record.ProjectID != project.ID {
		return nil, model.ErrStudioAccess
	}
	analysis, _ := data["analysis"].(map[string]any)
	if analysis["kind"] != "subject_track" {
		return nil, errors.New("choose an actual subject trajectory")
	}
	points := studioObjects(analysis, "points")
	if len(points) < 2 {
		return nil, errors.New("the trajectory has no editable interval")
	}
	first, last := studioDocumentNumber(points[0]["time"], -1), studioDocumentNumber(points[len(points)-1]["time"], -1)
	crop, _ := points[0]["crop"].(map[string]any)
	width, height := studioDocumentNumber(crop["width"], 0), studioDocumentNumber(crop["height"], 0)
	previous := -1.0
	for _, key := range request.Keys {
		if !studioFiniteNumber(key.Time) || key.Time <= previous || key.Time < first || key.Time > last || !studioValidCrop(StudioInspectROI{X: key.X, Y: key.Y, Width: width, Height: height}) {
			return nil, errors.New("manual keys must be ordered, inside the actual source interval and within image bounds")
		}
		previous = key.Time
	}
	for _, point := range points {
		time := studioDocumentNumber(point["time"], -1)
		if time < request.Keys[0].Time || time > request.Keys[len(request.Keys)-1].Time {
			continue
		}
		for index := 1; index < len(request.Keys); index++ {
			a, b := request.Keys[index-1], request.Keys[index]
			if time < a.Time || time > b.Time {
				continue
			}
			weight := (time - a.Time) / (b.Time - a.Time)
			point["crop"] = map[string]any{"x": a.X + (b.X-a.X)*weight, "y": a.Y + (b.Y-a.Y)*weight, "width": width, "height": height}
			// Preserve algorithm confidence; manual approval has separate provenance.
			point["manual"], point["review_required"], point["reason"] = true, false, "human_crop_keyframes"
			break
		}
	}
	analysis["manual_correction"] = map[string]any{"parent_analysis_id": analysisID, "actor_id": actorID, "keys": request.Keys}
	mediaID, _ := data["source_media_id"].(string)
	media, err := GetStudioMedia(project.OwnerID, mediaID)
	if err != nil || media.Digest != data["source_digest"] {
		return nil, errors.New("tracking source is unavailable or changed")
	}
	return SaveStudioAnalysisResult(actorID, project, request.RequestID, mediaID, analysis, []string{"Human crop keys replace trajectory positions only within their interval; algorithm confidence is retained. Review the actual portrait framing before applying."})
}

// Same linear source-time sampler as studio-tracking.ts. No interpolation is
// allowed across a lost subject or an unreviewed scene boundary.
func studioSampleTracking(points []StudioTrackingPoint, seconds float64) StudioInspectROI {
	if seconds <= points[0].Time {
		return points[0].Crop
	}
	for index := 1; index < len(points); index++ {
		a, b := points[index-1], points[index]
		if seconds > b.Time {
			continue
		}
		weight := (seconds - a.Time) / (b.Time - a.Time)
		return StudioInspectROI{X: a.Crop.X + (b.Crop.X-a.Crop.X)*weight, Y: a.Crop.Y + (b.Crop.Y-a.Crop.Y)*weight, Width: a.Crop.Width + (b.Crop.Width-a.Crop.Width)*weight, Height: a.Crop.Height + (b.Crop.Height-a.Crop.Height)*weight}
	}
	return points[len(points)-1].Crop
}

func studioCompileReframe(actorID int, project *model.StudioProject, document map[string]any, clips []map[string]any, durations map[string]float64, request StudioEditRequest) (map[string]any, []StudioSourceRange, error) {
	if !StudioIDPattern.MatchString(request.AnalysisID) || !request.ReviewConfirmed || request.Width < 64 || request.Width > 4096 || request.Height < 64 || request.Height > 4096 || request.Width%2 != 0 || request.Height%2 != 0 {
		return nil, nil, errors.New("review the trajectory and choose an even output size between 64 and 4096")
	}
	var clip map[string]any
	total := 0.0
	for _, item := range clips {
		if item["id"] == request.ClipID {
			clip = item
		}
		total += (studioDocumentNumber(item["trimEnd"], durations[fmt.Sprint(item["id"])]) - studioDocumentNumber(item["trimStart"], 0)) / studioDocumentNumber(item["speed"], 1)
	}
	if clip == nil {
		return nil, nil, errors.New("choose the exact timeline clip")
	}
	media, _, err := studioClipSource(project.OwnerID, document, clip)
	if err != nil {
		return nil, nil, err
	}
	track, err := studioReadTracking(actorID, project.ID, request.AnalysisID, media.MediaID, media.Digest)
	if err != nil {
		return nil, nil, err
	}
	start, end := studioDocumentNumber(clip["trimStart"], 0), studioDocumentNumber(clip["trimEnd"], durations[request.ClipID])
	if track.Points[0].Time > start+.04 || track.Points[len(track.Points)-1].Time < end-.2 || math.Abs(track.TargetAspect-float64(request.Width)/float64(request.Height)) > .005 {
		return nil, nil, errors.New("trajectory interval and aspect must cover this exact output clip")
	}
	production, _ := studioTimelineDocument(document)
	refs, _ := production["reframes"].(map[string]any)
	if refs == nil {
		refs = map[string]any{}
	}
	refs[request.ClipID] = map[string]any{"analysisId": request.AnalysisID, "sourceMediaId": media.MediaID, "sourceDigest": media.Digest, "width": request.Width, "height": request.Height}
	production["reframes"], production["documentVersion"], production["width"], production["height"], production["fit"] = refs, StudioDocumentVersion, request.Width, request.Height, "crop"
	production["timeline"], production["timelineEdited"] = clips, true
	return document, []StudioSourceRange{{0, total}}, nil
}

func studioTrackingRenderFilter(actorID int, project *model.StudioProject, document map[string]any, plan *StudioRenderPlan, clip StudioRenderClip, probe *StudioMediaProbe, workdir string, index int, duration float64) (string, error) {
	production, _ := document["production"].(map[string]any)
	refs, _ := production["reframes"].(map[string]any)
	ref, _ := refs[clip.ClipID].(map[string]any)
	if ref["analysisId"] != clip.TrackingID || ref["sourceMediaId"] != clip.MediaID {
		return "", errors.New("reframe was not applied to this exact timeline clip")
	}
	media, err := GetStudioMedia(project.OwnerID, clip.MediaID)
	if err != nil {
		return "", err
	}
	track, err := studioReadTracking(actorID, project.ID, clip.TrackingID, clip.MediaID, media.Digest)
	if err != nil {
		return "", err
	}
	if ref["sourceDigest"] != media.Digest || math.Abs(track.TargetAspect-float64(plan.Width)/float64(plan.Height)) > .005 {
		return "", errors.New("output aspect or tracking source changed; prepare a new reframe")
	}
	end := clip.Start + duration*clip.Speed
	if track.Points[0].Time > clip.Start+.04 || track.Points[len(track.Points)-1].Time < end-.2 {
		return "", errors.New("tracking does not cover the render interval")
	}
	aspect := float64(plan.Width) / float64(plan.Height)
	cw, ch := probe.Width, probe.Height
	if float64(cw)/float64(ch) > aspect {
		cw = int(float64(ch) * aspect)
	} else {
		ch = int(float64(cw) / aspect)
	}
	cw, ch = cw/2*2, ch/2*2
	var commands strings.Builder
	for frame := 0; float64(frame)/float64(plan.FPS) < duration; frame++ {
		time := float64(frame) / float64(plan.FPS)
		crop := studioSampleTracking(track.Points, clip.Start+time*clip.Speed)
		x := min(max(0, int(math.Round(crop.X*float64(probe.Width)))), probe.Width-cw)
		y := min(max(0, int(math.Round(crop.Y*float64(probe.Height)))), probe.Height-ch)
		fmt.Fprintf(&commands, "%.6f crop@tracked x %d, crop@tracked y %d;\n", time, x, y)
	}
	name := fmt.Sprintf("tracking-%03d.cmd", index)
	if err := os.WriteFile(filepath.Join(workdir, name), []byte(commands.String()), 0600); err != nil {
		return "", err
	}
	return fmt.Sprintf("setpts=(PTS-STARTPTS)/%g,fps=%d,sendcmd=f=%s,crop@tracked=%d:%d:0:0,scale=%d:%d,setsar=1,format=yuv420p", clip.Speed, plan.FPS, name, cw, ch, plan.Width, plan.Height), nil
}
