package protocol

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
)

func TestLocalStructuredPlanningFormatIsTextOnlyAndKeepsItsActualSchema(t *testing.T) {
	schema := map[string]any{"type": "object", "properties": map[string]any{"canPlan": map[string]any{"type": "boolean"}}}
	for _, capability := range []Capability{CapabilityText, CapabilityImage} {
		spec, err := (localAdapter{capability}).BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{Prompt: "look", Extra: map[string]any{"idempotencyKey": "format-contract", "response_format": schema}}})
		if err != nil {
			t.Fatal(err)
		}
		body := spec.Body.(map[string]any)
		if capability == CapabilityText {
			if body["response_format"] == nil {
				t.Fatal("local format was dropped")
			}
		} else if body["response_format"] != nil {
			t.Fatal("image workflow received a text schema")
		}
	}
}

func TestLocalMediaCancellationIsScopedAndUnderstandsConfirmedStatus(t *testing.T) {
	for _, capability := range []Capability{CapabilityImage, CapabilityVideo} {
		adapter := localAdapter{capability}
		spec, err := adapter.BuildCancel(context.Background(), PollContext{TaskID: "prompt-id"})
		if err != nil || spec.Path != "/api/jobs/prompt-id/cancel" || spec.Method != http.MethodPost || !spec.OriginPath || spec.Auth.Type != "none" {
			t.Fatal("incorrect scoped cancellation", err)
		}
		result, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: "prompt-id"}, []byte(`{"status":"cancelled"}`))
		if err != nil || result.Status != StatusCancelled {
			t.Fatal("cancelled receipt was not recognized", err)
		}
	}
	if _, err := (localAdapter{CapabilityText}).BuildCancel(context.Background(), PollContext{TaskID: "text"}); err == nil {
		t.Fatal("text model advertised media cancellation")
	}
}

func TestLocalVideoUsesActualWorkflowFPS(t *testing.T) {
	a := localAdapter{CapabilityVideo}
	spec, err := a.BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{Prompt: "a cat", Duration: 2, AspectRatio: "16:9", Extra: map[string]any{"idempotencyKey": "task-1"}}})
	if err != nil {
		t.Fatal(err)
	}
	body := spec.Body.(map[string]any)
	if body["frames"] != 49 || body["width"] != 512 || body["height"] != 288 {
		t.Fatalf("unexpected video request: %#v", body)
	}
	if spec.Auth.Type != "none" || spec.Headers["Idempotency-Key"] != "task-1" {
		t.Fatalf("unexpected credentials: %#v", spec)
	}
	if _, present := body["idempotencyKey"]; present {
		t.Fatal("host metadata leaked into model input")
	}
}

func TestLocalModelsRejectUnsupportedInputs(t *testing.T) {
	for _, request := range []GenerationRequest{
		{Images: []MediaReference{{URL: "https://example.invalid/ref.png"}}},
		{Duration: 11}, {GenerateAudio: true}, {AspectRatio: "bogus"},
	} {
		request.Extra = map[string]any{"idempotencyKey": "task-1"}
		if _, err := (localAdapter{CapabilityVideo}).BuildCreate(context.Background(), RequestContext{Request: request}); err == nil {
			t.Fatalf("accepted unsupported input: %#v", request)
		}
	}
}

func TestLocalPollSelectsActualMediaType(t *testing.T) {
	body, _ := json.Marshal(map[string]any{"status": "succeeded", "outputs": []any{
		map[string]any{"filename": "preview.png", "url": "http://127.0.0.1/view?preview"},
		map[string]any{"filename": "video.mp4", "url": "http://127.0.0.1/view?video"},
	}})
	result, err := (localAdapter{CapabilityVideo}).ParsePoll(context.Background(), PollContext{TaskID: "prompt-id"}, body)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Result.Videos) != 1 || result.Result.Videos[0].Name != "video.mp4" {
		t.Fatalf("unexpected media: %#v", result)
	}
	recovery, err := (localAdapter{CapabilityVideo}).BuildCreateRecovery(context.Background(), RequestContext{Request: GenerationRequest{Extra: map[string]any{"idempotencyKey": "task-1"}}})
	if err != nil || recovery.Method != http.MethodGet {
		t.Fatalf("unsafe recovery: %#v, %v", recovery, err)
	}
}

func TestLocalReferenceAndDockerArtifactAddress(t *testing.T) {
	image := MediaReference{Kind: "image", Role: "first_frame", DataURL: "data:image/png;base64,cGl4ZWxz"}
	request := GenerationRequest{Images: []MediaReference{image}, Inputs: []MediaReference{image}, Extra: map[string]any{"idempotencyKey": "native-reference"}}
	for _, capability := range []Capability{CapabilityText, CapabilityImage, CapabilityVideo} {
		spec, err := (localAdapter{capability}).BuildCreate(context.Background(), RequestContext{Request: request})
		if err != nil {
			t.Fatal(err)
		}
		if spec.Body.(map[string]any)["reference_images"].([]string)[0] != image.DataURL {
			t.Fatal("reference pixels were omitted")
		}
	}
	request.Images[0].Role = "last_frame"
	if _, err := (localAdapter{CapabilityVideo}).BuildCreate(context.Background(), RequestContext{Request: request}); err == nil {
		t.Fatal("unsupported end frame accepted as a start frame")
	}
	result, err := (localAdapter{CapabilityVideo}).ParsePoll(context.Background(), PollContext{BaseURL: "http://host.docker.internal:8001", TaskID: "native"}, []byte(`{"status":"succeeded","outputs":[{"filename":"cat.mp4","url":"/api/jobs/native/outputs/0"}]}`))
	if err != nil || result.Result.Videos[0].URL != "http://host.docker.internal:8001/api/jobs/native/outputs/0" {
		t.Fatalf("output escaped configured transport: %#v %v", result, err)
	}
}
