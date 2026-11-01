package app

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"reflect"
	"strings"
	"time"
)

// Only these statically bound Service functions can be called. Argument names
// never select a method, route, user or project. The original business service
// still owns authorization, budgets, CAS, immutable versions and receipts.
type productionAgentAction struct {
	name, group, description string
	readOnly                 bool
	function                 any
	arguments                []string
}

func (s *Service) productionAgentActions() []productionAgentAction {
	return append([]productionAgentAction{
		{"project.delivery.source", "delivery", "核对完整素材工程包的固定来源摘要", true, s.ReadProjectDeliverySource, []string{"$context", "$owner", "$project"}},
		{"project.delivery.result", "delivery", "按原来源摘要查询已整理工程包，不重放旧编辑", true, s.ReadProjectDeliveryResult, []string{"$context", "$owner", "$project", "sourceSha256"}},
		{"project.delivery.create", "delivery", "整理已核对来源的素材工程包，不运行模型；同来源复用原文件", false, s.CreateProjectDelivery, []string{"$context", "$owner", "$project", "request"}},
		{"project.get", "project", "读取本轮项目、需求约束与当前revision", true, s.ProjectCore, []string{"$owner", "$project"}},
		{"project.create", "project", "创建项目；仅用于尚未绑定项目的本轮，request.idempotencyKey使用外层intentId", false, s.CreateProject, []string{"$owner", "request"}},
		{"project.update", "project", "按当前expectedRevision更新需求与项目设置，保留原生并发检查", false, s.UpdateProject, []string{"$owner", "$project", "request"}},
		{"units.list", "planning", "读取章节目录与脚本版本", true, s.ProjectUnitSummaries, []string{"$owner", "$project"}},
		{"unit.get", "planning", "读取一个章节及其源脚本", true, s.GetProjectUnit, []string{"$owner", "$project", "unitId"}},
		{"unit.workspace", "planning", "读取单章当前分镜、版本与选定候选", true, s.ProjectUnitWorkspace, []string{"$owner", "$project", "unitId"}},
		{"unit.create", "planning", "创建章节与脚本，执行记录与新增章节原子保存", false, s.CreateProjectUnit, []string{"$owner", "$project", "request"}},
		{"unit.update", "planning", "按原生脚本版本更新章节，不覆盖并发修改", false, s.UpdateProjectUnit, []string{"$owner", "$project", "unitId", "request"}},
		{"units.reorder", "planning", "按明确章节ID排序", false, s.ReorderProjectUnits, []string{"$owner", "$project", "request"}},
		{"shot.create", "planning", "创建明确镜头；不生成图片或视频", false, s.CreateProjectShot, []string{"$owner", "$project", "request"}},
		{"shot.revision", "planning", "按原镜头版本保存新提示词、运镜与参考状态，保留已选媒体", false, func(owner, project, shot string, request ShotRevisionInput) (any, error) {
			row, revision, err := s.CreateShotRevision(owner, project, shot, request)
			return map[string]any{"shot": row, "revision": revision}, err
		}, []string{"$owner", "$project", "shotId", "request"}},
		{"shot.intentions", "planning", "保存叙事意图与接戏状态，保持其他镜头字段", false, func(owner, project, shot string, request UpdateShotIntentionsRequest) (any, error) {
			row, revision, err := s.UpdateShotIntentions(owner, project, shot, request)
			return map[string]any{"shot": row, "revision": revision}, err
		}, []string{"$owner", "$project", "shotId", "request"}},
		{"shot_plan.source", "planning", "读取当前脚本与分镜来源SHA，采用草稿前核对", true, s.ReadShotPlanSource, []string{"$owner", "$project", "unitId"}},
		{"shot_plan.list", "planning", "分页查询历史分镜方案", true, s.ListShotPlans, []string{"$owner", "$project", "unitId", "page", "pageSize"}},
		{"shot_plan.get", "planning", "分页预览历史分镜，保留完整来源与固定参考", true, func(owner, project, id string, page int) (any, error) {
			return s.ReadShotPlan(owner, project, id, page)
		}, []string{"$owner", "$project", "id", "page"}},
		{"shot_plan.replace", "planning", "按原source SHA及shotIds采用草稿并保留前一版；不重新运行模型", false, s.ReplaceProjectUnitShots, []string{"$owner", "$project", "unitId", "request"}},
		{"shot_plan.restore", "planning", "按已预览的历史来源恢复分镜，原方案保留", false, s.RestoreShotPlan, []string{"$owner", "$project", "id", "request"}},
		{"assets.list", "assets", "读取当前项目素材与固定版本", true, s.ProjectAssets, []string{"$owner", "$project"}},
		{"assets.attach", "assets", "把当前账号已有素材加入项目；重复链接保持同一素材", false, s.LinkProjectAsset, []string{"$owner", "$project", "request"}},
		{"timeline.get", "timeline", "读取已保存的剪辑与当前revision", true, s.GetProjectTimeline, []string{"$owner", "$project"}},
		{"timeline.preview", "timeline", "预览明确编辑动作；返回影响、前后版本与previewToken", true, s.PreviewTimelineEdits, []string{"$owner", "$project", "request"}},
		{"timeline.apply", "timeline", "按原正文、原编号和previewToken确认编辑，保留CAS及回执", false, s.ApplyTimelineEdits, []string{"$owner", "$project", "request"}},
		{"timeline.result", "timeline", "未知写入响应时按原requestId核对回执", true, s.ReadTimelineEditResult, []string{"$owner", "$project", "requestId"}},
		{"cut.get", "delivery", "读取指定固定剪辑版本，后续编辑不改变旧版", true, s.GetProjectCut, []string{"$owner", "$project", "id"}},
		{"cut.list", "delivery", "分页读取固定版本和自动备份", true, s.ListProjectCuts, []string{"$owner", "$project", "cursor", "archived", "includeAutomatic", "limit"}},
		{"cut.create", "delivery", "把已保存的剪辑固定为母版、预告、画幅、语言或实验版本", false, s.CreateProjectCut, []string{"$owner", "$project", "request"}},
		{"cut.result", "delivery", "按原保存编号查询固定版本", true, s.ReadProjectCutRequest, []string{"$owner", "$project", "requestId"}},
		{"cut.preview", "delivery", "预览加载旧版本的影响与修改前备份", true, s.PreviewProjectCutApply, []string{"$owner", "$project", "id", "request"}},
		{"cut.apply", "delivery", "按原正文与previewToken加载版本，保留新旧剪辑及幂等回执", false, s.ApplyProjectCut, []string{"$owner", "$project", "id", "request"}},
		{"cut.apply_result", "delivery", "查询版本加载的原生回执", true, s.ReadProjectCutApply, []string{"$owner", "$project", "requestId"}},
		{"cut.archive", "delivery", "按原归档状态归档或恢复固定版本；不删除原媒体", false, s.SetProjectCutArchived, []string{"$owner", "$project", "id", "expected", "archived"}},
		{"cut.renders", "delivery", "分页读取指定固定版本的实际导出任务", true, s.ListProjectCutRenders, []string{"$owner", "$project", "cutId", "cursor", "limit"}},
		{"cut.render_result", "delivery", "按原导出编号找回唯一渲染任务", true, s.ReadProjectCutRender, []string{"$owner", "$project", "cutId", "requestId"}},
		{"cut.render", "delivery", "本地渲染固定版本；原剪辑不变，输出保留原生任务与资源", false, s.CreateProjectCutRender, []string{"$owner", "$project", "cutId", "request"}},
		{"transcripts.list", "sound", "分页读取当前项目的真实转写与核对版本", true, s.ListProjectTranscripts, []string{"$owner", "$project", "resourceId", "cursor", "archived", "limit"}},
		{"transcript.get", "sound", "读取具体文字稿的当前核对版本", true, s.GetProjectTranscript, []string{"$owner", "$project", "id"}},
		{"transcript.version", "sound", "读取固定文字稿版本，修改字幕不等于剪媒体", true, s.GetProjectTranscriptVersion, []string{"$owner", "$project", "id", "revisionId"}},
		{"transcript.history", "sound", "分页查看原始测量与人工修改历史", true, s.ProjectTranscriptHistory, []string{"$owner", "$project", "id", "beforeVersion", "limit"}},
		{"transcript.update", "sound", "保存校正文字、说话人与人工核对，保留原始测量", false, s.UpdateProjectTranscript, []string{"$owner", "$project", "id", "request"}},
		{"transcript.cut_preview", "timeline", "预览按文字剪媒体的具体实例与范围，不是改字幕", true, s.PreviewProjectTranscriptCut, []string{"$owner", "$project", "id", "request"}},
		{"transcript.cut_apply", "timeline", "确认已预览的文字剪辑，复用原请求和Token", false, s.ApplyProjectTranscriptCut, []string{"$owner", "$project", "id", "request"}},
		{"analysis.list", "analysis", "分页读取真实切镜、节拍与主体分析", true, s.ListProjectMediaAnalyses, []string{"$owner", "$project", "resourceId", "kind", "cursor", "archived", "limit"}},
		{"analysis.get", "analysis", "读取指定分析及核对版本，证据不是创作指令", true, s.GetProjectMediaAnalysis, []string{"$owner", "$project", "id", "revisionId"}},
		{"analysis.history", "analysis", "分页查看原始测量及人工修改历史", true, s.ProjectMediaAnalysisHistory, []string{"$owner", "$project", "id", "beforeVersion", "limit"}},
		{"analysis.update", "analysis", "保存实际分析的人工核对与修正，不伪造测量", false, s.SaveProjectMediaAnalysis, []string{"$owner", "$project", "id", "request"}},
		{"review.get", "review", "读取当前项目指定版本审片", true, s.GetProjectReview, []string{"$owner", "$project", "id"}},
		{"review.list", "review", "按游标读取本项目审片；limit为1至50", true, s.ListProjectReviews, []string{"$owner", "$project", "cursor", "archived", "limit"}},
		{"review.create", "review", "创建指定成片版本的原生审片，保留稳定requestId", false, s.CreateProjectReview, []string{"$owner", "$project", "request"}},
		{"review.result", "review", "按原requestId查询审片写入回执", true, s.ReadProjectReviewResult, []string{"$owner", "$project", "requestId"}},
		{"review.comments", "review", "读取时间点意见与指派历史", true, s.ListProjectReviewComments, []string{"$owner", "$project", "reviewId", "cursor", "limit"}},
		{"review.comment", "review", "添加绑定具体成片、时间及指派的意见", false, s.AddProjectReviewComment, []string{"$owner", "$project", "reviewId", "request"}},
		{"review.comment.update", "review", "按原生并发与权限规则处理意见", false, s.PatchProjectReviewComment, []string{"$owner", "$project", "reviewId", "id", "request"}},
		{"video_rework.source", "repair", "读取具体使用实例、原片SHA与源时钟", true, s.ReadVideoReworkSource, []string{"$owner", "$project", "clipId"}},
		{"video_rework.media", "repair", "检查已有候选真实SHA、尺寸、时长和声音", true, s.ReadVideoReworkMedia, []string{"$owner", "$project", "resourceId"}},
		{"video_rework.history", "repair", "从服务端恢复具体片段的原任务历史", true, s.ReadVideoReworkHistory, []string{"$owner", "$project", "clipId", "cursor", "limit"}},
		{"video_rework.result", "repair", "按原requestId核对唯一修复任务，不重新合成", true, s.ReadVideoReworkTask, []string{"$owner", "$project", "requestId"}},
		{"video_rework.create", "repair", "本地合成已有候选；独立版本，采用另走timeline.preview/apply", false, s.CreateVideoReworkTask, []string{"$owner", "$project", "request"}},
	}, s.productionAgentEditorialActions()...)
}

