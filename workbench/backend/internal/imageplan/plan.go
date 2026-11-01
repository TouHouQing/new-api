// Package imageplan validates visual layer proposals without executing them.
package imageplan

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"reflect"
	"strings"
	"unicode/utf8"
)

type Size struct {
	Width  int `json:"width"`
	Height int `json:"height"`
}

type Generation struct {
	Prompt     string `json:"prompt"`
	Background string `json:"background"`
}

type Region struct {
	BBox        []float64 `json:"bbox"`
	Shape       string    `json:"shape"`
	RadiusRatio *float64  `json:"radiusRatio,omitempty"`
}

type Extraction struct {
	Method string  `json:"method"`
	Region *Region `json:"region,omitempty"`
}

type Layer struct {
	Name                 string      `json:"name"`
	Description          string      `json:"description"`
	Kind                 string      `json:"kind"`
	Generation           Generation  `json:"generation"`
	EditUnit             string      `json:"editUnit,omitempty"`
	RemoveFromBackground bool        `json:"removeFromBackground,omitempty"`
	BBox                 []float64   `json:"bbox,omitempty"`
	Extraction           *Extraction `json:"extraction,omitempty"`
}

type Reasoning struct {
	Structure   string `json:"structure"`
	EditingGoal string `json:"editingGoal"`
	Strategy    string `json:"strategy"`
}

type Plan struct {
	Layout    string     `json:"layout,omitempty"`
	Layers    []Layer    `json:"layers"`
	Reasoning *Reasoning `json:"reasoning,omitempty"`
	Warnings  []string   `json:"warnings,omitempty"`
}

func text(value any, limit int, singleLine bool) (string, bool) {
	s, ok := value.(string)
	s = strings.TrimSpace(s)
	return s, ok && s != "" && utf8.ValidString(s) && utf8.RuneCountInString(s) <= limit && (!singleLine || !strings.ContainsAny(s, "\r\n"))
}

func member(value string, values ...string) bool {
	for _, v := range values {
		if value == v {
			return true
		}
	}
	return false
}

func box(value any, space string, declared *Size, reference Size) []float64 {
	values, ok := value.([]any)
	if !ok || len(values) != 4 || declared != nil && *declared != reference || !member(space, "pixels", "normalized1000") {
		return nil
	}
	result := make([]float64, 4)
	for i, v := range values {
		n, ok := v.(float64)
		if !ok || math.IsNaN(n) || math.IsInf(n, 0) {
			return nil
		}
		if space == "pixels" {
			if i%2 == 0 {
				n *= 1000 / float64(reference.Width)
			} else {
				n *= 1000 / float64(reference.Height)
			}
		}
		if n < 0 || n > 1000 {
			return nil
		}
		result[i] = math.Round(n)
	}
	if result[2]-result[0] < 2 || result[3]-result[1] < 2 {
		return nil
	}
	return result
}

