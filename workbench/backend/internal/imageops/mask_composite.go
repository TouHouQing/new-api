package imageops

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/color"
	"math"
)

func ValidateMaskedCompositeSelection(ctx context.Context, width, height int, mask Mask) error {
	if mask.Mode != "keep" {
		return errors.New("局部合成须明确涂抹要修改的区域")
	}
	_, err := rasterizeMaskSelection(ctx, width, height, mask)
	return err
}

// A generated candidate replaces only the painted original pixels. The exact
// unpainted samples and original color profile remain in the derived image.
func RenderMaskedCompositePNG(ctx context.Context, source, generated image.Image, mask Mask) ([]byte, error) {
	width, height := source.Bounds().Dx(), source.Bounds().Dy()
	if mask.Mode != "keep" || generated.Bounds().Dx() != width || generated.Bounds().Dy() != height {
		return nil, errors.New("局部合成须使用明确的涂抹选区，并先将候选整理为原图尺寸")
	}
	selection, err := rasterizeMaskSelection(ctx, width, height, mask)
	if err != nil {
		return nil, err
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
			coverage := float64(selection[y*width+x])
			if coverage == 0 {
				output.SetNRGBA64(x, y, original)
				continue
			}
			candidate := unassociated64(generated.At(generated.Bounds().Min.X+x, generated.Bounds().Min.Y+y))
			r, g, b := float64(candidate.R)/65535, float64(candidate.G)/65535, float64(candidate.B)/65535
			if convert != nil {
				r, g, b = convert(r, g, b)
			}
			if math.IsNaN(r+g+b) || math.IsInf(r+g+b, 0) {
				return nil, colorMetadataError()
			}
			before, after := float64(original.A)/65535*(1-coverage), float64(candidate.A)/65535*coverage
			alpha := before + after
			if alpha == 0 {
				output.SetNRGBA64(x, y, color.NRGBA64{R: original.R, G: original.G, B: original.B})
				continue
			}
			output.SetNRGBA64(x, y, color.NRGBA64{R: encode((float64(original.R)/65535*before + r*after) / alpha), G: encode((float64(original.G)/65535*before + g*after) / alpha), B: encode((float64(original.B)/65535*before + b*after) / alpha), A: encode(alpha)})
		}
	}
	var encoded bytes.Buffer
	if err := encodePrecisionPNG(ctx, &encoded, output, metadata.gray); err != nil {
		return nil, err
	}
	return appendColorMetadata(encoded.Bytes(), metadata)
}
