// Package imageops contains deterministic CPU image recipes, independent of
// accounts, storage, models and the task queue.
package imageops

import (
	"errors"
	"image"
	"math"
)

const (
	MaxGrid        = 12
	MaxPixels      = 4096 * 4096
	MaxSourceBytes = 32 << 20
	MaxLongEdge    = 4096
)

type Split struct {
	Rows            int       `json:"rows"`
	Columns         int       `json:"columns"`
	HorizontalLines []float64 `json:"horizontalLines,omitempty"`
	VerticalLines   []float64 `json:"verticalLines,omitempty"`
}

type Crop struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

type PixelCrop struct {
	X      int `json:"x"`
	Y      int `json:"y"`
	Width  int `json:"width"`
	Height int `json:"height"`
}

type Resize struct {
	TargetLongEdge int    `json:"targetLongEdge"`
	Algorithm      string `json:"algorithm"`
}

type Recipe struct {
	Operation  string           `json:"operation"`
	Split      *Split           `json:"split,omitempty"`
	Crop       *Crop            `json:"crop,omitempty"`
	Resize     *Resize          `json:"resize,omitempty"`
	Mask       *Mask            `json:"mask,omitempty"`
	Compose    *Composition     `json:"compose,omitempty"`
	CropPixels *PixelCrop       `json:"cropPixels,omitempty"`
	TrimLayers []LayerTrim      `json:"trimLayers,omitempty"`
	Region     *Region          `json:"region,omitempty"`
	Normalize  *Normalize       `json:"normalize,omitempty"`
	Patch      *BackgroundPatch `json:"patch,omitempty"`
}

type Piece struct {
	X            int `json:"x"`
	Y            int `json:"y"`
	Width        int `json:"width"`
	Height       int `json:"height"`
	OutputWidth  int `json:"outputWidth"`
	OutputHeight int `json:"outputHeight"`
	Row          int `json:"row"`
	Column       int `json:"column"`
}

func validSize(width, height int) bool {
	return width > 0 && height > 0 && width <= MaxPixels && height <= MaxPixels && int64(width)*int64(height) <= MaxPixels
}

func boundaries(length, count int, lines []float64) ([]int, error) {
	if count < 1 || count > MaxGrid || length < count {
		return nil, errors.New("切分数量不能超过图片像素尺寸，行列数须在1到12之间")
	}
	if lines != nil && len(lines) != count-1 {
		return nil, errors.New("分割线数量无效")
	}
	edges := make([]int, count+1)
	for i := 1; i < count; i++ {
		if lines == nil {
			edges[i] = length * i / count
		} else {
			line := lines[i-1]
			if math.IsNaN(line) || math.IsInf(line, 0) || line <= 0 || line >= 1 {
				return nil, errors.New("分割线位置无效")
			}
			edges[i] = int(math.Floor(line*float64(length) + 0.5))
		}
		if edges[i] <= edges[i-1] || edges[i] >= length {
			return nil, errors.New("分割线过近或交叉，请至少保留一个原图像素")
		}
	}
	edges[count] = length
	return edges, nil
}

