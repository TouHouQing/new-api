package imageops

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/color"
	"math"
	"strings"
)

const MaxCompositionLayers = 32
const MaxCompositionPixels = 64 * 1024 * 1024

type Composition struct {
	Width  int                `json:"width"`
	Height int                `json:"height"`
	Layers []CompositionLayer `json:"layers"`
}
type CompositionLayer struct {
	ID         string   `json:"id"`
	ResourceID string   `json:"resourceId"`
	X          float64  `json:"x"`
	Y          float64  `json:"y"`
	Opacity    *float64 `json:"opacity,omitempty"`
	Visible    *bool    `json:"visible,omitempty"`
}

func (layer CompositionLayer) Alpha() float64 {
	if layer.Opacity == nil {
		return 1
	}
	return *layer.Opacity
}
func (layer CompositionLayer) Shown() bool { return layer.Visible == nil || *layer.Visible }

func ValidateComposition(width, height int, composition Composition) error {
	if !validSize(width, height) || composition.Width != width || composition.Height != height || len(composition.Layers) < 1 || len(composition.Layers) > MaxCompositionLayers {
		return errors.New("图层合成须匹配原画布尺寸，支持1至32层")
	}
	seen := map[string]bool{}
	for _, layer := range composition.Layers {
		if strings.TrimSpace(layer.ID) == "" || len(layer.ID) > 128 || seen[layer.ID] || strings.TrimSpace(layer.ResourceID) == "" || len(layer.ResourceID) > 80 {
			return errors.New("图层编号不能重复，每层须引用具体图片资源")
		}
		seen[layer.ID] = true
		for _, v := range []float64{layer.X, layer.Y, layer.Alpha()} {
			if math.IsNaN(v) || math.IsInf(v, 0) {
				return errors.New("图层位置或透明度不是有限值")
			}
		}
		if math.Abs(layer.X) > float64(width+MaxLongEdge) || math.Abs(layer.Y) > float64(height+MaxLongEdge) || layer.Alpha() < 0 || layer.Alpha() > 1 {
			return errors.New("图层原像素位置或透明度超出范围")
		}
	}
	return nil
}

// Read sequentially so every concrete source is fingerprint-checked, including
// hidden layers, while only one visible source needs conversion memory at once.
// Composition occurs in encoded sRGB (browser Canvas2D source-over semantics).
// Original inputs remain untouched; the derived PNG declares its sRGB space.
func RenderCompositionPNG(ctx context.Context, composition Composition, read func(int) (image.Image, error)) ([]byte, error) {
	if err := ValidateComposition(composition.Width, composition.Height, composition); err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if read == nil {
		return nil, errors.New("图层原文件读取器不存在")
	}
	output := image.NewNRGBA64(image.Rect(0, 0, composition.Width, composition.Height))
	for index, layer := range composition.Layers {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		picture, err := read(index)
		if err != nil {
			return nil, err
		}
		if !layer.Shown() || layer.Alpha() == 0 {
			continue
		}
		if picture == nil || !validSize(picture.Bounds().Dx(), picture.Bounds().Dy()) {
			return nil, errors.New("图层图片尺寸无效")
		}
		picture, err = CompositionSRGB(ctx, picture)
		if err != nil {
			return nil, err
		}
		if layer.X == math.Trunc(layer.X) && layer.Y == math.Trunc(layer.Y) {
			if err := blendCompositionLayer(ctx, output, picture, int(layer.X), int(layer.Y), layer.Alpha()); err != nil {
				return nil, err
			}
		} else {
			if err := blendFractionalCompositionLayer(ctx, output, picture, layer.X, layer.Y, layer.Alpha()); err != nil {
				return nil, err
			}
		}
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	var buffer bytes.Buffer
	if err := encodePrecisionPNG(ctx, &buffer, output, false); err != nil {
		return nil, err
	}
	return appendColorMetadata(buffer.Bytes(), colorMetadata{chunks: []pngColorChunk{{kind: "sRGB", body: []byte{0}}}})
}

func blendFractionalCompositionLayer(ctx context.Context, output *image.NRGBA64, source image.Image, x, y, opacity float64) error {
	bounds := image.Rect(int(math.Floor(x)), int(math.Floor(y)), int(math.Ceil(x+float64(source.Bounds().Dx()))), int(math.Ceil(y+float64(source.Bounds().Dy())))).Intersect(output.Bounds())
	for py := bounds.Min.Y; py < bounds.Max.Y; py++ {
		if err := ctx.Err(); err != nil {
			return err
		}
		for px := bounds.Min.X; px < bounds.Max.X; px++ {
			sx, sy := float64(px)-x, float64(py)-y
			left, top := int(math.Floor(sx)), int(math.Floor(sy))
			fx, fy := sx-float64(left), sy-float64(top)
			var a, r, g, b float64
			for j := 0; j < 2; j++ {
				for i := 0; i < 2; i++ {
					point := image.Pt(source.Bounds().Min.X+left+i, source.Bounds().Min.Y+top+j)
					if !point.In(source.Bounds()) {
						continue
					}
					wx, wy := 1-fx, 1-fy
					if i == 1 {
						wx = fx
					}
					if j == 1 {
						wy = fy
					}
					pixel := unassociated64(source.At(point.X, point.Y))
					weight := wx * wy * float64(pixel.A) / 65535
					a += weight
					r += float64(pixel.R) * weight
					g += float64(pixel.G) * weight
					b += float64(pixel.B) * weight
				}
			}
			if a == 0 {
				continue
			}
			r, g, b = r/a, g/a, b/a
			a *= opacity
			d := output.NRGBA64At(px, py)
			background := float64(d.A) / 65535 * (1 - a)
			combined := a + background
			if combined == 0 {
				continue
			}
			channel := func(s float64, d uint16) uint16 {
				return uint16(math.Round(math.Max(0, math.Min(65535, (s*a+float64(d)*background)/combined))))
			}
			output.SetNRGBA64(px, py, color.NRGBA64{R: channel(r, d.R), G: channel(g, d.G), B: channel(b, d.B), A: uint16(math.Round(math.Max(0, math.Min(1, combined)) * 65535))})
		}
	}
	return nil
}

// Straight alpha is blended with wide intermediate precision. In particular,
// an almost transparent 16-bit sample must not lose its RGB through an early
// integer premultiplication before being stored in a transparent composition.
func blendCompositionLayer(ctx context.Context, output *image.NRGBA64, source image.Image, x, y int, opacity float64) error {
	bounds := source.Bounds().Sub(source.Bounds().Min).Add(image.Pt(x, y)).Intersect(output.Bounds())
	for py := bounds.Min.Y; py < bounds.Max.Y; py++ {
		if err := ctx.Err(); err != nil {
			return err
		}
		for px := bounds.Min.X; px < bounds.Max.X; px++ {
			s := unassociated64(source.At(source.Bounds().Min.X+px-x, source.Bounds().Min.Y+py-y))
			if s.A == 0 {
				continue
			}
			d := output.NRGBA64At(px, py)
			a := float64(s.A) / 65535 * opacity
			b := float64(d.A) / 65535 * (1 - a)
			combined := a + b
			if combined == 0 {
				continue
			}
			channel := func(s, d uint16) uint16 {
				return uint16(math.Round(math.Max(0, math.Min(65535, (float64(s)*a+float64(d)*b)/combined))))
			}
			output.SetNRGBA64(px, py, color.NRGBA64{R: channel(s.R, d.R), G: channel(s.G, d.G), B: channel(s.B, d.B), A: uint16(math.Round(combined * 65535))})
		}
	}
	return nil
}
