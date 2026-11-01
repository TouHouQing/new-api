package imageops

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"os"
	"strings"
	"testing"
)

func TestBackgroundPatchKeepsOutsidePixelsProfileAndConvertsOnlyInside(t *testing.T) {
	profile, err := os.ReadFile("testdata/p3-primaries-gamma22.icc")
	if err != nil {
		t.Fatal(err)
	}
	metadata, err := profileMetadata(profile, false)
	if err != nil {
		t.Fatal(err)
	}
	original := image.NewNRGBA64(image.Rect(0, 0, 6, 6))
	generated := image.NewNRGBA64(original.Bounds())
	for y := 0; y < 6; y++ {
		for x := 0; x < 6; x++ {
			original.SetNRGBA64(x, y, color.NRGBA64{R: uint16(1000 + x*67), G: uint16(2000 + y*47), B: 54321, A: 65535})
			generated.SetNRGBA64(x, y, color.NRGBA64{R: 116 * 257, G: 142 * 257, B: 56 * 257, A: 65535})
		}
	}
	patch := BackgroundPatch{Width: 6, Height: 6, GeneratedResourceID: "generated", GeneratedSHA256: strings.Repeat("a", 64), Regions: []Region{{Width: 6, Height: 6, BBox: []float64{167, 167, 833, 833}, Shape: "rect"}}}
	data, err := RenderBackgroundPatchPNG(context.Background(), &colorManagedRaster{Image: original, metadata: metadata}, generated, patch)
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
			pixel := unassociated64(decoded.At(x, y))
			if x == 0 || y == 0 || x == 5 || y == 5 {
				if pixel != original.NRGBA64At(x, y) {
					t.Fatal("outside source pixels changed", x, y, pixel)
				}
			} else {
				// Pillow12/LittleCMS independently measured sRGB(116,142,56)
				// -> relative-colorimetric P3 gamma2.2 (120,140,70). 2/255 tolerance.
				for i, value := range []uint16{pixel.R, pixel.G, pixel.B} {
					want := []int{120 * 257, 140 * 257, 70 * 257}[i]
					if int(value) < want-514 || int(value) > want+514 {
						t.Fatal("wrong source-profile patch conversion", pixel)
					}
				}
			}
		}
	}
	if !bytes.Equal(rasterColorMetadata(decoded).chunks[0].body, metadata.chunks[0].body) {
		t.Fatal("source ICC changed")
	}
	if original.NRGBA64At(2, 2).R != 1134 {
		t.Fatal("source was mutated")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := RenderBackgroundPatchPNG(ctx, original, generated, patch); err == nil {
		t.Fatal("ignored cancellation")
	}
	generated.SetNRGBA64(0, 0, color.NRGBA64{A: 1})
	if _, err := RenderBackgroundPatchPNG(context.Background(), original, generated, patch); err == nil {
		t.Fatal("transparent replacement accepted as complete background")
	}
}

func TestBackgroundPatchCurvesUseUnionAndRejectMixedRecipes(t *testing.T) {
	radius := .5
	r := Region{Width: 6, Height: 6, BBox: []float64{0, 0, 667, 667}, Shape: "rounded-rect", RadiusRatio: &radius}
	patch := BackgroundPatch{Width: 6, Height: 6, GeneratedResourceID: "generated", GeneratedSHA256: strings.Repeat("a", 64), Regions: []Region{r, r}}
	boxes, err := validateBackgroundPatch(6, 6, patch)
	if err != nil {
		t.Fatal(err)
	}
	if got := patchCoverage(0, 0, boxes, patch.Regions); got != .375 {
		t.Fatal("overlap double-counted curved coverage", got)
	}
	if _, err := Plan(6, 6, Recipe{Operation: "background-patch", Patch: &patch, Normalize: &Normalize{Width: 6, Height: 6, Algorithm: "high"}}); err == nil {
		t.Fatal("mixed recipe accepted")
	}
}
