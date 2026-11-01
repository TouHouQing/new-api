package app

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"gorm.io/gorm"
	"io"
	"strings"
	"testing"
	"yingce/backend/internal/model"
	"yingce/backend/internal/production"
)

// Uses an explicitly synthetic4x4 PNG. This exercises native import, immutable
// sources and real SQL transactions; it makes no model-output-quality claim.
func legacyPlanningArchive(t *testing.T) []byte {
	t.Helper()
	original, media := legacyImportArchive(t)
	reader, err := zip.NewReader(bytes.NewReader(original), int64(len(original)))
	if err != nil {
		t.Fatal(err)
	}
	var manifest map[string]any
	for _, file := range reader.File {
		if file.Name == "project.json" {
			stream, _ := file.Open()
			raw, _ := io.ReadAll(stream)
			stream.Close()
			if json.Unmarshal(raw, &manifest) != nil {
				t.Fatal("fixture JSON")
			}
		}
	}
	project := manifest["project"].(map[string]any)
	project["id"] = "planning-calibration"
	node := project["nodes"].([]any)[0].(map[string]any)["data"].(map[string]any)
	node["assetIds"] = []any{"role"}
	project["assets"] = []any{map[string]any{"id": "role", "kind": "character", "title": "原人物", "prompt": "红外套", "mediaId": "old-media", "versions": []any{map[string]any{"id": "blue-version", "prompt": "蓝外套", "mediaId": "old-media"}}}}
	project["shots"] = []any{map[string]any{"id": "original-shot", "title": "开场", "imageNodeId": "image", "dialogue": "欢迎"}}
	project["production"] = map[string]any{"guide": map[string]any{"goal": "product"}, "creativeBrief": map[string]any{"subject": "外套", "audience": "新手", "benefit": "看清面料"}, "brief": "原制作说明 <b>保留原文</b>", "targetDuration": 6, "shotNarrative": map[string]any{"original-shot": map[string]any{"purpose": "opening", "information": "先看主体"}}, "continuityStates": []any{map[string]any{"shotId": "original-shot", "assetId": "role", "wardrobe": "红外套", "referenceMediaIds": []any{"old-media"}}}}
	manifest["assetMedia"] = []any{"media/0"}
	manifest["assetVersionMedia"] = []any{[]any{"media/0"}}
	var output bytes.Buffer
	writer := zip.NewWriter(&output)
	file, _ := writer.Create("project.json")
	if err := json.NewEncoder(file).Encode(manifest); err != nil {
		t.Fatal(err)
	}
	file, _ = writer.Create("media/0")
	file.Write(media)
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return output.Bytes()
}

