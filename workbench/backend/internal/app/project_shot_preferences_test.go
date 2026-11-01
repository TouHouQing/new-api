package app

import (
	"errors"
	"testing"
	"time"
	"yingce/backend/internal/model"
)

func stringPointer(value string) *string { return &value }

func TestShotPreferencesPersistAndProtectPinnedOrSelectedCandidates(t *testing.T) {
	svc, db := newProjectWorkflowV2TestService(t)
	project, unit := seedWorkflowProject(t, db)
	shot, err := svc.CreateProjectShot("user-1", project.ID, CreateProjectShotRequest{UnitID: unit.ID, Title: "镜头", Description: "植物", DurationMs: 1000})
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	resource := model.Resource{ID: "image", UserID: "user-1", Kind: "image", MimeType: "image/png", Status: model.ResourceStatusReady, CreatedAt: now, UpdatedAt: now}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatal(err)
	}
	a := model.ShotArtifact{ID: "a", ProjectID: project.ID, UnitID: unit.ID, ShotID: shot.ID, RevisionID: shot.CurrentRevisionID, Type: "storyboard", Version: 1, ResourceID: resource.ID, Selected: true, Status: "ready", MetadataJSON: `{"seed":42}`, CreatedAt: now, UpdatedAt: now}
	b := a
	b.ID = "b"
	b.Version = 2
	b.Selected = false
	for _, item := range []model.ShotArtifact{a, b} {
		if err := db.Create(&item).Error; err != nil {
			t.Fatal(err)
		}
	}
	for _, user := range []string{"user-2", ""} {
		if _, err := svc.ChangeShotArtifact(user, project.ID, shot.ID, b.ID, ShotArtifactChangeInput{Action: "select", ExpectedSelectedID: stringPointer(a.ID)}); err == nil {
			t.Fatal("foreign user changed a candidate")
		}
	}
	if _, err := svc.ChangeShotArtifact("user-1", project.ID, shot.ID, a.ID, ShotArtifactChangeInput{Action: "archive", ExpectedSelectedID: stringPointer(a.ID)}); err == nil {
		t.Fatal("selected candidate archived")
	}
	selected, err := svc.ChangeShotArtifact("user-1", project.ID, shot.ID, b.ID, ShotArtifactChangeInput{Action: "select", ExpectedSelectedID: stringPointer(a.ID)})
	if err != nil || !selected.Selected {
		t.Fatalf("selection failed: %v", err)
	}
	_, err = svc.ChangeShotArtifact("user-1", project.ID, shot.ID, a.ID, ShotArtifactChangeInput{Action: "select", ExpectedSelectedID: stringPointer(a.ID)})
	var conflict *AppError
	if !errors.As(err, &conflict) || conflict.Status != 409 {
		t.Fatalf("stale selection must conflict: %v", err)
	}
	source, err := svc.SaveShotVideoSource("user-1", project.ID, shot.ID, ShotVideoSourceInput{Source: "frame:a", ExpectedSource: stringPointer("")})
	if err != nil || source.VideoSource != "frame:a" {
		t.Fatalf("first frame not persisted: %v", err)
	}
	if _, err := svc.ChangeShotArtifact("user-1", project.ID, shot.ID, a.ID, ShotArtifactChangeInput{Action: "archive", ExpectedSelectedID: stringPointer(b.ID)}); err == nil {
		t.Fatal("pinned frame archived")
	}
	if _, err := svc.SaveShotVideoSource("user-1", project.ID, shot.ID, ShotVideoSourceInput{Source: "text", ExpectedSource: stringPointer("")}); err == nil {
		t.Fatal("stale first-frame write accepted")
	}
	if _, err := svc.SaveShotVideoSource("user-1", project.ID, shot.ID, ShotVideoSourceInput{Source: "text", ExpectedSource: stringPointer("frame:a")}); err != nil {
		t.Fatal(err)
	}
	archived, err := svc.ChangeShotArtifact("user-1", project.ID, shot.ID, a.ID, ShotArtifactChangeInput{Action: "archive", ExpectedSelectedID: stringPointer(b.ID)})
	if err != nil || !archived.Archived || archived.MetadataJSON != a.MetadataJSON || archived.ResourceID != resource.ID {
		t.Fatalf("archive lost candidate: %v", err)
	}
	if _, err := svc.SaveShotVideoSource("user-1", project.ID, shot.ID, ShotVideoSourceInput{Source: "frame:a", ExpectedSource: stringPointer("text")}); err == nil {
		t.Fatal("archived frame accepted")
	}
	if _, _, err := svc.CreateShotRevision("user-1", project.ID, shot.ID, ShotRevisionInput{ExpectedRevisionID: &shot.CurrentRevisionID, PlotDescription: "植物特写", DurationMs: 1000}); err != nil {
		t.Fatal(err)
	}
	var stored model.ShotArtifact
	if err := db.First(&stored, "id = ?", a.ID).Error; err != nil || !stored.Archived || stored.Status != "stale" {
		t.Fatal("script edit lost archive or history")
	}
	var saved model.Shot
	if err := db.First(&saved, "id = ?", shot.ID).Error; err != nil || saved.VideoSource != "text" {
		t.Fatal("script edit lost video source")
	}
	restored, err := svc.ChangeShotArtifact("user-1", project.ID, shot.ID, a.ID, ShotArtifactChangeInput{Action: "restore", ExpectedSelectedID: stringPointer("")})
	if err != nil || restored.Archived || restored.Selected {
		t.Fatalf("restore unexpectedly selected the candidate: %v", err)
	}
	if _, err := svc.ChangeShotArtifact("user-1", project.ID, shot.ID, a.ID, ShotArtifactChangeInput{Action: "select", ExpectedSelectedID: stringPointer("")}); err != nil {
		t.Fatal(err)
	}
	var count int64
	db.Model(&model.Resource{}).Where("id = ?", resource.ID).Count(&count)
	if count != 1 {
		t.Fatal("candidate operations removed media")
	}
}

