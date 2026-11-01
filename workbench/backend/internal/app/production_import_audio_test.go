package app

import (
	"bytes"
	"context"
	"encoding/json"
	"gorm.io/gorm"
	"testing"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
)

// Explicit predecessor fixtures live only in disposable SQLite/PostgreSQL.
// Actual browser predecessor imports are separately created on the v8 runtime.
func TestLegacyNativeAudioUpgradeDoesNotRecreateConvertedPlanning(t *testing.T) {
	for _, originalVersion := range []int{7, 8} {
		planningBothDatabases(t, func(t *testing.T, s *Service, db *gorm.DB, _ model.Project, _ model.ProjectUnit) {
			archive := legacyPlanningArchive(t)
			inspection, err := s.InspectLegacyProject("user-1", bytes.NewReader(archive), int64(len(archive)))
			if err != nil {
				t.Fatal(err)
			}
			created, err := s.ImportLegacyProject(context.Background(), "user-1", bytes.NewReader(archive), int64(len(archive)), inspection.SourceFingerprint, "声音升级前的已编辑方案")
			if err != nil {
				t.Fatal(err)
			}
			pid := created.Receipt.ProjectID
			oldCut, err := s.repo.ProjectCutForRequest("user-1", pid, production.LegacyNativeRequestID(created.Receipt.ID))
			if err != nil {
				t.Fatal(err)
			}
			var metadata map[string]json.RawMessage
			if json.Unmarshal([]byte(oldCut.MetadataJSON), &metadata) != nil {
				t.Fatal("metadata")
			}
			metadata["converterVersion"] = json.RawMessage("8")
			encoded, _ := json.Marshal(metadata)
			if err := db.Model(&model.ProjectCut{}).Where("id = ?", oldCut.ID).Updates(map[string]any{"id": pid, "request_id": "legacy-native-v8:" + created.Receipt.ID, "source_key": "studio-native-v8", "metadata_json": string(encoded)}).Error; err != nil {
				t.Fatal(err)
			}
			if err := db.Model(&model.ProjectTimeline{}).Where("project_id = ?", pid).Update("origin_cut_id", pid).Error; err != nil {
				t.Fatal(err)
			}
			if err := db.Model(&model.ProductionImport{}).Where("id = ?", created.Receipt.ID).Update("contract_version", originalVersion).Error; err != nil {
				t.Fatal(err)
			}
			shots, err := s.repo.ProjectShots(pid)
			if err != nil || len(shots) != 1 {
				t.Fatal("shots", err)
			}
			if _, _, err := s.UpdateShotIntentions("user-1", pid, shots[0].ID, UpdateShotIntentionsRequest{ExpectedRevisionID: shots[0].CurrentRevisionID, Narrative: &model.ShotNarrative{Information: "声音升级前的人工作品修改"}}); err != nil {
				t.Fatal(err)
			}
			before, err := s.repo.ProjectShots(pid)
			if err != nil {
				t.Fatal(err)
			}
			beforeJSON, _ := json.Marshal(before)
			var unitCount, planCount int64
			db.Model(&model.ProjectUnit{}).Where("project_id = ?", pid).Count(&unitCount)
			db.Model(&model.ProjectShotPlanRecord{}).Where("project_id = ?", pid).Count(&planCount)
			receipt, _ := s.repo.ProductionImportForProject("user-1", pid)
			receiptJSON, _ := json.Marshal(receipt)
			working, err := s.GetProjectTimeline("user-1", pid)
			if err != nil {
				t.Fatal(err)
			}
			project, _ := s.repo.ProjectForUser("user-1", pid)
			req := LegacyNativeRequest{ExpectedProjectRevision: project.Revision, ExpectedTimelineRevision: working.Revision}
			preview, err := s.PreviewLegacyNative(context.Background(), "user-1", pid, req)
			if err != nil {
				t.Fatal(err)
			}
			if preview.Report.PlanningRecordID != created.Report.PlanningRecordID || preview.Report.RecoveredUnitID != "" {
				t.Fatal("existing plan was replaced or recovered twice", preview.Report)
			}
			req.PreviewToken = preview.PreviewToken
			view, err := s.ApplyLegacyNative(context.Background(), "user-1", pid, req)
			if err != nil || view.Replayed {
				t.Fatal("apply", err)
			}
			replay, err := s.ApplyLegacyNative(context.Background(), "user-1", pid, req)
			if err != nil || !replay.Replayed || replay.Cut.ID != view.Cut.ID {
				t.Fatal("replay", err)
			}
			oldPlan := LegacyNativePreview{ImportID: receipt.ID, ConverterVersion: 8, ProjectRevision: req.ExpectedProjectRevision, TimelineRevision: req.ExpectedTimelineRevision, CutID: pid, TimelineSHA256: oldCut.TimelineSHA256, Report: created.Report}
			oldRequest := req
			oldRequest.PreviewToken = cutSignature(struct {
				UserID    string
				ProjectID string
				Source    string
				Plan      LegacyNativePreview
			}{"user-1", pid, receipt.SourceFingerprint, oldPlan})
			oldReplay, err := s.ApplyLegacyNative(context.Background(), "user-1", pid, oldRequest)
			if err != nil || !oldReplay.Replayed || oldReplay.Cut.ID != pid {
				t.Fatal("older confirmed token returned newer cut", err, oldReplay.Cut.ID)
			}
			invalid := req
			invalid.PreviewToken = "wrong-version-token"
			if _, err := s.ApplyLegacyNative(context.Background(), "user-1", pid, invalid); err == nil {
				t.Fatal("unmatched token returned an unrelated receipt")
			}
			currentPreview, err := s.PreviewLegacyNative(context.Background(), "user-1", pid, LegacyNativeRequest{ExpectedProjectRevision: project.Revision, ExpectedTimelineRevision: working.Revision})
			if err != nil {
				t.Fatal(err)
			}
			currentRequest := req
			currentRequest.PreviewToken = currentPreview.PreviewToken
			if currentReplay, err := s.ApplyLegacyNative(context.Background(), "user-1", pid, currentRequest); err != nil || currentReplay.Cut.ID != view.Cut.ID {
				t.Fatal("current preview cannot recover existing cut", err)
			}
			var unitsAfter, plansAfter int64
			db.Model(&model.ProjectUnit{}).Where("project_id = ?", pid).Count(&unitsAfter)
			db.Model(&model.ProjectShotPlanRecord{}).Where("project_id = ?", pid).Count(&plansAfter)
			if unitsAfter != unitCount || plansAfter != planCount {
				t.Fatal("upgrade duplicated planning")
			}
			after, _ := s.repo.ProjectShots(pid)
			afterJSON, _ := json.Marshal(after)
			if !bytes.Equal(afterJSON, beforeJSON) {
				t.Fatal("human shot edits replaced")
			}
			restored, _ := s.repo.ProductionImportForProject("user-1", pid)
			afterReceipt, _ := json.Marshal(restored)
			if !bytes.Equal(afterReceipt, receiptJSON) {
				t.Fatal("original receipt rewritten")
			}
			current, _ := s.GetProjectTimeline("user-1", pid)
			if !bytes.Equal(current.Timeline, working.Timeline) || current.Revision != working.Revision {
				t.Fatal("working cut changed")
			}
			if originalVersion == 7 {
				if err := db.Model(&model.ProjectCut{}).Where("id = ?", view.Cut.ID).Delete(&model.ProjectCut{}).Error; err != nil {
					t.Fatal(err)
				}
				if err := db.Model(&model.ProjectCut{}).Where("id = ?", pid).Update("metadata_json", "{}").Error; err != nil {
					t.Fatal(err)
				}
				if _, err := s.PreviewLegacyNative(context.Background(), "user-1", pid, req); err == nil {
					t.Fatal("unverifiable predecessor silently recreated planning")
				}
			}
		})
	}
}