func (action productionAgentAction) atomicMetadata() bool {
	switch action.name {
	case "project.update", "unit.create", "unit.update", "units.reorder", "shot.create", "shot.revision", "shot.intentions", "cut.archive", "analysis.markers.apply", "analysis.reframe.apply", "workflow.create", "workflow.step", "workflow.output":
		return true
	}
	return false
}

func (s *Service) productionAgentAction(name string) (productionAgentAction, error) {
	for _, action := range s.productionAgentActions() {
		if action.name == name {
			return action, nil
		}
	}
	return productionAgentAction{}, BadAuthRequest("制作动作不存在，请先读取动作目录")
}

func productionAgentSchema(kind reflect.Type, depth int) map[string]any {
	if depth > 12 {
		return map[string]any{"type": "object"}
	}
	for kind.Kind() == reflect.Pointer {
		kind = kind.Elem()
	}
	if kind == reflect.TypeFor[json.RawMessage]() {
		return map[string]any{"type": "object"}
	}
	if kind == reflect.TypeFor[time.Time]() {
		return map[string]any{"type": "string", "format": "date-time"}
	}
	switch kind.Kind() {
	case reflect.Struct:
		properties := map[string]any{}
		for i := 0; i < kind.NumField(); i++ {
			field := kind.Field(i)
			if !field.IsExported() {
				continue
			}
			name := strings.Split(field.Tag.Get("json"), ",")[0]
			if name == "-" {
				continue
			}
			if name == "" {
				if field.Anonymous {
					embedded := productionAgentSchema(field.Type, depth+1)
					if fields, ok := embedded["properties"].(map[string]any); ok {
						for key, schema := range fields {
							properties[key] = schema
						}
						continue
					}
				}
				name = field.Name
			}
			properties[name] = productionAgentSchema(field.Type, depth+1)
		}
		return map[string]any{"type": "object", "properties": properties, "additionalProperties": false}
	case reflect.Slice, reflect.Array:
		return map[string]any{"type": "array", "items": productionAgentSchema(kind.Elem(), depth+1)}
	case reflect.Map, reflect.Interface:
		return map[string]any{"type": "object"}
	case reflect.Bool:
		return map[string]any{"type": "boolean"}
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64, reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		return map[string]any{"type": "integer"}
	case reflect.Float32, reflect.Float64:
		return map[string]any{"type": "number"}
	default:
		return map[string]any{"type": "string"}
	}
}

