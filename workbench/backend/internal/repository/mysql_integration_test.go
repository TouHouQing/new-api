package repository

import (
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/testdb"
)

func TestMySQLNativeProjectNameConflict(t *testing.T) {
	testCreateProjectNameConflict(t, testdb.MySQL(t))
}

func TestMySQLNativeCanvasConcurrencyAndHistory(t *testing.T) {
	t.Run("revision", func(t *testing.T) { testCanvasRevision(t, testdb.MySQL(t)) })
	t.Run("history", func(t *testing.T) { testCanvasHistory(t, testdb.MySQL(t)) })
}

func TestMySQLNativeTaskLeaseAndUnicodeQuota(t *testing.T) {
	db := testdb.MySQL(t)
	repo := New(db)
	payload := `{"title":"中文🙂"}`
	if err := db.Create(&model.Asset{ID: "mysql-quota", UserID: "owner", PayloadJSON: payload}).Error; err != nil {
		t.Fatal(err)
	}
	usage, err := repo.UserStructuredStorageUsage("owner")
	if err != nil || usage.AssetBytes != int64(len(payload)) {
		t.Fatal("UTF-8 byte quota", usage, err)
	}
	if _, err := repo.UserStorageUsage("owner"); err != nil {
		t.Fatal("complete storage quota", err)
	}
	if _, _, err := repo.CreationStorageUsage("owner"); err != nil {
		t.Fatal("creation quota", err)
	}
	if _, err := repo.ProjectUnitCanvasCounts("mysql-facets"); err != nil {
		t.Fatal("unit counts must avoid reserved SQL aliases", err)
	}
	if _, _, err := repo.ProjectAssetFacets("mysql-facets"); err != nil {
		t.Fatal("project material facets", err)
	}
	kinds, _, _, err := repo.UserAssetFacets("owner", "")
	if err != nil || len(kinds) != 1 || kinds[0].Key != "" || kinds[0].Count != 1 {
		t.Fatal("material facet result mapping", kinds, err)
	}
	if err := db.Create(&model.Task{ID: "mysql-claim", UserID: "owner", Status: model.TaskStatusQueued, InputJSON: "{}"}).Error; err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	results := make(chan *model.Task, 2)
	errors := make(chan error, 2)
	for _, owner := range []string{"worker-one", "worker-two"} {
		wg.Add(1)
		go func(owner string) {
			defer wg.Done()
			task, err := New(db.Session(&gorm.Session{})).ClaimNextTask(owner, time.Minute)
			results <- task
			errors <- err
		}(owner)
	}
	wg.Wait()
	close(results)
	close(errors)
	for err := range errors {
		if err != nil {
			t.Fatal(err)
		}
	}
	claimed := 0
	for task := range results {
		if task != nil {
			claimed++
			if task.ID != "mysql-claim" || task.Attempts != 1 {
				t.Fatal("wrong lease", task.ID, task.Attempts)
			}
		}
	}
	if claimed != 1 {
		t.Fatal("two workers must claim once", claimed)
	}
}

func TestMySQLNativeRegistrationUploadAndFullPathUniqueness(t *testing.T) {
	db := testdb.MySQL(t)
	repo := New(db)
	for _, user := range []model.User{{ID: "one", Username: "one", Email: "first.last+one@gmail.com"}, {ID: "two", Username: "two", Email: "second@example.invalid"}} {
		if err := repo.CreateRegisteredUser(&user); err != nil {
			t.Fatal(err)
		}
	}
	alias := model.User{ID: "three", Username: "three", Email: "firstlast+two@googlemail.com"}
	if err := repo.CreateRegisteredUser(&alias); err == nil {
		t.Fatal("Gmail alias duplicate admitted")
	}
	long := strings.Repeat("路", 800)
	for _, file := range []model.SkillFile{{ID: "one", SkillVersionID: "version", Path: long + "a"}, {ID: "two", SkillVersionID: "version", Path: long + "b"}} {
		if err := db.Create(&file).Error; err != nil {
			t.Fatal("distinct long path", err)
		}
	}
	if err := db.Create(&model.SkillFile{ID: "three", SkillVersionID: "version", Path: long + "a"}).Error; err == nil {
		t.Fatal("full path duplicate admitted")
	}
	first := model.UploadReservation{ID: "reserve-one", UserID: "one", Size: 60, ExpiresAt: time.Now().Add(time.Hour)}
	if err := repo.ReserveUploadSession(&first, 1000, 100, 4); err != nil {
		t.Fatal(err)
	}
	second := first
	second.ID = "reserve-two"
	if err := repo.ReserveUploadSession(&second, 1000, 100, 4); !errors.Is(err, ErrUploadStorageLimit) {
		t.Fatal("storage capacity oversubscribed", err)
	}
	if err := repo.ReleaseUploadSession("one", first.ID); err != nil {
		t.Fatal(err)
	}
	if err := repo.ReserveUploadSession(&second, 1000, 100, 4); err != nil {
		t.Fatal("released capacity not reusable", err)
	}
	if err := repo.SaveSystemSetting(&model.SystemSetting{Key: "mysql-test", ValueJSON: `{"text":"完整设置🙂"}`}); err != nil {
		t.Fatal(err)
	}
	if row, err := repo.SystemSetting("mysql-test"); err != nil || row.ValueJSON != `{"text":"完整设置🙂"}` {
		t.Fatal("reserved SQL identifier", err)
	}
	if err := repo.DeleteSystemSetting("mysql-test"); err != nil {
		t.Fatal(err)
	}
	tools := []model.Tool{{ID: 100, Label: "本地工具", Source: "builtin"}}
	for i := 0; i < 2; i++ {
		tools[0].Label += "修订"
		if err := repo.UpsertBuiltinTools(tools); err != nil {
			t.Fatal("builtin seed and restart", i, err)
		}
	}
	if err := db.Create(&model.Tool{ID: 101, Label: "用户原工具", Source: "user"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := repo.UpsertBuiltinTools([]model.Tool{{ID: 101, Label: "不得覆盖", Source: "builtin"}}); err == nil {
		t.Fatal("user tool overwritten")
	}
	var tool model.Tool
	if err := db.First(&tool, 101).Error; err != nil || tool.Label != "用户原工具" {
		t.Fatal("user tool changed", err)
	}
	if err := db.Create(&model.LogicalModel{ID: "active-code", Code: "same-code"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.LogicalModel{ID: "duplicate-code", Code: "same-code"}).Error; err == nil {
		t.Fatal("active code duplicate admitted")
	}
	if err := db.Model(&model.LogicalModel{}).Where("id = ?", "active-code").Update("archived_at", time.Now()).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.LogicalModel{ID: "reused-code", Code: "same-code"}).Error; err != nil {
		t.Fatal("archived code not reusable", err)
	}
}
