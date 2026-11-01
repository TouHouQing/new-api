package app

import (
	"encoding/json"

	"yingce/backend/internal/imageops"
	"yingce/backend/internal/model"
)

type nativeImageAnnotation struct {
	SourceNodeID string          `json:"sourceNodeId"`
	ResourceID   string          `json:"sourceResourceId"`
	Source       imageops.Source `json:"source"`
}

func (s *Service) prepareNativeImageAnnotation(userID, canvasID string, input map[string]any) error {
	metadata, _ := input["metadata"].(map[string]any)
	if stringValue(metadata["edit"]) != "annotation" {
		if metadata["annotationSource"] != nil {
			return BadAuthRequest("批注来源只能用于批注图片编辑")
		}
		return nil
	}
	if stringValue(input["mode"]) != "image" {
		return BadAuthRequest("批注图片编辑只能用于原生图片任务")
	}
	nodeID, resourceID := stringValue(metadata["sourceNodeId"]), stringValue(metadata["sourceResourceId"])
	source, err := s.nativeImageEditSource(userID, canvasID, nodeID, resourceID)
	if err != nil {
		return err
	}
	// The original is not necessarily a provider reference for a one-image
	// model. Keep its verified lineage in the task and final fixed asset version.
	metadata["annotationSource"] = nativeImageAnnotation{SourceNodeID: nodeID, ResourceID: resourceID, Source: source}
	return nil
}

func nativeImageAnnotationForTask(task *model.Task) (*nativeImageAnnotation, error) {
	if task.InputJSON == "" {
		return nil, nil
	}
	var input struct {
		Metadata struct {
			Source *nativeImageAnnotation `json:"annotationSource"`
		} `json:"metadata"`
	}
	if err := json.Unmarshal([]byte(task.InputJSON), &input); err != nil {
		return nil, err
	}
	source := input.Metadata.Source
	if source != nil && (task.Type != "canvas_image" || source.ResourceID == "" || source.SourceNodeID == "" || !validExpectedImageSourceHash(source.Source.SHA256) || source.Source.SHA256 == "") {
		return nil, BadAuthRequest("批注图片缺少有效的原图来源记录")
	}
	return source, nil
}