func TestShotVideoSourceRejectsForeignWrongTypeAndMissingCAS(t *testing.T) {
	svc, db := newProjectWorkflowV2TestService(t)
	project, unit := seedWorkflowProject(t, db)
	shot, err := svc.CreateProjectShot("user-1", project.ID, CreateProjectShotRequest{UnitID: unit.ID, Title: "镜头", Description: "植物"})
	if err != nil {
		t.Fatal(err)
	}
	for _, input := range []ShotVideoSourceInput{
		{Source: "text"}, {Source: "automatic", ExpectedSource: stringPointer("")},
		{Source: "frame:missing", ExpectedSource: stringPointer("")},
	} {
		if _, err := svc.SaveShotVideoSource("user-1", project.ID, shot.ID, input); err == nil {
			t.Fatalf("invalid source accepted: %#v", input)
		}
	}
	for _, item := range []model.ShotArtifact{
		{ID: "foreign", ProjectID: project.ID, ShotID: "other", Type: "storyboard", ResourceID: "image", Status: "ready", Version: 1},
		{ID: "video", ProjectID: project.ID, ShotID: shot.ID, Type: "video", ResourceID: "image", Status: "ready", Version: 1},
	} {
		if err := db.Create(&item).Error; err != nil {
			t.Fatal(err)
		}
		if _, err := svc.SaveShotVideoSource("user-1", project.ID, shot.ID, ShotVideoSourceInput{Source: "frame:" + item.ID, ExpectedSource: stringPointer("")}); err == nil {
			t.Fatal("foreign or non-image artifact accepted")
		}
	}
}

