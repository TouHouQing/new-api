package app

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

func TestLegacyNativeV5MissingFramingStillBlocksDelivery(t *testing.T) {
	s, db := legacyImportService(t)
	row := model.ProductionImport{ID: "delivery-import", UserID: "owner", ProjectID: "delivery-project", SourceFingerprint: strings.Repeat("a", 64), SourceDocumentJSON: `{"production":{"reframes":{"clip":{"analysisId":"old-track"}}}}`, CreatedAt: time.Now()}
	if err := db.Create(&row).Error; err != nil {
		t.Fatal(err)
	}
	metadata, _ := json.Marshal(map[string]any{"converterVersion": 5, "sourceFingerprint": row.SourceFingerprint, "report": map[string]any{"preservedOnly": []string{}}})
	cut := model.ProjectCut{UserID: "owner", ProjectID: row.ProjectID, SourceImportID: row.ID, SourceKey: "studio-native-v5", MetadataJSON: string(metadata)}
	fields := s.legacyNativeDeliveryBlockers(&cut)
	if len(fields) != 1 || fields[0] != "production.reframes" {
		t.Fatal("v5 bypassed original framing delivery guard", fields)
	}
	cut.SourceKey = "studio-native-v99"
	if fields = s.legacyNativeDeliveryBlockers(&cut); len(fields) != 1 || fields[0] != "production.converter-mismatch" {
		t.Fatal("unknown converter silently accepted", fields)
	}
}

func TestLegacyNativeProjectedReframeResolverChecksOwnershipAndSpecificVersion(t *testing.T) {
	// The resolver never needs a database: it only reads server-built pending
	// rows, and rejects a mismatched owner, project or version association.
	s := &Service{}
	rows := &repository.ProductionImportRows{MediaAnalyses: []model.ProjectMediaAnalysis{{ID: "analysis", UserID: "owner", ProjectID: "project", Kind: "subject_track"}}, MediaAnalysisRevisions: []model.ProjectMediaAnalysisRevision{{ID: "version", AnalysisID: "analysis", UserID: "owner"}}}
	for _, values := range [][3]string{{"foreign", "project", "version"}, {"owner", "other-project", "version"}, {"owner", "project", "other-version"}} {
		if _, err := s.projectedLegacyReframeResolver(values[0], values[1], rows)("analysis", values[2]); err == nil {
			t.Fatal("unowned or unrelated pending version accepted", values)
		}
	}
}
