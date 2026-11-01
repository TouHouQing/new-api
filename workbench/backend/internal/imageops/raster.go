package imageops

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"image"
	"image/draw"
	_ "image/jpeg"
	_ "image/png"

	xdraw "golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

type Source struct {
	SHA256      string `json:"sha256"`
	Format      string `json:"format"`
	Width       int    `json:"width"`
	Height      int    `json:"height"`
	Orientation int    `json:"orientation"`
}

func Inspect(data []byte) (Source, error) {
	if len(data) == 0 || len(data) > MaxSourceBytes {
		return Source{}, errors.New("图片文件为空或超过32MB处理上限")
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || (format != "png" && format != "jpeg" && format != "webp") {
		return Source{}, errors.New("本地处理支持静态PNG、JPEG和WebP图片，请先转换格式")
	}
	if !validSize(config.Width, config.Height) {
		return Source{}, errors.New("图片像素数超过本地处理上限（1677万像素）")
	}
	if _, err := readColorMetadata(data, format); err != nil {
		return Source{}, err
	}
	orientation, animated := imageMetadata(data, format)
	if animated {
		return Source{}, errors.New("动态图不能作为静态图片处理，请先选取一帧")
	}
	sum := sha256.Sum256(data)
	source := Source{SHA256: hex.EncodeToString(sum[:]), Format: format, Width: config.Width, Height: config.Height, Orientation: orientation}
	if orientation >= 5 {
		source.Width, source.Height = source.Height, source.Width
	}
	return source, nil
}

func Decode(ctx context.Context, data []byte, expected Source) (image.Image, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	actual, err := Inspect(data)
	if err != nil {
		return nil, err
	}
	if actual != expected {
		return nil, errors.New("源图片内容已变化，请从当前图片重新创建操作")
	}
	metadata, err := readColorMetadata(data, actual.Format)
	if err != nil {
		return nil, err
	}
	picture, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, errors.New("图片内容解码失败")
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if actual.Orientation == 1 {
		return &colorManagedRaster{Image: picture, metadata: metadata}, nil
	}
	normalized := newPrecisionRaster(picture, image.Rect(0, 0, actual.Width, actual.Height))
	w, h := picture.Bounds().Dx(), picture.Bounds().Dy()
	for y := 0; y < actual.Height; y++ {
		if y%128 == 0 {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
		}
		for x := 0; x < actual.Width; x++ {
			sx, sy := x, y
			switch actual.Orientation {
			case 2:
				sx = w - 1 - x
			case 3:
				sx, sy = w-1-x, h-1-y
			case 4:
				sy = h - 1 - y
			case 5:
				sx, sy = y, x
			case 6:
				sx, sy = y, h-1-x
			case 7:
				sx, sy = w-1-y, h-1-x
			case 8:
				sx, sy = w-1-y, x
			}
			normalized.Set(x, y, picture.At(sx, sy))
		}
	}
	return &colorManagedRaster{Image: normalized, metadata: metadata}, nil
}

func RenderPNG(ctx context.Context, source image.Image, piece Piece, algorithm string) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if piece.Width <= 0 || piece.Height <= 0 || !piece.Rectangle().In(source.Bounds()) || !validSize(piece.OutputWidth, piece.OutputHeight) {
		return nil, errors.New("图片处理区域或输出尺寸无效")
	}
	var metadata colorMetadata
	if managed, ok := source.(*colorManagedRaster); ok {
		metadata, source = managed.metadata, managed.Image
	}
	output := newPrecisionRaster(source, image.Rect(0, 0, piece.OutputWidth, piece.OutputHeight))
	if piece.Width == piece.OutputWidth && piece.Height == piece.OutputHeight {
		draw.Draw(output, output.Bounds(), source, image.Pt(piece.X, piece.Y), draw.Src)
	} else if algorithm == "nearest" {
		// Copy unassociated samples directly, including RGB hidden under alpha=0.
		// Generic scalers may premultiply and irreversibly round low-alpha values.
		for y := 0; y < piece.OutputHeight; y++ {
			if y%128 == 0 {
				if err := ctx.Err(); err != nil {
					return nil, err
				}
			}
			sy := piece.Y + int(int64(2*y+1)*int64(piece.Height)/int64(2*piece.OutputHeight))
			for x := 0; x < piece.OutputWidth; x++ {
				sx := piece.X + int(int64(2*x+1)*int64(piece.Width)/int64(2*piece.OutputWidth))
				output.Set(x, y, source.At(sx, sy))
			}
		}
	} else {
		var scaler xdraw.Scaler = xdraw.NearestNeighbor
		switch algorithm {
		case "bilinear":
			scaler = xdraw.ApproxBiLinear
		case "high":
			scaler = xdraw.CatmullRom
		default:
			return nil, errors.New("图片插值方式无效")
		}
		scaler.Scale(output, output.Bounds(), source, piece.Rectangle(), draw.Src, nil)
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	var buffer bytes.Buffer
	if err := encodePrecisionPNG(ctx, &buffer, output, metadata.gray); err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	return appendColorMetadata(buffer.Bytes(), metadata)
}