func TestShotCandidateSelectionPostgresConcurrentCAS(t *testing.T) {
	svc, db := newProjectNameConflictPostgresService(t)
	if err := db.AutoMigrate(&model.Project{}, &model.ProjectUnit{}, &model.Shot{}, &model.ShotRevision{}, &model.ShotArtifact{}, &model.Resource{}, &model.WorkflowInstance{}, &model.WorkflowStepInstance{}); err != nil {
		t.Fatal(err)
	}
	project, unit := seedWorkflowProject(t, db)
	shot, err := svc.CreateProjectShot("user-1", project.ID, CreateProjectShotRequest{UnitID: unit.ID, Title: "并发选用", Description: "窗边植物"})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.Resource{ID: "shared-image", UserID: "user-1", Kind: "image", MimeType: "image/png", Status: model.ResourceStatusReady}).Error; err != nil {
		t.Fatal(err)
	}
	for index, id := range []string{"a", "b", "c"} {
		if err := db.Create(&model.ShotArtifact{ID: id, ProjectID: project.ID, UnitID: unit.ID, ShotID: shot.ID, RevisionID: shot.CurrentRevisionID, Type: "storyboard", Version: index + 1, ResourceID: "shared-image", Status: "ready", Selected: id == "a"}).Error; err != nil {
			t.Fatal(err)
		}
	}
	for iteration := 0; iteration < 3; iteration++ {
		if err := db.Model(&model.ShotArtifact{}).Where("shot_id = ?", shot.ID).Update("selected", false).Error; err != nil {
			t.Fatal(err)
		}
		if err := db.Model(&model.ShotArtifact{}).Where("id = ?", "a").Update("selected", true).Error; err != nil {
			t.Fatal(err)
		}
		start := make(chan struct{})
		results := make(chan error, 2)
		for _, id := range []string{"b", "c"} {
			go func(id string) {
				<-start
				_, err := svc.ChangeShotArtifact("user-1", project.ID, shot.ID, id, ShotArtifactChangeInput{Action: "select", ExpectedSelectedID: stringPointer("a")})
				results <- err
			}(id)
		}
		close(start)
		succeeded, conflicts := 0, 0
		for range 2 {
			err := <-results
			if err == nil {
				succeeded++
				continue
			}
			var conflict *AppError
			if errors.As(err, &conflict) && conflict.Status == 409 {
				conflicts++
			} else {
				t.Fatalf("unexpected concurrent selection error: %v", err)
			}
		}
		var selected []model.ShotArtifact
		if err := db.Where("shot_id = ? AND selected = ?", shot.ID, true).Find(&selected).Error; err != nil {
			t.Fatal(err)
		}
		if succeeded != 1 || conflicts != 1 || len(selected) != 1 || selected[0].ID == "a" {
			t.Fatalf("non-atomic selection: success=%d conflict=%d selected=%v", succeeded, conflicts, selected)
		}
	}
	var current model.Shot
	if err := db.First(&current, "id = ?", shot.ID).Error; err != nil {
		t.Fatal(err)
	}
	start := make(chan struct{})
	results := make(chan error, 2)
	for _, title := range []string{"稿件A", "稿件B"} {
		go func(title string) {
			<-start
			_, err := svc.CreateProjectShot("user-1", project.ID, CreateProjectShotRequest{ID: shot.ID, ExpectedRevisionID: &current.CurrentRevisionID, Title: title, Description: title})
			results <- err
		}(title)
	}
	close(start)
	succeeded, conflicts := 0, 0
	for range 2 {
		err := <-results
		if err == nil {
			succeeded++
			continue
		}
		var conflict *AppError
		if errors.As(err, &conflict) && conflict.Status == 409 {
			conflicts++
		} else {
			t.Fatalf("script concurrency failed: %v", err)
		}
	}
	var revisions int64
	db.Model(&model.ShotRevision{}).Where("shot_id = ?", shot.ID).Count(&revisions)
	if succeeded != 1 || conflicts != 1 || revisions != 2 {
		t.Fatalf("script CAS failed: %d successes, %d conflicts, %d revisions", succeeded, conflicts, revisions)
	}
}
