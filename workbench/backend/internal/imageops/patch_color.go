package imageops

import (
	"bytes"
	"compress/zlib"
	"errors"
	"github.com/kovidgoyal/imaging/prism/meta/icc"
	"image"
	"io"
	"math"
	"reflect"
)

func rasterColorMetadata(source image.Image) colorMetadata {
	if managed, ok := source.(*colorManagedRaster); ok {
		return managed.metadata
	}
	return colorMetadata{}
}

func patchColorTransform(target, source colorMetadata) (transform func(float64, float64, float64) (float64, float64, float64), err error) {
	if reflect.DeepEqual(target, source) {
		return nil, nil
	}
	defer func() {
		if recover() != nil {
			transform = nil
			err = colorMetadataError()
		}
	}()
	toSRGB, err := compositionColorTransform(source)
	if err != nil {
		return nil, err
	}
	targetToSRGB, err := compositionColorTransform(target)
	if err != nil {
		return nil, err
	}
	if targetToSRGB == nil && !target.gray {
		return toSRGB, nil
	}
	if target.gray {
		return func(r, g, b float64) (float64, float64, float64) {
			if toSRGB != nil {
				r, g, b = toSRGB(r, g, b)
			}
			linear := func(v float64) float64 {
				if v <= .04045 {
					return v / 12.92
				}
				return math.Pow((v+.055)/1.055, 2.4)
			}
			y := .2126*linear(r) + .7152*linear(g) + .0722*linear(b)
			neutral := 12.92 * y
			if y > .0031308 {
				neutral = 1.055*math.Pow(y, 1/2.4) - .055
			}
			lo, hi := 0.0, 1.0
			for i := 0; i < 20; i++ {
				mid := (lo + hi) / 2
				value := mid
				if targetToSRGB != nil {
					value, _, _ = targetToSRGB(mid, mid, mid)
				}
				if value < neutral {
					lo = mid
				} else {
					hi = mid
				}
			}
			v := (lo + hi) / 2
			return v, v, v
		}, nil
	}
	var profile []byte
	for _, chunk := range target.chunks {
		if chunk.kind != "iCCP" {
			continue
		}
		reader, err := zlib.NewReader(bytes.NewReader(chunk.body[bytes.IndexByte(chunk.body, 0)+2:]))
		if err != nil {
			return nil, err
		}
		profile, err = io.ReadAll(io.LimitReader(reader, maxColorProfileBytes+1))
		closeErr := reader.Close()
		if err != nil || closeErr != nil || len(profile) > maxColorProfileBytes {
			return nil, colorMetadataError()
		}
	}
	if len(profile) == 0 {
		return nil, errors.New("底图使用自定义PNG色度或Gamma，请先明确转换为sRGB后再局部修补；原文件未改变")
	}
	parsed, err := icc.DecodeProfile(bytes.NewReader(profile))
	if err != nil {
		return nil, err
	}
	toDevice, err := parsed.CreateTransformerToDevice(icc.RelativeColorimetricRenderingIntent, false, true)
	if err != nil || !toDevice.IsSuitableFor(3, 3) {
		return nil, colorMetadataError()
	}
	standard, err := icc.DecodeProfile(bytes.NewReader(icc.Srgb_xyz_profile_data))
	if err != nil {
		return nil, err
	}
	toPCS, err := standard.CreateTransformerToPCS(icc.RelativeColorimetricRenderingIntent, 3, true)
	if err != nil {
		return nil, err
	}
	if parsed.Header.ProfileConnectionSpace != icc.ColorSpaceXYZ {
		return nil, errors.New("此ICC底图的局部修补暂需先转换为RGB XYZ配置或sRGB；原文件未改变")
	}
	return func(r, g, b float64) (float64, float64, float64) {
		if toSRGB != nil {
			r, g, b = toSRGB(r, g, b)
		}
		x, y, z := toPCS.Transform(r, g, b)
		return toDevice.Transform(x, y, z)
	}, nil
}
