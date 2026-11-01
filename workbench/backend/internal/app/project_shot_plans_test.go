package app

import (
	"encoding/json"
	"errors"
	"gorm.io/gorm"
	"testing"
	"time"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
)

func shotPlanningFixture(t *testing.T, postgres bool) (*Service, *gorm.DB, model.Project, model.ProjectUnit) {
	t.Helper()
	var s *Service
	var db *gorm.DB
	if postgres {
		base, connection := newProjectNameConflictPostgresService(t)
		db = connection
		if err := database.MigrateSchema(db); err != nil {
			t.Fatal(err)
		}
		sqlDB, _ := db.DB()
		t.Cleanup(func() { sqlDB.Close() })
		s = New(base.repo, t.TempDir())
		t.Cleanup(func() { s.Close() })
	} else {
		s, db = legacyImportService(t)
	}
	if err := db.Create(&model.User{ID: "user-1", Username: "planner", Email: "planner@example.invalid", Role: model.UserRoleUser, Status: model.UserStatusActive}).Error; err != nil {
		t.Fatal(err)
	}
	project, unit := seedWorkflowProject(t, db)
	return s, db, project, unit
}

func planningBothDatabases(t *testing.T, run func(*testing.T, *Service, *gorm.DB, model.Project, model.ProjectUnit)) {
	for _, postgres := range []bool{false, true} {
		t.Run(map[bool]string{false: "sqlite", true: "postgres"}[postgres], func(t *testing.T) {
			s, db, p, u := shotPlanningFixture(t, postgres)
			run(t, s, db, p, u)
		})
	}
}

func replacePlanningFixture(t *testing.T, s *Service, p, u string, title string) (model.ShotPlanWriteResult, ReplaceProjectUnitShotsRequest) {
	t.Helper()
	source, err := s.ReadShotPlanSource("user-1", p, u)
	if err != nil {
		t.Fatal(err)
	}
	ids := []string{}
	for _, shot := range source.Snapshot.Entries {
		ids = append(ids, shot.ShotID)
	}
	req := ReplaceProjectUnitShotsRequest{RequestID: newID(), ExpectedSourceSHA256: source.SHA256, ExpectedShotIDs: ids, Shots: []ReplaceProjectUnitShotInput{{CreateProjectShotRequest: CreateProjectShotRequest{Title: title, Description: title, DurationMs: 1800}}}}
	result, err := s.ReplaceProjectUnitShots("user-1", p, u, req)
	if err != nil {
		t.Fatal(err)
	}
	return result, req
}

