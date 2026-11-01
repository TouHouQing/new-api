package app

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"yingce/backend/internal/model"
)

func nativeLayerPlanningFixture(t *testing.T) (*Service, map[string]any) {
	t.Helper()
	s, _, edit, _, _ := nativeImageEditFixture(t)
	source := edit["metadata"].(map[string]any)["nativeImageEdit"].(map[string]any)
	return s, map[string]any{"mode": "text", "prompt": "untrusted old prompt", "referenceImages": []any{map[string]any{"url": "https://example.invalid/other.png"}}, "metadata": map[string]any{"nativeLayerPlanning": map[string]any{"version": 1, "sourceNodeId": source["sourceNodeId"], "resourceId": source["resourceId"], "expectedSourceSha256": source["expectedSourceSha256"], "instructions": "提取完整人物素材", "purpose": "materials", "input": "preview"}}}
}

func TestNativeLayerPlanningAdmissionSealsOwnedOriginalAndReplacesUnrelatedReference(t *testing.T) {
	s, input := nativeLayerPlanningFixture(t)
	if err := s.prepareNativeLayerPlanning("other-user", "native-edit-canvas", input); err == nil {
		t.Fatal("foreign original admitted")
	}
	if err := s.prepareNativeLayerPlanning("image-user", "native-edit-canvas", input); err != nil {
		t.Fatal(err)
	}
	metadata := input["metadata"].(map[string]any)
	plan, err := decodeNativeLayerPlanning(metadata["nativeLayerPlanning"])
	if err != nil || plan.Source.SHA256 != plan.ExpectedSourceSHA256 || plan.ReferenceSHA256 == "" || plan.ReferenceSize.Width != 31 || plan.ReferenceSize.Height != 23 {
		t.Fatalf("source was not sealed: %+v %v", plan, err)
	}
	refs := input["referenceImages"].([]any)
	if len(refs) != 1 || refs[0].(map[string]any)["storageKey"] != "resource:"+plan.ResourceID || refs[0].(map[string]any)["url"] != nil || input["prompt"] == "untrusted old prompt" {
		t.Fatal("unrelated input escaped immutable planning source")
	}
	plan.ExpectedSourceSHA256 = strings.Repeat("b", 64)
	metadata["nativeLayerPlanning"] = plan
	if err := s.prepareNativeLayerPlanning("image-user", "native-edit-canvas", input); err == nil {
		t.Fatal("replaced source fingerprint accepted")
	}
}

func TestNativeLayerPlanningWorkerUsesExactSavedPreviewAndHonorsCancellation(t *testing.T) {
	s, input := nativeLayerPlanningFixture(t)
	if err := s.prepareNativeLayerPlanning("image-user", "native-edit-canvas", input); err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(input)
	var request canvasGenerationInput
	if err := json.Unmarshal(encoded, &request); err != nil {
		t.Fatal(err)
	}
	request.Config.CapabilityConfig = &ModelCapabilityConfig{Text: &TextCapabilityConfig{}}
	request.Config.CapabilityConfig.Text.References.MaxImages = 1
	ready, err := s.hydrateNativeLayerPlanning(context.Background(), "image-user", &request)
	if err != nil || !ready || !strings.HasPrefix(request.ReferenceImages[0].DataURL, "data:image/png;base64,") || request.ReferenceImages[0].Width != 31 {
		t.Fatalf("saved reference not used: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := s.hydrateNativeLayerPlanning(ctx, "image-user", &request); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled planning still prepared pixels: %v", err)
	}
	plan := request.Metadata["nativeLayerPlanning"].(map[string]any)
	plan["referenceSha256"] = strings.Repeat("a", 64)
	if _, err := s.hydrateNativeLayerPlanning(context.Background(), "image-user", &request); err == nil {
		t.Fatal("changed preview accepted")
	}
}