func TestLegacyPlanningNativeImportAndIndependentUpgradeAreAtomic(t *testing.T) {
	planningBothDatabases(t, func(t *testing.T, s *Service, db *gorm.DB, _ model.Project, _ model.ProjectUnit) {
		archive := legacyPlanningArchive(t)
		inspection, err := s.InspectLegacyProject("user-1", bytes.NewReader(archive), int64(len(archive)))
		if err != nil || !inspection.ReadyForMigration {
			t.Fatal("inspect", err)
		}
		created, err := s.ImportLegacyProject(context.Background(), "user-1", bytes.NewReader(archive), int64(len(archive)), inspection.SourceFingerprint, "规划导入校准")
		if err != nil {
			t.Fatal("import", err)
		}
		pid := created.Receipt.ProjectID
		project, err := s.repo.ProjectForUser("user-1", pid)
		if err != nil || !strings.Contains(project.CreativeBriefJSON, "看清面料") || project.Description != "原制作说明 <b>保留原文</b>" {
			t.Fatal("initial brief not editable", err)
		}
		shots, err := s.repo.ProjectShots(pid)
		if err != nil || len(shots) != 1 {
			t.Fatal("initial shots", err)
		}
		original := shots[0]
		// The real predecessor accepted image-only shots with a blank script.
		if err := db.Model(&model.Shot{}).Where("id = ?", original.ID).Update("description", "").Error; err != nil {
			t.Fatal(err)
		}
		if err := db.Model(&model.ShotRevision{}).Where("id = ?", original.CurrentRevisionID).Update("plot_description", "").Error; err != nil {
			t.Fatal(err)
		}
		if err := db.Model(&model.ShotArtifact{}).Where("unit_id = ? AND type = ?", original.UnitID, "storyboard").Update("type", "image").Error; err != nil {
			t.Fatal(err)
		}
		if _, _, err := s.CreateShotRevision("user-1", pid, original.ID, ShotRevisionInput{ExpectedRevisionID: &original.CurrentRevisionID}); err == nil {
			t.Fatal("public script save accepted empty content")
		}
		if _, _, err := s.UpdateShotIntentions("user-1", pid, original.ID, UpdateShotIntentionsRequest{ExpectedRevisionID: original.CurrentRevisionID, Narrative: &model.ShotNarrative{Information: "用户的后续镜头修改"}}); err != nil {
			t.Fatal(err)
		}
		project, _ = s.repo.ProjectForUser("user-1", pid)
		userBrief := model.ProjectCreativeBrief{Version: 1, Goal: "story", KeyMessage: "用户的后续目标", Constraints: []string{}}
		userDescription := "用户的后续简介"
		if _, err := s.UpdateProject("user-1", pid, UpdateProjectRequest{ExpectedRevision: &project.Revision, CreativeBrief: &userBrief, Description: &userDescription}); err != nil {
			t.Fatal(err)
		}
		// Explicit predecessor fixture in this disposable DB: mimic a v7 receipt
		// without source-root mappings. Never use this operation on live data.
		var mapping map[string]map[string]string
		json.Unmarshal([]byte(created.Receipt.IdentityMapJSON), &mapping)
		delete(mapping, "assetRoots")
		delete(mapping, "nodeAssetVersions")
		encoded, _ := json.Marshal(mapping)
		if err := db.Model(&model.ProductionImport{}).Where("id = ?", created.Receipt.ID).Updates(map[string]any{"contract_version": 7, "identity_map_json": string(encoded)}).Error; err != nil {
			t.Fatal(err)
		}
		if err := db.Where("project_id = ? AND request_id = ?", pid, production.LegacyNativeRequestID(created.Receipt.ID)).Delete(&model.ProjectCut{}).Error; err != nil {
			t.Fatal(err)
		}
		receipt, _ := s.repo.ProductionImportForProject("user-1", pid)
		beforeReceipt, _ := json.Marshal(receipt)
		currentShots, _ := s.repo.ProjectShots(pid)
		beforeShots, _ := json.Marshal(currentShots)
		assets, _ := s.repo.ProjectAssetLinks(pid)
		beforeLinks, _ := json.Marshal(assets)
		working, err := s.GetProjectTimeline("user-1", pid)
		if err != nil {
			t.Fatal(err)
		}
		project, _ = s.repo.ProjectForUser("user-1", pid)
		req := LegacyNativeRequest{ExpectedProjectRevision: project.Revision, ExpectedTimelineRevision: working.Revision}
		preview, err := s.PreviewLegacyNative(context.Background(), "user-1", pid, req)
		if err != nil || preview.Report.RecoveredUnitID == "" {
			t.Fatal("preview", err)
		}
		req.PreviewToken = preview.PreviewToken
		if _, err := s.PreviewLegacyNative(context.Background(), "other", pid, req); err == nil {
			t.Fatal("foreign project read")
		}
		var unitsBefore int64
		db.Model(&model.ProjectUnit{}).Where("project_id = ?", pid).Count(&unitsBefore)
		name := "test-planning-atomicity"
		if err := db.Callback().Create().Before("gorm:create").Register(name, func(tx *gorm.DB) {
			if tx.Statement.Table == "project_shot_plan_records" {
				tx.AddError(errors.New("injected planning write failure"))
			}
		}); err != nil {
			t.Fatal(err)
		}
		_, failure := s.ApplyLegacyNative(context.Background(), "user-1", pid, req)
		db.Callback().Create().Remove(name)
		if failure == nil {
			t.Fatal("injected failure not returned")
		}
		var unitsAfter int64
		db.Model(&model.ProjectUnit{}).Where("project_id = ?", pid).Count(&unitsAfter)
		if unitsAfter != unitsBefore {
			t.Fatal("failed transaction leaked chapter")
		}
		view, err := s.ApplyLegacyNative(context.Background(), "user-1", pid, req)
		if err != nil || view.Replayed {
			t.Fatal("apply", err)
		}
		replay, err := s.ApplyLegacyNative(context.Background(), "user-1", pid, req)
		if err != nil || !replay.Replayed || replay.Cut.ID != view.Cut.ID {
			t.Fatal("canonical replay", err)
		}
		project, _ = s.repo.ProjectForUser("user-1", pid)
		if project.CreativeBriefJSON == "" || !strings.Contains(project.CreativeBriefJSON, "用户的后续目标") || project.Description != "用户的后续简介" {
			t.Fatal("user goal overwritten")
		}
		old, _ := s.repo.ProjectUnitShots(pid, original.UnitID)
		afterShots, _ := json.Marshal(old)
		if string(afterShots) != string(beforeShots) {
			t.Fatal("existing shots rewritten")
		}
		receipt, _ = s.repo.ProductionImportForProject("user-1", pid)
		afterReceipt, _ := json.Marshal(receipt)
		if string(afterReceipt) != string(beforeReceipt) {
			t.Fatal("original receipt rewritten")
		}
		links, _ := s.repo.ProjectAssetLinks(pid)
		afterLinks, _ := json.Marshal(links)
		if string(afterLinks) != string(beforeLinks) {
			t.Fatal("current assets rebound")
		}
		plan, err := s.ReadShotPlan("user-1", pid, preview.Report.PlanningRecordID)
		if err != nil || len(plan.Revisions) != 1 || !strings.Contains(plan.Revisions[0].NarrativeJSON, "先看主体") || !strings.Contains(plan.Revisions[0].ReferenceStatesJSON, "红外套") || !strings.Contains(plan.Snapshot.ProjectBriefJSON, "看清面料") {
			t.Fatal("recovered planning incomplete", err)
		}
		unit, err := s.repo.ProjectUnit(pid, preview.Report.RecoveredUnitID)
		var hiddenImages int64
		if err := db.Model(&model.ShotArtifact{}).Where("project_id = ? AND unit_id = ? AND type = ?", pid, preview.Report.RecoveredUnitID, "image").Count(&hiddenImages).Error; err != nil || hiddenImages != 0 {
			t.Fatal("recovered image candidates use a hidden artifact type", err)
		}
		var visibleImages int64
		db.Model(&model.ShotArtifact{}).Where("project_id = ? AND unit_id = ? AND type = ?", pid, preview.Report.RecoveredUnitID, "storyboard").Count(&visibleImages)
		if visibleImages != 2 {
			t.Fatal("original image candidates missing", visibleImages)
		}
		if err != nil || !strings.Contains(unit.SourceText, "&lt;b&gt;") {
			t.Fatal("recovered text was not escaped", err)
		}
		current, err := s.GetProjectTimeline("user-1", pid)
		if err != nil || string(current.Timeline) != string(working.Timeline) || current.Revision != working.Revision {
			t.Fatal("current cut changed", err)
		}
		var tasks int64
		db.Model(&model.Task{}).Where("user_id = ?", "user-1").Count(&tasks)
		if tasks != 0 {
			t.Fatal("import invoked a model")
		}
		db.Model(&model.ProjectUnit{}).Where("project_id = ?", pid).Count(&unitsAfter)
		if unitsAfter != unitsBefore+1 {
			t.Fatal("upgrade duplicated chapter")
		}
	})
}
