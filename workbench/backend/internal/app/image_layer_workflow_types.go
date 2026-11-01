package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"yingce/backend/internal/imageops"
	"yingce/backend/internal/model"
)

const imageLayerWorkflowOperation = "layer-workflow"

type ImageLayerWorkflowModel struct {
	LogicalModelID string `json:"logicalModelId,omitempty"`
	Model          string `json:"model,omitempty"`
	Prompt         string `json:"prompt"`
	Size           string `json:"size,omitempty"`
	Quality        string `json:"quality,omitempty"`
}
type ImageLayerWorkflowLayer struct {
	Name       string                   `json:"name"`
	Method     string                   `json:"method"`
	Region     *imageops.Region         `json:"region,omitempty"`
	Generation *ImageLayerWorkflowModel `json:"generation,omitempty"`
	Removal    *ImageLayerWorkflowModel `json:"removal,omitempty"`
	Visible    *bool                    `json:"visible,omitempty"`
}
type ImageLayerWorkflowRequest struct {
	RequestID            string                    `json:"requestId"`
	ResumeTaskID         string                    `json:"resumeTaskId,omitempty"`
	PlanningTaskID       string                    `json:"planningTaskId,omitempty"`
	SourceNodeID         string                    `json:"sourceNodeId"`
	ResourceID           string                    `json:"resourceId"`
	ExpectedSourceSHA256 string                    `json:"expectedSourceSha256"`
	Title                string                    `json:"title,omitempty"`
	MaxCredits           float64                   `json:"maxCredits"`
	Layers               []ImageLayerWorkflowLayer `json:"layers"`
	BackgroundRegions    []imageops.Region         `json:"backgroundRegions,omitempty"`
}
type ImageLayerWorkflowResult struct {
	CanvasID      string   `json:"canvasId"`
	NodeID        string   `json:"nodeId"`
	TaskID        string   `json:"taskId"`
	ChildNodeIDs  []string `json:"childNodeIds"`
	Revision      int64    `json:"revision"`
	RequestSHA256 string   `json:"requestSha256"`
	Replayed      bool     `json:"replayed"`
}
type imageLayerWorkflowInput struct {
	Kind              string                          `json:"kind"`
	Version           int                             `json:"version"`
	Request           ImageLayerWorkflowRequest       `json:"request"`
	RequestSHA256     string                          `json:"requestSha256"`
	CanvasID          string                          `json:"canvasId"`
	NodeID            string                          `json:"nodeId"`
	ChildNodeIDs      []string                        `json:"childNodeIds"`
	InitialTaskIDs    []string                        `json:"initialTaskIds"`
	RemovalQuoteCaps  []int64                         `json:"removalQuoteCaps"`
	Source            imageops.Source                 `json:"source"`
	OriginalAssetID   string                          `json:"originalAssetId"`
	OriginalVersionID string                          `json:"originalVersionId"`
	ReusedLayers      map[int]imageLayerWorkflowReuse `json:"reusedLayers,omitempty"`
}

type imageLayerWorkflowReuse struct {
	ExtractionTaskID   string `json:"extractionTaskId,omitempty"`
	ExtractionParentID string `json:"extractionParentId,omitempty"`
	ExtractionStage    string `json:"extractionStage,omitempty"`
	ResourceID         string `json:"resourceId"`
	AssetID            string `json:"assetId"`
	AssetVersionID     string `json:"assetVersionId"`
	SHA256             string `json:"sha256"`
}

func validateImageLayerWorkflowRequest(req ImageLayerWorkflowRequest) error {
	if len(req.PlanningTaskID) > 128 {
		return BadAuthRequest("识图规划任务编号无效")
	}
	if len(req.RequestID) < 16 || len(req.RequestID) > 128 || len(req.ResumeTaskID) > 80 || req.SourceNodeID == "" || len(req.SourceNodeID) > 128 || req.ResourceID == "" || len(req.ResourceID) > 80 || len(req.ExpectedSourceSHA256) != 64 || !validExpectedImageSourceHash(req.ExpectedSourceSHA256) || len(req.Title) > 240 || len(req.Layers) < 2 || len(req.Layers) > 8 || math.IsNaN(req.MaxCredits) || math.IsInf(req.MaxCredits, 0) || req.MaxCredits < 0 || req.MaxCredits > 1_000_000 {
		return BadAuthRequest("请确认原图、2至8层目标、有效操作编号与积分上限")
	}
	for i, layer := range req.Layers {
		if strings.TrimSpace(layer.Name) == "" || len(layer.Name) > 240 {
			return BadAuthRequest("每层须有不超过240字节的名称")
		}
		switch layer.Method {
		case "source":
			if i != 0 || layer.Region != nil || layer.Generation != nil || layer.Removal != nil || len(req.BackgroundRegions) > 0 {
				return BadAuthRequest("只有底图可直接复用原图，不能混入生成参数")
			}
		case "source-region":
			if i == 0 || layer.Region == nil || layer.Generation != nil || layer.Removal != nil {
				return BadAuthRequest("区域提取仅用于有明确区域的前景，不混入模型调用")
			}
		case "generate":
			if layer.Region != nil || layer.Generation == nil {
				return BadAuthRequest("模型生成须提供独立模型参数")
			}
		default:
			return BadAuthRequest("不支持的图层提取方式")
		}
		for _, selection := range []*ImageLayerWorkflowModel{layer.Generation, layer.Removal} {
			if selection != nil && (strings.TrimSpace(selection.Prompt) == "" || len(selection.Prompt) > 32768 || len(selection.LogicalModelID) > 80 || len(selection.Model) > 160 || selection.LogicalModelID == "" && selection.Model == "" || len(selection.Size) > 40 || len(selection.Quality) > 40) {
				return BadAuthRequest("图层模型、提示词或尺寸选项无效")
			}
		}
		if i == 0 && layer.Removal != nil {
			return BadAuthRequest("背景底图不使用去背景模型")
		}
	}
	if len(req.BackgroundRegions) > 7 {
		return BadAuthRequest("底图局部修补最多支持7个明确区域")
	}
	return nil
}