func TestShotPlanHistoryRestoreAndLostResponseReplay(t *testing.T) {
	planningBothDatabases(t, func(t *testing.T, s *Service, db *gorm.DB, p model.Project, u model.ProjectUnit) {
		first, firstReq := replacePlanningFixture(t, s, p.ID, u.ID, "原方案")
		now := time.Now()
		resource := model.Resource{ID: newID(), UserID: "user-1", Kind: "image", MimeType: "image/png", Status: model.ResourceStatusReady, CreatedAt: now, UpdatedAt: now}
		artifact := model.ShotArtifact{ID: newID(), ProjectID: p.ID, UnitID: u.ID, ShotID: first.Shots[0].ID, RevisionID: first.Shots[0].CurrentRevisionID, Type: "storyboard", ResourceID: resource.ID, Selected: true, Version: 1, Status: "ready", CreatedAt: now, UpdatedAt: now}
		for _, row := range []any{&resource, &artifact} {
			if err := db.Create(row).Error; err != nil {
				t.Fatal(err)
			}
		}
		second, _ := replacePlanningFixture(t, s, p.ID, u.ID, "新方案")
		if second.BackupRecordID == "" || !second.Current {
			t.Fatal("replacement did not retain prior plan")
		}
		var original model.Shot
		db.First(&original, "id = ?", first.Shots[0].ID)
		if !original.Archived || original.CurrentRevisionID != first.Shots[0].CurrentRevisionID {
			t.Fatal("old immutable shot lost")
		}
		oldReply, err := s.ReplaceProjectUnitShots("user-1", p.ID, u.ID, firstReq)
		if err != nil || !oldReply.Replayed || oldReply.Current || oldReply.Shots[0].ID != first.Shots[0].ID {
			t.Fatal("lost response replay replaced later plan", err)
		}
		old, err := s.ReadShotPlan("user-1", p.ID, second.BackupRecordID)
		if err != nil {
			t.Fatal(err)
		}
		source, err := s.ReadShotPlanSource("user-1", p.ID, u.ID)
		if err != nil {
			t.Fatal(err)
		}
		req := RestoreShotPlanRequest{RequestID: newID(), SourceSHA256: old.Record.PayloadSHA256, ExpectedShotIDs: []string{second.Shots[0].ID}, ExpectedSourceSHA256: source.SHA256}
		restored, err := s.RestoreShotPlan("user-1", p.ID, old.Record.ID, req)
		if err != nil || !restored.Current || restored.Shots[0].ID != first.Shots[0].ID || restored.BackupRecordID == "" {
			t.Fatal("restore did not recover native exact shot", err)
		}
		var selected model.ShotArtifact
		db.First(&selected, "id = ?", artifact.ID)
		if !selected.Selected || selected.ResourceID != resource.ID {
			t.Fatal("restore lost original selected media")
		}
		if _, _, err := s.CreateShotRevision("user-1", p.ID, first.Shots[0].ID, ShotRevisionInput{ExpectedRevisionID: &first.Shots[0].CurrentRevisionID, PlotDescription: "恢复后的另一次修改"}); err != nil {
			t.Fatal(err)
		}
		third, _ := replacePlanningFixture(t, s, p.ID, u.ID, "后续编辑")
		replay, err := s.RestoreShotPlan("user-1", p.ID, old.Record.ID, req)
		if err != nil || !replay.Replayed || replay.Current {
			t.Fatal("old restore replay resurrected old plan", err)
		}
		current, err := s.repo.ProjectUnitShots(p.ID, u.ID)
		if err != nil || len(current) != 1 || current[0].ID != third.Shots[0].ID {
			t.Fatal("replay changed current plan", err)
		}
		var count int64
		db.Model(&model.Shot{}).Where("project_id = ?", p.ID).Count(&count)
		if count != 3 {
			t.Fatal("canonical retries created or destroyed shots", count)
		}
		if _, err = s.ReadShotPlan("other", p.ID, old.Record.ID); err == nil {
			t.Fatal("foreign user read plan")
		}
		latest, _ := s.ReadShotPlanSource("user-1", p.ID, u.ID)
		if _, err = s.RestoreShotPlan("user-1", p.ID, old.Record.ID, RestoreShotPlanRequest{RequestID: newID(), SourceSHA256: old.Record.PayloadSHA256, ExpectedShotIDs: []string{third.Shots[0].ID}, ExpectedSourceSHA256: latest.SHA256}); err != nil {
			t.Fatal(err)
		}
		db.First(&selected, "id = ?", artifact.ID)
		if selected.Status != "ready" || !selected.Selected || selected.RevisionID != first.Shots[0].CurrentRevisionID {
			t.Fatal("restoring fixed original revision did not restore its exact candidate status")
		}
	})
}

func TestShotPlanConflictsAndRestoreRollback(t *testing.T) {
	planningBothDatabases(t, func(t *testing.T, s *Service, db *gorm.DB, p model.Project, u model.ProjectUnit) {
		first, req := replacePlanningFixture(t, s, p.ID, u.ID, "一")
		before, err := s.ReadShotPlanSource("user-1", p.ID, u.ID)
		if err != nil {
			t.Fatal(err)
		}
		expected := first.Shots[0].CurrentRevisionID
		if _, _, err = s.CreateShotRevision("user-1", p.ID, first.Shots[0].ID, ShotRevisionInput{ExpectedRevisionID: &expected, PlotDescription: "另一页面的新稿"}); err != nil {
			t.Fatal(err)
		}
		req.RequestID = newID()
		req.ExpectedSourceSHA256 = before.SHA256
		req.ExpectedShotIDs = []string{first.Shots[0].ID}
		_, err = s.ReplaceProjectUnitShots("user-1", p.ID, u.ID, req)
		var conflict *AppError
		if !errors.As(err, &conflict) || conflict.Status != 409 {
			t.Fatal("same IDs with changed revision overwrote later edit", err)
		}
		second, _ := replacePlanningFixture(t, s, p.ID, u.ID, "二")
		old, err := s.ReadShotPlan("user-1", p.ID, second.BackupRecordID)
		if err != nil {
			t.Fatal(err)
		}
		source, _ := s.ReadShotPlanSource("user-1", p.ID, u.ID)
		restore := RestoreShotPlanRequest{RequestID: newID(), SourceSHA256: old.Record.PayloadSHA256, ExpectedShotIDs: []string{second.Shots[0].ID}, ExpectedSourceSHA256: source.SHA256}
		if err := db.Where("id = ?", old.Snapshot.Entries[0].RevisionID).Delete(&model.ShotRevision{}).Error; err != nil {
			t.Fatal(err)
		}
		if _, err = s.RestoreShotPlan("user-1", p.ID, old.Record.ID, restore); err == nil {
			t.Fatal("restore accepted missing fixed revision")
		}
		current, _ := s.repo.ProjectUnitShots(p.ID, u.ID)
		if len(current) != 1 || current[0].ID != second.Shots[0].ID {
			t.Fatal("failed restore partially archived active plan")
		}
		var receipts int64
		db.Model(&model.ProjectShotPlanRecord{}).Where("kind = ? AND request_id = ?", "restore", restore.RequestID).Count(&receipts)
		if receipts != 0 {
			t.Fatal("failed restore left success receipt")
		}
	})
}

