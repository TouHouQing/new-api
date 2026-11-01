package imageops

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/color"
	"math"
)

// Region uses the same 0..1000 coordinates as the source-image planning UI.
// The original frame is retained so extracted layers share scene coordinates.
type Region struct {
	Width       int       `json:"width"`
	Height      int       `json:"height"`
	BBox        []float64 `json:"bbox"`
	Shape       string    `json:"shape"`
	RadiusRatio *float64  `json:"radiusRatio,omitempty"`
}

func regionRectangle(width, height int, region Region) (image.Rectangle, error) {
	if !validSize(width, height) || region.Width != width || region.Height != height || len(region.BBox) != 4 {
		return image.Rectangle{}, errors.New("区域坐标必须绑定原图实际尺寸")
	}
	for _, value := range region.BBox {
		if math.IsNaN(value) || math.IsInf(value, 0) || value < 0 || value > 1000 {
			return image.Rectangle{}, errors.New("区域坐标须在0至1000之间")
		}
	}
	if region.BBox[2]-region.BBox[0] < 2 || region.BBox[3]-region.BBox[1] < 2 {
		return image.Rectangle{}, errors.New("区域宽高至少为归一化坐标的2个单位")
	}
	if region.Shape != "rect" && region.Shape != "ellipse" && region.Shape != "rounded-rect" {
		return image.Rectangle{}, errors.New("不支持的原图区域形状")
	}
	if region.Shape == "rounded-rect" {
		if region.RadiusRatio == nil || math.IsNaN(*region.RadiusRatio) || math.IsInf(*region.RadiusRatio, 0) || *region.RadiusRatio < 0 || *region.RadiusRatio > 0.5 {
			return image.Rectangle{}, errors.New("圆角比例须在0至0.5之间")
		}
	} else if region.RadiusRatio != nil {
		return image.Rectangle{}, errors.New("只有圆角矩形可以指定圆角比例")
	}
	box := image.Rect(int(math.Round(region.BBox[0]*float64(width)/1000)), int(math.Round(region.BBox[1]*float64(height)/1000)), int(math.Round(region.BBox[2]*float64(width)/1000)), int(math.Round(region.BBox[3]*float64(height)/1000)))
	if box.Empty() || !box.In(image.Rect(0, 0, width, height)) {
		return image.Rectangle{}, errors.New("提取区域小于一个原图像素或超出边界")
	}
	return box, nil
}

func regionContains(x, y float64, box image.Rectangle, region Region) bool {
	left, top, right, bottom := float64(box.Min.X), float64(box.Min.Y), float64(box.Max.X), float64(box.Max.Y)
	if x < left || x >= right || y < top || y >= bottom {
		return false
	}
	if region.Shape == "rect" {
		return true
	}
	if region.Shape == "ellipse" {
		dx, dy := (x-(left+right)/2)/((right-left)/2), (y-(top+bottom)/2)/((bottom-top)/2)
		return dx*dx+dy*dy <= 1
	}
	radius := math.Min(right-left, bottom-top) * *region.RadiusRatio
	if radius == 0 {
		return true
	}
	cx, cy := math.Max(left+radius, math.Min(right-radius, x)), math.Max(top+radius, math.Min(bottom-radius, y))
	dx, dy := x-cx, y-cy
	return dx*dx+dy*dy <= radius*radius
}

// Coverage is deterministic on an original-pixel 4x4 subpixel grid. Rectangles
// use exact integer boundaries; only curved edges change fractional alpha.
func regionCoverage(x, y int, box image.Rectangle, region Region) float64 {
	if !image.Pt(x, y).In(box) {
		return 0
	}
	if region.Shape == "rect" {
		return 1
	}
	inside := 0
	for sy := 0; sy < 4; sy++ {
		for sx := 0; sx < 4; sx++ {
			if regionContains(float64(x)+(float64(sx)+0.5)/4, float64(y)+(float64(sy)+0.5)/4, box, region) {
				inside++
			}
		}
	}
	return float64(inside) / 16
}

func RenderRegionPNG(ctx context.Context, source image.Image, region Region) ([]byte, error) {
	width, height := source.Bounds().Dx(), source.Bounds().Dy()
	box, err := regionRectangle(width, height, region)
	if err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
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
			pixel := unassociated64(source.At(source.Bounds().Min.X+x, source.Bounds().Min.Y+y))
			alpha := uint16(math.Round(float64(pixel.A) * regionCoverage(x, y, box, region)))
			nonempty = nonempty || alpha > 0
			output.SetNRGBA64(x, y, color.NRGBA64{R: pixel.R, G: pixel.G, B: pixel.B, A: alpha})
		}
	}
	if !nonempty {
		return nil, errors.New("提取区域没有非透明内容，请重新框选")
	}
	var encoded bytes.Buffer
	if err := encodePrecisionPNG(ctx, &encoded, output, metadata.gray); err != nil {
		return nil, err
	}
	return appendColorMetadata(encoded.Bytes(), metadata)
}
