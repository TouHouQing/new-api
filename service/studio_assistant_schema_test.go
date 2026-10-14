package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestStudioAssistantSchemaConstrainsTargetsAndWorkflowKinds(t *testing.T) {
	document := map[string]any{"nodes": []any{
		map[string]any{"id": "open-video", "data": map[string]any{"kind": "video", "mediaId": "owned-video", "model": "wan2.1-vace-1.3b"}},
		map[string]any{"id": "locked-video", "data": map[string]any{"kind": "video", "locked": true}},
		map[string]any{"id": "plan", "data": map[string]any{"kind": "text", "assistantPlan": true}},
	}, "shots": []any{map[string]any{"id": "shot-one"}}, "assets": []any{map[string]any{"id": "fox"}}}
	format, err := studioAssistantResponseSchema(document, "")
	require.NoError(t, err)
	schema := format["json_schema"].(map[string]any)["schema"].(map[string]any)
	properties := schema["properties"].(map[string]any)
	operations := properties["operations"].(map[string]any)["items"].(map[string]any)["anyOf"].([]any)
	for _, raw := range operations {
		fields := raw.(map[string]any)["properties"].(map[string]any)
		op := fields["op"].(map[string]any)["const"]
		assert.NotContains(t, []string{"remove_nodes", "disconnect", "add_node"}, op)
		if target, ok := fields["nodeId"].(map[string]any); ok {
			assert.Equal(t, []string{"open-video"}, target["enum"])
		}
		if op == "connect" {
			assert.Equal(t, []string{"locked-video", "open-video"}, fields["source"].(map[string]any)["enum"])
		}
	}
	tasks := properties["workflowActions"].(map[string]any)["items"].(map[string]any)["oneOf"].([]any)
	for _, raw := range tasks {
		shape := raw.(map[string]any)
		fields := shape["properties"].(map[string]any)
		kind := fields["kind"].(map[string]any)["const"]
		if kind == "media" || kind == "previs" || kind == "graphics" {
			assert.Contains(t, shape["required"], "operation")
		}
	}
	assert.Equal(t, []string{"open-video"}, properties["generateNodeIds"].(map[string]any)["items"].(map[string]any)["enum"])
}

func TestStudioAssistantSchemaRequiresRequestedTaskOnlyFromActualRequest(t *testing.T) {
	for _, entry := range []struct {
		prompt   string
		required bool
	}{
		{"Contract: video_depth\nRequest:\n提出 previs_frame 到现有图像节点", true},
		{"Contract: video_depth\nRequest:\n只修改运镜", false},
		{"Contract: video_depth\nRequest:\n解释怎样使用 previs_frame", false},
	} {
		format, err := studioAssistantResponseSchema(map[string]any{"nodes": []any{map[string]any{"id": "frame", "data": map[string]any{"kind": "image"}}}}, entry.prompt)
		require.NoError(t, err)
		props := format["json_schema"].(map[string]any)["schema"].(map[string]any)["properties"].(map[string]any)
		tasks := props["workflowActions"].(map[string]any)
		if entry.required {
			assert.Equal(t, 1, tasks["minItems"])
			assert.Len(t, tasks["items"].(map[string]any)["oneOf"], 1)
		} else {
			assert.NotContains(t, tasks, "minItems")
		}
	}
}

func TestStudioAssistantSpecialistSchemaKeepsGraphicsScopedAndNumericValuesValid(t *testing.T) {
	format, err := studioAssistantResponseSchema(map[string]any{"nodes": []any{map[string]any{"id": "output", "data": map[string]any{"kind": "video"}}}}, "\nRequest:\n提出 graphics_animation，时长1.25秒，宽320高180", "beat-motion")
	require.NoError(t, err)
	props := format["json_schema"].(map[string]any)["schema"].(map[string]any)["properties"].(map[string]any)
	ops := props["operations"].(map[string]any)["items"].(map[string]any)["anyOf"].([]any)
	require.Len(t, ops, 1)
	assert.Equal(t, "set_motion_graphics", ops[0].(map[string]any)["properties"].(map[string]any)["op"].(map[string]any)["const"])
	task := props["workflowActions"].(map[string]any)["items"].(map[string]any)["oneOf"].([]any)[0].(map[string]any)
	seconds := task["properties"].(map[string]any)["operation"].(map[string]any)["properties"].(map[string]any)["seconds"].(map[string]any)
	assert.NotContains(t, seconds, "enum")
	assert.Equal(t, 1.25, seconds["const"])
}

