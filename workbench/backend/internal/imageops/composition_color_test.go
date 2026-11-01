package imageops

import (
	"context"
	"image"
	"image/color"
	"os"
	"testing"
)

func TestCompositionColorMatchesIndependentLittleCMSAndRetainsAlpha(t *testing.T) {
	// Relative-colorimetric reference pixels measured with Pillow 12 / LittleCMS,
	// independent from the production ICC implementation. Error budget: 2/255.
	cases := []struct {
		name     string
		gray     bool
		input    [][3]uint8
		expected [][3]uint8
	}{
		{"p3-primaries-gamma22.icc", false, [][3]uint8{{120, 140, 70}, {200, 80, 120}, {64, 64, 64}}, [][3]uint8{{116, 142, 56}, {218, 67, 121}, {62, 62, 62}}},
		{"gray-gamma22.icc", true, [][3]uint8{{32, 32, 32}, {128, 128, 128}, {220, 220, 220}}, [][3]uint8{{26, 26, 26}, {129, 129, 129}, {221, 221, 221}}},
	}
	for _, item := range cases {
		t.Run(item.name, func(t *testing.T) {
			profile, err := os.ReadFile("testdata/" + item.name)
			if err != nil {
				t.Fatal(err)
			}
			metadata, err := profileMetadata(profile, item.gray)
			if err != nil {
				t.Fatal(err)
			}
			picture := image.NewNRGBA64(image.Rect(0, 0, len(item.input), 1))
			alpha := []uint16{65535, 32768, 1}
			for x, c := range item.input {
				picture.SetNRGBA64(x, 0, color.NRGBA64{R: uint16(c[0]) * 257, G: uint16(c[1]) * 257, B: uint16(c[2]) * 257, A: alpha[x]})
			}
			converted, err := CompositionSRGB(context.Background(), &colorManagedRaster{Image: picture, metadata: metadata})
			if err != nil {
				t.Fatal(err)
			}
			for x, want := range item.expected {
				got := color.NRGBA64Model.Convert(converted.At(x, 0)).(color.NRGBA64)
				if got.A != alpha[x] {
					t.Fatal("alpha changed", got.A, alpha[x])
				}
				actual := []uint16{got.R, got.G, got.B}
				for k := range actual {
					difference := int(actual[k]) - int(want[k])*257
					if difference < -514 || difference > 514 {
						t.Fatalf("pixel%d channel%d got%d want%d", x, k, actual[k], want[k])
					}
				}
			}
			if picture.NRGBA64At(0, 0).R != uint16(item.input[0][0])*257 {
				t.Fatal("source mutated")
			}
		})
	}
}

func TestCompositionPNGGammaAndCancellation(t *testing.T) {
	picture := image.NewNRGBA64(image.Rect(0, 0, 1, 1))
	picture.SetNRGBA64(0, 0, color.NRGBA64{R: 32768, G: 32768, B: 32768, A: 65535})
	metadata := colorMetadata{chunks: []pngColorChunk{{kind: "gAMA", body: []byte{0, 1, 134, 160}}}} // linear gamma 1.0
	result, err := CompositionSRGB(context.Background(), &colorManagedRaster{Image: picture, metadata: metadata})
	if err != nil {
		t.Fatal(err)
	}
	actual := color.NRGBA64Model.Convert(result.At(0, 0)).(color.NRGBA64)
	if actual.R < 48000 || actual.R > 48400 {
		t.Fatal("linear samples were reinterpreted as sRGB", actual)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := CompositionSRGB(ctx, &colorManagedRaster{Image: picture, metadata: metadata}); err == nil {
		t.Fatal("cancelled conversion continued")
	}
}
