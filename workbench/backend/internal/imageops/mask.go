package imageops

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/color"
	"math"
)

// Coordinates and brush diameters are original, orientation-normalized pixels.
// The task retains the document alongside the immutable source fingerprint.
type Mask struct {
	Width   int          `json:"width"`
	Height  int          `json:"height"`
	Mode    string       `json:"mode"`
	Strokes []MaskStroke `json:"strokes"`
}
type MaskStroke struct {
	Diameter float64     `json:"diameter"`
	Erase    bool        `json:"erase"`
	Points   [][]float64 `json:"points"`
}

const maxMaskWork = 128 * 1024 * 1024

func maskSegmentBounds(width, height int, a, b []float64, radius float64) image.Rectangle {
	return image.Rect(int(math.Floor(math.Min(a[0], b[0])-radius-1)), int(math.Floor(math.Min(a[1], b[1])-radius-1)), int(math.Ceil(math.Max(a[0], b[0])+radius+1)), int(math.Ceil(math.Max(a[1], b[1])+radius+1))).Intersect(image.Rect(0, 0, width, height))
}

func ValidateMask(width, height int, mask Mask) error {
	if !validSize(width, height) || mask.Width != width || mask.Height != height || mask.Mode != "keep" && mask.Mode != "remove" || len(mask.Strokes) < 1 || len(mask.Strokes) > 256 {
		return errors.New("遮罩尺寸必须匹配原图，方式须为保留或擦除，最多256笔")
	}
	points, work := 0, int64(0)
	for _, stroke := range mask.Strokes {
		if math.IsNaN(stroke.Diameter) || math.IsInf(stroke.Diameter, 0) || stroke.Diameter < 1 || stroke.Diameter > MaxLongEdge || len(stroke.Points) < 1 {
			return errors.New("遮罩笔刷直径须为1至4096像素，笔画不能为空")
		}
		points += len(stroke.Points)
		if points > 8192 {
			return errors.New("遮罩最多8192个采样点，请简化笔画后保存")
		}
		strokeBounds := image.Rectangle{}
		for i, point := range stroke.Points {
			if len(point) != 2 {
				return errors.New("遮罩采样点必须包含准确的横纵坐标")
			}
			for axis, value := range point {
				limit := width
				if axis == 1 {
					limit = height
				}
				if math.IsNaN(value) || math.IsInf(value, 0) || value < -MaxLongEdge || value > float64(limit+MaxLongEdge) {
					return errors.New("遮罩笔画超出可处理的原图坐标")
				}
			}
			previous := point
			if i > 0 {
				previous = stroke.Points[i-1]
			}
			rect := maskSegmentBounds(width, height, previous, point, stroke.Diameter/2)
			strokeBounds = strokeBounds.Union(rect)
			work += int64(rect.Dx()) * int64(rect.Dy())
			if work > maxMaskWork {
				return errors.New("遮罩计算范围过大，请减少笔画或笔刷大小")
			}
		}
		work += int64(strokeBounds.Dx()) * int64(strokeBounds.Dy())
		if work > maxMaskWork {
			return errors.New("遮罩计算范围过大，请减少笔画或笔刷大小")
		}
	}
	return nil
}

func maskDistance(x, y float64, a, b []float64) float64 {
	dx, dy := b[0]-a[0], b[1]-a[1]
	t := 0.0
	if denominator := dx*dx + dy*dy; denominator > 0 {
		t = math.Max(0, math.Min(1, ((x-a[0])*dx+(y-a[1])*dy)/denominator))
	}
	return math.Hypot(x-a[0]-t*dx, y-a[1]-t*dy)
}

func rasterizeMaskSelection(ctx context.Context, width, height int, mask Mask) ([]float32, error) {
	if err := ValidateMask(width, height, mask); err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	selection, scratch := make([]float32, width*height), make([]float32, width*height)
	for _, stroke := range mask.Strokes {
		strokeBounds := image.Rectangle{}
		for i, point := range stroke.Points {
			previous := point
			if i > 0 {
				previous = stroke.Points[i-1]
			}
			rect := maskSegmentBounds(width, height, previous, point, stroke.Diameter/2)
			strokeBounds = strokeBounds.Union(rect)
			for y := rect.Min.Y; y < rect.Max.Y; y++ {
				if err := ctx.Err(); err != nil {
					return nil, err
				}
				for x := rect.Min.X; x < rect.Max.X; x++ {
					coverage := float32(math.Max(0, math.Min(1, stroke.Diameter/2+.5-maskDistance(float64(x)+.5, float64(y)+.5, previous, point))))
					index := y*width + x
					if coverage > scratch[index] {
						scratch[index] = coverage
					}
				}
			}
		}
		for y := strokeBounds.Min.Y; y < strokeBounds.Max.Y; y++ {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
			for x := strokeBounds.Min.X; x < strokeBounds.Max.X; x++ {
				index := y*width + x
				if stroke.Erase {
					selection[index] *= 1 - scratch[index]
				} else {
					selection[index] = scratch[index] + selection[index]*(1-scratch[index])
				}
				scratch[index] = 0
			}
		}
	}
	for _, coverage := range selection {
		if coverage > 0 {
			return selection, nil
		}
	}
	return nil, errors.New("遮罩没有选中原图像素，请重新涂抹")
}

// Only alpha changes. Unassociated RGB, 16-bit samples and source color
// profiles, including gray+alpha ICC, are preserved in the derived PNG.
func RenderMaskPNG(ctx context.Context, source image.Image, mask Mask) ([]byte, error) {
	width, height := source.Bounds().Dx(), source.Bounds().Dy()
	selection, err := rasterizeMaskSelection(ctx, width, height, mask)
	if err != nil {
		return nil, err
	}
	var metadata colorMetadata
	if managed, ok := source.(*colorManagedRaster); ok {
		metadata, source = managed.metadata, managed.Image
	}
	output := image.NewNRGBA64(image.Rect(0, 0, width, height))
	nonempty := false
	for y := 0; y < height; y++ {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		for x := 0; x < width; x++ {
			selected := float64(selection[y*width+x])
			nonempty = nonempty || selected > 0
			alpha := selected
			if mask.Mode == "remove" {
				alpha = 1 - selected
			}
			pixel := unassociated64(source.At(source.Bounds().Min.X+x, source.Bounds().Min.Y+y))
			output.SetNRGBA64(x, y, color.NRGBA64{R: pixel.R, G: pixel.G, B: pixel.B, A: uint16(math.Round(float64(pixel.A) * alpha))})
		}
	}
	if !nonempty {
		return nil, errors.New("遮罩没有选中原图像素，请重新涂抹")
	}
	var buffer bytes.Buffer
	if err := encodePrecisionPNG(ctx, &buffer, output, metadata.gray); err != nil {
		return nil, err
	}
	return appendColorMetadata(buffer.Bytes(), metadata)
}