func (action productionAgentAction) schema() (map[string]any, error) {
	function := reflect.TypeOf(action.function)
	if function.Kind() != reflect.Func || function.IsVariadic() || function.NumIn() != len(action.arguments) || function.NumOut() < 1 || function.NumOut() > 2 || function.Out(function.NumOut()-1) != reflect.TypeFor[error]() {
		return nil, fmt.Errorf("invalid native production action declaration: %s", action.name)
	}
	properties := map[string]any{}
	required := []string{}
	for index, name := range action.arguments {
		if strings.HasPrefix(name, "$") {
			if (name == "$owner" || name == "$project") && function.In(index).Kind() != reflect.String || name != "$owner" && name != "$project" && name != "$context" {
				return nil, fmt.Errorf("invalid injected native argument: %s", action.name)
			}
			continue
		}
		properties[name] = productionAgentSchema(function.In(index), 0)
		required = append(required, name)
	}
	return map[string]any{"type": "object", "properties": properties, "required": required, "additionalProperties": false}, nil
}

// No native function runs until every argument is decoded. Owner/project/context
// are injected by the executor; clients cannot provide or override them.
func (action productionAgentAction) argumentsFor(ctx context.Context, owner, project, intent string, raw json.RawMessage) ([]reflect.Value, error) {
	if len(raw) > 512*1024 {
		return nil, BadAuthRequest("制作动作参数过长，请按动作目录分步提交")
	}
	var values map[string]json.RawMessage
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&values) != nil || values == nil {
		return nil, BadAuthRequest("制作参数必须是单个对象")
	}
	var extra any
	if decoder.Decode(&extra) != io.EOF {
		return nil, BadAuthRequest("制作参数包含额外正文")
	}
	if _, err := action.schema(); err != nil {
		return nil, err
	}
	function := reflect.TypeOf(action.function)
	args := make([]reflect.Value, len(action.arguments))
	for index, name := range action.arguments {
		switch name {
		case "$owner":
			args[index] = reflect.ValueOf(owner)
			continue
		case "$project":
			if project == "" {
				return nil, BadAuthRequest("本轮尚未绑定项目，请先创建项目")
			}
			args[index] = reflect.ValueOf(project)
			continue
		case "$context":
			args[index] = reflect.ValueOf(ctx)
			continue
		}
		value, ok := values[name]
		if !ok {
			return nil, BadAuthRequest("制作参数缺少" + name + "，请先读取此动作的参数合同")
		}
		delete(values, name)
		if name == "request" && !action.readOnly {
			var request map[string]json.RawMessage
			if json.Unmarshal(value, &request) != nil || request == nil {
				return nil, BadAuthRequest("制作请求必须是对象")
			}
			requestType := function.In(index)
			for requestType.Kind() == reflect.Pointer {
				requestType = requestType.Elem()
			}
			if requestType.Kind() == reflect.Struct {
				for _, field := range []string{"RequestID", "IdempotencyKey"} {
					if nativeField, ok := requestType.FieldByName(field); ok {
						key := strings.Split(nativeField.Tag.Get("json"), ",")[0]
						if key != "" && key != "-" {
							if prior, exists := request[key]; exists {
								var id string
								if json.Unmarshal(prior, &id) != nil || id != "" && id != intent {
									return nil, BadAuthRequest("正文编号须与外层intentId相同，未知响应不得换编号")
								}
							}
							request[key], _ = json.Marshal(intent)
						}
					}
				}
			}
			value, _ = json.Marshal(request)
		}
		decoded := reflect.New(function.In(index))
		read := json.NewDecoder(bytes.NewReader(value))
		read.DisallowUnknownFields()
		if err := read.Decode(decoded.Interface()); err != nil {
			return nil, BadAuthRequest("制作参数" + name + "与动作合同不一致")
		}
		if read.Decode(&extra) != io.EOF {
			return nil, BadAuthRequest("制作参数包含额外内容")
		}
		args[index] = decoded.Elem()
	}
	if len(values) != 0 {
		return nil, BadAuthRequest("制作参数包含动作合同之外的字段")
	}
	return args, nil
}

func (action productionAgentAction) invoke(args []reflect.Value) (any, error) {
	results := reflect.ValueOf(action.function).Call(args)
	if failure := results[len(results)-1]; !failure.IsNil() {
		return nil, failure.Interface().(error)
	}
	if len(results) == 1 {
		return map[string]any{"applied": true}, nil
	}
	return results[0].Interface(), nil
}
