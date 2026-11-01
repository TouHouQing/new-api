package app

import (
	"encoding/json"
	"fmt"
	"html"
	"strings"
	"unicode/utf8"

	"yingce/backend/internal/canvas"
	"yingce/backend/internal/model"
)

// A creation recipe, not a second project store. All resulting objects belong
// to the ordinary native project, unit, shot, canvas and resource services.
type ProjectStarterRequest struct {
	Entry      string `json:"entry"`
	PresetKey  string `json:"presetKey,omitempty"`
	SourceText string `json:"sourceText,omitempty"`
	ResourceID string `json:"resourceId,omitempty"`
}

type ProjectStarterPreset struct {
	Key         string   `json:"key"`
	Goal        string   `json:"goal"`
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Steps       []string `json:"steps"`
}

func ProjectStarterPresets() []ProjectStarterPreset {
	return []ProjectStarterPreset{
		{"story-v1", "story", "故事 / 短剧", "开场建立悬念，行动推动故事，结尾回应开场。", []string{"建立人物与环境", "推动行动与冲突", "回应与收束"}},
		{"product-v1", "product", "商品 / 广告", "先说明使用问题，再呈现真实卖点与使用结果。", []string{"呈现使用问题", "展示商品与关键细节", "演示实际使用", "总结卖点与引导"}},
		{"explain-v1", "explain", "知识 / 讲解", "一个问题、一段解释、一组例子，帮助观众理解。", []string{"提出核心问题", "解释关键概念", "呈现具体例子", "回顾重点"}},
		{"presenter-v1", "presenter", "口播", "用清楚的开头、简短要点和配套画面传达信息。", []string{"开场说明主题", "讲述关键要点", "补充例子与画面", "总结与引导"}},
		{"music-v1", "music", "音乐 / MV", "围绕歌曲情绪安排画面，剪辑时采用实际歌词和节拍。", []string{"建立音乐情绪", "发展画面与动作", "情绪高潮", "结束与余韵"}},
		{"custom-v1", "custom", "自定义", "保留自由结构，先安排开场、主体与结尾，再细化镜头。", []string{"开场画面", "主体内容", "结束画面"}},
	}
}

func (s *Service) ProjectStarterPresets() []ProjectStarterPreset { return ProjectStarterPresets() }

func normalizeProjectStarter(input *ProjectStarterRequest, brief *model.ProjectCreativeBrief) (*ProjectStarterRequest, error) {
	if input == nil {
		return nil, nil
	}
	copy := *input
	copy.Entry, copy.PresetKey, copy.SourceText, copy.ResourceID = strings.TrimSpace(copy.Entry), strings.TrimSpace(copy.PresetKey), strings.TrimSpace(copy.SourceText), strings.TrimSpace(copy.ResourceID)
	if brief == nil {
		return nil, BadAuthRequest("请先选择作品类型并保存创作需求")
	}
	if copy.Entry != "idea" && copy.Entry != "upload" && copy.Entry != "template" {
		return nil, BadAuthRequest("请选择需求、上传素材或模板作为创作起点")
	}
	if utf8.RuneCountInString(copy.SourceText) > 100000 || len(copy.ResourceID) > 80 {
		return nil, BadAuthRequest("初始脚本或素材编号超出范围")
	}
	if copy.Entry == "upload" {
		if (copy.SourceText == "") == (copy.ResourceID == "") || copy.PresetKey != "" {
			return nil, BadAuthRequest("请上传一份脚本或一项已保存素材")
		}
	} else if copy.ResourceID != "" {
		return nil, BadAuthRequest("素材须从上传入口采用")
	}
	if copy.Entry == "template" {
		found := false
		for _, preset := range ProjectStarterPresets() {
			if preset.Key == copy.PresetKey && preset.Goal == brief.Goal {
				found = true
			}
		}
		if !found {
			return nil, BadAuthRequest("请选择当前作品类型的明确模板版本")
		}
	} else if copy.PresetKey != "" {
		return nil, BadAuthRequest("仅模板入口可以指定模板")
	}
	if (copy.Entry == "idea" || copy.Entry == "template") && strings.TrimSpace(brief.KeyMessage) == "" && copy.SourceText == "" {
		return nil, BadAuthRequest("请写下想传达的内容")
	}
	return &copy, nil
}

