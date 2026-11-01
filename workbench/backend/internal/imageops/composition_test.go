package imageops

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/png"
	"math"
	"os"
	"testing"
)

func compositionNumber(value float64) *float64 { return &value }
func compositionBool(value bool) *bool         { return &value }
func compositionFixture(width, height int, value color.NRGBA64) *image.NRGBA64 {
	result := image.NewNRGBA64(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			result.SetNRGBA64(x, y, value)
		}
	}
	return result
}
func decodeCompositionTest(t *testing.T, composition Composition, pictures []image.Image) image.Image {
	t.Helper()
	raw, err := RenderCompositionPNG(context.Background(), composition, func(i int) (image.Image, error) { return pictures[i], nil })
	if err != nil {
		t.Fatal(err)
	}
	metadata, err := pngColorMetadata(raw)
	if err != nil {
		t.Fatal(err)
	}
	srgb := false
	for _, chunk := range metadata.chunks {
		if chunk.kind == "sRGB" {
			srgb = true
		}
	}
	if !srgb {
		t.Fatal("composition lacks declared output sRGB")
	}
	if raw[24] != 16 {
		t.Fatal("composition lost 16-bit output")
	}
	picture, err := png.Decode(bytes.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	return picture
}

func TestCompositionOrderOpacityOriginalCoordinatesAndHiddenSource(t *testing.T) {
	base := compositionFixture(5, 4, color.NRGBA64{R: 10000, G: 20000, B: 30000, A: 65535})
	top := compositionFixture(2, 2, color.NRGBA64{R: 50000, G: 40000, B: 10000, A: 65535})
	composition := Composition{Width: 5, Height: 4, Layers: []CompositionLayer{{ID: "base", ResourceID: "base"}, {ID: "top", ResourceID: "top", X: 2, Y: 1, Opacity: compositionNumber(.25)}, {ID: "hidden", ResourceID: "hidden", Visible: compositionBool(false)}}}
	reads := []int{}
	raw, err := RenderCompositionPNG(context.Background(), composition, func(i int) (image.Image, error) {
		reads = append(reads, i)
		if i == 0 {
			return base, nil
		}
		if i == 1 {
			return top, nil
		}
		return nil, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(reads) != 3 {
		t.Fatal("hidden source identity was not checked")
	}
	picture, err := png.Decode(bytes.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	if got := unassociated64(picture.At(2, 1)); got != (color.NRGBA64{R: 20000, G: 25000, B: 25000, A: 65535}) {
		t.Fatal("layer opacity/coordinate/order mismatch", got)
	}
	if unassociated64(picture.At(1, 1)) != base.NRGBA64At(1, 1) || unassociated64(picture.At(4, 3)) != base.NRGBA64At(4, 3) {
		t.Fatal("composition touched pixels outside the layer")
	}
	composition.Layers[0], composition.Layers[1] = composition.Layers[1], composition.Layers[0]
	reversed := decodeCompositionTest(t, composition, []image.Image{top, base, nil})
	if unassociated64(reversed.At(2, 1)) != base.NRGBA64At(2, 1) {
		t.Fatal("reordering did not change source-over")
	}
}

func TestCompositionRetainsAlmostTransparent16BitColorAndSupportsEmptyView(t *testing.T) {
	picture := compositionFixture(3, 2, color.NRGBA64{R: 12345, G: 23456, B: 34567, A: 1})
	composition := Composition{Width: 3, Height: 2, Layers: []CompositionLayer{{ID: "fine", ResourceID: "fine"}}}
	output := decodeCompositionTest(t, composition, []image.Image{picture})
	if got := unassociated64(output.At(0, 0)); got != picture.NRGBA64At(0, 0) {
		t.Fatal("early alpha premultiplication rounded source color", got)
	}
	composition.Layers[0].Visible = compositionBool(false)
	output = decodeCompositionTest(t, composition, []image.Image{nil})
	if unassociated64(output.At(0, 0)).A != 0 {
		t.Fatal("all-hidden view is not transparent")
	}
	composition.Layers[0].Visible = nil
	composition.Layers[0].X = .5
	output = decodeCompositionTest(t, composition, []image.Image{compositionFixture(1, 1, color.NRGBA64{R: 50000, G: 10000, B: 20000, A: 65535})})
	if unassociated64(output.At(0, 0)).A == 0 || unassociated64(output.At(1, 0)).A == 0 {
		t.Fatal("fractional original-pixel position was rounded away")
	}
}

func TestCompositionProfileConversionValidationAndCancellation(t *testing.T) {
	composition := Composition{Width: 2, Height: 2, Layers: []CompositionLayer{{ID: "p3", ResourceID: "p3"}}}
	frame := composition
	frame.Width, frame.Height = 7, 5
	pieces, err := Plan(2, 2, Recipe{Operation: "compose", Compose: &frame})
	if err != nil || len(pieces) != 1 || pieces[0].Width != 2 || pieces[0].Height != 2 || pieces[0].OutputWidth != 7 || pieces[0].OutputHeight != 5 {
		t.Fatal("independent output frame lost original anchor geometry", err)
	}
	picture := compositionFixture(2, 2, color.NRGBA64{R: 120 * 257, G: 140 * 257, B: 70 * 257, A: 65535})
	profile, err := os.ReadFile("testdata/p3-primaries-gamma22.icc")
	if err != nil {
		t.Fatal(err)
	}
	metadata, err := profileMetadata(profile, false)
	if err != nil {
		t.Fatal(err)
	}
	var encoded bytes.Buffer
	if err := encodePrecisionPNG(context.Background(), &encoded, picture, false); err != nil {
		t.Fatal(err)
	}
	data, err := appendColorMetadata(encoded.Bytes(), metadata)
	if err != nil {
		t.Fatal(err)
	}
	identity, err := Inspect(data)
	if err != nil {
		t.Fatal(err)
	}
	managed, err := Decode(context.Background(), data, identity)
	if err != nil {
		t.Fatal(err)
	}
	expected, err := CompositionSRGB(context.Background(), managed)
	if err != nil {
		t.Fatal(err)
	}
	output := decodeCompositionTest(t, composition, []image.Image{managed})
	got, want := unassociated64(output.At(0, 0)), unassociated64(expected.At(0, 0))
	if got != want {
		t.Fatal("composition did not use actual source color transform", got, want)
	}
	for index, value := range []uint16{got.R, got.G, got.B} {
		if math.Abs(float64(int(value)-[]int{116 * 257, 142 * 257, 56 * 257}[index])) > 514 {
			t.Fatal("composition P3 output differs from independent LittleCMS reference", got)
		}
	}
	for _, invalid := range []Composition{{Width: 3, Height: 2, Layers: composition.Layers}, {Width: 2, Height: 2, Layers: []CompositionLayer{{ID: "x", ResourceID: "x"}, {ID: "x", ResourceID: "y"}}}, {Width: 2, Height: 2, Layers: []CompositionLayer{{ID: "x", ResourceID: "x", Opacity: compositionNumber(1.1)}}}, {Width: 2, Height: 2, Layers: []CompositionLayer{{ID: "x", ResourceID: "x", X: math.Inf(1)}}}} {
		if err := ValidateComposition(2, 2, invalid); err == nil {
			t.Fatal("invalid composition accepted")
		}
	}
	if _, err := Plan(2, 2, Recipe{Operation: "mask", Mask: &Mask{}, Compose: &composition}); err == nil {
		t.Fatal("mixed recipes accepted")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	called := false
	if _, err := RenderCompositionPNG(ctx, composition, func(int) (image.Image, error) { called = true; return nil, nil }); err != context.Canceled || called {
		t.Fatal("cancelled composition loaded/allocated sources")
	}
}
