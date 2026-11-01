package app

import (
	"encoding/json"
	"fmt"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
)

// Keep the stored report bytes: re-encoding an older report with today's DTO
// adds fields and cannot reproduce the preview the user actually confirmed.
func legacyNativeReceiptPreview(userID, projectID string, receipt *model.ProductionImport, cut *model.ProjectCut, req LegacyNativeRequest) (LegacyNativePreview, error) {
	var result LegacyNativePreview
	var metadata struct {
		ConverterVersion  int             `json:"converterVersion"`
		SourceImportID    string          `json:"sourceImportId"`
		SourceFingerprint string          `json:"sourceFingerprint"`
		Report            json.RawMessage `json:"report"`
	}
	if cut == nil || receipt == nil || cut.UserID != userID || cut.ProjectID != projectID || receipt.UserID != userID || receipt.ProjectID != projectID || json.Unmarshal([]byte(cut.MetadataJSON), &metadata) != nil || metadata.ConverterVersion < 2 || metadata.ConverterVersion > production.LegacyNativeProjectionVersion || metadata.SourceImportID != receipt.ID || metadata.SourceFingerprint != receipt.SourceFingerprint || cut.SourceImportID != receipt.ID || cut.SourceKey != fmt.Sprintf("studio-native-v%d", metadata.ConverterVersion) || len(metadata.Report) == 0 {
		return result, cutConflict("原转换记录无法核对，请保留已有剪辑并检查备份")
	}
	if json.Unmarshal(metadata.Report, &result.Report) != nil {
		return result, cutConflict("原转换报告无法读取，请检查备份")
	}
	result.ImportID, result.ConverterVersion, result.ProjectRevision, result.TimelineRevision, result.CutID, result.TimelineSHA256 = receipt.ID, metadata.ConverterVersion, req.ExpectedProjectRevision, req.ExpectedTimelineRevision, cut.ID, cut.TimelineSHA256
	frozen := struct {
		ImportID         string          `json:"importId"`
		ConverterVersion int             `json:"converterVersion"`
		ProjectRevision  int64           `json:"projectRevision"`
		TimelineRevision int64           `json:"timelineRevision"`
		CutID            string          `json:"cutId"`
		TimelineSHA256   string          `json:"timelineSha256"`
		Report           json.RawMessage `json:"report"`
		PreviewToken     string          `json:"previewToken"`
	}{result.ImportID, result.ConverterVersion, result.ProjectRevision, result.TimelineRevision, result.CutID, result.TimelineSHA256, metadata.Report, ""}
	result.PreviewToken = cutSignature(struct {
		UserID    string
		ProjectID string
		Source    string
		Plan      any
	}{userID, projectID, receipt.SourceFingerprint, frozen})
	return result, nil
}
