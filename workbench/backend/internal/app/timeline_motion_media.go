package app

import (
	"context"
	"fmt"
	"image"
	"io"
	"strings"
	"yingce/backend/internal/imageops"
)

func (s *Service) readMotionImage(ctx context.Context, userID, resourceID string) (image.Image, error) {
	resource, reader, err := s.OpenResource(userID, resourceID)
	if err != nil || reader == nil {
		return nil, fmt.Errorf("图片叠层素材不存在或无权读取")
	}
	defer reader.Close()
	if resource == nil || !strings.HasPrefix(resource.MimeType, "image/") || resource.Size < 0 || resource.Size > 32<<20 {
		return nil, fmt.Errorf("图片叠层仅支持32MB内的静态图片")
	}
	raw, err := io.ReadAll(io.LimitReader(reader, (32<<20)+1))
	if err != nil || len(raw) > 32<<20 || (resource.Size > 0 && int64(len(raw)) != resource.Size) {
		return nil, fmt.Errorf("图片叠层内容不完整或超过限制")
	}
	source, err := imageops.Inspect(raw)
	if err != nil {
		return nil, err
	}
	picture, err := imageops.Decode(ctx, raw, source)
	if err != nil {
		return nil, err
	}
	return imageops.CompositionSRGB(ctx, picture)
}

func (s *Service) prepareMotionLayers(ctx context.Context, userID string, clips []renderClip, write func(string, *image.NRGBA) error) ([]motionRasterLayer, error) {
	return buildMotionLayers(clips, readMotionFont, func(id string) (image.Image, error) { return s.readMotionImage(ctx, userID, id) }, func(name string, picture *image.NRGBA) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		return write(name, picture)
	})
}
