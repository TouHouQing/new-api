package imageops

import (
	"context"
	"errors"
	"image"
)

// AlphaBounds includes every nonzero 16-bit sample, including alpha=1. It
// never quantizes through a browser preview or applies an arbitrary threshold.
type AlphaInspection struct {
	Bounds            PixelCrop
	Empty             bool
	Opaque            bool
	TransparentPixels int
}

func AlphaBounds(ctx context.Context, picture image.Image) (PixelCrop, bool, error) {
	inspection, err := InspectAlpha(ctx, picture)
	return inspection.Bounds, inspection.Empty, err
}

func InspectAlpha(ctx context.Context, picture image.Image) (AlphaInspection, error) {
	if picture == nil {
		return AlphaInspection{}, errors.New("无法读取原图透明度")
	}
	frame := picture.Bounds()
	if !validSize(frame.Dx(), frame.Dy()) {
		return AlphaInspection{}, errors.New("原图像素超出处理上限")
	}
	inspection := AlphaInspection{Opaque: true}
	left, top, right, bottom := frame.Max.X, frame.Max.Y, frame.Min.X-1, frame.Min.Y-1
	for y := frame.Min.Y; y < frame.Max.Y; y++ {
		if err := ctx.Err(); err != nil {
			return AlphaInspection{}, err
		}
		for x := frame.Min.X; x < frame.Max.X; x++ {
			_, _, _, alpha := picture.At(x, y).RGBA()
			if alpha != 65535 {
				inspection.Opaque = false
			}
			if alpha == 0 {
				inspection.TransparentPixels++
				continue
			}
			left = min(left, x)
			top = min(top, y)
			right = max(right, x)
			bottom = max(bottom, y)
		}
	}
	if right < left {
		inspection.Empty = true
		return inspection, nil
	}
	inspection.Bounds = PixelCrop{X: left - frame.Min.X, Y: top - frame.Min.Y, Width: right - left + 1, Height: bottom - top + 1}
	return inspection, nil
}
