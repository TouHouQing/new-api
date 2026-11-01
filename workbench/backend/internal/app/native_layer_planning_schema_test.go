package app

import (
	"strings"
	"testing"
	"yingce/backend/internal/protocol"
)

func TestNativeLayerPlanningSealsLocalSchemaAndKeepsOldUnformattedReceiptsStable(t *testing.T) {
	s, input := nativeLayerPlanningFixture(t)
	input["config"] = map[string]any{"interfaceType": protocol.LocalText}
	if err := s.prepareNativeLayerPlanning("image-user", "native-edit-canvas", input); err != nil {
		t.Fatal(err)
	}
	plan, err := decodeNativeLayerPlanning(input["metadata"].(map[string]any)["nativeLayerPlanning"])
	if err != nil || plan.ResponseSchema != "image-layer-plan-v1" {
		t.Fatal("new local planning did not seal its output contract", err)
	}
	working := canvasGenerationInput{Mode: "text", Config: providerConfig{InterfaceType: protocol.LocalText}, Metadata: input["metadata"].(map[string]any), TextOptions: canvasTextOptions{Thinking: true}}
	request := protocolRequestFromInput(working)
	if request.Extra["response_format"] == nil || request.Extra["think"] != false {
		t.Fatal("structured format was not delivered to local text transport")
	}
	if prompt := nativeLayerPlanningPrompt(plan); !strings.Contains(prompt, "normalized1000") || !strings.Contains(prompt, "0至1000") {
		t.Fatal("prompt contradicts constrained coordinates")
	}
	stored := working.Metadata["nativeLayerPlanning"].(map[string]any)
	delete(stored, "responseSchema")
	if request := protocolRequestFromInput(working); request.Extra["response_format"] != nil {
		t.Fatal("old pending inputs silently changed receipt fingerprint")
	}
}
