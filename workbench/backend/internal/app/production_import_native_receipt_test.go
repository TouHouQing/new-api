package app

import (
	"encoding/json"
	"testing"
	"yingce/backend/internal/model"
)

func TestLegacyNativeReceiptPreviewUsesFrozenReportAndOwner(t *testing.T) {
	receipt := &model.ProductionImport{ID: "import", UserID: "owner", ProjectID: "project", SourceFingerprint: "fingerprint"}
	cut := &model.ProjectCut{ID: "cut-eight", UserID: "owner", ProjectID: "project", SourceImportID: "import", SourceKey: "studio-native-v8", TimelineSHA256: "timeline", MetadataJSON: `{"converterVersion":8,"sourceImportId":"import","sourceFingerprint":"fingerprint","report":{"nodes":1,"retiredField":{"wasConfirmed":true}}}`}
	req := LegacyNativeRequest{ExpectedProjectRevision: 3, ExpectedTimelineRevision: 4}
	preview, err := legacyNativeReceiptPreview("owner", "project", receipt, cut, req)
	if err != nil {
		t.Fatal(err)
	}
	frozen := json.RawMessage(`{"importId":"import","converterVersion":8,"projectRevision":3,"timelineRevision":4,"cutId":"cut-eight","timelineSha256":"timeline","report":{"nodes":1,"retiredField":{"wasConfirmed":true}},"previewToken":""}`)
	expected := cutSignature(struct {
		UserID    string
		ProjectID string
		Source    string
		Plan      json.RawMessage
	}{"owner", "project", "fingerprint", frozen})
	if preview.PreviewToken != expected {
		t.Fatal("new report fields changed the old confirmation")
	}
	for _, user := range []string{"other", ""} {
		if _, err := legacyNativeReceiptPreview(user, "project", receipt, cut, req); err == nil {
			t.Fatal("foreign receipt accepted")
		}
	}
	if _, err := legacyNativeReceiptPreview("owner", "other", receipt, cut, req); err == nil {
		t.Fatal("foreign project accepted")
	}
}