func TestStudioAssistantNodeScopeCannotEditAnUnrelatedShot(t *testing.T) {
	doc := map[string]any{"assistantScopeNodeIds": []any{"standalone"}, "nodes": []any{map[string]any{"id": "standalone", "data": map[string]any{"kind": "video", "model": "wan2.1-vace-1.3b"}}, map[string]any{"id": "unrelated", "data": map[string]any{"kind": "video"}}}, "shots": []any{map[string]any{"id": "first-shot", "videoNodeId": "unrelated"}}}
	format, err := studioAssistantResponseSchema(doc, "Optimize standalone video")
	require.NoError(t, err)
	props := format["json_schema"].(map[string]any)["schema"].(map[string]any)["properties"].(map[string]any)
	for _, raw := range props["operations"].(map[string]any)["items"].(map[string]any)["anyOf"].([]any) {
		fields := raw.(map[string]any)["properties"].(map[string]any)
		op := fields["op"].(map[string]any)["const"]
		assert.NotEqual(t, "update_shot", op)
		if rule, ok := fields["nodeId"].(map[string]any); ok {
			assert.Equal(t, []string{"standalone"}, rule["enum"])
		}
	}
}

func TestStudioAssistantPromptRepairCannotProposeUnrequestedGeneration(t *testing.T) {
	doc := map[string]any{"assistantScopeNodeIds": []any{"video"}, "nodes": []any{map[string]any{"id": "video", "data": map[string]any{"kind": "video", "model": "wan"}}}}
	format, err := studioAssistantResponseSchema(doc, "\nRequest:\n优化提示词，保留声音，不要生成", "cinematic-shot")
	require.NoError(t, err)
	props := format["json_schema"].(map[string]any)["schema"].(map[string]any)["properties"].(map[string]any)
	ops := props["operations"].(map[string]any)
	assert.Equal(t, 1, ops["minItems"])
	variants := ops["items"].(map[string]any)["anyOf"].([]any)
	require.Len(t, variants, 1)
	assert.Equal(t, "update_node", variants[0].(map[string]any)["properties"].(map[string]any)["op"].(map[string]any)["const"])
	assert.Equal(t, 0, props["workflowActions"].(map[string]any)["maxItems"])
	assert.Equal(t, 0, props["generateNodeIds"].(map[string]any)["maxItems"])
}

func TestStudioAssistantNativePlansRequireTheirStoredInputs(t *testing.T) {
	doc := map[string]any{"nodes": []any{map[string]any{"id": "source", "data": map[string]any{"kind": "video", "mediaId": "owned-source"}}, map[string]any{"id": "output", "data": map[string]any{"kind": "image"}}}, "production": map[string]any{"previs": map[string]any{"advanced": map[string]any{"models": []any{map[string]any{"modelMediaId": "owned-mesh"}}}}}}
	format, err := studioAssistantResponseSchema(doc, "\nRequest:\n提出 video_depth 到 output", "depth-restyle")
	require.NoError(t, err)
	props := format["json_schema"].(map[string]any)["schema"].(map[string]any)["properties"].(map[string]any)
	task := props["workflowActions"].(map[string]any)["items"].(map[string]any)["oneOf"].([]any)[0].(map[string]any)
	operation := task["properties"].(map[string]any)["operation"].(map[string]any)
	assert.Contains(t, operation["required"], "reference_media_ids")
	assert.Equal(t, []string{"owned-source"}, operation["properties"].(map[string]any)["reference_media_ids"].(map[string]any)["items"].(map[string]any)["enum"])
	format, err = studioAssistantResponseSchema(doc, "\nRequest:\n用 GLB 提出 previs_frame", "scene-director")
	require.NoError(t, err)
	props = format["json_schema"].(map[string]any)["schema"].(map[string]any)["properties"].(map[string]any)
	fields := props["operations"].(map[string]any)["items"].(map[string]any)["anyOf"].([]any)[0].(map[string]any)["properties"].(map[string]any)
	assert.Contains(t, fields["scene"].(map[string]any)["required"], "advanced")
	advanced := fields["scene"].(map[string]any)["properties"].(map[string]any)["advanced"].(map[string]any)
	assert.Contains(t, advanced["required"], "models")
	assert.Equal(t, 1, advanced["properties"].(map[string]any)["models"].(map[string]any)["minItems"])
}

func TestStudioAssistantRequestedTaskDimensionsAndDurationSurviveGrammar(t *testing.T) {
	doc := map[string]any{"nodes": []any{map[string]any{"id": "output", "data": map[string]any{"kind": "video"}}}}
	format, err := studioAssistantResponseSchema(doc, "\nRequest:\n提出320x180一秒 graphics_animation", "beat-motion")
	require.NoError(t, err)
	props := format["json_schema"].(map[string]any)["schema"].(map[string]any)["properties"].(map[string]any)
	task := props["workflowActions"].(map[string]any)["items"].(map[string]any)["oneOf"].([]any)[0].(map[string]any)
	operation := task["properties"].(map[string]any)["operation"].(map[string]any)
	fields := operation["properties"].(map[string]any)
	assert.Contains(t, operation["required"], "options")
	assert.Equal(t, float64(1), fields["seconds"].(map[string]any)["const"])
	options := fields["options"].(map[string]any)["properties"].(map[string]any)
	assert.Equal(t, 320, options["width"].(map[string]any)["const"])
	assert.Equal(t, 180, options["height"].(map[string]any)["const"])
	assert.NotContains(t, options["width"].(map[string]any), "enum")
	assert.Equal(t, 1, props["operations"].(map[string]any)["minItems"])
}
