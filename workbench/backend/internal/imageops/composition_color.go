package imageops

import (
	"bytes"
	"compress/zlib"
	"context"
	"encoding/binary"
	"fmt"
	"image"
	"image/color"
	"io"
	"math"

	"github.com/kovidgoyal/imaging/prism/meta/icc"
)

// Raster operations preserve source samples/profile. Compositing instead needs
// actual sRGB samples before resizing/overlaying, with alpha left unassociated.
// An unsupported profile fails visibly; source resource bytes are never changed.
func CompositionSRGB(ctx context.Context, source image.Image) (result image.Image, err error) {
	managed, ok := source.(*colorManagedRaster)
	if !ok {
		return source, nil
	}
	defer func() {
		if recover() != nil {
			result = nil
			err = fmt.Errorf("图片色彩转换失败，请保留原图并转换为sRGB后再使用")
		}
	}()
	transform, err := compositionColorTransform(managed.metadata)
	if err != nil {
		return nil, err
	}
	if transform == nil {
		return managed.Image, nil
	}
	bounds := source.Bounds()
	output := image.NewNRGBA64(bounds)
	encode := func(v float64) uint16 { return uint16(math.Round(math.Max(0, math.Min(1, v)) * 65535)) }
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		if y%64 == 0 {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
		}
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			pixel := color.NRGBA64Model.Convert(source.At(x, y)).(color.NRGBA64)
			r, g, b := transform(float64(pixel.R)/65535, float64(pixel.G)/65535, float64(pixel.B)/65535)
			if math.IsNaN(r) || math.IsNaN(g) || math.IsNaN(b) || math.IsInf(r, 0) || math.IsInf(g, 0) || math.IsInf(b, 0) {
				return nil, colorMetadataError()
			}
			output.SetNRGBA64(x, y, color.NRGBA64{R: encode(r), G: encode(g), B: encode(b), A: pixel.A})
		}
	}
	return output, nil
}

func compositionColorTransform(metadata colorMetadata) (func(float64, float64, float64) (float64, float64, float64), error) {
	var profile, chromaticity []byte
	gamma := 0.0
	standard := false
	for _, chunk := range metadata.chunks {
		switch chunk.kind {
		case "iCCP":
			start := bytes.IndexByte(chunk.body, 0) + 2
			reader, err := zlib.NewReader(bytes.NewReader(chunk.body[start:]))
			if err != nil {
				return nil, err
			}
			profile, err = io.ReadAll(io.LimitReader(reader, maxColorProfileBytes+1))
			closeErr := reader.Close()
			if err != nil || closeErr != nil || len(profile) > maxColorProfileBytes {
				return nil, colorMetadataError()
			}
		case "sRGB":
			standard = true
		case "gAMA":
			gamma = float64(binary.BigEndian.Uint32(chunk.body)) / 100000
		case "cHRM":
			chromaticity = chunk.body
		case "cICP":
			// SDR BT.709/sRGB only: HDR transfer curves need an explicit tone map.
			if chunk.body[0] != 1 || chunk.body[1] != 13 {
				return nil, fmt.Errorf("此图片为HDR或不同视频色彩空间，请先转换为sRGB静态图片")
			}
			standard = true
		}
	}
	if len(profile) > 0 {
		if metadata.gray {
			return compositionGrayICC(profile)
		}
		parsed, err := icc.DecodeProfile(bytes.NewReader(profile))
		if err != nil {
			return nil, fmt.Errorf("图片ICC色彩配置无法读取")
		}
		channels := 3
		if metadata.gray {
			channels = 1
		}
		pipeline, err := parsed.CreateTransformerToSRGB(icc.RelativeColorimetricRenderingIntent, false, channels, true, false, true)
		if err != nil {
			return nil, fmt.Errorf("此图片ICC配置不支持合成，请先转换为sRGB")
		}
		return pipeline.Transform, nil
	}
	if standard || gamma == 0 && len(chromaticity) == 0 {
		return nil, nil
	}
	// PNG chromaticities define RGB columns relative to their declared white.
	xy := []float64{.3127, .329, .64, .33, .30, .60, .15, .06}
	if len(chromaticity) > 0 {
		for i := range xy {
			xy[i] = float64(binary.BigEndian.Uint32(chromaticity[i*4:i*4+4])) / 100000
		}
	}
	xyz := func(x, y float64) ([3]float64, error) {
		if x < 0 || y <= 0 || x+y > 1.00001 {
			return [3]float64{}, colorMetadataError()
		}
		return [3]float64{x / y, 1, (1 - x - y) / y}, nil
	}
	white, err := xyz(xy[0], xy[1])
	if err != nil {
		return nil, err
	}
	matrix := icc.Matrix3{}
	for col := 0; col < 3; col++ {
		v, err := xyz(xy[2+col*2], xy[3+col*2])
		if err != nil {
			return nil, err
		}
		for row := 0; row < 3; row++ {
			matrix[row][col] = v[row]
		}
	}
	inverse, err := matrix.Inverted()
	if err != nil {
		return nil, colorMetadataError()
	}
	r, g, b := inverse.Transform(white[0], white[1], white[2])
	scale := []float64{r, g, b}
	for col := 0; col < 3; col++ {
		if scale[col] <= 0 {
			return nil, colorMetadataError()
		}
		for row := 0; row < 3; row++ {
			matrix[row][col] *= scale[col]
		}
	}
	convert := icc.NewXYZtosRGB(icc.XYZType{X: white[0], Y: white[1], Z: white[2]}, true, false)
	linear := func(v float64) float64 {
		if gamma > 0 {
			return math.Pow(v, 1/gamma)
		}
		if v <= .04045 {
			return v / 12.92
		}
		return math.Pow((v+.055)/1.055, 2.4)
	}
	return func(r, g, b float64) (float64, float64, float64) {
		x, y, z := matrix.Transform(linear(r), linear(g), linear(b))
		return convert.Transform(x, y, z)
	}, nil
}

