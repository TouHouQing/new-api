package service

import (
	"fmt"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	studioagent "github.com/QuantumNous/new-api/integrations/studio-agent"
)

func studioAssistantResponseSchema(document map[string]any, prompt string, skillIDs ...string) (map[string]any, error) {
	var schema map[string]any
	if err := common.Unmarshal(studioagent.AssistantPlanSchema(), &schema); err != nil {
		return nil, err
	}
	editable, readable, shots, assets, media, models := []string{}, []string{}, []string{}, []string{}, []string{}, []string{}
	generation := []string{}
	images := []string{}
	videos := []string{}
	scopes := map[string]bool{}
	scopeValues, _ := document["assistantScopeNodeIds"].([]any)
	for _, value := range scopeValues {
		if id, ok := value.(string); ok {
			scopes[id] = true
		}
	}
	for _, node := range studioObjects(document, "nodes") {
		data, _ := node["data"].(map[string]any)
		id, _ := node["id"].(string)
		if data["assistantPlan"] == true {
			continue
		}
		readable = append(readable, id)
		if data["kind"] == "image" {
			if mediaID, ok := data["mediaId"].(string); ok && mediaID != "" {
				images = append(images, mediaID)
			}
			for _, take := range studioObjects(data, "takes") {
				if mediaID, ok := take["mediaId"].(string); ok && mediaID != "" && take["status"] == "completed" {
					images = append(images, mediaID)
				}
			}
		}
		if data["kind"] == "video" {
			if mediaID, ok := data["mediaId"].(string); ok && mediaID != "" {
				videos = append(videos, mediaID)
			}
			for _, take := range studioObjects(data, "takes") {
				if mediaID, ok := take["mediaId"].(string); ok && mediaID != "" && take["status"] == "completed" {
					videos = append(videos, mediaID)
				}
			}
		}
		if data["locked"] != true && (len(scopes) == 0 || scopes[id]) {
			editable = append(editable, id)
			if model, ok := data["model"].(string); ok && model != "" && data["purpose"] != "assembly" {
				generation = append(generation, id)
			}
		}
	}
	for _, shot := range studioObjects(document, "shots") {
		if len(scopes) > 0 && !scopes[fmt.Sprint(shot["videoNodeId"])] && !scopes[fmt.Sprint(shot["imageNodeId"])] && !scopes[fmt.Sprint(shot["textNodeId"])] {
			continue
		}
		if id, ok := shot["id"].(string); ok {
			shots = append(shots, id)
		}
	}
	for _, asset := range studioObjects(document, "assets") {
		if id, ok := asset["id"].(string); ok {
			assets = append(assets, id)
		}
		if mediaID, ok := asset["mediaId"].(string); ok && mediaID != "" {
			images = append(images, mediaID)
		}
	}
	for id := range StudioMediaReferences(document) {
		media = append(media, id)
	}
	production, _ := document["production"].(map[string]any)
	previs, _ := production["previs"].(map[string]any)
	advanced, _ := previs["advanced"].(map[string]any)
	for _, item := range studioObjects(advanced, "models") {
		if id, ok := item["modelMediaId"].(string); ok {
			models = append(models, id)
		}
	}
	for _, ids := range [][]string{editable, readable, shots, assets, media, models} {
		slices.Sort(ids)
	}
	var visit func(any)
	restrict := func(rule map[string]any, ids []string) {
		if len(ids) > 0 {
			rule["enum"] = ids
		}
	}
	visit = func(value any) {
		switch item := value.(type) {
		case map[string]any:
			if properties, ok := item["properties"].(map[string]any); ok {
				for key, value := range properties {
					rule, ok := value.(map[string]any)
					if !ok {
						continue
					}
					switch key {
					case "nodeId", "node_id", "target":
						restrict(rule, editable)
					case "source":
						restrict(rule, readable)
					case "shotId":
						restrict(rule, shots)
					case "modelMediaId":
						restrict(rule, models)
					case "assetIds", "reference_media_ids", "generateNodeIds":
						ids := assets
						if key == "reference_media_ids" {
							ids = media
						}
						if key == "generateNodeIds" {
							ids = generation
						}
						if len(ids) == 0 {
							rule["maxItems"] = 0
						} else if values, ok := rule["items"].(map[string]any); ok {
							restrict(values, ids)
						}
					}
				}
			}
			for _, nested := range item {
				visit(nested)
			}
		case []any:
			for _, nested := range item {
				visit(nested)
			}
		}
	}
	visit(schema)
	properties := schema["properties"].(map[string]any)
	items := properties["operations"].(map[string]any)["items"].(map[string]any)
	skillID := ""
	if len(skillIDs) > 0 {
		skillID = skillIDs[0]
	}
	request := prompt
	if index := strings.LastIndex(prompt, "\nRequest:\n"); index >= 0 {
		request = prompt[index+len("\nRequest:\n"):]
	}
	allowedOps := map[string][]string{"whitebox-film": {"set_previs"}, "scene-director": {"set_previs"}, "loop-graphic": {"set_motion_graphics"}, "beat-motion": {"set_motion_graphics"}, "digital-presenter": {"update_node"}, "depth-restyle": {"update_node"}, "workflow-skill": {}, "tool-connection": {}}
	choices := []any{}
	for _, raw := range items["anyOf"].([]any) {
		shape := raw.(map[string]any)
		fields := shape["properties"].(map[string]any)
		op := fields["op"].(map[string]any)["const"].(string)
		if (op == "update_shot" || op == "move_shot") && len(shots) == 0 {
			continue
		}
		if (fields["nodeId"] != nil || op == "connect") && len(editable) == 0 {
			continue
		}
		if allowed, scoped := allowedOps[skillID]; scoped && !slices.Contains(allowed, fields["op"].(map[string]any)["const"].(string)) {
			continue
		}
		if fields["op"].(map[string]any)["const"] != "select_take" {
			choices = append(choices, shape)
			continue
		}
		for _, node := range studioObjects(document, "nodes") {
			data, _ := node["data"].(map[string]any)
			if data["locked"] == true || data["assistantPlan"] == true || (len(scopes) > 0 && !scopes[fmt.Sprint(node["id"])]) {
				continue
			}
			takes := []string{}
			for _, take := range studioObjects(data, "takes") {
				if id, ok := take["id"].(string); ok && take["status"] == "completed" {
					takes = append(takes, id)
				}
			}
			if len(takes) == 0 {
				continue
			}
			slices.Sort(takes)
			encoded, err := common.Marshal(shape)
			if err != nil {
				return nil, err
			}
			var variant map[string]any
			if err := common.Unmarshal(encoded, &variant); err != nil {
				return nil, err
			}
			field := variant["properties"].(map[string]any)
			field["nodeId"].(map[string]any)["enum"] = []string{node["id"].(string)}
			field["takeId"].(map[string]any)["enum"] = takes
			choices = append(choices, variant)
		}
	}
	items["anyOf"] = choices
	if skillID == "scene-director" && len(models) > 0 {
		for _, raw := range choices {
			fields := raw.(map[string]any)["properties"].(map[string]any)
			scene := fields["scene"].(map[string]any)
			required, _ := scene["required"].([]any)
			scene["required"] = append(required, "advanced")
			advanced := scene["properties"].(map[string]any)["advanced"].(map[string]any)
			required, _ = advanced["required"].([]any)
			advanced["required"] = append(required, "models")
			advanced["properties"].(map[string]any)["models"].(map[string]any)["minItems"] = 1
		}
	}
	if len(choices) == 0 {
		properties["operations"].(map[string]any)["maxItems"] = 0
		items["anyOf"] = []any{map[string]any{"type": "object"}}
	}
	if len(scopes) > 0 && len(editable) <= 3 {
		properties["operations"].(map[string]any)["maxItems"] = 4
		properties["workflowActions"].(map[string]any)["maxItems"] = 3
	}
	if skillID == "loop-graphic" || skillID == "beat-motion" {
		properties["operations"].(map[string]any)["maxItems"] = 1
		production, _ := document["production"].(map[string]any)
		limit := min(50, len(studioObjects(production, "motionGraphics"))+3)
		for _, raw := range items["anyOf"].([]any) {
			fields := raw.(map[string]any)["properties"].(map[string]any)
			if graphics, ok := fields["items"].(map[string]any); ok {
				graphics["maxItems"] = limit
				base := graphics["items"].(map[string]any)
				variants := []any{}
				for _, kind := range []string{"text", "icon", "shape", "image"} {
					if len(studioObjects(production, "motionGraphics")) == 0 {
						if strings.Contains(request, "文字") && !strings.Contains(request, "圆形") && kind != "text" {
							continue
						}
						if strings.Contains(request, "圆形") && !strings.Contains(request, "文字") && kind != "shape" {
							continue
						}
					}
					if kind == "image" && len(images) == 0 {
						continue
					}
					encoded, err := common.Marshal(base)
					if err != nil {
						return nil, err
					}
					var variant map[string]any
					if err := common.Unmarshal(encoded, &variant); err != nil {
						return nil, err
					}
					graphicFields := variant["properties"].(map[string]any)
					graphicFields["kind"] = map[string]any{"type": "string", "const": kind}
					variant["required"] = append(variant["required"].([]any), "kind")
					if kind == "shape" || kind == "icon" {
						variant["required"] = append(variant["required"].([]any), kind)
					}
					if kind == "shape" && strings.Contains(request, "圆形") && len(studioObjects(production, "motionGraphics")) == 0 {
						graphicFields["shape"].(map[string]any)["const"] = "circle"
					}
					if strings.Contains(request, "脉冲") && len(studioObjects(production, "motionGraphics")) == 0 {
						graphicFields["animation"].(map[string]any)["const"] = "pulse"
					}
					if strings.Contains(request, "淡入") && len(studioObjects(production, "motionGraphics")) == 0 {
						graphicFields["animation"].(map[string]any)["const"] = "fade"
					}
					if kind == "image" {
						variant["required"] = append(variant["required"].([]any), "imageMediaId")
						graphicFields["imageMediaId"].(map[string]any)["enum"] = images
					} else {
						delete(graphicFields, "imageMediaId")
					}
					if kind != "shape" {
						graphicFields["animation"].(map[string]any)["enum"] = []string{"fade", "slide", "pulse", "bounce", "rotate"}
					}
					variants = append(variants, variant)
				}
				graphics["items"] = map[string]any{"oneOf": variants}
			}
		}
	}
	// An explicitly requested operation needs an executable proposal. This only
	// constrains the returned plan; generation still requires separate approval.
	durationMatches := regexp.MustCompile(`([0-9]+(?:\.[0-9]+)?|一|二|两|三|四|五|六|八|十)\s*(?:秒|seconds?)`).FindAllStringSubmatch(request, -1)
	requestedSeconds := float64(0)
	if len(durationMatches) > 0 {
		value := durationMatches[len(durationMatches)-1][1]
		requestedSeconds, _ = strconv.ParseFloat(value, 64)
		if requestedSeconds == 0 {
			requestedSeconds = map[string]float64{"一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "八": 8, "十": 10}[value]
		}
	}
	dimensions := regexp.MustCompile(`(\d+)\s*[x×]\s*(\d+)`).FindStringSubmatch(request)
	promptSkill := slices.Contains([]string{"video-prompt", "multimodal-shot", "cinematic-shot", "action-shot"}, skillID)
	generationIntent := strings.NewReplacer("不要生成", "", "不开始生成", "", "不执行生成", "", "不再次生成", "", "不进行生成", "", "不生成", "", "do not generate", "", "don't generate", "", "without generation", "", "no generation", "").Replace(strings.ToLower(request))
	executionRequested := strings.Contains(generationIntent, "生成") || strings.Contains(generationIntent, "generat")
	if promptSkill && len(editable) > 0 && !executionRequested && !strings.HasPrefix(strings.TrimSpace(request), "解释") && !strings.HasPrefix(strings.ToLower(strings.TrimSpace(request)), "explain") {
		updates := []any{}
		for _, raw := range items["anyOf"].([]any) {
			fields := raw.(map[string]any)["properties"].(map[string]any)
			if fields["op"].(map[string]any)["const"] == "update_node" {
				updates = append(updates, raw)
			}
		}
		items["anyOf"] = updates
		properties["operations"].(map[string]any)["minItems"] = 1
		properties["workflowActions"].(map[string]any)["maxItems"] = 0
		properties["generateNodeIds"].(map[string]any)["maxItems"] = 0
	}
	if skillID == "workflow-skill" {
		schema["required"] = append(schema["required"].([]any), "skillDraft")
		properties["workflowActions"].(map[string]any)["maxItems"] = 0
		properties["generateNodeIds"].(map[string]any)["maxItems"] = 0
	}
	if skillID == "tool-connection" {
		properties["workflowActions"].(map[string]any)["maxItems"] = 0
		properties["generateNodeIds"].(map[string]any)["maxItems"] = 0
		properties["summary"].(map[string]any)["enum"] = []string{
			"配置 MCP 客户端后，使用 studio_read_project 读取 projectId 和 revision，使用 studio_list_workflows 查找已提交任务，再用 studio_workflow_status 或 studio_wait_workflow 查询进度。恢复前检查不确定状态、保留 requestId，通过 studio_control_workflow 明确暂停、取消或恢复。模型生成需要确认和费用上限；查询与免费编辑不会启动模型。外部服务不是本地创作的前提。",
			"Configure the MCP client, then use studio_read_project with projectId and revision, studio_list_workflows to recover submitted jobs, and studio_workflow_status or studio_wait_workflow for progress. Inspect uncertainty and preserve requestId before using studio_control_workflow. Model generation requires confirmation and a hard budget. Queries and native edits do not start a model. External services are optional.",
		}
	}
	actions := []string{}
	for _, action := range []string{"previs_frame", "previs_animation", "previs_depth", "previs_whitebox", "graphics_frame", "graphics_animation", "lip_sync", "video_depth"} {
		if strings.Contains(request, action) {
			actions = append(actions, action)
		}
	}
	if len(actions) > 0 && len(editable) > 0 && !strings.HasPrefix(strings.TrimSpace(request), "解释") && !strings.HasPrefix(strings.ToLower(strings.TrimSpace(request)), "explain") {
		if (skillID == "loop-graphic" || skillID == "beat-motion") && len(studioObjects(production, "motionGraphics")) == 0 {
			properties["operations"].(map[string]any)["minItems"] = 1
			for _, raw := range items["anyOf"].([]any) {
				fields := raw.(map[string]any)["properties"].(map[string]any)
				fields["items"].(map[string]any)["minItems"] = 1
			}
		}
		taskList := properties["workflowActions"].(map[string]any)
		variants := []any{}
		for _, raw := range taskList["items"].(map[string]any)["oneOf"].([]any) {
			variant := raw.(map[string]any)
			fields := variant["properties"].(map[string]any)
			operation, ok := fields["operation"].(map[string]any)
			if !ok {
				continue
			}
			operationFields := operation["properties"].(map[string]any)
			kind := fields["kind"].(map[string]any)["const"]
			allowed := []string{}
			for _, action := range actions {
				if (kind == "previs" && strings.HasPrefix(action, "previs_")) || (kind == "graphics" && strings.HasPrefix(action, "graphics_")) || (kind == "media" && !strings.HasPrefix(action, "previs_") && !strings.HasPrefix(action, "graphics_")) {
					allowed = append(allowed, action)
				}
			}
			if len(allowed) == 0 {
				continue
			}
			operationFields["action"].(map[string]any)["enum"] = allowed
			if len(allowed) == 1 && requestedSeconds > 0 {
				action := allowed[0]
				if !strings.HasPrefix(action, "previs_") || action == "previs_animation" {
					operationFields["seconds"].(map[string]any)["const"] = requestedSeconds
					operation["required"] = append(operation["required"].([]any), "seconds")
				}
			}
			if len(dimensions) == 3 {
				width, _ := strconv.Atoi(dimensions[1])
				height, _ := strconv.Atoi(dimensions[2])
				if width >= 16 && width <= 4096 && height >= 16 && height <= 4096 {
					options := operationFields["options"].(map[string]any)
					optionsFields := options["properties"].(map[string]any)
					optionsFields["width"].(map[string]any)["const"] = width
					optionsFields["height"].(map[string]any)["const"] = height
					options["required"] = []any{"width", "height"}
					operation["required"] = append(operation["required"].([]any), "options")
				}
			}
			if kind == "media" && len(allowed) == 1 {
				operationFields["model"].(map[string]any)["enum"] = []string{"studio-" + strings.ReplaceAll(allowed[0], "_", "-")}
				if allowed[0] == "video_depth" && len(videos) > 0 {
					operation["required"] = append(operation["required"].([]any), "reference_media_ids")
					references := operationFields["reference_media_ids"].(map[string]any)
					references["minItems"] = 1
					references["items"].(map[string]any)["enum"] = videos
					operationFields["seconds"].(map[string]any)["minimum"] = float64(1)
					operationFields["seconds"].(map[string]any)["maximum"] = float64(30)
				}
			}
			variants = append(variants, variant)
		}
		taskList["minItems"] = 1
		taskList["items"].(map[string]any)["oneOf"] = variants
		properties["generateNodeIds"].(map[string]any)["maxItems"] = 0
	}
	// Ollama's grammar does not enforce numeric minimum/maximum keywords.
	// Offer valid presets and all explicit numbers from the request instead.
	values := []float64{-360, -180, -90, -45, -20, -10, -5, -2, -1, 0, .1, .2, .25, .3, .4, .5, .6, .7, .75, .8, .9, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 25, 30, 40, 45, 48, 50, 60, 80, 90, 100, 120, 128, 160, 180, 224, 240, 256, 300, 320, 384, 512, 640, 720, 768, 960, 1024, 1280, 1920, 2048, 4096, 8192}
	for _, raw := range regexp.MustCompile(`-?\d+(?:\.\d+)?`).FindAllString(request, -1) {
		if value, err := strconv.ParseFloat(raw, 64); err == nil {
			values = append(values, value)
		}
	}
	var numbers func(any)
	numbers = func(value any) {
		switch item := value.(type) {
		case map[string]any:
			if _, fixed := item["const"]; fixed {
				delete(item, "enum")
				return
			}
			if min, ok := item["minimum"].(float64); ok {
				if max, ok := item["maximum"].(float64); ok {
					bounded := []float64{}
					for _, candidate := range append(values, min, max) {
						if candidate >= min && candidate <= max && (item["type"] != "integer" || candidate == float64(int64(candidate))) {
							bounded = append(bounded, candidate)
						}
					}
					slices.Sort(bounded)
					item["enum"] = slices.Compact(bounded)
				}
			}
			for _, nested := range item {
				numbers(nested)
			}
		case []any:
			for _, nested := range item {
				numbers(nested)
			}
		}
	}
	numbers(schema)
	return map[string]any{"type": "json_schema", "json_schema": map[string]any{"name": "studio_production_plan", "strict": true, "schema": schema}}, nil
}
