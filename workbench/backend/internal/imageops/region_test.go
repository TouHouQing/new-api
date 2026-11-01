package imageops

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/png"
	"math"
	"testing"
)

func TestRegionRetainsOriginalFrameRGB16LowAlphaAndICC(t *testing.T) {
	for _, gray := range []bool{false, true} {
		picture := image.NewNRGBA64(image.Rect(0, 0, 6, 6))
		for y := 0; y < 6; y++ {
			for x := 0; x < 6; x++ {
				r := uint16(1000 + x*1000 + y*61)
				g, b := r, r
				if !gray {
					g, b = 23456, 45678
				}
				a := uint16(50000)
				if x == 1 && y == 1 {
					a = 1
				}
				picture.SetNRGBA64(x, y, color.NRGBA64{R: r, G: g, B: b, A: a})
			}
		}
		raw := pngWithProfile(t, picture, gray)
		identity, err := Inspect(raw)
		if err != nil {
			t.Fatal(err)
		}
		source, err := Decode(context.Background(), raw, identity)
		if err != nil {
			t.Fatal(err)
		}
		region := Region{Width: 6, Height: 6, BBox: []float64{167, 167, 833, 833}, Shape: "rect"}
		pieces, err := Plan(6, 6, Recipe{Operation: "region", Region: &region})
		if err != nil || len(pieces) != 1 || pieces[0].X != 0 || pieces[0].OutputWidth != 6 || pieces[0].OutputHeight != 6 {
			t.Fatal("region moved the source coordinate frame", pieces, err)
		}
		encoded, err := RenderRegionPNG(context.Background(), source, region)
		if err != nil {
			t.Fatal(err)
		}
		decoded, err := png.Decode(bytes.NewReader(encoded))
		if err != nil {
			t.Fatal(err)
		}
		if encoded[24] != 16 || !bytes.Equal(readICC(t, encoded), fixtureProfile(t, gray)) {
			t.Fatal("lost bit depth or original ICC")
		}
		for y := 0; y < 6; y++ {
			for x := 0; x < 6; x++ {
				got, want := unassociated64(decoded.At(x, y)), picture.NRGBA64At(x, y)
				if got.R != want.R || got.G != want.G || got.B != want.B {
					t.Fatal("unassociated RGB changed", x, y, got, want)
				}
				if x < 1 || x >= 5 || y < 1 || y >= 5 {
					want.A = 0
				}
				if got.A != want.A {
					t.Fatal("original alpha or exact rectangular boundary changed", x, y, got.A, want.A)
				}
			}
		}
	}
}

func TestRegionCurvesHaveDeclaredCoverageAndRejectInvalidSource(t *testing.T) {
	picture := image.NewNRGBA64(image.Rect(0, 0, 6, 6))
	for y := 0; y < 6; y++ {
		for x := 0; x < 6; x++ {
			picture.SetNRGBA64(x, y, color.NRGBA64{R: 60000, G: 20000, B: 30000, A: 65535})
		}
	}
	for _, shape := range []string{"ellipse", "rounded-rect"} {
		region := Region{Width: 6, Height: 6, BBox: []float64{0, 0, 667, 667}, Shape: shape}
		radius := 0.5
		if shape == "rounded-rect" {
			region.RadiusRatio = &radius
		}
		raw, err := RenderRegionPNG(context.Background(), picture, region)
		if err != nil {
			t.Fatal(err)
		}
		decoded, err := png.Decode(bytes.NewReader(raw))
		if err != nil {
			t.Fatal(err)
		}
		// A radius-two circle covers six of the sixteen declared subpixel
		// samples in its top-left pixel, and all samples of pixel(1,1).
		if unassociated64(decoded.At(0, 0)).A != 24576 || unassociated64(decoded.At(1, 1)).A != 65535 || unassociated64(decoded.At(4, 4)).A != 0 {
			t.Fatal("unexpected curve coverage", shape)
		}
	}
	for _, region := range []Region{{Width: 5, Height: 6, BBox: []float64{0, 0, 1000, 1000}, Shape: "rect"}, {Width: 6, Height: 6, BBox: []float64{0, 0, math.NaN(), 1000}, Shape: "rect"}, {Width: 6, Height: 6, BBox: []float64{0, 0, 2, 2}, Shape: "rect"}, {Width: 6, Height: 6, BBox: []float64{0, 0, 1000, 1000}, Shape: "rounded-rect"}} {
		if _, err := Plan(6, 6, Recipe{Operation: "region", Region: &region}); err == nil {
			t.Fatal("invalid source region accepted", region)
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	region := Region{Width: 6, Height: 6, BBox: []float64{0, 0, 1000, 1000}, Shape: "rect"}
	if _, err := RenderRegionPNG(ctx, picture, region); err != context.Canceled {
		t.Fatal("cancellation lost", err)
	}
	if _, err := RenderRegionPNG(context.Background(), image.NewNRGBA64(image.Rect(0, 0, 6, 6)), region); err == nil {
		t.Fatal("empty source accepted as useful layer")
	}
}