// GRAY profiles use their mandatory kTRC to map neutral device values to PCS
// luminance. Relative colorimetry maps their neutral white to neutral sRGB.
func compositionGrayICC(profile []byte) (func(float64, float64, float64) (float64, float64, float64), error) {
	var body []byte
	count := int(binary.BigEndian.Uint32(profile[128:132]))
	for i := 0; i < count; i++ {
		entry := profile[132+i*12 : 144+i*12]
		if string(entry[:4]) == "kTRC" {
			if body != nil {
				return nil, colorMetadataError()
			}
			start, size := int(binary.BigEndian.Uint32(entry[4:8])), int(binary.BigEndian.Uint32(entry[8:12]))
			body = profile[start : start+size]
		}
	}
	if len(body) < 12 || string(profile[20:24]) != "XYZ " {
		return nil, colorMetadataError()
	}
	var curve func(float64) float64
	switch string(body[:4]) {
	case "curv":
		n := int(binary.BigEndian.Uint32(body[8:12]))
		if n > (len(body)-12)/2 {
			return nil, colorMetadataError()
		}
		switch n {
		case 0:
			curve = func(v float64) float64 { return v }
		case 1:
			g := float64(binary.BigEndian.Uint16(body[12:14])) / 256
			if g <= 0 {
				return nil, colorMetadataError()
			}
			curve = func(v float64) float64 { return math.Pow(v, g) }
		default:
			curve = func(v float64) float64 {
				position := v * float64(n-1)
				a := min(n-1, int(position))
				b := min(n-1, a+1)
				left := float64(binary.BigEndian.Uint16(body[12+a*2 : 14+a*2]))
				right := float64(binary.BigEndian.Uint16(body[12+b*2 : 14+b*2]))
				return (left + (right-left)*(position-float64(a))) / 65535
			}
		}
	case "para":
		kind := int(binary.BigEndian.Uint16(body[8:10]))
		counts := []int{1, 3, 4, 5, 7}
		if kind >= len(counts) || len(body) < 12+counts[kind]*4 {
			return nil, colorMetadataError()
		}
		p := make([]float64, counts[kind])
		for i := range p {
			p[i] = float64(int32(binary.BigEndian.Uint32(body[12+i*4:16+i*4]))) / 65536
		}
		if p[0] <= 0 || kind > 0 && p[1] <= 0 {
			return nil, colorMetadataError()
		}
		curve = func(v float64) float64 {
			switch kind {
			case 0:
				return math.Pow(v, p[0])
			case 1:
				if v < -p[2]/p[1] {
					return 0
				}
				return math.Pow(p[1]*v+p[2], p[0])
			case 2:
				if v < -p[2]/p[1] {
					return p[3]
				}
				return math.Pow(p[1]*v+p[2], p[0]) + p[3]
			case 3:
				if v < p[4] {
					return p[3] * v
				}
				return math.Pow(p[1]*v+p[2], p[0])
			default:
				if v < p[4] {
					return p[3]*v + p[6]
				}
				return math.Pow(p[1]*v+p[2], p[0]) + p[5]
			}
		}
	default:
		return nil, colorMetadataError()
	}
	return func(r, g, b float64) (float64, float64, float64) {
		v := curve(r)
		if v <= .0031308 {
			v *= 12.92
		} else {
			v = 1.055*math.Pow(v, 1/2.4) - .055
		}
		return v, v, v
	}, nil
}