// Plan uses the same floor-uniform / round-custom pixel boundaries as Yingce's
// native image editor. The recipe cannot mix unrelated operations.
func Plan(width, height int, recipe Recipe) ([]Piece, error) {
	if recipe.Region != nil && recipe.Operation != "region" || recipe.Normalize != nil && recipe.Operation != "normalize" || recipe.Patch != nil && recipe.Operation != "background-patch" {
		return nil, errors.New("图片配方包含无关的区域或规格整理参数")
	}
	if len(recipe.TrimLayers) > 0 || recipe.Operation == "trim-layers" {
		return planLayerTrims(recipe)
	}
	if recipe.CropPixels != nil && recipe.Operation != "crop" {
		return nil, errors.New("原像素区域只能用于裁剪")
	}
	if !validSize(width, height) {
		return nil, errors.New("图片像素数超过本地处理上限（1677万像素）")
	}
	piece := Piece{Width: width, Height: height, OutputWidth: width, OutputHeight: height}
	switch recipe.Operation {
	case "split":
		if recipe.Split == nil || recipe.Crop != nil || recipe.Resize != nil || recipe.Mask != nil || recipe.Compose != nil {
			return nil, errors.New("切图参数无效")
		}
		xs, err := boundaries(width, recipe.Split.Columns, recipe.Split.VerticalLines)
		if err != nil {
			return nil, err
		}
		ys, err := boundaries(height, recipe.Split.Rows, recipe.Split.HorizontalLines)
		if err != nil {
			return nil, err
		}
		if recipe.Split.Rows*recipe.Split.Columns < 2 {
			return nil, errors.New("请至少切分为两张图片")
		}
		pieces := make([]Piece, 0, recipe.Split.Rows*recipe.Split.Columns)
		for row := 0; row < recipe.Split.Rows; row++ {
			for col := 0; col < recipe.Split.Columns; col++ {
				w, h := xs[col+1]-xs[col], ys[row+1]-ys[row]
				pieces = append(pieces, Piece{X: xs[col], Y: ys[row], Width: w, Height: h, OutputWidth: w, OutputHeight: h, Row: row, Column: col})
			}
		}
		return pieces, nil
	case "crop":
		if (recipe.Crop == nil) == (recipe.CropPixels == nil) || recipe.Split != nil || recipe.Resize != nil || recipe.Mask != nil || recipe.Compose != nil {
			return nil, errors.New("裁剪参数无效")
		}
		if crop := recipe.CropPixels; crop != nil {
			if crop.X < 0 || crop.Y < 0 || crop.Width < 1 || crop.Height < 1 || crop.Width > width || crop.Height > height || crop.X > width-crop.Width || crop.Y > height-crop.Height {
				return nil, errors.New("原像素裁剪区域超出图片边界")
			}
			piece.X, piece.Y, piece.Width, piece.Height = crop.X, crop.Y, crop.Width, crop.Height
			piece.OutputWidth, piece.OutputHeight = crop.Width, crop.Height
			return []Piece{piece}, nil
		}
		c := recipe.Crop
		for _, v := range []float64{c.X, c.Y, c.Width, c.Height} {
			if math.IsNaN(v) || math.IsInf(v, 0) {
				return nil, errors.New("裁剪区域无效")
			}
		}
		if c.X < 0 || c.Y < 0 || c.Width <= 0 || c.Height <= 0 || c.X+c.Width > 1.00000001 || c.Y+c.Height > 1.00000001 {
			return nil, errors.New("裁剪区域超出图片边界")
		}
		piece.X, piece.Y = int(math.Floor(c.X*float64(width))), int(math.Floor(c.Y*float64(height)))
		right, bottom := min(width, int(math.Ceil((c.X+c.Width)*float64(width)))), min(height, int(math.Ceil((c.Y+c.Height)*float64(height))))
		piece.Width, piece.Height = right-piece.X, bottom-piece.Y
		if piece.Width <= 0 || piece.Height <= 0 {
			return nil, errors.New("裁剪区域为空")
		}
		piece.OutputWidth, piece.OutputHeight = piece.Width, piece.Height
	case "resize":
		if recipe.Resize == nil || recipe.Split != nil || recipe.Crop != nil || recipe.Mask != nil || recipe.Compose != nil {
			return nil, errors.New("缩放参数无效")
		}
		r := recipe.Resize
		if r.TargetLongEdge < 1 || r.TargetLongEdge > MaxLongEdge {
			return nil, errors.New("目标长边须在1到4096像素之间")
		}
		if r.Algorithm != "nearest" && r.Algorithm != "bilinear" && r.Algorithm != "high" {
			return nil, errors.New("不支持的图片插值方式")
		}
		if width >= height {
			piece.OutputWidth = r.TargetLongEdge
			piece.OutputHeight = max(1, int(math.Floor(float64(height)*float64(r.TargetLongEdge)/float64(width)+0.5)))
		} else {
			piece.OutputHeight = r.TargetLongEdge
			piece.OutputWidth = max(1, int(math.Floor(float64(width)*float64(r.TargetLongEdge)/float64(height)+0.5)))
		}
	case "mask":
		if recipe.Mask == nil || recipe.Split != nil || recipe.Crop != nil || recipe.Resize != nil || recipe.Compose != nil {
			return nil, errors.New("遮罩参数无效")
		}
		if err := ValidateMask(width, height, *recipe.Mask); err != nil {
			return nil, err
		}
	case "compose":
		if recipe.Compose == nil || recipe.Mask != nil || recipe.Split != nil || recipe.Crop != nil || recipe.Resize != nil {
			return nil, errors.New("图层合成参数无效")
		}
		if err := ValidateComposition(recipe.Compose.Width, recipe.Compose.Height, *recipe.Compose); err != nil {
			return nil, err
		}
		piece.OutputWidth, piece.OutputHeight = recipe.Compose.Width, recipe.Compose.Height
	case "region":
		if recipe.Region == nil || recipe.Split != nil || recipe.Crop != nil || recipe.CropPixels != nil || recipe.Resize != nil || recipe.Mask != nil || recipe.Compose != nil {
			return nil, errors.New("原图区域提取参数无效")
		}
		if _, err := regionRectangle(width, height, *recipe.Region); err != nil {
			return nil, err
		}
	case "normalize":
		if recipe.Normalize == nil || recipe.Split != nil || recipe.Crop != nil || recipe.CropPixels != nil || recipe.Resize != nil || recipe.Mask != nil || recipe.Compose != nil {
			return nil, errors.New("规格整理参数无效")
		}
		var err error
		piece, err = planNormalization(width, height, *recipe.Normalize)
		if err != nil {
			return nil, err
		}
	case "background-patch":
		if recipe.Patch == nil || recipe.Split != nil || recipe.Crop != nil || recipe.CropPixels != nil || recipe.Resize != nil || recipe.Mask != nil || recipe.Compose != nil {
			return nil, errors.New("局部底图修补参数无效")
		}
		if _, err := validateBackgroundPatch(width, height, *recipe.Patch); err != nil {
			return nil, err
		}
	default:
		return nil, errors.New("不支持的本地图片操作")
	}
	return []Piece{piece}, nil
}

func (p Piece) Rectangle() image.Rectangle { return image.Rect(p.X, p.Y, p.X+p.Width, p.Y+p.Height) }