func (s *Service) applyProjectStarter(owner string, project *model.Project, starter *ProjectStarterRequest) error {
	if starter == nil {
		return nil
	}
	var brief model.ProjectCreativeBrief
	if json.Unmarshal([]byte(project.CreativeBriefJSON), &brief) != nil {
		return BadAuthRequest("创作需求无法读取")
	}
	source := starter.SourceText
	if source == "" {
		source = brief.KeyMessage
	}
	// Text from an idea/file is content, not executable markup.
	paragraphs := []string{}
	for _, line := range strings.Split(strings.ReplaceAll(source, "\r\n", "\n"), "\n") {
		paragraphs = append(paragraphs, "<p>"+html.EscapeString(line)+"</p>")
	}
	if starter.Entry == "template" {
		for _, preset := range ProjectStarterPresets() {
			if preset.Key == starter.PresetKey {
				paragraphs = append(paragraphs, "<p>创作结构："+html.EscapeString(strings.Join(preset.Steps, " → "))+"</p>")
			}
		}
	}
	unit, err := s.CreateProjectUnit(owner, project.ID, CreateProjectUnitRequest{Kind: "chapter", Title: "创作脚本", SourceText: strings.Join(paragraphs, "")})
	if err != nil {
		return err
	}
	if _, err := s.CreateUnitWorkflow(owner, project.ID, unit.ID); err != nil {
		return err
	}
	if starter.Entry == "template" {
		for _, preset := range ProjectStarterPresets() {
			if preset.Key != starter.PresetKey {
				continue
			}
			duration := brief.TargetDurationMs
			if duration == 0 {
				duration = 15000
			}
			for index, title := range preset.Steps {
				length := duration / int64(len(preset.Steps))
				if index == len(preset.Steps)-1 {
					length = duration - length*int64(index)
				}
				plot := title + "。创作需求：" + source
				if len(plot) > 24000 {
					plot = truncateRunes(plot, 4000)
				}
				_, err := s.CreateProjectShot(owner, project.ID, CreateProjectShotRequest{UnitID: unit.ID, Title: fmt.Sprintf("%d. %s", index+1, title), Position: index, DurationMs: length, Status: "draft", Revision: ShotRevisionInput{PlotDescription: plot, ImagePrompt: plot, VideoPrompt: plot, ContinuityNotes: "请核对人物、商品、服装与道具状态；模板仅为可编辑草案。"}})
				if err != nil {
					return err
				}
			}
		}
	}
	if starter.ResourceID != "" {
		resource, err := s.repo.ResourceForUser(owner, starter.ResourceID)
		if err != nil {
			return NotFound("上传素材不存在或无权访问")
		}
		if resource.Status != model.ResourceStatusReady || (resource.Kind != "image" && resource.Kind != "video" && resource.Kind != "audio") {
			return BadAuthRequest("请选择已完整上传的图片、视频或声音")
		}
		id := "starter_" + resourceAdoptionID(project.ID, "source-canvas")
		_, err = s.canvasDomain().ApplyUserCanvasOperations(owner, id, canvas.CanvasOperationsRequest{MutationID: "starter-create:" + project.ID, Operations: []canvas.CanvasOperation{{Type: "create_canvas", ID: id, Patch: map[string]json.RawMessage{"title": json.RawMessage(`"创作素材"`), "projectId": json.RawMessage(`"` + project.ID + `"`)}}}})
		if err != nil {
			return err
		}
		if _, err = s.AdoptResource(owner, id, ResourceAdoptionRequest{ResourceID: resource.ID, RequestID: "starter-resource:" + project.ID, Title: "上传的创作素材", X: 100, Y: 100}); err != nil {
			return err
		}
	}
	return nil
}