func TestShotPlanRemovalCanRecoverAndArchivedShotCannotBeEdited(t *testing.T) {
	planningBothDatabases(t, func(t *testing.T, s *Service, db *gorm.DB, p model.Project, u model.ProjectUnit) {
		first, _ := replacePlanningFixture(t, s, p.ID, u.ID, "保留")
		shot := first.Shots[0]
		requestID := newID()
		if err := s.DeleteProjectShot("user-1", p.ID, shot.ID, requestID); err != nil {
			t.Fatal(err)
		}
		if _, _, err := s.CreateShotRevision("user-1", p.ID, shot.ID, ShotRevisionInput{ExpectedRevisionID: &shot.CurrentRevisionID, PlotDescription: "不应写入"}); err == nil {
			t.Fatal("archived shot remained writable")
		}
		plans, err := s.ListShotPlans("user-1", p.ID, u.ID, 1, 20)
		if err != nil || len(plans.Versions) != 1 {
			t.Fatal("missing recoverable removal", err)
		}
		source, _ := s.ReadShotPlanSource("user-1", p.ID, u.ID)
		result, err := s.RestoreShotPlan("user-1", p.ID, plans.Versions[0].ID, RestoreShotPlanRequest{RequestID: newID(), SourceSHA256: plans.Versions[0].PayloadSHA256, ExpectedShotIDs: []string{}, ExpectedSourceSHA256: source.SHA256})
		if err != nil || !result.Current || len(result.Shots) != 1 || result.Shots[0].ID != shot.ID {
			t.Fatal("removed shot could not recover", err)
		}
		if err := s.DeleteProjectShot("user-1", p.ID, shot.ID, requestID); err != nil {
			t.Fatal(err)
		}
		current, _ := s.repo.ProjectUnitShots(p.ID, u.ID)
		if len(current) != 1 {
			t.Fatal("old removal replay removed recovered shot")
		}
	})
}

func TestCreativeBriefCASAndShotIntentionsRetainHistory(t *testing.T) {
	planningBothDatabases(t, func(t *testing.T, s *Service, db *gorm.DB, p model.Project, u model.ProjectUnit) {
		brief := &model.ProjectCreativeBrief{Version: 1, Goal: "product", Audience: "新手", KeyMessage: "一个重点", TargetDurationMs: 6000, Language: "普通话", Tone: "轻松", Constraints: []string{"保留品牌外观"}}
		saved, err := s.UpdateProject("user-1", p.ID, UpdateProjectRequest{ExpectedRevision: &p.Revision, CreativeBrief: brief})
		if err != nil {
			t.Fatal(err)
		}
		if _, err = s.UpdateProject("user-1", p.ID, UpdateProjectRequest{ExpectedRevision: &p.Revision, Name: "旧页面覆盖"}); err == nil {
			t.Fatal("stale project settings accepted")
		}
		var persisted model.ProjectCreativeBrief
		if json.Unmarshal([]byte(saved.CreativeBriefJSON), &persisted) != nil || persisted.TargetDurationMs != 6000 {
			t.Fatal("brief not persisted")
		}
		narrative := &model.ShotNarrative{Purpose: "benefit", Information: "操作很简单", Emotion: "放心", VisualBeat: "手部特写", ContinuityNeeds: "同一件商品"}
		shot, err := s.CreateProjectShot("user-1", p.ID, CreateProjectShotRequest{UnitID: u.ID, Title: "展示", Description: "展示操作步骤", DurationMs: 1800, Revision: ShotRevisionInput{Narrative: narrative}})
		if err != nil {
			t.Fatal(err)
		}
		next, revision, err := s.CreateShotRevision("user-1", p.ID, shot.ID, ShotRevisionInput{ExpectedRevisionID: &shot.CurrentRevisionID, PlotDescription: "改动文案", Action: "固定动作", ImagePrompt: "固定画面", VideoPrompt: "固定运镜", ActionBeats: []map[string]any{{"time": 0.5, "action": "抬手"}}})
		if err != nil {
			t.Fatal(err)
		}
		if revision.NarrativeJSON == "" || next.CurrentRevisionID == shot.CurrentRevisionID {
			t.Fatal("older client erased intentions")
		}
		old, err := s.repo.ShotRevisionForShot(shot.ID, shot.CurrentRevisionID)
		if err != nil || old.NarrativeJSON != revision.NarrativeJSON {
			t.Fatal("revision history mutated", err)
		}
		patched, focused, err := s.UpdateShotIntentions("user-1", p.ID, shot.ID, UpdateShotIntentionsRequest{ExpectedRevisionID: next.CurrentRevisionID, Narrative: &model.ShotNarrative{Purpose: "ending", Information: "回到核心信息"}})
		if err != nil || focused.Action != revision.Action || focused.ImagePrompt != revision.ImagePrompt || focused.VideoPrompt != revision.VideoPrompt || focused.ActionBeatsJSON != revision.ActionBeatsJSON {
			t.Fatal("focused intentions action erased unrelated script fields", err)
		}
		next = patched
		_, _, err = s.CreateShotRevision("user-1", p.ID, shot.ID, ShotRevisionInput{ExpectedRevisionID: &next.CurrentRevisionID, ReferenceStates: []model.ShotReferenceState{{AssetVersionID: "foreign-version", ReferenceResourceIDs: []string{"foreign-image"}}}})
		if err == nil {
			t.Fatal("foreign reference state accepted")
		}
	})
}