func imageLayerWorkflowTaskID(userID, canvasID, requestID string) string {
	return imageOperationID("image-layer-workflow-v1", userID, canvasID, requestID)
}
func imageLayerWorkflowRasterRequestID(parentID string, index int, stage string) string {
	return fmt.Sprintf("layer-flow:%s:%d:%s", parentID, index, stage)
}
func imageLayerWorkflowModelTaskID(parentID string, index int, stage string) string {
	return imageOperationID("layer-flow-model", parentID, fmt.Sprint(index), stage)
}

func decodeImageLayerWorkflowInput(task *model.Task) (imageLayerWorkflowInput, error) {
	var input imageLayerWorkflowInput
	if task.Type != model.TaskTypeImageOperation || task.Operation != imageLayerWorkflowOperation || json.Unmarshal([]byte(task.InputJSON), &input) != nil || input.Kind != "native-image-layer-workflow" || input.Version != 1 || input.CanvasID != task.ProjectID || input.RequestSHA256 != cutSignature(input.Request) || input.NodeID != "image-layer-workflow:"+task.ID || len(input.ChildNodeIDs) != len(input.Request.Layers) || len(input.InitialTaskIDs) != len(input.Request.Layers) || len(input.RemovalQuoteCaps) != len(input.Request.Layers) || input.Source.SHA256 != input.Request.ExpectedSourceSHA256 {
		return input, errors.New("原生拆层工作流缺少有效固定来源")
	}
	if err := validateImageLayerWorkflowRequest(input.Request); err != nil {
		return input, err
	}
	if imageLayerWorkflowTaskID(task.UserID, task.ProjectID, input.Request.RequestID) != task.ID {
		return input, errors.New("工作流编号与固定意图不一致")
	}
	for i, layer := range input.Request.Layers {
		if input.ChildNodeIDs[i] != fmt.Sprintf("image-layer:%s:%d", task.ID, i) {
			return input, errors.New("图层节点编号与固定意图不一致")
		}
		if reused, ok := input.ReusedLayers[i]; ok {
			if input.Request.ResumeTaskID == "" || reused.ResourceID == "" || reused.AssetID == "" || reused.AssetVersionID == "" || !validExpectedImageSourceHash(reused.SHA256) || input.InitialTaskIDs[i] != reused.ExtractionTaskID {
				return input, errors.New("继续拆层缺少准确的已完成素材版本")
			}
			stage := reused.ExtractionStage
			if stage == "" {
				stage = "extract"
			}
			if reused.ExtractionTaskID != "" && (len(reused.ExtractionParentID) != 32 || stage != "extract" && stage != "remove-background" || reused.ExtractionTaskID != imageLayerWorkflowModelTaskID(reused.ExtractionParentID, i, stage) && (stage != "extract" || reused.ExtractionTaskID != imageOperationID("image-operation-v1", task.UserID, imageLayerWorkflowRasterRequestID(reused.ExtractionParentID, i, "extract")))) {
				return input, errors.New("复用的提取任务与原工作流不一致")
			}
			continue
		}
		if layer.Method == "source" {
			if input.InitialTaskIDs[i] != "" {
				return input, errors.New("原图复用不能伪造生成任务")
			}
			continue
		}
		expected := imageLayerWorkflowModelTaskID(task.ID, i, "extract")
		if layer.Method == "source-region" {
			expected = imageOperationID("image-operation-v1", task.UserID, imageLayerWorkflowRasterRequestID(task.ID, i, "extract"))
			if _, err := imageops.Plan(input.Source.Width, input.Source.Height, imageops.Recipe{Operation: "region", Region: layer.Region}); err != nil {
				return input, err
			}
		}
		if expected != input.InitialTaskIDs[i] {
			return input, errors.New("图层初始任务与固定意图不一致")
		}
	}
	for index := range input.ReusedLayers {
		if index < 0 || index >= len(input.Request.Layers) {
			return input, errors.New("复用图层索引超出原计划")
		}
	}
	return input, nil
}
