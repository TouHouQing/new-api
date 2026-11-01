package app

import (
	"bytes"
	"encoding/json"
	"strconv"
	"strings"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
)

// Existing v3 cuts can have only a broad archived-production notice. Resolve
// actual missing effects from their immutable source without rewriting history.
func (s *Service) legacyNativeDeliveryBlockers(cut *model.ProjectCut) []string {
	if !strings.HasPrefix(cut.SourceKey, "studio-native-v") {
		return nil
	}
	failed := func(reason string) []string { return []string{"production." + reason} }
	version, parseError := strconv.Atoi(strings.TrimPrefix(cut.SourceKey, "studio-native-v"))
	if parseError != nil || version < 2 || version > production.LegacyNativeProjectionVersion || cut.SourceKey != "studio-native-v"+strconv.Itoa(version) {
		return failed("converter-mismatch")
	}
	receipt, err := s.repo.ProductionImportForProject(cut.UserID, cut.ProjectID)
	if err != nil || receipt.ID != cut.SourceImportID {
		return failed("source-unavailable")
	}
	var metadata struct {
		ConverterVersion  int    `json:"converterVersion"`
		SourceFingerprint string `json:"sourceFingerprint"`
		Report            struct {
			PreservedOnly []string `json:"preservedOnly"`
		} `json:"report"`
	}
	if json.Unmarshal([]byte(cut.MetadataJSON), &metadata) != nil || metadata.SourceFingerprint != receipt.SourceFingerprint {
		return failed("source-unreadable")
	}
	if metadata.ConverterVersion != version {
		return failed("converter-mismatch")
	}
	var document map[string]any
	decoder := json.NewDecoder(bytes.NewBufferString(receipt.SourceDocumentJSON))
	decoder.UseNumber()
	if decoder.Decode(&document) != nil {
		return failed("source-unreadable")
	}
	return production.LegacyNativeDeliveryFields(document, metadata.ConverterVersion, metadata.Report.PreservedOnly)
}
