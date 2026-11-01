package imageops

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"math"
	"testing"
)

func TestEmotionCompositePreservesOtherFacesAndOriginalColorPrecision(t *testing.T) {
	original := image.NewNRGBA64(image.Rect(10, 20, 90, 80))
	candidate := image.NewNRGBA64(image.Rect(-3, -4, 37, 36))
	for y := 0; y < 60; y++ {
		for x := 0; x < 80; x++ {
			original.SetNRGBA64(10+x, 20+y, color.NRGBA64{R: 10000, G: 20000, B: 30000, A: 65535})
		}
	}
	original.SetNRGBA64(12, 22, color.NRGBA64{R: 65501, G: 123, B: 1097, A: 17})
	for y := -4; y < 36; y++ {
		for x := -3; x < 37; x++ {
			candidate.SetNRGBA64(x, y, color.NRGBA64{R: 50000, G: 40000, B: 30000, A: 65535})
		}
	}
	edit := Emotion{Region: PixelCrop{X: 20, Y: 10, Width: 40, Height: 40}, FaceBox: Crop{X: 30, Y: 20, Width: 20, Height: 20}}
	data, err := RenderEmotionCompositePNG(context.Background(), original, candidate, edit)
	if err != nil {
		t.Fatal(err)
	}
	identity, err := Inspect(data)
	if err != nil {
		t.Fatal(err)
	}
	result, err := Decode(context.Background(), data, identity)
	if err != nil {
		t.Fatal(err)
	}
	for y := 0; y < 60; y++ {
		for x := 0; x < 80; x++ {
			if emotionDistance(x, y, edit) >= 1 || x < 20 || x >= 60 || y < 10 || y >= 50 {
				if got := unassociated64(result.At(x, y)); got != original.NRGBA64At(10+x, 20+y) {
					t.Fatal("an unrelated face/background/transparent sample changed", x, y, got)
				}
			}
		}
	}
	// Constant opaque feather samples yield the bounded .78 red/green gain;
	// correction at the center is 42%, independent of crop placement.
	if got := unassociated64(result.At(40, 30)); got != (color.NRGBA64{R: 45380, G: 36304, B: 30000, A: 65535}) {
		t.Fatal("face center or edge color correction is wrong", got)
	}
}

func TestEmotionCompositeRetainsProfileAndUsesPremultipliedFeatherAlpha(t *testing.T) {
	original := image.NewNRGBA64(image.Rect(0, 0, 20, 20))
	candidate := image.NewNRGBA64(image.Rect(0, 0, 20, 20))
	for y := 0; y < 20; y++ {
		for x := 0; x < 20; x++ {
			original.SetNRGBA64(x, y, color.NRGBA64{R: 1001, G: 34567, B: 65432, A: 20000})
			candidate.SetNRGBA64(x, y, color.NRGBA64{R: 50000, G: 10000, B: 20000, A: 40000})
		}
	}
	encoded := pngWithProfile(t, original, false)
	sourceInfo, err := Inspect(encoded)
	if err != nil {
		t.Fatal(err)
	}
	source, err := Decode(context.Background(), encoded, sourceInfo)
	if err != nil {
		t.Fatal(err)
	}
	// Both rasters are in the original profile; no color conversion is needed.
	generated := &colorManagedRaster{Image: candidate, metadata: rasterColorMetadata(source)}
	edit := Emotion{Region: PixelCrop{Width: 20, Height: 20}, FaceBox: Crop{X: 7, Y: 7, Width: 6, Height: 6}}
	data, err := RenderEmotionCompositePNG(context.Background(), source, generated, edit)
	if err != nil {
		t.Fatal(err)
	}
	info, err := Inspect(data)
	if err != nil {
		t.Fatal(err)
	}
	result, err := Decode(context.Background(), data, info)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(rasterColorMetadata(result).chunks[0].body, rasterColorMetadata(source).chunks[0].body) || unassociated64(result.At(0, 0)) != original.NRGBA64At(0, 0) || unassociated64(result.At(10, 10)) != candidate.NRGBA64At(10, 10) {
		t.Fatal("original profile/outside samples or generated alpha changed")
	}
	coverage := emotionFeather(emotionDistance(13, 9, edit))
	alpha := 20000*(1-coverage) + 40000*coverage
	wantRed := (1001*20000*(1-coverage) + 50000*40000*coverage) / alpha
	got := unassociated64(result.At(13, 9))
	if coverage <= 0 || coverage >= 1 || got.A != uint16(math.Round(alpha)) || got.R != uint16(math.Round(wantRed)) {
		t.Fatal("semi-transparent feather was blended without premultiplication", got, coverage)
	}
}

func TestEmotionCompositeRejectsInvalidGeometryWrongCropAndCancellation(t *testing.T) {
	source := image.NewNRGBA64(image.Rect(0, 0, 20, 20))
	edit := Emotion{Region: PixelCrop{X: 2, Y: 2, Width: 16, Height: 16}, FaceBox: Crop{X: 7, Y: 7, Width: 6, Height: 6}}
	for _, invalid := range []Emotion{{Region: PixelCrop{X: -1, Width: 16, Height: 16}, FaceBox: edit.FaceBox}, {Region: edit.Region, FaceBox: Crop{X: 0, Y: 7, Width: 6, Height: 6}}, {Region: edit.Region, FaceBox: Crop{X: math.NaN(), Y: 7, Width: 6, Height: 6}}} {
		if ValidateEmotion(20, 20, invalid) == nil {
			t.Fatal("invalid geometry was admitted", invalid)
		}
	}
	if _, err := RenderEmotionCompositePNG(context.Background(), source, source, edit); err == nil {
		t.Fatal("full-frame model result was used as a crop")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := RenderEmotionCompositePNG(ctx, source, image.NewNRGBA64(image.Rect(0, 0, 16, 16)), edit); err == nil {
		t.Fatal("cancelled operation continued")
	}
}