func TestNativeLayerPlanningCompletionAtomicallyStoresValidatedProposalAndInvalidText(t *testing.T) {
	s, input := nativeLayerPlanningFixture(t)
	if err := s.prepareNativeLayerPlanning("image-user", "native-edit-canvas", input); err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(input)
	const proposal = `{"canPlan":true,"layout":"continuous","coordinateSpace":"normalized1000","layers":[{"name":"原图","description":"完整原图","kind":"background","generation":{"prompt":"保留原图","background":"opaque"},"extraction":{"method":"source"}},{"name":"主体","description":"画面中的完整主体","kind":"object","editUnit":"object","generation":{"prompt":"提取可见主体，背景透明","background":"transparent"},"extraction":{"method":"generate"}}]}`
	for _, text := range []string{proposal, `{"canPlan":false,"reason":"图片不可见"}`} {
		task := &model.Task{ID: newID(), UserID: "image-user", ProjectID: "native-edit-canvas", Type: "canvas_text", Status: model.TaskStatusRunning, InputJSON: string(encoded), CreatedAt: time.Now()}
		if err := s.repo.Create(task); err != nil {
			t.Fatal(err)
		}
		result, _ := json.Marshal(map[string]any{"text": text})
		if err := s.saveTaskCompletionWithinStorageQuota(task, result, nil, false); err != nil {
			t.Fatal(err)
		}
		saved, err := s.repo.TaskForUser("image-user", task.ID)
		if err != nil {
			t.Fatal(err)
		}
		var output map[string]any
		if json.Unmarshal([]byte(saved.ResultJSON), &output) != nil {
			t.Fatal("missing stored result")
		}
		receipt := output["imageLayerPlanning"].(map[string]any)
		if saved.Status != model.TaskStatusSucceeded || output["text"] != text || receipt["taskId"] != task.ID || receipt["sourceNodeId"] != "original-node" {
			t.Fatal("model result or owned source lost")
		}
		if text == proposal && (receipt["status"] != "ready" || receipt["plan"] == nil) || text != proposal && (receipt["status"] != "needs_correction" || receipt["plan"] != nil || receipt["reason"] == nil) {
			t.Fatal("text success was confused with a usable visual plan")
		}
	}
}

func TestNativeLayerPlanningBudgetRejectsBeforeReservationAndKeepsExplicitLimit(t *testing.T) {
	_, input := nativeLayerPlanningFixture(t)
	task := &model.Task{}
	order := &model.BillingOrder{AmountMicrocredits: CreditScale}
	if err := applyNativeLayerPlanningBudget(task, input, order); err == nil || order.ChargeLimitSet {
		t.Fatal("zero planning budget admitted paid inference")
	}
	input["metadata"].(map[string]any)["nativeLayerPlanning"].(map[string]any)["maxCredits"] = 2.0
	if err := applyNativeLayerPlanningBudget(task, input, order); err != nil || !order.ChargeLimitSet || task.AuthorizedChargeMicrocredits != CreditScale || order.ChargeLimitMicrocredits != CreditScale {
		t.Fatalf("planning ceiling not sealed: %v", err)
	}
	context := taskClientContext(`{"metadata":{"nodeId":"temporary-plan-pointer","nativeLayerPlanning":{"sourceNodeId":"original-node"}}}`)
	if context == nil || context.NodeID != "original-node" {
		t.Fatal("planning history points to a nonexistent generated text node")
	}
}

func TestNativeLayerPlanningWorkflowKeepsProvenanceAndRejectsOtherSourceOrInvalidReply(t *testing.T) {
	s, input := nativeLayerPlanningFixture(t)
	if err := s.prepareNativeLayerPlanning("image-user", "native-edit-canvas", input); err != nil {
		t.Fatal(err)
	}
	plan, _ := decodeNativeLayerPlanning(input["metadata"].(map[string]any)["nativeLayerPlanning"])
	encoded, _ := json.Marshal(input)
	task := &model.Task{ID: newID(), UserID: "image-user", ProjectID: "native-edit-canvas", Type: "canvas_text", Status: model.TaskStatusSucceeded, InputJSON: string(encoded)}
	result, _ := json.Marshal(map[string]any{"imageLayerPlanning": map[string]any{"taskId": task.ID, "status": "ready"}})
	task.ResultJSON = string(result)
	if err := s.repo.Create(task); err != nil {
		t.Fatal(err)
	}
	req := ImageLayerWorkflowRequest{PlanningTaskID: task.ID, SourceNodeID: plan.SourceNodeID, ResourceID: plan.ResourceID, ExpectedSourceSHA256: plan.Source.SHA256}
	if err := s.validateNativeLayerPlanningWorkflow("image-user", "native-edit-canvas", req); err != nil {
		t.Fatal(err)
	}
	for _, change := range []ImageLayerWorkflowRequest{{PlanningTaskID: task.ID, SourceNodeID: "other"}, {PlanningTaskID: task.ID, SourceNodeID: plan.SourceNodeID, ResourceID: plan.ResourceID, ExpectedSourceSHA256: strings.Repeat("f", 64)}} {
		if err := s.validateNativeLayerPlanningWorkflow("image-user", "native-edit-canvas", change); err == nil {
			t.Fatal("another source adopted the saved planning")
		}
	}
	if err := s.validateNativeLayerPlanningWorkflow("another-user", "native-edit-canvas", req); err == nil {
		t.Fatal("another account adopted the saved planning")
	}
	task.ID = newID()
	task.ResultJSON = `{"imageLayerPlanning":{"status":"needs_correction"}}`
	if err := s.repo.Create(task); err != nil {
		t.Fatal(err)
	}
	req.PlanningTaskID = task.ID
	if err := s.validateNativeLayerPlanningWorkflow("image-user", "native-edit-canvas", req); err == nil {
		t.Fatal("invalid visual reply admitted confirmed planning")
	}
}
