package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"yingce/backend/internal/imageops"
	"yingce/backend/internal/model"
)

// Source is recomputed during admission; providing a client snapshot does not
// grant access to a resource or replace the immutable owned-file fingerprint.
type nativeImageEdit struct {
	Version              int               `json:"version"`
	SourceNodeID         string            `json:"sourceNodeId"`
	ResourceID           string            `json:"resourceId"`
	ExpectedSourceSHA256 string            `json:"expectedSourceSha256"`
	Mask                 *imageops.Mask    `json:"mask,omitempty"`
	Emotion              *imageops.Emotion `json:"emotion,omitempty"`
	Source               imageops.Source   `json:"source"`
}

func decodeNativeImageEdit(value any) (*nativeImageEdit, error) {
	if value == nil {
		return nil, nil
	}
	data, err := json.Marshal(value)
	if err != nil {
		return nil, BadAuthRequest("局部图片处理参数格式无效")
	}
	var edit nativeImageEdit
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&edit); err != nil {
		return nil, BadAuthRequest("局部图片处理包含无效或未知参数")
	}
	if edit.Version != 1 || strings.TrimSpace(edit.SourceNodeID) == "" || len(edit.SourceNodeID) > 128 || strings.TrimSpace(edit.ResourceID) == "" || len(edit.ResourceID) > 80 || !validExpectedImageSourceHash(edit.ExpectedSourceSHA256) || edit.ExpectedSourceSHA256 == "" || (edit.Mask == nil) == (edit.Emotion == nil) || edit.Mask != nil && edit.Mask.Mode != "keep" {
		return nil, BadAuthRequest("局部图片处理须绑定原节点、原文件摘要和明确涂抹区域")
	}
	return &edit, nil
}

func (s *Service) prepareNativeImageEdit(userID, canvasID string, input map[string]any) error {
	metadata, _ := input["metadata"].(map[string]any)
	edit, err := decodeNativeImageEdit(metadata["nativeImageEdit"])
	if err != nil || edit == nil {
		return err
	}
	if stringValue(input["mode"]) != "image" || canvasID == "" {
		return BadAuthRequest("局部图片处理仅用于原生画布图片任务")
	}
	source, err := s.nativeImageEditSource(userID, canvasID, edit.SourceNodeID, edit.ResourceID)
	if err != nil {
		return err
	}
	if source.SHA256 != edit.ExpectedSourceSHA256 || edit.Source.SHA256 != "" && edit.Source != source {
		return imageMaterialSourceChanged()
	}
	if err := edit.validateSelection(source.Width, source.Height); err != nil {
		return BadAuthRequest(err.Error())
	}
	// Empty/fully erased selections are rejected before a model can be queued
	// or charged. Bound raster work shares the existing image memory budget.
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	memory := int64(source.Width) * int64(source.Height) * 8
	if err := imageOperationMemory.Acquire(ctx, memory); err != nil {
		return BadAuthRequest("图片处理繁忙，请保留选区后稍后重试")
	}
	if edit.Mask != nil {
		err = imageops.ValidateMaskedCompositeSelection(ctx, source.Width, source.Height, *edit.Mask)
	}
	imageOperationMemory.Release(memory)
	if err != nil {
		return BadAuthRequest(err.Error())
	}
	edit.Source = source
	encoded, err := json.Marshal(edit)
	if err != nil {
		return err
	}
	var sealed map[string]any
	if err := json.Unmarshal(encoded, &sealed); err != nil {
		return err
	}
	metadata["nativeImageEdit"] = sealed
	return nil
}

func (s *Service) nativeImageEditSource(userID, canvasID, nodeID, resourceID string) (imageops.Source, error) {
	if canvasID == "" || nodeID == "" || resourceID == "" {
		return imageops.Source{}, BadAuthRequest("图片修改须绑定已保存的原图及画布")
	}
	if _, err := s.mediaTaskProject(&model.Task{UserID: userID, ProjectID: canvasID}); err != nil {
		return imageops.Source{}, err
	}
	canvas, err := s.repo.CanvasProjectForUser(userID, canvasID)
	if err != nil {
		return imageops.Source{}, err
	}
	var document struct {
		Nodes []struct {
			ID       string `json:"id"`
			Type     string `json:"type"`
			Metadata struct {
				StorageKey string `json:"storageKey"`
			} `json:"metadata"`
		} `json:"nodes"`
	}
	if json.Unmarshal([]byte(canvas.PayloadJSON), &document) != nil {
		return imageops.Source{}, BadAuthRequest("原画布内容无法读取")
	}
	bound := false
	for _, node := range document.Nodes {
		if node.ID == nodeID && node.Type == "image" && node.Metadata.StorageKey == "resource:"+resourceID {
			bound = true
			break
		}
	}
	if !bound {
		return imageops.Source{}, imageMaterialSourceChanged()
	}
	data, err := s.readImageOperationSource(userID, resourceID)
	if err != nil {
		return imageops.Source{}, err
	}
	source, err := imageops.Inspect(data)
	if err != nil {
		return imageops.Source{}, BadAuthRequest(err.Error())
	}
	return source, nil
}

func (edit *nativeImageEdit) validateSelection(width, height int) error {
	if edit.Emotion != nil {
		return imageops.ValidateEmotion(width, height, *edit.Emotion)
	}
	return imageops.ValidateMask(width, height, *edit.Mask)
}

func nativeImageEditForTask(task *model.Task) (*nativeImageEdit, string, error) {
	if strings.TrimSpace(task.InputJSON) == "" {
		return nil, "", nil
	}
	var input struct {
		Metadata struct {
			Edit json.RawMessage `json:"nativeImageEdit"`
		} `json:"metadata"`
	}
	if err := json.Unmarshal([]byte(task.InputJSON), &input); err != nil {
		return nil, "", err
	}
	if len(input.Metadata.Edit) == 0 || bytes.Equal(input.Metadata.Edit, []byte("null")) {
		return nil, "", nil
	}
	var value any
	if err := json.Unmarshal(input.Metadata.Edit, &value); err != nil {
		return nil, "", err
	}
	edit, err := decodeNativeImageEdit(value)
	if err != nil {
		return nil, "", err
	}
	if edit == nil || task.Type != "canvas_image" || task.ProjectID == "" || edit.Source.SHA256 != edit.ExpectedSourceSHA256 || edit.validateSelection(edit.Source.Width, edit.Source.Height) != nil {
		return nil, "", errors.New("局部图片处理缺少准确的原文件快照")
	}
	return edit, cutSignature(edit), nil
}