func TestShotPlanArchivedLateTaskKeepsOriginalMediaWithoutAdvancingNewWorkflow(t *testing.T) {
	planningBothDatabases(t, func(t *testing.T, s *Service, db *gorm.DB, p model.Project, u model.ProjectUnit) {
		if err := s.EnsureBuiltinProjectWorkflowTemplate(); err != nil {
			t.Fatal(err)
		}
		workflow, err := s.CreateUnitWorkflow("user-1", p.ID, u.ID)
		if err != nil {
			t.Fatal(err)
		}
		var video model.WorkflowStepInstance
		for _, step := range workflow.Steps {
			if step.StepKey == "video" {
				video = step
			}
		}
		first, _ := replacePlanningFixture(t, s, p.ID, u.ID, "旧镜头")
		second, _ := replacePlanningFixture(t, s, p.ID, u.ID, "当前镜头")
		before, err := s.ReadShotPlanSource("user-1", p.ID, u.ID)
		if err != nil {
			t.Fatal(err)
		}
		var beforeStep model.WorkflowStepInstance
		db.First(&beforeStep, "id = ?", video.ID)
		resource := model.Resource{ID: newID(), UserID: "user-1", Kind: "video", Status: model.ResourceStatusReady, MimeType: "video/mp4", Size: 100, CreatedAt: time.Now(), UpdatedAt: time.Now()}
		if err := db.Create(&resource).Error; err != nil {
			t.Fatal(err)
		}
		input, _ := json.Marshal(map[string]any{"metadata": map[string]any{"workflowStepId": video.ID, "domainProjectId": p.ID, "unitId": u.ID, "shotId": first.Shots[0].ID, "shotRevisionId": first.Shots[0].CurrentRevisionID, "artifactType": "video", "role": "output"}})
		result, _ := json.Marshal(map[string]any{"mode": "video", "video": map[string]any{"resourceId": resource.ID, "storageKey": "resource:" + resource.ID, "mimeType": "video/mp4"}})
		task := model.Task{ID: newID(), UserID: "user-1", ProjectID: p.ID, Type: "canvas_video", Status: model.TaskStatusSucceeded, InputJSON: string(input), ResultJSON: string(result), CreatedAt: time.Now(), UpdatedAt: time.Now()}
		if err := db.Create(&task).Error; err != nil {
			t.Fatal(err)
		}
		for range 2 {
			if err := s.RegisterTaskOutputFromTask(task); err != nil {
				t.Fatal(err)
			}
		}
		after, err := s.ReadShotPlanSource("user-1", p.ID, u.ID)
		if err != nil || after.SHA256 != before.SHA256 || after.Snapshot.Entries[0].ShotID != second.Shots[0].ID {
			t.Fatal("late old result changed current plan", err)
		}
		var artifact model.ShotArtifact
		db.First(&artifact, "task_id = ?", task.ID)
		if artifact.ResourceID != resource.ID || artifact.Status != "stale" || artifact.Selected {
			t.Fatal("late historical file lost or selected")
		}
		var afterStep model.WorkflowStepInstance
		db.First(&afterStep, "id = ?", video.ID)
		if afterStep.Status != beforeStep.Status {
			t.Fatal("old task advanced current workflow")
		}
		var count int64
		db.Model(&model.ShotArtifact{}).Where("task_id = ?", task.ID).Count(&count)
		if count != 1 {
			t.Fatal("late replay duplicated history")
		}
	})
}
