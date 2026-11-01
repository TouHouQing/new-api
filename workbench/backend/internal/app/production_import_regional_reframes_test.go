package app

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"yingce/backend/internal/model"
)

func TestLegacyRegionalOldCutsRemainDiscoverableAndOnlyMissingCapabilitiesOfferUpgrade(t *testing.T) {
	s, db := legacyImportService(t)
	project := model.Project{ID: "regional-v2", UserID: "owner", Revision: 1, Status: model.ProjectStatusActive}
	if err := db.Create(&project).Error; err != nil {
		t.Fatal(err)
	}
	document := `{"production":{"episodes":[{"id":"episode","title":"第一集"}],"regionalVersions":[{"id":"plain","episodeId":"episode","title":"原版","timeline":[]},{"id":"motion","episodeId":"episode","title":"动效版","timeline":[],"motionGraphics":[{}]},{"id":"framed","episodeId":"episode","title":"跟随版","timeline":[],"reframes":{"one":{"analysisId":"old"}}},{"id":"sound","episodeId":"episode","title":"声音跟随版","timeline":[],"audioTracks":[{"anchorKind":"source"}]}]}}`
	receipt := model.ProductionImport{ID: "regional-v2-import", UserID: "owner", ProjectID: project.ID, SourceFingerprint: strings.Repeat("e", 64), SourceDocumentJSON: document}
	if err := db.Create(&receipt).Error; err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"plain", "motion", "framed", "sound"} {
		row := model.ProjectCut{ID: "v2-" + id, UserID: "owner", ProjectID: project.ID, RequestID: legacyVersionRequestIDFor(2, receipt.ID, id), SourceKey: "legacy-regional-v2:" + id, SourceImportID: receipt.ID, Kind: "locale", PayloadJSON: `{}`}
		if err := db.Create(&row).Error; err != nil {
			t.Fatal(err)
		}
	}
	page, err := s.ReadLegacyVersions("owner", project.ID, "", 0, 20)
	if err != nil || page.ConverterVersion != 4 || len(page.Versions) != 4 {
		t.Fatal(page, err)
	}
	for _, entry := range page.Versions {
		if entry.Cut == nil || entry.Cut.ID != "v2-"+entry.ID || entry.RequiresUpgrade != (entry.ID == "framed" || entry.ID == "sound") || entry.HasReframes != (entry.ID == "framed") || entry.HasAttachedAudio != (entry.ID == "sound") {
			t.Fatal("v2 history or upgrade hint incorrect", entry)
		}
	}
}

func TestLegacyRegionalFramingDeliveryGuardKeepsOldGapsAndRejectsUnknownConverter(t *testing.T) {
	s, db := legacyImportService(t)
	document := `{"production":{"regionalVersions":[{"id":"frame","reframes":{"one":{"analysisId":"old"}}}]}}`
	receipt := model.ProductionImport{ID: "regional-guard", UserID: "owner", ProjectID: "regional-guard-project", SourceDocumentJSON: document}
	if err := db.Create(&receipt).Error; err != nil {
		t.Fatal(err)
	}
	meta := map[string]any{"converter": "legacy-regional-v3", "sourceSha256": cutSignature(json.RawMessage(document)), "preservedOnly": []string{}}
	raw, _ := json.Marshal(meta)
	cut := model.ProjectCut{UserID: "owner", ProjectID: receipt.ProjectID, SourceImportID: receipt.ID, SourceKey: "legacy-regional-v3:frame", MetadataJSON: string(raw)}
	if fields := s.legacyRegionalDeliveryBlockers(&cut); len(fields) != 0 {
		t.Fatal("fully converted v3 blocked", fields)
	}
	cut.SourceKey = "legacy-regional-v2:frame"
	meta["converter"] = "legacy-regional-v2"
	raw, _ = json.Marshal(meta)
	cut.MetadataJSON = string(raw)
	if fields := s.legacyRegionalDeliveryBlockers(&cut); len(fields) != 1 || fields[0] != "regionalVersions.reframes" {
		t.Fatal("v2 cached report bypassed source", fields)
	}
	cut.SourceKey = "legacy-regional-v99:frame"
	if fields := s.legacyRegionalDeliveryBlockers(&cut); len(fields) != 1 || fields[0] != "regionalVersions.converter-mismatch" {
		t.Fatal("future converter silently accepted", fields)
	}
	cut.SourceKey = "legacy-regional-v3:frame"
	meta["converter"] = "legacy-regional-v3"
	meta["preservedOnly"] = []string{"regionalVersions.reframes.coordinates"}
	raw, _ = json.Marshal(meta)
	cut.MetadataJSON = string(raw)
	if fields := s.legacyRegionalDeliveryBlockers(&cut); len(fields) != 1 || fields[0] != "regionalVersions.reframes.coordinates" {
		t.Fatal("unresolved v3 gap erased", fields)
	}
}

func TestLegacyRegionalReframesRequireNativeAnalysisHistoryBeforeConversion(t *testing.T) {
	s, db := legacyImportService(t)
	project := model.Project{ID: "unconverted-framing", UserID: "owner", Revision: 1, Status: model.ProjectStatusActive}
	if err := db.Create(&project).Error; err != nil {
		t.Fatal(err)
	}
	receipt := model.ProductionImport{ID: "unconverted-framing-import", UserID: "owner", ProjectID: project.ID, SourceDocumentJSON: `{}`}
	if err := db.Create(&receipt).Error; err != nil {
		t.Fatal(err)
	}
	document := map[string]any{"production": map[string]any{"analysisRefs": []any{map[string]any{"id": "original-track", "kind": "subjects"}}, "regionalVersions": []any{map[string]any{"id": "framed", "reframes": map[string]any{"one": map[string]any{"analysisId": "original-track"}}}}}}
	_, err := s.legacyRegionalReframeContext("owner", project.ID, &receipt, document, map[string]model.Resource{}, "framed")
	var failure *AppError
	if !errors.As(err, &failure) || failure.Status != 409 || failure.Reason != "legacy_analysis_upgrade_required" {
		t.Fatal("missing history was not actionable", err)
	}
	var count int64
	if err := db.Model(&model.ProjectCut{}).Where("project_id = ?", project.ID).Count(&count).Error; err != nil || count != 0 {
		t.Fatal("dependency check wrote a partial regional cut", count, err)
	}
}
