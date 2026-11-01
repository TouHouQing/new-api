package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"testing"

	"gorm.io/gorm"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
)

func TestLegacyNativeUpgradeActualMediaAndHistoryAtomicity(t *testing.T) {
	s, db := legacyImportService(t)
	verifyLegacyNativeUpgrade(t, s, db)
}
func TestLegacyNativeUpgradePostgresActualMediaAndHistoryAtomicity(t *testing.T) {
	base, db := newProjectNameConflictPostgresService(t)
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	connection, _ := db.DB()
	t.Cleanup(func() { connection.Close() })
	s := New(base.repo, t.TempDir())
	t.Cleanup(func() { s.Close() })
	for _, id := range []string{"owner", "other"} {
		if err := db.Create(&model.User{ID: id, Username: id, Email: id + "@example.invalid", Role: model.UserRoleUser, Status: model.UserStatusActive}).Error; err != nil {
			t.Fatal(err)
		}
	}
	verifyLegacyNativeUpgrade(t, s, db)
}
func verifyLegacyNativeUpgrade(t *testing.T, s *Service, db *gorm.DB) {
	t.Helper()
	path := os.Getenv("CANVAS_TEST_LEGACY_NATIVE_ARCHIVE")
	if path == "" {
		t.Skip("explicit real-media legacy calibration archive required")
	}
	archive, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	inspection, err := s.InspectLegacyProject("owner", bytes.NewReader(archive), int64(len(archive)))
	if err != nil || !inspection.ReadyForMigration {
		t.Fatal("actual archive inspection", err)
	}
	first, err := s.ImportLegacyProject(context.Background(), "owner", bytes.NewReader(archive), int64(len(archive)), inspection.SourceFingerprint, "原始工程")
	if err != nil {
		t.Fatal("native new import", err)
	}
	if first.Receipt.ContractVersion != production.LegacyNativeProjectionVersion || first.Report.Transcripts != 1 || first.Report.TranscriptVersions != 2 || first.Report.TimelineClips < 6 {
		t.Fatal("new imports lack editable native content", first.Report)
	}
	status, err := s.GetLegacyNativeStatus("owner", first.Receipt.ProjectID)
	if err != nil || status.Cut == nil {
		t.Fatal("new import cut not atomically created", err)
	}
	// Explicit predecessor fixture: remove ONLY this disposable test project's
	// new supplementary rows and restore a v2 receipt. Real browser acceptance
	// separately upgrades projects created by the actual deployed v2 importer.
	pid := first.Receipt.ProjectID
	if err := db.Where("project_id = ?", pid).Delete(&model.ProjectCut{}).Error; err != nil {
		t.Fatal(err)
	}
	ids := db.Model(&model.ProjectTranscript{}).Select("id").Where("project_id = ?", pid)
	if err := db.Where("transcript_id IN (?)", ids).Delete(&model.ProjectTranscriptRevision{}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Where("project_id = ?", pid).Delete(&model.ProjectTranscript{}).Error; err != nil {
		t.Fatal(err)
	}
	var mapping map[string]map[string]string
	json.Unmarshal([]byte(first.Receipt.IdentityMapJSON), &mapping)
	delete(mapping, "clips")
	delete(mapping, "transcripts")
	delete(mapping, "transcriptVersions")
	oldMap, _ := json.Marshal(mapping)
	oldReport := first.Report
	oldReport.Transcripts = 0
	oldReport.TranscriptVersions = 0
	oldReport.TimelineClips = 0
	oldReport.NativeFields = nil
	oldReport.PreservedOnly = []string{"production", "captionsText", "soundtrackMediaId", "voiceoverMediaId", "shots.shotVoiceoverMediaId"}
	encodedReport, _ := json.Marshal(oldReport)
	if err := db.Model(&model.ProductionImport{}).Where("id = ?", first.Receipt.ID).Updates(map[string]any{"contract_version": 2, "identity_map_json": string(oldMap), "report_json": string(encodedReport)}).Error; err != nil {
		t.Fatal(err)
	}
	beforeReceipt, err := s.repo.ProductionImportForProject("owner", pid)
	if err != nil {
		t.Fatal(err)
	}
	receiptBefore, _ := json.Marshal(beforeReceipt)
	working, err := s.GetProjectTimeline("owner", pid)
	if err != nil {
		t.Fatal(err)
	}
	var body map[string]any
	json.Unmarshal(working.Timeline, &body)
	body["clips"].([]any)[0].(map[string]any)["title"] = "用户已经修改的剪辑"
	edited, _ := json.Marshal(body)
	working, err = s.SaveProjectTimeline("owner", pid, SaveProjectTimelineRequest{ExpectedRevision: working.Revision, Timeline: edited})
	if err != nil {
		t.Fatal(err)
	}
	project, err := s.repo.ProjectForUser("owner", pid)
	if err != nil {
		t.Fatal(err)
	}
	req := LegacyNativeRequest{ExpectedProjectRevision: project.Revision, ExpectedTimelineRevision: working.Revision}
	if _, err := s.PreviewLegacyNative(context.Background(), "other", pid, req); err == nil {
		t.Fatal("foreign conversion preview accepted")
	}
	plan, err := s.PreviewLegacyNative(context.Background(), "owner", pid, req)
	if err != nil || plan.Report.Transcripts != 1 || plan.Report.TranscriptVersions != 2 {
		t.Fatal("old content not converted", err, plan)
	}
	if _, err := s.ApplyLegacyNative(context.Background(), "owner", pid, req); err == nil {
		t.Fatal("conversion applied without explicit preview token")
	}
	req.PreviewToken = plan.PreviewToken
	callback := "legacy-native-version-failure"
	db.Callback().Create().Before("gorm:create").Register(callback, func(tx *gorm.DB) {
		switch tx.Statement.Dest.(type) {
		case *model.ProjectTranscriptRevision, *[]model.ProjectTranscriptRevision, []model.ProjectTranscriptRevision:
			tx.AddError(errors.New("intentional transcript revision write failure"))
		}
	})
	_, failure := s.ApplyLegacyNative(context.Background(), "owner", pid, req)
	db.Callback().Create().Remove(callback)
	if failure == nil {
		t.Fatal("injected transcript failure was not observed")
	}
	status, err = s.GetLegacyNativeStatus("owner", pid)
	if err != nil || status.Cut != nil {
		t.Fatal("partial conversion cut survived rollback", err)
	}
	var count int64
	db.Model(&model.ProjectTranscript{}).Where("project_id = ?", pid).Count(&count)
	if count != 0 {
		t.Fatal("partial transcript survived rollback")
	}
	view, err := s.ApplyLegacyNative(context.Background(), "owner", pid, req)
	if err != nil || view.Replayed {
		t.Fatal("conversion apply", err, view)
	}
	current, _ := s.GetProjectTimeline("owner", pid)
	if current.Revision != working.Revision || string(current.Timeline) != string(working.Timeline) {
		t.Fatal("conversion overwrote existing working cut")
	}
	afterReceipt, _ := s.repo.ProductionImportForProject("owner", pid)
	receiptAfter, _ := json.Marshal(afterReceipt)
	if !bytes.Equal(receiptBefore, receiptAfter) {
		t.Fatal("original immutable migration receipt changed")
	}
	page, err := s.ListProjectTranscripts("owner", pid, "", "", false, 20)
	if err != nil || len(page.Transcripts) != 1 {
		t.Fatal("converted transcript not available in native editor", err)
	}
	transcript, err := s.GetProjectTranscript("owner", pid, page.Transcripts[0].ID)
	if err != nil || transcript.Transcript.Revision != 2 || transcript.Document.Segments[0].Speaker != "旁白甲" || !transcript.Document.WordTextNeedsReview {
		t.Fatal("legacy corrections not preserved", err, transcript)
	}
	history, err := s.ProjectTranscriptHistory("owner", pid, transcript.Transcript.ID, 0, 20)
	if err != nil || len(history.Versions) != 2 {
		t.Fatal("original transcript history missing", err)
	}
	original, err := s.GetProjectTranscriptVersion("owner", pid, transcript.Transcript.ID, history.Versions[1].ID)
	if err != nil || original.Document.WordTextNeedsReview || original.Document.Segments[0].Text == transcript.Document.Segments[0].Text {
		t.Fatal("initial recognition overwritten", err)
	}
	text := "转换后继续校正"
	revision := transcript.Transcript.Revision
	corrected, err := s.UpdateProjectTranscript("owner", pid, transcript.Transcript.ID, ProjectTranscriptWriteRequest{ExpectedRevision: &revision, Changes: []production.TranscriptCorrection{{ID: transcript.Document.Segments[0].ID, Text: &text}}})
	if err != nil || corrected.Transcript.Revision != 3 {
		t.Fatal("converted transcript is not editable", err)
	}
	replay, err := s.ApplyLegacyNative(context.Background(), "owner", pid, req)
	if err != nil || !replay.Replayed || replay.Cut.ID != view.Cut.ID {
		t.Fatal("unknown conversion reply not recovered", err)
	}
	reloaded, _ := s.GetProjectTranscript("owner", pid, transcript.Transcript.ID)
	if reloaded.Transcript.Revision != 3 || reloaded.Document.Segments[0].Text != text {
		t.Fatal("conversion replay overwrote later corrections")
	}
	metadata := string(view.Metadata)
	if !strings.Contains(metadata, strings.Repeat("1", 64)) || !strings.Contains(metadata, strings.Repeat("2", 64)) {
		t.Fatal("exact legacy-to-native analysis identities lost")
	}
	db.Model(&model.Task{}).Where("project_id = ?", pid).Count(&count)
	if count != 0 {
		t.Fatal("import or replay created a model task")
	}
}
