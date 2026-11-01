package app

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"yingce/backend/internal/model"
	"yingce/backend/internal/protocol"
)

func TestLocalModelOnlyTrustsResolvedAdminChannel(t *testing.T) {
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	svc, db := newChannelModelTestService(t)
	if _, err := svc.resolveProviderConfig(providerConfig{InterfaceType: protocol.LocalText, BaseURL: "http://127.0.0.1:8001", trustedLocalChannel: true}); err == nil {
		t.Fatal("untrusted custom channel bypassed keyless boundary")
	}
	channel := model.ModelChannel{ID: "local-channel", Name: "Local", Scope: model.ChannelScopeSystem, Enabled: true, BaseURL: "http://127.0.0.1:8001", APIFormat: "openai", ModelsJSON: `["local-text"]`}
	if err := db.Create(&channel).Error; err != nil {
		t.Fatal(err)
	}
	item := model.ChannelModel{ID: "local-text-row", ChannelID: channel.ID, ModelKey: "local-text", Capability: "text", Protocol: protocol.LocalText, Enabled: true}
	item.CapabilityConfigJSON = `{"version":1,"text":{"contextWindowTokens":32768,"maxOutputTokens":2048,"streaming":false,"references":{"promptMaxChars":30000,"maxImages":1,"maxImageBytes":8388608}}}`
	if err := db.Create(&item).Error; err != nil {
		t.Fatal(err)
	}
	config, err := svc.resolveProviderConfig(providerConfig{ChannelID: channel.ID, Model: item.ModelKey})
	if err != nil {
		t.Fatal(err)
	}
	if !config.trustedLocalChannel || config.APIKey != "" {
		t.Fatalf("system model did not use keyless transport: %#v", config)
	}
	if config.CapabilityConfig == nil || config.CapabilityConfig.Text == nil || config.CapabilityConfig.Text.ContextWindowTokens != 32768 || config.CapabilityConfig.Text.MaxOutputTokens != 2048 {
		t.Fatal("queued execution did not hydrate the administrator text limits")
	}
}

func TestLocalAgentLostResponseRecoversOnlyOriginalToolsAndUsage(t *testing.T) {
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	t.Setenv("HTTP_PROXY", "")
	t.Setenv("HTTPS_PROXY", "")
	posts, reads := 0, 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Header.Get("Authorization") != "" {
			t.Error("local Agent sent credentials")
		}
		if r.Method == http.MethodPost {
			posts++
			var body map[string]any
			_ = json.NewDecoder(r.Body).Decode(&body)
			if r.Header.Get("Idempotency-Key") != "native-agent-step" || body["think"] != true || body["context_length"] != float64(32768) {
				t.Error("host execution policy missing")
			}
			w.WriteHeader(http.StatusBadGateway)
			_, _ = w.Write([]byte(`{"detail":"response lost"}`))
			return
		}
		reads++
		_, _ = w.Write([]byte(`{"status":"succeeded","result":{"message":{"content":"","tool_calls":[{"id":"call_saved","function":{"name":"inspect_project","arguments":{}}}]},"usage":{"total_tokens":25}}}`))
	}))
	defer server.Close()
	var adapter protocol.AgentAdapter
	for _, candidate := range protocol.LocalAdapters() {
		if candidate.Metadata().ID == protocol.LocalText {
			adapter = candidate.(protocol.AgentAdapter)
		}
	}
	ctx := context.WithValue(context.Background(), providerSubmissionKeyContext{}, "native-agent-step")
	input := canvasGenerationInput{Mode: "text", Config: providerConfig{BaseURL: server.URL, InterfaceType: protocol.LocalText, Model: "qwen3.5:9b", CapabilityConfig: &ModelCapabilityConfig{Text: &TextCapabilityConfig{ContextWindowTokens: 32768, MaxOutputTokens: 2048}}}, TextOptions: canvasTextOptions{Thinking: true, MaxOutputTokens: 512}, AgentRequests: &agentToolRequests{ChatCompletion: map[string]any{"messages": []any{map[string]any{"role": "user", "content": "Inspect"}}, "tool_choice": "auto"}}}
	result, err := runDeclarativeAgentTask(ctx, input, adapter)
	if err != nil {
		t.Fatal(err)
	}
	if posts != 1 || reads != 1 || len(result["toolCalls"].([]interface{})) != 1 || result["usage"].(map[string]any)["total_tokens"] != float64(25) {
		t.Fatal(posts, reads, result)
	}
}

