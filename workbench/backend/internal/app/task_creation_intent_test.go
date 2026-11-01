package app

import (
	"encoding/json"
	"errors"
	"gorm.io/gorm"
	"strings"
	"sync"
	"testing"
	"yingce/backend/internal/model"
)

func TestTaskCreationIntentConcurrentRetryHasSingleCreditReservation(t *testing.T) {
	planningBothDatabases(t, func(t *testing.T, s *Service, db *gorm.DB, p model.Project, u model.ProjectUnit) {
		capability := mustEncodeModelCapabilityConfig(t, DefaultModelCapabilityConfigForModel(string(model.ChannelInterfaceChatCompletion), "text-test"))
		for _, row := range []any{
			&model.ModelChannel{ID: "channel", Scope: model.ChannelScopeSystem, Enabled: true, Name: "本地验收"},
			&model.ChannelModel{ID: "cm", ChannelID: "channel", ModelKey: "text-test", Capability: "text", Protocol: model.ChannelInterfaceChatCompletion, CapabilityConfigJSON: capability, BillingMode: "fixed_request", UnitPriceMicrocredits: 100, PriceConfigured: true, Enabled: true},
			&model.ChannelModelPriceTier{ID: "tier", ChannelModelID: "cm", SelectorKey: "{}", SelectorJSON: "{}", BillingMode: "fixed_request", UnitPriceMicrocredits: 100, PriceConfigured: true, Enabled: true},
			&model.CreditAccount{UserID: "user-1", AvailableMicrocredits: 10000},
		} {
			if err := db.Create(row).Error; err != nil {
				t.Fatal(err)
			}
		}
		brief := &model.ProjectCreativeBrief{Version: 1, Goal: "product", Audience: "新手", KeyMessage: "展示操作很简单", TargetDurationMs: 6000, Constraints: []string{"同一件商品"}}
		project, err := s.UpdateProject("user-1", p.ID, UpdateProjectRequest{ExpectedRevision: &p.Revision, CreativeBrief: brief})
		if err != nil {
			t.Fatal(err)
		}
		shot, err := s.CreateProjectShot("user-1", p.ID, CreateProjectShotRequest{UnitID: u.ID, Title: "操作展示", Description: "商品特写", DurationMs: 1800, Revision: ShotRevisionInput{Narrative: &model.ShotNarrative{Purpose: "benefit", VisualBeat: "手部特写"}}})
		if err != nil {
			t.Fatal(err)
		}
		key := "chapter-plan:" + newID()
		request := func() CreateTaskRequest {
			req := creationTextRequest()
			req.ProjectID = p.ID
			req.Input["metadata"] = map[string]any{"clientOperationId": key, "domainProjectId": p.ID, "chapterId": u.ID, "shotId": shot.ID, "shotRevisionId": shot.CurrentRevisionID, "productionContext": map[string]any{"version": 999, "projectId": "forged"}}
			return req
		}
		// Independent process-level locks; correctness comes from the actual
		// task primary key and credit transaction, rather than an in-memory map.
		other := &Service{repo: s.repo, dataDir: s.dataDir, disablePiRuntime: true}
		start := make(chan struct{})
		ids := make(chan string, 2)
		failures := make(chan error, 2)
		var workers sync.WaitGroup
		for _, service := range []*Service{s, other} {
			workers.Add(1)
			go func(s *Service) {
				defer workers.Done()
				<-start
				task, err := s.CreateTask("user-1", request())
				if err != nil {
					failures <- err
					return
				}
				ids <- task.ID
			}(service)
		}
		close(start)
		workers.Wait()
		close(ids)
		close(failures)
		for err := range failures {
			t.Fatal("concurrent canonical submission failed", err)
		}
		id := ""
		count := 0
		for value := range ids {
			if id != "" && value != id {
				t.Fatal("retry created different tasks")
			}
			id = value
			count++
		}
		if count != 2 {
			t.Fatal("both callers must receive canonical task")
		}
		var account model.CreditAccount
		db.First(&account, "user_id = ?", "user-1")
		if account.AvailableMicrocredits != 9900 || account.ReservedMicrocredits != 100 {
			t.Fatal("duplicate or missing reservation", account.AvailableMicrocredits, account.ReservedMicrocredits)
		}
		var taskCount, orderCount int64
		db.Model(&model.Task{}).Where("user_id = ?", "user-1").Count(&taskCount)
		db.Model(&model.BillingOrder{}).Where("user_id = ?", "user-1").Count(&orderCount)
		if taskCount != 1 || orderCount != 1 {
			t.Fatal("duplicate tasks or billing orders", taskCount, orderCount)
		}
		raw, err := s.repo.Task(id)
		if err != nil {
			t.Fatal(err)
		}
		var input struct {
			Metadata struct {
				ProductionContext taskProductionContext `json:"productionContext"`
			} `json:"metadata"`
		}
		if json.Unmarshal([]byte(raw.InputJSON), &input) != nil || input.Metadata.ProductionContext.Version != 1 || input.Metadata.ProductionContext.ProjectID != p.ID || input.Metadata.ProductionContext.CreativeBriefJSON != project.CreativeBriefJSON || input.Metadata.ProductionContext.RevisionID != shot.CurrentRevisionID {
			t.Fatal("task did not snapshot server-owned brief and shot revision")
		}
		if !strings.Contains(raw.Prompt, "展示操作很简单") || !strings.Contains(raw.Prompt, "手部特写") {
			t.Fatal("stored requirements were not adopted into actual queued model prompt")
		}
		var persisted map[string]any
		if err := json.Unmarshal([]byte(raw.InputJSON), &persisted); err != nil {
			t.Fatal(err)
		}
		metadata := persisted["metadata"].(map[string]any)
		rendered, err := applyPersistedProductionRequirements("模板编译后的提示词", metadata)
		if err != nil || !strings.Contains(rendered, "展示操作很简单") || !strings.Contains(rendered, "手部特写") {
			t.Fatal("template expansion erased original confirmed requirements", err)
		}
		repeated, err := applyPersistedProductionRequirements(rendered, metadata)
		if err != nil || repeated != rendered {
			t.Fatal("requirements were duplicated on provider recovery", err)
		}
		if err := db.Model(&model.ChannelModel{}).Where("id = ?", "cm").Update("enabled", false).Error; err != nil {
			t.Fatal(err)
		}
		replay, err := other.CreateTask("user-1", request())
		if err != nil || replay.ID != id || replay.ClientOperationID != key {
			t.Fatal("restart/catalog change lost admitted request", err)
		}
		changed := request()
		changed.Prompt = "不同内容"
		_, err = other.CreateTask("user-1", changed)
		var conflict *AppError
		if !errors.As(err, &conflict) || conflict.Status != 409 || conflict.Reason != "task_intent_changed" {
			t.Fatal("changed intent reused operation ID", err)
		}
		found, err := other.TaskByClientOperation("user-1", key)
		if err != nil || found.ID != id {
			t.Fatal("owned lookup lost canonical request", err)
		}
		if _, err := other.TaskByClientOperation("other", key); err == nil {
			t.Fatal("operation lookup leaked another account")
		}
	})
}
