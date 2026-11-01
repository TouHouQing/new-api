// SPDX-License-Identifier: AGPL-3.0-or-later
package production

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

// v10 adds an editable director scene without replacing the working canvas.
// Older immutable receipts remain readable and keep their original identities.
const LegacyNativeProjectionVersion = 11

func LegacyNativeRequestID(importID string) string {
	return fmt.Sprintf("legacy-native-v%d:%s", LegacyNativeProjectionVersion, importID)
}

// EnrichLegacyImport also runs for existing imports, against their original
// identity map. It builds one separate native cut and transcript histories;
// the caller decides whether this becomes the initial working timeline.
func EnrichLegacyImport(rows *repository.ProductionImportRows, report LegacyProjectionReport, document map[string]any, resources map[string]model.Resource, identities map[string]map[string]string, data LegacyProjectionData, now time.Time) (LegacyProjectionReport, error) {
	timeline, err := ProjectLegacyTimeline(document, resources, identities, rows.Receipt.ID, data.Preflight)
	if err != nil {
		return report, err
	}
	transcripts, err := ProjectLegacyTranscripts(document, resources, data, rows.Project.UserID, rows.Project.ID, rows.Receipt.ID, now)
	if err != nil {
		return report, err
	}
	analyses, err := ProjectLegacyMediaAnalyses(document, resources, data, rows.Project.UserID, rows.Project.ID, rows.Receipt.ID, now)
	if err != nil {
		return report, err
	}
	timeline, err = ProjectLegacyReframes(document, timeline, analyses, data)
	if err != nil {
		return report, err
	}
	rows.Transcripts = transcripts.Transcripts
	rows.TranscriptRevisions = transcripts.Versions
	rows.MediaAnalyses = analyses.Analyses
	rows.MediaAnalysisRevisions = analyses.Versions
	identities["clips"] = timeline.ClipIDs
	identities["transcripts"] = transcripts.TranscriptIDs
	identities["transcriptVersions"] = transcripts.VersionIDs
	identities["mediaAnalyses"] = analyses.AnalysisIDs
	identities["mediaAnalysisVersions"] = analyses.VersionIDs
	report.Transcripts = len(transcripts.Transcripts)
	report.TranscriptVersions = len(transcripts.Versions)
	report.MediaAnalyses = len(analyses.Analyses)
	report.AnalysisVersions = len(analyses.Versions)
	var body struct {
		Clips []json.RawMessage `json:"clips"`
	}
	if err := json.Unmarshal(timeline.Timeline, &body); err != nil {
		return report, err
	}
	report.TimelineClips = len(body.Clips)
	report.Takes = 0
	for _, value := range listValue(document["nodes"]) {
		report.Takes += len(listValue(objectValue(objectValue(value)["data"])["takes"]))
	}
	report.NativeFields = []string{"timeline", "clip-source-versions", "playback-rate", "clip-fades", "audio", "subtitles"}
	report.AudioLinks = 0
	for _, raw := range body.Clips {
		var clip map[string]any
		if json.Unmarshal(raw, &clip) == nil && clip["audioLink"] != nil {
			report.AudioLinks++
		}
	}
	if report.AudioLinks > 0 {
		report.NativeFields = append(report.NativeFields, "occurrence-bound-audio")
	}
	if !containsLegacyMotionGap(timeline.PreservedOnly) && legacyVersionFieldHasContent(objectValue(document["production"])["motionGraphics"]) {
		report.NativeFields = append(report.NativeFields, "motion-graphics")
	}
	if len(transcripts.Transcripts) > 0 {
		report.NativeFields = append(report.NativeFields, "transcripts-and-corrections")
	}
	if len(analyses.Analyses) > 0 {
		report.NativeFields = append(report.NativeFields, "media-analyses-and-corrections")
	}
	if legacyVersionFieldHasContent(objectValue(document["production"])["reframes"]) && !containsLegacyReframeGap(timeline.PreservedOnly) {
		report.NativeFields = append(report.NativeFields, "source-bound-reframes")
	}
	remaining := []string{}
	for _, path := range report.PreservedOnly {
		switch path {
		case "soundtrackMediaId", "voiceoverMediaId", "shots.transition", "shots.shotCaptionText", "shots.shotVoiceoverMediaId", "audio.edit-anchor", "production.audioTracks.edit-anchor":
			continue
		case "production.reframes":
			if !containsLegacyReframeGap(timeline.PreservedOnly) {
				continue
			}
		case "captionsText":
			invalid := false
			for _, field := range timeline.PreservedOnly {
				if strings.HasPrefix(field, "captionsText.") {
					invalid = true
				}
			}
			if !invalid {
				continue
			}
		}
		remaining = appendUnique(remaining, path)
	}
	for _, fields := range [][]string{timeline.PreservedOnly, transcripts.PreservedOnly, analyses.PreservedOnly} {
		for _, path := range fields {
			remaining = appendUnique(remaining, path)
		}
	}
	report.PreservedOnly = remaining
	planningFields := []string{}
	if data.PreviousPlanning != nil && rows.Unit.ID == "" {
		previous := data.PreviousPlanning
		report.PlanningReused = true
		report.PlanningRecordID, report.RecoveredUnitID, report.PlanningShots = previous.PlanningRecordID, previous.RecoveredUnitID, previous.PlanningShots
		for _, field := range previous.NativeFields {
			if field == "project-creative-brief" || field == "project-description" || field == "shot-narrative" || field == "fixed-shot-reference-states" {
				planningFields = append(planningFields, field)
			}
		}
	} else {
		planningFields, err = projectLegacyPlanning(rows, document, resources, identities)
		if err != nil {
			return report, err
		}
	}
	report.NativeFields = append(report.NativeFields, planningFields...)
	if rows.Planning != nil {
		report.PlanningRecordID = rows.Planning.Record.ID
		report.PlanningShots = rows.Planning.Record.ShotCount
		if rows.Planning.Unit != nil {
			report.RecoveredUnitID = rows.Planning.Unit.ID
		}
	}
	if err := projectLegacyPrevis(rows, &report, document, resources, identities, data); err != nil {
		return report, err
	}
	for _, warnings := range [][]string{timeline.Warnings, transcripts.Warnings, analyses.Warnings} {
		for _, warning := range warnings {
			report.Warnings = appendUnique(report.Warnings, warning)
		}
	}
	metadata, err := json.Marshal(map[string]any{"converterVersion": LegacyNativeProjectionVersion, "sourceImportId": rows.Receipt.ID, "sourceFingerprint": rows.Receipt.SourceFingerprint, "report": report, "identityMap": identities})
	if err != nil {
		return report, err
	}
	title := "导入的剪辑"
	if rows.Receipt.ContractVersion < LegacyNativeProjectionVersion {
		title = "旧工程转换剪辑（保留工作剪辑）"
	}
	version := fmt.Sprintf("v%d", LegacyNativeProjectionVersion)
	requestID := LegacyNativeRequestID(rows.Receipt.ID)
	cut := model.ProjectCut{ID: legacyNativeID("legacy-native-cut-"+version, rows.Receipt.ID), UserID: rows.Project.UserID, ProjectID: rows.Project.ID, RequestID: requestID, RequestSHA256: fmt.Sprintf("%x", sha256.Sum256([]byte(rows.Receipt.SourceDocumentJSON+":native-"+version))), Title: title, Kind: "master", AspectRatio: rows.Project.AspectRatio, SourceImportID: rows.Receipt.ID, SourceKey: "studio-native-" + version, TimelineSHA256: fmt.Sprintf("%x", sha256.Sum256(timeline.Timeline)), PayloadJSON: string(timeline.Timeline), MetadataJSON: string(metadata), CreatedAt: now}
	rows.Cut = &cut
	if rows.Timeline != nil {
		rows.Timeline.PayloadJSON = string(timeline.Timeline)
		rows.Timeline.OriginCutID = cut.ID
		cut.TimelineRevision = rows.Timeline.Revision
	}
	return report, nil
}
