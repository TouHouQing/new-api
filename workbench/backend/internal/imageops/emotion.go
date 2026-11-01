package imageops

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/color"
	"math"
)

// Region is the exact crop submitted to the model; FaceBox uses original-image
// coordinates. They are persisted with the immutable source fingerprint.
type Emotion struct {
	Region  PixelCrop `json:"region"`
	FaceBox Crop      `json:"faceBox"`
}

func finite(values ...float64) bool {
	for _, value := range values {
		if math.IsNaN(value) || math.IsInf(value, 0) {
			return false
		}
	}
	return true
}

func ValidateEmotion(width, height int, edit Emotion) error {
	r, f := edit.Region, edit.FaceBox
	if !validSize(width, height) || r.X < 0 || r.Y < 0 || r.Width < 1 || r.Height < 1 || r.X > width-r.Width || r.Y > height-r.Height || !finite(f.X, f.Y, f.Width, f.Height) || f.Width < 1 || f.Height < 1 || f.X < float64(r.X) || f.Y < float64(r.Y) || f.X+f.Width > float64(r.X+r.Width) || f.Y+f.Height > float64(r.Y+r.Height) {
		return errors.New("表情修改须使用原图范围内的明确裁切区域和人脸框")
	}
	return nil
}

func emotionDistance(x, y int, edit Emotion) float64 {
	f := edit.FaceBox
	cx, cy := f.X+f.Width/2, f.Y+f.Height*.46
	rx, ry := math.Max(1, f.Width*.72), math.Max(1, f.Height*.74)
	dx, dy := (float64(x)+.5-cx)/rx, (float64(y)+.5-cy)/ry
	return math.Sqrt(dx*dx + dy*dy)
}

func emotionFeather(distance float64) float64 {
	if distance <= .7 {
		return 1
	}
	if distance >= 1 {
		return 0
	}
	t := (distance - .7) / .3
	return 1 - t*t*(3-2*t)
}

// Keeps the original frame/profile and blends only the target face ellipse.
// Candidate color is converted before sampling the feather ring, so correcting
// a warm/cold seam never changes any unrelated face or background pixel.
func RenderEmotionCompositePNG(ctx context.Context, source, generated image.Image, edit Emotion) ([]byte, error) {
	width, height := source.Bounds().Dx(), source.Bounds().Dy()
	if err := ValidateEmotion(width, height, edit); err != nil {
		return nil, err
	}
	r := edit.Region
	if generated.Bounds().Dx() != r.Width || generated.Bounds().Dy() != r.Height {
		return nil, errors.New("表情候选须先按原裁切比例整理尺寸")
	}
	metadata := rasterColorMetadata(source)
	convert, err := patchColorTransform(metadata, rasterColorMetadata(generated))
	if err != nil {
		return nil, err
	}
	encode := func(v float64) uint16 { return uint16(math.Round(math.Max(0, math.Min(1, v)) * 65535)) }
	candidateAt := func(x, y int) (color.NRGBA64, error) {
		value := unassociated64(generated.At(generated.Bounds().Min.X+x-r.X, generated.Bounds().Min.Y+y-r.Y))
		red, green, blue := float64(value.R)/65535, float64(value.G)/65535, float64(value.B)/65535
		if convert != nil {
			red, green, blue = convert(red, green, blue)
		}
		if !finite(red, green, blue) {
			return color.NRGBA64{}, colorMetadataError()
		}
		return color.NRGBA64{R: encode(red), G: encode(green), B: encode(blue), A: value.A}, nil
	}
	output := image.NewNRGBA64(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		for x := 0; x < width; x++ {
			output.SetNRGBA64(x, y, unassociated64(source.At(source.Bounds().Min.X+x, source.Bounds().Min.Y+y)))
		}
	}
	var before, after [3]float64
	count := 0
	for y := r.Y; y < r.Y+r.Height; y++ {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		for x := r.X; x < r.X+r.Width; x++ {
			distance := emotionDistance(x, y, edit)
			if distance < .72 || distance > .96 {
				continue
			}
			original := output.NRGBA64At(x, y)
			candidate, err := candidateAt(x, y)
			if err != nil {
				return nil, err
			}
			if original.A != 65535 || candidate.A != 65535 {
				continue
			}
			for channel, pair := range [][2]uint16{{original.R, candidate.R}, {original.G, candidate.G}, {original.B, candidate.B}} {
				before[channel] += float64(pair[0])
				after[channel] += float64(pair[1])
			}
			count++
		}
	}
	gains := [3]float64{1, 1, 1}
	if count >= 32 {
		for channel := range gains {
			gains[channel] = math.Max(.78, math.Min(1.22, before[channel]/math.Max(257, after[channel])))
		}
	}
	for y := r.Y; y < r.Y+r.Height; y++ {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		for x := r.X; x < r.X+r.Width; x++ {
			coverage := emotionFeather(emotionDistance(x, y, edit))
			if coverage == 0 {
				continue
			}
			original := output.NRGBA64At(x, y)
			candidate, err := candidateAt(x, y)
			if err != nil {
				return nil, err
			}
			beforeAlpha, afterAlpha := float64(original.A)/65535*(1-coverage), float64(candidate.A)/65535*coverage
			alpha := beforeAlpha + afterAlpha
			if alpha == 0 {
				output.SetNRGBA64(x, y, color.NRGBA64{R: original.R, G: original.G, B: original.B})
				continue
			}
			var rgb [3]uint16
			for channel, pair := range [][2]uint16{{original.R, candidate.R}, {original.G, candidate.G}, {original.B, candidate.B}} {
				gain := 1 + (gains[channel]-1)*(.42+(1-coverage)*.58)
				corrected := math.Max(0, math.Min(1, float64(pair[1])/65535*gain))
				rgb[channel] = encode((float64(pair[0])/65535*beforeAlpha + corrected*afterAlpha) / alpha)
			}
			output.SetNRGBA64(x, y, color.NRGBA64{R: rgb[0], G: rgb[1], B: rgb[2], A: encode(alpha)})
		}
	}
	var encoded bytes.Buffer
	if err := encodePrecisionPNG(ctx, &encoded, output, metadata.gray); err != nil {
		return nil, err
	}
	return appendColorMetadata(encoded.Bytes(), metadata)
}
