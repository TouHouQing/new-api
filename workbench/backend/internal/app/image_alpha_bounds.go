package app

import (
	"context"
	"errors"
	"gorm.io/gorm"
	"yingce/backend/internal/imageops"
	"yingce/backend/internal/model"
)

type ImageAlphaBounds struct {
	ResourceID string               `json:"resourceId"`
	Source     imageops.Source      `json:"source"`
	Bounds     *imageops.PixelCrop  `json:"bounds"`
	Empty      bool                 `json:"empty"`
	TrimNeeded bool                 `json:"trimNeeded"`
	RasterInfo ImageLayerRasterInfo `json:"rasterInfo"`
}

type ImageLayerRasterInfo struct {
	Width             int  `json:"width"`
	Height            int  `json:"height"`
	Transparent       bool `json:"transparent"`
	Nonempty          bool `json:"nonempty"`
	Opaque            bool `json:"opaque"`
	TransparentPixels int  `json:"transparentPixels"`
}

func (s *Service) InspectImageAlphaBounds(ctx context.Context, userID, resourceID string) (ImageAlphaBounds, error) {
	var result ImageAlphaBounds
	if userID == "" {
		return result, Unauthorized("请先登录")
	}
	user, err := s.repo.User(userID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return result, Forbidden("无法读取原图")
	}
	if err != nil {
		return result, err
	}
	if user.Status != model.UserStatusActive {
		return result, Forbidden("当前账号不能处理图片")
	}
	// Reserve before reading compressed data so concurrent probes cannot hold
	// all admission capacity while each waits to upgrade its decode reservation.
	const reservation int64 = 512 << 20
	if err := imageOperationMemory.Acquire(ctx, reservation); err != nil {
		return result, err
	}
	defer imageOperationMemory.Release(reservation)
	data, err := s.readImageOperationSource(userID, resourceID)
	if err != nil {
		return result, err
	}
	source, err := imageops.Inspect(data)
	if err != nil {
		return result, BadAuthRequest(err.Error())
	}
	picture, err := imageops.Decode(ctx, data, source)
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return result, err
		}
		return result, BadAuthRequest(err.Error())
	}
	inspection, err := imageops.InspectAlpha(ctx, picture)
	if err != nil {
		return result, err
	}
	result = ImageAlphaBounds{ResourceID: resourceID, Source: source, Empty: inspection.Empty, RasterInfo: ImageLayerRasterInfo{Width: source.Width, Height: source.Height, Transparent: inspection.TransparentPixels > 0, Nonempty: !inspection.Empty, Opaque: inspection.Opaque, TransparentPixels: inspection.TransparentPixels}}
	if !inspection.Empty {
		result.Bounds = &inspection.Bounds
		result.TrimNeeded = inspection.Bounds.X != 0 || inspection.Bounds.Y != 0 || inspection.Bounds.Width != source.Width || inspection.Bounds.Height != source.Height
	}
	return result, nil
}
