package imageops

import (
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"math"
	"testing"
)

func TestMaskKeepsOriginal16BitSamplesProfileAndIndependentAlpha(t *testing.T) {
	for _, gray := range []bool{false, true} {
		picture := image.NewNRGBA64(image.Rect(0, 0, 9, 7))
		for y := 0; y < 7; y++ {
			for x := 0; x < 9; x++ {
				r := uint16(701 + x*419 + y*111)
				g, b := r, r
				if !gray {
					g, b = 23456, 45678
				}
				picture.SetNRGBA64(x, y, color.NRGBA64{R: r, G: g, B: b, A: uint16(1024 + x*4000)})
			}
		}
		data := pngWithProfile(t, picture, gray)
		identity, err := Inspect(data)
		if err != nil {
			t.Fatal(err)
		}
		source, err := Decode(context.Background(), data, identity)
		if err != nil {
			t.Fatal(err)
		}
		mask := Mask{Width: 9, Height: 7, Mode: "keep", Strokes: []MaskStroke{{Diameter: 3, Points: [][]float64{{4.5, 3.5}}}}}
		var keep, remove image.Image
		for _, mode := range []string{"keep", "remove"} {
			mask.Mode = mode
			raw, err := RenderMaskPNG(context.Background(), source, mask)
			if err != nil {
				t.Fatal(err)
			}
			if !bytes.Equal(readICC(t, raw), fixtureProfile(t, gray)) {
				t.Fatal("mask lost original ICC")
			}
			decoded, err := png.Decode(bytes.NewReader(raw))
			if err != nil {
				t.Fatal(err)
			}
			if mode == "keep" {
				keep = decoded
			} else {
				remove = decoded
			}
			for y := 0; y < 7; y++ {
				for x := 0; x < 9; x++ {
					want := unassociated64(picture.At(x, y))
					got := unassociated64(decoded.At(x, y))
					if got.R != want.R || got.G != want.G || got.B != want.B {
						t.Fatalf("mask changed unassociated source samples at %d,%d: %v != %v", x, y, got, want)
					}
				}
			}
		}
		for y := 0; y < 7; y++ {
			for x := 0; x < 9; x++ {
				a := int(unassociated64(keep.At(x, y)).A) + int(unassociated64(remove.At(x, y)).A)
				want := int(unassociated64(picture.At(x, y)).A)
				if math.Abs(float64(a-want)) > 1 {
					t.Fatal("keep/remove alpha is not complementary")
				}
			}
		}
		if unassociated64(keep.At(4, 3)).A != unassociated64(picture.At(4, 3)).A || unassociated64(keep.At(0, 0)).A != 0 {
			t.Fatal("mask shifted original coordinates")
		}
	}
}

func TestMaskOrderedEraseAntialiasCancelAndDocumentValidation(t *testing.T) {
	source := image.NewNRGBA64(image.Rect(0, 0, 12, 8))
	for y := 0; y < 8; y++ {
		for x := 0; x < 12; x++ {
			source.SetNRGBA64(x, y, color.NRGBA64{R: 12345, G: 23456, B: 34567, A: 65535})
		}
	}
	mask := Mask{Width: 12, Height: 8, Mode: "keep", Strokes: []MaskStroke{{Diameter: 5, Points: [][]float64{{3.5, 4.5}, {8.5, 4.5}}}, {Diameter: 1, Erase: true, Points: [][]float64{{6.5, 4.5}}}}}
	raw, err := RenderMaskPNG(context.Background(), source, mask)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := png.Decode(bytes.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	if unassociated64(decoded.At(6, 4)).A != 0 || unassociated64(decoded.At(4, 4)).A != 65535 {
		t.Fatal("ordered erase or capsule coverage failed")
	}
	mask.Strokes = []MaskStroke{{Diameter: 1, Points: [][]float64{{4.75, 4.5}}}}
	raw, err = RenderMaskPNG(context.Background(), source, mask)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err = png.Decode(bytes.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	if alpha := unassociated64(decoded.At(4, 4)).A; alpha < 49000 || alpha > 49300 {
		t.Fatalf("subpixel coverage lost: %d", alpha)
	}
	for _, body := range []string{
		`{"width":11,"height":8,"mode":"keep","strokes":[{"diameter":2,"points":[[1,2]]}]}`,
		`{"width":12,"height":8,"mode":"keep","strokes":[{"diameter":2,"points":[[1,2,3]]}]}`,
		`{"width":12,"height":8,"mode":"keep","strokes":[{"diameter":2,"points":[[1]]}]}`,
		`{"width":12,"height":8,"mode":"guess","strokes":[{"diameter":2,"points":[[1,2]]}]}`,
	} {
		var invalid Mask
		if err := json.Unmarshal([]byte(body), &invalid); err != nil {
			t.Fatal(err)
		}
		if err := ValidateMask(12, 8, invalid); err == nil {
			t.Fatal("invalid mask accepted")
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := RenderMaskPNG(ctx, source, mask); err != context.Canceled {
		t.Fatal("cancel ignored")
	}
	mask.Strokes = []MaskStroke{{Diameter: 2, Points: [][]float64{{100, 100}}}}
	if _, err := RenderMaskPNG(context.Background(), source, mask); err == nil {
		t.Fatal("empty off-image selection accepted")
	}
	mask.Strokes = []MaskStroke{{Diameter: 4096, Points: [][]float64{{0, 0}, {4096, 4096}, {0, 4096}, {4096, 0}, {0, 0}, {4096, 4096}, {0, 4096}, {4096, 0}, {0, 0}, {4096, 4096}}}}
	mask.Width, mask.Height = 4096, 4096
	if err := ValidateMask(4096, 4096, mask); err == nil {
		t.Fatal("unbounded mask work accepted")
	}
}
