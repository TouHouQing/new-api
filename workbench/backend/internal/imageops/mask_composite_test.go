package imageops

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"os"
	"testing"
)

func TestMaskedCompositeKeepsExactOutsideSamplesAlphaAndSourceProfile(t *testing.T) {
	profile, err := os.ReadFile("testdata/p3-primaries-gamma22.icc")
	if err != nil {
		t.Fatal(err)
	}
	metadata, err := profileMetadata(profile, false)
	if err != nil {
		t.Fatal(err)
	}
	original := image.NewNRGBA64(image.Rect(10, 20, 16, 26))
	generated := image.NewNRGBA64(image.Rect(-2, -3, 4, 3))
	for y := 0; y < 6; y++ {
		for x := 0; x < 6; x++ {
			original.SetNRGBA64(10+x, 20+y, color.NRGBA64{R: uint16(1001 + x*67), G: uint16(2003 + y*47), B: 54321, A: uint16(1000 + x*100 + y*200)})
			generated.SetNRGBA64(-2+x, -3+y, color.NRGBA64{R: 116 * 257, G: 142 * 257, B: 56 * 257, A: 32768})
		}
	}
	mask := Mask{Width: 6, Height: 6, Mode: "keep", Strokes: []MaskStroke{{Diameter: 2, Points: [][]float64{{2.5, 2.5}}}}}
	data, err := RenderMaskedCompositePNG(context.Background(), &colorManagedRaster{Image: original, metadata: metadata}, generated, mask)
	if err != nil {
		t.Fatal(err)
	}
	identity, err := Inspect(data)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := Decode(context.Background(), data, identity)
	if err != nil {
		t.Fatal(err)
	}
	for y := 0; y < 6; y++ {
		for x := 0; x < 6; x++ {
			if x == 0 || y == 0 || x == 5 || y == 5 {
				if got := unassociated64(decoded.At(x, y)); got != original.NRGBA64At(10+x, 20+y) {
					t.Fatal("unpainted pixels/alpha changed", x, y, got)
				}
			}
		}
	}
	center := unassociated64(decoded.At(2, 2))
	if center.A != 32768 {
		t.Fatal("candidate alpha was discarded", center)
	}
	for index, value := range []uint16{center.R, center.G, center.B} {
		want := []int{120 * 257, 140 * 257, 70 * 257}[index]
		if int(value) < want-514 || int(value) > want+514 {
			t.Fatal("candidate was not converted into original profile", center)
		}
	}
	if !bytes.Equal(rasterColorMetadata(decoded).chunks[0].body, metadata.chunks[0].body) || original.NRGBA64At(12, 22).R != 1135 {
		t.Fatal("source file profile or source raster mutated")
	}
}

func TestMaskedCompositeHonorsErasedSelectionAndFractionalAlpha(t *testing.T) {
	original := image.NewNRGBA64(image.Rect(0, 0, 6, 6))
	generated := image.NewNRGBA64(original.Bounds())
	for y := 0; y < 6; y++ {
		for x := 0; x < 6; x++ {
			original.SetNRGBA64(x, y, color.NRGBA64{R: 6000, G: 12000, B: 18000, A: 32768})
			generated.SetNRGBA64(x, y, color.NRGBA64{R: 60000, G: 48000, B: 36000, A: 65535})
		}
	}
	mask := Mask{Width: 6, Height: 6, Mode: "keep", Strokes: []MaskStroke{{Diameter: 4, Points: [][]float64{{2.5, 2.5}}}, {Diameter: 1, Erase: true, Points: [][]float64{{2.5, 2.5}}}}}
	data, err := RenderMaskedCompositePNG(context.Background(), original, generated, mask)
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
	if unassociated64(result.At(2, 2)) != original.NRGBA64At(2, 2) {
		t.Fatal("erased center was modified")
	}
	mask.Strokes = []MaskStroke{{Diameter: 1, Points: [][]float64{{3, 2.5}}}}
	data, err = RenderMaskedCompositePNG(context.Background(), original, generated, mask)
	if err != nil {
		t.Fatal(err)
	}
	identity, err = Inspect(data)
	if err != nil {
		t.Fatal(err)
	}
	result, err = Decode(context.Background(), data, identity)
	if err != nil {
		t.Fatal(err)
	}
	pixel := unassociated64(result.At(2, 2))
	if pixel.A != 49152 || pixel.R < 41999 || pixel.R > 42001 {
		t.Fatal("fractional brush edge blended unassociated colors without alpha", pixel)
	}
}

func TestMaskedCompositeRejectsWrongFrameEmptySelectionAndCancellation(t *testing.T) {
	source := image.NewNRGBA64(image.Rect(0, 0, 6, 6))
	candidate := image.NewNRGBA64(source.Bounds())
	mask := Mask{Width: 6, Height: 6, Mode: "keep", Strokes: []MaskStroke{{Diameter: 2, Points: [][]float64{{2.5, 2.5}}}}}
	if _, err := RenderMaskedCompositePNG(context.Background(), source, image.NewNRGBA64(image.Rect(0, 0, 5, 6)), mask); err == nil {
		t.Fatal("wrong candidate frame accepted")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := RenderMaskedCompositePNG(ctx, source, candidate, mask); err == nil {
		t.Fatal("cancellation ignored")
	}
	mask.Mode = "remove"
	if _, err := RenderMaskedCompositePNG(context.Background(), source, candidate, mask); err == nil {
		t.Fatal("ambiguous inverse selection accepted")
	}
	mask.Mode = "keep"
	mask.Strokes = append(mask.Strokes, MaskStroke{Diameter: 4, Erase: true, Points: [][]float64{{2.5, 2.5}}})
	if _, err := RenderMaskedCompositePNG(context.Background(), source, candidate, mask); err == nil {
		t.Fatal("empty selection became a false successful edit")
	}
}