func TestLocalAgentUncertainModelStepDoesNotCreateAutomaticRetry(t *testing.T) {
	s, db := newChannelModelTestService(t)
	if err := db.AutoMigrate(&model.RouteAttempt{}); err != nil {
		t.Fatal(err)
	}
	input, _ := json.Marshal(canvasGenerationInput{Mode: "text", Config: providerConfig{InterfaceType: protocol.LocalText}, AgentRequests: &agentToolRequests{}})
	task := model.Task{ID: "local-agent-uncertain", UserID: "user", Status: model.TaskStatusFailed, InputJSON: string(input), Error: "upstream timeout"}
	if err := db.Create(&task).Error; err != nil {
		t.Fatal(err)
	}
	if s.cloudAgentModelTaskRetryable(task.ID) != false {
		t.Fatal("uncertain local inference was automatically replayed")
	}
	if err := db.Create(&model.RouteAttempt{ID: "local-agent-attempt", TaskID: task.ID, DispatchState: "submission_unknown", Status: "failed"}).Error; err != nil {
		t.Fatal(err)
	}
	if !s.localAgentModelTaskReplayUnsafe(task.ID) {
		t.Fatal("lost response permits a new model step")
	}
	if err := db.Model(&model.RouteAttempt{}).Where("id = ?", "local-agent-attempt").Update("dispatch_state", "rejected_no_job").Error; err != nil {
		t.Fatal(err)
	}
	if s.localAgentModelTaskReplayUnsafe(task.ID) {
		t.Fatal("explicit pre-submission rejection unnecessarily blocked retry")
	}
}

func TestLocalAgentReadOnlyCanInspectModelsWithoutGenerationAuthority(t *testing.T) {
	req := agentTestRequest()
	req.PermissionMode = "read_only"
	if !cloudAgentToolAllowed(req, "model_list") || !cloudAgentToolAllowed(req, "canvas_get_state") {
		t.Fatal("read-only inspection is unavailable")
	}
	for _, name := range []string{"generate_media", "image_layer_split", "canvas_apply_ops", "canvas_create_storyboard"} {
		if cloudAgentToolAllowed(req, name) {
			t.Fatal("read-only gained write authority", name)
		}
	}
}

func TestLocalPlainTextUsesSameAdministratorContextContract(t *testing.T) {
	input := canvasGenerationInput{Mode: "text", Prompt: "write", Config: providerConfig{InterfaceType: protocol.LocalText, Model: "qwen3.5:9b", CapabilityConfig: &ModelCapabilityConfig{Text: &TextCapabilityConfig{ContextWindowTokens: 32768}}}, TextOptions: canvasTextOptions{Thinking: true}, MaxOutputTokens: 2048}
	request := protocolRequestFromInput(input)
	request.Extra["idempotencyKey"] = "plain-local"
	var adapter protocol.Adapter
	for _, candidate := range protocol.LocalAdapters() {
		if candidate.Metadata().ID == protocol.LocalText {
			adapter = candidate
		}
	}
	spec, err := adapter.BuildCreate(context.Background(), protocol.RequestContext{Request: request})
	if err != nil {
		t.Fatal(err)
	}
	body := spec.Body.(map[string]any)
	if body["context_length"] != 32768 || body["max_tokens"] != 2048 || body["think"] != true {
		t.Fatal("plain text diverged from the Agent model contract", body)
	}
}

func TestLocalReferenceUsesNativeOwnerPixels(t *testing.T) {
	svc, _, imageBytes := cloudAgentVisionFixture(t)
	input := canvasGenerationInput{Mode: "video", Config: providerConfig{InterfaceType: protocol.LocalVideo}, ReferenceImages: []providerMedia{{StorageKey: "resource:ref-one", URL: "https://example.invalid/replacement.png", DataURL: "data:image/png;base64,ZmFrZQ=="}}}
	policy := providerMediaHydrationPolicyFor(context.Background(), input)
	if err := svc.hydrateGenerationMedia("user", &input, policy); err != nil {
		t.Fatal(err)
	}
	if input.ReferenceImages[0].URL != "" || input.ReferenceImages[0].DataURL != dataURL("image/png", imageBytes) {
		t.Fatal("selected native resource was replaced by caller supplied content")
	}
	if err := svc.hydrateGenerationMedia("other-user", &input, policy); err == nil {
		t.Fatal("foreign resource pixels were exposed")
	}
}

func TestLocalTextRecoversLostCreateAndPreservesUsage(t *testing.T) {
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	t.Setenv("HTTP_PROXY", "")
	t.Setenv("HTTPS_PROXY", "")
	t.Setenv("ALL_PROXY", "")
	creates, reads := 0, 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "" {
			t.Error("keyless transport sent Authorization")
		}
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodPost {
			creates++
			if r.Header.Get("Idempotency-Key") == "" {
				t.Error("missing submission identity")
			}
			w.WriteHeader(http.StatusBadGateway)
			_, _ = w.Write([]byte(`{"detail":"response lost"}`))
			return
		}
		reads++
		_, _ = w.Write([]byte(`{"status":"succeeded","result":{"content":"已保存的文本","usage":{"total_tokens":14}}}`))
	}))
	defer server.Close()
	var adapter protocol.Adapter
	for _, item := range protocol.LocalAdapters() {
		if item.Metadata().ID == protocol.LocalText {
			adapter = item
		}
	}
	output, err := runProtocolAdapterTask(context.Background(), canvasGenerationInput{Mode: "text", Prompt: "测试", Config: providerConfig{BaseURL: server.URL, InterfaceType: protocol.LocalText, Model: "qwen3.5:9b"}}, adapter)
	if err != nil {
		t.Fatal(err)
	}
	if creates != 1 || reads != 1 || output["text"] != "已保存的文本" || output["usage"] == nil {
		t.Fatalf("unsafe or incomplete recovery: creates=%d reads=%d output=%#v", creates, reads, output)
	}
}