// Invalid optional coordinates remain an explicit manual selection, never an
// instruction to replace original-pixel extraction with another model call.
func Parse(raw string, reference Size, purpose string) (Plan, error) {
	var result Plan
	if !utf8.ValidString(raw) || len(raw) > 128000 || utf8.RuneCountInString(raw) > 32000 || reference.Width <= 0 || reference.Height <= 0 || !member(purpose, "materials", "recompose") {
		return result, errors.New("识图规划内容、原图尺寸或目的无效")
	}
	raw = strings.TrimSpace(raw)
	if strings.HasPrefix(raw, "```") {
		raw = raw[3:]
		if strings.HasPrefix(strings.ToLower(raw), "json") {
			raw = raw[4:]
		}
		raw = strings.TrimSpace(raw)
		raw = strings.TrimSuffix(raw, "```")
	}
	var root map[string]any
	if json.Unmarshal([]byte(raw), &root) != nil {
		return result, errors.New("识图规划没有返回有效JSON，未提交拆层任务")
	}
	if root["canPlan"] != true {
		reason, _ := text(root["reason"], 300, true)
		return result, fmt.Errorf("模型未形成可用的识图规划：%s", reason)
	}
	items, ok := root["layers"].([]any)
	if !ok || len(items) < 2 || len(items) > 8 {
		return result, errors.New("识图规划必须包含2至8层")
	}
	space, _ := root["coordinateSpace"].(string)
	if space == "" {
		space = "normalized1000"
	}
	var declared *Size
	if value, exists := root["imageSize"]; exists {
		encoded, _ := json.Marshal(value)
		declared = &Size{}
		if json.Unmarshal(encoded, declared) != nil {
			declared = &Size{}
		}
	}
	names := map[string]bool{}
	for index, item := range items {
		value, ok := item.(map[string]any)
		if !ok {
			return Plan{}, errors.New("图层内容无效")
		}
		name, validName := text(value["name"], 80, true)
		description, validDescription := text(value["description"], 1200, true)
		if !validName || !validDescription || names[name] {
			return Plan{}, errors.New("图层名称、描述无效或存在重复名称")
		}
		names[name] = true
		layer := Layer{Name: name, Description: description, Kind: "object"}
		background := "transparent"
		if index == 0 {
			layer.Kind = "background"
			background = "opaque"
		}
		if value["kind"] != layer.Kind {
			return Plan{}, errors.New("首层必须为背景，其余层必须为对象")
		}
		generation, ok := value["generation"].(map[string]any)
		prompt, validPrompt := text(generation["prompt"], 2400, false)
		if !ok || !validPrompt || generation["background"] != background || len(generation) != 2 {
			return Plan{}, fmt.Errorf("第%d层的独立提示词或透明度参数无效", index+1)
		}
		layer.Generation = Generation{Prompt: prompt, Background: background}
		if v, exists := value["removeFromBackground"]; exists {
			if _, ok := v.(bool); !ok {
				return Plan{}, errors.New("图层背景移除选项无效")
			}
		}
		extraction, hasExtraction := value["extraction"].(map[string]any)
		bbox, hasBox := value["bbox"]
		nested, hasNested := extraction["bbox"]
		if hasBox && hasNested && !reflect.DeepEqual(bbox, nested) {
			result.Warnings = append(result.Warnings, name+"的区域坐标冲突，请人工框选")
		} else {
			if !hasBox {
				bbox = nested
			}
			layer.BBox = box(bbox, space, declared, reference)
			if (hasBox || hasNested) && layer.BBox == nil {
				result.Warnings = append(result.Warnings, name+"的坐标或单位无效，保留描述并等待人工框选")
			}
		}
		unit, _ := value["editUnit"].(string)
		if member(unit, "scene", "object", "text", "decoration", "group") {
			layer.EditUnit = unit
		}
		if _, exists := value["extraction"]; exists && !hasExtraction {
			return Plan{}, errors.New("图层提取方式无效")
		}
		if hasExtraction {
			method, _ := extraction["method"].(string)
			if method != "generate" && !(method == "source" && index == 0) && !(method == "source-region" && index > 0) {
				return Plan{}, errors.New("图层提取方式与角色不一致")
			}
			layer.Extraction = &Extraction{Method: method}
			if method == "source-region" {
				shape, _ := extraction["shape"].(string)
				if !member(shape, "rect", "rounded-rect", "ellipse") {
					return Plan{}, errors.New("原图提取形状无效")
				}
				var radius *float64
				if shape == "rounded-rect" {
					v, ok := extraction["radiusRatio"].(float64)
					if !ok || v < 0 || v > .5 {
						return Plan{}, errors.New("原图区域圆角无效")
					}
					radius = &v
				}
				if layer.BBox != nil {
					layer.Extraction.Region = &Region{BBox: layer.BBox, Shape: shape, RadiusRatio: radius}
				} else {
					result.Warnings = append(result.Warnings, name+"需要人工框选；不会自动改成模型生成")
				}
			}
		}
		result.Layers = append(result.Layers, layer)
	}
	layout, _ := root["layout"].(string)
	if member(layout, "continuous", "composition", "mixed") {
		result.Layout = layout
	}
	if value, ok := root["reasoning"].(map[string]any); ok {
		a, va := text(value["structure"], 400, false)
		b, vb := text(value["editingGoal"], 400, false)
		c, vc := text(value["strategy"], 400, false)
		if va && vb && vc {
			result.Reasoning = &Reasoning{Structure: a, EditingGoal: b, Strategy: c}
		}
	}
	eligible := result.Layers[:0]
	for i, layer := range result.Layers {
		if i > 0 && result.Layout == "continuous" && (layer.EditUnit == "scene" || layer.Extraction != nil && layer.Extraction.Method == "source-region") {
			result.Warnings = append(result.Warnings, layer.Name+"是连续场景局部，未自动裁成独立素材")
			continue
		}
		if i == 0 {
			if purpose == "materials" {
				layer.Name = "原图底板"
				layer.Description = "保留完整原图，素材另存副本"
				layer.Extraction = &Extraction{Method: "source"}
			} else {
				layer.Name = "背景底图"
				layer.Extraction = &Extraction{Method: "generate"}
			}
		} else {
			layer.RemoveFromBackground = purpose == "recompose"
			if layer.EditUnit == "scene" && (layer.Extraction == nil || layer.Extraction.Method != "source-region") {
				layer.Extraction = &Extraction{Method: "source-region"}
				result.Warnings = append(result.Warnings, layer.Name+"须先框选完整场景，保留原像素")
			}
		}
		eligible = append(eligible, layer)
	}
	result.Layers = eligible
	if len(result.Layers) < 2 {
		return Plan{}, errors.New("未识别到可独立提取的素材，请人工配置或重新规划")
	}
	return result, nil
}
