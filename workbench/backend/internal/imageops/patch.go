package imageops

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/color"
	"math"
)

type BackgroundPatch struct {
	Width               int      `json:"width"`
	Height              int      `json:"height"`
	GeneratedResourceID string   `json:"generatedResourceId"`
	GeneratedSHA256     string   `json:"generatedSha256"`
	Regions             []Region `json:"regions"`
}

func validateBackgroundPatch(width, height int, patch BackgroundPatch) ([]image.Rectangle, error) {
	if !validSize(width, height) || patch.Width != width || patch.Height != height || len(patch.Regions) < 1 || len(patch.Regions) > 7 || patch.GeneratedResourceID == "" || len(patch.GeneratedResourceID) > 80 || len(patch.GeneratedSHA256) != 64 {
		return nil, errors.New("底图修补须绑定实际尺寸、生成图片摘要和1至7个明确区域")
	}
	boxes := make([]image.Rectangle, len(patch.Regions))
	for i, region := range patch.Regions {
		box, err := regionRectangle(width, height, region)
		if err != nil {
			return nil, err
		}
		boxes[i] = box
	}
	return boxes, nil
}

func patchCoverage(x, y int, boxes []image.Rectangle, regions []Region) float64 {
	possible := false
	for i, box := range boxes {
		if image.Pt(x, y).In(box) {
			possible = true
			if regions[i].Shape == "rect" {
				return 1
			}
		}
	}
	if !possible {
		return 0
	}
	inside := 0
	for sy := 0; sy < 4; sy++ {
		for sx := 0; sx < 4; sx++ {
			for i, box := range boxes {
				if regionContains(float64(x)+(float64(sx)+.5)/4, float64(y)+(float64(sy)+.5)/4, box, regions[i]) {
					inside++
					break
				}
			}
		}
	}
	return float64(inside) / 16
}

// Pixels outside the confirmed removal regions retain their exact unassociated
// samples and source profile. Only generated pixels entering a region convert.
func RenderBackgroundPatchPNG(ctx context.Context, source, generated image.Image, patch BackgroundPatch) ([]byte, error) {
	width, height := source.Bounds().Dx(), source.Bounds().Dy()
	boxes, err := validateBackgroundPatch(width, height, patch)
	if err != nil {
		return nil, err
	}
	if generated.Bounds().Dx() != width || generated.Bounds().Dy() != height {
		return nil, errors.New("修补结果尺寸须先整理为原图尺寸")
	}
	metadata := rasterColorMetadata(source)
	convert, err := patchColorTransform(metadata, rasterColorMetadata(generated))
	if err != nil {
		return nil, err
	}
	output := image.NewNRGBA64(image.Rect(0, 0, width, height))
	encode := func(v float64) uint16 { return uint16(math.Round(math.Max(0, math.Min(1, v)) * 65535)) }
	for y := 0; y < height; y++ {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		for x := 0; x < width; x++ {
			original := unassociated64(source.At(source.Bounds().Min.X+x, source.Bounds().Min.Y+y))
			pixel := unassociated64(generated.At(generated.Bounds().Min.X+x, generated.Bounds().Min.Y+y))
			if original.A != 65535 || pixel.A != 65535 {
				return nil, errors.New("局部底图修补要求原图和生成底图均完整不透明；独立透明素材仍保留")
			}
			coverage := patchCoverage(x, y, boxes, patch.Regions)
			if coverage == 0 {
				output.SetNRGBA64(x, y, original)
				continue
			}
			r, g, b := float64(pixel.R)/65535, float64(pixel.G)/65535, float64(pixel.B)/65535
			if convert != nil {
				r, g, b = convert(r, g, b)
			}
			if math.IsNaN(r+g+b) || math.IsInf(r+g+b, 0) {
				return nil, colorMetadataError()
			}
			output.SetNRGBA64(x, y, color.NRGBA64{R: encode(float64(original.R)/65535*(1-coverage) + r*coverage), G: encode(float64(original.G)/65535*(1-coverage) + g*coverage), B: encode(float64(original.B)/65535*(1-coverage) + b*coverage), A: 65535})
		}
	}
	var encoded bytes.Buffer
	if err := encodePrecisionPNG(ctx, &encoded, output, metadata.gray); err != nil {
		return nil, err
	}
	return appendColorMetadata(encoded.Bytes(), metadata)
}
