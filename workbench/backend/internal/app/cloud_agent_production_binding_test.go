package app

import (
	"errors"
	"testing"
	"yingce/backend/internal/repository"
)

func TestNativeProductionCreatedProjectKeepsCanvasScopeAcrossContinuationAndConcurrentBinding(t *testing.T) {
	s, state := productionAgentFixture(t, false)
	create := func(name, key string) string {
		t.Helper()
		project, err := s.CreateProject("production-owner", CreateProjectRequest{Name: name, IdempotencyKey: key, Type: "short-drama", AspectRatio: "16:9", SourceType: "blank"})
		if err != nil {
			t.Fatal(err)
		}
		return project.ID
	}
	first, second := create("Agent项目一", "agent-production-binding-first"), create("Agent项目二", "agent-production-binding-second")
	before, err := s.repo.CanvasProjectForUser("production-owner", "production-canvas")
	if err != nil {
		t.Fatal(err)
	}
	if err := s.repo.AssignCanvasToProjectIfUnbound("production-owner", "production-canvas", first); err != nil {
		t.Fatal(err)
	}
	assigned, err := s.repo.CanvasProjectForUser("production-owner", "production-canvas")
	if err != nil || assigned.ProjectID != first || assigned.Revision != before.Revision+1 {
		t.Fatal("native canvas did not retain project identity", err)
	}
	if err := s.repo.AssignCanvasToProjectIfUnbound("production-owner", "production-canvas", first); err != nil {
		t.Fatal(err)
	}
	replay, err := s.repo.CanvasProjectForUser("production-owner", "production-canvas")
	if err != nil || replay.Revision != assigned.Revision {
		t.Fatal("assignment replay duplicated native change", err)
	}
	if err := s.repo.AssignCanvasToProjectIfUnbound("production-owner", "production-canvas", second); !errors.Is(err, repository.ErrCreationConflict) {
		t.Fatal("concurrent project binding was overwritten", err)
	}
	state.CreatedProductionProjectID = first
	if actual, err := s.cloudAgentProductionScope("production-owner", state); err != nil || actual != first {
		t.Fatal("creator lost native project scope", err)
	}
	state.CreatedProductionProjectID = ""
	state.Request.ProductionProjectID = first
	if actual, err := s.cloudAgentProductionScope("production-owner", state); err != nil || actual != first {
		t.Fatal("next conversation lost native project scope", err)
	}
	if err := s.repo.AssignCanvasToProjectIfUnbound("other-owner", "production-canvas", first); err == nil {
		t.Fatal("foreign actor attached owned canvas")
	}
}
