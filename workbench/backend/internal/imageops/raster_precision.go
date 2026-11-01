package imageops

import (
	"bytes"
	"compress/zlib"
	"context"
	"encoding/binary"
	"errors"
	"hash/crc32"
	"image"
	"image/color"
	"image/draw"
	"image/png"
)

type colorManagedRaster struct {
	image.Image
	metadata colorMetadata
}

func newPrecisionRaster(source image.Image, bounds image.Rectangle) draw.Image {
	switch source.(type) {
	case *image.Gray:
		return image.NewGray(bounds)
	case *image.Gray16:
		return image.NewGray16(bounds)
	case *image.NRGBA64:
		return image.NewNRGBA64(bounds)
	case *image.RGBA64:
		return image.NewRGBA64(bounds)
	default:
		return image.NewNRGBA(bounds)
	}
}

func writePNGChunk(buffer *bytes.Buffer, kind string, body []byte) {
	var value [4]byte
	binary.BigEndian.PutUint32(value[:], uint32(len(body)))
	buffer.Write(value[:])
	buffer.WriteString(kind)
	buffer.Write(body)
	checksum := crc32.Update(0, crc32.IEEETable, []byte(kind))
	checksum = crc32.Update(checksum, crc32.IEEETable, body)
	binary.BigEndian.PutUint32(value[:], checksum)
	buffer.Write(value[:])
}

func unassociated64(value color.Color) color.NRGBA64 {
	switch sample := value.(type) {
	case color.NRGBA:
		return color.NRGBA64{uint16(sample.R) * 257, uint16(sample.G) * 257, uint16(sample.B) * 257, uint16(sample.A) * 257}
	case color.NRGBA64:
		return sample
	default:
		return color.NRGBA64Model.Convert(value).(color.NRGBA64)
	}
}

// The standard encoder expands gray+alpha to RGB+alpha. A GRAY ICC profile
// cannot describe RGB samples, so keep PNG color type 4 for those sources.
func encodePrecisionPNG(ctx context.Context, buffer *bytes.Buffer, picture image.Image, gray bool) error {
	_, gray8 := picture.(*image.Gray)
	_, gray16 := picture.(*image.Gray16)
	if !gray || gray8 || gray16 {
		return png.Encode(buffer, picture)
	}
	depth := 8
	if _, ok := picture.(*image.NRGBA64); ok {
		depth = 16
	}
	bounds := picture.Bounds()
	header := make([]byte, 13)
	binary.BigEndian.PutUint32(header, uint32(bounds.Dx()))
	binary.BigEndian.PutUint32(header[4:], uint32(bounds.Dy()))
	header[8], header[9] = byte(depth), 4
	buffer.WriteString("\x89PNG\r\n\x1a\n")
	writePNGChunk(buffer, "IHDR", header)
	var compressed bytes.Buffer
	writer := zlib.NewWriter(&compressed)
	row := make([]byte, 1+bounds.Dx()*2*(depth/8))
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		if err := ctx.Err(); err != nil {
			writer.Close()
			return err
		}
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			value := unassociated64(picture.At(x, y))
			if value.R != value.G || value.R != value.B {
				writer.Close()
				return errors.New("灰度图片包含不匹配的彩色像素，请先转换色彩空间")
			}
			index := 1 + (x-bounds.Min.X)*2*(depth/8)
			if depth == 16 {
				binary.BigEndian.PutUint16(row[index:], value.R)
				binary.BigEndian.PutUint16(row[index+2:], value.A)
			} else {
				row[index], row[index+1] = byte(value.R>>8), byte(value.A>>8)
			}
		}
		if _, err := writer.Write(row); err != nil {
			writer.Close()
			return err
		}
	}
	if err := writer.Close(); err != nil {
		return err
	}
	writePNGChunk(buffer, "IDAT", compressed.Bytes())
	writePNGChunk(buffer, "IEND", nil)
	return nil
}

// Conservative peak estimate includes the compressed source, decoded and
// oriented samples, output/encoding copies and the separable kernel buffer.
// It is admission accounting; it does not change the persisted Source contract.
func WorkingSetBytes(source Source, pieces []Piece, algorithm string) int64 {
	base := int64(MaxSourceBytes) + int64(source.Width)*int64(source.Height)*16
	var output int64
	for _, piece := range pieces {
		peak := int64(piece.OutputWidth)*int64(piece.OutputHeight)*32 + 8<<20
		if algorithm == "high" || algorithm == "bilinear" {
			peak += int64(piece.OutputWidth) * int64(piece.Height) * 32
		}
		if peak > output {
			output = peak
		}
	}
	return base + output
}
