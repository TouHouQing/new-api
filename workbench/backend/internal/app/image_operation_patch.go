package app

import (
	"context"
	"errors"
	"image"
	"yingce/backend/internal/imageops"
)

func (s *Service) prepareImagePatchSource(userID string, input *imageOperationInput) error {
	patch := input.Request.Recipe.Patch
	if patch == nil {
		return nil
	}
	if !validExpectedImageSourceHash(patch.GeneratedSHA256) || patch.GeneratedSHA256 == "" {
		return BadAuthRequest("修补图片须使用实际原文件摘要")
	}
	data, err := s.readImageOperationSource(userID, patch.GeneratedResourceID)
	if err != nil {
		return err
	}
	source, err := imageops.Inspect(data)
	if err != nil {
		return err
	}
	input.PatchSource = &imageOperationLayerSource{ID: "background-patch", ResourceID: patch.GeneratedResourceID, Source: source}
	return validateImagePatchSnapshot(*input)
}

func validateImagePatchSnapshot(input imageOperationInput) error {
	patch := input.Request.Recipe.Patch
	if patch == nil {
		if input.PatchSource != nil {
			return errors.New("图片配方包含无关的修补来源")
		}
		return nil
	}
	source := input.PatchSource
	if source == nil || source.ID != "background-patch" || source.ResourceID != patch.GeneratedResourceID || source.Source.SHA256 != patch.GeneratedSHA256 || source.Source.Width != input.Source.Width || source.Source.Height != input.Source.Height {
		return errors.New("局部修补缺少准确的生成图片与像素尺寸")
	}
	return nil
}

func (s *Service) renderImageBackgroundPatch(ctx context.Context, userID string, source image.Image, input imageOperationInput) ([]byte, error) {
	data, err := s.readImageOperationSource(userID, input.PatchSource.ResourceID)
	if err != nil {
		return nil, err
	}
	generated, err := imageops.Decode(ctx, data, input.PatchSource.Source)
	if err != nil {
		return nil, err
	}
	return imageops.RenderBackgroundPatchPNG(ctx, source, generated, *input.Request.Recipe.Patch)
}
