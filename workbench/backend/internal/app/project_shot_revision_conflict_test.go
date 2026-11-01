package app

import (
	"errors"
	"testing"

	"yingce/backend/internal/model"
)

func TestShotScriptRejectsStaleAndMissingRevisionWithoutChangingHistory(t *testing.T) {
	svc, db := newProjectWorkflowV2TestService(t)
	project, unit := seedWorkflowProject(t, db)
	shot, err := svc.CreateProjectShot("user-1", project.ID, CreateProjectShotRequest{UnitID: unit.ID, Title: "初稿", Description: "植物", DurationMs: 1000})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.CreateProjectShot("user-1", project.ID, CreateProjectShotRequest{ID: shot.ID, Title: "无版本保存", Description: "不能写入"}); err == nil {
		t.Fatal("missing revision accepted")
	}
	expected := shot.CurrentRevisionID
	saved, err := svc.CreateProjectShot("user-1", project.ID, CreateProjectShotRequest{ID: shot.ID, ExpectedRevisionID: &expected, Title: "其他页面的新稿", Description: "阳光下的植物", Revision: ShotRevisionInput{ActionBeats: []map[string]any{{"time": 0.5, "action": "叶片晃动"}}}})
	if err != nil {
		t.Fatal(err)
	}
	_, err = svc.CreateProjectShot("user-1", project.ID, CreateProjectShotRequest{ID: shot.ID, ExpectedRevisionID: &expected, Title: "旧页面覆盖", Description: "不应保存"})
	var conflict *AppError
	if !errors.As(err, &conflict) || conflict.Status != 409 || conflict.Reason != "shot_revision_conflict" {
		t.Fatalf("stale update must conflict: %v", err)
	}
	if _, _, err := svc.CreateShotRevision("user-1", project.ID, shot.ID, ShotRevisionInput{ExpectedRevisionID: &expected, PlotDescription: "绕过入口的旧稿"}); !errors.As(err, &conflict) || conflict.Status != 409 {
		t.Fatalf("revision endpoint bypassed CAS: %v", err)
	}
	var current model.Shot
	if err := db.First(&current, "id = ?", shot.ID).Error; err != nil {
		t.Fatal(err)
	}
	if current.Title != saved.Title || current.CurrentRevisionID != saved.CurrentRevisionID {
		t.Fatal("stale draft replaced current script")
	}
	var count int64
	if err := db.Model(&model.ShotRevision{}).Where("shot_id = ?", shot.ID).Count(&count).Error; err != nil || count != 2 {
		t.Fatalf("conflict added a history version: %d %v", count, err)
	}
	var revision model.ShotRevision
	if err := db.First(&revision, "id = ?", current.CurrentRevisionID).Error; err != nil || revision.ActionBeatsJSON == "[]" {
		t.Fatal("winning script lost its action beats")
	}
}

func TestShotScriptDeletedAndForeignProjectReturnNotFound(t *testing.T) {
	svc, db := newProjectWorkflowV2TestService(t)
	project, unit := seedWorkflowProject(t, db)
	expected := "old-revision"
	for _, user := range []string{"user-1", "another-user"} {
		_, err := svc.CreateProjectShot(user, project.ID, CreateProjectShotRequest{ID: "deleted-shot", UnitID: unit.ID, Title: "不可保存", ExpectedRevisionID: &expected})
		var missing *AppError
		if !errors.As(err, &missing) || missing.Status != 404 {
			t.Fatalf("unavailable shot must return 404 for %s: %v", user, err)
		}
		_, _, err = svc.CreateShotRevision(user, project.ID, "deleted-shot", ShotRevisionInput{ExpectedRevisionID: &expected})
		if !errors.As(err, &missing) || missing.Status != 404 {
			t.Fatalf("unavailable revision must return 404: %v", err)
		}
	}
}
