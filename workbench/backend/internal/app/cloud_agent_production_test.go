package app

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"testing"
	"yingce/backend/internal/model"
)

func productionAgentFixture(t *testing.T, bound bool) (*Service, *cloudAgentRuntime) {
	t.Helper()
	s, db := legacyImportService(t)
	user := model.User{ID: "production-owner", Username: "production-owner", Role: model.UserRoleUser, Status: model.UserStatusActive}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	projectID := ""
	if bound {
		projectID = "production-project"
		if err := db.Create(&model.Project{ID: projectID, UserID: user.ID, Name: "Agent原生项目", Type: "short-drama", AspectRatio: "16:9", SourceType: "blank", Status: model.ProjectStatusActive, Revision: 1}).Error; err != nil {
			t.Fatal(err)
		}
	}
	if err := db.Create(&model.CanvasProject{ID: "production-canvas", UserID: user.ID, ProjectID: projectID, Title: "制作画布", PayloadJSON: `{"id":"production-canvas","nodes":[],"connections":[]}`, Revision: 1}).Error; err != nil {
		t.Fatal(err)
	}
	return s, &cloudAgentRuntime{Request: CloudAgentRequest{CanvasID: "production-canvas", ProductionProjectID: projectID, PermissionMode: "auto", ContextScope: []string{"canvas", "project"}}}
}

func TestNativeProductionActionCatalogAndInjectedOwnerProjectBoundary(t *testing.T) {
	s, state := productionAgentFixture(t, true)
	for _, action := range s.productionAgentActions() {
		schema, err := action.schema()
		if err != nil {
			t.Fatal(err)
		}
		properties := schema["properties"].(map[string]any)
		for key := range properties {
			if strings.HasPrefix(key, "$") || key == "userId" || key == "projectId" {
				t.Fatalf("scope input leaked into %s", action.name)
			}
		}
	}
	action, err := s.productionAgentAction("timeline.get")
	if err != nil {
		t.Fatal(err)
	}
	for _, raw := range []string{`{"owner":"foreign"}`, `{"projectId":"foreign"}`, `{} {}`, `null`} {
		if _, err := action.argumentsFor(context.Background(), "production-owner", "production-project", "", json.RawMessage(raw)); err == nil {
			t.Fatalf("untrusted scope or extra body accepted: %s", raw)
		}
	}
	call := cloudAgentCall{}
	call.Function.Name = "production_read"
	call.Function.Arguments = `{"action":"timeline.get","arguments":{}}`
	if _, err := s.cloudAgentProductionRead("production-owner", state, call); err != nil {
		t.Fatal(err)
	}
	if _, err := s.cloudAgentProductionRead("other-owner", state, call); err == nil {
		t.Fatal("another user read native project")
	}
	if _, err := s.productionAgentAction("admin.settings.update"); err == nil {
		t.Fatal("non-catalog function was callable")
	}
	if err := s.repo.AssignCanvasToProject("production-owner", "production-canvas", "another-project"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.cloudAgentProductionRead("production-owner", state, call); err == nil {
		t.Fatal("scope followed a relinked canvas")
	}
}

func TestNativeProductionCreateReusesOriginalNativeProjectIdentity(t *testing.T) {
	s, state := productionAgentFixture(t, false)
	action, err := s.productionAgentAction("project.create")
	if err != nil {
		t.Fatal(err)
	}
	raw := json.RawMessage(`{"request":{"name":"原生Agent创建","type":"short-drama","sourceType":"blank","aspectRatio":"16:9","description":"固定原生创建编号"}}`)
	args, err := action.argumentsFor(context.Background(), "production-owner", "", "production-stable-intent-0001", raw)
	if err != nil {
		t.Fatal(err)
	}
	first, err := action.invoke(args)
	if err != nil {
		t.Fatal(err)
	}
	second, err := action.invoke(args)
	if err != nil {
		t.Fatal(err)
	}
	project := first.(model.Project)
	if project.ID == "" || second.(model.Project).ID != project.ID {
		t.Fatal("replay created another native project")
	}
	state.CreatedProductionProjectID = project.ID
	if scope, err := s.cloudAgentProductionScope("production-owner", state); err != nil || scope != project.ID {
		t.Fatalf("created project was not available in the same native scope: %s %v", scope, err)
	}
	if _, err := action.argumentsFor(context.Background(), "production-owner", "", "production-stable-intent-0001", json.RawMessage(`{"request":{"name":"bad","idempotencyKey":"changed-native-identity"}}`)); err == nil {
		t.Fatal("nested request replaced the stable intent")
	}
}

func TestNativeProductionReadRejectsWritesAndSchemaRequiresOptIn(t *testing.T) {
	s, state := productionAgentFixture(t, true)
	call := cloudAgentCall{}
	call.Function.Name = "production_read"
	call.Function.Arguments = `{"action":"video_rework.create","arguments":{}}`
	if _, err := s.cloudAgentProductionRead("production-owner", state, call); err == nil {
		t.Fatal("read-only path admitted mutation")
	}
	for _, permission := range []string{"read_only", "request_approval", "auto"} {
		req := state.Request
		req.PermissionMode = permission
		if !cloudAgentToolAllowed(req, "production_catalog") || !cloudAgentToolAllowed(req, "production_read") || cloudAgentToolAllowed(req, "production_edit") != (permission != "read_only") {
			t.Fatalf("production permission mismatch %s", permission)
		}
		req.ContextScope = []string{"canvas"}
		if cloudAgentToolAllowed(req, "production_catalog") || cloudAgentToolAllowed(req, "production_edit") {
			t.Fatal("canvas-only scope gained native project access")
		}
	}
	bad := productionAgentAction{name: "bad", function: func(string) {}, arguments: []string{"$owner"}}
	if _, err := bad.schema(); err == nil {
		t.Fatal("unsupported native function declaration accepted")
	}
	normalized := productionAgentCanonicalArguments(productionAgentAction{arguments: []string{"$owner", "request"}}, []reflect.Value{reflect.ValueOf("hidden-owner"), reflect.ValueOf(map[string]any{"requestId": "original"})})
	if strings.Contains(string(normalized), "hidden-owner") {
		t.Fatal("injected scope escaped into model arguments")
	}
}
