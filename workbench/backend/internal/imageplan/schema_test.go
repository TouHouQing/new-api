package imageplan

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestOutputSchemaKeepsRequiredGenerationFieldsAndSourceCoordinatesBounded(t *testing.T) {
	schema := OutputSchema(Size{Width: 1000, Height: 563})
	encoded, err := json.Marshal(schema)
	if err != nil || len(encoded) > 12000 || strings.Contains(string(encoded), "$ref") {
		t.Fatal("unbounded or recursive planning format", err)
	}
	ready := schema["anyOf"].([]any)[0].(map[string]any)
	properties := ready["properties"].(map[string]any)
	if properties["coordinateSpace"].(map[string]any)["const"] != "normalized1000" {
		t.Fatal("coordinate convention drifted")
	}
	size := properties["imageSize"].(map[string]any)["properties"].(map[string]any)
	if size["width"].(map[string]any)["const"] != 1000 || size["height"].(map[string]any)["const"] != 563 {
		t.Fatal("format omitted actual reference size")
	}
	layers := properties["layers"].(map[string]any)
	if layers["minItems"] != 2 || layers["maxItems"] != 8 {
		t.Fatal("layer limit drifted")
	}
	layer := layers["items"].(map[string]any)["properties"].(map[string]any)
	if strings.Join(layer["generation"].(map[string]any)["required"].([]string), ",") != "prompt,background" {
		t.Fatal("incomplete generation was allowed")
	}
	if layer["extraction"].(map[string]any)["additionalProperties"] != false {
		t.Fatal("bbox can hide inside extraction again")
	}
	if schema["anyOf"].([]any)[1].(map[string]any)["properties"].(map[string]any)["canPlan"].(map[string]any)["const"] != false {
		t.Fatal("model cannot honestly report an unreadable source")
	}
}
